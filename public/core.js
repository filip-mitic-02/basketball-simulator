/* Core: everything that decides a result, shared by the browser and the server.
   The server replays a finished season from (draft picks, season seed, decision log) and trusts nothing else.
   Depends on Engine and League. UMD: window.Core in the browser, CommonJS on the server. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./engine.js'), require('./league.js'));
  else root.Core = factory(root.Engine, root.League);
})(typeof self !== 'undefined' ? self : this, function (E, LG) {
  'use strict';

  // Bump whenever engine.js, league.js, core.js or data.json change in a way that can alter a result.
  // tests/sim-lock.test.js fails if the files change without a bump.
  const VERSION = 'sim-2026-11-26.3';
  const DRAFT_ROUNDS = 10, MAX_SKIPS = 2, MIN_Y = 1950, MAX_Y = 2026, MIN_POOL = 60;
  const PLAN_AUTO = ['auto', 'forced', 'manual'];

  // ---------- data ----------
  // Production bonus on top of the game-score rating: points + rebounds + assists + stocks relative to the season,
  // and averaging a triple-double. Applied once at load, in place.
  function prepData(D) {
    if (D._prep) return D;
    D._prep = true;
    const F = D.fields, ix = {}; F.forEach((f, i) => { ix[f] = i; });
    const pr = r => (r[ix.ppg] || 0) + 1.2 * (r[ix.rpg] || 0) + 1.6 * (r[ix.apg] || 0) + 2.2 * (r[ix.spg] || 0) + 2.0 * (r[ix.bpg] || 0);
    const by = {};
    D.teams.forEach(t => t[4].forEach(r => { if (r[ix.mpg] >= 20 && r[ix.g] >= 40) { const o = by[t[1]] || (by[t[1]] = { n: 0, s: 0, q: 0 }), v = pr(r); o.n++; o.s += v; o.q += v * v; } }));
    D.teams.forEach(t => {
      const o = by[t[1]], mu = o ? o.s / o.n : 0, sd = o && o.n > 2 ? Math.sqrt(Math.max(1e-6, (o.q - o.n * mu * mu) / (o.n - 1))) : 1;
      t[4].forEach(r => {
        let b = 0;
        if (r[ix.mpg] >= 20 && r[ix.g] >= 40) b += 2.0 * Math.max(0, (pr(r) - mu) / sd - 2.0);
        if (r[ix.ppg] >= 10 && r[ix.rpg] >= 10 && r[ix.apg] >= 10) b += 3;
        r[ix.ovr] = Math.round(r[ix.ovr] + b / 0.62);
      });
    });
    return D;
  }
  function mkTeams(D) { prepData(D); return D.teams.map(r => E.mkTeam(r, D.fields)); }
  const poolOf = (teams, from, to) => teams.filter(t => t.season >= from && t.season <= to);
  const validEra = (from, to) => Number.isInteger(from) && Number.isInteger(to) && from >= MIN_Y && to <= MAX_Y && to - from >= 3;

  // ---------- draft ----------
  function fitPositions(picks, p) {
    const orig = E.eligible(p).slice(), out = [];
    for (const pos of orig) { p._el = [pos]; if (E.canAdd(picks, p)) out.push(pos); }
    p._el = orig; return out;
  }
  function pickable(picks, t) { const have = new Set(picks.map(p => p.name)); return t.players.filter(p => !have.has(p.name) && E.canAdd(picks, p)); }
  // rnd(n) must return an integer in [0, n). On the server it is backed by HMAC, in guest mode by Math.random.
  function rollTeam(pool, picks, rnd) {
    for (let i = 0; i < 120; i++) { const t = pool[rnd(pool.length)]; if (pickable(picks, t).length >= 3) return t; }
    for (let i = 0; i < 400; i++) { const t = pool[rnd(pool.length)]; if (pickable(picks, t).length >= 1) return t; }
    return pool[rnd(pool.length)];
  }
  // Returns the pick object for roster slot `pi` of team `t` placed at `pos` (optional), or null if it is not allowed.
  function makePick(picks, t, pi, pos) {
    const p = t.players[pi];
    if (!p || picks.length >= DRAFT_ROUNDS) return null;
    if (picks.some(x => x.name === p.name) || !E.canAdd(picks, p)) return null;
    const fp = fitPositions(picks, p);
    const np = Object.assign({}, p, { fromLabel: t.label, fromSeason: t.season, fromTm: t.tm });
    if (pos != null) {
      if (!fp.includes(pos)) return null;
      np._el = [pos];
      if (!E.canAdd(picks, np)) delete np._el;
    }
    return np;
  }

  // ---------- season ----------
  const cloneJ = x => JSON.parse(JSON.stringify(x));
  const planOf = p => ({ starters: p.starters.slice(), mins: p.mins.slice(), tempo: p.tempo, off: p.off, def: p.def, auto: p.auto });
  const isIdx = (v, n) => Number.isInteger(v) && v >= 0 && v < n;
  function validPlan(pl, n, R) {
    R = R || E.RULES.nba;
    if (!pl || typeof pl !== 'object') return false;
    if (!Array.isArray(pl.starters) || pl.starters.length !== 5 || new Set(pl.starters).size !== 5 || !pl.starters.every(i => isIdx(i, n))) return false;
    if (!Array.isArray(pl.mins) || pl.mins.length !== n || !pl.mins.every(m => Number.isInteger(m) && m >= 0 && m <= R.maxMin)) return false;
    return Object.prototype.hasOwnProperty.call(E.TEMPO, pl.tempo) && E.OFFENSE.includes(pl.off) && E.DEFENSE.includes(pl.def) && PLAN_AUTO.includes(pl.auto);
  }

  // A season in progress. `picks` are the ten pick objects in draft order, `seed` an unsigned 32-bit integer.
  // Every action that can change a result goes through this object and is appended to `log`.
  function createSeason(o) {
    const user = E.userTeam(o.picks.slice(), o.name);
    const R = E.RULES[o.comp || 'nba'] || E.RULES.nba;
    const plan = E.defaultPlan(user, R);
    const L = LG.create(user, o.pool, { rng: E.mulberry32(o.seed >>> 0), seed: o.seed >>> 0, rules: R });
    L.userPlan = plan; L.plans[0] = plan;
    return { L, user, plan, R, comp: R.id, seed: o.seed >>> 0, pool: o.pool, hard: !!o.hard, log: [], planJ: JSON.stringify(planOf(plan)), cur: null };
  }
  const pushCmd = (SE, kind) => {
    const last = SE.log[SE.log.length - 1];
    if ((kind === 'q' || kind === 'qp') && last && last[0] === kind) last[1]++; else SE.log.push(kind === 'q' || kind === 'qp' ? [kind, 1] : [kind]);
  };
  function syncPlan(SE) {   // between games: record the plan if it changed
    const j = JSON.stringify(planOf(SE.plan));
    if (j !== SE.planJ) { SE.planJ = j; SE.log.push(['P', planOf(SE.plan)]); }
  }
  function quick(SE) { syncPlan(SE); const r = LG.quickUserGame(SE.L); pushCmd(SE, 'q'); return r; }
  function quickPo(SE) { syncPlan(SE); const r = LG.quickPlayoffGame(SE.L); pushCmd(SE, 'qp'); return r; }
  function startPlayoffs(SE) { LG.startPlayoffs(SE.L); pushCmd(SE, 'sp'); }
  function beginLive(SE, playoff) {
    syncPlan(SE);
    const G = playoff ? LG.startPlayoffGame(SE.L) : LG.startUserGame(SE.L);
    G.np = 0; G.coachOpen = true; moInit(G);
    SE.cur = { playoff: !!playoff, ops: [] };
    return G;
  }
  function midPlan(SE, G) {
    const j = JSON.stringify(planOf(SE.plan));
    if (j !== SE.planJ) { SE.planJ = j; SE.cur.ops.push([G.np | 0, 'P', planOf(SE.plan)]); }
  }
  function step(SE, G) {
    midPlan(SE, G);
    skipMoment(G);
    const q = G.q;
    E.step(G);
    G.coachOpen = !G.over && G.q !== q;
    afterStep(G);
  }
  function lineup(SE, G, five) {
    if (!G.coachOpen || G.over) return false;
    midPlan(SE, G);
    if (!E.setLineup(G, G.userSide, five)) return false;
    SE.cur.ops.push([G.np | 0, 'L', five.slice()]); return true;
  }
  function timeout(SE, G) {
    if (G.over) return false;
    midPlan(SE, G);
    if (!E.callTimeout(G, G.userSide)) return false;
    G.coachOpen = true; SE.cur.ops.push([G.np | 0, 'T']); return true;
  }
  function feed(SE, G, i) { if (!G.coachOpen || G.over) return false; midPlan(SE, G); E.feedPlayer(G, G.userSide, i, 8); SE.cur.ops.push([G.np | 0, 'F', i]); return true; }
  function double(SE, G, i) { if (!G.coachOpen || G.over) return false; midPlan(SE, G); E.doubleTeam(G, G.userSide, i, 8); SE.cur.ops.push([G.np | 0, 'D', i]); return true; }
  function finishLive(SE, G) {
    const r = G.playoff ? LG.finishPlayoffGame(SE.L, G) : LG.finishUserGame(SE.L, G);
    SE.log.push([G.playoff ? 'lp' : 'lg', SE.cur.ops]); SE.cur = null;
    return r;
  }


  // ---------- trades ----------
  // Before the deadline you may swap one player for one of three offers of similar quality. Offers are a pure function of the season seed,
  // the number of trades already made and the player you give, so the server regenerates the same three and checks the pick.
  const TRADE = { max: 2, lastGame: 55, win: [4, 6, 9], offers: 3, minMpg: 18 };
  function tradeState(SE) {
    const L = SE.L, used = L.trades.length;
    const last = Math.round(TRADE.lastGame * L.R.games / 82);
    return { open: L.phase === 'season' && !SE.cur && L.userGames.length <= last && used < TRADE.max, left: TRADE.max - used, lastGame: last, played: L.userGames.length };
  }
  function tradeOffers(SE, give) {
    const P = SE.user.players;
    if (!isIdx(give, P.length)) return [];
    const out = P[give], rest = P.filter((_, i) => i !== give), have = new Set(P.map(p => p.name));
    let cands = [];
    for (const w of TRADE.win) {
      cands = []; const seen = new Set();
      for (const t of SE.pool) for (const p of t.players) {
        if (have.has(p.name) || seen.has(p.name) || p.mpg < TRADE.minMpg || Math.abs(p.ovr - out.ovr) > w) continue;
        const np = Object.assign({}, p, { fromLabel: t.label, fromSeason: t.season, fromTm: t.tm });
        if (!E.canAdd(rest, np)) continue;
        seen.add(p.name); cands.push(np);
      }
      if (cands.length >= 12) break;
    }
    const rng = E.mulberry32((SE.seed ^ Math.imul(SE.L.trades.length + 1, 0x9e3779b1) ^ Math.imul(give + 7, 0x85ebca6b)) >>> 0), res = [];
    while (res.length < TRADE.offers && cands.length) res.push(cands.splice(Math.floor(rng() * cands.length), 1)[0]);
    return res;
  }
  function doTrade(SE, give, idx) {
    if (!tradeState(SE).open) return false;
    const offs = tradeOffers(SE, give), np = offs[idx];
    if (!np) return false;
    const U = SE.user, L = SE.L, old = U.players[give];
    U.players[give] = np;
    const as = E.assign(U.players);
    if (!as) { U.players[give] = old; return false; }
    U.players.forEach((p, i) => { p.slot = as[i]; p.guard = as[i] === 'PG' || as[i] === 'SG'; p.big = as[i] === 'PF' || as[i] === 'C'; });
    L.tradedAway.push({ name: old.name, agg: L.agg[give] });
    L.agg[give] = { g: 0, sec: 0, pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, tov: 0, fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0, pf: 0 };
    L.trades.push({ day: L.userGames.length, out: old.name, in: np.name });
    SE.log.push(['tr', give, idx]);
    return true;
  }

  // ---------- interactive moments ----------
  // While the user coaches a game live, play pauses at a few moments and offers a choice. Everything here is a pure function of the game
  // state (no random numbers), so the server reaches the same moment and checks the same answer. An unanswered moment resolves as "auto",
  // which changes nothing. The best answer is worth about half a point per moment; a guess is worth nothing on average.
  const MO = { max: 6, gap: 8, halfAt: 360, crunchAt: 120, crunchMargin: 6, runWin: 300, runLead: 10, dry: 240, boostN: 10, hotWin: 300, hotPts: 12, softMax: 4, duel: 0.06, call: 0.09, callMax: 0.14, safe: 0.025 };
  const STATS = [['ppg', 'Scoring', 'PPG', p => p.ppg], ['apg', 'Playmaking', 'APG', p => p.apg], ['rpg', 'Rebounding', 'RPG', p => p.rpg], ['stk', 'Defense', 'STL + BLK', p => (p.spg || 0) + (p.bpg || 0)]];
  const mean = a => a.reduce((x, y) => x + y, 0) / a.length;
  const clampN = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  function moInit(G) { G.mo = { fseen: {}, hseen: {}, ph: [], pending: null, n: 0, h1: false, h2: false, crunch: false, ot: {}, last: -99, hist: [], lastScore: 0, lastRun: -99, lastDry: -99, log: [] }; }
  const oncourt = (G, t) => G.on[t].map(i => [i, G.teams[t].players[i]]);
  const best = (list, f) => list.reduce((b, x) => (b == null || f(x[1]) > f(b[1]) ? x : b), null);
  function afterStep(G) {
    const m = G.mo || (moInit(G), G.mo), u = G.userSide, o = 1 - u, el = G.elapsed;
    m.hist.push([el, G.score[u], G.score[o]]);
    if (!m.ph.length || el - m.ph[m.ph.length - 1][0] >= 30) m.ph.push([el, G.st[u].map(x => x.pts)]);
    while (m.ph.length > 1 && m.ph[0][0] < el - MO.hotWin - 40) m.ph.shift();
    while (m.hist.length > 2 && m.hist[0][0] < el - MO.runWin - 60) m.hist.shift();
    const pu = m.prevScore == null ? 0 : m.prevScore, po = m.prevO == null ? 0 : m.prevO;
    if (G.score[u] !== pu) { m.lastScore = el; m.opRun = 0; }
    m.opRun = (m.opRun || 0) + (G.score[o] - po);
    m.prevScore = G.score[u]; m.prevO = G.score[o];
    if (m.pending || G.over || m.n >= MO.max) return;
    const gp = G.np - m.last;
    if (G.q >= 3) m.h1 = true;
    const diff = G.score[u] - G.score[o];
    let type = null;
    if (G.q > 4 && !m.ot[G.q]) { m.ot[G.q] = 1; type = ['call', 'ot']; }
    else if (gp < 4) return;
    else if (G.q === 4 && !m.crunch && G.clock <= MO.crunchAt && Math.abs(diff) <= MO.crunchMargin) { m.crunch = true; type = ['call', 'late']; }
    else {
      const w = m.hist.find(h => h[0] >= el - MO.runWin);
      if (G.np - m.lastRun > 20 && (m.opRun >= MO.runLead || (w && (G.score[o] - w[2]) >= MO.runLead && (G.score[o] - w[2]) - (G.score[u] - w[1]) >= MO.runLead))) { m.lastRun = G.np; m.opRun = 0; type = ['call', 'run']; }
      else if (gp < MO.gap) return;
      else if (el > MO.dry && el - m.lastScore >= MO.dry && G.np - m.lastDry > 20) { m.lastDry = G.np; type = ['call', 'dry']; }
      else if (m.n < MO.softMax && G.q <= 3 && (m.fi = foulTrouble(G)) != null) { type = ['call', 'foul']; m.fseen[m.fi] = 1; }
      else if (m.n < MO.softMax && (m.hi = hotHand(G)) != null) { type = ['call', 'hot']; m.hseen[m.hi] = 1; }
      else if (!m.h1 && G.q === 2 && G.clock <= MO.halfAt) { m.h1 = true; type = ['duel', 'attack']; }
      else if (!m.h2 && G.q === 3 && G.clock <= MO.halfAt) { m.h2 = true; type = ['duel', 'defend']; }
    }
    if (!type) return;
    m.n++; m.last = G.np;
    m.pending = type[0] === 'duel' ? buildDuel(G, type[1]) : buildCall(G, type[1]);
    if (type[1] === 'foul') m.pending.player = m.fi; else if (type[1] === 'hot') { m.pending.player = m.hi; m.pending.pts = m.hotPts; }
    m.pending.at = G.np;
  }
  const foulThr = G => [0, G.R.fo - 3, G.R.fo - 2, G.R.fo - 2];
  // A starter in foul trouble: three fouls in the first quarter, four before the half and in the third (one fewer with five-foul rules).
  function foulTrouble(G) {
    const u = G.userSide, m = G.mo, thr = foulThr(G)[G.q];
    if (!thr) return null;
    let pick = null;
    const third = G.teams[u].players.map(p => p.ovr).sort((a, b) => b - a)[2];
    for (const i of G.on[u]) { const f = G.st[u][i].pf; if (G.teams[u].players[i].ovr < third) continue; if (f >= thr && f < G.R.fo - 1 && !m.fseen[i] && !(G.out && G.out[u][i]) && (pick == null || G.teams[u].players[i].ovr > G.teams[u].players[pick].ovr)) pick = i; }
    return pick;
  }
  // A player who has scored a lot lately (the threshold scales with how much the league scores).
  function hotHand(G) {
    const u = G.userSide, m = G.mo, need = Math.round(MO.hotPts * G.R.avgPts / 112), base = m.ph[0];
    if (!base || G.elapsed < 240 || G.elapsed - base[0] < 150) return null;
    let pick = null, bp = 0;
    for (const i of G.on[u]) { const d = G.st[u][i].pts - (base[1][i] || 0); if (d >= need && !m.hseen[i] && d > bp) { pick = i; bp = d; } }
    m.hotPts = bp;
    return pick;
  }
  const defScoreOf = p => p.stl + p.blk + p.drb;
  function buildDuel(G, mode) {
    const u = G.userSide, o = 1 - u, mine = oncourt(G, u), theirs = oncourt(G, o);
    const a = mode === 'attack' ? best(mine, p => p.usg * p.ovr) : best(mine, p => defScoreOf(p) * p.ovr);
    const b = mode === 'attack' ? best(theirs, p => defScoreOf(p) * p.ovr) : best(theirs, p => p.usg * p.ovr);
    return { type: 'duel', mode, mine: a[0], theirs: b[0], opts: STATS.map(x => ({ id: x[0], label: x[1], unit: x[2] })) };
  }
  // fit of the five on the floor for each way to play the moment (z-like scores around a typical strong lineup)
  function offenseFit(G) {
    const u = G.userSide, A = E.agg(G, u), L = oncourt(G, u).map(x => x[1]);
    const star = Math.max(...L.map(p => p.ovr)), ftr = mean(L.map(p => p.ftr));
    return { iso: (star - 90) / 6, pnr: (A.ast - 1.45) / 0.25, three: (A.spc - 1.6) / 0.8, foul: (ftr - 1.4) / 0.3 };
  }
  function buildCall(G, kind) {
    const u = G.userSide, L = oncourt(G, u);
    const top = (f, n) => L.slice().sort((a, b) => f(b[1]) - f(a[1])).slice(0, n).map(x => x[0]);
    if (kind === 'run') {
      return { type: 'call', kind, opts: [{ id: 'timeout', label: 'Timeout and reset', off: G.to[u] <= 0 }, { id: 'press', label: 'Full-court press', who: top(p => p.stl, 2) },
        { id: 'zone', label: 'Pack the paint (zone)', who: top(p => p.blk, 2) }, { id: 'double', label: 'Double their star', who: [] }] };
    }
    if (kind === 'hot') {
      return { type: 'call', kind, opts: [{ id: 'hfeed', label: 'Keep feeding him', who: [] }, { id: 'hspread', label: 'Spread the ball', who: [] }, { id: 'hrest', label: 'Timeout: calm things down', off: G.to[u] <= 0 }] };
    }
    if (kind === 'foul') {
      return { type: 'call', kind, opts: [{ id: 'fsit', label: 'Sit him until the next quarter', who: [] }, { id: 'fshort', label: 'Short rest, four minutes', who: [] }, { id: 'fride', label: 'Ride with him', who: [] }] };
    }
    return { type: 'call', kind, opts: [{ id: 'iso', label: 'Feed the star', who: top(p => p.ovr, 1) }, { id: 'pnr', label: 'Pick and roll', who: top(p => p.ast, 2) },
      { id: 'three', label: 'Spot-up threes', who: top(p => p.p3 + 0.3 * p.r3, 2) }, { id: 'foul', label: 'Attack and draw fouls', who: top(p => p.ftr, 2) }] };
  }
  function applyMoment(G, idx) {
    const m = G.mo, pd = m && m.pending, u = G.userSide, o = 1 - u;
    if (!pd || !Number.isInteger(idx) || idx < 0 || idx >= pd.opts.length) return false;
    const opt = pd.opts[idx];
    if (opt.off) return false;
    let res = null;
    if (pd.type === 'duel') {
      const st = STATS[idx], a = G.teams[u].players[pd.mine], b = G.teams[o].players[pd.theirs];
      const x = st[3](a) || 0, y = st[3](b) || 0, sgn = x > y ? 1 : x < y ? -1 : 0;
      if (sgn) { if (pd.mode === 'attack') E.boost(G, u, sgn * MO.duel, 0, MO.boostN); else E.boost(G, u, 0, sgn * MO.duel, MO.boostN); }
      res = { win: sgn, mine: x, theirs: y };
    } else if (pd.kind === 'run') {
      const A = E.agg(G, u);
      if (opt.id === 'timeout') { E.callTimeout(G, u); G.coachOpen = true; E.boost(G, u, 0, MO.safe, MO.boostN); }
      else if (opt.id === 'double') { const t = best(oncourt(G, o), p => p.usg * p.ovr); E.doubleTeam(G, u, t[0], 8); }
      else { const z = opt.id === 'press' ? (A.stl - 1.13) / 0.25 : (A.blk - 1.33) / 0.5; E.boost(G, u, 0, clampN(MO.call * z, -MO.callMax, MO.callMax), MO.boostN); }
      res = {};
    } else if (pd.kind === 'hot' || pd.kind === 'foul') {
      const i = pd.player, p = G.teams[u].players[i], en = G.en[u][i], b0 = G.elapsed;
      let f, ks;
      if (pd.kind === 'hot') {
        const A = E.agg(G, u), feed = (p.ovr - 70) / 10 + (en - 60) / 25;
        f = { hfeed: feed, hspread: 0.8 - 0.6 * feed + 0.3 * (A.ast - 1.45) / 0.25, hrest: (65 - en) / 12 };
      } else {
        const bench = G.teams[u].players.filter((q, j) => G.on[u].indexOf(j) < 0 && G.st[u][j].pf < G.R.fo && !(G.out && G.out[u][j])).reduce((a, q) => Math.max(a, q.ovr), 0);
        const st = clampN((p.ovr - bench) / 12, -1, 2), ex = G.st[u][i].pf - foulThr(G)[Math.min(G.q, 3)] + 1;
        f = { fride: 1.2 * st - 0.9 * ex + 0.6, fshort: 0.4 - 0.4 * Math.abs(st - 0.5 * ex), fsit: -0.9 * st + 0.7 * ex - 0.2 };
      }
      ks = Object.keys(f);
      const b = clampN(MO.call * (f[opt.id] - mean(ks.map(k => f[k]))), -MO.callMax, MO.callMax);
      if (opt.id === 'hfeed') E.feedPlayer(G, u, i, 8);
      else if (opt.id === 'hrest') { E.callTimeout(G, u); G.coachOpen = true; }
      else if (opt.id === 'fsit') E.holdPlayer(G, u, i, 'sit', Math.min(4, G.q) * G.R.q);
      else if (opt.id === 'fshort') E.holdPlayer(G, u, i, 'sit', b0 + 240);
      else if (opt.id === 'fride') E.holdPlayer(G, u, i, 'ride', Math.min(4, G.q + 1) * G.R.q);
      E.boost(G, u, b, 0, MO.boostN); res = { b };
    } else {
      const f = offenseFit(G), ks = Object.keys(f), mu = mean(ks.map(k => f[k]));
      const b = clampN(MO.call * (f[opt.id] - mu), -MO.callMax, MO.callMax);
      E.boost(G, u, b, 0, MO.boostN); res = { b };
    }
    m.log.push([pd.at, idx]); m.res = { type: pd.type, idx, res, mode: pd.mode, kind: pd.kind };
    m.pending = null;
    return true;
  }
  const answerMoment = (SE, G, idx) => {
    if (!applyMoment(G, idx)) return false;
    SE.cur.ops.push([G.np | 0, 'M', idx]); return true;
  };
  const skipMoment = G => { if (G.mo) G.mo.pending = null; };

  // ---------- replay (server) ----------
  class Invalid extends Error { }
  const bad = m => { throw new Invalid(m); };
  const TERMINAL = ['eliminated', 'champion', 'done'];
  function replay(o, log) {
    if (!Array.isArray(log) || log.length > 5000) bad('log');
    const SE = createSeason(o), L = SE.L, nUser = SE.user.players.length;
    let games = 0, ops = 0;
    const setPlan = pl => {
      if (!validPlan(pl, nUser, L.R)) bad('plan');
      SE.plan.starters = pl.starters.slice(); SE.plan.mins = pl.mins.slice();
      SE.plan.tempo = pl.tempo; SE.plan.off = pl.off; SE.plan.def = pl.def; SE.plan.auto = pl.auto;
    };
    for (const c of log) {
      if (!Array.isArray(c) || typeof c[0] !== 'string') bad('cmd');
      switch (c[0]) {
        case 'P': setPlan(c[1]); break;
        case 'q': case 'qp': {
          const n = c[1]; if (!Number.isInteger(n) || n < 1 || n > 120) bad('count');
          for (let k = 0; k < n; k++) {
            if (L.phase !== (c[0] === 'q' ? 'season' : 'playoffs')) bad('phase');
            if (c[0] === 'q') LG.quickUserGame(L); else LG.quickPlayoffGame(L);
            games++;
          }
          break;
        }
        case 'tr': if (!Number.isInteger(c[1]) || !Number.isInteger(c[2]) || !doTrade(SE, c[1], c[2])) bad('trade'); break;
        case 'sp': if (L.phase !== 'seasonDone') bad('phase'); LG.startPlayoffs(L); break;
        case 'lg': case 'lp': {
          const po = c[0] === 'lp';
          if (L.phase !== (po ? 'playoffs' : 'season')) bad('phase');
          const list = c[1]; if (!Array.isArray(list) || list.length > 400) bad('ops');
          const G = po ? LG.startPlayoffGame(L) : LG.startUserGame(L);
          G.fast = true; G.np = 0; G.coachOpen = true; moInit(G);
          let k = 0;
          const side = G.userSide, opp = G.teams[1 - side].players.length;
          for (;;) {
            while (k < list.length && Array.isArray(list[k]) && list[k][0] === (G.np | 0)) {
              const [, kind, a] = list[k++]; ops++;
              if (G.over) bad('op after end');
              if (kind === 'P') { if (!G.coachOpen) bad('closed'); setPlan(a); }
              else if (kind === 'L') {
                if (!G.coachOpen) bad('closed');
                if (!Array.isArray(a) || a.length !== 5 || !a.every(i => isIdx(i, nUser)) || !E.setLineup(G, side, a.slice())) bad('lineup');
              } else if (kind === 'T') { if (!E.callTimeout(G, side)) bad('timeout'); G.coachOpen = true; }
              else if (kind === 'F') { if (!G.coachOpen || !isIdx(a, nUser)) bad('feed'); E.feedPlayer(G, side, a, 8); }
              else if (kind === 'D') { if (!G.coachOpen || !isIdx(a, opp)) bad('double'); E.doubleTeam(G, side, a, 8); }
              else if (kind === 'M') { if (!applyMoment(G, a)) bad('moment'); }
              else bad('op');
            }
            if (G.over) break;
            skipMoment(G);
            const q = G.q; E.step(G); G.coachOpen = !G.over && G.q !== q;
            afterStep(G);
            if (G.np > 2500) bad('runaway');
          }
          if (k !== list.length) bad('unused ops');
          if (po) LG.finishPlayoffGame(L, G); else LG.finishUserGame(L, G);
          games++;
          break;
        }
        default: bad('cmd');
      }
    }
    if (!TERMINAL.includes(L.phase)) bad('unfinished');
    return SE;
  }

  // ---------- results ----------
  const poWins = L => (L.poGames || []).filter(g => g.win).length;
  const poLosses = L => (L.poGames || []).filter(g => !g.win).length;
  function resultLabel(L) { return L.phase === 'champion' ? 'Champion' : !L.userInPlayoffs ? 'Missed playoffs' : 'Eliminated: ' + LG.roundName(L.po.elimRound != null ? L.po.elimRound : L.po.round, L.R); }
  function calcScore(L, hard) {
    const w = L.rec[0].w, R = L.R;
    return Math.round((w * R.winPts + poWins(L) * R.poPts + (L.phase === 'champion' ? 300 : 0) + (w === R.games ? 1000 : 0)) * (hard ? 1.5 : 1));
  }
  function achievements(L, hard) {
    const a = [], w = L.rec[0].w, champ = L.phase === 'champion', poL = poLosses(L), R = L.R, N = R.games, pw = poWins(L);
    const k = N / 82, big = Math.round(70 * k), s1 = Math.round(40 * k), s2 = Math.round(25 * k);
    if (w === N) a.push(['Undefeated', 'A perfect ' + N + '-0 regular season.']);
    if (w === N && champ && poL === 0) a.push(['Perfect year', N + '-0 and ' + pw + '-0 in the playoffs. No loss all year.']);
    if (champ) a.push(['Champion', 'Won the title.']);
    if (champ && hard) a.push(['Blind champion', 'Won the title after a Hard mode draft.']);
    if (w >= big) a.push([big + ' wins', 'A season of ' + big + ' or more wins.']);
    if (L.longestW >= s1) a.push(['Streak of ' + s1, 'At least ' + s1 + ' wins in a row.']); else if (L.longestW >= s2) a.push(['Streak of ' + s2, 'At least ' + s2 + ' wins in a row.']);
    if (champ && poL <= 3 && R.id === 'nba') a.push(['Clean sweep run', 'Won the title with 3 or fewer playoff losses.']);
    const mine = ((L.awards && L.awards.mine) || []).concat((L.poAwards && L.poAwards.mine) || []);
    mine.forEach(s => { const i = s.indexOf(': '); a.push(i > 0 ? [s.slice(0, i), s.slice(i + 2) + ' earned this honor.'] : [s, 'One of your players or you won this award.']); });
    return a;
  }
  function summarize(SE) {
    const L = SE.L;
    if (!L.awards) LG.computeAwards(L);
    if (L.po && L.po.champ != null && !L.poAwards) LG.poAwards(L);
    const r = L.rec[0];
    return {
      w: r.w, l: r.l, poW: poWins(L), champ: L.phase === 'champion', res: resultLabel(L), score: calcScore(L, SE.hard), hard: SE.hard,
      names: SE.user.players.map(p => p.name), ach: achievements(L, SE.hard).map(x => x[0])
    };
  }

  return {
    VERSION, DRAFT_ROUNDS, MAX_SKIPS, MIN_Y, MAX_Y, MIN_POOL, Invalid,
    prepData, mkTeams, poolOf, validEra, fitPositions, pickable, rollTeam, makePick,
    createSeason, tradeState, tradeOffers, doTrade, TRADE, validPlan, planOf, syncPlan, answerMoment, skipMoment, MO, STATS, offenseFit, quick, quickPo, startPlayoffs, beginLive, step, lineup, timeout, feed, double, finishLive,
    replay, resultLabel, calcScore, achievements, summarize, poWins, poLosses
  };
});
