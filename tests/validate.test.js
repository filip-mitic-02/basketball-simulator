import test from 'node:test';
import assert from 'node:assert/strict';
import { validateRun, computeScore, publicName } from '../lib/validate.js';

const base = () => ({ w: 60, l: 22, poW: 16, champ: true, hard: false, res: 'Champion', eraFrom: 1990, eraTo: 1999, eraLabel: '1990-1999', names: Array(10).fill('Some Player'), ach: ['Champion'] });

test('valid champion run is accepted and score is recomputed server-side', () => {
  const r = validateRun({ ...base(), score: 999999 });
  assert.equal(r.ok, true);
  assert.equal(r.run.score, 60 * 10 + 16 * 8 + 300);
});
test('hard mode multiplies, perfect season bonus applies', () => {
  assert.equal(computeScore({ wins: 82, poWins: 16, champion: true, hard: true }), Math.round((820 + 128 + 300 + 1000) * 1.5));
});
test('rejects impossible records', () => {
  for (const patch of [{ w: 83, l: -1 }, { w: 60, l: 21 }, { w: 1.5, l: 80.5 }, { w: '60', l: 22 }]) assert.equal(validateRun({ ...base(), ...patch }).ok, false);
});
test('rejects inconsistent playoff results', () => {
  assert.equal(validateRun({ ...base(), poW: 12 }).ok, false);                                   // champion needs 16
  assert.equal(validateRun({ ...base(), champ: false }).ok, false);                              // label mismatch
  assert.equal(validateRun({ ...base(), champ: false, res: 'Eliminated: First Round', poW: 9 }).ok, false);
  assert.equal(validateRun({ ...base(), champ: false, res: 'Eliminated: Conference Finals', poW: 9 }).ok, true);
  assert.equal(validateRun({ ...base(), champ: false, res: 'Missed playoffs', poW: 1 }).ok, false);
  assert.equal(validateRun({ ...base(), champ: false, res: 'Eliminated: Nonsense', poW: 1 }).ok, false);
});
test('rejects bad shapes and oversized arrays', () => {
  assert.equal(validateRun(null).ok, false);
  assert.equal(validateRun([]).ok, false);
  assert.equal(validateRun({ ...base(), names: Array(9).fill('x') }).ok, false);
  assert.equal(validateRun({ ...base(), names: Array(10).fill(5) }).ok, false);
  assert.equal(validateRun({ ...base(), ach: Array(31).fill('x') }).ok, false);
  assert.equal(validateRun({ ...base(), eraFrom: 2000, eraTo: 1990 }).ok, false);
});
test('strips markup and control characters from stored strings', () => {
  const r = validateRun({ ...base(), eraLabel: '<img src=x onerror=alert(1)>\u0000ok', names: Array(10).fill('<b>Hi</b>\n') });
  assert.equal(r.ok, true);
  assert.ok(!/[<>]/.test(r.run.eraLabel + r.run.roster.join('')));
});
test('public name shows first name and last initial only', () => {
  assert.equal(publicName('Ana', 'Kovacevic'), 'Ana K.');
  assert.equal(publicName('', ''), 'Coach');
  assert.equal(publicName('<script>', 'x'), 'script X.');
});
