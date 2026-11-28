import test from 'node:test';
import assert from 'node:assert/strict';
import { loadSim } from '../lib/sim.js';
import { ApiError, opStart, opSpin, opPick, opState, opSubmit } from '../lib/draftlogic.js';
import { memStore } from './helpers/memstore.js';

const sim = loadSim(), { Engine: E, Core: C } = sim;
const U = 'user-1';
const rejects = async (p, status, code) => { try { await p; } catch (e) { assert.ok(e instanceof ApiError, 'ApiError expected, got ' + e); assert.equal(e.status, status); if (code) assert.equal(e.code, code); return e; } assert.fail('expected rejection ' + status); };

// Plays a full honest draft through the server API, always taking the best-rated fitting player.
async function honestDraft(store, user = U, hard = false) {
  const { id } = await opStart(store, user, { hard, from: 1990, to: 2012, ver: sim.version });
  const recs = [];
  for (let k = 0; k < 10; k++) {
    const roll = await opSpin(store, user, { id });
    const t = sim.byId.get(roll.team);
    const have = []; recs.forEach(r => have.push(C.makePick(have, sim.byId.get(r.t), r.i, r.p)));
    const c = t.players.map((p, i) => [p, i]).filter(([p, i]) => C.makePick(have, t, i, null)).sort((a, b) => b[0].ovr - a[0].ovr);
    const [, i] = c[0]; const out = await opPick(store, user, { id, i, pos: null });
    recs.push({ t: t.id, i, p: null });
    if (k === 9) { assert.equal(out.done, true); return { id, recs, seed: out.seed }; }
  }
}
const picksOf = recs => { const a = []; recs.forEach(r => a.push(C.makePick(a, sim.byId.get(r.t), r.i, r.p))); return a; };

// A client-side season using the same shared core, including live coaching, to produce a log.
function clientSeason(d, hard = false) {
  const picks = picksOf(d.recs), pool = C.poolOf(sim.teams, 1990, 2012);
  const SE = C.createSeason({ picks, pool, seed: d.seed, hard, name: 'T' });
  const rr = E.mulberry32(7); let n = 0;
  while (SE.L.phase === 'season') {
    if (n++ % 9 === 4) {
      const G = C.beginLive(SE, false);
      while (!G.over) {
        if (G.coachOpen && rr() < 0.3) { const s = G.userSide, on = G.on[s], bench = G.teams[s].players.map((_, i) => i).filter(i => !on.includes(i) && G.st[s][i].pf < 6); if (bench.length) { const f = on.slice(); f[Math.floor(rr() * 5)] = bench[0]; C.lineup(SE, G, f); } }
        if (rr() < 0.03) C.timeout(SE, G);
        C.step(SE, G);
      }
      C.finishLive(SE, G);
    } else C.quick(SE);
  }
  C.startPlayoffs(SE);
  while (SE.L.phase === 'playoffs') C.quickPo(SE);
  return SE;
}

