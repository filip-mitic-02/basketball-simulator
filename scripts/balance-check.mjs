const REPO = process.env.REPO || new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const { loadSim } = await import(REPO + '/lib/sim.js');
const sim = loadSim(process.env.COMP || 'nba'), C = sim.Core, E = sim.Engine, LG = sim.League;
if (process.env.KOV) { const o = JSON.parse(process.env.KOV); if (o.stretch) { LG.cfg.stretch = o.stretch; delete o.stretch; } Object.assign(E.K, o); }
const N = +process.argv[2] || 80, from = +(process.env.FROM || (process.env.COMP === 'el' ? 2000 : 1950)), to = +(process.env.TO || (process.env.COMP === 'el' ? 2025 : 2026));
const pool = C.poolOf(sim.teams, from, to);
const dp = raw => { let t = 55 + (raw - 30) * 0.62 + 0.3 * Math.max(0, raw - 78); if (t > 92) t = 92 + 8 * (1 - Math.exp(-(t - 92) / 9)); return Math.max(0, Math.min(99, Math.round(t))); };
const rows = [];
for (let g = 0; g < N; g++) {
  let s = 77 + g * 31; const rnd = n => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return Math.floor(((t ^ (t >>> 14)) >>> 0) / 4294967296 * n); };
  const picks = []; let skips = 2;
  for (let k = 0; k < 10; k++) {
    let t = C.rollTeam(pool, picks, rnd), best = -1, bi = -1;
    const scan = tm => { best = -1; bi = -1; tm.players.forEach((p, i) => { if (dp(p.ovr0 != null ? p.ovr0 : p.ovr) > best && C.makePick(picks, tm, i, null)) { best = dp(p.ovr); bi = i; } }); };
    scan(t); if (skips > 0 && best < 76) { skips--; t = C.rollTeam(pool, picks, rnd); scan(t); }
    picks.push(C.makePick(picks, t, bi, null));
  }
  const SE = C.createSeason({ picks, pool, seed: (rnd(4294967295)) >>> 0, hard: false, name: 'T' });
  const avg = picks.reduce((a, p) => a + dp(p.ovr), 0) / 10;
  while (SE.L.phase === 'season') C.quick(SE);
  const w = SE.L.rec[0].w, opp = SE.L.rec.slice(1).map(x => x.w).sort((a, b) => b - a);
  C.startPlayoffs(SE); while (SE.L.phase === 'playoffs') C.quickPo(SE);
  rows.push({ avg, w, champ: SE.L.phase === 'champion', ob: opp[0], ow: opp[opp.length - 1] });
}
rows.sort((a, b) => a.avg - b.avg);
const m = f => rows.reduce((a, r) => a + f(r), 0) / rows.length;
console.log('avg disp %s | wins %s | champs %s/%d | opp best %s worst %s', m(r => r.avg).toFixed(1), m(r => r.w).toFixed(1), rows.filter(r => r.champ).length, N, m(r => r.ob).toFixed(1), m(r => r.ow).toFixed(1));
for (let q = 0; q < 4; q++) { const s = rows.slice(q * N / 4, (q + 1) * N / 4); console.log(' quartile', q, 'disp', (s.reduce((a, r) => a + r.avg, 0) / s.length).toFixed(1), 'wins', (s.reduce((a, r) => a + r.w, 0) / s.length).toFixed(1), 'max', Math.max(...s.map(r => r.w)), 'champ', s.filter(r => r.champ).length); }
console.log(' wins >=70:', rows.filter(r => r.w >= 70).length, ' >=75:', rows.filter(r => r.w >= 75).length, ' max', Math.max(...rows.map(r => r.w)));
