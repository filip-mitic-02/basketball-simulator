import test from 'node:test';
import assert from 'node:assert/strict';
import { loadSim, loadProgress } from '../lib/sim.js';
import { ApiError, opStart, opSpin, opPick, opSubmit } from '../lib/draftlogic.js';
import { opShop } from '../lib/shoplogic.js';
import { memStore } from './helpers/memstore.js';

const P = loadProgress(), sim = loadSim(), { Core: C } = sim, U = 'u-1';
const rejects = async (p, status) => { try { await p; } catch (e) { assert.ok(e instanceof ApiError); assert.equal(e.status, status); return; } assert.fail('expected rejection ' + status); };

test('levels: thresholds strictly increase, XP maps to the right level and the curve matches the plan', () => {
  for (let i = 1; i < P.THRESHOLDS.length; i++) assert.ok(P.THRESHOLDS[i] > P.THRESHOLDS[i - 1]);
  assert.equal(P.levelOf(0), 1); assert.equal(P.levelOf(79), 1); assert.equal(P.levelOf(80), 2);
  assert.ok(P.levelOf(2200) === 10 || P.levelOf(2200) === 9);
  assert.equal(P.levelOf(1e9), P.MAX_LEVEL);
  assert.equal(P.cumCoins(1), 0); assert.equal(P.cumCoins(2), P.levelCoins(2)); assert.equal(P.cumCoins(5), [2, 3, 4, 5].reduce((a, n) => a + P.levelCoins(n), 0));
});
test('season XP: a good season is worth about 80 to 150, a perfect one about 300, Hard adds half, no negative parts', () => {
  const good = P.xpFor({ w: 33, l: 5, poW: 5, poR: 3, poL: 1, champ: true, hard: false }, 38).xp;
  assert.ok(good >= 80 && good <= 170, 'good ' + good);
  const perfect = P.xpFor({ w: 38, l: 0, poW: 7, poR: 3, poL: 0, champ: true, hard: false }, 38).xp;
  assert.ok(perfect >= 250 && perfect <= 330, 'perfect ' + perfect);
  const hard = P.xpFor({ w: 33, l: 5, poW: 5, poR: 3, poL: 1, champ: true, hard: true }, 38).xp;
  assert.equal(hard, good + Math.round(good * 0.5));
  const bad = P.xpFor({ w: 10, l: 28, poW: 0, poR: 0, poL: 0, champ: false, hard: false }, 38);
  assert.ok(bad.xp > 0 && bad.xp < 40); bad.parts.forEach(p => assert.ok(p[1] > 0));
});
test('reward: coins include level-up coins and the level range is reported', () => {
  const r = P.reward(70, { w: 30, l: 8, poW: 3, poR: 1, poL: 1, champ: false, hard: false }, 38);
  assert.equal(r.from, 1); assert.ok(r.to >= 2); assert.equal(r.coins, r.seasonCoins + r.levelCoins); assert.ok(r.levelCoins >= P.levelCoins(2));
});
test('catalog: unique ids, every slot has a free default, prices are sane', () => {
  const ids = new Set(); P.ITEMS.forEach(i => { assert.ok(!ids.has(i.id)); ids.add(i.id); assert.ok(P.SLOTS.some(s => s.id === i.slot)); assert.ok(i.price >= 0 && i.price <= 5000); });
  P.SLOTS.forEach(s => { const d = P.byId[P.DEFAULTS[s.id]]; assert.ok(d && d.slot === s.id && d.price === 0); });
});

async function playedRun(store, user = U) {
  const { id } = await opStart(store, user, { hard: false, from: 1990, to: 2012, ver: sim.version });
  const recs = [];
  for (let k = 0; k < 10; k++) {
    await opSpin(store, user, { id });
    const roll = store.drafts.get(id), t = sim.byId.get(roll.curTeam);
    const have = []; recs.forEach(r => have.push(C.makePick(have, sim.byId.get(r.t), r.i, r.p)));
    const i = t.players.map((p, i) => [p, i]).filter(([p, i]) => C.makePick(have, t, i, null)).sort((a, b) => b[0].ovr - a[0].ovr)[0][1];
    const out = await opPick(store, user, { id, i, pos: null }); recs.push({ t: t.id, i, p: null });
    if (k === 9) {
      const picks = []; recs.forEach(r => picks.push(C.makePick(picks, sim.byId.get(r.t), r.i, r.p)));
      const SE = C.createSeason({ picks, pool: C.poolOf(sim.teams, 1990, 2012), seed: out.seed, hard: false, name: 'T' });
      while (SE.L.phase === 'season') C.quick(SE); C.startPlayoffs(SE); while (SE.L.phase === 'playoffs') C.quickPo(SE);
      return { id, SE };
    }
  }
}

