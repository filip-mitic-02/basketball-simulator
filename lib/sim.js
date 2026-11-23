// Loads the shared simulation (public/engine.js, league.js, core.js) and the player database for server-side use.
// The files are plain browser/UMD scripts, so they are evaluated in a small wrapper instead of being imported.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PUB = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
let cache = null;

function evalUmd(file, deps) {
  const src = readFileSync(join(PUB, file), 'utf8');
  const mod = { exports: {} };
  const req = name => { const k = name.replace(/^\.\//, ''); if (!deps[k]) throw new Error('unknown module ' + name); return deps[k]; };
  new Function('module', 'exports', 'require', src)(mod, mod.exports, req);
  return mod.exports;
}

export function fileHash() {
  const h = createHash('sha256');
  for (const f of ['engine.js', 'league.js', 'core.js', 'data.json']) h.update(readFileSync(join(PUB, f)));
  return h.digest('hex');
}

export function loadSim() {
  if (cache) return cache;
  const Engine = evalUmd('engine.js', {});
  const League = evalUmd('league.js', { 'engine.js': Engine });
  const Core = evalUmd('core.js', { 'engine.js': Engine, 'league.js': League });
  const data = JSON.parse(readFileSync(join(PUB, 'data.json'), 'utf8'));
  const teams = Core.mkTeams(data);
  const byId = new Map(teams.map(t => [t.id, t]));
  cache = { Engine, League, Core, teams, byId, version: Core.VERSION };
  return cache;
}
