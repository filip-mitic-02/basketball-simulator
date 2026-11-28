import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

test('page boots as a guest and offers Google sign-in', async () => {
  const dir = new URL('../public/', import.meta.url);
  const html = readFileSync(new URL('index.html', dir), 'utf8').replace(/<script src="[^"]+"><\/script>/g, '').replace(/<link[^>]+googleapis[^>]*>/g, '');
  const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'https://example.com/', pretendToBeVisual: true });
  const w = dom.window;
  const data = readFileSync(new URL('data.json', dir), 'utf8');
  w.fetch = async (u) => {
    if (String(u).startsWith('data.json')) return { ok: true, json: async () => JSON.parse(data) };
    return { ok: false, status: 401, json: async () => ({}) };
  };
  for (const f of ['engine.js', 'league.js', 'core.js', 'report.js', 'app.js']) w.eval(readFileSync(new URL(f, dir), 'utf8'));
  await new Promise(r => setTimeout(r, 1500));
  assert.match(w.document.getElementById('acct').innerHTML, /Sign in(<span class="lg"> with Google<\/span>)?/);
  assert.match(w.document.getElementById('app').innerHTML, /Start draft/);
  assert.ok(!/claude\.ai/.test(w.document.body.innerHTML));
});
