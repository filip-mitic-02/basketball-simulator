/* 82-0 Coach: UI. Depends on Engine (engine.js) and League (league.js). */
(function () {
  'use strict';
  const E = Engine, LG = League;
  const app = document.getElementById('app');
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const MIN_Y = 1950, MAX_Y = 2026, MIN_POOL = 60;
  const PRESETS = [['All-Time', 1950, 2026], ['1950s', 1950, 1959], ['1960s', 1960, 1969], ['1970s', 1970, 1979], ['1980s', 1980, 1989], ['1990s', 1990, 1999], ['2000s', 2000, 2009], ['2010s', 2010, 2019], ['2020s', 2020, 2026]];
  const TEMPO_I = { slow: ['Slow', 'Fewer possessions and less fatigue. More variance, which helps the underdog.'], normal: ['Normal', 'Balanced pace and fatigue.'], fast: ['Fast', 'More possessions, which favors the better team. Costs stamina and turnovers.'], push: ['Push', 'Maximum pace. Wears players down and risks turnovers. Use it when chasing a lead.'] };
  const OFF_I = { balanced: ['Balanced', 'No bonus and no penalty.'], inside: ['Inside', 'Feeds the post and cuts your threes. Pays off with strong rebounders and shot blockers.'], threes: ['Threes', 'More three-point attempts. Works only with real shooters on the floor.'], ballmove: ['Ball movement', 'Spreads shots and adds assists. Best with strong passers.'], iso: ['Isolation', 'Your star takes over. Only worth it with a truly dominant scorer; otherwise it costs you.'] };
  const DEF_I = { man: ['Man', 'Standard defense.'], zone: ['Zone', 'Protects the paint and cuts fouls, but gives up threes. Best with shot blockers.'], press: ['Press', 'More steals and turnovers. Pays off with active hands; tires your players and gives easier shots when beaten.'] };
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
  // Player rating = game-score rating plus a production bonus (points + rebounds + assists + stocks relative to
  // the season, and averaging a triple-double), applied once at load so the simulation and the number on screen
  // agree. The display adds a stretch at the top so MVP-level seasons reach the mid and high 90s.
  function dispRating(raw) {
    let t = 55 + (raw - 30) * 0.62 + 0.30 * Math.max(0, raw - 78);
    if (t > 92) t = 92 + 8 * (1 - Math.exp(-(t - 92) / 9));
    return Math.max(0, Math.min(99, Math.round(t)));
  }
  const dp = p => dispRating(p.ovr0 != null ? p.ovr0 : p.ovr);
  const LEGACY = { 'Šampion': 'Champion', 'Sampion': 'Champion', 'Prvak': 'Champion', 'Nije u plejofu': 'Missed playoffs', 'Propustio plejof': 'Missed playoffs' };
  const trRes = s => { s = String(s == null ? '' : s); if (LEGACY[s]) return LEGACY[s]; return s.replace(/^Eliminisan:\s*/i, 'Eliminated: ').replace('Šampion', 'Champion'); };
  const ovrCls = v => v >= 90 ? 't4' : v >= 80 ? 't3' : v >= 68 ? 't2' : 't1';
  const rnd = n => Math.floor(Math.random() * n);
  const mmss = c => Math.floor(c / 60) + ':' + String(c % 60).padStart(2, '0');
  const eraLabel = () => (S.from === MIN_Y && S.to === MAX_Y) ? 'All-Time' : S.from + '-' + S.to;
  // Real club colours [primary, secondary] by franchise code. Colours only: no logos.
  const CLUB = {
    ATL: ['#E03A3E', '#C1D32F'], BOS: ['#007A33', '#BA9653'], BRK: ['#4A5568', '#FFFFFF'], NJN: ['#1F4E9E', '#CD1041'], NYN: ['#1F4E9E', '#CD1041'],
    CHA: ['#1D6FA5', '#F26B21'], CHH: ['#00778B', '#5B2C86'], CHO: ['#00788C', '#5B2C86'], CHI: ['#CE1141', '#111111'],
    CLE: ['#860038', '#FDBB30'], DAL: ['#00538C', '#B8C4CA'], DEN: ['#1B3A6B', '#FEC524'], DET: ['#C8102E', '#1D42BA'], FTW: ['#C8102E', '#1D42BA'],
    GSW: ['#1D428A', '#FFC72C'], SFW: ['#1D428A', '#FFC72C'], PHW: ['#1D428A', '#FFC72C'], HOU: ['#CE1141', '#C4CED4'], SDR: ['#CE1141', '#C4CED4'],
    IND: ['#002D62', '#FDBB30'], LAC: ['#C8102E', '#1D428A'], SDC: ['#C8102E', '#1D428A'], BUF: ['#2B6CB0', '#F58426'],
    LAL: ['#552583', '#FDB927'], MNL: ['#552583', '#FDB927'], MEM: ['#5D76A9', '#12173F'], VAN: ['#00A0A8', '#8B2332'],
    MIA: ['#98002E', '#F9A01B'], MIL: ['#00471B', '#EEE1C6'], MLH: ['#C8102E', '#1D428A'], MIN: ['#236192', '#78BE20'],
    NOH: ['#00A3AD', '#F9A01B'], NOK: ['#00A3AD', '#F9A01B'], NOP: ['#0C2340', '#C8102E'], NOJ: ['#4B2E83', '#F2B100'],
    NYK: ['#006BB6', '#F58426'], OKC: ['#007AC1', '#EF3B24'], ORL: ['#0077C0', '#C4CED4'], PHI: ['#006BB6', '#ED174C'], SYR: ['#1E5BA8', '#ED174C'],
    PHO: ['#1D1160', '#E56020'], POR: ['#E03A3E', '#111111'], SAC: ['#5A2D81', '#63727A'], KCK: ['#C8102E', '#1D428A'], KCO: ['#C8102E', '#1D428A'],
    CIN: ['#1D428A', '#C8102E'], ROC: ['#1D428A', '#C8102E'], SAS: ['#8A8D8F', '#1C1C1C'], SEA: ['#00653A', '#FFC200'], TOR: ['#CE1141', '#B4975A'],
    UTA: ['#3E2680', '#F9A01B'], WAS: ['#002B5C', '#E31837'], WSB: ['#CE1141', '#002B5C'], BAL: ['#C8102E', '#002B5C'], CAP: ['#C8102E', '#002B5C'],
    BLB: ['#8E1A2D', '#E5B73B'], CHP: ['#005EB8', '#C8102E'], CHZ: ['#005EB8', '#C8102E'], STL: ['#C8102E', '#1D428A']
  };
  const hashOf = s => { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
  function hexHsl(hex) {
    const n = parseInt(hex.slice(1), 16), r = (n >> 16 & 255) / 255, g = (n >> 8 & 255) / 255, b = (n & 255) / 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
    let h = 0, sat = 0;
    if (d) { sat = d / (1 - Math.abs(2 * l - 1)); h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h = (h * 60 + 360) % 360; }
    return [Math.round(h), Math.round(sat * 100), Math.round(l * 100)];
  }
  const hslS = (h, s, l) => `hsl(${h} ${s}% ${l}%)`;
  // Returns { h, a: primary (hsl, never too dark), d: darker primary, b: secondary (hsl), hex: [primary, secondary] }
  const _cc = {};
  function clubCols(tm) {
    tm = String(tm || '?');
    if (_cc[tm]) return _cc[tm];
    let pri, sec;
    if (CLUB[tm]) { pri = hexHsl(CLUB[tm][0]); sec = hexHsl(CLUB[tm][1]); }
    else { const h = hashOf(tm) % 360; pri = [h, 60, 40]; sec = [(h + 40) % 360, 75, 62]; }
    const L = Math.max(pri[2], 30), S2 = pri[1] < 10 ? pri[1] : Math.max(pri[1], 38);
    const o = { h: pri[0], a: hslS(pri[0], S2, L), d: hslS(pri[0], S2, Math.max(16, L - 14)), b: hslS(sec[0], sec[1], Math.max(sec[2], 34)), l: pri[2] };
    return (_cc[tm] = o);
  }
  const hueOf = key => clubCols(key).h;
  const clubStyle = tm => { const c = clubCols(tm); return `--c1:${c.a};--c2:${c.b};--c0:${c.d}`; };
  function crest(tm, size) {
    tm = String(tm || '?').slice(0, 4); size = size || 28;
    const cc = clubCols(tm), h = hashOf(tm), pat = h % 5;
    const c1 = cc.d, c2 = cc.a, c3 = cc.b, ed = cc.b;
    const id = 'cr' + h.toString(36) + size;
    const shield = 'M16 1 30 6v12c0 9-7 15-14 17C9 33 2 27 2 18V6z';
    const deco = [
      `<path d="M2 6 16 1l14 5v6H2z" fill="${c2}"/><path d="M2 12h28v3H2z" fill="${c3}"/>`,
      `<path d="M16 1 30 6v12c0 9-7 15-14 17z" fill="${c2}"/>`,
      `<path d="M2 14 16 8l14 6v4L16 12 2 18z" fill="${c3}"/><path d="M2 6 16 1l14 5v3L16 4 2 9z" fill="${c2}"/>`,
      `<circle cx="16" cy="19" r="11" fill="${c2}"/><path d="M5 19h22M16 8v22" stroke="${c3}" stroke-width="1.1" fill="none"/>`,
      `<path d="M2 6 16 1l14 5v5H2z" fill="${c3}"/><path d="M8 11l8 5 8-5v4l-8 5-8-5z" fill="${c2}"/>`
    ][pat];
    return `<svg class="crest" width="${size}" height="${Math.round(size * 1.12)}" viewBox="0 0 32 36" aria-hidden="true"><defs><clipPath id="${id}"><path d="${shield}"/></clipPath></defs><path d="${shield}" fill="${c1}"/><g clip-path="url(#${id})">${deco}</g><path d="${shield}" fill="none" stroke="${ed}" stroke-width="1.6"/><text x="16" y="${pat === 3 ? 23.5 : 26}" text-anchor="middle" font-family="Barlow Condensed,sans-serif" font-weight="800" font-size="${tm.length > 3 ? 8.5 : 11}" fill="#fff" stroke="rgba(0,0,0,.6)" stroke-width=".9" paint-order="stroke">${esc(tm)}</text></svg>`;
  }
  // Well-known jersey numbers (a player's most iconic number; [number, {TM: number}] when it changed by team).
  // Everyone not listed gets a number generated from the name, because the dataset has no jersey numbers.
  const NUMS_SRC = {
    'Michael Jordan': 23, 'LeBron James': [23, { MIA: 6 }], 'Kobe Bryant': [24, { _to2006: 8 }], 'Kareem Abdul-Jabbar': 33, 'Magic Johnson': 32, 'Larry Bird': 33, 'Julius Erving': 6,
    'Wilt Chamberlain': 13, 'Bill Russell': 6, 'Oscar Robertson': [1, { CIN: 14 }], 'Jerry West': 44, 'Elgin Baylor': 22, 'John Havlicek': 17, 'Rick Barry': 24, 'Pete Maravich': [7, { ATL: 44 }],
    'Walt Frazier': 10, 'Willis Reed': 19, 'Dave Cowens': 18, 'Bob Cousy': 14, 'Bob Pettit': 9, 'Dolph Schayes': 4, 'George Mikan': 99, 'Nate Thurmond': 42, 'Elvin Hayes': 11, 'Wes Unseld': 41,
    'Moses Malone': 2, 'George Gervin': 44, 'David Thompson': 33, 'Bob McAdoo': 11, 'Bill Walton': 32, 'Artis Gilmore': 53, 'Bernard King': 30, 'Alex English': 2, 'Adrian Dantley': 4,
    'Isiah Thomas': 11, 'Joe Dumars': 4, 'Dennis Rodman': [10, { CHI: 91, LAL: 73, DAL: 70 }], 'Bill Laimbeer': 40, 'Clyde Drexler': 22, 'Patrick Ewing': 33, 'Hakeem Olajuwon': 34,
    'David Robinson': 50, 'Karl Malone': 32, 'John Stockton': 12, 'Charles Barkley': [34, { HOU: 4 }], 'Scottie Pippen': 33, "Shaquille O'Neal": [34, { ORL: 32, MIA: 32 }],
    'Tim Duncan': 21, 'Kevin Garnett': 21, 'Paul Pierce': 34, 'Ray Allen': 20, 'Allen Iverson': 3, 'Steve Nash': 13, 'Dirk Nowitzki': 41, 'Vince Carter': 15, 'Tracy McGrady': 1,
    'Grant Hill': 33, 'Jason Kidd': 5, 'Gary Payton': 20, 'Reggie Miller': 31, 'Chris Webber': 4, 'Dikembe Mutombo': 55, 'Alonzo Mourning': 33, 'Penny Hardaway': 1, 'Anfernee Hardaway': 1,
    'Shawn Kemp': 40, 'Dominique Wilkins': 21, 'Kevin McHale': 32, 'Robert Parish': '00', 'Dennis Johnson': 3, 'James Worthy': 42, 'Byron Scott': 4, 'Kevin Johnson': 7, 'Mark Price': 25,
    'Mitch Richmond': 2, 'Tim Hardaway': 10, 'Chris Mullin': 17, 'Detlef Schrempf': 11, 'Rod Strickland': 1, 'Brad Daugherty': 43, 'Ron Harper': 9, 'Toni Kukoc': 7, 'Horace Grant': 54,
    'Dwyane Wade': 3, 'Chris Bosh': 1, 'Carmelo Anthony': 7, 'Chris Paul': 3, 'Deron Williams': 8, 'Dwight Howard': 12, 'Kevin Durant': [35, { BRK: 7, PHO: 35, HOU: 7 }],
    'Russell Westbrook': 0, 'Stephen Curry': 30, 'Klay Thompson': 11, 'Draymond Green': 23, 'James Harden': 13, 'Kawhi Leonard': 2, 'Paul George': 13,
    'Anthony Davis': [3, { NOP: 23, NOH: 23 }], 'Damian Lillard': 0, 'Kyrie Irving': [11, { CLE: 2 }], 'Giannis Antetokounmpo': 34, 'Nikola Jokic': 15, 'Joel Embiid': 21, 'Luka Doncic': 77,
    'Jayson Tatum': 0, 'Jimmy Butler': 22, 'Devin Booker': 1, 'Donovan Mitchell': 45, 'Trae Young': 11, 'Ja Morant': 12, 'Zion Williamson': 1, 'Anthony Edwards': 5,
    'Shai Gilgeous-Alexander': 2, 'Jalen Brunson': [11, { DAL: 13 }], 'Karl-Anthony Towns': 32, 'Bam Adebayo': 13, 'Kevin Love': 0, 'LaMarcus Aldridge': 12, 'Blake Griffin': 32,
    'DeMar DeRozan': 10, 'Kyle Lowry': 7, 'Rudy Gobert': 27, 'Victor Wembanyama': 1, 'Tyrese Haliburton': 0, 'Domantas Sabonis': 11, "De'Aaron Fox": 5, 'Pascal Siakam': 43,
    'Ben Simmons': 25, 'Kemba Walker': 15, 'John Wall': 2, 'Derrick Rose': 1, 'Rajon Rondo': 9, 'Manu Ginobili': 20, 'Tony Parker': 9, 'Pau Gasol': 16, 'Marc Gasol': 33, 'Yao Ming': 11,
    "Amar'e Stoudemire": 1, 'Joe Johnson': 2, 'Gilbert Arenas': 0, 'Baron Davis': 1, 'Ben Wallace': 3, 'Chauncey Billups': 1, 'Rasheed Wallace': 30, 'Richard Hamilton': 32,
    'Tayshaun Prince': 22, 'Andre Iguodala': 9, 'Andrew Wiggins': 22, 'Vlade Divac': 21, 'Peja Stojakovic': 16, 'Drazen Petrovic': 3, 'Sidney Moncrief': 4, 'Maurice Cheeks': 10,
    'Larry Nance': 22, 'Terry Cummings': 34, 'Michael Cooper': 21, 'Jack Sikma': 43, 'Tom Chambers': 24, 'Dale Ellis': 3
  };
  const norm = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '');
  const NUMS = {}; Object.keys(NUMS_SRC).forEach(k => { NUMS[norm(k)] = NUMS_SRC[k]; });
  function jerseyNum(name, tm, season) {
    const v = NUMS[norm(name)];
    if (v == null) return String(hashOf(name) % 100);
    if (!Array.isArray(v)) return String(v);
    const o = v[1] || {};
    if (o._to2006 != null && season && season <= 2006) return String(o._to2006);
    return String(o[tm] != null ? o[tm] : v[0]);
  }
  // Player card mark: a team-colour jersey with a number and a rarity trim driven by the displayed rating.
  // Geometric art only: no likeness of any real person.
  function avatar(name, tm, size, ovr, pos, season) {
    size = size || 40;
    const cc = clubCols(tm), h = hashOf(name), num = jerseyNum(name, tm, season), id = 'jr' + h.toString(36) + size + String(tm).slice(0, 3);
    const tier = ovr == null ? 0 : ovr >= 90 ? 4 : ovr >= 80 ? 3 : ovr >= 68 ? 2 : 1;
    const trim = ['#8a96a8', '#c9803a', '#d3dbe6', '#ffb627', '#ffe08a'][tier];
    const body = 'M14 3h5c0 6 10 6 10 0h5c2 6 4 11 4 17v25H10V20c0-6 2-11 4-17z';
    const stripe = h % 3 === 0 ? `<rect x="10" y="30" width="28" height="3" fill="${cc.b}" opacity=".95"/>` : h % 3 === 1 ? `<rect x="10" y="3" width="4.5" height="42" fill="${cc.b}" opacity=".8"/><rect x="33.5" y="3" width="4.5" height="42" fill="${cc.b}" opacity=".8"/>` : `<path d="M10 16h28M10 19h28" stroke="${cc.b}" stroke-width="1.4" opacity=".9"/>`;
    const glow = tier === 4 ? `<path d="${body}" fill="none" stroke="#ff8a1f" stroke-width="3.4" opacity=".55"/>` : '';
    const fs = num.length > 1 ? 17 : 20;
    return `<svg class="avatar" width="${size}" height="${size}" viewBox="0 0 48 48" aria-hidden="true"><defs><clipPath id="${id}"><path d="${body}"/></clipPath><linearGradient id="${id}g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${cc.a}"/><stop offset="1" stop-color="${cc.d}"/></linearGradient></defs>${glow}<path d="${body}" fill="url(#${id}g)"/><g clip-path="url(#${id})">${stripe}</g><path d="M19 3c0 6 10 6 10 0" fill="rgba(0,0,0,.35)"/><text x="24" y="${num.length > 1 ? 34 : 35}" text-anchor="middle" font-family="Barlow Condensed,sans-serif" font-weight="800" font-size="${fs}" fill="#fff" stroke="rgba(0,0,0,.6)" stroke-width="1" paint-order="stroke">${esc(num)}</text><path d="${body}" fill="none" stroke="${trim}" stroke-width="${tier >= 3 ? 2 : 1.5}" stroke-linejoin="round"/></svg>`;
  }
  // ---------- trophies (original vector art) ----------
  function trophy(kind, label, size) {
    size = size || 48;
    const G1 = '#ffd36b', G2 = '#ffb627', G3 = '#c47a10', EDGE = '#7a4a08';
    const base = `<rect x="15" y="39" width="18" height="4" rx="1.5" fill="${G3}" stroke="${EDGE}" stroke-width=".8"/><rect x="20" y="33" width="8" height="7" fill="${G2}" stroke="${EDGE}" stroke-width=".8"/>`;
    const shapes = {
      cup: `<path d="M13 8h22v10c0 8-5 13-11 13S13 26 13 18z" fill="${G2}" stroke="${EDGE}" stroke-width="1"/><path d="M13 12H8c0 8 3 11 7 12M35 12h5c0 8-3 11-7 12" fill="none" stroke="${G2}" stroke-width="2.6"/><path d="M17 10v9c0 4 2 7 5 9" stroke="${G1}" stroke-width="2" fill="none" stroke-linecap="round" opacity=".8"/>${base}`,
      ball: `<circle cx="24" cy="15" r="11" fill="${G2}" stroke="${EDGE}" stroke-width="1"/><path d="M13 15h22M24 4v22M16 7c4 4 4 12 0 16M32 7c-4 4-4 12 0 16" stroke="${EDGE}" stroke-width="1.1" fill="none"/><path d="M19 27l-2 8h14l-2-8z" fill="${G3}" stroke="${EDGE}" stroke-width=".8"/>${base}`,
      shield: `<path d="M24 5l15 5v11c0 9-6 15-15 19C15 36 9 30 9 21V10z" fill="${G2}" stroke="${EDGE}" stroke-width="1"/><path d="M24 10l10 3.5V21c0 6-4.5 10.5-10 13-5.500-2.500-10-7-10-13v-7.500z" fill="none" stroke="${G1}" stroke-width="1.8"/><path d="M24 15v14M18 21h12" stroke="${G1}" stroke-width="2" stroke-linecap="round"/>`,
      star: `<circle cx="24" cy="22" r="17" fill="${G3}" stroke="${EDGE}" stroke-width="1"/><path d="M24 9l3.9 8 8.8 1.2-6.4 6.1 1.6 8.7-7.9-4.2-7.9 4.2 1.6-8.7-6.4-6.1 8.8-1.2z" fill="${G1}" stroke="${EDGE}" stroke-width=".8" stroke-linejoin="round"/>`,
      clip: `<rect x="11" y="7" width="26" height="34" rx="3" fill="${G2}" stroke="${EDGE}" stroke-width="1"/><rect x="18" y="4" width="12" height="7" rx="2" fill="${G3}" stroke="${EDGE}" stroke-width=".8"/><path d="M16 18h16M16 24h16M16 30h10" stroke="${G1}" stroke-width="2.2" stroke-linecap="round"/><path d="M33 29l2 2 4-5" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`,
      medal: `<path d="M14 3h8l4 14h-8zM34 3h-8l-4 14h8z" fill="#e8523a" stroke="${EDGE}" stroke-width=".6"/><circle cx="24" cy="29" r="13" fill="${G2}" stroke="${EDGE}" stroke-width="1"/><circle cx="24" cy="29" r="9.5" fill="none" stroke="${G1}" stroke-width="1.4"/><text x="24" y="32.5" text-anchor="middle" font-family="Barlow Condensed,sans-serif" font-weight="800" font-size="${label && label.length > 2 ? 8.5 : 10}" fill="#4a2c05">${esc(label || '')}</text>`
    };
    return `<svg class="trophy" width="${size}" height="${size}" viewBox="0 0 48 48" aria-hidden="true">${shapes[kind] || shapes.cup}</svg>`;
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
    if (!r.ok) { const err = new Error('http ' + r.status); err.status = r.status; try { err.code = (await r.json()).error; } catch (e) { } throw err; }
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
  // Sends only the decisions made during the season. The server replays them and the result shown afterwards is the server's.
  async function submitRun() {
    if (!S.acct || !S.D || !S.D.id) return { state: 'guest' };
    try {
      const r = await api('/api/runs', { method: 'POST', body: JSON.stringify({ id: S.D.id, log: S.SE.log }) });
      await loadProfile();
      return { state: 'saved', summary: r.summary };
    } catch (e) {
      return { state: e && e.status === 409 && e.code === 'version' ? 'version' : e && e.status === 409 ? 'dup' : e && e.status === 400 ? 'invalid' : 'error' };
    }
  }

  // ---------- screens ----------
  const SCREENS = {}, AFTER = {};
  SCREENS.loading = () => '<div class="loading">Loading player database…</div>';

  const EYE = 'M2 16C6 9 11 6 16 6s10 3 14 10c-4 7-9 10-14 10S6 23 2 16z';
  const ICON_OPEN = `<svg viewBox="0 0 32 32" aria-hidden="true"><path d="${EYE}" fill="none" stroke="#ffb627" stroke-width="2" stroke-linejoin="round"/><circle cx="16" cy="16" r="4.4" fill="#ffb627"/></svg>`;
  const ICON_BLIND = `<svg viewBox="0 0 32 32" aria-hidden="true"><path d="${EYE}" fill="none" stroke="#ffb627" stroke-width="2" stroke-linejoin="round" opacity=".55"/><path d="M6 27 26 5" stroke="#ffb627" stroke-width="2.6" stroke-linecap="round"/></svg>`;

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
      <section class="era">
        <div class="eyebrow">Era</div>
        <div class="yr"><span class="led num" id="yrtxt">${S.from === MIN_Y && S.to === MAX_Y ? 'All-Time' : S.from + ' &ndash; ' + S.to}</span></div>
        ${rangeHtml()}
        <div class="presets" id="presets">${PRESETS.map(p => `<button class="pre ${S.from === p[1] && S.to === p[2] ? 'on' : ''} ${p[0] === 'All-Time' ? 'all' : ''}" data-a="preset" data-f="${p[1]}" data-t="${p[2]}"><b>${p[0]}</b><span>${p[1]} &ndash; ${p[2]}</span></button>`).join('')}</div>
        <div class="note" id="eranote" style="margin-top:12px">${eraInfo()}</div>
      </section>
      <section class="side">
        <div class="eyebrow">Draft mode</div>
        <div class="modes">
          <button class="mode ${!S.hard ? 'on' : ''}" data-a="hard" data-v="0"><span class="mi">${ICON_OPEN}</span><span class="mt"><span class="mh"><h3>Normal</h3><span class="tag">Full information</span></span><p>See every player's stats and overall before you pick.</p></span></button>
          <button class="mode ${S.hard ? 'on' : ''}" data-a="hard" data-v="1"><span class="mi">${ICON_BLIND}</span><span class="mt"><span class="mh"><h3>Hard</h3><span class="tag hot">Score x1.5</span></span><p>Stats and overalls are hidden. One Scout per draft reveals a full roll.</p></span></button>
        </div>
        <div class="note" style="margin:10px 0 18px">The season plays exactly the same in both modes. Hard only changes how you draft.</div>
        <button class="btn pri go" data-a="start" id="startbtn" ${S.pool.length < MIN_POOL ? 'disabled' : ''}>Start draft</button><p class="note" id="startErr" role="alert"></p>
        <div class="note" style="margin-top:8px">Opponents are 29 historical rosters from the same era.</div>
      </section>
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
  const newSeed = () => { const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0]; };
  function draftError(e) {
    S.D.phase = S.D.cur ? 'choose' : 'idle'; S.D.busy = false; S.D.err = e && e.status === 409 && e.code === 'version' ? 'A new version of the game is available. Reload the page to continue.'
      : e && e.status === 429 ? 'Too many drafts started. Try again in a little while.'
      : e && e.status === 401 ? 'Your session expired. Sign in again to continue.' : 'The server could not process that. Try again.';
    render();
  }
  async function doSpin(isRespin) {
    const D = S.D;
    if (D.phase === 'spinning' || D.round >= 10) return;
    if (isRespin && D.skips <= 0) return;
    D.phase = 'spinning'; D.sel = null; D.err = null; render();
    let final;
    if (D.id) {                                   // signed in: the server rolls with a secret only it knows
      try {
        const r = await api('/api/draft', { method: 'POST', body: JSON.stringify({ op: isRespin ? 'respin' : 'spin', id: D.id }) });
        final = S.byId.get(r.team); D.skips = Core.MAX_SKIPS - r.skips;
        if (!final) throw new Error('team');
      } catch (e) { return draftError(e); }
    } else {                                      // guest: local roll, nothing is saved anyway
      if (isRespin) D.skips--;
      final = Core.rollTeam(S.pool, D.picks, rnd);
    }
    let n = 0;
    const tick = () => {
      n++; D.reel = S.pool[rnd(S.pool.length)]; updateReels();
      if (n < 16) setTimeout(tick, 60 + n * 8);
      else {
        D.cur = final; D.reel = final; D.phase = 'choose'; D.landed = true; render();
        setTimeout(() => { D.landed = false; const el = document.getElementById('reelbox'); if (el) el.classList.remove('land'); }, 900);
      }
    };
    tick();
  }
  function updateReels() {
    const t = S.D.reel, a = document.getElementById('reelT'), y = document.getElementById('reelY'), c = document.getElementById('reelC');
    if (a && t) {
      a.textContent = t.name; y.textContent = t.season; c.innerHTML = crest(t.tm, 54);
      const rb = document.getElementById('reelbox'), cc = clubCols(t.tm);
      if (rb) { rb.style.setProperty('--c1', cc.a); rb.style.setProperty('--c2', cc.b); rb.style.setProperty('--c0', cc.d); }
    }
  }
  const statsVisible = () => !S.hard || S.revealed || (S.D && S.D.scoutedId && S.D.cur && S.D.scoutedId === S.D.cur.id);
  const svg = d => `<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const TRAIT_IC = {
    magnet: svg('<path d="M5 3v9a7 7 0 0 0 14 0V3"/><path d="M5 7h4M15 7h4"/>'),                                  // horseshoe magnet
    sniper: svg('<circle cx="12" cy="12" r="7"/><path d="M12 2v6M12 16v6M2 12h6M16 12h6"/><circle cx="12" cy="12" r="1" fill="currentColor"/>'),   // crosshair
    eraser: svg('<path d="M4 15l9-9a2.5 2.5 0 0 1 3.5 0l3 3a2.5 2.5 0 0 1 0 3.5L12 20H7z"/><path d="M9 11l5 5M4 20h16"/>'),   // eraser
    lockdown: svg('<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/><circle cx="12" cy="16" r="1.2" fill="currentColor"/>'),   // padlock
    maestro: svg('<circle cx="5" cy="17" r="2.2"/><circle cx="19" cy="17" r="2.2"/><circle cx="12" cy="5" r="2.2"/><path d="M7 15.5l3.5-8M17 15.5l-3.5-8M8 18h8"/>'),   // passing triangle
    glass: svg('<path d="M6 4h12l-1.5 15a2 2 0 0 1-2 1.8h-5a2 2 0 0 1-2-1.8z"/><path d="M8 9h8M10 3.5l-.5-1.5"/>'),   // glass
    scorer: svg('<path d="M12 3c.6 3 4.8 5 4.8 9.6A4.8 4.8 0 0 1 12 17.4a4.8 4.8 0 0 1-4.8-4.8c0-2 1.2-3.2 2.2-4.2 0 1.8.9 2.8 2 2.8C11.6 8 10.8 6 12 3z"/><path d="M9 21h6"/>')   // flame
  };
  const TRAIT_SIDE = { magnet: 'off', sniper: 'off', maestro: 'off', scorer: 'off', eraser: 'def', lockdown: 'def', glass: 'def' };
  function traitBadge(p, long) {
    const t = E.traitOf(p); if (!t) return '';
    const T = E.TRAITS[t.k];
    return `<span class="trait ${TRAIT_SIDE[t.k]}" title="${esc(T.desc)}"><i class="ti">${TRAIT_IC[t.k]}</i>${T.name}</span>${long ? `<span class="tdesc">${esc(T.desc)}</span>` : ''}`;
  }
  function playerCard(p, i) {
    const D = S.D, t = D.cur, hue = hueOf(t.tm);
    const taken = D.picks.some(x => x.name === p.name);
    const fits = !taken && E.canAdd(D.picks, p);
    const dis = taken || !fits;
    const vis = statsVisible();
    const st = (l, v) => `<div>${l}<b>${vis ? v : '&nbsp;'}</b></div>`;
    return `<button class="pcard ${D.sel === i ? 'sel' : ''} ${dis ? 'dis' : ''}" style="--h:${hue};${clubStyle(t.tm)}" data-a="sel" data-i="${i}" ${dis ? 'aria-disabled="true"' : ''}>
      <div class="hd">${crest(t.tm, 20)}<span>${t.season} ${esc(t.tm)}</span><span class="ovr ${vis ? ovrCls(dp(p)) : 'tq'}" style="font-size:24px">${vis ? dp(p) : '??'}</span></div>
      <div class="bd"><div class="who">${avatar(p.name, t.tm, 46, vis ? dp(p) : null, p.pos, t.season)}<div><div class="nm">${esc(p.name)}</div>${posChips(p)}</div></div>
        ${vis ? `<div class="trow">${traitBadge(p, true)}</div>` : ''}
        <div class="stats ${vis ? '' : 'hid'}">${st('PTS', dec(p.ppg))}${st('REB', dec(p.rpg))}${st('AST', dec(p.apg))}${st('MIN', dec(p.mpg))}${st('STL', dec(p.spg))}${st('BLK', dec(p.bpg))}${st('FG%', pct(p.fg))}${st('3P%', pct(p.tp))}</div>
      </div>${fitBadge(p, taken, fits)}${needTag(p, fits)}</button>`;
  }
  const fitPositions = p => Core.fitPositions(S.D.picks, p);
  const IC_OK = '<svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M2.5 7.5 5.5 10.5 11.5 3.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const IC_NO = '<svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M3 3l8 8M11 3l-8 8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
  const IC_WARN = '<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.8 15 14H1L8 1.8z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M8 6.2v4M8 11.7v.4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
  const IC_CHK = '<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.4" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M5 8.3 7.2 10.4 11 5.8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const IC_BAD = '<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.4" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M5.4 5.4l5.2 5.2M10.6 5.4l-5.2 5.2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
  // ---------- team report: does the roster have everything a team needs ----------
  const poolKey = () => S.from + '-' + S.to;
  function teamReport(players, title) {
    if (S.hard && !S.revealed) return `<div class="panel rp"><div class="eyebrow">${title}</div><div class="rp-lock">Hidden in Hard mode until the draft is over. The report would give away the stats.</div></div>`;
    const a = Report.analyze(players, S.pool, poolKey());
    if (!a) return `<div class="panel rp"><div class="eyebrow">${title}</div><div class="rp-lock">Draft three players and the report shows what your team has and what it is missing.</div></div>`;
    const sgn = v => (v > 0.05 ? '+' : v < -0.05 ? '\u2212' : '') + Math.abs(v).toFixed(1);
    const rows = a.list.map(c => `<div class="rp-row ${c.tier}"><span class="rp-n">${c.short}</span><span class="rp-bar"><b style="width:${Math.max(3, c.pct)}%"></b></span><span class="ovr">${sgn(c.pts)}</span><span class="rp-l">${c.leader ? esc(c.leader) + (c.leaderVal != null ? ' &middot; ' + c.leaderVal.toFixed(1) + ' ' + c.unit : '') : ''}</span></div>`).join('');
    const ic = { bad: IC_BAD, warn: IC_WARN, good: IC_CHK };
    const notes = a.notes.map(n => `<li class="${n.kind}">${ic[n.kind]}<span>${esc(n.text)}</span></li>`).join('');
    return `<div class="panel rp"><div class="eyebrow">${title}</div>
      <div class="rp-head"><div class="rp-score ${a.tier}"><b class="led num">${a.partial ? a.count + '/10' : a.wins}</b><span>${a.partial ? 'DRAFTED' : 'PROJ. WINS'}</span></div>
        <div><div class="rp-v">${a.verdict}</div><div class="rp-s">${a.partial ? 'The projection unlocks when the roster is complete. Bars compare each area with a typical draft.' : 'Projected from rating, role fit and synergy. Bars show points per game against a typical draft in this era.'}</div></div></div>
      <div class="rp-rows">${rows}</div><ul class="rp-notes">${notes}</ul></div>`;
  }
  // On a draft card: does this player lift the weakest area of the roster?
  function needTag(p, fits) {
    const D = S.D;
    if (!fits || !D.rep || !statsVisible()) return '';
    const cat = D.rep.cats[D.rep.need];
    if (cat.pts > -0.8) return '';
    return Report.lift(D.picks, p, S.pool, poolKey(), D.rep.need) >= 0.6 ? `<div class="need">Fills your need: ${cat.name}</div>` : '';
  }
  const IC_TAKEN = '<svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><circle cx="7" cy="7" r="5.2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M4.5 7h5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
  function fitBadge(p, taken, fits) {
    if (taken) return `<div class="fit tk">${IC_TAKEN}<span>On your roster</span></div>`;
    if (!fits) return `<div class="fit no">${IC_NO}<span>No open slot</span><em>${E.eligible(p).map(x => `<b>${x}</b>`).join('')} full</em></div>`;
    return `<div class="fit ok">${IC_OK}<span>Fits roster</span><em>fills ${fitPositions(p).map(x => `<b>${x}</b>`).join('')}</em></div>`;
  }
  // Spots on the half court, in percent of the court box (basket at the top).
  const SPOT = { PG: [50, 78], SG: [83, 61], SF: [17, 61], PF: [73, 34], C: [27, 34] };
  const shortName = n => { const t = String(n).split(' '); return t.length > 1 ? t.slice(1).join(' ') : n; };
  const JERSEY = 'M14 3h5c0 6 10 6 10 0h5c2 6 4 11 4 17v25H10V20c0-6 2-11 4-17z';
  // Empty spot: an outline of the same jersey that a drafted player will occupy.
  const emptyJersey = (pos, size) => `<svg class="avatar ej" width="${size}" height="${size}" viewBox="0 0 48 48" aria-hidden="true"><path d="${JERSEY}" class="ejb"/><text x="24" y="34" text-anchor="middle" font-family="Barlow Condensed,sans-serif" font-weight="800" font-size="15" class="ejt">${pos}</text></svg>`;
  function spotHtml(pos, p, st, ghost, bench) {
    // st: '' | 'ok' (can be placed here) | 'lock' (selected player cannot play here) | 'pick' (chosen target)
    const vis = !S.hard || S.revealed;
    const act = st === 'ok' || st === 'pick' ? `data-a="place" data-v="${pos}"` : 'disabled';
    const tag = bench ? 'onbench' : 'oncourt', sz = bench ? 54 : 64;
    const pos0 = bench ? '' : `style="left:${SPOT[pos][0]}%;top:${SPOT[pos][1]}%"`;
    const lab = (pl, who) => `<span class="pp"><span class="pl">${pl}</span>${who && vis ? `<span class="ovr ${ovrCls(dp(who))}">${dp(who)}</span>` : ''}</span>`;
    if (p) {
      return `<button class="spot filled ${tag} ${st}" ${pos0} disabled aria-label="${esc(p.name)} at ${pos}">${avatar(p.name, p.fromTm, sz, vis ? dp(p) : null, p.pos, p.fromSeason)}<span class="nm">${esc(shortName(p.name))}</span>${lab(pos, p)}</button>`;
    }
    if (ghost) {
      return `<button class="spot ghost ${tag} ${st}" ${pos0} ${act} aria-label="Place ${esc(ghost.name)} at ${pos}"><span class="gh">${avatar(ghost.name, S.D.cur.tm, sz, vis ? dp(ghost) : null, ghost.pos, S.D.cur.season)}</span><span class="nm">${esc(shortName(ghost.name))}</span>${lab(pos, ghost)}</button>`;
    }
    return `<button class="spot empty ${tag} ${st}" ${pos0} ${act} aria-label="${pos} ${bench ? 'bench' : 'starter'} spot"><span class="ring">${emptyJersey(pos, sz)}</span><span class="pp"><span class="pl dim">${bench ? 'Bench' : 'Starter'}</span></span></button>`;
  }
  const COURT_SVG = `<svg class="court-art" viewBox="0 0 500 520" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="wood" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1c2a40"/><stop offset="1" stop-color="#121b2b"/></linearGradient></defs>
    <rect x="6" y="6" width="488" height="508" rx="10" fill="url(#wood)" stroke="#3b4e6e" stroke-width="3"/>
    <g fill="none" stroke="#6f86ad" stroke-width="2.4" opacity=".8">
      <rect x="170" y="6" width="160" height="196" fill="rgba(255,182,39,.07)"/>
      <path d="M190 202a60 60 0 0 0 120 0"/><path d="M190 202a60 60 0 0 1 120 0" stroke-dasharray="6 7"/>
      <path d="M218 42h64"/><circle cx="250" cy="54" r="9" stroke="#ff8a3d" stroke-width="2.6"/><path d="M250 42v-36"/>
      <path d="M210 62a40 40 0 0 0 80 0"/>
      <path d="M44 6v132"/><path d="M456 6v132"/><path d="M44 138A222 222 0 0 0 456 138"/>
      <path d="M170 74h-14M170 106h-14M170 138h-14M330 74h14M330 106h14M330 138h14"/>
    </g></svg>`;
  function rosterPanel() {
    const D = S.D, P = D.picks;
    const as = P.length ? E.assign(P) : [];
    const byPos = {}; E.POS.forEach(x => byPos[x] = []);
    P.forEach((p, i) => { byPos[as[i] || E.eligible(p)[0]].push(p); });
    const vis = !S.hard || S.revealed;
    const sp = D.phase === 'choose' && D.sel != null ? D.cur.players[D.sel] : null;
    const fp = sp ? fitPositions(sp) : [];
    const stOf = pos => !sp ? '' : (fp.includes(pos) ? (D.selPos === pos ? 'pick' : 'ok') : 'lock');
    const cell = (pos, k) => {
      const p = byPos[pos][k], st = stOf(pos);
      const target = sp && fp.includes(pos) && !p && byPos[pos].length === k;   // next free spot at this position
      if (p) return spotHtml(pos, p, '', null, k === 1);
      if (target) return spotHtml(pos, null, st, D.selPos === pos ? sp : null, k === 1);
      return spotHtml(pos, null, sp ? 'lock' : '', null, k === 1);
    };
    const avg = P.length && vis ? (P.reduce((a, p) => a + dp(p), 0) / P.length).toFixed(1) : '--';
    const hint = sp ? `<b>${esc(sp.name)}</b> can play ${fp.length ? fp.map(x => `<b>${x}</b>`).join(', ') : 'nowhere (no open spot)'}. Click a lit spot to choose where he goes.` : 'Draft two players at every position. Versatile players can fill more than one spot, so you cannot stack five centers.';
    return `<div class="panel courtp"><div class="eyebrow">Your team &middot; ${P.length}/10</div>
      <div class="court ${sp ? 'picking' : ''}">${COURT_SVG}${E.POS.map(pos => cell(pos, 0)).join('')}</div>
      <div class="bench-h"><span>Bench</span></div>
      <div class="bench ${sp ? 'picking' : ''}">${E.POS.map(pos => `<div class="bslot"><div class="bl">${pos}</div>${cell(pos, 1)}</div>`).join('')}</div>
      <div class="note courthint">${hint}${vis ? ' Team average: <b>' + avg + '</b>' : ' Ratings are hidden until the draft ends.'}</div></div>`;
  }
  SCREENS.draft = () => {
    const D = S.D;
    D.rep = Report.analyze(D.picks, S.pool, poolKey());
    const t = D.phase === 'choose' ? D.cur : D.reel;
    const reel = `<div class="reelbox ${D.phase === 'spinning' ? 'spin' : ''} ${D.landed ? 'land' : ''}" id="reelbox" style="${t ? clubStyle(t.tm) : ''}"><div id="reelC">${t ? crest(t.tm, 54) : ''}</div><div class="t"><small>Team</small><div class="v" id="reelT">${t ? esc(t.name) : 'Spin to start'}</div></div><div class="y led num" id="reelY">${t ? t.season : '----'}</div></div>`;
    const acts = D.phase === 'choose'
      ? `<div class="actions"><button class="btn pri" data-a="confirm" ${D.sel == null ? 'disabled' : ''}>Draft player</button>
         <button class="btn ghost" data-a="respin" ${D.skips <= 0 ? 'disabled' : ''}>Re-spin &middot; ${D.skips} left</button>
         ${S.hard ? `<button class="btn sm" data-a="scout" ${(D.scouts <= 0 || D.scoutedId === D.cur.id) ? 'disabled' : ''}>Scout this roll &middot; ${D.scouts} left</button>` : ''}</div>`
      : D.phase === 'idle' ? `<div class="actions"><button class="btn pri" data-a="spin">Spin</button><button class="btn ghost" disabled>Re-spin &middot; ${D.skips} left</button></div>`
        : '<div class="actions"><div class="spinlbl">Spinning<span>.</span><span>.</span><span>.</span></div></div>';
    let cards = '';
    if (D.phase === 'choose') cards = `<div class="eyebrow">${D.cur.season} ${esc(D.cur.name)} &middot; choose one player</div><div class="cards">${D.cur.players.map((p, i) => playerCard(p, i)).join('')}</div>`;
    else if (D.phase === 'idle') cards = '<p class="note">Spin to get a random team and season, then pick one player from that roster.</p>';
    return `<div class="row" style="justify-content:space-between;margin-bottom:12px"><h2 style="font-size:36px">Draft &middot; pick ${Math.min(D.round + 1, 10)} of 10</h2>
      <div class="row"><span class="pill">${S.hard ? 'Hard' : 'Normal'}</span><span class="pill">${eraLabel()}</span></div></div>
      ${D.err ? `<div class="banner" role="alert">${esc(D.err)}</div>` : ''}
      <div class="grid2"><div><div class="stage">${reel}${acts}</div>${cards}</div><div>${rosterPanel()}${teamReport(D.picks, 'Team report')}</div></div>`;
  };

  // ---------- coach panel ----------
  const fitOf = () => (S.hard && !S.revealed) || !S.user ? null : Report.tacticFit(S.user.players, S.plan);
  function tiles(obj, cur, act, F) {
    return `<div class="tiles">${Object.keys(obj).map(k => {
      const f = F && F.fit[k], cls = f ? (f.rec ? ' best' : f.weak ? ' weak' : '') : '';
      return `<button class="tile ${cur === k ? 'on' : ''}${cls}" data-a="${act}" data-v="${k}"><b>${obj[k][0]}</b><span>${obj[k][1]}</span>${f && (f.rec || f.weak) ? `<em class="fit ${f.rec ? 'yes' : 'no'}">${f.rec ? 'Best fit' : 'Poor fit'}</em><span class="why">${esc(f.why)}</span>` : ''}</button>`;
    }).join('')}</div>`;
  }
  const recMissing = F => F && ['tempo', 'off', 'def'].some(g => F.best[g] && S.plan[g] !== F.best[g]);
  function coachPanel() {
    const P = S.user.players, plan = S.plan, tot = plan.mins.reduce((a, b) => a + b, 0);
    const five = plan.starters.map((pi, k) => {
      const p = P[pi];
      return `<div class="starter"><div class="sl">${esc(p.slot)}</div><div class="sw">${crest(p.fromTm, 30)}<div><b>${esc(p.name)}</b><span>${p.fromSeason} ${esc(p.fromTm)}</span>${traitBadge(p)}</div><div class="ovr ${ovrCls(dp(p))}" style="margin-left:auto">${dp(p)}</div></div>
        <select data-a="starter" data-k="${k}" aria-label="Starter ${k + 1}">${P.map((q, i) => `<option value="${i}" ${pi === i ? 'selected' : ''}>${esc(q.name)} (${esc(q.slot)})</option>`).join('')}</select></div>`;
    }).join('');
    const rows = P.map((p, i) => `<tr><td><div class="rn">${crest(p.fromTm, 20)}<div><b>${esc(p.name)}</b><span>${p.fromSeason} ${esc(p.fromTm)}</span>${traitBadge(p)}</div></div></td>
      <td><span class="pill">${esc(p.slot)}</span></td><td class="r"><span class="ovr ${ovrCls(dp(p))}" style="font-size:20px">${dp(p)}</span></td>
      <td class="r num">${dec(p.ppg)}</td><td class="r num">${dec(p.rpg)}</td><td class="r num">${dec(p.apg)}</td>
      <td><div class="mrow"><input class="mins" type="range" min="0" max="44" step="1" value="${plan.mins[i]}" data-a="mins" data-i="${i}" aria-label="Minutes for ${esc(p.name)}"><span class="num mv" id="m${i}">${plan.mins[i]}</span></div></td></tr>`).join('');
    const F = fitOf();
    const recBar = F ? `<div class="recbar"><div><b>Tactics that fit your roster</b><span>${F.best.off || F.best.def ? 'The green-framed options are the ones this roster is built for. They update when you change minutes or starters.' : 'No tactic stands out for this roster right now. Balanced and Man are a safe choice. This updates when you change minutes or starters.'}</span></div>${F.best.off || F.best.def ? `<button class="btn sm pri" data-a="applyrec" ${recMissing(F) ? '' : 'disabled'}>${recMissing(F) ? 'Apply recommended' : 'Applied'}</button>` : ''}</div>` : '';
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
        ${recBar}
        <div class="panel"><div class="eyebrow">Tempo</div>${tiles(TEMPO_I, plan.tempo, 'tempo')}<div class="note" style="margin-top:8px">Tempo is a small lever: it trades fatigue and turnovers for possessions, with no clear roster fit.</div></div>
        <div class="panel" style="margin-top:16px"><div class="eyebrow">Offense</div>${tiles(OFF_I, plan.off, 'off', F)}</div>
        <div class="panel" style="margin-top:16px"><div class="eyebrow">Defense</div>${tiles(DEF_I, plan.def, 'def', F)}</div>
        <div class="panel" style="margin-top:16px"><div class="eyebrow">Substitutions in games</div>
          <div class="tiles">${Object.keys(AUTO_I).map(k => `<button class="tile ${plan.auto === k ? 'on' : ''}" data-a="auto" data-v="${k}"><b>${AUTO_I[k]}</b><span>${k === 'auto' ? 'The assistant coach rotates by your minute targets, fatigue and fouls.' : k === 'forced' ? 'Only fouled-out players are replaced. You do the rest.' : 'No automatic changes. Quick sims still rotate automatically.'}</span></button>`).join('')}</div></div>
      </div></div>`;
  }
  const teamAvg = () => (S.user.players.reduce((a, p) => a + dp(p), 0) / S.user.players.length).toFixed(1);
  SCREENS.prep = () => `<div class="row" style="justify-content:space-between;margin-bottom:12px"><h2 style="font-size:36px">Roster complete</h2>
      <div class="row"><input type="text" id="tname" value="${esc(S.teamName)}" maxlength="24" aria-label="Team name"><button class="btn pri" data-a="beginSeason">Start season</button></div></div>
      ${S.hard ? '<div class="banner">Hard mode: your players are revealed so you can set the rotation.</div>' : ''}
      <p class="note">Team average overall <b>${teamAvg()}</b>. Set your starting five, minutes and tactics. You can change all of this during the season, and live in games during quarter breaks and timeouts.</p>${teamReport(S.user.players, 'Team report')}${coachPanel()}`;
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
    const card = (t, x, sub, ic, lb) => x ? `<div class="awc ${x.isUser ? 'me' : ''}">${trophy(ic, lb, 54)}<div class="awx">${x.isUser ? '<div class="yours">Yours</div>' : ''}<div class="al">${t}</div><div class="an">${esc(x.name)}</div><div class="at">${x.isUser ? esc(S.teamName) : esc(x.team)}</div><div class="as">${sub}</div></div></div>` : '';
    const lead = (t, x, k, lb) => x ? card(t, x, f(x[k]) + ' per game', 'medal', lb) : '';
    const teams = (arr, names) => arr.map((tm, i) => `<div class="awt"><div class="al">${trophy('star', '', 18)} ${names[i]}</div>${tm.map(x => `<div class="awp ${x.isUser ? 'me' : ''}"><span class="pill">${x.grp}</span><b>${esc(x.name)}</b><em>${x.isUser ? esc(S.teamName) : esc(x.team)}</em></div>`).join('')}</div>`).join('');
    return `<div class="awg big">${card('Most Valuable Player', A.mvp, f(A.mvp.ppg) + ' pts &middot; ' + f(A.mvp.rpg) + ' reb &middot; ' + f(A.mvp.apg) + ' ast', 'cup')}
      ${card('Defensive Player of the Year', A.dpoy, f(A.dpoy.spg) + ' stl &middot; ' + f(A.dpoy.bpg) + ' blk', 'shield')}
      ${A.sixth ? card('Sixth Man of the Year', A.sixth, f(A.sixth.ppg) + ' pts off the bench', 'star') : ''}
      <div class="awc ${A.coach.isUser ? 'me' : ''}">${trophy('clip', '', 54)}<div class="awx">${A.coach.isUser ? '<div class="yours">Yours</div>' : ''}<div class="al">Coach of the Year</div><div class="an">${A.coach.isUser ? 'You' : esc(A.coach.team)}</div><div class="at">${A.coach.w}&ndash;${A.coach.l}</div></div></div></div>
      <div class="awg" style="margin-top:10px">${lead('Scoring leader', A.leaders.pts, 'ppg', 'PTS')}${lead('Rebounding leader', A.leaders.reb, 'rpg', 'REB')}${lead('Assists leader', A.leaders.ast, 'apg', 'AST')}${lead('Steals leader', A.leaders.stl, 'spg', 'STL')}${lead('Blocks leader', A.leaders.blk, 'bpg', 'BLK')}</div>
      <div class="eyebrow" style="margin-top:16px">All-League</div><div class="awts">${teams(A.allLeague, ['First Team', 'Second Team', 'Third Team'])}</div>
      <div class="eyebrow" style="margin-top:16px">All-Defensive</div><div class="awts">${teams(A.allDef, ['First Team', 'Second Team'])}</div>`;
  }
  function poAwardsHtml(L) {
    const P = L.poAwards || LG.poAwards(L); if (!P || !P.finals) return '';
    const f = v => v.toFixed(1), c = P.champ === 0 ? S.teamName : L.teams[P.champ].label;
    const card = (t, x, ic) => x ? `<div class="awc ${x.isUser ? 'me' : ''}">${trophy(ic, '', 54)}<div class="awx">${x.isUser ? '<div class="yours">Yours</div>' : ''}<div class="al">${t}</div><div class="an">${esc(x.name)}</div><div class="at">${x.isUser ? esc(S.teamName) : esc(x.team)}</div><div class="as">${f(x.ppg)} pts &middot; ${f(x.rpg)} reb &middot; ${f(x.apg)} ast</div></div></div>` : '';
    return `<div class="awg big"><div class="awc champ ${P.champ === 0 ? 'me' : ''}">${trophy('ball', '', 64)}<div class="awx">${P.champ === 0 ? '<div class="yours">Yours</div>' : ''}<div class="al">Champions</div><div class="an">${esc(c)}</div><div class="at">${P.champ === 0 ? 'That is you' : ''}</div></div></div>${card('Finals MVP', P.finals.mvp, 'cup')}${P.confs.map(x => card('Conference Finals MVP', x.mvp, 'star')).join('')}</div>`;
  }
  // Big showcase of the honours the user earned this season
  function trophyCase(L) {
    const mine = ((L.awards && L.awards.mine) || []).concat((L.poAwards && L.poAwards.mine) || []);
    if (L.phase === 'champion') mine.unshift('NBA Champions');
    if (!mine.length) return '';
    const icon = s => /Champions/.test(s) ? ['ball', ''] : /Finals MVP|^MVP/.test(s) ? ['cup', ''] : /Defensive Player/.test(s) ? ['shield', ''] : /Coach/.test(s) ? ['clip', ''] : /Scoring/.test(s) ? ['medal', 'PTS'] : /Rebound/.test(s) ? ['medal', 'REB'] : /Assist/.test(s) ? ['medal', 'AST'] : /Steal/.test(s) ? ['medal', 'STL'] : /Block/.test(s) ? ['medal', 'BLK'] : ['star', ''];
    return `<div class="tcase"><div class="eyebrow">Trophy case</div><div class="tc-row">${mine.map(s => { const i = s.indexOf(': '), ic = icon(s); return `<div class="tc">${trophy(ic[0], ic[1], 76)}<div class="tcn">${esc(i > 0 ? s.slice(0, i) : s)}</div>${i > 0 ? `<div class="tcp">${esc(s.slice(i + 2))}</div>` : ''}</div>`; }).join('')}</div></div>`;
  }
  SCREENS.hub = () => {
    const L = S.L, r = L.rec[0];
    if (L.phase === 'seasonDone') {
      return `<div class="panel" style="text-align:center;padding:40px 16px"><div class="muted" style="font-family:var(--display);letter-spacing:.14em;text-transform:uppercase">Regular season complete</div>
        <div class="rec led num">${r.w}&ndash;${r.l}</div>${r.l === 0 ? '<h2 style="color:var(--good)">Undefeated. 82-0.</h2>' : ''}
        <p class="note">Conference seed: ${LG.standings(L).filter(x => x.conf === L.conf[0]).findIndex(x => x.i === 0) + 1}</p>${pipsHtml()}
        <div style="margin-top:20px"><button class="btn pri" data-a="startpo">Start playoffs</button></div></div>
        ${trophyCase(L)}<div class="panel" style="margin-top:16px"><div class="eyebrow">Regular season awards</div>${awardsHtml(L)}</div>
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
        <div class="note">${o.top.map(p => esc(p.name) + ' (' + dp(p) + ')').join(' &middot; ')}</div>
        <div class="note">Roster strength <b>${od(o.ovr).toFixed(0)}</b> &middot; yours <b>${od(E.teamOvr(S.user, S.plan)).toFixed(0)}</b></div>
        <div class="ctrl" style="margin-top:4px"><button class="btn pri" data-a="play">Coach this game</button><button class="btn" data-a="quick">Quick sim</button></div>
        <div class="ctrl" style="margin-top:0"><button class="btn sm" data-a="sim10">Sim 10 games</button><button class="btn sm" data-a="simall">Sim to end of season</button><button class="btn sm" data-a="gocoach">Tactics</button></div></div></div>
      <div class="two" style="margin-top:16px"><div class="panel"><div class="eyebrow">Recent games</div>${lastGames()}</div><div class="panel"><div class="eyebrow">Conference standings</div>${standingsHtml()}</div></div>
      <div class="panel" style="margin-top:16px"><div class="eyebrow">Season stats</div>${statsHtml()}</div>
      ${teamReport(S.user.players, 'Team report')}`;
  };

  // ---------- playoffs ----------
  SCREENS.po = () => {
    const L = S.L, po = L.po, us = LG.seriesOfUser(L), ng = LG.nextPlayoffGame(L);
    const nm = i => i === 0 ? esc(S.teamName) : esc(L.teams[i].label);
    const ser = s => `<div class="ser ${s.a === 0 || s.b === 0 ? 'me' : ''}"><div><span>${nm(s.a)}</span><span class="${s.done && s.winner === s.a ? 'w' : ''} num">${s.wa}</span></div><div><span>${nm(s.b)}</span><span class="${s.done && s.winner === s.b ? 'w' : ''} num">${s.wb}</span></div></div>`;
    const tbd = '<div class="ser tbd"><div><span>To be decided</span><span class="num">&ndash;</span></div><div><span>To be decided</span><span class="num">&ndash;</span></div></div>';
    const cols = [8, 4, 2, 1].map((n, ri) => `<div class="bcol"><div class="eyebrow">${LG.roundName(ri)}</div><div class="bcells">${Array.from({ length: n }, (_, i) => { const s = po.rounds[ri] && po.rounds[ri][i]; return `<div class="bcell ${i % 2 ? 'odd' : 'even'}">${s ? ser(s) : tbd}</div>`; }).join('')}</div></div>`).join('');
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
  const resultLabel = L => Core.resultLabel(L);
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
    const r = L.rec[0], ach = Core.achievements(L, S.hard), score = Core.calcScore(L, S.hard), res = resultLabel(L);
    const G = Math.max(1, r.w + r.l), champ = L.phase === 'champion';
    if (!S.saved) {
      S.saved = true;
      const msg = { saved: 'Result verified and saved to your account.', guest: 'Sign in with Google to save results.', version: 'The game was updated while you played, so this result cannot be saved. Reload to play the new version.',
        dup: 'This season was already submitted.', invalid: 'The server could not verify this season, so it was not saved.', error: 'Saving failed. Try again later.' };
      submitRun().then(v => {
        S.verdict = v;
        const el = document.getElementById('saveInfo'); if (el) el.textContent = msg[v.state];
      });
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
      ${trophyCase(L)}
      ${L.po && L.po.champ != null ? `<div class="panel" style="margin-top:16px"><div class="eyebrow">Playoff awards</div>${poAwardsHtml(L)}</div>` : ''}
      <div class="panel" style="margin-top:16px"><div class="eyebrow">Regular season awards</div>${awardsHtml(L)}</div>
      <div class="panel" style="margin-top:16px;display:flex;gap:14px;align-items:center;flex-wrap:wrap"><button class="btn pri" data-a="newgame">New game</button><button class="btn" data-a="copy">Copy result</button><span class="note" id="saveInfo">${S.acct && S.D && S.D.id ? 'Verifying and saving result...' : 'Playing as guest: this result is not saved. Sign in with Google to keep results and achievements.'}</span></div>`;
  };

  // ---------- GAME ----------
  function stopLive() { if (S.live && S.live.timer) clearTimeout(S.live.timer); }
  function beginGame(G) {
    S.G = G;
    S.live = { timer: null, playing: false, speed: 1, tab: 'rot', sel: null, fed: 0, run: { t: -1, pts: 0 }, alert: '', window: true, winLabel: 'Pre-game', runAlerted: false, foulAlerted: {} };
    S.screen = 'game'; render(); window.scrollTo(0, 0);
  }
  const mySide = () => S.G.userSide;
  const canCoach = () => S.live.window && S.G.coachOpen && !S.G.over;
  SCREENS.game = () => `<div id="alerts"></div><div id="sb" class="sb"></div>
    <div class="gm"><div class="panel"><div class="eyebrow">Play by play</div><div class="feed" id="feed"></div><div class="ctrl" id="ctrl"></div></div>
    <div class="panel"><div id="sidetabs"></div><div id="sidebody"></div><div class="ctrl" id="sidectl"></div></div></div>`;
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
  // Only touch the DOM when the markup really changed, so a button is never replaced between mousedown and mouseup.
  function setHTML(id, html) { const el = document.getElementById(id); if (el && el._h !== html) { el.innerHTML = html; el._h = html; } }
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
    setHTML('ctrl', G.over ? '<button class="btn pri" data-a="finish">Continue</button>' :
      `${live.playing ? '<button class="btn pri" data-a="pause">Pause</button>' : '<button class="btn pri" data-a="resume">' + (live.window ? 'Resume game' : 'Resume') + '</button>'}${spd}
       <button class="btn" data-a="skipq">Sim to end of quarter</button><button class="btn" data-a="skipg">Sim to final</button>`);
    let banner = '';
    if (live.window && !G.over) banner += `<div class="banner win">Coaching window open (${esc(live.winLabel)}). Make your changes, then resume the game.</div>`;
    else if (!G.over) banner += '<div class="banner" style="background:#141b27;border-color:var(--line2);color:var(--mute)">Changes are locked while the clock runs. You can coach at quarter breaks or by calling a timeout.</div>';
    if (live.alert) banner += `<div class="banner">${esc(live.alert)}</div>`;
    setHTML('alerts', banner);
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
      const F = fitOf();
      const sec = (title, tbl, cur, act) => `<div class="tsec"><div class="th">${title}</div><div class="chips">${Object.keys(tbl).map(k => { const f = F && F.fit[k]; return `<button class="chip ${cur === k ? 'on' : ''}${f && f.rec ? ' best' : ''}" data-a="${act}" data-v="${k}" ${f && f.rec ? 'title="Best fit for your roster"' : ''}>${Array.isArray(tbl[k]) ? tbl[k][0] : tbl[k]}</button>`; }).join('')}</div><div class="td">${Array.isArray(tbl[cur]) ? esc(tbl[cur][1]) : esc(AUTO_D[cur])}${F && F.fit[cur] && (F.fit[cur].rec || F.fit[cur].weak) ? ` <b class="fitnote ${F.fit[cur].rec ? 'yes' : 'no'}">${F.fit[cur].rec ? 'Best fit.' : 'Poor fit.'}</b> ${esc(F.fit[cur].why)}` : ''}</div></div>`;
      body = `<div class="opt ${open ? '' : 'lock'}">
        ${sec('Tempo', TEMPO_I, plan.tempo, 'tempo')}
        ${sec('Offense', OFF_I, plan.off, 'off')}
        ${sec('Defense', DEF_I, plan.def, 'def')}
        ${sec('Substitutions', AUTO_I, plan.auto, 'auto')}
        <div class="tsec"><div class="th">Feed the ball to</div><div class="chips">${on.map(i => `<button class="chip ${G.feed[side] === i && G.feedLeft[side] > 0 ? 'on' : ''}" data-a="feed" data-i="${i}">${esc(P[i].name.split(' ').slice(-1)[0])}</button>`).join('')}</div><div class="td">The chosen player gets more shots for the next 8 possessions. A hot hand pays off, a cold one does not.</div></div>
        <div class="tsec"><div class="th">Double-team</div><div class="chips">${oppOn.map(i => `<button class="chip ${G.dbl[side] === i ? 'on' : ''}" data-a="dbl" data-i="${i}">${esc(oppP[i].name.split(' ').slice(-1)[0])}</button>`).join('')}</div><div class="td">Cuts that player's shooting and forces turnovers for the next 8 possessions, but opens shots for everyone else.</div></div></div>
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
    setHTML('sidetabs', tabs); setHTML('sidebody', body);
    setHTML('sidectl', G.over ? '' : `<button class="btn amb" data-a="timeout" ${G.to[side] <= 0 ? 'disabled' : ''}>Call timeout (${G.to[side]} left)</button> <span class="note">Space pauses / resumes</span>`);
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
    if (live.run.t === 1 - side && live.run.pts >= 10 && !live.runAlerted && G.to[side] > 0 && !(G.mo && G.mo.n < Core.MO.max)) { live.runAlerted = true; live.alert = 'The opponent is on a ' + live.run.pts + '-0 run. Call a timeout to stop it and make changes.'; return true; }
    for (const i of G.on[side]) { if (G.st[side][i].pf === 5 && !live.foulAlerted[i]) { live.foulAlerted[i] = 1; live.alert = G.teams[side].players[i].name + ' has 5 fouls. Call a timeout to sub him out, or leave it to the auto-subs.'; return true; } }
    return false;
  }
  function stepOnce() { const G = S.G, b = G.log.length; Core.step(S.SE, G); runTrack(G.log.slice(b)); }
  function openWindow(label) { S.live.window = true; S.live.winLabel = label; S.live.sel = null; }
  function loop() {
    const G = S.G, live = S.live;
    if (!live.playing) return;
    const q = G.q;
    stepOnce(); live.alert = '';
    if (G.over) { live.playing = false; updateGame(); gameOverModal(); return; }
    if (G.q !== q) { live.playing = false; openWindow('end of ' + (q <= 4 ? 'Q' + q : 'overtime')); updateGame(); return; }
    if (G.mo && G.mo.pending) { live.playing = false; updateGame(); showMoment(); return; }
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
  // ---------- interactive moments ----------
  const MO_ICON = {
    duel: '<svg viewBox="0 0 32 32" width="30" height="30" aria-hidden="true"><rect x="3" y="6" width="11" height="16" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><rect x="18" y="10" width="11" height="16" rx="2" fill="none" stroke="currentColor" stroke-width="2" transform="rotate(8 23 18)"/><path d="M8 11h2M8 15h2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    call: '<svg viewBox="0 0 32 32" width="30" height="30" aria-hidden="true"><path d="M5 24c4-10 9-14 20-15M20 5l6 4-5 5M7 9l4 4M11 9l-4 4" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>'
  };
  const MO_TXT = {
    late: ['Crunch time', 'Under two minutes left in a close game.'],
    ot: ['Overtime', 'Five more minutes. How do you want to start?'],
    dry: ['Cold spell', 'You have not scored in four minutes.'],
    run: ['Opponent run', 'They are on a big run and you have to answer.']
  };
  // [what it does, what it needs]
  const MO_HELP = {
    iso: ['Your best scorer gets the ball and goes one-on-one.', 'Works best with a clear superstar on the floor.'],
    pnr: ['The ball handler and a big man run a two-man game.', 'Works best with good passers and a lob or roll threat.'],
    three: ['Space the floor and take open threes.', 'Works best with several real three-point shooters.'],
    foul: ['Drive at the rim and try to get to the free-throw line.', 'Works best with players who draw fouls.'],
    timeout: ['Stop play, rest your players, and reset.', 'Costs one timeout. Always a safe choice.'],
    press: ['Pressure the ball the full length of the court.', 'Works best with quick hands and steals.'],
    zone: ['Pack the paint and make them shoot from outside.', 'Works best with shot blockers and rebounders.'],
    double: ['Send two defenders at their best scorer.', 'Stops him, but opens a shot for someone else.']
  };
  function momentSb() {
    const G = S.G, u = G.userSide;
    return `<div class="mo-sb"><span>${G.q > 4 ? 'OT' : 'Q' + G.q} ${mmss(Math.max(0, Math.round(G.clock)))}</span><b class="num">${esc(S.teamName)} ${G.score[u]}</b><span>-</span><b class="num">${G.score[1 - u]} ${esc(G.teams[1 - u].label)}</b></div>`;
  }
  const statCell = (p, st) => { const v = st[3](p); return v == null || isNaN(v) ? '-' : (Math.round(v * 10) / 10).toFixed(1); };
  function duelHtml(pd, done) {
    const G = S.G, u = G.userSide, a = G.teams[u].players[pd.mine], b = G.teams[1 - u].players[pd.theirs];
    const att = pd.mode === 'attack', res = done && done.type === 'duel' ? done : null;
    const row = (st, i) => {
      const chosen = res && res.idx === i;
      return `<button class="mo-row ${chosen ? 'chosen' : ''}" data-a="mochoice" data-i="${i}" ${res ? 'disabled' : ''}><span>${st[1]}<i>${st[2]}</i></span><b class="num">${statCell(a, st)}</b></button>`;
    };
    const orow = (st, i) => `<div class="mo-orow ${res && res.idx === i ? 'chosen' : ''}"><span>${st[1]}<i>${st[2]}</i></span><b class="num">${res ? statCell(b, st) : '??'}</b></div>`;
    const verdict = res ? (res.res.win > 0 ? `<div class="mo-verdict win">You win the matchup</div><p class="note">${att ? 'Easier looks' : 'Tougher shots for them'} for the next few possessions.</p>` : res.res.win < 0 ? `<div class="mo-verdict lose">They win the matchup</div><p class="note">${att ? 'Harder looks' : 'Easier shots for them'} for the next few possessions.</p>` : `<div class="mo-verdict">Dead even</div><p class="note">No change.</p>`) : '';
    return `<div class="mo-head"><span class="mo-ic">${MO_ICON.duel}</span><div><h2>Matchup: ${att ? 'attack' : 'defend'}</h2><p class="note">${att ? 'Pick the category where your player beats the man guarding him.' : 'Pick the category where your defender beats the scorer he is guarding.'}</p></div></div>${momentSb()}
      <div class="mo-duel"><div class="mo-card me"><div class="mo-tag">${att ? 'Your attacker' : 'Your defender'}</div><h3>${esc(a.name)}</h3><div class="note">${esc(a.pos)} &middot; ${esc(a.fromSeason + ' ' + a.fromTm)}</div><div class="mo-rows">${STATS_.map(row).join('')}</div></div>
      <div class="mo-vs">VS</div>
      <div class="mo-card op"><div class="mo-tag">${att ? 'His defender' : 'The scorer'}</div><h3>${esc(b.name)}</h3><div class="note">${esc(b.pos || '')} &middot; ${esc(G.teams[1 - u].label)}</div><div class="mo-rows">${STATS_.map(orow).join('')}</div></div></div>${verdict}
      <div class="ctrl">${res ? '<button class="btn pri" data-a="mocont">Continue</button>' : '<button class="btn" data-a="moauto">Skip: let the staff decide</button>'}</div>`;
  }
  const STATS_ = Core.STATS;
  function callHtml(pd, done) {
    const G = S.G, P = G.teams[G.userSide].players, res = done && done.type === 'call' ? done : null, T = MO_TXT[pd.kind];
    const opt = (o, i) => `<button class="mo-opt ${res && res.idx === i ? 'chosen' : ''}" data-a="mochoice" data-i="${i}" ${res || o.off ? 'disabled' : ''}><b>${o.label}</b><span>${MO_HELP[o.id][0]}</span><span class="need">${MO_HELP[o.id][1]}</span>${o.who && o.who.length ? `<em>On your floor: ${o.who.map(i => esc(P[i].name.split(' ').slice(-1)[0])).join(', ')}</em>` : o.off ? '<em>No timeouts left</em>' : ''}</button>`;
    let verdict = '';
    if (res) {
      const b = res.res.b;
      verdict = pd.kind === 'run' ? '<div class="mo-verdict">Play called</div>' : b > 0.03 ? '<div class="mo-verdict win">Good read: this lineup suits it</div>' : b < -0.03 ? '<div class="mo-verdict lose">Poor fit for this lineup</div>' : '<div class="mo-verdict">Play called</div>';
      verdict += '<p class="note">The next few possessions will show how it works out.</p>';
    }
    return `<div class="mo-head"><span class="mo-ic">${MO_ICON.call}</span><div><h2>${T[0]}</h2><p class="note">${T[1]}</p></div></div>${momentSb()}
      ${res ? '' : '<p class="mo-how">Pick one play. It affects the next ten possessions, and the best choice depends on who is on your floor right now.</p>'}<div class="mo-opts">${pd.opts.map(opt).join('')}</div>${verdict}
      <div class="ctrl">${res ? '<button class="btn pri" data-a="mocont">Continue</button>' : '<button class="btn" data-a="moauto">Skip: let the staff decide</button>'}</div>`;
  }
  function showMoment(done) {
    const m = S.G.mo, pd = m && m.pending;
    closeModal();
    if (!pd && !done) return;
    const src = pd || S.live.moShown;
    S.live.moShown = src;
    document.body.insertAdjacentHTML('beforeend', `<div class="modal moment"><div class="box">${src.type === 'duel' ? duelHtml(src, done) : callHtml(src, done)}</div></div>`);
  }
  function momentDone() {
    const live = S.live, G = S.G; closeModal(); live.moShown = null;
    updateGame();
    if (G.over) return;
    if (G.coachOpen && G.mo.res && G.mo.res.kind === 'run' && G.mo.res.idx === 0) { openWindow('timeout'); updateGame(); return; }
    live.playing = true; live.window = false; live.timer = setTimeout(loop, 300);
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
  const FACTS = [
    'Wilt Chamberlain scored 100 points in a single game on March 2, 1962.',
    'The 1995-96 Bulls won 72 games. The 2015-16 Warriors broke that with 73.',
    'Bill Russell won 11 championships in 13 seasons with the Celtics.',
    'Boston won eight straight titles from 1959 to 1966.',
    'Oscar Robertson averaged a triple-double for the whole 1961-62 season.',
    'The NBA added the three-point line in the 1979-80 season.',
    'The 24-second shot clock arrived in 1954 and saved the league from stalling.',
    'John Stockton leads all time in assists and steals, and it is not close.',
    'Dennis Rodman won seven straight rebounding titles from 1992 to 1998.',
    'Stephen Curry hit 402 threes in 2015-16, a record that stood far above the old one.',
    'Hakeem Olajuwon is the all-time leader in blocked shots.',
    'Kareem Abdul-Jabbar held the career scoring record for almost 39 years.',
    'Wilt Chamberlain grabbed 55 rebounds in a single game in 1960.',
    'Chamberlain averaged 50.4 points per game in 1961-62.'
  ];
  const simFact = { base: 0, t0: 0 };
  function simPanel(L) {
    const g = L.userGames, n = g.length, r = L.rec[0], last = g.slice(-12), lg = g[n - 1];
    const pips = last.map(x => `<i class="pip ${x.win ? 'w' : 'l'}">${x.win ? 'W' : 'L'}</i>`).join('');
    const fact = FACTS[(simFact.base + Math.floor((performance.now() - simFact.t0) / 6500)) % FACTS.length], opp = lg && L.teams[lg.opp];
    return `<div class="simp"><div class="simp-top"><span class="eyebrow">Simulating the season</span><span class="simp-n num">Game ${n} of 82</span></div>
      <div class="simp-rec led num">${r.w}<small>&ndash;</small>${r.l}</div>
      <div class="simp-bar"><div style="width:${Math.round(n / 82 * 100)}%"></div></div>
      <div class="simp-pips">${pips}</div>
      ${lg ? `<div class="simp-last ${lg.win ? 'w' : 'l'}"><b>${lg.win ? 'W' : 'L'}</b><span>${lg.home ? 'vs' : '@'} ${esc(opp ? opp.label : '')}</span><b class="num">${lg.us}-${lg.them}${lg.ot ? ' OT' : ''}</b></div>` : ''}
      <div class="simp-fact"><small>Did you know</small>${esc(fact)}</div></div>`;
  }
  function chunkSim(days) {
    const L = S.L; let n = 0;
    simFact.base = Math.floor(Math.random() * FACTS.length); simFact.t0 = performance.now();
    const step = () => {
      if (S.screen !== 'sim') return;
      if (n < days && L.phase === 'season') { Core.quick(S.SE); n++; }
      if (n < days && L.phase === 'season') { app.innerHTML = simPanel(L); setTimeout(step, 85); } else go('hub');
    };
    S.screen = 'sim'; app.innerHTML = simPanel(L); setTimeout(step, 85);
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
      <p><b>Moments.</b> When you coach a game step by step, play pauses a few times: a matchup duel in each half, and a coach's call in a close finish, in overtime, after a long scoring drought or when the opponent goes on a big run. The right read is worth about a point a moment, a guess is worth nothing, and skipping costs nothing. Quick sims have no moments.</p>
      <p><b>Playoffs.</b> Top eight in each conference, best-of-seven series up to the Finals.</p>
      <p><b>Saving.</b> Results and achievements are saved only when you are signed in with Google. Guests play normally, but nothing is saved. We store your first name and last initial, your Google account ID and your finished seasons, nothing else. <button class="btn sm" data-a="delacct">Delete my account and data</button></p>
      <div class="ctrl"><button class="btn pri" data-a="closemodal">Close</button></div></div></div>`);
    },
    closemodal() { closeModal(); },
    preset(d) { S.from = +d.f; S.to = +d.t; setPool(); updateRangeUI(); const a = document.getElementById('rf'), b = document.getElementById('rt'); if (a) { a.value = S.from; b.value = S.to; } },
    hard(d) { S.hard = d.v === '1'; document.querySelectorAll('.mode').forEach((m, i) => m.classList.toggle('on', (i === 1) === S.hard)); },
    async start() {
      setPool(); if (S.pool.length < MIN_POOL || S.starting) return;
      newDraft();
      if (S.acct) {                               // signed in: the draft lives on the server so results can be verified
        S.starting = true;
        try {
          const r = await api('/api/draft', { method: 'POST', body: JSON.stringify({ op: 'start', hard: S.hard, from: S.from, to: S.to, ver: Core.VERSION }) });
          S.D.id = r.id;
        } catch (e) {
          S.starting = false;
          const msg = e && e.status === 409 ? 'A new version of the game is available. Reload the page to continue.' : e && e.status === 429 ? 'Too many drafts started. Try again in a little while.' : 'Could not start the draft. Try again.';
          const el = document.getElementById('startErr'); if (el) el.textContent = msg; else alert(msg);
          return;
        }
        S.starting = false;
      }
      go('draft');
    },
    spin() { doSpin(false); },
    respin() { doSpin(true); },
    scout() { const D = S.D; if (D.scouts > 0 && D.cur) { D.scouts--; D.scoutedId = D.cur.id; render(); } },
    sel(d) {
      const D = S.D, p = D.cur.players[+d.i]; if (D.picks.some(x => x.name === p.name) || !E.canAdd(D.picks, p)) return;
      D.sel = +d.i; const fp = fitPositions(p), main = String(p.elig || p.pos || '').split(',')[0];
      D.selPos = fp.includes(main) ? main : fp[0]; render();
    },
    place(d) { const D = S.D; if (D.sel == null) return; if (fitPositions(D.cur.players[D.sel]).includes(d.v)) { D.selPos = d.v; render(); } },
    async confirm() {
      const D = S.D; if (D.sel == null || D.phase !== 'choose' || D.busy) return;
      const i = D.sel, pos = D.selPos || null, np = Core.makePick(D.picks, D.cur, i, pos);
      if (!np) return;
      if (D.busy) return;
      let seed = null;
      if (D.id) {
        D.busy = true;
        try { const r = await api('/api/draft', { method: 'POST', body: JSON.stringify({ op: 'pick', id: D.id, i, pos }) }); if (r.done) seed = r.seed; }
        catch (e) { return draftError(e); }
        D.busy = false;
      }
      D.picks.push(np); D.selPos = null;
      D.round++; D.sel = null; D.cur = null; D.phase = 'idle'; D.reel = null;
      if (D.round >= 10) {
        S.revealed = true; S.seed = D.id ? seed : newSeed();
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
    applyrec() {
      if (S.screen === 'game' && !canCoach()) return locked();
      const F = fitOf(); if (!F) return;
      if (F.best.off) S.plan.off = F.best.off;
      if (F.best.def) S.plan.def = F.best.def;
      refreshCoach();
    },
    resetplan() { const k = { t: S.plan.tempo, o: S.plan.off, d: S.plan.def, a: S.plan.auto }; const np = E.defaultPlan(S.user); np.tempo = k.t; np.off = k.o; np.def = k.d; np.auto = k.a; Object.assign(S.plan, np); refreshCoach(); },
    beginSeason() {
      const nm = document.getElementById('tname'); if (nm && nm.value.trim()) S.teamName = nm.value.trim();
      const SE = Core.createSeason({ picks: S.D.picks, pool: S.pool, seed: S.seed, hard: S.hard, name: S.teamName });
      Object.assign(SE.plan, { starters: S.plan.starters.slice(), mins: S.plan.mins.slice(), tempo: S.plan.tempo, off: S.plan.off, def: S.plan.def, auto: S.plan.auto });
      SE.user.name = SE.user.label = S.teamName;
      S.SE = SE; S.L = SE.L; S.user = SE.user; S.plan = SE.plan; S.saved = false; S.lastRun = null; S.verdict = null;
      go('hub');
    },
    gocoach() { S.coachBack = S.screen; go('coach'); },
    coachBack() { go(S.coachBack || 'hub'); },
    play() { beginGame(Core.beginLive(S.SE, false)); },
    quick() { Core.quick(S.SE); go('hub'); },
    sim10() { chunkSim(10); },
    simall() { chunkSim(82); },
    startpo() { Core.startPlayoffs(S.SE); S.saved = false; routeByPhase(); },
    playpo() { beginGame(Core.beginLive(S.SE, true)); },
    quickpo() { Core.quickPo(S.SE); routeByPhase(); },
    simseries() { const s = LG.seriesOfUser(S.L); let n = 0; while (s && !s.done && S.L.phase === 'playoffs' && n++ < 8) Core.quickPo(S.SE); routeByPhase(); },
    mochoice(d) { const i = +d.i, ok = Core.answerMoment(S.SE, S.G, i); if (!ok) return; showMoment(Object.assign({ idx: i }, S.G.mo.res)); },
    mocont() { momentDone(); },
    moauto() { Core.skipMoment(S.G); momentDone(); },
    resume() { const live = S.live; if (S.G.over || live.playing) return; if (S.G.mo && S.G.mo.pending) { showMoment(); return; } live.playing = true; live.window = false; live.alert = ''; live.sel = null; live.timer = setTimeout(loop, 50); updateGame(); },
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
      Core.lineup(S.SE, G, on.map(x => x === outP ? inP : x));
      live.sel = null; updateGame();
    },
    timeout() {
      const G = S.G, live = S.live;
      if (G.over || G.to[mySide()] <= 0) return;
      live.playing = false; stopLive();
      if (Core.timeout(S.SE, G)) { live.run = { t: -1, pts: 0 }; live.alert = ''; openWindow('timeout'); updateGame(); }
    },
    feed(d) { if (!canCoach()) return locked(); Core.feed(S.SE, S.G, +d.i); updateGame(); },
    dbl(d) { if (!canCoach()) return locked(); Core.double(S.SE, S.G, +d.i); updateGame(); },
    finish() {
      closeModal();
      const G = S.G; if (!G || !G.over) return;
      Core.finishLive(S.SE, G);
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

  document.addEventListener('keydown', e => {
    if (e.code !== 'Space' || S.screen !== 'game' || !S.G || e.target.closest('input,select,textarea,button')) return;
    e.preventDefault();
    if (S.G.over) return;
    if (S.live.playing) ACTIONS.pause(); else ACTIONS.resume();
  });
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
    Report.setCore(Core, E);
    S.teams = Core.mkTeams(D);
    S.byId = new Map(S.teams.map(t => [t.id, t]));
    setPool(); S.screen = 'menu'; render(); initAccount();
  }).catch(err => { app.innerHTML = '<div class="loading">Could not load data: ' + esc(err.message) + '</div>'; });
  window.__S = S; window.__dp = dp;
})();