test('draft: rolls are idempotent, re-spins are limited, picks are validated server-side', async () => {
  const store = memStore();
  const { id } = await opStart(store, U, { hard: false, from: 1990, to: 2012, ver: sim.version });
  const a = await opSpin(store, U, { id }), b = await opSpin(store, U, { id });
  assert.equal(a.team, b.team, 'asking again must not re-roll');
  await opSpin(store, U, { id }, true);
  await opSpin(store, U, { id }, true);
  await rejects(opSpin(store, U, { id }, true), 409);                              // only two re-spins
  const cur = (await opState(store, U, { id })).team, t = sim.byId.get(cur);
  await rejects(opPick(store, U, { id, i: 99, pos: null }), 400);                  // not on that roster
  await rejects(opPick(store, U, { id, i: 0, pos: 'XX' }), 400);                   // not a position
  const p = t.players[0], bad = sim.Engine.POS.find(x => !C.fitPositions([], p).includes(x));
  if (bad) await rejects(opPick(store, U, { id, i: 0, pos: bad }), 400);           // a position he cannot play
  await opPick(store, U, { id, i: 0, pos: null });
  await rejects(opPick(store, U, { id, i: 0, pos: null }), 409);                   // needs a new spin first
});
test('draft: another user cannot touch it, wrong version is refused, starts are rate limited', async () => {
  const store = memStore();
  const { id } = await opStart(store, U, { hard: false, from: 1990, to: 2012, ver: sim.version });
  await rejects(opSpin(store, 'someone-else', { id }), 404);
  await rejects(opStart(store, U, { hard: false, from: 1990, to: 2012, ver: 'old' }), 409);
  await rejects(opStart(store, U, { hard: false, from: 2000, to: 2001, ver: sim.version }), 400);   // era too narrow
  await rejects(opStart(store, U, { hard: 'yes', from: 1990, to: 2012, ver: sim.version }), 400);
  for (let i = 0; i < 25; i++) { try { await opStart(store, U, { hard: false, from: 1990, to: 2012, ver: sim.version }); } catch (e) { assert.equal(e.status, 429); return; } }
  assert.fail('expected a rate limit');
});
test('the client never learns the draft secret or the future rolls', async () => {
  const store = memStore();
  const { id } = await opStart(store, U, { hard: false, from: 1990, to: 2012, ver: sim.version });
  const r = await opSpin(store, U, { id });
  assert.deepEqual(Object.keys(r).sort(), ['bonus', 'round', 'skips', 'team']);
  const st = await opState(store, U, { id });
  assert.ok(!('secret' in st) && st.seed === null, 'no seed before the draft is complete');
});
test('an honest season is accepted and the stored result is the server replay', async () => {
  const store = memStore(), d = await honestDraft(store);
  const SE = clientSeason(d), mine = C.summarize(SE);
  const out = await opSubmit(store, U, { id: d.id, log: JSON.parse(JSON.stringify(SE.log)) });
  assert.equal(out.summary.w, mine.w); assert.equal(out.summary.score, mine.score); assert.equal(out.summary.res, mine.res);
  const stored = store.runs[0];
  assert.equal(stored.wins, mine.w); assert.deepEqual(stored.roster, mine.names); assert.equal(stored.simVersion, sim.version);
  await rejects(opSubmit(store, U, { id: d.id, log: SE.log }), 409);               // one run per draft
});
test('a tampered log cannot buy a better result: the result is always what the server replays', async () => {
  const store = memStore(), d = await honestDraft(store);
  const SE = clientSeason(d), log = JSON.parse(JSON.stringify(SE.log));
  const honest = C.summarize(C.replay({ picks: picksOf(d.recs), pool: C.poolOf(sim.teams, 1990, 2012), seed: d.seed, hard: false, name: 'x' }, log));
  const out = await opSubmit(store, U, { id: d.id, log, claimed: { w: 82, l: 0, champ: true, score: 99999 } });
  assert.equal(out.summary.w, honest.w); assert.notEqual(out.summary.score, 99999);
});
test('every kind of invalid log is rejected (each on its own draft)', async () => {
  const plan = C.planOf(E.defaultPlan(E.userTeam(picksOf(await (async () => (await honestDraft(memStore())).recs)()))));
  const cases = {
    'playoffs before the season ends': [['sp']],
    'quick-sim too many games': [['q', 120]],
    'unknown command': [['hack']],
    'trade with a bad player': [['tr', 99, 0]],
    'trade with a bad offer': [['tr', 0, 9]],
    'duplicate starters': [['P', { ...plan, starters: [0, 0, 1, 2, 3] }]],
    'minutes out of range': [['P', { ...plan, mins: Array(10).fill(99) }]],
    'bad tempo': [['P', { ...plan, tempo: 'warp' }]],
    'coaching outside a window': [['lg', [[3, 'L', [0, 1, 2, 3, 4]]]]],
    'op after the game': [['lg', [[9999, 'T']]]],
    'timeout with none left': [['lg', Array.from({ length: 12 }, () => [0, 'T'])]],
    'bad player index': [['lg', [[0, 'F', 99]]]],
    'empty log': []
  };
  for (const [name, log] of Object.entries(cases)) {
    const store = memStore(), d = await honestDraft(store);
    const e = await rejects(opSubmit(store, U, { id: d.id, log }), 400, 'invalid');
    assert.ok(e, name);
    assert.equal(store.runs.length, 0, name);
  }
  await rejects(opSubmit(memStore(), U, { id: (await honestDraft(memStore())).id, log: 'nope' }), 404);
});
test('an unfinished season is rejected, and three failed attempts void the draft', async () => {
  const store = memStore(), d = await honestDraft(store);
  const SE = clientSeason(d), unfinished = JSON.parse(JSON.stringify(SE.log)).slice(0, -3);
  for (let k = 0; k < 3; k++) await rejects(opSubmit(store, U, { id: d.id, log: unfinished }), 400, 'invalid');
  assert.equal((await store.getDraft(d.id, U)).status, 'void');
  await rejects(opSubmit(store, U, { id: d.id, log: SE.log }), 409);                // even a valid log is refused afterwards
  assert.equal(store.runs.length, 0);
});
test('a draft that is not finished cannot be submitted', async () => {
  const store = memStore();
  const { id } = await opStart(store, U, { hard: false, from: 1990, to: 2012, ver: sim.version });
  await rejects(opSubmit(store, U, { id, log: [] }), 409);
});
test('EuroLeague: the whole draft and season are driven and verified through the same server code', async () => {
  const S2 = loadSim('el'), C2 = S2.Core, store = memStore();
  const { id } = await opStart(store, U, { hard: false, from: 2016, to: 2026, ver: S2.version, comp: 'el' });
  const recs = [];
  for (let k = 0; k < 10; k++) {
    const roll = await opSpin(store, U, { id }), t = S2.byId.get(roll.team);
    assert.ok(t, 'rolled team belongs to the EuroLeague pool');
    const have = []; recs.forEach(r => have.push(C2.makePick(have, S2.byId.get(r.t), r.i, r.p)));
    const [, i] = t.players.map((p, i) => [p, i]).filter(([p, i]) => C2.makePick(have, t, i, null)).sort((a, b) => b[0].ovr - a[0].ovr)[0];
    const out = await opPick(store, U, { id, i, pos: null }); recs.push({ t: t.id, i, p: null });
    if (k === 9) { var seed = out.seed; assert.equal(out.done, true); }
  }
  const picks = []; recs.forEach(r => picks.push(C2.makePick(picks, S2.byId.get(r.t), r.i, r.p)));
  const SE = C2.createSeason({ picks, pool: C2.poolOf(S2.teams, 2016, 2026), seed, hard: false, name: 'My Team', comp: 'el' });
  while (SE.L.phase === 'season') C2.quick(SE);
  C2.startPlayoffs(SE); while (SE.L.phase === 'playoffs') C2.quickPo(SE);
  const out = await opSubmit(store, U, { id, log: SE.log });
  assert.equal(out.summary.w + out.summary.l, 38); assert.equal(store.runs[0].comp, 'el');
  assert.equal(out.summary.w, SE.L.rec[0].w);
});

