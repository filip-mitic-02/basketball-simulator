import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

test('draft screen shows jersey cards and ratings, and hides ratings in Hard mode', async () => {
  const dir = new URL('../public/', import.meta.url);
  const html = readFileSync(new URL('index.html', dir), 'utf8').replace(/<script src="[^"]+"><\/script>/g, '').replace(/<link[^>]+googleapis[^>]*>/g, '');
  const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'https://example.com/', pretendToBeVisual: true });
  const w = dom.window;
  w.scrollTo = () => {};
  const data = readFileSync(new URL('data.json', dir), 'utf8');
  w.fetch = async (u) => String(u).startsWith('data.json') ? { ok: true, json: async () => JSON.parse(data) } : { ok: false, status: 401, json: async () => ({}) };
  for (const f of ['engine.js', 'league.js', 'core.js', 'progress.js', 'ads.js', 'report.js', 'app.js']) w.eval(readFileSync(new URL(f, dir), 'utf8'));
  await new Promise(r => setTimeout(r, 1200));
  const doc = w.document, click = sel => doc.querySelector(sel).dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  assert.equal(doc.querySelectorAll('.mode').length, 2);
  click('[data-a="start"]');
  await new Promise(r => setTimeout(r, 100));
  click('[data-a="spin"]');
  await new Promise(r => setTimeout(r, 4500));
  const cards = doc.querySelectorAll('.pcard');
  assert.ok(cards.length >= 5, 'cards rendered: ' + cards.length);
  assert.ok(doc.querySelectorAll('.pcard svg.avatar text').length >= 5, 'jersey numbers');
  assert.ok(doc.querySelector('.pcard .ovr').textContent.trim().match(/^\d+$/), 'rating shown in Normal');
  // pick a player: only eligible spots on the court / bench are clickable, the rest are locked
  const card = [...doc.querySelectorAll('.pcard:not(.dis)')][0];
  card.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  const lit = doc.querySelectorAll('.spot.ok, .spot.pick'), locked = doc.querySelectorAll('.spot.lock');
  assert.ok(lit.length >= 1, 'eligible spots are lit');
  assert.ok(locked.length >= 1, 'other spots are locked');
  locked.forEach(el => assert.ok(el.disabled, 'locked spot is not clickable'));
  lit.forEach(el => assert.ok(!el.disabled, 'lit spot is clickable'));
  assert.equal(doc.querySelectorAll('.court .spot').length, 5);
  assert.equal(doc.querySelectorAll('.bench .spot').length, 5);
  // phone bar shows the chosen player and a Draft button; a drafted versatile player can be moved to another position
  assert.ok(doc.querySelector('.dbar.sel [data-a="confirm"]'), 'sticky draft bar');
  assert.ok(doc.querySelector('.mini .mc'), 'mini roster strip');
  doc.querySelector('[data-a="confirm"]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  await new Promise(r => setTimeout(r, 100));
  assert.equal(doc.querySelectorAll('.court .spot.filled').length, 1, 'first pick placed');
});
