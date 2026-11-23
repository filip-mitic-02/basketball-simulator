// Server-driven draft and season verification. Everything that decides a result happens here, against a `store`
// (Postgres in production, in-memory in tests). The client never sees the draft secret, so it cannot predict or
// choose its rolls; and it never reports a result: it sends the decisions it made and the server replays the season.
import { createHmac, randomBytes } from 'node:crypto';
import { loadSim } from './sim.js';
import { computeScore } from './validate.js';

export class ApiError extends Error {
  constructor(status, code, detail) { super(code); this.status = status; this.code = code; this.detail = detail; }
}
const MAX_DRAFTS_PER_HOUR = 20, MAX_ATTEMPTS = 3, MAX_LOG_BYTES = 200000;

export const newSecret = () => randomBytes(32).toString('hex');
// Deterministic, unpredictable stream for roll number k: HMAC-SHA256 keyed with the per-draft secret.
export function rndFor(secret, k) {
  let j = 0;
  return n => Math.floor(createHmac('sha256', secret).update(`roll:${k}:${j++}`).digest().readUInt32BE(0) / 4294967296 * n);
}
export const seasonSeedOf = secret => createHmac('sha256', secret).update('season').digest().readUInt32BE(0);
export const eraLabel = (from, to, sim) => (from === sim.Core.MIN_Y && to === sim.Core.MAX_Y ? 'All-Time' : from + '-' + to);

