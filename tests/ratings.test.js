import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

test('displayed ratings reward elite and triple-double seasons without inflating the rest', async () => {
  const dir = new URL('../public/', import.meta.url);
  const html = readFileSync(new URL('index.html', dir), 'utf8').replace(/<script src="[^"]+"><\/script>/g, '').replace(/<link[^>]+googleapis[^>]*>/g, '');
  const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'https://example.com/', pretendToBeVisual: true });
  const w = dom.window;
  const data = readFileSync(new URL('data.json', dir), 'utf8');
  w.fetch = async (u) => String(u).startsWith('data.json') ? { ok: true, json: async () => JSON.parse(data) } : { ok: false, status: 401, json: async () => ({}) };
  for (const f of ['engine.js', 'league.js', 'core.js', 'progress.js', 'ads.js', 'report.js', 'app.js']) w.eval(readFileSync(new URL(f, dir), 'utf8'));
  await new Promise(r => setTimeout(r, 1500));
  const S = w.__S, dp = w.__dp;
  const find = (nm, yr) => { for (const t of S.teams) if (t.season === yr) for (const p of t.players) if (p.name === nm) return p; };
  const wb17 = dp(find('Russell Westbrook', 2017)), wb18 = dp(find('Russell Westbrook', 2018)), wb19 = dp(find('Russell Westbrook', 2019));
  assert.ok(wb17 >= 96 && wb17 <= 99, 'MVP triple-double season: ' + wb17);
  assert.ok(wb18 >= 89, 'triple-double season: ' + wb18);
  assert.ok(wb19 >= 86, 'triple-double season, weaker efficiency: ' + wb19);
  assert.ok(wb17 > wb18 && wb18 > wb19);
  const all = S.teams.flatMap(t => t.players.map(p => dp(p))).sort((a, b) => a - b);
  const q = f => all[Math.floor(all.length * f)];
  assert.ok(q(0.5) >= 66 && q(0.5) <= 72, 'median ' + q(0.5));
  assert.ok(all[all.length - 1] <= 99);
  assert.ok(all.filter(v => v >= 97).length < 40, 'very few 97+');
  assert.ok(all.filter(v => v >= 95).length >= 25, 'MVP-level seasons reach 95+');
});