test('a verified season awards XP and coins once, from the server summary, and the totals add up', async () => {
  const store = memStore(), d = await playedRun(store), s = C.summarize(d.SE);
  const out = await opSubmit(store, U, { id: d.id, log: JSON.parse(JSON.stringify(d.SE.log)) });
  const want = P.xpFor(s, d.SE.R.games).xp;
  assert.equal(out.reward.xp, want); assert.equal(store.users.get(U).xp, want);
  assert.equal(store.users.get(U).coins, out.reward.coins); assert.equal(out.reward.state.xp, want);
  assert.equal(store.runs[0].xp, want);
  await assert.rejects(opSubmit(store, U, { id: d.id, log: d.SE.log }));               // a second submit of the same draft awards nothing more
  assert.equal(store.users.get(U).xp, want);
});
test('summary carries playoff rounds and losses used for XP', async () => {
  const store = memStore(), d = await playedRun(store), s = C.summarize(d.SE);
  assert.ok(Number.isInteger(s.poR) && s.poR >= 0 && s.poR <= d.SE.R.po.rounds.length); assert.ok(Number.isInteger(s.poL) && s.poL >= 0);
  if (s.champ) assert.equal(s.poR, d.SE.R.po.rounds.length);
});

test('shop: buy needs coins, cannot buy twice, equip needs ownership, free items are always usable, unknown items are rejected', async () => {
  const store = memStore(); store.users.set(U, { xp: 0, coins: 600, equipped: {}, owned: [] });
  await rejects(opShop(store, U, { op: 'buy', item: 'court_royal' }), 402);
  await rejects(opShop(store, U, { op: 'equip', item: 'court_hardwood' }), 403);
  let r = await opShop(store, U, { op: 'buy', item: 'court_hardwood' });
  assert.equal(r.prog.coins, 100); assert.ok(r.prog.owned.includes('court_hardwood'));
  await rejects(opShop(store, U, { op: 'buy', item: 'court_hardwood' }), 409);
  r = await opShop(store, U, { op: 'equip', item: 'court_hardwood' }); assert.equal(r.prog.equipped.court, 'court_hardwood');
  r = await opShop(store, U, { op: 'equip', item: 'court_midnight' }); assert.equal(r.prog.equipped.court, 'court_midnight');   // free default
  await rejects(opShop(store, U, { op: 'buy', item: 'nope' }), 400);
  await rejects(opShop(store, U, { op: 'sell', item: 'court_hardwood' }), 400);
  await rejects(opShop(store, U, null), 400);
  assert.equal(store.users.get(U).coins, 100);
});

test('bonus re-spin: only after the normal ones are used, only once, and the server enforces the extra limit', async () => {
  const { opBonus } = await import('../lib/draftlogic.js');
  const store = memStore(), { id } = await opStart(store, U, { hard: false, from: 1990, to: 2012, ver: sim.version });
  await opSpin(store, U, { id });
  await rejects(opBonus(store, U, { id }), 409);                       // re-spins left
  await opSpin(store, U, { id }, true); await opSpin(store, U, { id }, true);
  await rejects(opSpin(store, U, { id }, true), 409);                  // normal limit reached
  const v = await opBonus(store, U, { id }); assert.equal(v.bonus, 1);
  await opSpin(store, U, { id }, true);                                // the extra one works
  await rejects(opSpin(store, U, { id }, true), 409);
  await rejects(opBonus(store, U, { id }), 409);                       // once per draft
});
test('bonus trade is a logged decision: one extra trade, replayed by the server, a second one is refused', () => {
  const pool = C.poolOf(sim.teams, 1990, 2012), picks = []; let s = 5; const rnd = n => (s = (s * 1103515245 + 12345) % 2147483648) % n;
  for (let k = 0; k < 10; k++) { const t = C.rollTeam(pool, picks, rnd); const i = t.players.map((p, i) => i).find(i => C.makePick(picks, t, i, null)); picks.push(C.makePick(picks, t, i, null)); }
  const SE = C.createSeason({ picks, pool, seed: 99, hard: false, name: 'T' });
  assert.equal(C.tradeState(SE).left, C.TRADE.max); assert.ok(C.bonusTrade(SE)); assert.equal(C.tradeState(SE).left, C.TRADE.max + 1); assert.ok(!C.bonusTrade(SE));
  const msg = log => { try { C.replay({ picks, pool, seed: 99, hard: false, name: 'T' }, log); } catch (e) { assert.ok(e instanceof C.Invalid); return e.message; } return 'ok'; };
  assert.equal(msg(JSON.parse(JSON.stringify(SE.log))), 'unfinished');   // accepted as a command; the season just is not finished
  assert.equal(msg([['bt'], ['bt']]), 'bonus');
});
