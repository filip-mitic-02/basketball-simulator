// Team report: where a roster's strength comes from and what it is missing.
// Every number here comes from the simulation itself. Each component of the player rating (Engine.CRED) acts in the game with a
// weight that was calibrated and measured, so a category's "points per game" is what that part of the roster is actually worth.
// Pure presentation logic, it never changes the simulation.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(); else root.Report = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const N = v => (typeof v === 'number' && isFinite(v) ? v : 0);
  let CORE = null, ENG = null;

  // Measured on the final simulation: points per game won by one rating point for the whole rotation, and wins per point per game.
  const PPG_PER_RATING = 1.1, WINS_PER_PPG = 1.45;
  // Measured cost of the team-level synergies in the game engine (points per game, worst case).
  const SYN = { handler: 2.6, cramped: 0.5, usage: 0.7 };
  // Projected wins from the minute-weighted rating of the roster (quadratic fit on ~670 simulated seasons with rating 58+,
  // residual sd about 5.5 wins; the opposition, injuries of form and coaching make up the rest).
  const projWins = r => -151.8 + 4.886 * r - 0.027 * r * r;
  // EuroLeague (38 games), same method: ~150 simulated seasons of random-to-best drafts, residual sd about 3 wins.
  const projWinsEL = r => -94.2 + 3.0418 * r - 0.01789 * r * r;
  const TG = [34, 33, 32, 30, 29, 24, 20, 16, 12, 10];

  // Each category: the part of the rating it stands for (ovr points, relative to an average player).
  const CATS = [
    { k: 'sc', name: 'Scoring', short: 'Scoring', unit: 'pts', stat: p => N(p.ppg), val: (p, C) => C.score(p) },
    { k: 'pm', name: 'Playmaking', short: 'Playmaking', unit: 'ast', stat: p => N(p.apg), val: (p, C) => C.cr('ast', p) },
    { k: 'rb', name: 'Rebounding', short: 'Rebounding', unit: 'reb', stat: p => N(p.rpg), val: (p, C) => C.cr('orb', p) + C.cr('drb', p) },
    { k: 'rp', name: 'Rim protection', short: 'Rim protection', unit: 'blk', stat: p => N(p.bpg), val: (p, C) => C.cr('blk', p) },
    { k: 'pd', name: 'Perimeter defense', short: 'Perimeter D', unit: 'stl', stat: p => N(p.spg), val: (p, C) => C.cr('stl', p) },
    { k: 'di', name: 'Discipline', short: 'Discipline', unit: '', stat: null, val: (p, C) => C.cr('tov', p) + C.cr('pf', p) }
  ];
  const helpers = () => {
    const CR = ENG.CRED, cr = (f, p) => (p[f] == null ? 0 : CR[f][0] * (p[f] - CR[f][1]));
    // scoring = the rating minus what the other components already pay for
    const score = p => p.ovr - ['ast', 'orb', 'drb', 'stl', 'blk', 'tov', 'pf'].reduce((a, f) => a + cr(f, p), 0);
    return { cr, score };
  };
  const byRating = ps => ps.slice().sort((a, b) => N(b.ovr) - N(a.ovr));
  // minute-weighted average of a per-player value, using the standard rotation for as many players as the roster has
  function teamVal(fn, ps) {
    const top = byRating(ps).slice(0, TG.length); let s = 0, w = 0;
    top.forEach((p, i) => { s += fn(p) * TG[i]; w += TG[i]; });
    return w ? s / w : 0;
  }
  const refCache = new Map();
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
  // refs[n][k] = sorted team values over rosters a sensible drafter builds in this era, limited to their n best players
  function refFor(pool, key, n) {
    let R = refCache.get(key);
    if (!R) { R = { rosters: simRosters(pool), H: helpers() }; refCache.set(key, R); if (refCache.size > 8) refCache.delete(refCache.keys().next().value); }
    if (R[n]) return R[n];
    const out = {};
    CATS.forEach(c => { out[c.k] = R.rosters.map(ps => teamVal(p => c.val(p, R.H), byRating(ps).slice(0, n))).sort((a, b) => a - b); });
    return (R[n] = out);
  }
  const pctOf = (arr, v) => { let lo = 0, hi = arr.length; while (lo < hi) { const m = (lo + hi) >> 1; if (arr[m] < v) lo = m + 1; else hi = m; } return Math.max(0, Math.min(99, Math.round(lo / arr.length * 100))); };
  const median = arr => arr[arr.length >> 1];
  const tier = v => v >= 80 ? 'elite' : v >= 55 ? 'good' : v >= 20 ? 'mid' : 'low';
  const scoreTier = (w, el) => el ? (w >= 30 ? 'elite' : w >= 26 ? 'good' : w >= 18 ? 'mid' : 'low') : (w >= 66 ? 'elite' : w >= 56 ? 'good' : w >= 40 ? 'mid' : 'low');
  const f1 = v => N(v).toFixed(1);

  // Team-level synergies the engine models, from the starting five.
  function synergy(ps) {
    const five = ENG.bestFive(ps).map(i => ps[i]), out = [];
    const guards = five.filter(p => p.guard), hq = guards.reduce((m, p) => Math.max(m, N(p.ast)), 0);
    const hl = Math.max(0, Math.min(1, (0.95 - hq) / 0.35));
    if (ps.length >= 5 && hl > 0.05) out.push({ k: 'handler', pts: -SYN.handler * hl, hl });
    const spc = five.reduce((a, p) => a + Math.max(0, Math.min(1, (N(p.r3) - 0.14) / 0.18)) * Math.max(0.3, Math.min(1.2, 0.5 + (N(p.p3) + 0.03) * 12)), 0);
    if (ps.length >= 5 && spc < 1.6) out.push({ k: 'cramped', pts: -SYN.cramped, spc });
    const usg = five.reduce((a, p) => a + N(p.usg), 0) / Math.max(1, five.length);
    if (ps.length >= 5 && usg > 1.12) out.push({ k: 'usage', pts: -SYN.usage * Math.min(1.4, (usg - 1.08) / 0.27), usg });
    return out;
  }

  function analyze(players, pool, key) {
    if (!CORE || !ENG || players.length < 3) return null;
    const n = Math.min(TG.length, players.length), H = helpers(), ref = refFor(pool, key, n), complete = players.length >= 10;
    const list = CATS.map(c => {
      const v = teamVal(p => c.val(p, H), players), arr = ref[c.k], pct = pctOf(arr, v), pts = PPG_PER_RATING * (v - median(arr));
      const L = c.stat ? players.slice().sort((a, b) => c.stat(b) - c.stat(a))[0] : players.slice().sort((a, b) => c.val(b, H) - c.val(a, H))[0];
      return { k: c.k, name: c.name, short: c.short, unit: c.unit, pct, pts, tier: tier(pct), leader: L ? L.name : '', leaderVal: L && c.stat ? c.stat(L) : null };
    });
    const syn = synergy(players), synPts = syn.reduce((a, s) => a + s.pts, 0);
    const cats = Object.fromEntries(list.map(c => [c.k, c]));
    const rating = teamVal(p => N(p.ovr), players);
    const isEL = String(key).slice(0, 3) === 'el:';
    const wins = complete ? (isEL ? Math.max(3, Math.min(36, Math.round(projWinsEL(rating) + 2.0 * synPts))) : Math.max(8, Math.min(78, Math.round(projWins(rating) + WINS_PER_PPG * synPts)))) : null;
    const holes = list.filter(c => c.pts <= -0.9 && c.pct < 25).sort((a, b) => a.pts - b.pts);
    const cost = holes.reduce((a, c) => a + c.pts, 0) + synPts;
    const verdict = (cost > -0.9 ? 'No real weakness' : holes.length + syn.filter(s => s.pts <= -0.8).length >= 2 ? 'Unbalanced roster' : 'One big hole');
    const need = list.slice().sort((a, b) => a.pts - b.pts)[0];
    return { n, rating, synPts, cats, list, syn, wins, score: wins, tier: wins == null ? 'mid' : scoreTier(wins, isEL), verdict, holes, need: need.k, notes: insights(players, cats, list, holes, syn), partial: !complete, count: players.length };
  }

  const pts1 = v => Math.abs(v).toFixed(1);
  function insights(ps, cats, list, holes, syn) {
    const out = [], nm = (k, extra) => { const c = cats[k]; return c.leader ? `${c.leader}${c.leaderVal != null ? ` (${f1(c.leaderVal)} ${c.unit})` : ''}` : ''; };
    const say = {
      sc: c => `Short on scoring, about ${pts1(c.pts)} points per game behind a typical draft. Top scorer: ${nm('sc')}.`,
      pm: c => `Few playmakers. It costs about ${pts1(c.pts)} points per game. Best passer: ${nm('pm')}.`,
      rb: c => `Thin on the glass, about ${pts1(c.pts)} points per game. Best rebounder: ${nm('rb')}.`,
      rp: c => `Weak rim protection, about ${pts1(c.pts)} points per game. Best shot blocker: ${nm('rp')}.`,
      pd: c => `Nobody to disrupt ball handlers, about ${pts1(c.pts)} points per game. Best thief: ${nm('pd')}.`,
      di: c => `Sloppy with the ball and the whistle: turnovers and fouls cost about ${pts1(c.pts)} points per game.`
    };
    syn.filter(s => s.pts <= -0.8).forEach(s => {
      if (s.k === 'handler') out.push({ kind: 'bad', text: `No real ball handler in the starting five. Turnovers go up and shots get worse, about ${pts1(s.pts)} points per game.` });
      if (s.k === 'usage') out.push({ kind: 'bad', text: `Too many high-usage starters sharing one ball, about ${pts1(s.pts)} points per game.` });
    });
    holes.forEach(h => out.push({ kind: 'bad', text: say[h.k](h) }));
    syn.filter(s => s.pts > -0.8).forEach(s => {
      if (s.k === 'handler') out.push({ kind: 'warn', text: `The starting five is light on ball handling, about ${pts1(s.pts)} points per game.` });
    });
    list.filter(c => !holes.includes(c) && c.pts <= -0.5 && c.pts > -0.9 && out.length < 3).forEach(c => out.push({ kind: 'warn', text: `${c.name} is a soft spot, ${pts1(c.pts)} points per game below a typical draft.` }));
    list.filter(c => c.pts >= 1.2).sort((a, b) => b.pts - a.pts).slice(0, 2).forEach(c => out.push({ kind: 'good', text: `${c.name} is a strength: +${f1(c.pts)} points per game over a typical draft${c.leader ? ', led by ' + c.leader : ''}.` }));
    if (!out.length) out.push({ kind: 'good', text: 'No weak spot. The roster covers scoring, passing, size, defense and shooting.' });
    const tp = ENG && ENG.traitOf ? ps.filter(p => ENG.traitOf(p)) : [];
    if (tp.length) out.push({ kind: 'good', text: 'Trait stars: ' + tp.map(p => `${p.name} (${ENG.TRAITS[ENG.traitOf(p).k].name})`).join(', ') + '. They change games beyond what their ratings show.' });
    return out.slice(0, 5);
  }

  // How much would adding `p` lift the team's weakest category, in points per game?
  function lift(players, p, pool, key, catKey) {
    if (!CORE || !ENG || players.length < 2) return 0;
    const c = CATS.find(x => x.k === catKey), H = helpers();
    return PPG_PER_RATING * (teamVal(q => c.val(q, H), players.concat([p])) - teamVal(q => c.val(q, H), players));
  }
  // ---- Tactic fit ----
  // Which tactics suit this roster. Fitted on ~140 simulated rosters x every tactic (500 games each, points per game against
  // league opponents, minute-weighted roster features); the cross-validated policy "use the best predicted tactic when it
  // is worth at least 0.8 pts/g" gained about +0.8 pts/g on offense and +0.5 on defense. Tempo and Isolation show no stable
  // roster dependence, so they get no verdict.
  const FIT = {
    inside:   { g: 'off', b: -4.56, c: { rim: 4.81, spc: -0.63, usg: -0.14 } },
    threes:   { g: 'off', b: -0.51, c: { spc: 0.67, p3: 49.78, ast: -0.30 } },
    ballmove: { g: 'off', b: -4.69, c: { ast: 4.21, usg: -0.18 } },
    zone:     { g: 'def', b: -3.63, c: { blk: 2.18, spc: -0.05, rim: 0.94 } },
    press:    { g: 'def', b: -9.75, c: { stl: 8.25, endur: -0.93, drb: 1.23 } }
  };
  const FIT_WHY = {
    inside:   ['Strong rebounders and shot blockers anchor the paint.', 'Too little rim presence to play through the post.'],
    threes:   ['Real three-point shooters on the floor.', 'Too few true shooters for a volume of threes.'],
    ballmove: ['Good passers: the ball finds the open man.', 'Not enough passers to move the ball.'],
    zone:     ['Shot blockers make the paint hard to score in.', 'Too few shot blockers to hold a zone.'],
    press:    ['Active hands: your defenders force steals.', 'Few ball hawks, so the press just tires you out.']
  };
  const FIT_MIN = 0.8, FIT_BAD = -1.0;
  function rosterFeatures(players, plan) {
    const mins = plan && plan.mins && plan.mins.length === players.length ? plan.mins : players.map(() => 24);
    const tw = mins.reduce((a, b) => a + b, 0) || 1;
    const avg = f => players.reduce((a, p, i) => a + N(f(p)) * mins[i], 0) / tw;
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    const orb = avg(p => p.orb), blk = avg(p => p.blk);
    return {
      rim: (orb + blk) / 2, blk, ast: avg(p => p.ast), usg: avg(p => p.usg), stl: avg(p => p.stl), drb: avg(p => p.drb), endur: avg(p => p.endur),
      p3: avg(p => p.p3), spc: avg(p => clamp((N(p.r3) - 0.14) / 0.18, 0, 1) * clamp(0.5 + (N(p.p3) + 0.03) * 12, 0.3, 1.2)) * 5
    };
  }
  // Returns { fit: {tactic: {gain, rec, weak, why}}, best: {off, def} }; null until the roster is complete.
  function tacticFit(players, plan) {
    if (!players || players.length < 10) return null;
    const f = rosterFeatures(players, plan), fit = {}, best = { off: null, def: null }, top = { off: FIT_MIN, def: FIT_MIN };
    for (const k in FIT) {
      const m = FIT[k]; let g = m.b; for (const x in m.c) g += m.c[x] * f[x];
      fit[k] = { gain: g, rec: false, weak: g <= FIT_BAD, why: FIT_WHY[k][g <= FIT_BAD ? 1 : 0] };
      if (g >= top[m.g]) { top[m.g] = g; best[m.g] = k; }
    }
    for (const g of ['off', 'def']) if (best[g]) fit[best[g]].rec = true;
    return { fit, best };
  }

  return { CATS, analyze, lift, tier, tacticFit, setCore: (c, e) => { CORE = c; ENG = e; } };
});
