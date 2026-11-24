import { loadSim } from '../lib/sim.js';
import { writeFileSync } from 'node:fs';
const sim = loadSim(), C = sim.Core, E = sim.Engine;
const pool = sim.teams;
const FIELDS = ['ovr', 'p2', 'p3', 'r3', 'usg', 'ast', 'orb', 'drb', 'stl', 'blk', 'ftr'], NEG = ['tov', 'pf'];
// rotation player sd per field
const rot = pool.flatMap(t => t.players.slice(0, 8));
const sd = {}, mean = {};
[...FIELDS, ...NEG].forEach(f => { const v = rot.map(p => p[f]).filter(x => typeof x === 'number'); const m = v.reduce((a, b) => a + b, 0) / v.length; mean[f] = m; sd[f] = Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / v.length); });
const clone = t => ({ ...t, players: t.players.map(p => ({ ...p })) });
const strength = t => t.players.slice(0, 8).reduce((a, p) => a + p.ovr, 0);
const sorted = pool.slice().sort((a, b) => strength(b) - strength(a));
const BASEIDX = +process.env.BASE || 0.08;                     // quantile of the base team in the pool (top 8% = a contender)
const base = sorted[Math.floor(sorted.length * BASEIDX)];
if (process.env.KOV) Object.assign(E.K, JSON.parse(process.env.KOV));
export { sd, mean, base };
function run(mod, N, seed0) {
  let diff = 0, wins = 0;
  const A = clone(base); if (mod) mod(A);
  const planA = E.defaultPlan(A);
  let s = seed0 >>> 0; const rr = () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  for (let g = 0; g < N; g++) {
    let B; do { B = pool[Math.floor(rr() * pool.length)]; } while (B.id === base.id);
    const home = g % 2, teams = home ? [B, A] : [A, B], plans = home ? [E.defaultPlan(B), planA] : [planA, E.defaultPlan(B)];
    const G = E.newGame(teams, plans, { rng: E.mulberry32((rr() * 4294967296) >>> 0), fast: true });
    E.simGame(G);
    const me = home ? 1 : 0; diff += G.score[me] - G.score[1 - me]; if (G.score[me] > G.score[1 - me]) wins++;
  }
  return { diff: diff / N, wr: wins / N };
}
export { run, E, pool };
if (process.argv[1].endsWith('measure-impact.mjs')) {
  const N = +process.argv[2] || 1500, which = process.argv[3] ? process.argv[3].split(',') : [...FIELDS, ...NEG];
  const t0 = Date.now(); const b0 = run(null, N, 11);
  console.log('time/game ms', ((Date.now() - t0) / (2 * N)).toFixed(1), 'base diff', b0.diff.toFixed(2), 'wr', b0.wr.toFixed(3), 'sd fields', JSON.stringify(Object.fromEntries(Object.entries(sd).map(([k, v]) => [k, +v.toFixed(3)]))));
  const out = { base: b0.diff, N }; const ro = run(A => A.players.forEach(p => { p.ovr += sd.ovr; }), N, 11); const PPO = (ro.diff - b0.diff) / sd.ovr; console.log('ovr(core) +1sd:', (ro.diff - b0.diff).toFixed(2), 'pt/g per ovr point', PPO.toFixed(3));
  for (const f of which) {
    const dir = NEG.includes(f) ? -1 : 1;
    const r = run(A => A.players.forEach(p => { const before = p[f]; p[f] = p[f] + dir * sd[f]; if (['ast', 'orb', 'drb', 'stl', 'blk', 'usg', 'tov', 'pf'].includes(f)) p[f] = Math.max(0.05, p[f]); if (E.CRED[f]) p.ovr += E.CRED[f][0] * (p[f] - before); }), N, 11);   // the rating rises with the stat, as it does in the data
    out[f] = r.diff - b0.diff; console.log(f.padEnd(5), 'd(pt/g) per +1sd(better):', (r.diff - b0.diff).toFixed(2), ' wr', r.wr.toFixed(3), E.CRED[f] ? ' target ' + (Math.abs(E.CRED[f][0]) * sd[f] * PPO).toFixed(2) : '');
  }
}
