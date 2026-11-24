import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadSim } from '../lib/sim.js';

const R = (() => { const m = { exports: {} }; new Function('module', readFileSync(new URL('../public/report.js', import.meta.url), 'utf8'))(m); return m.exports; })();
const sim = loadSim(), C = sim.Core, E = sim.Engine; R.setCore(C, E);
const pool = C.poolOf(sim.teams, 1990, 2012);
const draft = want => {
  const picks = []; let s = 7; const rnd = n => Math.floor(((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296) * n);
  for (let k = 0; k < 10; k++) {
    const t = C.rollTeam(pool, picks, rnd);
    let bi = -1, bv = -1e9; t.players.forEach((p, i) => { const v = want(p); if (v > bv && C.makePick(picks, t, i, null)) { bv = v; bi = i; } });
    picks.push(C.makePick(picks, t, bi, null));
  }
  return picks;
};
test('report needs three players, projects wins only for a full roster, and never touches the roster', () => {
  const picks = draft(p => p.ovr), before = JSON.stringify(picks);
  assert.equal(R.analyze(picks.slice(0, 2), pool, 'k'), null);
  const part = R.analyze(picks.slice(0, 6), pool, 'k');
  assert.equal(part.wins, null); assert.equal(part.partial, true);
  const a = R.analyze(picks, pool, 'k');
  assert.equal(JSON.stringify(picks), before);
  assert.equal(a.list.length, 6);
  assert.ok(a.wins >= 8 && a.wins <= 78 && a.notes.length >= 1);
});
test('categories are worth what the simulation says: scorers beat passers at scoring, passers beat scorers at playmaking', () => {
  const sc = R.analyze(draft(p => (p.ppg || 0) - 3 * (p.apg || 0)), pool, 'k'), pm = R.analyze(draft(p => (p.apg || 0) * 3), pool, 'k');
  assert.ok(sc.cats.pm.pts < pm.cats.pm.pts, 'playmaking');
  assert.ok(pm.cats.sc.pts < sc.cats.sc.pts, 'scoring');
  assert.ok(sc.cats.pm.pts < 0, 'scorers lose points at playmaking');
});
test('a roster of no ball handlers is flagged, with the cost the engine charges', () => {
  const noPass = draft(p => (p.guard ? -50 : 0) + (p.apg || 0) * -1 + p.ovr * 0.2).map(p => Object.assign({}, p, { ast: p.guard ? 0.5 : p.ast }));
  const a = R.analyze(noPass, pool, 'k'), h = a.syn.find(s => s.k === 'handler');
  assert.ok(h && h.pts < -0.5, 'handler synergy present');
  assert.ok(a.notes.some(n => /ball handler/i.test(n.text)));
  const good = R.analyze(noPass.map(p => Object.assign({}, p, { ast: p.guard ? 1.6 : p.ast })), pool, 'k');
  assert.ok(!good.syn.some(s => s.k === 'handler'));
  assert.ok(good.wins > a.wins, 'projection drops without a handler');
});
test('lift is positive when the added player is strong in the missing category', () => {
  const picks = draft(p => (p.ppg || 0) - 3 * (p.apg || 0)).slice(0, 6);
  const best = pool.flatMap(t => t.players).sort((a, b) => (b.apg || 0) - (a.apg || 0))[0];
  assert.ok(R.lift(picks, best, pool, 'k', 'pm') > 0);
});
test('every component of the rating is paid for in the engine, so a stat cannot count twice', () => {
  const p = sim.teams[0].players[0], q = Object.assign({}, p, { blk: p.blk + 1 });
  assert.ok(Math.abs(E.coreOf(q) - (E.coreOf(p) - E.CRED.blk[0])) < 1e-9, 'core falls by the credit when a component rises');
});
