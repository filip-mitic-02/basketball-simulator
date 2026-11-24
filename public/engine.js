/* Engine: simulacija jedne utakmice po posedima, sa trenerskim odlukama.
   UMD modul: radi u browseru (window.Engine) i u Node-u (za testiranje balansa). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Engine = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ---------- Konstante modela ----------
  const BASE2 = 0.543, BASE3 = 0.362;
  const K = { ovrO: 0.00546, ovrD: 0.00608, delta: 1.8, cmp: 7, cmpT: 0, clump: 0.05, tform: 0.03, sat: 0.09, satT: 0.06, es: 0.6, formSd: 0.025,
    // how strongly each component acts on the court; tuned so a +1 sd team-wide gain is worth what the rating credits it for
    kOrb: 0.30, kDrb: 0.68, kStl: 0.38, kBlk: 0.16, kAst: 9.5, kTov: 0.56, kFtr: 1.16, kPf: 2.0, d2: 0.72, d3: 2.67, spcUp: 0.004, spcDn: -0.006, gain: 1.85, g3: 0.75, hndP: -0.006, hndT: 1.09 };       // moderna liga kao referenca (sve je era-normalizovano)
  // tactic effects: each is a team-fit term (centred on a typical drafted roster) so no option wins for everybody
  const T = { bmC: 0.007, bmS: 0.05, isoS: 0.0020, isoC: 80, inC: 0.006, inS: 0.08, inFoul: 1.12, thFoul: 0.92, thC: 0.0, thS: 0.012,
    zn3: 0.012, zn3S: 0.004, zn2: -0.006, zn2S: 0.025, znFoul: 0.95, prFoul: 1.18, prTov: 0.030, prS: 0.06, prP: 0.010 };
  // ---------- Signature traits ----------
  // The few stars whose game is built on one rare skill get a trait, derived from their stats relative to the league (so it is
  // tied to what the player really did). A trait acts on the court beyond what the rating already pays for, which is why a
  // trait star changes games more than a role player with bigger raw numbers. Both teams use them, so league strength is shared.
  const TRAITS = {
    magnet:   { name: 'Foul Magnet',  desc: 'Draws fouls on a big share of his shots and puts the defenders who guard him in foul trouble.' },
    maestro:  { name: 'Playmaker',    desc: 'Makes everyone around him better: easier shots for teammates and fewer turnovers. Counts as a ball handler.' },
    eraser:   { name: 'Shot Eraser',  desc: 'Opponents struggle to score and shoot worse at the rim while he is on the floor.' },
    lockdown: { name: 'Lockdown',     desc: 'Hounds ball handlers: more turnovers and tougher shots for the opposition.' },
    sniper:   { name: 'Sniper',       desc: 'Pulls defenders out: better three-point shooting for the team and a weaker zone against it.' },
    glass:    { name: 'Glass Cleaner', desc: 'Dominates the boards at both ends while he is on the floor.' },
    scorer:   { name: 'Go-To Scorer', desc: 'Takes over late in games and shrugs off double teams.' }
  };
  const TR = { ovrMin: 72, magnet: 3.6, maestroP: 0.012, maestroT: 0.10, eraserP: 0.016, eraserB: 0.35, lockT: 0.016, lockP: 0.005, sniper3: 0.04, sniper2: 0.008, zoneCut: 0.4, glass: 0.22, scorerP: 0.055, scorerLate: 0.06, scorerU: 0.5, scorerDbl: 0.030 };
  const traitCfg = { on: true };
  function traitOf(p) {
    if (p._tr !== undefined) return p._tr;
    let best = null, bv = 0;
    if (p.ovr >= TR.ovrMin) {
      const c = [['magnet', p.ftr / 1.7], ['maestro', p.big ? p.ast / 1.3 : p.ast / 2.4], ['eraser', p.blk / 2.6], ['lockdown', p.stl / 1.8],
        ['sniper', p.p3 >= 0.02 && p.r3 >= 0.4 ? p.r3 / 0.4 : 0], ['glass', (p.orb + p.drb) / 2 / 1.8], ['scorer', p.ovr >= 85 ? 0.9 * p.usg / 1.5 : 0]];
      for (const [k, v] of c) if (v >= 1 && v > bv) { bv = v; best = k; }
    }
    p._tr = best ? { k: best, s: clamp((p.ovr - 66) / 26, 0.6, 1.4) } : null;
    return p._tr;
  }
  const TEMPO = {                              // sekundi po posedu (prosek), umor, TOV, kvalitet šuta
    slow: { dur: 15.6, fat: 0.96, tov: -0.004, sq: +0.003 },
    normal: { dur: 13.2, fat: 1.00, tov: 0.0, sq: 0.0 },
    fast: { dur: 11.6, fat: 1.04, tov: +0.004, sq: -0.002 },
    push: { dur: 10.4, fat: 1.10, tov: +0.009, sq: -0.004 }
  };
  // The rating on a card pays for these components (fitted on the whole player pool: ovr ~ sum of coef * (stat - mean)).
  // The simulation models each component explicitly, so shot quality uses `core`, the part of the rating they do not explain.
  // Without this a big man's rebounds and blocks counted twice: once inside his rating and again in the rebound and block
  // formulas, while a passer's assists were credited in his rating but barely did anything in the game.
  const CRED = { p2: [91.3, 0], p3: [56.2, 0], r3: [3.14, 0.162], ast: [7.43, 1], orb: [2.25, 1], drb: [6.09, 1], stl: [4.45, 1], blk: [1.79, 1], ftr: [4.3, 1], tov: [-9.68, 1], pf: [-8.19, 1] };
  function coreOf(p) {
    let c = p.ovr;
    for (const f in CRED) { const v = p[f]; if (v != null) c -= CRED[f][0] * (v - CRED[f][1]); }
    return c;
  }
  const OFFENSE = ['balanced', 'inside', 'threes', 'ballmove', 'iso'];
  const DEFENSE = ['man', 'zone', 'press'];

  // ---------- Positions ----------
  const POS = ['PG', 'SG', 'SF', 'PF', 'C'];
  const SLOTS = ['PG', 'PG', 'SG', 'SG', 'SF', 'SF', 'PF', 'PF', 'C', 'C'];
  function eligible(p) {
    if (p._el) return p._el;
    const base = new Set((p.elig || p.pos || 'SF').split(',')), s = new Set(base);
    if (base.has('SG') && p.ast >= 1.05) s.add('PG');
    if (base.has('PG') && (p.usg >= 1.0 || p.r3 >= 0.3)) s.add('SG');
    if (base.has('SF') && p.r3 >= 0.25) s.add('SG');
    if (base.has('SG') && p.drb >= 1.0) s.add('SF');
    if (base.has('SF') && (p.drb >= 1.05 || p.orb >= 1.1)) s.add('PF');
    if (base.has('PF') && (p.r3 >= 0.22 || p.ast >= 1.0)) s.add('SF');
    if (base.has('PF') && (p.blk >= 1.4 || p.orb >= 1.25)) s.add('C');
    if (base.has('C') && (p.r3 >= 0.12 || p.ast >= 1.0)) s.add('PF');
    p._el = POS.filter(x => s.has(x));
    return p._el;
  }
  function assign(players) {
    const slotOwner = new Array(SLOTS.length).fill(-1);
    function tryP(i, seen) {
      for (const pos of eligible(players[i])) {
        for (let k = 0; k < SLOTS.length; k++) {
          if (SLOTS[k] !== pos || seen[k]) continue;
          seen[k] = 1;
          if (slotOwner[k] < 0 || tryP(slotOwner[k], seen)) { slotOwner[k] = i; return true; }
        }
      }
      return false;
    }
    for (let i = 0; i < players.length; i++) if (!tryP(i, new Array(SLOTS.length).fill(0))) return null;
    const out = new Array(players.length).fill(null);
    slotOwner.forEach((pi, k) => { if (pi >= 0) out[pi] = SLOTS[k]; });
    return out;
  }
  function canAdd(picks, p) { return assign(picks.concat([p])) !== null; }

  // ---------- Igrači i timovi ----------
  function mkPlayer(row, fields, uid) {
    const p = {};
    for (let i = 0; i < fields.length; i++) p[fields[i]] = row[i];
    p.uid = uid;
    p.guard = p.pos === 'PG' || p.pos === 'SG' || p.pos === 'G';
    p.big = p.pos === 'C' || p.pos === 'PF' || p.pos === 'F';
    p.endur = clamp(0.86 + 0.014 * (p.mpg - 24), 0.8, 1.15);
    return p;
  }
  function mkTeam(rec, fields) {
    // rec: [id, season, tm, name, [players]]
    return {
      id: rec[0], season: rec[1], tm: rec[2], name: rec[3],
      label: rec[1] + ' ' + rec[3],
      players: rec[4].map((r, i) => mkPlayer(r, fields, rec[0] + ':' + i))
    };
  }
  function userTeam(picks, name) {
    const players = picks.slice();
    const as = assign(players) || players.map(p => eligible(p)[0]);
    players.forEach((p, i) => { p.slot = as[i]; p.guard = as[i] === 'PG' || as[i] === 'SG'; p.big = as[i] === 'PF' || as[i] === 'C'; });
    return { id: 'USER', season: 0, tm: 'YOU', name: name || 'My Team', label: name || 'My Team', players, user: true };
  }

  function bestFive(players) {
    const idx = players.map((_, i) => i).sort((a, b) => players[b].ovr - players[a].ovr);
    let five = idx.slice(0, 5);
    const hasG = ix => ix.some(i => players[i].guard);
    const hasB = ix => ix.some(i => players[i].big);
    if (!hasG(five)) { const g = idx.find(i => players[i].guard && !five.includes(i)); if (g != null) five[4] = g; }
    if (!hasB(five)) { const b = idx.find(i => players[i].big && !five.includes(i)); if (b != null) five[3] = b; }
    return five;
  }

  function defaultPlan(team) {
    const P = team.players, n = P.length;
    const order = P.map((_, i) => i);
    let starters, mins = new Array(n).fill(0);
    if (team.user) {
      starters = bestFive(P);   // pet najboljih po oceni, uz bar jednog beka i jednog visokog
      const rest = order.filter(i => !starters.includes(i)).sort((a, b) => P[b].ovr - P[a].ovr);
      const ord = starters.slice().sort((a, b) => P[b].ovr - P[a].ovr).concat(rest);
      const tg = [34, 33, 32, 30, 29, 24, 20, 16, 12, 10];
      ord.forEach((i, k) => mins[i] = tg[k] || 0);
    } else {
      // istorijski timovi: prvih 5 po minutaži; minute ~ stvarni mpg, normalizovano na 240
      starters = order.slice(0, 5);
      const raw = order.map(i => (i < 10 ? Math.min(P[i].mpg, 40) : 0));
      const s = raw.reduce((a, b) => a + b, 0) || 1;
      mins = raw.map(v => Math.round(v * 240 / s));
    }
    return { starters, mins, tempo: 'normal', off: 'balanced', def: 'man', auto: 'auto' };
  }

  // brza procena snage (za prikaz): ponderisani ovr po planu minuta
  function teamOvr(team, plan) {
    plan = plan || defaultPlan(team);
    let s = 0, w = 0;
    team.players.forEach((p, i) => { const m = plan.mins[i] || 0; s += p.ovr * m; w += m; });
    return w ? s / w : 50;
  }

  // ---------- Stanje utakmice ----------
  function newGame(teams, plans, opts) {
    opts = opts || {};
    const r = opts.rng || (opts.seed != null ? mulberry32(opts.seed) : Math.random);
    const G = {
      r, teams, plans, fast: !!opts.fast,
      q: 1, clock: 720, score: [0, 0], qs: [[], []], qStart: [0, 0],
      poss: r() < 0.5 ? 0 : 1, firstPoss: null, over: false, ot: 0,
      mom: [0, 0], to: [7, 7], tf: [0, 0], feed: [null, null], feedLeft: [0, 0], dbl: [null, null],
      fb: false, putback: false, elapsed: 0, sinceSub: [0, 0], runPts: [0, 0], bo: [{ n: 0, p: 0, dp: 0 }, { n: 0, p: 0, dp: 0 }],
      log: [], st: [], en: [], form: [], tform: [0, 0], es: [1, 1], heat: [], on: [], sub: [0, 0]
    };
    G.firstPoss = G.poss;
    for (let t = 0; t < 2; t++) {
      const n = teams[t].players.length;
      G.st[t] = teams[t].players.map(() => ({ sec: 0, pts: 0, reb: 0, oreb: 0, ast: 0, stl: 0, blk: 0, tov: 0, fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0, pf: 0, pm: 0 }));
      G.en[t] = new Array(n).fill(100);
      G.form[t] = teams[t].players.map(() => (r() + r() + r() - 1.5) * K.formSd);
    G.tform[t] = (r() + r() + r() - 1.5) * K.tform;
    G.es[t] = clamp(1 + (r() + r() + r() - 1.5) * K.es, 0.3, 1.8);
      G.heat[t] = new Array(n).fill(0);
      G.on[t] = plans[t].starters.slice();
    }
    return G;
  }

  function ev(G, o) {
    o.q = G.q; o.c = Math.max(0, Math.round(G.clock)); o.sc = [G.score[0], G.score[1]];
    if (!G.fast) G.log.push(o);
    return o;
  }

  function wpick(G, ws) {
    let s = 0; for (let i = 0; i < ws.length; i++) s += ws[i];
    let x = G.r() * s;
    for (let i = 0; i < ws.length; i++) { x -= ws[i]; if (x <= 0) return i; }
    return ws.length - 1;
  }
  const fatF = e => 0.78 + 0.22 * e / 100;
  const cmp = d => { const x = Math.abs(d), T = K.cmpT, y = x <= T ? x : T + (K.cmp - T) * Math.tanh((x - T) / (K.cmp - T)); return d < 0 ? -y : y; };

  // agregati odbrane/napada za trenutnu petorku
  function agg(G, t) {
    const P = G.teams[t].players, on = G.on[t], en = G.en[t];
    let stl = 0, blk = 0, drb = 0, orb = 0, ast = 0, ovr = 0, usg = 0, spc = 0, hnd = 0, bigs = 0, pf = 0, hq = 0; const tr = {};
    for (let k = 0; k < 5; k++) {
      const p = P[on[k]], f = Math.pow(fatF(en[on[k]]), 0.7);
      stl += p.stl * f; blk += p.blk * f; drb += p.drb * f; orb += p.orb * f; ast += p.ast * f; ovr += cmp(coreOf(p) - 54) * (0.85 + 0.15 * en[on[k]] / 100); pf += p.pf; usg += p.usg; spc += clamp((p.r3 - 0.14) / 0.18, 0, 1) * clamp(0.5 + (p.p3 + 0.03) * 12, 0.3, 1.2); const T0 = traitCfg.on ? traitOf(p) : null; if (T0) tr[T0.k] = (tr[T0.k] || 0) + T0.s * f; if (p.guard || (T0 && T0.k === 'maestro')) { hnd++; if (p.ast * f > hq) hq = p.ast * f; } if (p.big) bigs++;
    }
    const sc = (v, k) => 1 + k * (v / 5 - 1);      // scaled effect of a component (raw values stay for who-does-what picks)
    return { stl: stl / 5, blk: blk / 5, drb: drb / 5, orb: orb / 5, ast: ast / 5, ovr: ovr / 5, usg: usg / 5, spc, hnd, bigs, pf: pf / 5, hl: clamp((0.95 - hq) / 0.35, 0, 1), tr, sum: { drb, orb },
      e: { stl: sc(stl, K.kStl), blk: sc(blk, K.kBlk), drb: sc(drb, K.kDrb), orb: sc(orb, K.kOrb), ast: clamp(sc(ast, K.kAst), 0.2, 3) } };
  }

  // ---------- Jedan posed ----------
  function possession(G) {
    G.np = (G.np | 0) + 1;                   // possessions played so far (used to place coaching actions in the replay log)
    const o = G.poss, d = 1 - o;
    const P = G.teams[o].players, Q = G.teams[d].players;
    const po = G.plans[o], pd = G.plans[d];
    const on = G.on[o], dn = G.on[d];
    const eo = G.en[o], ed = G.en[d];
    const tp = TEMPO[po.tempo] || TEMPO.normal;
    const tpD = TEMPO[pd.tempo] || TEMPO.normal;
    const A = agg(G, o), D = agg(G, d);

    // trajanje poseda
    let dur = tp.dur * (G.putback ? 0.5 : 1) * (0.6 + 0.8 * G.r());
    // tempo diktira onaj ko je brži (delimično)
    dur *= 0.8 + 0.2 * (tpD.dur / 13.2);
    dur = clamp(dur, 3, 24);
    if (dur > G.clock) dur = G.clock;
    G.putback = false;
    const isFB = G.fb; G.fb = false;

    // ---- napadač ----
    const wsc = on.map((pi, k) => {
      const p = P[pi];
      let w = Math.pow(p.usg, po.off === 'iso' ? 1.55 : po.off === 'ballmove' ? 0.65 : 1) * (0.55 + 0.45 * eo[pi] / 100);
      if (po.off === 'inside') w *= 1 + 0.45 * clamp((p.orb + p.blk) / 2 - 1, -0.5, 1.2) * (p.big ? 1 : 0.4);
      if (G.feed[o] === pi && G.feedLeft[o] > 0) w *= 2.3;
      if (po.off === 'iso' && pi === starOf(G, o)) w *= 1.35;
      if (traitCfg.on) { const t0 = traitOf(p); if (t0 && t0.k === 'scorer') w *= 1 + TR.scorerU * t0.s; }
      return w;
    });
    const k = wpick(G, wsc), pi = on[k], S = P[pi];
    const ST = traitCfg.on ? traitOf(S) : null;
    const st = G.st[o][pi];
    let secDone = dur;

    // ---- nešutirajući prekršaj (bonus) ----
    if (G.r() < 0.075 * (pd.def === 'press' ? 1.25 : 1) * (pd.def === 'zone' ? 0.85 : 1)) {
      const fj = wpick(G, dn.map((j, kk) => Q[j].pf * (0.8 + 0.4 * (1 - ed[j] / 100))));
      foul(G, d, dn[fj], false);
      const bonus = G.tf[d] >= 5;
      if (bonus) {
        ev(G, { k: 'bonus', t: o, p: pi });
        const lastMiss = shootFT(G, o, pi, 2, false);
        if (lastMiss) { rebound(G, o, d, A, D, 0.8); }
        else { G.poss = d; G.fb = false; }
      } else {
        // zadržava loptu, protekne par sekundi
        secDone = Math.min(G.clock, 5 + 4 * G.r());
      }
      return finishPoss(G, secDone, o, d);
    }

    // ---- gubitak lopte ----
    const defPress = pd.def === 'press' ? T.prTov + T.prS * (D.stl - 1.13) : 0;
    let pT = 0.128 * (1 + K.kTov * (S.tov - 1)) * (1 + (K.hndT - 1) * A.hl) * (1 + 0.45 * (D.e.stl - 1)) + defPress + tp.tov + (isFB ? -0.02 : 0)
      + (G.dbl[d] === pi ? 0.045 : 0) + TR.lockT * (D.tr.lockdown || 0);
    pT *= 1 - TR.maestroT * Math.min(A.tr.maestro || 0, 1.4);
    pT = clamp(pT, 0.03, 0.32);
    if (G.r() < pT) {
      st.tov++;
      let steal = -1;
      if (G.r() < 0.55 + defPress * 4) {
        const sj = wpick(G, dn.map(j => Math.pow(Q[j].stl, 1.4) * fatF(ed[j])));
        steal = dn[sj]; G.st[d][steal].stl++;
        G.fb = true;
      }
      ev(G, { k: 'tov', t: o, p: pi, s: steal });
      G.poss = d; addMom(G, d, 0.04);
      return finishPoss(G, Math.min(dur, G.clock), o, d);
    }

    // ---- šut ili prekršaj pri šutu ----
    const r3 = clamp(S.r3 * (po.off === 'threes' ? 1.32 : po.off === 'inside' ? 0.62 : 1) * (pd.def === 'zone' ? 1.10 : 1), 0, 0.85);
    const is3 = G.r() < r3;

    let pFoul = 0.082 * (1 + K.kFtr * (S.ftr - 1)) * (1 + K.kPf * (D.pf - 1)) * (po.off === 'inside' ? T.inFoul : po.off === 'threes' ? T.thFoul : 1)
      * (pd.def === 'press' ? T.prFoul : pd.def === 'zone' ? T.znFoul : 1) * (is3 ? 0.30 : 1) * (isFB ? 1.1 : 1) * (traitCfg.on && ST && ST.k === 'magnet' ? 1 + TR.magnet * ST.s : 1);
    pFoul = clamp(pFoul, 0, 0.45);
    const sq = tp.sq;
    // verovatnoća pogotka
    let p = (is3 ? BASE3 + K.d3 * S.p3 : BASE2 + K.d2 * S.p2);
    p += K.ovrO * cmp(coreOf(S) - 54) - K.ovrD * D.ovr;
    p -= K.clump * Math.max(0, A.usg - 1.08);
    if (!is3) p += (A.spc >= 3.2 ? K.spcUp : A.spc < 1.6 ? K.spcDn : 0);
    p += K.hndP * A.hl;
    p += G.tform[o];
    p += 0.012 * (A.e.ast - 1);
    const defScore = (0.45 * (D.e.blk - 1) + 0.35 * (D.e.stl - 1) + 0.20 * (D.e.drb - 1)) * (is3 ? 0.55 : 1);
    p -= 0.09 * defScore;
    if (po.off === 'inside' && !is3) p += clamp(T.inC + T.inS * ((A.orb + A.blk) / 2 - 1.18), -0.014, 0.022);
    if (po.off === 'threes' && is3) p += clamp(T.thC + T.thS * (A.spc - 1.7), -0.014, 0.016);
    if (po.off === 'ballmove') p += clamp(T.bmC + T.bmS * (A.ast - 1.47), -0.010, 0.016);
    if (po.off === 'iso') p += clamp(T.isoS * (S.ovr - T.isoC), -0.020, 0.016);
    if (pd.def === 'press') p += T.prP;
    if (pd.def === 'zone') p += is3 ? T.zn3 + T.zn3S * (A.spc - 1.6) : T.zn2 - T.zn2S * (D.blk - 1.33);
    { const base = is3 ? BASE3 : BASE2; { const x = (p - base) * G.es[o] * K.gain * (is3 ? K.g3 : 1), ax = Math.abs(x), T = K.satT, y = ax <= T ? ax : T + (K.sat - T) * Math.tanh((ax - T) / (K.sat - T)); p = base + (x < 0 ? -y : y); } }
    p += sq;
    { const bo = G.bo; if (bo[o].n > 0) p += bo[o].p; if (bo[d].n > 0) p -= bo[d].dp; }   // a coach's call from an interactive moment
    if (traitCfg.on) {
      const mA = Math.min(A.tr.maestro || 0, 1.4), sn = Math.min(A.tr.sniper || 0, 1.4), er = Math.min(D.tr.eraser || 0, 1.4), lk = Math.min(D.tr.lockdown || 0, 1.4);
      p += TR.maestroP * mA;
      if (is3) p += TR.sniper3 * sn; else p += TR.sniper2 * sn - TR.eraserP * er;
      p -= TR.lockP * lk;
      if (pd.def === 'zone' && is3) p -= (T.zn3 + T.zn3S * (A.spc - 1.6)) * TR.zoneCut * Math.min(sn, 1);
      if (ST && ST.k === 'scorer') {
        p += TR.scorerP * ST.s;
        if (G.q >= 4 && G.clock < 300 && Math.abs(G.score[o] - G.score[d]) <= 8) p += TR.scorerLate * ST.s;
      }
    }
    p -= 0.08 * Math.pow(1 - eo[pi] / 100, 1.4);
    p += G.form[o][pi] + 0.006 * G.heat[o][pi] + 0.005 * G.mom[o] + (o === 0 ? 0.005 : -0.005);
    if (isFB) p += 0.04;
    if (G.dbl[d] === pi) p -= (traitCfg.on && ST && ST.k === 'scorer' ? TR.scorerDbl : 0.045); else if (G.dbl[d] != null && onCourt(G, o, G.dbl[d])) p += 0.012;
    p = clamp(p, 0.18, 0.82);

    // prekršaj pri šutu
    if (G.r() < pFoul) {
      const fj = wpick(G, dn.map(j => Q[j].pf * (0.8 + 0.4 * (1 - ed[j] / 100))));
      foul(G, d, dn[fj], true);
      if (G.r() < 0.13 && !is3) {               // and-one
        scoreFG(G, o, pi, 2, false, 1);
        ev(G, { k: 'make', t: o, p: pi, pts: 2, a: -1, and1: true, is3: false });
        const lm = shootFT(G, o, pi, 1, false);
        if (lm) return finishPoss(G, secDone, o, d, rebound(G, o, d, A, D, 0.8));
        G.poss = d; return finishPoss(G, secDone, o, d);
      }
      const n = is3 && G.r() < 0.5 ? 3 : 2;
      ev(G, { k: 'sfoul', t: o, p: pi, n: n });
      const lm = shootFT(G, o, pi, n, true);
      if (lm) return finishPoss(G, secDone, o, d, rebound(G, o, d, A, D, 0.8));
      G.poss = d; return finishPoss(G, secDone, o, d);
    }

    // blokada
    if (!is3) {
      const pB = 0.056 * Math.pow(D.e.blk, 1.15) * (S.big ? 1.15 : 1) * (po.off === 'inside' ? 1.1 : 1) * (1 + TR.eraserB * Math.min(D.tr.eraser || 0, 1.4));
      if (G.r() < clamp(pB, 0, 0.2)) {
        st.fga++;
        const bj = wpick(G, dn.map(j => Math.pow(Q[j].blk, 1.6) * fatF(ed[j])));
        G.st[d][dn[bj]].blk++;
        G.heat[o][pi] = clamp(G.heat[o][pi] * 0.9 - 0.15, -1, 1);
        ev(G, { k: 'block', t: o, p: pi, b: dn[bj], is3: false });
        return finishPoss(G, secDone, o, d, rebound(G, o, d, A, D, 1.0));
      }
    }

    // pogodak / promašaj
    if (G.r() < p) {
      let ast = -1;
      const pA = (is3 ? 0.80 : 0.58) * (0.80 + 0.20 * A.ast) * (po.off === 'ballmove' ? 1.12 : po.off === 'iso' ? 0.7 : 1);
      if (G.r() < pA) {
        const ws = on.map((pj, kk) => kk === k ? 0 : Math.pow(P[pj].ast, 1.5) * fatF(eo[pj]));
        const aj = wpick(G, ws); ast = on[aj];
        G.st[o][ast].ast++;
      }
      scoreFG(G, o, pi, is3 ? 3 : 2, is3, 1);
      G.heat[o][pi] = clamp(G.heat[o][pi] * 0.85 + 0.25, -1, 1);
      ev(G, { k: 'make', t: o, p: pi, pts: is3 ? 3 : 2, a: ast, is3 });
      G.poss = d; G.fb = false;
      return finishPoss(G, secDone, o, d);
    } else {
      st.fga++; if (is3) st.tpa++;
      G.heat[o][pi] = clamp(G.heat[o][pi] * 0.85 - 0.12, -1, 1);
      ev(G, { k: 'miss', t: o, p: pi, is3 });
      return finishPoss(G, secDone, o, d, rebound(G, o, d, A, D, 1.0));
    }
  }

  function starOf(G, t) {
    const on = G.on[t], P = G.teams[t].players; let b = on[0];
    for (const i of on) if (P[i].ovr * P[i].usg > P[b].ovr * P[b].usg) b = i;
    return b;
  }
  function onCourt(G, t, i) { return G.on[t].indexOf(i) >= 0; }

  function scoreFG(G, t, pi, pts, is3, counted) {
    const st = G.st[t][pi];
    if (counted) { st.fga++; if (is3) st.tpa++; }
    st.fgm++; if (is3) st.tpm++;
    st.pts += pts;
    addPts(G, t, pts);
  }
  function addPts(G, t, pts) {
    G.score[t] += pts;
    for (let k = 0; k < 5; k++) { G.st[t][G.on[t][k]].pm += pts; G.st[1 - t][G.on[1 - t][k]].pm -= pts; }
    addMom(G, t, 0.05 * pts);
  }
  function addMom(G, t, v) {
    G.mom[t] = clamp(G.mom[t] + v, -1, 1);
    G.mom[1 - t] = clamp(G.mom[1 - t] - v * 0.8, -1, 1);
  }

  function foul(G, t, pj, shooting) {
    const s = G.st[t][pj]; s.pf++; G.tf[t]++;
    ev(G, { k: 'foul', t, p: pj, sh: shooting, n: s.pf });
    if (s.pf >= 6) forcedOut(G, t, pj);
  }
  function forcedOut(G, t, pj) {
    ev(G, { k: 'out', t, p: pj });
    replace(G, t, pj, true);
  }

  // slobodna bacanja; vraća true ako je poslednje promašeno
  function shootFT(G, t, pi, n, shooting) {
    const S = G.teams[t].players[pi], st = G.st[t][pi];
    let lastMiss = false, made = 0;
    for (let i = 0; i < n; i++) {
      const pr = clamp(S.ftp + G.form[t][pi] * 0.4 - 0.025 * (1 - G.en[t][pi] / 100), 0.2, 0.97);
      st.fta++;
      if (G.r() < pr) { st.ftm++; st.pts++; addPts(G, t, 1); made++; lastMiss = false; }
      else lastMiss = true;
    }
    ev(G, { k: 'ft', t, p: pi, n, m: made });
    return lastMiss;
  }

  // skok; vraća true/false (ofanzivni skok) i ažurira posed
  function rebound(G, o, d, A, D, mult) {
    const P = G.teams[o].players, Q = G.teams[d].players;
    const pd = G.plans[d];
    let rO = A.e.orb, rD = D.e.drb * (pd.def === 'zone' ? 1.0 : pd.def === 'press' ? 0.95 : 1);
    rO *= 1 + TR.glass * Math.min(A.tr.glass || 0, 1.4); rD *= 1 + TR.glass * Math.min(D.tr.glass || 0, 1.4);
    const pOR = clamp(0.262 * rO / (0.262 * rO + 0.738 * rD), 0.1, 0.5) * mult;
    if (G.r() < pOR) {
      const on = G.on[o];
      const j = wpick(G, on.map(pj => Math.pow(P[pj].orb, 1.3) * fatF(G.en[o][pj])));
      const pj = on[j]; G.st[o][pj].reb++; G.st[o][pj].oreb++;
      ev(G, { k: 'reb', t: o, p: pj, off: true });
      G.putback = true; addMom(G, o, 0.02);
      return true;
    } else {
      const on = G.on[d];
      const j = wpick(G, on.map(pj => Math.pow(Q[pj].drb, 1.3) * fatF(G.en[d][pj])));
      const pj = on[j]; G.st[d][pj].reb++;
      ev(G, { k: 'reb', t: d, p: pj, off: false });
      G.poss = d; G.fb = false;
      return false;
    }
  }

  // zajednički kraj poseda: vreme, umor, sat
  function finishPoss(G, sec, o, d) {
    sec = Math.min(sec, G.clock);
    G.clock -= sec; G.elapsed += sec;
    const tpO = TEMPO[G.plans[o].tempo] || TEMPO.normal, tpD = TEMPO[G.plans[d].tempo] || TEMPO.normal;
    for (let t = 0; t < 2; t++) {
      const fm = t === o ? tpO.fat : tpD.fat;
      const pressF = (G.plans[t].def === 'press') ? 1.2 : 1;
      const P = G.teams[t].players;
      for (let i = 0; i < P.length; i++) {
        if (G.on[t].indexOf(i) >= 0) {
          G.st[t][i].sec += sec;
          G.en[t][i] = Math.max(2, G.en[t][i] - 0.054 * sec * fm * pressF / P[i].endur);
        } else {
          G.en[t][i] = Math.min(100, G.en[t][i] + 0.052 * sec);
        }
      }
      G.sinceSub[t] += sec;
    }
    // momentum se smiruje, hot-hand traje
    G.mom[0] *= 0.97; G.mom[1] *= 0.97;
    for (let t = 0; t < 2; t++) if (G.bo[t].n > 0) G.bo[t].n--;
    for (let t = 0; t < 2; t++) if (G.feedLeft[t] > 0) { G.feedLeft[t]--; if (!G.feedLeft[t]) G.feed[t] = null; }
    for (let t = 0; t < 2; t++) if (G.dbl[t] != null && G.dblLeft && G.dblLeft[t] != null) { G.dblLeft[t]--; if (G.dblLeft[t] <= 0) { G.dbl[t] = null; G.dblLeft[t] = null; } }
    if (G.clock <= 0.01) endQuarter(G);
    else manageSubs(G);
    return true;
  }

  function endQuarter(G) {
    G.qs[0].push(G.score[0] - G.qStart[0]); G.qs[1].push(G.score[1] - G.qStart[1]);
    G.qStart = [G.score[0], G.score[1]];
    ev(G, { k: 'qend' });
    if (G.q >= 4 && G.score[0] !== G.score[1]) { G.over = true; return; }
    const rest = G.q === 2 ? 22 : 7;
    for (let t = 0; t < 2; t++) {
      for (let i = 0; i < G.en[t].length; i++) G.en[t][i] = Math.min(100, G.en[t][i] + rest);
      G.tf[t] = 0; G.to[t] = G.q === 4 ? G.to[t] : G.to[t];
    }
    G.mom = [0, 0];
    if (G.q >= 4) { G.q++; G.ot++; G.clock = 300; G.poss = G.r() < 0.5 ? 0 : 1; }
    else {
      G.q++; G.clock = 720;
      G.poss = G.q === 2 ? 1 - G.firstPoss : G.q === 3 ? 1 - G.firstPoss : G.firstPoss;
    }
    G.fb = false; G.putback = false;
    for (let t = 0; t < 2; t++) subReview(G, t, true);
  }

  // ---------- Izmene ----------
  function replace(G, t, outIdx, forced) {
    const P = G.teams[t].players, on = G.on[t];
    const pos = on.indexOf(outIdx); if (pos < 0) return false;
    let best = -1, bv = -1e9;
    for (let i = 0; i < P.length; i++) {
      if (on.indexOf(i) >= 0 || G.st[t][i].pf >= 6) continue;
      const v = P[i].ovr * (0.6 + 0.4 * G.en[t][i] / 100) + (G.plans[t].mins[i] > 0 ? 6 : -15);
      if (v > bv) { bv = v; best = i; }
    }
    if (best < 0) return false;
    on[pos] = best;
    G.sub[t]++;
    ev(G, { k: 'sub', t, p: best, o: outIdx, forced: !!forced });
    return true;
  }
  function wantScore(G, t, i, mode) {
    const P = G.teams[t].players, pl = P[i], plan = G.plans[t], s = G.st[t][i];
    const e = G.en[t][i];
    if (s.pf >= 6) return -1e9;
    const el = G.q > 4 ? 2880 : (G.q - 1) * 720 + (720 - G.clock);
    const target = (plan.mins[i] || 0) * 60;
    if (target <= 0 && mode !== 'clutch') return -1e3;
    const desired = target * Math.min(1, el / 2880);
    const deficit = (desired - s.sec) / 60;       // minuta
    let v;
    if (mode === 'clutch') v = pl.ovr * 0.9 + e * 0.12;
    else if (mode === 'garbage') v = (plan.starters.indexOf(i) >= 0 ? -25 : 18) + e * 0.15 + pl.ovr * 0.05;
    else v = deficit * 3.2 + pl.ovr * 0.30 + e * 0.30;
    // foul trouble
    const fl = s.pf;
    const lim = G.q <= 1 ? 2 : G.q === 2 ? 3 : G.q === 3 ? 4 : 5;
    if (fl > lim) v -= 14 * (fl - lim);
    if (e < 38) v -= (38 - e) * 1.1;
    return v;
  }
  function subReview(G, t, startOfQ) {
    const plan = G.plans[t];
    if (plan.auto === 'manual' && !G.aiTeam?.[t]) { forceFix(G, t); return; }
    if (plan.auto === 'forced' && !startOfQ) { forceFix(G, t); return; }
    const P = G.teams[t].players, on = G.on[t];
    const el = G.q > 4 ? 2880 : (G.q - 1) * 720 + (720 - G.clock);
    const margin = Math.abs(G.score[0] - G.score[1]);
    let mode = 'normal';
    if (G.q >= 4 && G.clock <= 300 && margin <= 10) mode = 'clutch';
    else if (G.q === 4 && G.clock <= 400 && margin >= 22) mode = 'garbage';
    else if (G.q > 4) mode = 'clutch';
    const all = P.map((_, i) => i);
    const sc = all.map(i => wantScore(G, t, i, mode));
    // trenutna petorka vs najbolja moguća
    const sorted = all.slice().sort((a, b) => sc[b] - sc[a]);
    let changed = false;
    const hyst = startOfQ ? 2 : 9;
    for (const cand of sorted) {
      if (on.indexOf(cand) >= 0 || sc[cand] < -500) continue;
      // najslabiji na terenu
      let wi = 0; for (let k = 1; k < 5; k++) if (sc[on[k]] < sc[on[wi]]) wi = k;
      const cur = on[wi];
      if (sc[cand] - sc[cur] > hyst) {
        // ograničenja sastava: bar jedan bek i jedan visok (ako postoje u rotaciji)
        const next = on.slice(); next[wi] = cand;
        if (!balanced(P, next) && balanced(P, on)) continue;
        on[wi] = cand; G.sub[t]++; changed = true;
        ev(G, { k: 'sub', t, p: cand, o: cur, forced: false });
      }
    }
    if (changed) G.sinceSub[t] = 0;
    forceFix(G, t);
  }
  function balanced(P, ix) { return ix.some(i => P[i].guard) && ix.some(i => P[i].big); }
  function forceFix(G, t) {
    const on = G.on[t];
    for (let k = 0; k < 5; k++) if (G.st[t][on[k]].pf >= 6) replace(G, t, on[k], true);
  }
  function manageSubs(G) {
    for (let t = 0; t < 2; t++) {
      const plan = G.plans[t];
      if (plan.auto === 'manual' && !(G.aiTeam && G.aiTeam[t])) { forceFix(G, t); continue; }
      // izmene tek na ~2 min, ili hitno kad neko opadne
      let urgent = false;
      for (let k = 0; k < 5; k++) { const i = G.on[t][k]; if (G.en[t][i] < 30) urgent = true; }
      const gap = plan.auto === 'forced' ? 1e9 : 95;
      if (G.sinceSub[t] >= gap || (urgent && plan.auto !== 'forced')) subReview(G, t, false);
      else forceFix(G, t);
      maybeTimeoutAI(G, t);
    }
  }
  function maybeTimeoutAI(G, t) {
    if (!(G.aiTeam && G.aiTeam[t])) return;
    if (G.to[t] <= 0 || G.clock <= 30 && G.q < 4) return;
    if (G.mom[1 - t] > 0.62 && G.r() < 0.5) callTimeout(G, t);
  }

  function callTimeout(G, t) {
    if (G.to[t] <= 0 || G.over) return false;
    G.to[t]--;
    for (let k = 0; k < 5; k++) { const i = G.on[t][k]; G.en[t][i] = Math.min(100, G.en[t][i] + 9); }
    G.mom[1 - t] = Math.min(0, G.mom[1 - t]) * 0.2; G.mom[t] = Math.max(G.mom[t], 0);
    ev(G, { k: 'to', t, left: G.to[t] });
    subReview(G, t, true);
    return true;
  }

  // ručne izmene trenera (korisnik)
  function setLineup(G, t, five) {
    const s = new Set(five);
    if (s.size !== 5) return false;
    for (const i of five) if (G.st[t][i].pf >= 6) return false;
    const before = G.on[t].slice();
    G.on[t] = five.slice();
    five.forEach(i => { if (before.indexOf(i) < 0) { G.sub[t]++; ev(G, { k: 'sub', t, p: i, o: before.find(b => five.indexOf(b) < 0), forced: false, manual: true }); } });
    return true;
  }
  function feedPlayer(G, t, i, n) { G.feed[t] = i; G.feedLeft[t] = n || 8; ev(G, { k: 'feed', t, p: i }); }
  function doubleTeam(G, t, oppIdx, n) {
    // t = tim koji dvoji; oppIdx = igrač protivnika
    G.dbl[t] = oppIdx; G.dblLeft = G.dblLeft || [null, null]; G.dblLeft[t] = n || 8;
    ev(G, { k: 'dbl', t, p: oppIdx });
  }
  // dvojenje: G.dbl[d] čuva protivničkog igrača (igrača napadača) koji se dvoji; pogledaj possession()

  // ---------- Pokretanje ----------
  function step(G) { if (!G.over) possession(G); return G; }
  function simQuarter(G) { const q = G.q; while (!G.over && G.q === q) possession(G); return G; }
  function simGame(G) { let n = 0; while (!G.over && n++ < 2000) possession(G); return G; }

  function describe(G, e) {
    const T = G.teams, nm = (t, i) => (i != null && i >= 0 && T[t].players[i]) ? T[t].players[i].name : '?';
    const tn = t => T[t].user ? 'Your team' : T[t].label;
    // a trait that just showed up in this play is named at the end of the line (text only, the simulation is untouched)
    const tag = (t, i, k) => { const p = i != null && i >= 0 ? T[t].players[i] : null, x = p && traitOf(p); return x && x.k === k ? ' \u00b7 ' + TRAITS[k].name : ''; };
    switch (e.k) {
      case 'make': return nm(e.t, e.p) + (e.is3 ? ' hits a three' : ' scores') + (e.a >= 0 ? ' (assist: ' + nm(e.t, e.a) + ')' : '') + (e.and1 ? ' and draws the foul' : '') + (e.is3 ? tag(e.t, e.p, 'sniper') : '') + tag(e.t, e.a, 'maestro') + (e.and1 ? tag(e.t, e.p, 'magnet') : '') + (e.q >= 4 && e.c < 300 ? tag(e.t, e.p, 'scorer') : '');
      case 'miss': return nm(e.t, e.p) + ' misses ' + (e.is3 ? 'a three' : 'the shot');
      case 'block': return nm(1 - e.t, e.b) + ' blocks ' + nm(e.t, e.p) + tag(1 - e.t, e.b, 'eraser');
      case 'reb': return nm(e.t, e.p) + (e.off ? ' grabs the offensive board' : ' grabs the rebound') + tag(e.t, e.p, 'glass');
      case 'tov': return nm(e.t, e.p) + ' turns it over' + (e.s >= 0 ? ' (stolen by ' + nm(1 - e.t, e.s) + ')' + tag(1 - e.t, e.s, 'lockdown') : '');
      case 'foul': return 'Foul on ' + nm(e.t, e.p) + ' (' + e.n + ')';
      case 'sfoul': return nm(e.t, e.p) + ' goes to the line (' + e.n + ' shots)' + tag(e.t, e.p, 'magnet');
      case 'bonus': return nm(e.t, e.p) + ' goes to the line (bonus)';
      case 'ft': return nm(e.t, e.p) + ' ' + e.m + '/' + e.n + ' from the line';
      case 'sub': return 'Sub (' + tn(e.t) + '): ' + nm(e.t, e.p) + ' in for ' + nm(e.t, e.o) + (e.forced ? ' (forced)' : '');
      case 'out': return nm(e.t, e.p) + ' fouls out';
      case 'to': return 'Timeout: ' + tn(e.t) + ' (' + e.left + ' left)';
      case 'feed': return 'Coach: feed ' + nm(e.t, e.p);
      case 'dbl': return 'Coach doubles ' + nm(1 - e.t, e.p);
      case 'qend': return 'End of ' + (e.q <= 4 ? 'Q' + e.q : 'overtime');
      default: return e.k;
    }
  }

  // temporary shot-quality boost for a side: p on its own shots, dp off the opponent's, for n possessions of the game
  function boost(G, t, p, dp, n) { G.bo[t] = { n, p, dp }; }

  return {
    agg, boost, K, T, TR, TRAITS, traitOf, traitCfg, CRED, coreOf, POS, SLOTS, eligible, assign, canAdd, mulberry32, clamp, TEMPO, OFFENSE, DEFENSE,
    mkPlayer, mkTeam, userTeam, defaultPlan, bestFive, teamOvr,
    newGame, step, simQuarter, simGame, possession,
    setLineup, callTimeout, feedPlayer, doubleTeam, describe, subReview
  };
});
