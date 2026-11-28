/* Progression: XP for a finished season, levels, coins and the cosmetics catalog.
   Shared by the browser (previews, shop) and the server (the only place that awards anything, from a verified season).
   Nothing here touches the simulation. UMD: window.Progress in the browser, CommonJS on the server. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Progress = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const MAX_LEVEL = 100;
  // Total XP needed to reach level n (n >= 1): 80 * (n - 1)^1.5, so level 2 is 80, level 10 about 2,200, level 50 about 27,000.
  const need = n => Math.round(80 * Math.pow(n - 1, 1.5));
  const THRESHOLDS = []; for (let n = 2; n <= MAX_LEVEL; n++) THRESHOLDS.push(need(n));   // THRESHOLDS[i] = XP for level i + 2
  const levelOf = xp => { let l = 1; while (l < MAX_LEVEL && xp >= THRESHOLDS[l - 1]) l++; return l; };
  // Coins for reaching level n, and the running total up to level L (level 1 gives nothing).
  const levelCoins = n => 100 + 20 * n;
  const cumCoins = L => L <= 1 ? 0 : 100 * (L - 1) + 10 * L * (L + 1) - 20;

  // XP for one finished season. `s` is the server's own summary: { w, l, poW, poR (playoff rounds won), poL (playoff losses), champ, hard }, `games` = 82 or 38.
  function xpFor(s, games) {
    const pct = Math.max(0, Math.min(1, s.w / games));
    const parts = [['Record', Math.round(60 * pct * pct)], ['Season played', 10]];
    if (s.poR > 0) parts.push(['Playoff rounds won', 10 * s.poR]);
    if (s.champ) parts.push(['Title', 40]);
    if (s.champ && s.poL === 0) parts.push(['No playoff loss', 20]);
    if (s.w === games) parts.push(['Undefeated season', 100]);
    let total = parts.reduce((a, p) => a + p[1], 0);
    if (s.hard) { const bonus = Math.round(total * 0.5); parts.push(['Hard mode x1.5', bonus]); total += bonus; }
    return { xp: total, parts };
  }
  // Coins for one season (level-up coins are added on top, see progressAfter).
  const seasonCoins = xp => 10 + Math.round(xp / 10);

  // State for a given XP total.
  function stateOf(xp) {
    const level = levelOf(xp), lo = level === 1 ? 0 : THRESHOLDS[level - 2], hi = level >= MAX_LEVEL ? lo : THRESHOLDS[level - 1];
    return { xp, level, into: xp - lo, span: Math.max(1, hi - lo), max: level >= MAX_LEVEL };
  }
  // What a season gives to someone who has `xpBefore`: XP, level-ups and coins.
  function reward(xpBefore, s, games) {
    const x = xpFor(s, games), a = levelOf(xpBefore), b = levelOf(xpBefore + x.xp);
    const lvCoins = cumCoins(b) - cumCoins(a), coins = seasonCoins(x.xp) + lvCoins;
    return { xp: x.xp, parts: x.parts, coins, seasonCoins: seasonCoins(x.xp), levelCoins: lvCoins, from: a, to: b };
  }

  // ---- Cosmetics: appearance only, nothing here changes how a season plays. ----
  const SLOTS = [
    { id: 'court', name: 'Court', hint: 'Live court and shot chart' },
    { id: 'frame', name: 'Card frame', hint: 'Border of your player cards' },
    { id: 'title', name: 'Title', hint: 'Shown next to your name' },
    { id: 'namefx', name: 'Name style', hint: 'Color of your name' }
  ];
  const ITEMS = [
    { id: 'court_midnight', slot: 'court', name: 'Midnight', price: 0, desc: 'The default dark court.', css: { bg: '#0d1422', line: '#4a5d82' } },
    { id: 'court_hardwood', slot: 'court', name: 'Hardwood', price: 500, desc: 'Warm parquet tones.', css: { bg: '#2a1a0c', line: '#b9844a' } },
    { id: 'court_street', slot: 'court', name: 'Streetball', price: 700, desc: 'Gray concrete, orange lines.', css: { bg: '#1c1f24', line: '#e8873a' } },
    { id: 'court_ice', slot: 'court', name: 'Ice', price: 900, desc: 'Cold blue arena.', css: { bg: '#0b1e2e', line: '#6cc4f0' } },
    { id: 'court_emerald', slot: 'court', name: 'Emerald', price: 1200, desc: 'Deep green floor.', css: { bg: '#0a2018', line: '#43c98a' } },
    { id: 'court_royal', slot: 'court', name: 'Royal', price: 1800, desc: 'Purple floor with gold lines.', css: { bg: '#1a1033', line: '#e9b949' } },
    { id: 'frame_none', slot: 'frame', name: 'Classic', price: 0, desc: 'The default border.', css: { c: '' } },
    { id: 'frame_amber', slot: 'frame', name: 'Amber', price: 300, desc: 'Amber border.', css: { c: '#ffb627' } },
    { id: 'frame_ice', slot: 'frame', name: 'Ice', price: 500, desc: 'Ice-blue border.', css: { c: '#6cc4f0' } },
    { id: 'frame_emerald', slot: 'frame', name: 'Emerald', price: 700, desc: 'Green border.', css: { c: '#43c98a' } },
    { id: 'frame_crimson', slot: 'frame', name: 'Crimson', price: 900, desc: 'Red border.', css: { c: '#ff5f6d' } },
    { id: 'frame_gold', slot: 'frame', name: 'Gold', price: 1500, desc: 'Bright gold border.', css: { c: '#ffd36b' } },
    { id: 'title_none', slot: 'title', name: 'No title', price: 0, desc: 'Just your name.', text: '' },
    { id: 'title_rookie', slot: 'title', name: 'Rookie Coach', price: 150, desc: 'Everyone starts somewhere.', text: 'Rookie Coach' },
    { id: 'title_gaffer', slot: 'title', name: 'The Gaffer', price: 300, desc: 'Old-school boss.', text: 'The Gaffer' },
    { id: 'title_scout', slot: 'title', name: 'Master Scout', price: 500, desc: 'Sees talent early.', text: 'Master Scout' },
    { id: 'title_zone', slot: 'title', name: 'Zone Breaker', price: 700, desc: 'Always has an answer.', text: 'Zone Breaker' },
    { id: 'title_architect', slot: 'title', name: 'The Architect', price: 1000, desc: 'Builds rosters, not teams.', text: 'The Architect' },
    { id: 'title_unbeaten', slot: 'title', name: 'Unbeaten', price: 2500, desc: 'For the ones who dream of 82-0.', text: 'Unbeaten' },
    { id: 'namefx_none', slot: 'namefx', name: 'White', price: 0, desc: 'The default name color.', css: { c: '' } },
    { id: 'namefx_amber', slot: 'namefx', name: 'Amber', price: 300, desc: 'Amber name.', css: { c: '#ffb627' } },
    { id: 'namefx_ice', slot: 'namefx', name: 'Ice', price: 500, desc: 'Ice-blue name.', css: { c: '#7fd0f5' } },
    { id: 'namefx_mint', slot: 'namefx', name: 'Mint', price: 700, desc: 'Mint-green name.', css: { c: '#5de3a5' } },
    { id: 'namefx_flame', slot: 'namefx', name: 'Flame', price: 1200, desc: 'Orange-to-gold gradient.', css: { c: 'linear-gradient(90deg,#ff7a1a,#ffd36b)' } }
  ];
  const byId = {}; ITEMS.forEach(i => { byId[i.id] = i; });
  const DEFAULTS = { court: 'court_midnight', frame: 'frame_none', title: 'title_none', namefx: 'namefx_none' };

  return { MAX_LEVEL, THRESHOLDS, levelOf, levelCoins, cumCoins, xpFor, seasonCoins, stateOf, reward, SLOTS, ITEMS, byId, DEFAULTS };
});
