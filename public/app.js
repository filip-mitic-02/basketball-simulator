/* 82-0 Coach: UI. Depends on Engine (engine.js) and League (league.js). */
(function () {
  'use strict';
  const E = Engine, LG = League;
  const app = document.getElementById('app');
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const MIN_Y = 1950, MAX_Y = 2026, MIN_POOL = 60;
  const PRESETS = [['All-Time', 1950, 2026], ['1950s', 1950, 1959], ['1960s', 1960, 1969], ['1970s', 1970, 1979], ['1980s', 1980, 1989], ['1990s', 1990, 1999], ['2000s', 2000, 2009], ['2010s', 2010, 2019], ['2020s', 2020, 2026]];
  const TEMPO_I = { slow: ['Slow', 'Fewer possessions and less fatigue. More variance, which helps the underdog.'], normal: ['Normal', 'Balanced pace and fatigue.'], fast: ['Fast', 'More possessions, which favors the better team. Costs stamina and turnovers.'], push: ['Push', 'Maximum pace. Wears players down and risks turnovers. Use it when chasing a lead.'] };
  const OFF_I = { balanced: ['Balanced', 'No bonus and no penalty.'], inside: ['Inside', 'Feeds the bigs. Pays off only with 2+ bigs on the floor.'], threes: ['Threes', 'More three-point attempts. Works only with real shooters on the floor.'], ballmove: ['Ball movement', 'Spreads shots and adds assists. Best with strong passers.'], iso: ['Isolation', 'Your star takes over. Pays off only with a 80+ overall player.'] };
  const DEF_I = { man: ['Man', 'Standard defense.'], zone: ['Zone', 'Protects the paint and cuts fouls, but gives up threes.'], press: ['Press', 'More steals and turnovers. Tires your players and gives easier shots when beaten.'] };
  const AUTO_D = { auto: 'The coach manages rotations and fatigue for you, including foul trouble and garbage time.', forced: 'Players are only replaced when they foul out or are exhausted. You control everything else.', manual: 'No automatic substitutions at all. Fouled-out players are still removed.' };
  const AUTO_I = { auto: 'Automatic', forced: 'Forced only', manual: 'Manual' };

  const S = {
    screen: 'loading', from: 1980, to: 1999, hard: false, teams: [], pool: [], D: null, user: null, plan: null, L: null, G: null, live: null,
    acct: null, runs: [], board: [], saved: false, teamName: 'My Team', coachBack: 'hub', revealed: false
  };

  // ---------- helpers ----------
  const pct = v => (v == null || v === 0) ? '--' : (v * 100).toFixed(1);
  const dec = v => v == null ? '--' : v.toFixed(1);
  const od = v => Math.min(99, Math.round(55 + (v - 30) * 0.62));
  const LEGACY = { 'Šampion': 'Champion', 'Sampion': 'Champion', 'Prvak': 'Champion', 'Nije u plejofu': 'Missed playoffs', 'Propustio plejof': 'Missed playoffs' };
  const trRes = s => { s = String(s == null ? '' : s); if (LEGACY[s]) return LEGACY[s]; return s.replace(/^Eliminisan:\s*/i, 'Eliminated: ').replace('Šampion', 'Champion'); };
  const ovrCls = v => v >= 85 ? 't4' : v >= 70 ? 't3' : v >= 55 ? 't2' : 't1';
  const rnd = n => Math.floor(Math.random() * n);
  const mmss = c => Math.floor(c / 60) + ':' + String(c % 60).padStart(2, '0');
  const eraLabel = () => (S.from === MIN_Y && S.to === MAX_Y) ? 'All-Time' : S.from + '-' + S.to;
  function hueOf(key) { let h = 0; for (const c of String(key)) h = (h * 31 + c.charCodeAt(0)) % 360; return h; }
  function crest(tm, size, hue) {
    tm = String(tm || '?').slice(0, 4); hue = hue == null ? hueOf(tm) : hue; size = size || 28;
    return `<svg class="crest" width="${size}" height="${Math.round(size * 1.12)}" viewBox="0 0 32 36" aria-hidden="true"><path d="M16 1 30 6v12c0 9-7 15-14 17C9 33 2 27 2 18V6z" fill="hsl(${hue} 55% 28%)" stroke="hsl(${hue} 75% 62%)" stroke-width="1.6"/><path d="M16 1 30 6v7H2V6z" fill="hsl(${hue} 65% 45%)" opacity=".5"/><text x="16" y="25" text-anchor="middle" font-family="Barlow Condensed,sans-serif" font-weight="800" font-size="${tm.length > 3 ? 8.5 : 11}" fill="#fff">${esc(tm)}</text></svg>`;
  }
  function avatar(name, hue, size) {
    size = size || 40;
    const ini = String(name).split(/\s+/).filter(Boolean).map(w => w[0]).slice(0, 2).join('').toUpperCase();
    return `<svg class="avatar" width="${size}" height="${size}" viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="19" fill="hsl(${hue} 40% 22%)" stroke="hsl(${hue} 55% 50%)" stroke-width="1.5"/><path d="M6 36c2-8 8-11 14-11s12 3 14 11" fill="hsl(${hue} 45% 32%)"/><circle cx="20" cy="15" r="6.5" fill="hsl(${hue} 35% 55%)"/><text x="20" y="38.5" text-anchor="middle" font-family="Barlow Condensed,sans-serif" font-weight="700" font-size="9" fill="#fff" opacity=".0">${esc(ini)}</text></svg>`;
  }
  function go(screen) { S.screen = screen; render(); window.scrollTo(0, 0); }
  function render() {
    if (S.screen !== 'game') stopLive();
    app.innerHTML = (SCREENS[S.screen] || SCREENS.menu)();
    if (AFTER[S.screen]) AFTER[S.screen]();
  }
  function setPool() { S.pool = S.teams.filter(t => t.season >= S.from && t.season <= S.to); }
  function posChips(p) {
    const base = (p.elig || p.pos || '').split(',');
    const all = E.eligible(p);
    return `<span class="pos">${all.map(x => base.includes(x) ? `<b>${x}</b>` : `<i>${x}</i>`).join('')}</span>`;
  }

  // ---------- account (Google sign-in via the server, session cookie is HttpOnly) ----------
  async function api(path, opts) {
    opts = opts || {};
    const r = await fetch(path, Object.assign({ credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-Requested-With': '82-0-coach' } }, opts));
    if (!r.ok) { const err = new Error('http ' + r.status); err.status = r.status; throw err; }
    return r.json();
  }
  function renderAcct() {
    const el = document.getElementById('acct');
    if (S.acct) el.innerHTML = 'Signed in as <b>' + esc(S.acct.name) + '</b> <button class="btn sm" data-a="logout">Sign out</button>';
    else el.innerHTML = '<a class="btn sm pri" href="/api/auth/login">Sign in with Google</a>';
  }
  async function initAccount() {
    try {
      const me = await api('/api/me');
      if (me && me.user) S.acct = { id: me.user.id, name: me.user.name };
    } catch (e) { /* guest or no backend */ }
    renderAcct();
    await loadProfile();
    if (S.screen === 'menu') render();
  }
  async function loadProfile() {
    try { S.board = (await api('/api/leaderboard')).board || []; } catch (e) { S.board = []; }
    if (!S.acct) { S.runs = []; return; }
    try { S.runs = (await api('/api/runs')).runs || []; } catch (e) { S.runs = []; }
  }
  async function saveRun(run) {
    if (!S.acct) return false;
    try {
      await api('/api/runs', { method: 'POST', body: JSON.stringify({ w: run.w, l: run.l, poW: run.poW, champ: run.champ, hard: run.hard, res: run.res, eraFrom: run.eraFrom, eraTo: run.eraTo, eraLabel: run.eraLabel, names: run.names, ach: run.ach }) });
      await loadProfile();
      return true;
    } catch (e) { return false; }
  }

  // ---------- screens ----------
  const SCREENS = {}, AFTER = {};
  SCREENS.loading = () => '<div class="loading">Loading player database…</div>';

  const ICON_OPEN = '<svg viewBox="0 0 54 54" aria-hidden="true"><rect x="3" y="12" width="48" height="30" rx="5" fill="none" stroke="#ffb627" stroke-width="2.4"/><path d="M3 27C11 15 43 15 51 27 43 39 11 39 3 27z" fill="none" stroke="#ffb627" stroke-width="2.4" transform="translate(0 0) scale(1 .6) translate(0 18)"/><circle cx="27" cy="27" r="6" fill="#ffb627"/></svg>';
  const ICON_BLIND = '<svg viewBox="0 0 54 54" aria-hidden="true"><rect x="3" y="12" width="48" height="30" rx="5" fill="none" stroke="#ffb627" stroke-width="2.4"/><path d="M12 22h30M12 28h30M12 34h30" stroke="#ffb627" stroke-width="2.4" stroke-linecap="round" stroke-dasharray="3 5"/></svg>';

  function rangeHtml() {
    const pc = y => ((y - MIN_Y) / (MAX_Y - MIN_Y) * 100);
    const ticks = [1950, 1960, 1970, 1980, 1990, 2000, 2010, 2020, 2026].map(y => `<span style="left:${pc(y)}%">${y}</span>`).join('');
    return `<div class="range" id="range"><div class="track"><div class="fill" id="rfill" style="left:${pc(S.from)}%;right:${100 - pc(S.to)}%"></div></div>
      <input type="range" id="rf" min="${MIN_Y}" max="${MAX_Y}" value="${S.from}" aria-label="From season">
      <input type="range" id="rt" min="${MIN_Y}" max="${MAX_Y}" value="${S.to}" aria-label="To season"><div class="ticks">${ticks}</div></div>`;
  }
  function eraInfo() {
    const n = S.pool.length;
    const lim = S.from < 1974;
    return `${n} team-seasons in the pool. ` + (n < MIN_POOL ? '<b class="warn">Widen the range (at least ' + MIN_POOL + ' needed).</b> ' : '') + (lim ? 'Before 1974 the database has no blocks, steals or turnovers, so those players have limited stats.' : 'Full statistics for every player.');
  }
  SCREENS.menu = () => {
    const runs = S.runs || [];
    const best = runs.slice().sort((a, b) => (b.score || 0) - (a.score || 0))[0];
    const titles = runs.filter(r => r.champ).length, perfect = runs.filter(r => r.w === 82).length;
    return `
    <div class="hero">
      <div>
        <h1>Draft <em>10</em>.<br>Coach them to <em>82-0</em>.</h1>
        <p>Spin a team and a season, pick one player from that roster, and fill two spots at every position. Then coach the season game by game, quarter by quarter: substitutions, tempo, defense, timeouts. Then the playoffs.</p>
      </div>
      <div class="board">
        <div class="muted" style="font-family:var(--display);letter-spacing:.14em;text-transform:uppercase">The target</div>
        <div class="led big num">82&ndash;0</div>
        <div class="muted">${S.acct ? (best ? 'Your best: <b class="led">' + best.w + '-' + best.l + '</b> &middot; ' + esc(trRes(best.res)) + ' &middot; ' + titles + ' titles &middot; ' + perfect + ' perfect seasons' : 'No saved seasons yet.') : 'Playing as guest: results are not saved. Sign in with Google to keep your results and achievements.'}</div>
      </div>
    </div>
    <div class="panel setup">
      <div>
        <div class="eyebrow">Era</div>
        <div class="yr"><span class="led num" id="yrtxt">${S.from === MIN_Y && S.to === MAX_Y ? 'All-Time' : S.from + ' &ndash; ' + S.to}</span><span class="muted">${S.hard ? '' : ''}</span></div>
        ${rangeHtml()}
        <div class="row" style="margin-top:6px"><div class="seg" id="presets">${PRESETS.map(p => `<button class="${S.from === p[1] && S.to === p[2] ? 'on' : ''}" data-a="preset" data-f="${p[1]}" data-t="${p[2]}">${p[0]}</button>`).join('')}</div></div>
        <div class="note" id="eranote" style="margin-top:10px">${eraInfo()}</div>
      </div>
      <div>
        <div class="eyebrow">Draft mode</div>
        <div class="modes">
          <button class="mode ${!S.hard ? 'on' : ''}" data-a="hard" data-v="0">${ICON_OPEN}<div><h3>Normal</h3><p>See every player's stats and overall before you pick.</p></div></button>
          <button class="mode ${S.hard ? 'on' : ''}" data-a="hard" data-v="1">${ICON_BLIND}<div><h3>Hard</h3><p>Stats and overalls are hidden. One Scout per draft reveals a full roll. Score x1.5.</p></div></button>
        </div>
        <div class="note" style="margin-top:8px">The season plays exactly the same in both modes. Hard only changes how you draft.</div>
      </div>
      <div class="row"><button class="btn pri" data-a="start" id="startbtn" ${S.pool.length < MIN_POOL ? 'disabled' : ''}>Start draft</button><span class="note">Opponents are 29 historical rosters from the same era.</span></div>
    </div>
    <div class="two" style="margin-top:18px">
      <div class="panel"><div class="eyebrow">Leaderboard</div>${boardHtml()}</div>
      <div class="panel"><div class="eyebrow">Your seasons</div>${runsHtml()}</div>
    </div>`;
  };
  function boardHtml() {
    if (!S.board.length) return '<p class="note">No entries yet. Finish a season to get on the board.</p>';
    return '<div class="tw"><table><tr><th>#</th><th>Coach</th><th class="r">Record</th><th>Result</th><th class="r">Score</th></tr>' +
      S.board.map((b, i) => `<tr><td>${i + 1}</td><td>${esc(b.name)}</td><td class="r num">${b.w}-${b.l}</td><td>${esc(trRes(b.res))}${b.hard ? ' &middot; Hard' : ''}</td><td class="r num">${b.score}</td></tr>`).join('') + '</table></div>';
  }
  function runsHtml() {
    if (!S.acct) return '<p class="note">Sign in with Google to save your seasons and achievements.</p>';
    if (!S.runs.length) return '<p class="note">No saved seasons yet.</p>';
    return '<div class="tw"><table><tr><th>Record</th><th>Result</th><th>Mode</th><th class="r">Score</th></tr>' +
      S.runs.slice(0, 8).map(r => `<tr><td class="num">${r.w}-${r.l}</td><td>${esc(trRes(r.res))}</td><td>${r.hard ? 'Hard' : 'Normal'} &middot; ${esc(r.eraLabel || '')}</td><td class="r num">${r.score}</td></tr>`).join('') + '</table></div>';
  }
  function updateRangeUI() {
    const pc = y => ((y - MIN_Y) / (MAX_Y - MIN_Y) * 100);
    const f = document.getElementById('rfill'); if (!f) return;
    f.style.left = pc(S.from) + '%'; f.style.right = (100 - pc(S.to)) + '%';
    document.getElementById('yrtxt').innerHTML = S.from === MIN_Y && S.to === MAX_Y ? 'All-Time' : S.from + ' &ndash; ' + S.to;
    document.getElementById('eranote').innerHTML = eraInfo();
    document.getElementById('startbtn').disabled = S.pool.length < MIN_POOL;
    document.querySelectorAll('#presets button').forEach(b => b.classList.toggle('on', +b.dataset.f === S.from && +b.dataset.t === S.to));
  }

  // ---------- DRAFT ----------
  function newDraft() {
    S.D = { round: 0, picks: [], cur: null, phase: 'idle', skips: 2, sel: null, reel: null, scouts: S.hard ? 1 : 0, scoutedId: null };
    S.revealed = false;
  }
  function pickable(t) { const have = new Set(S.D.picks.map(p => p.name)); return t.players.filter(p => !have.has(p.name) && E.canAdd(S.D.picks, p)); }
  function randomTeam() {
    for (let i = 0; i < 120; i++) { const t = S.pool[rnd(S.pool.length)]; if (pickable(t).length >= 3) return t; }
    for (let i = 0; i < 400; i++) { const t = S.pool[rnd(S.pool.length)]; if (pickable(t).length >= 1) return t; }
    return S.pool[rnd(S.pool.length)];
  }
  function doSpin(isRespin) {
    const D = S.D;
    if (D.phase === 'spinning' || D.round >= 10) return;
    if (isRespin) { if (D.skips <= 0) return; D.skips--; }
    D.phase = 'spinning'; D.sel = null;
    const final = randomTeam();
    let n = 0;
    const tick = () => {
      n++; D.reel = S.pool[rnd(S.pool.length)]; updateReels();
      if (n < 16) setTimeout(tick, 60 + n * 8);
      else { D.cur = final; D.reel = final; D.phase = 'choose'; render(); }
    };
    render(); tick();
  }
  function updateReels() {
    const t = S.D.reel, a = document.getElementById('reelT'), y = document.getElementById('reelY'), c = document.getElementById('reelC');
    if (a && t) { a.textContent = t.name; y.textContent = t.season; c.innerHTML = crest(t.tm, 54); }
  }
  const statsVisible = () => !S.hard || S.revealed || (S.D && S.D.scoutedId && S.D.cur && S.D.scoutedId === S.D.cur.id);
  function playerCard(p, i) {
    const D = S.D, t = D.cur, hue = hueOf(t.tm);
    const taken = D.picks.some(x => x.name === p.name);
    const fits = !taken && E.canAdd(D.picks, p);
    const dis = taken || !fits;
    const vis = statsVisible();
    const st = (l, v) => `<div>${l}<b>${vis ? v : '&nbsp;'}</b></div>`;
    return `<button class="pcard ${D.sel === i ? 'sel' : ''} ${dis ? 'dis' : ''}" style="--h:${hue}" data-a="sel" data-i="${i}" ${dis ? 'aria-disabled="true"' : ''}>
      <div class="hd">${crest(t.tm, 20)}<span>${t.season} ${esc(t.tm)}</span><span class="ovr ${vis ? ovrCls(p.ovr) : 'tq'}" style="font-size:24px">${vis ? od(p.ovr) : '??'}</span></div>
      <div class="bd"><div class="who">${avatar(p.name, hue, 44)}<div><div class="nm">${esc(p.name)}</div>${posChips(p)}</div></div>
        <div class="stats ${vis ? '' : 'hid'}">${st('PTS', dec(p.ppg))}${st('REB', dec(p.rpg))}${st('AST', dec(p.apg))}${st('MIN', dec(p.mpg))}${st('STL', dec(p.spg))}${st('BLK', dec(p.bpg))}${st('FG%', pct(p.fg))}${st('3P%', pct(p.tp))}</div>
      </div>${fitBadge(p, taken, fits)}</button>`;
  }
  function fitPositions(p) {
    const orig = E.eligible(p).slice(), out = [];
    for (const pos of orig) { p._el = [pos]; if (E.canAdd(S.D.picks, p)) out.push(pos); }
    p._el = orig; return out;
  }
  const IC_OK = '<svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M2.5 7.5 5.5 10.5 11.5 3.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const IC_NO = '<svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M3 3l8 8M11 3l-8 8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
  const IC_TAKEN = '<svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><circle cx="7" cy="7" r="5.2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M4.5 7h5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
  function fitBadge(p, taken, fits) {
    if (taken) return `<div class="fit tk">${IC_TAKEN}<span>On your roster</span></div>`;
    if (!fits) return `<div class="fit no">${IC_NO}<span>No open slot</span><em>${E.eligible(p).map(x => `<b>${x}</b>`).join('')} full</em></div>`;
    return `<div class="fit ok">${IC_OK}<span>Fits roster</span><em>fills ${fitPositions(p).map(x => `<b>${x}</b>`).join('')}</em></div>`;
  }
  function rosterPanel() {
    const D = S.D, P = D.picks;
    const as = P.length ? E.assign(P) : [];
    const byPos = {}; E.POS.forEach(x => byPos[x] = []);
    P.forEach((p, i) => { byPos[as[i] || E.eligible(p)[0]].push(p); });
    const vis = !S.hard || S.revealed;
    const slotHtml = p => p ? `<div class="slot full">${crest(p.fromTm, 22)}<div class="who"><b>${esc(p.name)}</b><span>${p.fromSeason} ${esc(p.fromTm)}</span></div>${vis ? `<div class="ovr ${ovrCls(p.ovr)}">${od(p.ovr)}</div>` : ''}</div>` : '<div class="slot empty">open</div>';
    const grp = E.POS.map(pos => `<div class="sgrp"><div class="lb">${pos}</div>${slotHtml(byPos[pos][0])}${slotHtml(byPos[pos][1])}</div>`).join('');
    const avg = P.length && vis ? (P.reduce((a, p) => a + od(p.ovr), 0) / P.length).toFixed(1) : '--';
    return `<div class="panel"><div class="eyebrow">Roster ${P.length}/10</div><div class="slots">${grp}</div>
      <div class="note" style="margin-top:10px">Two players per position. Versatile players can fill more than one position, so you can't stack five centers.${vis ? ' Team average: <b>' + avg + '</b>' : ' Ratings are hidden until the draft ends.'}</div></div>`;
  }
  SCREENS.draft = () => {
    const D = S.D;
    const t = D.phase === 'choose' ? D.cur : D.reel;
    const reel = `<div class="reelbox ${D.phase === 'spinning' ? 'spin' : ''}"><div id="reelC">${t ? crest(t.tm, 54) : ''}</div><div class="t"><small>Team</small><div class="v" id="reelT">${t ? esc(t.name) : 'Spin to start'}</div></div><div class="y led num" id="reelY">${t ? t.season : '----'}</div></div>`;
    const acts = D.phase === 'choose'
      ? `<div class="actions"><button class="btn pri" data-a="confirm" ${D.sel == null ? 'disabled' : ''}>Draft player</button>
         <button class="btn ghost" data-a="respin" ${D.skips <= 0 ? 'disabled' : ''}>Re-spin &middot; ${D.skips} left</button>
         ${S.hard ? `<button class="btn sm" data-a="scout" ${(D.scouts <= 0 || D.scoutedId === D.cur.id) ? 'disabled' : ''}>Scout this roll &middot; ${D.scouts} left</button>` : ''}</div>`
      : D.phase === 'idle' ? `<div class="actions"><button class="btn pri" data-a="spin">Spin</button><button class="btn ghost" disabled>Re-spin &middot; ${D.skips} left</button></div>`
        : '<div class="actions"><div class="note">Spinning...</div></div>';
    let placer = '';
    if (D.phase === 'choose' && D.sel != null) {
      const sp = D.cur.players[D.sel], fp = fitPositions(sp);
      placer = `<div class="placer"><div class="pl-h"><b>Place ${esc(sp.name)} at</b><span>Greyed-out positions are full or not playable for him.</span></div><div class="pl-b">${E.POS.map(x => `<button class="posbtn ${D.selPos === x ? 'on' : ''}" data-a="place" data-v="${x}" ${fp.includes(x) ? '' : 'disabled'}>${x}</button>`).join('')}</div></div>`;
    }
    let cards = '';
    if (D.phase === 'choose') cards = `<div class="eyebrow">${D.cur.season} ${esc(D.cur.name)} &middot; choose one player</div><div class="cards">${D.cur.players.map((p, i) => playerCard(p, i)).join('')}</div>`;
    else if (D.phase === 'idle') cards = '<p class="note">Spin to get a random team and season, then pick one player from that roster.</p>';
    return `<div class="row" style="justify-content:space-between;margin-bottom:12px"><h2 style="font-size:36px">Draft &middot; pick ${Math.min(D.round + 1, 10)} of 10</h2>
      <div class="row"><span class="pill">${S.hard ? 'Hard' : 'Normal'}</span><span class="pill">${eraLabel()}</span></div></div>
      <div class="grid2"><div><div class="stage">${reel}${acts}</div>${placer}${cards}</div>${rosterPanel()}</div>`;
  };

  // ---------- coach panel ----------
  function tiles(obj, cur, act) {
    return `<div class="tiles">${Object.keys(obj).map(k => `<button class="tile ${cur === k ? 'on' : ''}" data-a="${act}" data-v="${k}"><b>${obj[k][0]}</b><span>${obj[k][1]}</span></button>`).join('')}</div>`;
  }
  function coachPanel() {
    const P = S.user.players, plan = S.plan, tot = plan.mins.reduce((a, b) => a + b, 0);
    const five = plan.starters.map((pi, k) => {
      const p = P[pi];
      return `<div class="starter"><div class="sl">${esc(p.slot)}</div><div class="sw">${crest(p.fromTm, 30)}<div><b>${esc(p.name)}</b><span>${p.fromSeason} ${esc(p.fromTm)}</span></div><div class="ovr ${ovrCls(p.ovr)}" style="margin-left:auto">${od(p.ovr)}</div></div>
        <select data-a="starter" data-k="${k}" aria-label="Starter ${k + 1}">${P.map((q, i) => `<option value="${i}" ${pi === i ? 'selected' : ''}>${esc(q.name)} (${esc(q.slot)})</option>`).join('')}</select></div>`;
    }).join('');
    const rows = P.map((p, i) => `<tr><td><div class="rn">${crest(p.fromTm, 20)}<div><b>${esc(p.name)}</b><span>${p.fromSeason} ${esc(p.fromTm)}</span></div></div></td>
      <td><span class="pill">${esc(p.slot)}</span></td><td class="r"><span class="ovr ${ovrCls(p.ovr)}" style="font-size:20px">${od(p.ovr)}</span></td>
      <td class="r num">${dec(p.ppg)}</td><td class="r num">${dec(p.rpg)}</td><td class="r num">${dec(p.apg)}</td>
      <td><div class="mrow"><input class="mins" type="range" min="0" max="44" step="1" value="${plan.mins[i]}" data-a="mins" data-i="${i}" aria-label="Minutes for ${esc(p.name)}"><span class="num mv" id="m${i}">${plan.mins[i]}</span></div></td></tr>`).join('');
    return `<div class="coach-grid">
      <div class="cl">
        <div class="panel"><div class="eyebrow">Starting five</div><div class="five">${five}</div></div>
        <div class="panel" style="margin-top:16px"><div class="eyebrow">Rotation and minutes</div>
          <div class="tw"><table class="rot-t"><tr><th>Player</th><th>Slot</th><th class="r">OVR</th><th class="r">PTS</th><th class="r">REB</th><th class="r">AST</th><th>Target minutes</th></tr>${rows}</table></div>
          <div class="mtotal ${tot === 240 ? 'ok' : ''}"><span>Total target minutes</span><b class="num"><span id="mtot">${tot}</span> / 240</b></div>
          <div class="note">Targets steer automatic substitutions. In close late-game situations your best players stay on regardless.</div>
          <div style="margin-top:10px"><button class="btn sm" data-a="resetplan">Reset rotation to recommended</button></div></div>
      </div>
      <div class="cr">
        <div class="panel"><div class="eyebrow">Tempo</div>${tiles(TEMPO_I, plan.tempo, 'tempo')}</div>
        <div class="panel" style="margin-top:16px"><div class="eyebrow">Offense</div>${tiles(OFF_I, plan.off, 'off')}</div>
        <div class="panel" style="margin-top:16px"><div class="eyebrow">Defense</div>${tiles(DEF_I, plan.def, 'def')}</div>
        <div class="panel" style="margin-top:16px"><div class="eyebrow">Substitutions in games</div>
          <div class="tiles">${Object.keys(AUTO_I).map(k => `<button class="tile ${plan.auto === k ? 'on' : ''}" data-a="auto" data-v="${k}"><b>${AUTO_I[k]}</b><span>${k === 'auto' ? 'The assistant coach rotates by your minute targets, fatigue and fouls.' : k === 'forced' ? 'Only fouled-out players are replaced. You do the rest.' : 'No automatic changes. Quick sims still rotate automatically.'}</span></button>`).join('')}</div></div>
      </div></div>`;
  }
  const teamAvg = () => (S.user.players.reduce((a, p) => a + od(p.ovr), 0) / S.user.players.length).toFixed(1);
  SCREENS.prep = () => `<div class="row" style="justify-content:space-between;margin-bottom:12px"><h2 style="font-size:36px">Roster complete</h2>
      <div class="row"><input type="text" id="tname" value="${esc(S.teamName)}" maxlength="24" aria-label="Team name"><button class="btn pri" data-a="beginSeason">Start season</button></div></div>
      ${S.hard ? '<div class="banner">Hard mode: your players are revealed so you can set the rotation.</div>' : ''}
      <p class="note">Team average overall <b>${teamAvg()}</b>. Set your starting five, minutes and tactics. You can change all of this during the season, and live in games during quarter breaks and timeouts.</p>${coachPanel()}`;
  SCREENS.coach = () => `<div class="row" style="justify-content:space-between;margin-bottom:12px"><h2 style="font-size:36px">Tactics</h2><button class="btn pri" data-a="coachBack">Back</button></div>${coachPanel()}`;

  // ---------- season hub ----------
  function oppSummary(idx) { const t = S.L.teams[idx], top = t.players.slice().sort((a, b) => b.ovr - a.ovr).slice(0, 3); return { t, top, ovr: E.teamOvr(t, S.L.plans[idx]) }; }
  function standingsHtml() {
    const L = S.L, all = S.standAll, st = LG.standings(L).filter(x => all || x.conf === L.conf[0]);
    const tg = `<div class="tabs" style="margin-bottom:8px"><button class="chip ${all ? '' : 'on'}" data-a="stand" data-v="0">My conference</button><button class="chip ${all ? 'on' : ''}" data-a="stand" data-v="1">Full league</button></div>`;
    return tg + `<div class="tw"><table><tr><th>#</th><th>Team</th><th class="r">W</th><th class="r">L</th><th class="r">+/-</th></tr>` +
      st.map((x, i) => `<tr class="${x.i === 0 ? 'me' : ''}"><td>${i + 1}</td><td>${x.i === 0 ? '<b>' + esc(S.teamName) + '</b>' : esc(x.team.label)}</td><td class="r num">${x.w}</td><td class="r num">${x.l}</td><td class="r num">${x.w + x.l ? (x.diff / (x.w + x.l)).toFixed(1) : '0.0'}</td></tr>`).join('') + '</table></div>';
  }
  function statsHtml() {
    const L = S.L, P = S.user.players;
    return `<div class="tw"><table><tr><th>Player</th><th class="r">G</th><th class="r">MIN</th><th class="r">PTS</th><th class="r">REB</th><th class="r">AST</th><th class="r">FG%</th></tr>` +
      P.map((p, i) => { const a = L.agg[i], g = a.g || 1; return `<tr><td>${esc(p.name)}</td><td class="r num">${a.g}</td><td class="r num">${(a.sec / 60 / g).toFixed(1)}</td><td class="r num">${(a.pts / g).toFixed(1)}</td><td class="r num">${(a.reb / g).toFixed(1)}</td><td class="r num">${(a.ast / g).toFixed(1)}</td><td class="r num">${a.fga ? (100 * a.fgm / a.fga).toFixed(1) : '--'}</td></tr>`; }).join('') + '</table></div>';
  }
  function pipsHtml() {
    const L = S.L; let h = '';
    for (let i = 0; i < 82; i++) { const g = L.userGames[i]; h += `<i class="${g ? (g.win ? 'w' : 'l') : (i === L.userGames.length ? 'n' : '')}" title="Game ${i + 1}"></i>`; }
    return `<div class="pips">${h}</div>`;
  }
  function lastGames() {
    const L = S.L, gs = L.userGames.slice(-8).reverse();
    if (!gs.length) return '<p class="note">No games played yet.</p>';
    return '<div class="tw"><table>' + gs.map(g => `<tr><td class="num">${g.day + 1}</td><td><span class="res ${g.win ? 'W' : 'L'}">${g.win ? 'W' : 'L'}</span></td><td class="num">${g.us}-${g.them}${g.ot ? ' (OT)' : ''}</td><td>${g.home ? 'vs' : '@'} ${esc(L.teams[g.opp].label)}</td></tr>`).join('') + '</table></div>';
  }

  // ---------- awards ----------
  function awardsHtml(L) {
    const A = L.awards || LG.computeAwards(L), f = v => v.toFixed(1);
    const card = (t, x, sub) => x ? `<div class="awc ${x.isUser ? 'me' : ''}"><div class="al">${t}</div><div class="an">${esc(x.name)}</div><div class="at">${x.isUser ? esc(S.teamName) : esc(x.team)}</div><div class="as">${sub}</div></div>` : '';
    const lead = (t, x, k) => x ? card(t, x, f(x[k]) + ' per game') : '';
    const teams = (arr, names) => arr.map((tm, i) => `<div class="awt"><div class="al">${names[i]}</div>${tm.map(x => `<div class="awp ${x.isUser ? 'me' : ''}"><span class="pill">${x.grp}</span><b>${esc(x.name)}</b><em>${x.isUser ? esc(S.teamName) : esc(x.team)}</em></div>`).join('')}</div>`).join('');
    return `<div class="awg">${card('Most Valuable Player', A.mvp, f(A.mvp.ppg) + ' pts &middot; ' + f(A.mvp.rpg) + ' reb &middot; ' + f(A.mvp.apg) + ' ast')}
      ${card('Defensive Player of the Year', A.dpoy, f(A.dpoy.spg) + ' stl &middot; ' + f(A.dpoy.bpg) + ' blk')}
      ${A.sixth ? card('Sixth Man of the Year', A.sixth, f(A.sixth.ppg) + ' pts off the bench') : ''}
      <div class="awc ${A.coach.isUser ? 'me' : ''}"><div class="al">Coach of the Year</div><div class="an">${A.coach.isUser ? 'You' : esc(A.coach.team)}</div><div class="at">${A.coach.w}&ndash;${A.coach.l}</div></div></div>
      <div class="awg" style="margin-top:10px">${lead('Scoring leader', A.leaders.pts, 'ppg')}${lead('Rebounding leader', A.leaders.reb, 'rpg')}${lead('Assists leader', A.leaders.ast, 'apg')}${lead('Steals leader', A.leaders.stl, 'spg')}${lead('Blocks leader', A.leaders.blk, 'bpg')}</div>
      <div class="eyebrow" style="margin-top:16px">All-League</div><div class="awts">${teams(A.allLeague, ['First Team', 'Second Team', 'Third Team'])}</div>
      <div class="eyebrow" style="margin-top:16px">All-Defensive</div><div class="awts">${teams(A.allDef, ['First Team', 'Second Team'])}</div>`;
  }
  function poAwardsHtml(L) {
    const P = L.poAwards || LG.poAwards(L); if (!P || !P.finals) return '';
    const f = v => v.toFixed(1), c = P.champ === 0 ? S.teamName : L.teams[P.champ].label;
    const card = (t, x) => x ? `<div class="awc ${x.isUser ? 'me' : ''}"><div class="al">${t}</div><div class="an">${esc(x.name)}</div><div class="at">${x.isUser ? esc(S.teamName) : esc(x.team)}</div><div class="as">${f(x.ppg)} pts &middot; ${f(x.rpg)} reb &middot; ${f(x.apg)} ast</div></div>` : '';
    return `<div class="awg"><div class="awc champ"><div class="al">Champions</div><div class="an">${esc(c)}</div><div class="at">${P.champ === 0 ? 'That is you' : ''}</div></div>${card('Finals MVP', P.finals.mvp)}${P.confs.map((x, i) => card('Conference Finals MVP', x.mvp)).join('')}</div>`;
  }

  SCREENS.hub = () => {
    const L = S.L, r = L.rec[0];
    if (L.phase === 'seasonDone') {
      return `<div class="panel" style="text-align:center;padding:40px 16px"><div class="muted" style="font-family:var(--display);letter-spacing:.14em;text-transform:uppercase">Regular season complete</div>
        <div class="rec led num">${r.w}&ndash;${r.l}</div>${r.l === 0 ? '<h2 style="color:var(--good)">Undefeated. 82-0.</h2>' : ''}
        <p class="note">Conference seed: ${LG.standings(L).filter(x => x.conf === L.conf[0]).findIndex(x => x.i === 0) + 1}</p>${pipsHtml()}
        <div style="margin-top:20px"><button class="btn pri" data-a="startpo">Start playoffs</button></div></div>
        <div class="panel" style="margin-top:16px"><div class="eyebrow">Regular season awards</div>${awardsHtml(L)}</div>
        <div class="two" style="margin-top:16px"><div class="panel"><div class="eyebrow">Standings</div>${standingsHtml()}</div><div class="panel"><div class="eyebrow">Season stats</div>${statsHtml()}</div></div>`;
    }
    const g = LG.nextUserGame(L), o = oppSummary(g.opp);
    return `<div class="grid2">
      <div class="panel"><div class="row" style="justify-content:space-between;align-items:flex-end">
        <div><div class="muted" style="font-family:var(--display);letter-spacing:.14em;text-transform:uppercase">${esc(S.teamName)} &middot; game ${L.day + 1} of 82</div><div class="rec led num">${r.w}&ndash;${r.l}</div></div>
        <div style="text-align:right"><div class="muted">Win streak</div><div class="led num" style="font-size:46px">${L.streak}</div></div></div>${pipsHtml()}
        <p class="note" style="margin-top:12px">${r.l > 0 ? 'The undefeated run is over. Keep winning for seeding and the playoffs.' : 'Still undefeated. One loss ends the 82-0 chase.'}</p></div>
      <div class="panel opp"><div class="vs">${g.userHome ? 'Home vs' : 'Away at'}</div>
        <div class="row" style="flex-wrap:nowrap">${crest(o.t.tm, 44)}<div class="t">${esc(o.t.label)}</div></div>
        <div class="note">${o.top.map(p => esc(p.name) + ' (' + od(p.ovr) + ')').join(' &middot; ')}</div>
        <div class="note">Roster strength <b>${od(o.ovr).toFixed(0)}</b> &middot; yours <b>${od(E.teamOvr(S.user, S.plan)).toFixed(0)}</b></div>
        <div class="ctrl" style="margin-top:4px"><button class="btn pri" data-a="play">Coach this game</button><button class="btn" data-a="quick">Quick sim</button></div>
        <div class="ctrl" style="margin-top:0"><button class="btn sm" data-a="sim10">Sim 10 games</button><button class="btn sm" data-a="simall">Sim to end of season</button><button class="btn sm" data-a="gocoach">Tactics</button></div></div></div>
      <div class="two" style="margin-top:16px"><div class="panel"><div class="eyebrow">Recent games</div>${lastGames()}</div><div class="panel"><div class="eyebrow">Conference standings</div>${standingsHtml()}</div></div>
      <div class="panel" style="margin-top:16px"><div class="eyebrow">Season stats</div>${statsHtml()}</div>`;
  };

  // ---------- playoffs ----------
  SCREENS.po = () => {
    const L = S.L, po = L.po, us = LG.seriesOfUser(L), ng = LG.nextPlayoffGame(L);
    const nm = i => i === 0 ? esc(S.teamName) : esc(L.teams[i].label);
    const cols = po.rounds.map((R, ri) => `<div><div class="eyebrow">${LG.roundName(ri)}</div>${R.map(s => `<div class="ser ${s.a === 0 || s.b === 0 ? 'me' : ''}"><div><span>${nm(s.a)}</span><span class="${s.done && s.winner === s.a ? 'w' : ''} num">${s.wa}</span></div><div><span>${nm(s.b)}</span><span class="${s.done && s.winner === s.b ? 'w' : ''} num">${s.wb}</span></div></div>`).join('')}</div>`).join('');
    const pw = (L.poGames || []).filter(g => g.win).length, pl = (L.poGames || []).filter(g => !g.win).length;
    return `<div class="grid2"><div class="panel"><div class="muted" style="font-family:var(--display);letter-spacing:.14em;text-transform:uppercase">Playoffs &middot; ${LG.roundName(po.round)}</div>
      <div class="rec led num">${us ? (us.a === 0 ? us.wa : us.wb) + '&ndash;' + (us.a === 0 ? us.wb : us.wa) : ''}</div>
      <div class="note">Playoff record ${pw}-${pl} &middot; regular season ${L.rec[0].w}-${L.rec[0].l}</div></div>
      <div class="panel opp"><div class="vs">${ng ? 'Game ' + (ng.gameNo + 1) + ' &middot; ' + (ng.userHome ? 'home vs' : 'away at') : ''}</div>
      <div class="row" style="flex-wrap:nowrap">${ng ? crest(L.teams[ng.opp].tm, 44) : ''}<div class="t">${ng ? esc(L.teams[ng.opp].label) : ''}</div></div>
      <div class="ctrl"><button class="btn pri" data-a="playpo">Coach this game</button><button class="btn" data-a="quickpo">Quick sim</button><button class="btn sm" data-a="simseries">Sim series</button><button class="btn sm" data-a="gocoach">Tactics</button></div></div></div>
      <div class="panel" style="margin-top:16px"><div class="bracket">${cols}</div></div>`;
  };

  // ---------- season end ----------
  function achievements(L) {
    const a = [], w = L.rec[0].w, champ = L.phase === 'champion', poL = (L.poGames || []).filter(g => !g.win).length;
    if (w === 82) a.push(['Undefeated', 'A perfect 82-0 regular season.']);
    if (w === 82 && champ && poL === 0) a.push(['Perfect year', '82-0 and 16-0 in the playoffs. No loss all year.']);
    if (champ) a.push(['Champion', 'Won the title.']);
    if (champ && S.hard) a.push(['Blind champion', 'Won the title after a Hard mode draft.']);
    if (w >= 70) a.push(['70 wins', 'A season of 70 or more wins.']);
    if (L.longestW >= 40) a.push(['Streak of 40', 'At least 40 wins in a row.']); else if (L.longestW >= 25) a.push(['Streak of 25', 'At least 25 wins in a row.']);
    if (champ && poL <= 3) a.push(['Clean sweep run', 'Won the title with 3 or fewer playoff losses.']);
    const mine = ((L.awards && L.awards.mine) || []).concat((L.poAwards && L.poAwards.mine) || []);
    mine.forEach(s => { const i = s.indexOf(': '); a.push(i > 0 ? [s.slice(0, i), s.slice(i + 2) + ' earned this honor.'] : [s, 'One of your players or you won this award.']); });
    return a;
  }
  function calcScore(L) {
    const w = L.rec[0].w, poW = (L.poGames || []).filter(g => g.win).length;
    return Math.round((w * 10 + poW * 8 + (L.phase === 'champion' ? 300 : 0) + (w === 82 ? 1000 : 0)) * (S.hard ? 1.5 : 1));
  }
  function resultLabel(L) { return L.phase === 'champion' ? 'Champion' : !L.userInPlayoffs ? 'Missed playoffs' : 'Eliminated: ' + LG.roundName(L.po.elimRound != null ? L.po.elimRound : L.po.round); }
  function seedOf(L) { const st = LG.standings(L).filter(x => x.conf === L.conf[0]); return st.findIndex(x => x.i === 0) + 1; }
  function pathHtml(L) {
    const po = L.po; if (!po || !L.userInPlayoffs) return '<p class="note">The team did not qualify for the playoffs.</p>';
    return `<div class="path">` + [0, 1, 2, 3].map(ri => {
      const R = po.rounds[ri]; const s = R && R.find(x => x.a === 0 || x.b === 0);
      if (!s) return `<div class="step na"><div class="sn">${LG.roundName(ri)}</div><div class="sv">Not reached</div></div>`;
      const us = s.a === 0 ? s.wa : s.wb, them = s.a === 0 ? s.wb : s.wa, opp = s.a === 0 ? s.b : s.a;
      const state = !s.done ? 'na' : us > them ? 'win' : 'loss';
      return `<div class="step ${state}"><div class="sn">${LG.roundName(ri)}</div><div class="sv num">${state === 'win' ? 'Won' : state === 'loss' ? 'Lost' : ''} ${us}-${them}</div><div class="so">vs ${esc(L.teams[opp].label)}</div></div>`;
    }).join('') + '</div>';
  }
  SCREENS.end = () => {
    const L = S.L; if (!L.awards) LG.computeAwards(L); if (L.po && L.po.champ != null && !L.poAwards) LG.poAwards(L);
    const r = L.rec[0], ach = achievements(L), score = calcScore(L), res = resultLabel(L);
    const G = Math.max(1, r.w + r.l), champ = L.phase === 'champion';
    if (!S.saved) {
      S.saved = true;
      S.lastRun = { kind: 'run', ts: Date.now(), w: r.w, l: r.l, poW: (L.poGames || []).filter(g => g.win).length, eraFrom: S.from, eraTo: S.to, res, score, hard: S.hard, eraLabel: eraLabel(), champ, names: S.user.players.map(p => p.name), ach: ach.map(x => x[0]) };
      saveRun(S.lastRun).then(ok => { const el = document.getElementById('saveInfo'); if (el) el.textContent = ok ? 'Result saved to your account.' : (S.acct ? 'Saving failed. Try again later.' : 'Sign in with Google to save results.'); });
    }
    const margin = (r.pf - r.pa) / G, pw = (L.poGames || []).filter(g => g.win).length, pl = (L.poGames || []).filter(g => !g.win).length;
    const tile = (lb, v, sub, cls) => `<div class="kpi ${cls || ''}"><div class="kl">${lb}</div><div class="kv led num">${v}</div><div class="ks">${sub || ''}</div></div>`;
    return `<div class="final ${champ ? 'champ' : ''}">
        <div class="fh"><span>${esc(S.teamName)}</span><span>${S.hard ? 'Hard' : 'Normal'} &middot; ${eraLabel()}</span></div>
        <div class="fm"><div class="rec led num">${r.w}&ndash;${r.l}</div><div class="fr"><div class="frl">${champ ? 'League champions' : r.w === 0 ? '' : (L.userInPlayoffs ? 'Season over' : 'Season over')}</div><h2>${esc(champ ? 'Champion' : res.replace('Eliminated: ', 'Eliminated in the '))}</h2><div class="fs">${champ ? 'Playoff record ' + pw + '-' + pl : (L.userInPlayoffs ? 'Playoff record ' + pw + '-' + pl : 'Finished ' + seedOf(L) + ' in the conference')}</div></div></div>
      </div>
      <div class="kpis">
        ${tile('Score', score, S.hard ? 'Hard bonus x1.5 included' : 'Wins, playoffs and titles', 'hot')}
        ${tile('Longest win streak', L.longestW, 'games in a row')}
        ${tile('Average margin', (margin > 0 ? '+' : '') + margin.toFixed(1), 'points per game')}
        ${tile('Scoring', (r.pf / G).toFixed(1), 'allowed ' + (r.pa / G).toFixed(1))}
        ${tile('Conference seed', '#' + seedOf(L), 'out of 15 teams')}
        ${tile('Playoff record', pw + '-' + pl, L.userInPlayoffs ? 'best of 7 series' : 'did not qualify')}
      </div>
      <div class="panel" style="margin-top:16px"><div class="eyebrow">Playoff run</div>${pathHtml(L)}</div>
      <div class="two" style="margin-top:16px"><div class="panel"><div class="eyebrow">Achievements</div>${ach.length ? ach.map(x => `<div class="ach"><div><b>${x[0]}</b><div class="note">${x[1]}</div></div></div>`).join('') : '<p class="note">No achievements this time. Try a tighter rotation.</p>'}</div>
      <div class="panel"><div class="eyebrow">Season stats</div>${statsHtml()}</div></div>
      ${L.po && L.po.champ != null ? `<div class="panel" style="margin-top:16px"><div class="eyebrow">Playoff awards</div>${poAwardsHtml(L)}</div>` : ''}
      <div class="panel" style="margin-top:16px"><div class="eyebrow">Regular season awards</div>${awardsHtml(L)}</div>
      <div class="panel" style="margin-top:16px;display:flex;gap:14px;align-items:center;flex-wrap:wrap"><button class="btn pri" data-a="newgame">New game</button><button class="btn" data-a="copy">Copy result</button><span class="note" id="saveInfo">${S.acct ? 'Saving result...' : 'Playing as guest: this result is not saved. Sign in with Google to keep results and achievements.'}</span></div>`;
  };

  // ---------- GAME ----------
  function stopLive() { if (S.live && S.live.timer) clearTimeout(S.live.timer); }
  function beginGame(G) {
    S.G = G;
    S.live = { timer: null, playing: false, speed: 1, tab: 'rot', sel: null, fed: 0, run: { t: -1, pts: 0 }, alert: '', window: true, winLabel: 'Pre-game', runAlerted: false, foulAlerted: {} };
    S.screen = 'game'; render(); window.scrollTo(0, 0);
  }
  const mySide = () => S.G.userSide;
  const canCoach = () => S.live.window && !S.G.over;
  SCREENS.game = () => `<div id="alerts"></div><div id="sb" class="sb"></div>
    <div class="gm"><div class="panel"><div class="eyebrow">Play by play</div><div class="feed" id="feed"></div><div class="ctrl" id="ctrl"></div></div>
    <div class="panel" id="side"></div></div>`;
  AFTER.game = () => { S.live.fed = 0; updateGame(true); };

  function evHtml(G, e) {
    const side = mySide();
    if (e.k === 'qend') return `<div class="ev sys"><div class="tm"></div><div class="tx">${esc(E.describe(G, e))} &middot; ${e.sc[side]}-${e.sc[1 - side]}</div><div></div></div>`;
    const cls = [e.t === side ? 'me' : 'op'];
    if (e.k === 'miss' || e.k === 'reb' || e.k === 'foul' || e.k === 'sub') cls.push('dim');
    const scoring = e.k === 'make' || (e.k === 'ft' && e.m > 0);
    if (scoring && e.t === side) cls.push('big');
    const sc = scoring ? `${e.sc[side]}-${e.sc[1 - side]}` : '';
    return `<div class="ev ${cls.join(' ')}"><div class="tm">${e.q > 4 ? 'OT' : 'Q' + e.q} ${mmss(e.c)}</div><div class="tx">${esc(E.describe(G, e))}</div><div class="sc">${sc}</div></div>`;
  }
  function updateGame(full) {
    const G = S.G, live = S.live, side = mySide();
    const sb = document.getElementById('sb'); if (!sb) return;
    const T = G.teams;
    const tm = (t, align) => `<div class="tm ${t === side ? 'me' : 'opp'} ${align}"><div class="tn">${t === side ? esc(S.teamName) : esc(T[t].label)}</div><div class="sc led num">${G.score[t]}</div><div class="qs num">${(G.qs[t] || []).join(' &middot; ')}&nbsp;</div><div class="qs">Timeouts ${G.to[t]} &middot; Team fouls ${G.tf[t]}</div></div>`;
    sb.innerHTML = tm(1, '') + `<div class="mid"><div class="qn">${G.over ? 'Final' : (G.q > 4 ? 'Overtime ' + (G.q - 4) : 'Quarter ' + G.q)}</div><div class="clk led num">${mmss(Math.max(0, Math.round(G.clock)))}</div><div class="qs">${G.playoff ? 'Playoffs' : 'Regular season'} &middot; away @ home</div></div>` + tm(0, 'r');
    const feed = document.getElementById('feed');
    if (full) feed.innerHTML = '';
    const log = G.log; let h = '';
    for (let i = live.fed; i < log.length; i++) h = evHtml(G, log[i]) + h;
    if (h) feed.insertAdjacentHTML('afterbegin', h);
    live.fed = log.length;
    const spd = [1, 2, 4, 8].map(s => `<button class="chip ${live.speed === s ? 'on' : ''}" data-a="speed" data-v="${s}">${s}x</button>`).join('');
    document.getElementById('ctrl').innerHTML = G.over ? '<button class="btn pri" data-a="finish">Continue</button>' :
      `${live.playing ? '<button class="btn pri" data-a="pause">Pause</button>' : '<button class="btn pri" data-a="resume">' + (live.window ? 'Resume game' : 'Resume') + '</button>'}${spd}
       <button class="btn" data-a="skipq">Sim to end of quarter</button><button class="btn" data-a="skipg">Sim to final</button>`;
    let banner = '';
    if (live.window && !G.over) banner += `<div class="banner win">Coaching window open (${esc(live.winLabel)}). Make your changes, then resume the game.</div>`;
    else if (!G.over) banner += '<div class="banner" style="background:#141b27;border-color:var(--line2);color:var(--mute)">Changes are locked while the clock runs. You can coach at quarter breaks or by calling a timeout.</div>';
    if (live.alert) banner += `<div class="banner">${esc(live.alert)}</div>`;
    document.getElementById('alerts').innerHTML = banner;
    renderSide();
  }
  function renderSide() {
    const G = S.G, live = S.live, side = mySide(), opp = 1 - side, plan = S.plan;
    const P = G.teams[side].players, st = G.st[side], on = G.on[side], en = G.en[side];
    const open = canCoach();
    const tabs = `<div class="tabs">${[['rot', 'Rotation'], ['tac', 'Tactics'], ['team', 'Team stats'], ['box', 'Box score']].map(([k, l]) => `<button class="chip ${live.tab === k ? 'on' : ''}" data-a="tab" data-v="${k}">${l}</button>`).join('')}</div>`;
    let body = '';
    if (live.tab === 'rot') {
      const order = P.map((_, i) => i).sort((a, b) => (on.includes(b) - on.includes(a)) || (P[b].ovr - P[a].ovr));
      body = `<div class="note" style="margin-bottom:8px">${open ? 'Click a bench player, then a player on the floor to swap them.' : 'Locked until the next break or timeout.'}</div><div class="rot ${open ? '' : 'lock'}">` + order.map(i => {
        const p = P[i], s = st[i], e = Math.round(en[i]), out = s.pf >= 6;
        return `<div class="pl ${on.includes(i) ? 'on' : ''} ${live.sel === i ? 'pick' : ''} ${out ? 'out' : ''}" data-a="pl" data-i="${i}">
          <div class="a"><span>${esc(p.name)}</span><span class="pill">${esc(p.slot)}</span></div><div class="b">${s.pts} pts</div>
          <div class="c"><div class="bar ${e < 35 ? 'low' : e < 60 ? 'mid' : ''}"><i style="width:${e}%"></i></div><span>${Math.round(s.sec / 60)}' &middot; ${s.reb}r ${s.ast}a &middot; <span class="${s.pf >= 4 ? 'fl' : ''}">${s.pf}pf</span></span></div></div>`;
      }).join('') + '</div>';
    } else if (live.tab === 'tac') {
      const oppP = G.teams[opp].players, oppOn = G.on[opp];
      const sec = (title, tbl, cur, act) => `<div class="tsec"><div class="th">${title}</div><div class="chips">${Object.keys(tbl).map(k => `<button class="chip ${cur === k ? 'on' : ''}" data-a="${act}" data-v="${k}">${Array.isArray(tbl[k]) ? tbl[k][0] : tbl[k]}</button>`).join('')}</div><div class="td">${Array.isArray(tbl[cur]) ? esc(tbl[cur][1]) : esc(AUTO_D[cur])}</div></div>`;
      body = `<div class="opt ${open ? '' : 'lock'}">
        ${sec('Tempo', TEMPO_I, plan.tempo, 'tempo')}
        ${sec('Offense', OFF_I, plan.off, 'off')}
        ${sec('Defense', DEF_I, plan.def, 'def')}
        ${sec('Substitutions', AUTO_I, plan.auto, 'auto')}
        <div class="tsec"><div class="th">Feed the ball to</div><div class="chips">${on.map(i => `<button class="chip ${G.feed[side] === i && G.feedLeft[side] > 0 ? 'on' : ''}" data-a="feed" data-i="${i}">${esc(P[i].name.split(' ').slice(-1)[0])}</button>`).join('')}</div><div class="td">The chosen player gets more shots for the next 8 possessions. A hot hand pays off, a cold one does not.</div></div>
        <div class="tsec"><div class="th">Double-team</div><div class="chips">${oppOn.map(i => `<button class="chip ${G.dbl[side] === i ? 'on' : ''}" data-a="dbl" data-i="${i}">${esc(oppP[i].name.split(' ').slice(-1)[0])}</button>`).join('')}</div><div class="td">Cuts that player's shooting and forces turnovers for the next 8 possessions, but opens shots for everyone else.</div></div></div>
        <div class="ctrl"><button class="btn amb" data-a="timeout" ${G.to[side] <= 0 || G.over ? 'disabled' : ''}>Call timeout (${G.to[side]} left)</button></div>
        <div class="note">A timeout stops play, restores energy to the players on the floor, kills the opponent's run and opens a coaching window.</div>`;
    } else if (live.tab === 'team') {
      const sum = t => { const o = { fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0, reb: 0, oreb: 0, ast: 0, stl: 0, blk: 0, tov: 0, pf: 0, pts: 0 }; G.st[t].forEach(x => Object.keys(o).forEach(k => o[k] += x[k] || 0)); return o; };
      const a = sum(side), b = sum(opp), pc = (m, n) => n ? (100 * m / n).toFixed(1) + '%' : '-';
      const row = (lb, x, y, hi) => `<tr><td class="r num ${hi === 1 ? 'lead' : ''}">${x}</td><td class="c">${lb}</td><td class="num ${hi === 2 ? 'lead' : ''}">${y}</td></tr>`;
      const cmp = (x, y, inv) => x === y ? 0 : ((x > y) !== !!inv ? 1 : 2);
      const pct = (m1, n1, m2, n2) => cmp(n1 ? m1 / n1 : 0, n2 ? m2 / n2 : 0);
      body = `<div class="tw"><table class="ts"><tr><th class="r">${esc(S.teamName.length > 14 ? S.teamName.slice(0, 13) + '.' : S.teamName)}</th><th class="c"></th><th>${esc(G.teams[opp].season + ' ' + G.teams[opp].tm)}</th></tr>` +
        row('Points', a.pts, b.pts, cmp(a.pts, b.pts)) + row('Field goals', a.fgm + '/' + a.fga, b.fgm + '/' + b.fga) + row('FG%', pc(a.fgm, a.fga), pc(b.fgm, b.fga), pct(a.fgm, a.fga, b.fgm, b.fga)) +
        row('3P', a.tpm + '/' + a.tpa + ' &middot; ' + pc(a.tpm, a.tpa), b.tpm + '/' + b.tpa + ' &middot; ' + pc(b.tpm, b.tpa), pct(a.tpm, a.tpa, b.tpm, b.tpa)) +
        row('FT', a.ftm + '/' + a.fta + ' &middot; ' + pc(a.ftm, a.fta), b.ftm + '/' + b.fta + ' &middot; ' + pc(b.ftm, b.fta), pct(a.ftm, a.fta, b.ftm, b.fta)) +
        row('Rebounds', a.reb, b.reb, cmp(a.reb, b.reb)) + row('Offensive reb.', a.oreb, b.oreb, cmp(a.oreb, b.oreb)) + row('Assists', a.ast, b.ast, cmp(a.ast, b.ast)) +
        row('Steals', a.stl, b.stl, cmp(a.stl, b.stl)) + row('Blocks', a.blk, b.blk, cmp(a.blk, b.blk)) + row('Turnovers', a.tov, b.tov, cmp(a.tov, b.tov, true)) + row('Fouls', a.pf, b.pf, cmp(a.pf, b.pf, true)) + '</table></div>';
    } else {
      const box = t => { const Pt = G.teams[t].players, s = G.st[t]; return `<div class="tw"><table><tr><th>${t === side ? esc(S.teamName) : esc(G.teams[t].label)}</th><th class="r">MIN</th><th class="r">PTS</th><th class="r">REB</th><th class="r">AST</th><th class="r">FG</th><th class="r">3P</th><th class="r">FT</th><th class="r">PF</th></tr>` +
        Pt.map((p, i) => s[i].sec > 0 ? `<tr><td>${esc(p.name)}</td><td class="r num">${Math.round(s[i].sec / 60)}</td><td class="r num">${s[i].pts}</td><td class="r num">${s[i].reb}</td><td class="r num">${s[i].ast}</td><td class="r num">${s[i].fgm}/${s[i].fga}</td><td class="r num">${s[i].tpm}/${s[i].tpa}</td><td class="r num">${s[i].ftm}/${s[i].fta}</td><td class="r num">${s[i].pf}</td></tr>` : '').join('') + '</table></div>'; };
      body = box(side) + '<div style="height:12px"></div>' + box(opp);
    }
    document.getElementById('side').innerHTML = tabs + body + (live.tab !== 'tac' && live.tab !== 'team' && !G.over ? `<div class="ctrl"><button class="btn amb" data-a="timeout" ${G.to[side] <= 0 ? 'disabled' : ''}>Call timeout (${G.to[side]} left)</button></div>` : '');
  }

  // live loop
  const delay = () => ({ 1: 900, 2: 450, 4: 200, 8: 70 }[S.live.speed] || 600);
  function runTrack(evs) {
    const live = S.live;
    for (const e of evs) {
      const pts = e.k === 'make' ? e.pts : e.k === 'ft' ? e.m : 0;
      if (!pts) continue;
      if (live.run.t === e.t) live.run.pts += pts; else { live.run.t = e.t; live.run.pts = pts; live.runAlerted = false; }
    }
  }
  function checkAlerts() {
    const G = S.G, live = S.live, side = mySide();
    if (live.run.t === 1 - side && live.run.pts >= 10 && !live.runAlerted && G.to[side] > 0) { live.runAlerted = true; live.alert = 'The opponent is on a ' + live.run.pts + '-0 run. Call a timeout to stop it and make changes.'; return true; }
    for (const i of G.on[side]) { if (G.st[side][i].pf === 5 && !live.foulAlerted[i]) { live.foulAlerted[i] = 1; live.alert = G.teams[side].players[i].name + ' has 5 fouls. Call a timeout to sub him out, or leave it to the auto-subs.'; return true; } }
    return false;
  }
  function stepOnce() { const G = S.G, b = G.log.length; E.step(G); runTrack(G.log.slice(b)); }
  function openWindow(label) { S.live.window = true; S.live.winLabel = label; S.live.sel = null; }
  function loop() {
    const G = S.G, live = S.live;
    if (!live.playing) return;
    const q = G.q;
    stepOnce(); live.alert = '';
    if (G.over) { live.playing = false; updateGame(); gameOverModal(); return; }
    if (G.q !== q) { live.playing = false; openWindow('end of ' + (q <= 4 ? 'Q' + q : 'overtime')); updateGame(); return; }
    if (checkAlerts()) { live.playing = false; updateGame(); return; }
    updateGame();
    live.timer = setTimeout(loop, delay());
  }
  function simUntil(cond) {
    const G = S.G, live = S.live; let n = 0; const q = G.q;
    live.window = false;
    while (!G.over && !cond() && n++ < 3000) stepOnce();
    live.alert = '';
    if (!G.over && G.q !== q) openWindow('end of ' + (q <= 4 ? 'Q' + q : 'overtime'));
    updateGame();
    if (G.over) gameOverModal();
  }
  function gameOverModal() {
    const G = S.G, side = mySide(), us = G.score[side], them = G.score[1 - side], win = us > them;
    const P = G.teams[side].players, st = G.st[side];
    const top = st.map((s, i) => [i, s]).sort((a, b) => b[1].pts - a[1].pts).slice(0, 3);
    document.body.insertAdjacentHTML('beforeend', `<div class="modal"><div class="box"><h2 style="color:${win ? 'var(--good)' : 'var(--bad)'}">${win ? 'Win' : 'Loss'} ${us}-${them}${G.ot ? ' (OT)' : ''}</h2>
      <p class="note">${G.playoff ? 'Playoffs' : 'Regular season'} vs ${esc(G.teams[1 - side].label)}</p>
      ${top.map(([i, s]) => `<div class="ach"><div><b>${esc(P[i].name)}</b><div class="note">${s.pts} pts, ${s.reb} reb, ${s.ast} ast</div></div></div>`).join('')}
      <div class="ctrl"><button class="btn pri" data-a="finish">Continue</button></div></div></div>`);
  }
  const closeModal = () => document.querySelectorAll('.modal').forEach(m => m.remove());
  function routeByPhase() {
    const ph = S.L.phase;
    if (['eliminated', 'champion', 'done'].includes(ph)) { S.saved = false; go('end'); } else if (ph === 'playoffs') go('po'); else go('hub');
  }
  function chunkSim(days) {
    const L = S.L; let n = 0;
    const step = () => {
      const t0 = performance.now();
      while (n < days && L.phase === 'season' && performance.now() - t0 < 40) { LG.quickUserGame(L); n++; }
      if (n < days && L.phase === 'season') { app.innerHTML = '<div class="loading">Simulating season... ' + L.userGames.length + ' / 82</div>'; setTimeout(step, 0); } else go('hub');
    };
    step();
  }
  function locked() { const el = document.getElementById('alerts'); if (el) { el.insertAdjacentHTML('beforeend', '<div class="banner">Locked. You can make changes at quarter breaks or by calling a timeout.</div>'); } }

  // ---------- actions ----------
  const ACTIONS = {
    home() { if (S.screen === 'loading' || S.screen === 'menu') return; if (S.screen === 'game') { locked(); return; } go('menu'); },
    rules() {
      document.body.insertAdjacentHTML('beforeend', `<div class="modal"><div class="box"><h2>Rules</h2>
      <p><b>Draft.</b> Ten times, spin a random team and season from your chosen era and take one player from that roster. Every position (PG, SG, SF, PF, C) needs exactly two players. Versatile players can fill more than one position. You get 2 re-spins. Hard mode hides stats and overalls, with one Scout to reveal a full roll.</p>
      <p><b>Season.</b> 82 games against 29 strong historical rosters from the same era. You coach games possession by possession. Play pauses at the end of each quarter and when the opponent goes on a run or your player picks up a fifth foul.</p>
      <p><b>Coaching.</b> Starting five, target minutes, tempo, offense and defense. During a game you can change things at quarter breaks and during timeouts: substitutions, tactics, feeding the ball to a player, doubling a star. Timeouts also restore energy and stop runs. Players tire and foul out.</p>
      <p><b>Playoffs.</b> Top eight in each conference, best-of-seven series up to the Finals.</p>
      <p><b>Saving.</b> Results and achievements are saved only when you are signed in with Google. Guests play normally, but nothing is saved. We store your first name and last initial, your Google account ID and your finished seasons, nothing else. <button class="btn sm" data-a="delacct">Delete my account and data</button></p>
      <div class="ctrl"><button class="btn pri" data-a="closemodal">Close</button></div></div></div>`);
    },
    closemodal() { closeModal(); },
    preset(d) { S.from = +d.f; S.to = +d.t; setPool(); updateRangeUI(); const a = document.getElementById('rf'), b = document.getElementById('rt'); if (a) { a.value = S.from; b.value = S.to; } },
    hard(d) { S.hard = d.v === '1'; document.querySelectorAll('.mode').forEach((m, i) => m.classList.toggle('on', (i === 1) === S.hard)); },
    start() { setPool(); if (S.pool.length < MIN_POOL) return; newDraft(); go('draft'); },
    spin() { doSpin(false); },
    respin() { doSpin(true); },
    scout() { const D = S.D; if (D.scouts > 0 && D.cur) { D.scouts--; D.scoutedId = D.cur.id; render(); } },
    sel(d) {
      const D = S.D, p = D.cur.players[+d.i]; if (D.picks.some(x => x.name === p.name) || !E.canAdd(D.picks, p)) return;
      D.sel = +d.i; const fp = fitPositions(p), main = String(p.elig || p.pos || '').split(',')[0];
      D.selPos = fp.includes(main) ? main : fp[0]; render();
    },
    place(d) { const D = S.D; if (D.sel == null) return; if (fitPositions(D.cur.players[D.sel]).includes(d.v)) { D.selPos = d.v; render(); } },
    confirm() {
      const D = S.D; if (D.sel == null) return;
      const p = D.cur.players[D.sel];
      const np = Object.assign({}, p, { fromLabel: D.cur.label, fromSeason: D.cur.season, fromTm: D.cur.tm });
      if (D.selPos) np._el = [D.selPos];
      if (!E.canAdd(D.picks, np)) { delete np._el; }
      D.picks.push(np); D.selPos = null;
      D.round++; D.sel = null; D.cur = null; D.phase = 'idle'; D.reel = null;
      if (D.round >= 10) {
        S.revealed = true;
        S.user = E.userTeam(D.picks, S.teamName); S.plan = E.defaultPlan(S.user);
        go('prep');
      } else render();
    },
    async logout() { try { await api('/api/auth/logout', { method: 'POST', body: '{}' }); } catch (e) { } S.acct = null; S.runs = []; renderAcct(); render(); },
    async delacct() {
      if (!S.acct) return;
      if (!window.confirm('Delete your account and all saved seasons? This cannot be undone.')) return;
      try { await api('/api/me', { method: 'DELETE' }); } catch (e) { return; }
      S.acct = null; S.runs = []; renderAcct(); render();
    },
    stand(d) { S.standAll = d.v === '1'; render(); },
    tempo(d) { if (S.screen === 'game' && !canCoach()) return locked(); S.plan.tempo = d.v; refreshCoach(); },
    off(d) { if (S.screen === 'game' && !canCoach()) return locked(); S.plan.off = d.v; refreshCoach(); },
    def(d) { if (S.screen === 'game' && !canCoach()) return locked(); S.plan.def = d.v; refreshCoach(); },
    auto(d) { if (S.screen === 'game' && !canCoach()) return locked(); S.plan.auto = d.v; refreshCoach(); },
    resetplan() { const k = { t: S.plan.tempo, o: S.plan.off, d: S.plan.def, a: S.plan.auto }; const np = E.defaultPlan(S.user); np.tempo = k.t; np.off = k.o; np.def = k.d; np.auto = k.a; Object.assign(S.plan, np); refreshCoach(); },
    beginSeason() {
      const nm = document.getElementById('tname'); if (nm && nm.value.trim()) S.teamName = nm.value.trim();
      S.user.name = S.user.label = S.teamName;
      S.L = LG.create(S.user, S.pool, {});
      S.L.userPlan = S.plan; S.L.plans[0] = S.plan; S.saved = false;
      go('hub');
    },
    gocoach() { S.coachBack = S.screen; go('coach'); },
    coachBack() { go(S.coachBack || 'hub'); },
    play() { beginGame(LG.startUserGame(S.L)); },
    quick() { LG.quickUserGame(S.L); go('hub'); },
    sim10() { chunkSim(10); },
    simall() { chunkSim(82); },
    startpo() { LG.startPlayoffs(S.L); S.saved = false; routeByPhase(); },
    playpo() { beginGame(LG.startPlayoffGame(S.L)); },
    quickpo() { LG.quickPlayoffGame(S.L); routeByPhase(); },
    simseries() { const s = LG.seriesOfUser(S.L); let n = 0; while (s && !s.done && S.L.phase === 'playoffs' && n++ < 8) LG.quickPlayoffGame(S.L); routeByPhase(); },
    resume() { const live = S.live; if (S.G.over || live.playing) return; live.playing = true; live.window = false; live.alert = ''; live.sel = null; live.timer = setTimeout(loop, 50); updateGame(); },
    pause() { S.live.playing = false; stopLive(); updateGame(); },
    speed(d) { S.live.speed = +d.v; updateGame(); },
    skipq() { const q = S.G.q; S.live.playing = false; stopLive(); simUntil(() => S.G.q !== q); },
    skipg() { S.live.playing = false; stopLive(); simUntil(() => false); },
    tab(d) { S.live.tab = d.v; renderSide(); },
    pl(d) {
      if (!canCoach()) return locked();
      const G = S.G, live = S.live, side = mySide(), i = +d.i, on = G.on[side];
      if (G.st[side][i].pf >= 6) return;
      if (live.sel == null) { live.sel = i; renderSide(); return; }
      if (live.sel === i) { live.sel = null; renderSide(); return; }
      const a = live.sel, aOn = on.includes(a), bOn = on.includes(i);
      if (aOn === bOn) { live.sel = i; renderSide(); return; }
      const outP = aOn ? a : i, inP = aOn ? i : a;
      E.setLineup(G, side, on.map(x => x === outP ? inP : x));
      live.sel = null; updateGame();
    },
    timeout() {
      const G = S.G, live = S.live;
      if (G.over || G.to[mySide()] <= 0) return;
      live.playing = false; stopLive();
      if (E.callTimeout(G, mySide())) { live.run = { t: -1, pts: 0 }; live.alert = ''; openWindow('timeout'); updateGame(); }
    },
    feed(d) { if (!canCoach()) return locked(); E.feedPlayer(S.G, mySide(), +d.i, 8); updateGame(); },
    dbl(d) { if (!canCoach()) return locked(); E.doubleTeam(S.G, mySide(), +d.i, 8); updateGame(); },
    finish() {
      closeModal();
      const G = S.G; if (!G || !G.over) return;
      if (G.playoff) LG.finishPlayoffGame(S.L, G); else LG.finishUserGame(S.L, G);
      S.G = null; routeByPhase();
    },
    newgame() { S.saved = false; go('menu'); },
    copy() {
      const L = S.L, r = L.rec[0];
      const txt = `82-0 Coach: ${r.w}-${r.l}, ${resultLabel(L)} (${S.hard ? 'Hard' : 'Normal'}, ${eraLabel()}). Roster: ${S.user.players.map(p => p.name).join(', ')}.`;
      const f = t => { const el = document.getElementById('saveInfo'); if (el) el.textContent = t; };
      try { navigator.clipboard.writeText(txt).then(() => f('Copied to clipboard.')).catch(() => f(txt)); } catch (e) { f(txt); }
    }
  };
  function refreshCoach() { if (S.screen === 'game') updateGame(); else render(); }

  document.addEventListener('click', e => {
    const b = e.target.closest('[data-a]');
    if (!b || b.tagName === 'SELECT' || b.tagName === 'INPUT') return;
    const f = ACTIONS[b.dataset.a]; if (f) f(b.dataset, e);
  });
  document.addEventListener('change', e => {
    const t = e.target;
    if (t.dataset && t.dataset.a === 'starter') {
      const k = +t.dataset.k, v = +t.value, plan = S.plan, cur = plan.starters.indexOf(v);
      if (cur >= 0 && cur !== k) plan.starters[cur] = plan.starters[k];
      plan.starters[k] = v; render();
    }
  });
  document.addEventListener('input', e => {
    const t = e.target;
    if (t.dataset && t.dataset.a === 'mins') {
      S.plan.mins[+t.dataset.i] = +t.value;
      document.getElementById('m' + t.dataset.i).textContent = t.value;
      document.getElementById('mtot').textContent = S.plan.mins.reduce((a, b) => a + b, 0);
    } else if (t.id === 'rf' || t.id === 'rt') {
      let f = +document.getElementById('rf').value, to = +document.getElementById('rt').value;
      if (t.id === 'rf' && f > to - 4) { f = to - 4; t.value = f; }
      if (t.id === 'rt' && to < f + 4) { to = f + 4; t.value = to; }
      S.from = f; S.to = to; setPool(); updateRangeUI();
    }
  });

  fetch('data.json').then(r => r.json()).then(D => {
    S.teams = D.teams.map(r => E.mkTeam(r, D.fields));
    setPool(); S.screen = 'menu'; render(); initAccount();
  }).catch(err => { app.innerHTML = '<div class="loading">Could not load data: ' + esc(err.message) + '</div>'; });
  window.__S = S;
})();
