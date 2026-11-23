import { writeFileSync } from 'node:fs';
import { loadSim, fileHash } from '../lib/sim.js';
writeFileSync(new URL('../tests/sim.lock.json', import.meta.url), JSON.stringify({ version: loadSim().version, hash: fileHash() }, null, 2) + '\n');
console.log('lock updated');
