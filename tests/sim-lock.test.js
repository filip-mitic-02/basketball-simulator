import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadSim, fileHash } from '../lib/sim.js';

// The server replays every season with the exact simulation the player used. Changing the engine, league, core or
// player data silently would make old logs replay differently, so any change must come with a new Core.VERSION
// and a refreshed lock file: `node scripts/update-sim-lock.mjs`.
test('simulation files are locked to Core.VERSION', () => {
  const lock = JSON.parse(readFileSync(new URL('./sim.lock.json', import.meta.url), 'utf8'));
  assert.equal(fileHash(), lock.hash, 'engine.js / league.js / core.js / data.json changed: bump Core.VERSION and run scripts/update-sim-lock.mjs');
  assert.equal(loadSim().version, lock.version, 'Core.VERSION changed without refreshing the lock: run scripts/update-sim-lock.mjs');
});
