// Team report: does the roster have everything a team needs? Pure presentation logic, it never touches the simulation.
// Every category is ranked (percentile) against rosters a sensible drafter would build in the chosen era.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(); else root.Report = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const N = v => (typeof v === 'number' && isFinite(v) ? v : 0);
  // key, label, unit, per-player value, how the team value is built from the rotation
  const CATS = [
    { k: 'sc', name: 'Scoring', unit: 'pts', val: p => N(p.ppg) },
    { k: 'pm', name: 'Playmaking', unit: 'ast', val: p => N(p.apg) },
    { k: 'rb', name: 'Rebounding', unit: 'reb', val: p => N(p.rpg) },
    { k: 'rp', name: 'Rim protection', unit: 'blk', val: p => N(p.bpg) },
    { k: 'pd', name: 'Perimeter defense', short: 'Perimeter D', unit: 'stl', val: p => N(p.spg) },
    { k: 'sp', name: 'Floor spacing', unit: '3P', val: p => N(p.r3) * N(p.tp) * N(p.mpg) / 36 }
  ];
  const ROT = 8;
  const byMin = ps => ps.slice().sort((a, b) => N(b.mpg) - N(a.mpg) || N(b.ovr) - N(a.ovr));
  // Team value: the rotation (best eight by minutes). Playmaking leans on the two best passers, because one facilitator
  // is worth more than five average passers; rim protection leans on the best shot blocker for the same reason.
  function teamVal(cat, ps) {
    const rot = byMin(ps).slice(0, ROT), v = rot.map(cat.val).sort((a, b) => b - a), sum = v.reduce((a, b) => a + b, 0);
    if (cat.k === 'pm') return 0.5 * sum + 1.5 * ((v[0] || 0) + 0.5 * (v[1] || 0));
    if (cat.k === 'rp') return 0.6 * sum + 1.2 * (v[0] || 0);
    return sum;
  }
  let CORE = null;
  const refCache = new Map();
  // The yardstick is a set of rosters drafted by a sensible player (best rating at every spin) in the same era, so 50 means
  // "a typical good draft" and a low number means a real gap compared to what is usually possible, not compared to history.
  function simRosters(pool) {
    const out = []; let s = 12345;
    const rnd = n => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return Math.floor(((t ^ (t >>> 14)) >>> 0) / 4294967296 * n); };
    for (let g = 0; g < 110; g++) {
      const picks = [];
      for (let k = 0; k < 10; k++) {
        const t = CORE.rollTeam(pool, picks, rnd);
        let best = null, bi = -1;
        t.players.forEach((p, i) => { if ((!best || N(p.ovr) > N(best.ovr)) && CORE.makePick(picks, t, i, null)) { best = p; bi = i; } });
        if (bi < 0) break;
        picks.push(CORE.makePick(picks, t, bi, null));
      }
      if (picks.length === 10) out.push(picks);
    }
    return out;
  }
  function refFor(pool, key, n) {
    let R = refCache.get(key);
    if (!R) { R = { rosters: simRosters(pool) }; refCache.set(key, R); if (refCache.size > 8) refCache.delete(refCache.keys().next().value); }
    if (R[n]) return R[n];
    const out = {};
    CATS.forEach(c => { out[c.k] = R.rosters.map(ps => teamVal(c, byMin(ps).slice(0, n))).sort((a, b) => a - b); });
    return (R[n] = out);
  }
  const pctOf = (arr, v) => { let lo = 0, hi = arr.length; while (lo < hi) { const m = (lo + hi) >> 1; if (arr[m] < v) lo = m + 1; else hi = m; } return Math.max(0, Math.min(99, Math.round(lo / arr.length * 100))); };
  const tier = v => v >= 80 ? 'elite' : v >= 55 ? 'good' : v >= 20 ? 'mid' : 'low';
  const lead = (cat, ps) => ps.slice().sort((a, b) => cat.val(b) - cat.val(a))[0];
  const f1 = v => N(v).toFixed(1);

  function analyze(players, pool, key) {
    const n = Math.min(ROT, players.length);
    if (n < 3) return null;
    const ref = refFor(pool, key, n), cats = {};
    CATS.forEach(c => {
      const v = teamVal(c, players), p = pctOf(ref[c.k], v), L = lead(c, players);
      cats[c.k] = { k: c.k, name: c.name, short: c.short || c.name, unit: c.unit, pct: p, tier: tier(p), leader: L ? L.name : '', leaderVal: L ? c.val(L) : 0 };
    });
    const list = CATS.map(c => cats[c.k]);
    const avg = list.reduce((a, c) => a + c.pct, 0) / list.length;
    const holes = list.filter(c => c.pct < 20).sort((a, b) => a.pct - b.pct);
    const gaps = list.reduce((a, c) => a + Math.max(0, 35 - c.pct), 0);
    const score = Math.max(3, Math.min(99, Math.round(22 + 0.78 * avg - gaps * 0.3)));
    const notes = insights(players, cats, list, holes);
    const verdict = holes.length === 0 ? (score >= 62 ? 'Complete roster' : 'Solid, no real holes')
      : holes.length === 1 ? 'One big hole' : 'Unbalanced roster';
    const need = holes[0] || list.slice().sort((a, b) => a.pct - b.pct)[0];
    return { n, cats, list, score, tier: tier(score), verdict, holes, need: need.k, notes, partial: players.length < 10 };
  }

  // Short, specific sentences. Problems first, then what is working.
  function insights(ps, cats, list, holes) {
    const out = [], top = byMin(ps).slice(0, ROT), P = k => cats[k].pct;
    const scorers = top.filter(p => N(p.ppg) >= 18);
    const best = k => { const c = CATS.find(x => x.k === k), L = lead(c, ps); return L ? `${L.name} (${f1(c.val(L))} ${c.unit})` : ''; };
    const sayHole = {
      pm: () => scorers.length >= 3 && P('sc') >= 55
        ? `Plenty of scorers and nobody to get them the ball. Your best passer is ${best('pm')}.`
        : `Nobody to run the offense. Your best passer is ${best('pm')}, so shots will come off isolation.`,
      rb: () => cats.rb.leaderVal >= 9 ? `${best('rb')} has almost no help on the glass. Opponents will get second chances.` : `Thin on the glass. Opponents will get second chances. Best rebounder: ${best('rb')}.`,
      rp: () => cats.rp.leaderVal >= 1.8 ? `${best('rp')} is the only rim protector. Drivers will finish easily whenever he rests.` : `No one protects the rim. Drivers will finish easily. Best shot blocker: ${best('rp')}.`,
      pd: () => `Nobody to pressure the ball on the perimeter. Best thief: ${best('pd')}.`,
      sp: () => `No floor spacing. The paint will be crowded and defenders can sag off your shooters.`,
      sc: () => `Short on scoring. When the offense stalls nobody can create a bucket. Top scorer: ${best('sc')}.`
    };
    holes.forEach(h => out.push({ kind: 'bad', text: sayHole[h.k]() }));
    list.filter(c => c.pct >= 20 && c.pct < 36 && out.length < 3).forEach(c => out.push({ kind: 'warn', text: `${c.name} is a soft spot. It ranks ${c.pct} against typical drafts.` }));
    if (scorers.length >= 4 && P('pm') < 60) out.push({ kind: 'warn', text: `${scorers.length} players want 18+ points but there is one ball. Expect shots to be shared thin.` });
    const bigs = top.filter(p => p.big || p.slot === 'C' || p.slot === 'PF');
    if (bigs.length && Math.max(...bigs.map(p => N(p.rpg))) < 6.5 && P('rb') >= 20) out.push({ kind: 'warn', text: 'No true big man on the floor. You may get pushed around inside.' });
    list.filter(c => c.pct >= 80).sort((a, b) => b.pct - a.pct).slice(0, 2).forEach(c => out.push({ kind: 'good', text: `${c.name} is elite, led by ${c.leader} (${f1(c.leaderVal)} ${c.unit}).` }));
    if (!out.length) out.push({ kind: 'good', text: 'Everything a contender needs: scoring, passing, size, defense and shooting.' });
    return out.slice(0, 5);
  }

  // How much would adding `p` lift the team's weakest category? Used to tag draft cards.
  function lift(players, p, pool, key, catKey) {
    if (players.length < 2) return 0;
    const c = CATS.find(x => x.k === catKey), ref = refFor(pool, key, Math.min(ROT, players.length + 1));
    return pctOf(ref[catKey], teamVal(c, players.concat([p]))) - pctOf(refFor(pool, key, Math.min(ROT, players.length))[catKey], teamVal(c, players));
  }
  return { CATS, analyze, lift, tier, setCore: c => { CORE = c; } };
});
