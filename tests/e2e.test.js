import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as require_fs from 'node:fs';
import { JSDOM } from 'jsdom';
import { ApiError, opStart, opSpin, opPick, opState, opSubmit } from '../lib/draftlogic.js';
import { memStore } from './helpers/memstore.js';

// Drives the real client (app.js + core.js) in jsdom against the real server logic (in-memory store), signed in.
async function run(signedIn, comp = 'nba') {
  const dir = new URL('../public/', import.meta.url), store = memStore(), calls = [];
  const html = readFileSync(new URL('index.html', dir), 'utf8').replace(/<script src="[^"]+"><\/script>/g, '').replace(/<link[^>]+googleapis[^>]*>/g, '');
  const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'https://example.com/', pretendToBeVisual: true });
  const w = dom.window, data = { nba: readFileSync(new URL('data.json', dir), 'utf8'), el: readFileSync(new URL('data-el.json', dir), 'utf8') };
  w.setTimeout = (f) => setTimeout(f, 0);
  w.alert = () => {}; if (!w.crypto || !w.crypto.getRandomValues) Object.defineProperty(w, 'crypto', { value: globalThis.crypto });
  const json = (status, body) => ({ ok: status < 400, status, json: async () => body });
  w.fetch = async (u, o = {}) => {
    u = String(u);
    if (u.startsWith('data.json')) return json(200, JSON.parse(data.nba));
    if (u.startsWith('data-el.json')) return json(200, JSON.parse(data.el));
    if (u === '/api/me') return signedIn ? json(200, { user: { id: 'u1', name: 'Test U.' } }) : json(401, {});
    if (u.startsWith('/api/leaderboard')) return json(200, { board: [] });
    if (u === '/api/runs' && (!o.method || o.method === 'GET')) return json(200, { runs: [] });
    const b = o.body ? JSON.parse(o.body) : {};
    try {
      if (u === '/api/draft') {
        const fn = { start: () => opStart(store, 'u1', b), spin: () => opSpin(store, 'u1', b, false), respin: () => opSpin(store, 'u1', b, true), pick: () => opPick(store, 'u1', b), state: () => opState(store, 'u1', b) }[b.op];
        calls.push(b.op); return json(200, await fn());
      }
      if (u === '/api/runs') { calls.push('submit'); const out = await opSubmit(store, 'u1', { id: b.id, log: b.log }, true); return json(201, { summary: out.summary }); }
    } catch (e) { if (e instanceof ApiError) return json(e.status, { error: e.code }); throw e; }
    return json(404, {});
  };
  for (const f of ['engine.js', 'league.js', 'core.js', 'report.js', 'app.js']) w.eval(readFileSync(new URL(f, dir), 'utf8'));
  const doc = w.document, tick = (ms = 20) => new Promise(r => setTimeout(r, ms));
  const click = sel => { const el = doc.querySelector(sel); assert.ok(el, 'missing ' + sel); el.dispatchEvent(new w.MouseEvent('click', { bubbles: true })); };
  const until = async (fn, what, ms) => { for (let i = 0; i < (ms || 6000) / 10; i++) { if (fn()) return; await tick(10); } assert.fail('timeout: ' + what); };
  await until(() => /Start draft/.test(doc.getElementById('app').innerHTML), 'menu');
  await tick(50);
  if (comp === 'el') { click('[data-a=comp][data-v=el]'); await until(() => w.__S.comp === 'el' && /EuroLeague rosters/.test(doc.getElementById('app').innerHTML), 'EuroLeague menu'); }
  if (process.env.DUMP && comp === 'el') require_fs.writeFileSync('/tmp/elmenu.html', '<!doctype html>' + doc.documentElement.outerHTML);
  click('[data-a=start]');
  await until(() => /Draft &middot; pick|Draft · pick/.test(doc.getElementById('app').innerHTML), 'draft screen');
  for (let k = 0; k < 10; k++) {
    await until(() => doc.querySelector('[data-a=spin]'), 'spin button ' + k);
    click('[data-a=spin]');
    await until(() => doc.querySelector('.pcard:not(.dis)'), 'cards ' + k);
    click('.pcard:not(.dis)');
    await until(() => !doc.querySelector('[data-a=confirm][disabled]'), 'confirm enabled ' + k);
    click('[data-a=confirm]');
    if (k < 9) await until(() => /pick (\d+) of 10/.exec(doc.getElementById('app').innerHTML) && +/pick (\d+) of 10/.exec(doc.getElementById('app').innerHTML)[1] === k + 2, 'next pick ' + k);
  }
  if (process.env.DUMP && comp === 'el') require_fs.writeFileSync('/tmp/eldraft.html', '<!doctype html>' + doc.documentElement.outerHTML);
  await until(() => doc.querySelector('[data-a=beginSeason]'), 'prep screen');
  if (process.env.DUMP && comp === 'el') require_fs.writeFileSync('/tmp/elprep.html', '<!doctype html>' + doc.documentElement.outerHTML);
  assert.ok(doc.querySelector('.recbar'), 'tactic recommendations are shown on the prep screen');
  if (doc.querySelector('[data-a=applyrec]:not([disabled])')) { click('[data-a=applyrec]'); assert.ok(doc.querySelector('.tile.best.on'), 'applying selects the framed tactics'); }
  click('[data-a=beginSeason]');
  await until(() => doc.querySelector('[data-a=play]'), 'hub');
  if (process.env.DUMP && comp === 'el') require_fs.writeFileSync('/tmp/elhub.html', '<!doctype html>' + doc.documentElement.outerHTML);
  // one coached game with a timeout, a substitution window and a feed, then the rest of the season
  click('[data-a=play]');
  await until(() => doc.querySelector('[data-a=timeout]'), 'game screen');
  click('[data-a=timeout]');
  // the live loop at 8x: it keeps real-time pacing (about 1.5 s of wall clock per possession) and must advance without errors
  { const n0 = w.__S.G.log.length; click('[data-a=speed][data-v="8"]'); click('[data-a=resume]'); await until(() => w.__S.G.log.length >= n0 + 3, 'live loop advances', 15000); click('[data-a=pause]'); }
  click('[data-a=skipq]'); await tick(30);
  if (process.env.DUMP && comp === 'el') require_fs.writeFileSync('/tmp/elgame.html', '<!doctype html>' + doc.documentElement.outerHTML);
  click('[data-a=skipg]');
  await until(() => doc.querySelector('[data-a=finish]'), 'game over');
  click('[data-a=finish]');
  await until(() => doc.querySelector('[data-a=play]'), 'hub again');
  // a trade: give a player, pick one of three offers, confirm
  click('[data-a=gotrade]');
  await until(() => doc.querySelector('[data-a=tgive]'), 'trade screen');
  click('[data-a=tgive][data-i="4"]');
  await until(() => doc.querySelector('[data-a=tpos]:not([disabled])'), 'positions');
  click('[data-a=tpos]:not([disabled])');
  await until(() => doc.querySelectorAll('[data-a=toffer]').length >= 1, 'offers');
  if (process.env.DUMP) require_fs.writeFileSync('/tmp/trade.html', '<!doctype html>' + doc.documentElement.outerHTML);
  const gone = w.__S.user.players[4].name;
  click('[data-a=toffer][data-i="0"]'); click('[data-a=tconfirm]');
  await until(() => doc.querySelector('[data-a=play]'), 'hub after the trade');
  assert.notEqual(w.__S.user.players[4].name, gone, 'the traded player is replaced');
  // a second game played step by step, answering the interactive moments
  click('[data-a=play]');
  await until(() => doc.querySelector('[data-a=resume]'), 'second game');
  click('[data-a=speed][data-v="8"]');
  let moments = 0;
  for (let n = 0; n < 1500 && !doc.querySelector('[data-a=finish]'); n++) {
    if (doc.querySelector('.modal.moment [data-a=mochoice]:not([disabled])')) { moments++; click('.modal.moment [data-a=mochoice]:not([disabled])'); await tick(5); assert.ok(doc.querySelector('.modal.moment .mo-verdict'), 'the moment shows its outcome'); click('[data-a=mocont]'); }
    else if (!doc.querySelector('.modal.moment') && doc.querySelector('[data-a=resume]')) click('[data-a=resume]');
    await tick(5);
  }
  assert.ok(moments >= 2, 'at least two interactive moments in a coached game, got ' + moments);
  click('[data-a=finish]');
  await until(() => doc.querySelector('[data-a=simall]'), 'hub after moments');
  click('[data-a=simall]');
  await until(() => doc.querySelector('[data-a=startpo]') || /Playoffs|Season over/.test(doc.getElementById('app').innerHTML), 'season done');
  if (doc.querySelector('[data-a=startpo]')) click('[data-a=startpo]');
  for (let n = 0; n < 40 && !doc.querySelector('[data-a=newgame]'); n++) {
    if (process.env.DUMP && comp === 'el' && doc.querySelector('[data-a=simseries]') && !globalThis.__po) { globalThis.__po = 1; require_fs.writeFileSync('/tmp/elpo.html', '<!doctype html>' + doc.documentElement.outerHTML); }
    if (doc.querySelector('[data-a=simseries]')) click('[data-a=simseries]');
    await tick(5);
  }
  await until(() => doc.querySelector('[data-a=newgame]'), 'end screen');
  if (process.env.DUMP && comp === 'el') require_fs.writeFileSync('/tmp/elend.html', '<!doctype html>' + doc.documentElement.outerHTML);
  await until(() => !/Verifying/.test(doc.getElementById('saveInfo').textContent), 'verdict');
  return { text: doc.getElementById('saveInfo').textContent, calls, store, S: w.__S };
}

test('signed in: the whole game runs through the server and the season is verified by replay', async () => {
  const r = await run(true);
  assert.match(r.text, /verified and saved/);
  assert.equal(r.calls.filter(c => c === 'pick').length, 10);
  assert.equal(r.calls.at(-1), 'submit');
  assert.equal(r.store.runs.length, 1);
  assert.equal(r.store.runs[0].verified === undefined ? true : r.store.runs[0].verified, true);
  assert.equal(r.store.runs[0].wins, r.S.L.rec[0].w, 'client and server agree on the record');
});
test('guest: plays locally, nothing is sent to the server', async () => {
  const r = await run(false);
  assert.match(r.text, /Sign in with Google/);
  assert.deepEqual(r.calls, []);
});
test('EuroLeague: draft, 38-game season, playoffs and Final Four are verified by replay', async () => {
  const r = await run(true, 'el');
  assert.match(r.text, /verified and saved/);
  assert.equal(r.store.runs.length, 1);
  assert.equal(r.store.runs[0].comp, 'el');
  assert.equal(r.S.L.R.games, 38);
  assert.equal(r.store.runs[0].wins, r.S.L.rec[0].w, 'client and server agree on the record');
});
