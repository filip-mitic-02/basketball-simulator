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
  const snap = x => JSON.stringify(x, (k, v) => (k[0] === '_' ? undefined : v));  // caches such as _el and _tr may be filled, nothing else may change
  const picks = draft(p => p.ovr), before = snap(picks);
  assert.equal(R.analyze(picks.slice(0, 2), pool, 'k'), null);
  const part = R.analyze(picks.slice(0, 6), pool, 'k');
  assert.equal(part.wins, null); assert.equal(part.partial, true);
  const a = R.analyze(picks, pool, 'k');
  assert.equal(snap(picks), before);
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
test('tactic fit: only for a full roster, at most one recommendation per group, and it follows the roster', () => {
  const full = C.createSeason({ picks: draft(p => p.ovr), pool, seed: 5, hard: false, name: 'T' });
  assert.equal(R.tacticFit(full.user.players.slice(0, 6), full.plan), null);
  const f = R.tacticFit(full.user.players, full.plan);
  const off = ['inside', 'threes', 'ballmove'].filter(k => f.fit[k].rec), def = ['zone', 'press'].filter(k => f.fit[k].rec);
  assert.ok(off.length <= 1 && def.length <= 1);
  assert.ok(!('iso' in f.fit) && !('slow' in f.fit), 'no verdict for tempo and isolation');
  // a shooting roster should lean to threes over inside, a rim-protecting roster the other way
  const sh = C.createSeason({ picks: draft(p => p.ovr + 60 * ((p.r3 || 0) - 0.25) + 60 * (p.p3 || 0) - 8 * (p.big ? 1 : 0)), pool, seed: 5, hard: false, name: 'T' });
  const bg = C.createSeason({ picks: draft(p => p.ovr + 12 * (p.blk || 0) + 8 * (p.orb || 0) - 40 * (p.r3 || 0)), pool, seed: 5, hard: false, name: 'T' });
  const a = R.tacticFit(sh.user.players, sh.plan).fit, b = R.tacticFit(bg.user.players, bg.plan).fit;
  assert.ok(a.threes.gain - a.inside.gain > b.threes.gain - b.inside.gain, 'threes vs inside moves with the roster');
});
test('traits: only top players get one, it comes from their stats, and it changes games for the team that has the star', () => {
  const P = sim.teams.flatMap(t => t.players), withT = P.filter(p => E.traitOf(p));
  assert.ok(withT.length > 200 && withT.length < P.length * 0.05, 'traits are rare');
  assert.ok(withT.every(p => p.ovr >= E.TR.ovrMin), 'only high-rated players');
  const by = n => P.filter(p => p.name === n && E.traitOf(p)).map(p => E.traitOf(p).k);
  assert.ok(by('Nikola Jokić').includes('maestro') && by('Stephen Curry').includes('sniper') && by('Joel Embiid').includes('magnet'));
  assert.ok(P.filter(p => p.name === 'Kareem Abdul-Jabbar').some(p => E.traitOf(p) && E.traitOf(p).k === 'eraser'));
});
test('play-by-play names a trait when it shows up, and only then', () => {
  const find = k => sim.teams.flatMap(t => t.players).find(p => E.traitOf(p) && E.traitOf(p).k === k && p.big);
  const star = find('eraser'), plain = sim.teams.flatMap(t => t.players).find(p => !E.traitOf(p));
  const G = { teams: [{ players: [plain], user: true }, { players: [star], label: 'X' }] };
  assert.match(E.describe(G, { k: 'block', t: 0, p: 0, b: 0 }), /Shot Eraser/);
  const G2 = { teams: [{ players: [plain], user: true }, { players: [plain], label: 'X' }] };
  assert.doesNotMatch(E.describe(G2, { k: 'block', t: 0, p: 0, b: 0 }), /Eraser/);
});
test('interactive moments: live games show them, answers are verified by replay, skipping changes nothing', () => {
  const o = { picks: draft(p => p.ovr), pool, seed: 99, hard: false, name: 'T' };
  const play = answer => {
    const SE = C.createSeason(o); let seen = 0;
    for (let g = 0; g < 5; g++) {
      const G = C.beginLive(SE, false); G.fast = true;
      while (!G.over) { C.step(SE, G); const pd = G.mo.pending; if (pd) { seen++; if (answer) C.answerMoment(SE, G, (seen * 7) % pd.opts.filter(x => !x.off).length); } }
      C.finishLive(SE, G);
    }
    while (SE.L.phase === 'season') C.quick(SE);
    C.startPlayoffs(SE); while (!['eliminated', 'champion', 'done'].includes(SE.L.phase)) C.quickPo(SE);
    return { SE, seen };
  };
  const a = play(true), b = play(false);
  assert.ok(a.seen >= 10, 'about two moments per game at least, got ' + a.seen);
  assert.ok(a.SE.log.some(c => c[0] === 'lg' && c[1].some(op => op[1] === 'M')), 'answers are logged');
  const R = C.replay(o, JSON.parse(JSON.stringify(a.SE.log)));
  assert.equal(R.L.rec[0].w, a.SE.L.rec[0].w); assert.equal(R.L.phase, a.SE.L.phase);
  const R2 = C.replay(o, JSON.parse(JSON.stringify(b.SE.log)));
  assert.equal(R2.L.rec[0].w, b.SE.L.rec[0].w);
  assert.throws(() => C.replay(o, [['lg', [[3, 'M', 0]]]]), /moment/, 'an answer with no moment pending is rejected');
});
const finishSeason = SE => { while (SE.L.phase === 'season') C.quick(SE); C.startPlayoffs(SE); while (!['eliminated', 'champion', 'done'].includes(SE.L.phase)) C.quickPo(SE); };
test('injuries: rare, short, one at a time, the man really sits, and the server replay reproduces them', () => {
  let total = 0, long = 0;
  for (let seed = 1; seed <= 6; seed++) {
    const o = { picks: draft(p => p.ovr), pool, seed, hard: false, name: 'T' }, SE = C.createSeason(o), L = SE.L;
    let prev = null;
    while (L.phase === 'season') {
      const G = C.beginLive(SE, false); G.fast = true; const hurt = L.inj && L.inj.i;
      while (!G.over) C.step(SE, G);
      if (hurt != null) assert.equal(G.st[G.userSide][hurt].sec, 0, 'an injured player does not play');
      C.finishLive(SE, G);
    }
    total += L.injLog.length; long += L.injLog.filter(x => x.g > 2).length;
    L.injLog.forEach(x => assert.ok(x.g >= 1 && x.g <= 3));
    C.startPlayoffs(SE); while (!['eliminated', 'champion', 'done'].includes(L.phase)) C.quickPo(SE);
    const R2 = C.replay(o, JSON.parse(JSON.stringify(SE.log)));
    assert.equal(R2.L.rec[0].w, L.rec[0].w); assert.equal(JSON.stringify(R2.L.injLog), JSON.stringify(L.injLog));
  }
  assert.ok(total >= 6 && total <= 60, 'a few injuries per season, got ' + total + ' in 6');
  assert.ok(long <= total * 0.2, 'three-game injuries are rare');
});
test('trades: three comparable offers, deterministic, verified by the replay, limited by count and deadline', () => {
  const o = { picks: draft(p => p.ovr), pool, seed: 5, hard: false, name: 'T' }, SE = C.createSeason(o);
  const offs = C.tradeOffers(SE, 4), again = C.tradeOffers(SE, 4);
  assert.equal(offs.length, 3); assert.deepEqual(offs.map(p => p.name), again.map(p => p.name));
  const out = SE.user.players[4];
  offs.forEach(p => { assert.ok(Math.abs(p.ovr - out.ovr) <= 9); assert.ok(!SE.user.players.some(x => x.name === p.name)); });
  assert.ok(C.doTrade(SE, 4, 1)); assert.equal(SE.user.players[4].name, offs[1].name);
  assert.ok(C.doTrade(SE, 2, 0));
  assert.equal(C.tradeState(SE).left, 0); assert.equal(C.doTrade(SE, 1, 0), false, 'only two trades a season');
  assert.equal(new Set(SE.user.players.map(p => p.slot)).size, 5, 'positions stay valid');
  finishSeason(SE);
  const R2 = C.replay(o, JSON.parse(JSON.stringify(SE.log)));
  assert.equal(R2.L.rec[0].w, SE.L.rec[0].w); assert.equal(R2.user.players.map(p => p.name).join(), SE.user.players.map(p => p.name).join());
  // deadline
  const SE2 = C.createSeason(o); for (let g = 0; g < 56; g++) C.quick(SE2);
  assert.equal(C.tradeState(SE2).open, false); assert.equal(C.doTrade(SE2, 0, 0), false);
  const bad = JSON.parse(JSON.stringify(SE2.log)); bad.push(['tr', 0, 0]);
  assert.throws(() => C.replay(o, bad), /trade/);
});