const poolCache = new Map();
function poolFor(sim, from, to) {
  const k = from + '-' + to;
  if (!poolCache.has(k)) { if (poolCache.size > 40) poolCache.clear(); poolCache.set(k, sim.Core.poolOf(sim.teams, from, to)); }
  return poolCache.get(k);
}
function rebuildPicks(sim, records) {
  const picks = [];
  for (const r of records) {
    const t = sim.byId.get(r.t);
    const np = t && sim.Core.makePick(picks, t, r.i, r.p);
    if (!np) throw new ApiError(500, 'corrupt');
    picks.push(np);
  }
  return picks;
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function load(store, userId, id, sim) {
  if (typeof id !== 'string' || !UUID.test(id)) throw new ApiError(400, 'id');
  const row = await store.getDraft(id, userId);
  if (!row) throw new ApiError(404, 'draft');
  if (row.simVersion !== sim.version) throw new ApiError(409, 'version');
  return row;
}
const rollOf = (row, sim) => {
  const picks = rebuildPicks(sim, row.picks);
  return sim.Core.rollTeam(poolFor(sim, row.eraFrom, row.eraTo), picks, rndFor(row.secret, row.spins));
};
const view = row => ({ round: row.picks.length, skips: row.skips, team: row.curTeam });
const cas = async (store, row, patch) => {
  const next = { spins: row.spins, skips: row.skips, curTeam: row.curTeam, picks: row.picks, seasonSeed: row.seasonSeed, status: row.status, ...patch };
  if (!(await store.updateDraft(row.id, { spins: row.spins, picksLen: row.picks.length, status: row.status }, next))) throw new ApiError(409, 'conflict');
  return { ...row, ...next };
};

export async function opStart(store, userId, b) {
  const sim = loadSim(), C = sim.Core;
  if (!b || typeof b.hard !== 'boolean' || !C.validEra(b.from, b.to)) throw new ApiError(400, 'params');
  if (b.ver !== sim.version) throw new ApiError(409, 'version');
  if (poolFor(sim, b.from, b.to).length < C.MIN_POOL) throw new ApiError(400, 'pool');
  if ((await store.countDraftsSince(userId, 3600)) >= MAX_DRAFTS_PER_HOUR) throw new ApiError(429, 'rate');
  await store.voidOpen(userId);
  const id = await store.insertDraft({ userId, simVersion: sim.version, secret: newSecret(), hard: b.hard, eraFrom: b.from, eraTo: b.to });
  return { id, ver: sim.version };
}
export async function opSpin(store, userId, b, respin) {
  const sim = loadSim(), row = await load(store, userId, b && b.id, sim);
  if (row.status !== 'open') throw new ApiError(409, 'closed');
  if (row.picks.length >= sim.Core.DRAFT_ROUNDS) throw new ApiError(409, 'done');
  if (!respin && row.curTeam) return view(row);                              // asking again never re-rolls
  if (respin) {
    if (!row.curTeam) throw new ApiError(409, 'nothing to re-spin');
    if (row.skips >= sim.Core.MAX_SKIPS) throw new ApiError(409, 'no re-spins left');
  }
  const t = rollOf(row, sim);
  const next = await cas(store, row, { spins: row.spins + 1, skips: row.skips + (respin ? 1 : 0), curTeam: t.id });
  return view(next);
}
export async function opPick(store, userId, b) {
  const sim = loadSim(), C = sim.Core, row = await load(store, userId, b && b.id, sim);
  if (row.status !== 'open' || !row.curTeam) throw new ApiError(409, 'no roll');
  if (!Number.isInteger(b.i) || (b.pos != null && !sim.Engine.POS.includes(b.pos))) throw new ApiError(400, 'params');
  const picks = rebuildPicks(sim, row.picks), t = sim.byId.get(row.curTeam);
  if (!C.makePick(picks, t, b.i, b.pos == null ? null : b.pos)) throw new ApiError(400, 'pick');
  const records = row.picks.concat([{ t: t.id, i: b.i, p: b.pos == null ? null : b.pos }]);
  const done = records.length >= C.DRAFT_ROUNDS;
  const next = await cas(store, row, { picks: records, curTeam: null, ...(done ? { status: 'drafted', seasonSeed: seasonSeedOf(row.secret) } : {}) });
  return done ? { done: true, seed: next.seasonSeed, round: records.length } : { done: false, round: records.length, skips: next.skips };
}
export async function opState(store, userId, b) {
  const sim = loadSim(), row = await load(store, userId, b && b.id, sim);
  return { status: row.status, ...view(row), hard: row.hard, from: row.eraFrom, to: row.eraTo, picks: row.picks.map(r => ({ t: r.t, i: r.i, p: r.p })), seed: row.status === 'drafted' ? row.seasonSeed : null };
}

// The client sends only the decisions it made. The result is whatever the server's own replay produces.
export async function opSubmit(store, userId, b, rate) {
  const sim = loadSim(), C = sim.Core, row = await load(store, userId, b && b.id, sim);
  if (row.status !== 'drafted') throw new ApiError(409, 'not ready');
  if (!b || !Array.isArray(b.log) || JSON.stringify(b.log).length > MAX_LOG_BYTES) throw new ApiError(400, 'log');
  if (rate && (await store.countRunsSince(userId, 86400)) >= 150) throw new ApiError(429, 'rate');
  const picks = rebuildPicks(sim, row.picks);
  let SE;
  try {
    SE = C.replay({ picks, pool: poolFor(sim, row.eraFrom, row.eraTo), seed: row.seasonSeed, hard: row.hard, name: 'My Team' }, b.log);
  } catch (e) {
    if (!(e instanceof C.Invalid)) throw e;
    await store.bumpAttempts(row.id, MAX_ATTEMPTS);
    throw new ApiError(400, 'invalid', e.message);
  }
  const s = C.summarize(SE);
  const clean = x => String(x).replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, 60);
  const rec = {
    wins: s.w, losses: s.l, poWins: s.poW, champion: s.champ, result: s.res, hard: row.hard, eraFrom: row.eraFrom, eraTo: row.eraTo,
    eraLabel: eraLabel(row.eraFrom, row.eraTo, sim), score: computeScore({ wins: s.w, poWins: s.poW, champion: s.champ, hard: row.hard }),
    roster: s.names.map(clean), achievements: s.ach.map(clean), simVersion: sim.version, log: b.log
  };
  const out = await store.insertRun(userId, row.id, rec);
  return { run: out, summary: { w: s.w, l: s.l, poW: s.poW, champ: s.champ, res: s.res, score: rec.score } };
}
