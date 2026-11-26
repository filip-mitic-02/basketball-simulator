/* League: a season (82 games, 30 teams, best-of-7 playoffs for the NBA; 38 games, 20 teams, best-of-5 and a Final Four for the EuroLeague). Depends on Engine. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./engine.js'));
  else root.League = factory(root.Engine);
})(typeof self !== 'undefined' ? self : this, function (E) {
  'use strict';

  function shuffle(a, r) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

  function roundRobin(n, r) {                // n paran; vraća n-1 kola, svako n/2 parova
    const ids = shuffle([...Array(n).keys()], r), rounds = [];
    for (let k = 0; k < n - 1; k++) {
      const pr = [];
      for (let i = 0; i < n / 2; i++) pr.push([ids[i], ids[n - 1 - i]]);
      rounds.push(pr);
      ids.splice(1, 0, ids.pop());
    }
    return rounds;
  }

  function buildSchedule(n, games, r) {
    const out = [];
    let c = 0;
    while (out.length < games) {
      const rr = shuffle(roundRobin(n, r), r);
      rr.forEach((pairs, ri) => {
        if (out.length >= games) return;
        out.push(pairs.map(p => ((ri + c) % 2 === 0 ? [p[0], p[1]] : [p[1], p[0]])));
      });
      c++;
    }
    return out;
  }

  function aiPlan(team, R) {
    const p = E.defaultPlan(team, R);
    const top = team.players.slice(0, 8);
    const r3 = top.reduce((a, x) => a + x.r3, 0) / top.length;
    if (r3 > (R || E.RULES.nba).threes) p.off = 'threes';
    return p;
  }

  // pool: lista timova (Engine.mkTeam) iz izabranog perioda; user: tim korisnika
  // How much stronger or weaker than their real selves the opposing teams are. The widening is what gives the league a top and a bottom.
  const cfg = { stretch: 1.55 };
  function create(user, pool, opts) {
    opts = opts || {};
    const r = opts.rng || Math.random;
    const R = opts.rules || E.RULES.nba;
    const nOpp = R.teams - 1;
    // protivnici: nasumično, bez ponavljanja istog tima u istoj sezoni
    // protivnici: stratifikovan uzorak po snazi (elitni timovi do osrednjih), pa liga ima realan raspon rekorda
    const ranked = pool.map(t => [t, t._ovr != null ? t._ovr : (t._ovr = E.teamOvr(t))]).sort((a, b) => b[1] - a[1]).map(x => x[0]);
    const start = Math.floor(ranked.length * (opts.q0 != null ? opts.q0 : 0.0)), end = Math.floor(ranked.length * (opts.q1 != null ? opts.q1 : 1.0));
    const span = Math.max(nOpp + 4, end - start);
    const opp = [], seen = new Set(), seenTm = new Set();
    const take = t => { seen.add(t.id); seenTm.add(t.tm); opp.push(t); };
    for (let i = 0; i < nOpp; i++) {
      const lo = start + Math.floor(i * span / nOpp), hi = Math.max(lo + 1, start + Math.floor((i + 1) * span / nOpp));
      for (let tries = 0; tries < 40; tries++) {
        const t = ranked[Math.min(ranked.length - 1, lo + Math.floor(r() * (hi - lo)))];
        if (!seen.has(t.id) && !seenTm.has(t.tm)) { take(t); break; }
      }
    }
    for (const t of shuffle(ranked.slice(), r)) { if (opp.length >= nOpp) break; if (!seen.has(t.id) && !seenTm.has(t.tm)) take(t); }
    for (const t of shuffle(ranked.slice(), r)) { if (opp.length >= nOpp) break; if (!seen.has(t.id)) take(t); }
    const SF = opts.stretch != null ? opts.stretch : R.id === 'nba' ? cfg.stretch : R.stretch;
    const stretched = opp.map(t => Object.assign({}, t, { players: t.players.map(p => { E.traitOf(p); const q = Object.assign({}, p, { ovr: 54 + (p.ovr - 54) * SF, ovr0: p.ovr }); ['p2', 'p3'].forEach(k => { q[k] = p[k] * SF; }); ['ast', 'orb', 'drb', 'stl', 'blk', 'tov', 'ftr', 'pf'].forEach(k => { q[k] = Math.max(0.2, 1 + (p[k] - 1) * SF); }); return q; }) }));
    opp.length = 0; stretched.forEach(t => opp.push(t));
    const teams = [user].concat(opp);
    const n = teams.length;
    const L = {
      r, teams, n, R, plans: teams.map(t => aiPlan(t, R)),
      injR: E.mulberry32(((opts.seed != null ? opts.seed : 1) ^ 0x5bd1e995) >>> 0), inj: null, injNew: null, injLog: [], trades: [], tradedAway: [],
      userPlan: E.defaultPlan(user, R),
      sched: buildSchedule(n, R.games, r),
      day: 0, rec: teams.map(() => ({ w: 0, l: 0, pf: 0, pa: 0 })),
      conf: shuffle(teams.map((_, i) => i % 2), r),
      userGames: [], phase: 'season', po: null, history: [], stats: null,
      seed: opts.seed
    };
    L.plans[0] = L.userPlan;
    // korisnik bira konferenciju nasumično; 15/15
    const idx = shuffle([...Array(n).keys()], r);
    idx.forEach((ti, k) => L.conf[ti] = k < n / 2 ? 0 : 1);
    if (R.po.conf === 1) L.conf = teams.map(() => 0);
    L.streak = 0; L.best = 0; L.unbeaten = true; L.longestW = 0;
    L.ps = teams.map(t => t.players.map(() => blank()));
    L.psPO = {};
    L.agg = [];
    L.agg = user.players.map(() => ({ g: 0, sec: 0, pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, tov: 0, fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0, pf: 0 }));
    return L;
  }

  const FIELDS = ['sec', 'pts', 'reb', 'oreb', 'ast', 'stl', 'blk', 'tov', 'fgm', 'fga', 'tpm', 'tpa', 'ftm', 'fta', 'pf'];
  function blank() { const o = { g: 0 }; FIELDS.forEach(k => o[k] = 0); return o; }
  function accTeam(arr, st) { st.forEach((x, i) => { const a = arr[i]; if (x.sec > 0) a.g++; FIELDS.forEach(k => a[k] += x[k]); }); }
  function accGame(L, h, a, G) { accTeam(L.ps[h], G.st[0]); accTeam(L.ps[a], G.st[1]); }
  function accPO(L, round, h, a, G) {
    if (round < 2) return;
    const B = L.psPO[round] || (L.psPO[round] = {});
    if (!B[h]) B[h] = L.teams[h].players.map(() => blank());
    if (!B[a]) B[a] = L.teams[a].players.map(() => blank());
    accTeam(B[h], G.st[0]); accTeam(B[a], G.st[1]);
  }

  function userGameOfDay(L, day) {
    for (const [h, a] of L.sched[day]) if (h === 0 || a === 0) return { home: h, away: a, opp: h === 0 ? a : h, userHome: h === 0 };
    return null;
  }
  function nextUserGame(L) {
    if (L.day >= L.sched.length) return null;
    const g = userGameOfDay(L, L.day); g.day = L.day; return g;
  }

  function plansFor(L, home, away) { return [L.plans[home], L.plans[away]]; }

  function startUserGame(L, info) {
    info = info || nextUserGame(L);
    const tms = [L.teams[info.home], L.teams[info.away]];
    const G = E.newGame(tms, [L.plans[info.home], L.plans[info.away]], { rng: L.r, rules: L.R });
    G.aiTeam = [info.home !== 0, info.away !== 0];
    G.userSide = info.userHome ? 0 : 1;
    G.info = info;
    if (L.inj) E.markOut(G, G.userSide, [L.inj.i]);
    return G;
  }

  function recordResult(L, h, a, sh, sa) {
    L.rec[h].pf += sh; L.rec[h].pa += sa; L.rec[a].pf += sa; L.rec[a].pa += sh;
    if (sh > sa) { L.rec[h].w++; L.rec[a].l++; } else { L.rec[a].w++; L.rec[h].l++; }
  }

  function simOthers(L, day) {
    for (const [h, a] of L.sched[day]) {
      if (h === 0 || a === 0) continue;
      const G = E.newGame([L.teams[h], L.teams[a]], [L.plans[h], L.plans[a]], { rng: L.r, fast: true, rules: L.R });
      G.aiTeam = [true, true]; E.simGame(G);
      recordResult(L, h, a, G.score[0], G.score[1]);
      accGame(L, h, a, G);
    }
  }

  function accumulate(L, G) {
    const s = G.userSide;
    G.st[s].forEach((x, i) => {
      const a = L.agg[i]; if (x.sec > 0) a.g++;
      const out = G.out && G.out[s][i];
      for (const k of ['sec', 'pts', 'reb', 'ast', 'stl', 'blk', 'tov', 'fgm', 'fga', 'tpm', 'tpa', 'ftm', 'fta', 'pf']) a[k] += out ? 0 : x[k];
    });
    injuryTick(L, G);
  }
  // Injuries: short and rare, at most one player at a time, so the ten-man roster never collapses. The rolls come from their own
  // seeded stream, so they never disturb the game results and the server replay reproduces them exactly.
  const INJ = { rate: 0.055, ratePo: 0.025, d1: 0.55, d2: 0.95 };
  function injuryTick(L, G) {
    const s = G.userSide; L.injNew = null;
    if (L.inj) { L.inj.g--; if (L.inj.g <= 0) L.inj = null; return; }
    if (L.injR() >= (G.playoff ? INJ.ratePo : INJ.rate) * (L.R.id === 'el' ? 1.5 : 1)) return;
    const secs = G.st[s].map(x => x.sec), tot = secs.reduce((a, b) => a + b, 0);
    if (tot <= 0) return;
    let x = L.injR() * tot, i = 0;
    while (i < secs.length - 1 && x >= secs[i]) { x -= secs[i]; i++; }
    const d = L.injR(), g = d < INJ.d1 ? 1 : d < INJ.d2 ? 2 : 3, name = L.teams[0].players[i].name;
    L.inj = { i, g }; L.injNew = { i, g, name };
    L.injLog.push({ day: L.userGames.length, name, g, po: !!G.playoff });
  }

  // završetak utakmice sezone koju je igrao korisnik
  function finishUserGame(L, G) {
    const info = G.info, s = G.userSide, o = 1 - s;
    const us = G.score[s], them = G.score[o];
    recordResult(L, info.home, info.away, G.score[0], G.score[1]);
    accGame(L, info.home, info.away, G);
    simOthers(L, info.day);
    const win = us > them;
    L.userGames.push({ day: info.day, opp: info.opp, home: info.userHome, us, them, win, ot: G.ot });
    if (win) { L.streak++; L.longestW = Math.max(L.longestW, L.streak); } else { L.streak = 0; L.unbeaten = false; }
    accumulate(L, G);
    L.day = info.day + 1;
    if (L.day >= L.sched.length) L.phase = 'seasonDone';
    return { win, us, them };
  }

  function withAutoSubs(L, fn) {
    const saved = L.userPlan.auto;
    if (saved === 'manual') L.userPlan.auto = 'auto';
    try { return fn(); } finally { L.userPlan.auto = saved; }
  }
  function quickUserGame(L) {
    return withAutoSubs(L, () => {
      const G = startUserGame(L);
      G.fast = true; E.simGame(G);
      return finishUserGame(L, G);
    });
  }

  function standings(L) {
    return L.teams.map((t, i) => ({ i, team: t, conf: L.conf[i], w: L.rec[i].w, l: L.rec[i].l, diff: L.rec[i].pf - L.rec[i].pa }))
      .sort((a, b) => b.w - a.w || b.diff - a.diff);
  }

  // ---------- Plej-of ----------
  const HOME_PAT = [1, 1, 0, 0, 1, 0, 1];   // 1 = domaćin je bolje plasirani
  function startPlayoffs(L) {
    const st = standings(L), PO = L.R.po;
    const seeds = [[], []];
    st.forEach(x => seeds[x.conf].push(x.i));
    L.po = { rounds: [], round: 0, seeds, userOut: false, champ: null, finalWinner: null };
    const mk = c => {
      const s = seeds[c].slice(0, PO.seeds);
      return [[s[0], s[7]], [s[3], s[4]], [s[1], s[6]], [s[2], s[5]]];
    };
    const first = (PO.conf === 2 ? mk(0).concat(mk(1)) : mk(0)).map(p => newSeries(L, p[0], p[1], 0));
    L.po.rounds.push(first);
    L.userInPlayoffs = seeds[0].slice(0, PO.seeds).concat(PO.conf === 2 ? seeds[1].slice(0, PO.seeds) : []).includes(0);
    L.phase = L.userInPlayoffs ? 'playoffs' : 'eliminated';
    L.po.userOut = !L.userInPlayoffs;
    advancePO(L);
  }
  function newSeries(L, a, b, round) {
    const def = L.R.po.rounds[round];
    return { a, b, wa: 0, wb: 0, games: [], done: false, need: def.need, neutral: !!def.neutral };
  }

  function roundName(i, R) { R = R || E.RULES.nba; return (R.po.rounds[i] || {}).name || 'Playoffs'; }

  function seriesHome(s, gameNo) { return HOME_PAT[gameNo] ? s.a : s.b; }
  function playSeriesGameFast(L, s) {
    const gn = s.games.length, h = seriesHome(s, gn), a = h === s.a ? s.b : s.a;
    const G = E.newGame([L.teams[h], L.teams[a]], [L.plans[h], L.plans[a]], { rng: L.r, fast: true, rules: L.R });
    G.aiTeam = [true, true]; E.simGame(G);
    accPO(L, L.po.round, h, a, G);
    return finishSeriesGame(L, s, h, a, G.score[0], G.score[1]);
  }
  function finishSeriesGame(L, s, h, a, sh, sa) {
    const winner = sh > sa ? h : a;
    s.games.push({ h, a, sh, sa, winner });
    if (winner === s.a) s.wa++; else s.wb++;
    if (s.wa === s.need || s.wb === s.need) { s.done = true; s.winner = s.wa === s.need ? s.a : s.b; }
    return winner;
  }
  function seriesOfUser(L) { const R = L.po.rounds[L.po.round]; return R && R.find(s => s.a === 0 || s.b === 0); }

  // simulira sve serije u kolu koje ne uključuju korisnika; korisnikova se igra ručno
  function advancePO(L) {
    const po = L.po;
    for (;;) {
      const R = po.rounds[po.round];
      for (const s of R) {
        if ((s.a === 0 || s.b === 0) && !po.userOut) continue;
        while (!s.done) playSeriesGameFast(L, s);
      }
      const us = R.find(s => s.a === 0 || s.b === 0);
      if (us && !us.done && !po.userOut) return;      // čeka korisnika
      if (us && us.done && us.winner !== 0 && !po.userOut) { po.userOut = true; po.elimRound = po.round; po.elimSeries = us; }
      if (us && us.done && us.winner !== 0) { L.phase = 'eliminated'; }
      if (!R.every(s => s.done)) return;
      // next round: adjacent winners meet (1v8 with 4v5, 2v7 with 3v6, ...)
      if (po.round === L.R.po.rounds.length - 1) { po.champ = R[0].winner; L.phase = po.champ === 0 ? 'champion' : (po.userOut ? 'eliminated' : 'done'); return; }
      const W = R.map(s => s.winner), next = [];
      for (let i = 0; i < W.length; i += 2) next.push(orderPair(L, [W[i], W[i + 1]], po.round + 1));
      po.rounds.push(next); po.round++;
      L.history.push({ round: po.round });
    }
  }
  function orderPair(L, p, round) {
    const [x, y] = p;
    const bx = L.rec[x].w, by = L.rec[y].w;
    const [a, b] = (bx > by || (bx === by && (L.rec[x].pf - L.rec[x].pa) >= (L.rec[y].pf - L.rec[y].pa))) ? [x, y] : [y, x];
    return newSeries(L, a, b, round);
  }

  function nextPlayoffGame(L) {
    const s = seriesOfUser(L);
    if (!s || s.done) return null;
    const gn = s.games.length, h = seriesHome(s, gn), a = h === s.a ? s.b : s.a;
    return { series: s, gameNo: gn, home: h, away: a, userHome: h === 0, opp: h === 0 ? a : h, round: L.po.round };
  }
  function startPlayoffGame(L) {
    const info = nextPlayoffGame(L);
    const G = E.newGame([L.teams[info.home], L.teams[info.away]], [L.plans[info.home], L.plans[info.away]], { rng: L.r, rules: L.R });
    G.aiTeam = [info.home !== 0, info.away !== 0]; G.userSide = info.userHome ? 0 : 1; G.info = info; G.playoff = true;
    if (L.inj) E.markOut(G, G.userSide, [L.inj.i]);
    return G;
  }
  function finishPlayoffGame(L, G) {
    const info = G.info, s = info.series;
    finishSeriesGame(L, s, info.home, info.away, G.score[0], G.score[1]);
    accPO(L, info.round, info.home, info.away, G);
    accumulate(L, G);
    L.poGames = L.poGames || [];
    const us = G.score[G.userSide], them = G.score[1 - G.userSide];
    L.poGames.push({ round: info.round, opp: info.opp, home: info.userHome, us, them, win: us > them });
    if (s.done) advancePO(L);
    return { win: us > them, us, them };
  }
  function quickPlayoffGame(L) {
    return withAutoSubs(L, () => { const G = startPlayoffGame(L); G.fast = true; E.simGame(G); return finishPlayoffGame(L, G); });
  }


  // ---------- Nagrade ----------
  function gsOf(a) {
    return a.pts + 0.4 * a.fgm - 0.7 * a.fga - 0.4 * (a.fta - a.ftm) + 0.7 * a.oreb + 0.3 * (a.reb - a.oreb) + a.stl + 0.7 * a.ast + 0.7 * a.blk - 0.4 * a.pf - a.tov;
  }
  function posGroup(p) {
    const s = p.slot || p.pos;
    if (s === 'PG' || s === 'SG' || s === 'G') return 'G';
    if (s === 'C') return 'C';
    return 'F';
  }
  function computeAwards(L) {
    const rows = [];
    L.teams.forEach((t, ti) => {
      const rec = L.rec[ti], gp = Math.max(1, rec.w + rec.l), wp = rec.w / gp, pa = rec.pa / gp;
      t.players.forEach((p, pi) => {
        const a = L.ps[ti][pi]; if (a.g < Math.min(40 * L.R.games / 82, gp * 0.5)) return;
        const mpg = a.sec / 60 / a.g; if (mpg < 15 * L.R.mins / 240) return;
        const g = a.g, gs = gsOf(a) / g;
        const isStarter = (L.plans[ti].starters || []).includes(pi);
        rows.push({
          ti, pi, p, team: t, isUser: ti === 0, g, mpg, gs, wp, isStarter, grp: posGroup(p),
          ppg: a.pts / g, rpg: a.reb / g, apg: a.ast / g, spg: a.stl / g, bpg: a.blk / g,
          fg: a.fga ? a.fgm / a.fga : 0, tp: a.tpa ? a.tpm / a.tpa : 0,
          mvp: gs * (0.55 + wp * 1.0),
          def: (a.stl * 1.7 + a.blk * 1.5 + (a.reb - a.oreb) * 0.25) / g + (L.R.avgPts - pa) * 0.12
        });
      });
    });
    const best = (arr, key) => arr.slice().sort((x, y) => y[key] - x[key])[0];
    const line = r => r ? { ti: r.ti, pi: r.pi, name: r.p.name, team: r.team.label, tm: r.team.tm, isUser: r.isUser, ppg: r.ppg, rpg: r.rpg, apg: r.apg, spg: r.spg, bpg: r.bpg, fg: r.fg, g: r.g, grp: r.grp, wp: r.wp, season: r.team.season } : null;
    const mf = L.R.mins / 240, topRows = rows.filter(r => r.mpg >= 25 * mf);
    function allTeams(key, count) {   // count timova po 5 (2 G, 2 F, 1 C), puni se po vrednosti
      const pool = rows.slice().sort((x, y) => y[key] - x[key]), used = new Set(), out = [];
      for (let t = 0; t < count; t++) {
        const need = { G: 2, F: 2, C: 1 }, team = [];
        for (const r of pool) { const id = r.ti + ':' + r.pi; if (used.has(id) || need[r.grp] <= 0) continue; need[r.grp]--; used.add(id); team.push(line(r)); if (team.length === 5) break; }
        for (const r of pool) { if (team.length === 5) break; const id = r.ti + ':' + r.pi; if (used.has(id)) continue; used.add(id); team.push(line(r)); }
        out.push(team);
      }
      return out;
    }
    const st = LG_standings(L);
    const coachTeam = L.teams[st[0].i];
    const awards = {
      mvp: line(best(topRows.length ? topRows : rows, 'mvp')),
      dpoy: line(best(rows.filter(r => r.mpg >= 22 * mf), 'def')),
      sixth: line(best(rows.filter(r => !r.isStarter && r.mpg >= 18 * mf), 'gs')),
      coach: { ti: st[0].i, team: coachTeam.label, tm: coachTeam.tm, isUser: st[0].i === 0, w: st[0].w, l: st[0].l },
      leaders: {
        pts: line(best(rows, 'ppg')), reb: line(best(rows, 'rpg')), ast: line(best(rows, 'apg')), stl: line(best(rows, 'spg')), blk: line(best(rows, 'bpg'))
      },
      allLeague: allTeams('mvp', 3), allDef: allTeams('def', 2)
    };
    // lista korisnikovih nagrada
    const mine = [];
    const isMe = x => x && x.isUser;
    if (isMe(awards.mvp)) mine.push('MVP');
    if (isMe(awards.dpoy)) mine.push('Defensive Player of the Year');
    if (isMe(awards.sixth)) mine.push('Sixth Man of the Year');
    if (awards.coach.isUser) mine.push('Coach of the Year');
    ['pts', 'reb', 'ast', 'stl', 'blk'].forEach(k => { if (isMe(awards.leaders[k])) mine.push({ pts: 'Scoring leader', reb: 'Rebounding leader', ast: 'Assists leader', stl: 'Steals leader', blk: 'Blocks leader' }[k]); });
    awards.allLeague.forEach((t, i) => t.forEach(x => { if (isMe(x)) mine.push('All-League ' + ['First', 'Second', 'Third'][i] + ' Team: ' + x.name); }));
    awards.allDef.forEach((t, i) => t.forEach(x => { if (isMe(x)) mine.push('All-Defensive ' + ['First', 'Second'][i] + ' Team: ' + x.name); }));
    awards.mine = mine;
    L.awards = awards;
    return awards;
  }
  function LG_standings(L) { return standings(L); }

  function poAwards(L) {
    const po = L.po; if (!po || po.champ == null) return null;
    function mvpOf(round, ti) {
      const B = L.psPO[round]; if (!B || !B[ti]) return null;
      let bestV = -1e9, bi = -1;
      B[ti].forEach((a, i) => { if (a.g < 2) return; const v = gsOf(a) / a.g * 1.0 + a.pts / a.g * 0.15; if (v > bestV) { bestV = v; bi = i; } });
      if (bi < 0) return null;
      const a = B[ti][bi], p = L.teams[ti].players[bi], g = a.g;
      return { ti, pi: bi, name: p.name, team: L.teams[ti].label, tm: L.teams[ti].tm, isUser: ti === 0, ppg: a.pts / g, rpg: a.reb / g, apg: a.ast / g, g };
    }
    const last = L.R.po.rounds.length - 1, fin = po.rounds[last] && po.rounds[last][0];
    const confs = L.R.po.confMvp ? (po.rounds[last - 1] || []).map(s => ({ series: s, mvp: mvpOf(last - 1, s.winner) })) : [];
    const out = { champ: po.champ, finals: fin ? { series: fin, mvp: mvpOf(last, po.champ) } : null, confs };
    out.mine = [];
    if (out.finals && out.finals.mvp && out.finals.mvp.isUser) out.mine.push('Finals MVP');
    confs.forEach(c => { if (c.mvp && c.mvp.isUser) out.mine.push('Conference Finals MVP'); });
    L.poAwards = out;
    return out;
  }

  function summary(L) {
    const w = L.rec[0].w, l = L.rec[0].l;
    let res = 'Season';
    if (L.phase === 'champion') res = 'Champion';
    else if (L.phase === 'eliminated' && L.po) res = L.userInPlayoffs ? 'Eliminated: ' + roundName(L.po.elimRound != null ? L.po.elimRound : L.po.round, L.R) : 'Missed playoffs';
    return { w, l, res, playoffs: L.po && L.po.round };
  }

  return {
    cfg, create, nextUserGame, startUserGame, finishUserGame, quickUserGame, simOthers, standings,
    startPlayoffs, nextPlayoffGame, startPlayoffGame, finishPlayoffGame, quickPlayoffGame,
    seriesOfUser, roundName, summary, seriesHome, shuffle, computeAwards, poAwards
  };
});
