import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadSim } from '../lib/sim.js';

const R = (() => { const m = { exports: {} }; new Function('module', readFileSync(new URL('../public/report.js', import.meta.url), 'utf8'))(m); return m.exports; })();
const sim = loadSim(), C = sim.Core; R.setCore(C);
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
test('report needs at least three players and never touches the roster', () => {
  const picks = draft(p => p.ovr), before = JSON.stringify(picks);
  assert.equal(R.analyze(picks.slice(0, 2), pool, 'k'), null);
  const a = R.analyze(picks, pool, 'k');
  assert.equal(JSON.stringify(picks), before);
  assert.equal(a.list.length, 6);
  a.list.forEach(c => assert.ok(c.pct >= 0 && c.pct <= 99));
  assert.ok(a.score >= 3 && a.score <= 99 && a.notes.length >= 1);
});
test('a roster of pure scorers is told it has nobody to pass; a passer-heavy one is not', () => {
  const scorers = R.analyze(draft(p => (p.ppg || 0) - 3 * (p.apg || 0)), pool, 'k'), passers = R.analyze(draft(p => (p.apg || 0) * 3), pool, 'k');
  assert.ok(scorers.cats.pm.pct < passers.cats.pm.pct, 'playmaking ranks lower for the scorers');
  assert.ok(passers.cats.sc.pct < scorers.cats.sc.pct, 'scoring ranks lower for the passers');
  assert.ok(scorers.cats.pm.pct < 35 && scorers.notes.some(n => /pass|offense|ball/i.test(n.text)), scorers.notes.map(n => n.text).join(' | '));
});
test('lift is positive when the added player is strong in the missing category', () => {
  const picks = draft(p => (p.ppg || 0) - 3 * (p.apg || 0)).slice(0, 6);
  const best = pool.flatMap(t => t.players).sort((a, b) => (b.apg || 0) - (a.apg || 0))[0];
  assert.ok(R.lift(picks, best, pool, 'k', 'pm') > 0);
});
