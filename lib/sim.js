// Loads the shared simulation (public/engine.js, league.js, core.js) and the player database for server-side use.
// The files are plain browser/UMD scripts, so they are evaluated in a small wrapper instead of being imported.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PUB = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
let shared = null; const bySim = {};
export const DATA = { nba: 'data.json', el: 'data-el.json' };

function evalUmd(file, deps) {
  const src = readFileSync(join(PUB, file), 'utf8');
  const mod = { exports: {} };
  const req = name => { const k = name.replace(/^\.\//, ''); if (!deps[k]) throw new Error('unknown module ' + name); return deps[k]; };
  new Function('module', 'exports', 'require', src)(mod, mod.exports, req);
  return mod.exports;
}

let progress = null;
export function loadProgress() { return progress || (progress = evalUmd('progress.js', {})); }

export function fileHash() {
  const h = createHash('sha256');
  for (const f of ['engine.js', 'league.js', 'core.js', 'data.json', 'data-el.json']) h.update(readFileSync(join(PUB, f)));
  return h.digest('hex');
}

export function loadSim(comp = 'nba') {
  if (!DATA[comp]) throw new Error('unknown competition ' + comp);
  if (bySim[comp]) return bySim[comp];
  if (!shared) {
    const Engine = evalUmd('engine.js', {});
    const League = evalUmd('league.js', { 'engine.js': Engine });
    const Core = evalUmd('core.js', { 'engine.js': Engine, 'league.js': League });
    shared = { Engine, League, Core };
  }
  const data = JSON.parse(readFileSync(join(PUB, DATA[comp]), 'utf8'));
  const teams = shared.Core.mkTeams(data);
  const byId = new Map(teams.map(t => [t.id, t]));
  const yrs = teams.map(t => t.season);
  return (bySim[comp] = { ...shared, comp, teams, byId, version: shared.Core.VERSION, minY: Math.min(...yrs), maxY: Math.max(...yrs) });
}