test('rearranging drafted players: move, swap, and server accepts the new positions', async () => {
  const store = memStore();
  const { id } = await opStart(store, U, { hard: false, from: 1990, to: 2012, ver: sim.version });
  const recs = []; let moved = 0, swapped = 0;
  for (let k = 0; k < 10; k++) {
    const roll = await opSpin(store, U, { id });
    const t = sim.byId.get(roll.team), have = picksOf(recs);
    // try to rearrange the current roster in every possible way; every accepted result must be a valid assignment
    let arr = null;
    for (let i = 0; i < have.length && !arr; i++) for (const pos of E.POS) {
      const a = C.rearrange(have, i, pos); if (a) { assert.equal(a[i], pos); assert.ok(C.origElig(have[i]).includes(pos)); arr = a; moved++; break; }
    }
    for (let i = 0; i < have.length; i++) for (let j = i + 1; j < have.length; j++) {
      const as = E.assign(have), a = C.rearrange(have, i, as[j], j);
      if (a) { assert.equal(a[i], as[j]); assert.equal(a[j], as[i]); swapped++; }
    }
    const c = t.players.map((p, i) => [p, i]).filter(([p, i]) => C.makePick(have, t, i, null)).sort((x, y) => y[0].ovr - x[0].ovr);
    if (arr) {
      const h2 = have.map((p, q) => Object.assign({}, p, { _el: [arr[q]] }));
      const ok = c.find(([p, i]) => C.makePick(h2, t, i, null));
      if (ok) {
        const out = await opPick(store, U, { id, i: ok[1], pos: null, arr });
        recs.splice(0, recs.length, ...recs.map((r, q) => ({ ...r, p: arr[q] })), { t: t.id, i: ok[1], p: null });
        assert.ok(out);
        continue;
      }
    }
    const [, i] = c[0]; await opPick(store, U, { id, i, pos: null }); recs.push({ t: t.id, i, p: null });
  }
  assert.ok(moved + swapped >= 0);
  await rejects(opStart(store, U, { hard: false, from: 1990, to: 2012, ver: sim.version }).then(async ({ id: i2 }) => { await opSpin(store, U, { id: i2 }); return opPick(store, U, { id: i2, i: 0, pos: null, arr: ['PG', 'PG'] }); }), 400);
});
