/* Perfect Season: UI. Depends on Engine (engine.js) and League (league.js). */
(function () {
  'use strict';
  const E = Engine, LG = League;
  const app = document.getElementById('app');
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const MIN_POOL = 60;
  const COMPS = {
    nba: { id: 'nba', name: 'NBA', file: 'data.json', minY: 1950, maxY: 2026, from: 1980, to: 1999, ticks: [1950, 1960, 1970, 1980, 1990, 2000, 2010, 2020, 2026],
      presets: [['All-Time', 1950, 2026], ['1950s', 1950, 1959], ['1960s', 1960, 1969], ['1970s', 1970, 1979], ['1980s', 1980, 1989], ['1990s', 1990, 1999], ['2000s', 2000, 2009], ['2010s', 2010, 2019], ['2020s', 2020, 2026]] },
    el: { id: 'el', name: 'EuroLeague', file: 'data-el.json', minY: 2000, maxY: 2026, from: 2010, to: 2026, ticks: [2000, 2005, 2010, 2015, 2020, 2026],
      presets: [['All-Time', 2000, 2026], ['2000s', 2000, 2009], ['2010s', 2010, 2019], ['2020s', 2020, 2026]] }
  };
  const CF = () => COMPS[S.comp || 'nba'];
  const RL = () => E.RULES[S.comp || 'nba'];
  const TEMPO_I = { slow: ['Slow', 'Fewer possessions and less fatigue. More variance, which helps the underdog.'], normal: ['Normal', 'Balanced pace and fatigue.'], fast: ['Fast', 'More possessions, which favors the better team. Costs stamina and turnovers.'], push: ['Push', 'Maximum pace. Wears players down and risks turnovers. Use it when chasing a lead.'] };
  const OFF_I = { balanced: ['Balanced', 'No bonus and no penalty.'], inside: ['Inside', 'Feeds the post and cuts your threes. Pays off with strong rebounders and shot blockers.'], threes: ['Threes', 'More three-point attempts. Works only with real shooters on the floor.'], ballmove: ['Ball movement', 'Spreads shots and adds assists. Best with strong passers.'], iso: ['Isolation', 'Your star takes over. Only worth it with a truly dominant scorer; otherwise it costs you.'] };
  const DEF_I = { man: ['Man', 'Standard defense.'], zone: ['Zone', 'Protects the paint and cuts fouls, but gives up threes. Best with shot blockers.'], press: ['Press', 'More steals and turnovers. Pays off with active hands; tires your players and gives easier shots when beaten.'] };
  const AUTO_D = { auto: 'The coach manages rotations and fatigue for you, including foul trouble and garbage time.', forced: 'Players are only replaced when they foul out or are exhausted. You control everything else.', manual: 'No automatic substitutions at all. Fouled-out players are still removed.' };
  const AUTO_I = { auto: 'Automatic', forced: 'Forced only', manual: 'Manual' };

  const S = {
    screen: 'loading', comp: 'nba', cache: {}, from: 1980, to: 1999, hard: false, teams: [], pool: [], D: null, user: null, plan: null, L: null, G: null, live: null,
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
    const el = S.comp === 'el';
    if (el) raw += 3;                  // rated against EuroLeague, not NBA, statistics: the typical rotation player lands in the low 70s
    let t = 55 + (raw - 30) * 0.62 + 0.30 * Math.max(0, raw - 78);
    if (t > 92) t = 92 + 8 * (1 - Math.exp(-(t - 92) / 9));
    if (el && t > 88) t = 88 + 7 * (1 - Math.exp(-(t - 88) / 7));   // the best EuroLeague seasons top out in the mid 90s
    return Math.max(0, Math.min(99, Math.round(t)));
  }
  const dp = p => dispRating(p.ovr0 != null ? p.ovr0 : p.ovr);
  const LEGACY = { 'Šampion': 'Champion', 'Sampion': 'Champion', 'Prvak': 'Champion', 'Nije u plejofu': 'Missed playoffs', 'Propustio plejof': 'Missed playoffs' };
  const trRes = s => { s = String(s == null ? '' : s); if (LEGACY[s]) return LEGACY[s]; return s.replace(/^Eliminisan:\s*/i, 'Eliminated: ').replace('Šampion', 'Champion'); };
  const ovrCls = v => v >= 90 ? 't4' : v >= 80 ? 't3' : v >= 68 ? 't2' : 't1';
  const rnd = n => Math.floor(Math.random() * n);
  const mmss = c => Math.floor(c / 60) + ':' + String(c % 60).padStart(2, '0');
  const eraLabel = () => (S.comp === 'el' ? 'EuroLeague ' : '') + ((S.from === CF().minY && S.to === CF().maxY) ? 'All-Time' : S.from + '-' + S.to);
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
  // Real EuroLeague club colours [primary, secondary]. Colours only: no logos.
  const CLUB_EL = {
    AEK: ['#FFD500', '#111111'], ARI: ['#FFD200', '#111111'], ASV: ['#00A651', '#FFFFFF'], AVE: ['#0B6B3A', '#FFFFFF'], BAM: ['#C8102E', '#FFFFFF'],
    BAR: ['#A50044', '#004D98'], BAS: ['#0A2A6C', '#C8102E'], BER: ['#FFD500', '#0D2C6C'], BES: ['#2A2A2A', '#FFFFFF'], BIL: ['#0057A8', '#FFFFFF'],
    BUD: ['#0060AA', '#FFFFFF'], CAN: ['#FFD100', '#003A8F'], CED: ['#F58220', '#1A1A1A'], LJU: ['#00873E', '#FFFFFF'], CIB: ['#0A4DA2', '#FFFFFF'],
    CSK: ['#D5002B', '#003C7F'], DAR: ['#003A70', '#FFFFFF'], DYR: ['#00A3E0', '#1C2A5A'], FOR: ['#0A3D91', '#FFFFFF'], GAL: ['#A90432', '#FDB913'],
    HTA: ['#D71920', '#FFFFFF'], JER: ['#D71920', '#FFFFFF'], IST: ['#1B3F94', '#FFFFFF'], MAD: ['#F5F5F5', '#00529F'], MAL: ['#00843D', '#1F3A93'],
    MCO: ['#D6001C', '#FFFFFF'], MIL: ['#D6001C', '#FFFFFF'], MUN: ['#DC052D', '#0066B2'], OLY: ['#E2001A', '#FFFFFF'], PAM: ['#FF6A00', '#111111'],
    PAN: ['#0B6B3A', '#FFFFFF'], PAO: ['#2A2A2A', '#FFFFFF'], PAR: ['#2A2A2A', '#FFFFFF'], PRS: ['#0A2A5C', '#E30613'], RED: ['#E4002B', '#FFFFFF'],
    ROM: ['#2A2A2A', '#FFFFFF'], VIR: ['#2A2A2A', '#FFFFFF'], SIE: ['#0A7A3C', '#FFFFFF'], TEL: ['#FFD100', '#0057B8'], TRE: ['#00843D', '#FFFFFF'],
    ULK: ['#FFD100', '#0A2A6C'], UNK: ['#0B6B3A', '#FFFFFF'], ZAL: ['#00843D', '#FFFFFF'], SAS: ['#0A4DA2', '#FFFFFF'], PES: ['#C8102E', '#FFFFFF'],
    DYN: ['#0057B8', '#FFFFFF'], KHI: ['#0A3C7D', '#F9A01B']
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
    const ck = S.comp + ':' + tm, TAB = S.comp === 'el' ? CLUB_EL : CLUB;
    if (_cc[ck]) return _cc[ck];
    let pri, sec;
    if (TAB[tm]) { pri = hexHsl(TAB[tm][0]); sec = hexHsl(TAB[tm][1]); }
    else { const h = hashOf(tm) % 360; pri = [h, 60, 40]; sec = [(h + 40) % 360, 75, 62]; }
    const L = Math.min(Math.max(pri[2], 30), 70), S2 = pri[1] < 10 ? pri[1] : Math.max(pri[1], 38);
    const o = { h: pri[0], a: hslS(pri[0], S2, L), d: hslS(pri[0], S2, Math.max(16, L - 14)), b: hslS(sec[0], sec[1], Math.max(sec[2], 34)), l: pri[2] };
    return (_cc[ck] = o);
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
    try { S.board = (await api('/api/leaderboard?comp=' + S.comp)).board || []; } catch (e) { S.board = []; }
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
    const pc = y => ((y - CF().minY) / (CF().maxY - CF().minY) * 100);
    const ticks = CF().ticks.map(y => `<span style="left:${pc(y)}%">${y}</span>`).join('');
    return `<div class="range" id="range"><div class="track"><div class="fill" id="rfill" style="left:${pc(S.from)}%;right:${100 - pc(S.to)}%"></div></div>
      <input type="range" id="rf" min="${CF().minY}" max="${CF().maxY}" value="${S.from}" aria-label="From season">
      <input type="range" id="rt" min="${CF().minY}" max="${CF().maxY}" value="${S.to}" aria-label="To season"><div class="ticks">${ticks}</div></div>`;
  }
  function eraInfo() {
    const n = S.pool.length;
    const lim = S.comp === 'nba' && S.from < 1974;
    return `${n} team-seasons in the pool. ` + (n < MIN_POOL ? '<b class="warn">Widen the range (at least ' + MIN_POOL + ' needed).</b> ' : '') + (lim ? 'Before 1974 the database has no blocks, steals or turnovers, so those players have limited stats.' : S.comp === 'el' && S.from < 2016 ? 'Before 2016 a season is about 20 games (group stage and Top 16), so older ratings are estimated a little more cautiously. Players who changed clubs mid-season are left out.' : 'Full statistics for every player.');
  }
  SCREENS.menu = () => {
    const runs = (S.runs || []).filter(r => (r.comp || 'nba') === S.comp);
    const best = runs.slice().sort((a, b) => (b.score || 0) - (a.score || 0))[0];
    const titles = runs.filter(r => r.champ).length, perfect = runs.filter(r => r.l === 0).length;
    return `
    <div class="hero">
      <div>
        <h1>Draft <em>10</em>.<br>Coach them to <em>${RL().games}-0</em>.</h1>
        <p>Spin a team and a season, pick one player from that roster, and fill two spots at every position. Then coach the season game by game, quarter by quarter: substitutions, tempo, defense, timeouts. Then ${S.comp === 'el' ? 'the playoffs and the Final Four' : 'the playoffs'}.</p>
      </div>
      <div class="board">
        <div class="muted" style="font-family:var(--display);letter-spacing:.14em;text-transform:uppercase">The target</div>
        <div class="led big num">${RL().games}&ndash;0</div>
        <div class="muted">${S.acct ? (best ? 'Your best: <b class="led">' + best.w + '-' + best.l + '</b> &middot; ' + esc(trRes(best.res)) + ' &middot; ' + titles + ' titles &middot; ' + perfect + ' perfect seasons' : 'No saved seasons yet.') : 'Playing as guest: results are not saved. Sign in with Google to keep your results and achievements.'}</div>
      </div>
    </div>
    <div class="comps seg" id="comps">${Object.values(COMPS).map(c => `<button class="${S.comp === c.id ? 'on' : ''}" data-a="comp" data-v="${c.id}">${c.name}</button>`).join('')}</div>
    <div class="panel setup">
      <section class="era">
        <div class="eyebrow">Era</div>
        <div class="yr"><span class="led num" id="yrtxt">${S.from === CF().minY && S.to === CF().maxY ? 'All-Time' : S.from + ' &ndash; ' + S.to}</span></div>
        ${rangeHtml()}
        <div class="presets" id="presets">${CF().presets.map(p => `<button class="pre ${S.from === p[1] && S.to === p[2] ? 'on' : ''} ${p[0] === 'All-Time' ? 'all' : ''}" data-a="preset" data-f="${p[1]}" data-t="${p[2]}"><b>${p[0]}</b><span>${p[1]} &ndash; ${p[2]}</span></button>`).join('')}</div>
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
        <div class="note" style="margin-top:8px">${S.comp === 'el' ? 'Opponents are ' + (RL().teams - 1) + ' EuroLeague rosters from the same era. 38 games, then the top eight go to the playoffs.' : 'Opponents are 29 historical rosters from the same era.'}</div>
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
    const mine = S.runs.filter(r => (r.comp || 'nba') === S.comp);
    if (!mine.length) return '<p class="note">No saved ' + CF().name + ' seasons yet.</p>';
    return '<div class="tw"><table><tr><th>Record</th><th>Result</th><th>Mode</th><th class="r">Score</th></tr>' +
      mine.slice(0, 8).map(r => `<tr><td class="num">${r.w}-${r.l}</td><td>${esc(trRes(r.res))}</td><td>${r.hard ? 'Hard' : 'Normal'} &middot; ${esc(r.eraLabel || '')}</td><td class="r num">${r.score}</td></tr>`).join('') + '</table></div>';
  }
  function updateRangeUI() {
    const pc = y => ((y - CF().minY) / (CF().maxY - CF().minY) * 100);
    const f = document.getElementById('rfill'); if (!f) return;
    f.style.left = pc(S.from) + '%'; f.style.right = (100 - pc(S.to)) + '%';
    document.getElementById('yrtxt').innerHTML = S.from === CF().minY && S.to === CF().maxY ? 'All-Time' : S.from + ' &ndash; ' + S.to;
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
  // Awards the player-season earned (data/honors): shown as small gold chips, never in Hard mode before the stats are revealed.
  const HON = { MVP: ['MVP', 'top'], DPOY: ['DPOY', 'top'], A1: ['All-NBA 1st', 'a'], A2: ['All-NBA 2nd', 'b'], A3: ['All-NBA 3rd', 'c'], D1: ['All-Def 1st', 'd'], D2: ['All-Def 2nd', 'd'], E1: ['All-EL 1st', 'a'], E2: ['All-EL 2nd', 'b'] };
  const HON_ORD = ['MVP', 'DPOY', 'A1', 'E1', 'A2', 'E2', 'A3', 'D1', 'D2'];
  function honBadges(p, max) {
    const h = typeof p.hon === 'string' && p.hon ? p.hon.split(',') : []; if (!h.length) return '';
    const l = HON_ORD.filter(k => h.includes(k)).slice(0, max || 3);
    return l.length ? `<span class="hons">${l.map(k => `<i class="hon ${HON[k][1]}">${HON[k][0]}</i>`).join('')}</span>` : '';
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
        ${vis ? `<div class="trow">${traitBadge(p, true)}</div>${honBadges(p)}` : ''}
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
  const poolKey = () => S.comp + ':' + S.from + '-' + S.to;
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
  function spotHtml(pos, p, st, ghost, bench, pi) {
    // st: '' | 'ok' (can be placed here) | 'lock' (selected player cannot play here) | 'pick' (chosen target)
    const vis = !S.hard || S.revealed;
    const act = st === 'mvok' ? `data-a="mvto" data-v="${pos}"` : st === 'ok' || st === 'pick' ? `data-a="place" data-v="${pos}"` : 'disabled';
    const tag = bench ? 'onbench' : 'oncourt', sz = bench ? 54 : 64;
    const pos0 = bench ? '' : `style="left:${SPOT[pos][0]}%;top:${SPOT[pos][1]}%"`;
    const lab = (pl, who) => `<span class="pp"><span class="pl">${pl}</span>${who && vis ? `<span class="ovr ${ovrCls(dp(who))}">${dp(who)}</span>` : ''}</span>`;
    if (p) {
      const fa = st === 'mv' ? `data-a="mvcancel" title="Click again to cancel"` : st === 'swap' ? `data-a="mvswap" data-i="${pi}" title="Swap positions"` : st === 'movable' ? `data-a="mvsel" data-i="${pi}" title="Click to move him to another position"` : 'disabled';
      return `<button class="spot filled ${tag} ${st}" ${pos0} ${fa} aria-label="${esc(p.name)} at ${pos}">${avatar(p.name, p.fromTm, sz, vis ? dp(p) : null, p.pos, p.fromSeason)}<span class="nm">${esc(shortName(p.name))}</span>${lab(pos, p)}</button>`;
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
    const mover = D.mv != null && P[D.mv] ? P[D.mv] : null, moverPos = mover ? as[D.mv] : null;
    const sp = !mover && D.phase === 'choose' && D.sel != null ? D.cur.players[D.sel] : null;
    const fp = sp ? fitPositions(sp) : [];
    const mvT = mover ? Core.origElig(mover).filter(x => x !== moverPos) : [];
    const stOf = pos => !sp ? '' : (fp.includes(pos) ? (D.selPos === pos ? 'pick' : 'ok') : 'lock');
    const alts = p => Core.origElig(p).filter(x => x !== as[P.indexOf(p)]).length > 0;
    const cell = (pos, k) => {
      const p = byPos[pos][k], pi = p ? P.indexOf(p) : -1;
      if (mover) {
        if (p) {
          if (pi === D.mv) return spotHtml(pos, p, 'mv', null, k === 1, pi);
          if (mvT.includes(pos) && Core.origElig(p).includes(moverPos) && Core.rearrange(P, D.mv, pos, pi)) return spotHtml(pos, p, 'swap', null, k === 1, pi);
          return spotHtml(pos, p, alts(p) ? 'movable' : '', null, k === 1, pi);
        }
        const free = mvT.includes(pos) && byPos[pos].length === k && Core.rearrange(P, D.mv, pos);
        return spotHtml(pos, null, free ? 'mvok' : 'lock', null, k === 1);
      }
      const st = stOf(pos);
      const target = sp && fp.includes(pos) && !p && byPos[pos].length === k;   // next free spot at this position
      if (p) return spotHtml(pos, p, alts(p) && D.phase !== 'spinning' ? 'movable' : '', null, k === 1, pi);
      if (target) return spotHtml(pos, null, st, D.selPos === pos ? sp : null, k === 1);
      return spotHtml(pos, null, sp ? 'lock' : '', null, k === 1);
    };
    const avg = P.length && vis ? (P.reduce((a, p) => a + dp(p), 0) / P.length).toFixed(1) : '--';
    const hint = mover ? `Moving <b>${esc(mover.name)}</b> (now ${moverPos}). Click a lit spot to move him there, or a player to swap places. Click him again to cancel.` : sp ? `<b>${esc(sp.name)}</b> can play ${fp.length ? fp.map(x => `<b>${x}</b>`).join(', ') : 'nowhere (no open spot)'}. Click a lit spot to choose where he goes.` : 'Draft two players at every position. Versatile players can fill more than one spot, so you cannot stack five centers.';
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
      ${miniRoster()}<div class="grid2"><div><div class="stage">${reel}${acts}</div>${cards}</div><div>${rosterPanel()}${teamReport(D.picks, 'Team report')}</div></div>${draftBar()}`;
  };
  // Phone-only strip: who is on each position so far (tap the court below to move players).
  function miniRoster() {
    const D = S.D, P = D.picks, as = P.length ? E.assign(P) : [], vis = !S.hard || S.revealed;
    return `<div class="mini">${E.POS.map(pos => { const ps = P.filter((p, i) => as[i] === pos); return `<div class="mc"><b>${pos}</b>${[0, 1].map(k => ps[k] ? `<span class="mp">${esc(shortName(ps[k].name))}${vis ? ` <i>${dp(ps[k])}</i>` : ''}</span>` : '<span class="mp e">&ndash;</span>').join('')}</div>`; }).join('')}</div>`;
  }
  // Phone-only sticky bar: the chosen player, where he goes, and the Draft button, always in reach.
  function draftBar() {
    const D = S.D; if (D.phase !== 'choose') return '';
    const sp = D.sel != null ? D.cur.players[D.sel] : null, vis = statsVisible();
    if (!sp) return `<div class="dbar"><div class="dbi"><span class="dbh">Tap a player to select him</span></div></div>`;
    const fp = fitPositions(sp);
    return `<div class="dbar sel"><div class="dbi"><div class="dbn">${esc(shortName(sp.name))}${vis ? ` <span class="ovr ${ovrCls(dp(sp))}">${dp(sp)}</span>` : ''}</div>
      <div class="dbp">${fp.length > 1 ? fp.map(x => `<button class="pchip ${D.selPos === x ? 'on' : ''}" data-a="place" data-v="${x}">${x}</button>`).join('') : `<span class="pchip on">${esc(fp[0] || '')}</span>`}</div></div>
      <button class="btn pri" data-a="confirm">Draft</button></div>`;
  }

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
      return `<div class="starter"><div class="sl">${esc(p.slot)}</div><div class="sw">${crest(p.fromTm, 30)}<div><b>${esc(p.name)}</b><span>${p.fromSeason} ${esc(p.fromTm)}</span>${traitBadge(p)}${injOf(pi) ? '<span class="inj">Out ' + injOf(pi) + '</span>' : ''}</div><div class="ovr ${ovrCls(dp(p))}" style="margin-left:auto">${dp(p)}</div></div>
        <select data-a="starter" data-k="${k}" aria-label="Starter ${k + 1}">${P.map((q, i) => `<option value="${i}" ${pi === i ? 'selected' : ''}>${esc(q.name)} (${esc(q.slot)})${injOf(i) ? ' - OUT' : ''}</option>`).join('')}</select></div>`;
    }).join('');
    const rows = P.map((p, i) => `<tr><td><div class="rn">${crest(p.fromTm, 20)}<div><b>${esc(p.name)}</b><span>${p.fromSeason} ${esc(p.fromTm)}</span>${traitBadge(p)}${honBadges(p, 2)}${injOf(i) ? '<span class="inj">Out ' + injOf(i) + '</span>' : ''}</div></div></td>
      <td><span class="pill">${esc(p.slot)}</span></td><td class="r"><span class="ovr ${ovrCls(dp(p))}" style="font-size:20px">${dp(p)}</span></td>
      <td class="r num">${dec(p.ppg)}</td><td class="r num">${dec(p.rpg)}</td><td class="r num">${dec(p.apg)}</td>
      <td><div class="mrow"><input class="mins" type="range" min="0" max="${RL().maxMin}" step="1" value="${plan.mins[i]}" data-a="mins" data-i="${i}" aria-label="Minutes for ${esc(p.name)}"><span class="num mv" id="m${i}">${plan.mins[i]}</span></div></td></tr>`).join('');
    const F = fitOf();
    const recBar = F ? `<div class="recbar"><div><b>Tactics that fit your roster</b><span>${F.best.off || F.best.def ? 'The green-framed options are the ones this roster is built for. They update when you change minutes or starters.' : 'No tactic stands out for this roster right now. Balanced and Man are a safe choice. This updates when you change minutes or starters.'}</span></div>${F.best.off || F.best.def ? `<button class="btn sm pri" data-a="applyrec" ${recMissing(F) ? '' : 'disabled'}>${recMissing(F) ? 'Apply recommended' : 'Applied'}</button>` : ''}</div>` : '';
    return `<div class="coach-grid">
      <div class="cl">
        <div class="panel"><div class="eyebrow">Starting five</div><div class="five">${five}</div></div>
        <div class="panel" style="margin-top:16px"><div class="eyebrow">Rotation and minutes</div>
          <div class="tw"><table class="rot-t"><tr><th>Player</th><th>Slot</th><th class="r">OVR</th><th class="r">PTS</th><th class="r">REB</th><th class="r">AST</th><th>Target minutes</th></tr>${rows}</table></div>
          <div class="mtotal ${tot === RL().mins ? 'ok' : ''}"><span>Total target minutes</span><b class="num"><span id="mtot">${tot}</span> / ${RL().mins}</b></div>
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
    const L = S.L, all = S.standAll || L.R.po.conf < 2, st = LG.standings(L).filter(x => all || x.conf === L.conf[0]);
    const tg = L.R.po.conf < 2 ? '' : `<div class="tabs" style="margin-bottom:8px"><button class="chip ${all ? '' : 'on'}" data-a="stand" data-v="0">My conference</button><button class="chip ${all ? 'on' : ''}" data-a="stand" data-v="1">Full league</button></div>`;
    return tg + `<div class="tw"><table><tr><th>#</th><th>Team</th><th class="r">W</th><th class="r">L</th><th class="r">+/-</th></tr>` +
      st.map((x, i) => `<tr class="${x.i === 0 ? 'me' : ''}"><td>${i + 1}</td><td>${x.i === 0 ? '<b>' + esc(S.teamName) + '</b>' : esc(x.team.label)}</td><td class="r num">${x.w}</td><td class="r num">${x.l}</td><td class="r num">${x.w + x.l ? (x.diff / (x.w + x.l)).toFixed(1) : '0.0'}</td></tr>`).join('') + '</table></div>';
  }
  function statsHtml() {
    const L = S.L, P = S.user.players;
    return `<div class="tw"><table><tr><th>Player</th><th class="r">G</th><th class="r">MIN</th><th class="r">PTS</th><th class="r">REB</th><th class="r">AST</th><th class="r">FG%</th></tr>` +
      P.map((p, i) => { const a = L.agg[i], g = a.g || 1; return `<tr><td>${esc(p.name)}</td><td class="r num">${a.g}</td><td class="r num">${(a.sec / 60 / g).toFixed(1)}</td><td class="r num">${(a.pts / g).toFixed(1)}</td><td class="r num">${(a.reb / g).toFixed(1)}</td><td class="r num">${(a.ast / g).toFixed(1)}</td><td class="r num">${a.fga ? (100 * a.fgm / a.fga).toFixed(1) : '--'}</td></tr>`; }).join('') + '</table></div>';
  }
  const IC = {
    tact: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4h6v3H9zM9 12h6M9 16h4"/></svg>',
    trade: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8h14l-3-3M20 16H6l3 3"/></svg>',
    ten: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 5l7 7-7 7M13 5l7 7-7 7"/></svg>',
    end: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 5l7 7-7 7M13 5v14M18 5v14"/></svg>'
  };
  // Season form strip: one cell per game, grouped in tens so the progress is easy to read
  function pipsHtml() {
    const L = S.L, N = L.R.games, cur = L.userGames.length; let h = '';
    for (let g0 = 0; g0 < N; g0 += 10) {
      let c = '';
      for (let i = g0; i < Math.min(N, g0 + 10); i++) { const g = L.userGames[i]; c += `<i class="${g ? (g.win ? 'w' : 'l') : (i === cur ? 'n' : '')}" title="${g ? 'Game ' + (i + 1) + ': ' + (g.win ? 'W' : 'L') + ' ' + g.us + '-' + g.them : 'Game ' + (i + 1)}"></i>`; }
      h += `<div class="fgrp"><div class="fgl">${g0 + 1}&ndash;${Math.min(N, g0 + 10)}</div><div class="fg">${c}</div></div>`;
    }
    return `<div class="strip">${h}</div>`;
  }
  function lastGames() {
    const L = S.L, gs = L.userGames.slice().reverse();
    if (!gs.length) return '<p class="note">No games played yet.</p>';
    return '<div class="tw hist"><table>' + gs.map(g => `<tr><td class="num">${g.day + 1}</td><td><span class="res ${g.win ? 'W' : 'L'}">${g.win ? 'W' : 'L'}</span></td><td class="num">${g.us}-${g.them}${g.ot ? ' (OT)' : ''}</td><td>${g.home ? 'vs' : '@'} ${esc(L.teams[g.opp].label)}</td></tr>`).join('') + '</table></div>';
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
    if (L.phase === 'champion') mine.unshift(L.R.id === 'el' ? 'EuroLeague Champions' : 'NBA Champions');
    if (!mine.length) return '';
    const icon = s => /Champions/.test(s) ? ['ball', ''] : /Finals MVP|^MVP/.test(s) ? ['cup', ''] : /Defensive Player/.test(s) ? ['shield', ''] : /Coach/.test(s) ? ['clip', ''] : /Scoring/.test(s) ? ['medal', 'PTS'] : /Rebound/.test(s) ? ['medal', 'REB'] : /Assist/.test(s) ? ['medal', 'AST'] : /Steal/.test(s) ? ['medal', 'STL'] : /Block/.test(s) ? ['medal', 'BLK'] : ['star', ''];
    return `<div class="tcase"><div class="eyebrow">Trophy case</div><div class="tc-row">${mine.map(s => { const i = s.indexOf(': '), ic = icon(s); return `<div class="tc">${trophy(ic[0], ic[1], 76)}<div class="tcn">${esc(i > 0 ? s.slice(0, i) : s)}</div>${i > 0 ? `<div class="tcp">${esc(s.slice(i + 2))}</div>` : ''}</div>`; }).join('')}</div></div>`;
  }
  const injOf = i => (S.L && S.L.inj && S.L.inj.i === i ? S.L.inj.g : 0);
  const IC_INJ = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6z"/></svg>';
  const injBar = () => {
    const L = S.L; if (!L || !L.inj) return '';
    const p = S.user.players[L.inj.i], g = L.inj.g;
    return `<div class="injbar"><i>${IC_INJ}</i><div><b>Injury report: ${esc(p.name)} is out</b><span>Misses the next ${g === 1 ? 'game' : g + ' games'}. The assistant coach plays the rest of your rotation; you can change the lineup in Tactics.</span></div></div>`;
  };
  const tradeBtn = () => {
    const st = Core.tradeState(S.SE);
    return st.open ? `<button data-a="gotrade">${IC.trade}Trade <em>${st.left} left</em></button>` : '';
  };
  // Trade screen: every player shows his season averages, and each offer shows how it compares with the man going out.
  const TST = [['PTS', 'ppg', 1], ['REB', 'rpg', 1], ['AST', 'apg', 1], ['STL', 'spg', 1], ['BLK', 'bpg', 1], ['FG%', 'fg', 100], ['MIN', 'mpg', 1]];
  const sval = (p, k, m) => { const v = p[k]; return v == null ? '--' : (v * m).toFixed(1); };
  function tradeCard(p, i, out) {
    const vis = !S.hard || S.revealed, hue = hueOf(p.fromTm);
    const cell = ([l, k, m]) => {
      const a = (p[k] || 0) * m, b = (out[k] || 0) * m, d = a - b, c = Math.abs(d) < 0.05 ? 'eq' : d > 0 ? 'up' : 'dn';
      return `<div class="tcs"><span>${l}</span><b class="num">${vis ? sval(p, k, m) : '&nbsp;'}</b>${vis ? `<em class="${c}">${c === 'eq' ? '=' : (d > 0 ? '+' : '') + d.toFixed(1)}</em>` : ''}</div>`;
    };
    const dOvr = dp(p) - dp(out);
    return `<button class="tcard" style="--h:${hue};${clubStyle(p.fromTm)}" data-a="toffer" data-i="${i}">
      <div class="tch">${crest(p.fromTm, 22)}<span>${p.fromSeason} ${esc(p.fromTm)}</span><span class="ovr ${vis ? ovrCls(dp(p)) : 'tq'}">${vis ? dp(p) : '??'}</span></div>
      <div class="tcb"><div class="who">${avatar(p.name, p.fromTm, 46, vis ? dp(p) : null, p.pos, p.fromSeason)}<div><div class="nm">${esc(p.name)}</div>${posChips(p)}</div></div>
        ${vis ? `<div class="trow">${traitBadge(p, true)}</div>${honBadges(p)}` : ''}
        <div class="tcg">${TST.map(cell).join('')}</div></div>
      <div class="tcf"><span>Replaces ${esc(out.name)}</span>${vis ? `<em class="${dOvr > 0 ? 'up' : dOvr < 0 ? 'dn' : 'eq'}">OVR ${dOvr > 0 ? '+' : ''}${dOvr}</em>` : ''}</div></button>`;
  }
  SCREENS.trade = () => {
    const st = Core.tradeState(S.SE), P = S.user.players, T = S.tr || (S.tr = { give: null }), vis = !S.hard || S.revealed;
    const head = `<div class="trh"><span></span><span>Player</span>${['PTS', 'REB', 'AST', 'FG%', 'MIN'].map(x => `<span class="r">${x}</span>`).join('')}<span class="r">OVR</span></div>`;
    const rows = P.map((p, i) => `<button class="trrow2 ${T.give === i ? 'on' : ''}" data-a="tgive" data-i="${i}">${crest(p.fromTm, 24)}
      <div class="trn"><b>${esc(p.name)}</b><span>${p.fromSeason} ${esc(p.fromTm)} &middot; ${esc(p.slot)}${injOf(i) ? ' &middot; out ' + injOf(i) : ''}</span>${traitBadge(p)}</div>
      ${[['ppg', 1], ['rpg', 1], ['apg', 1], ['fg', 100], ['mpg', 1]].map(([k, m]) => `<span class="num r st">${vis ? sval(p, k, m) : ''}</span>`).join('')}
      <span class="ovr ${vis ? ovrCls(dp(p)) : 'tq'}">${vis ? dp(p) : '??'}</span></button>`).join('');
    let offers = '';
    if (T.give != null) {
      const out = P[T.give], poss = Core.tradePositions(S.SE, T.give), locks = Core.tradeLocks(S.SE, T.give);
      if (T.pos != null && !poss.includes(T.pos)) T.pos = null;
      const offs = T.pos != null ? Core.tradeOffers(S.SE, T.give, T.pos) : [];
      const pbar = `<div class="eyebrow" style="margin-top:22px">Which position do you want back?</div><p class="note" style="margin-bottom:10px">Any position is allowed. ${locks.length ? esc(out.name) + ' is your only natural ' + locks.join('/') + ', so he can only be swapped for another natural ' + locks.join('/') + '.' : 'Your roster keeps a natural player at every position it has now.'} Greyed out: nobody suitable is available.</p><div class="posbar">${['PG', 'SG', 'SF', 'PF', 'C'].map(x => `<button class="posb ${T.pos === x ? 'on' : ''}" data-a="tpos" data-p="${x}" ${poss.includes(x) ? '' : 'disabled'}>${x}</button>`).join('')}</div>`;
      offers = T.pos == null ? pbar : pbar + (offs.length ? `<div class="eyebrow" style="margin-top:22px">Offers at ${T.pos} for ${esc(out.name)}</div><p class="note" style="margin-bottom:10px">Three players of similar quality from your era. The small numbers show the difference from ${esc(out.name.split(' ').slice(-1)[0])}: green is better, red is worse.</p><div class="tcards">${offs.map((p, i) => tradeCard(p, i, out)).join('')}</div>` : `<p class="note" style="margin-top:16px">Nobody on the market is close enough to ${esc(out.name)}. Pick someone else.</p>`);
    }
    return `<div class="row" style="justify-content:space-between;margin-bottom:6px"><h2 style="font-size:36px">Trade</h2><button class="btn pri" data-a="tback">Back</button></div>
      <p class="note" style="margin-bottom:14px">Trades left: <b>${st.left}</b> &middot; deadline: game ${st.lastGame} (you have played ${st.played}). Pick the player to give up, the position you want back, then one of three offers. A trade cannot be undone.</p>
      <div class="panel"><div class="eyebrow">Who goes?</div><div class="trtab">${head}${rows}</div></div>${offers}`;
  };
  SCREENS.hub = () => {
    const L = S.L, r = L.rec[0];
    if (L.phase === 'seasonDone') {
      return `<div class="panel" style="text-align:center;padding:40px 16px"><div class="muted" style="font-family:var(--display);letter-spacing:.14em;text-transform:uppercase">Regular season complete</div>
        <div class="rec led num">${r.w}&ndash;${r.l}</div>${r.l === 0 ? '<h2 style="color:var(--good)">Undefeated. ' + L.R.games + '-0.</h2>' : ''}
        <p class="note">Conference seed: ${LG.standings(L).filter(x => x.conf === L.conf[0]).findIndex(x => x.i === 0) + 1}</p>${pipsHtml()}
        <div style="margin-top:20px"><button class="btn pri" data-a="startpo">Start playoffs</button></div></div>
        ${trophyCase(L)}<div class="panel" style="margin-top:16px"><div class="eyebrow">Regular season awards</div>${awardsHtml(L)}</div>
        <div class="two" style="margin-top:16px"><div class="panel"><div class="eyebrow">Standings</div>${standingsHtml()}</div><div class="panel"><div class="eyebrow">Season stats</div>${statsHtml()}</div></div>`;
    }
    const g = LG.nextUserGame(L), o = oppSummary(g.opp);
    return `${injBar()}<div class="grid2">
      <div class="panel"><div class="row" style="justify-content:space-between;align-items:flex-end">
        <div><div class="muted" style="font-family:var(--display);letter-spacing:.14em;text-transform:uppercase">${esc(S.teamName)} &middot; game ${L.day + 1} of ${L.R.games}</div><div class="rec led num">${r.w}&ndash;${r.l}</div></div>
        <div style="text-align:right"><div class="muted">Win streak</div><div class="led num" style="font-size:46px">${L.streak}</div></div></div>${pipsHtml()}
        <p class="note" style="margin-top:12px">${r.l > 0 ? 'The undefeated run is over. Keep winning for seeding and the playoffs.' : 'Still undefeated. One loss ends the ' + L.R.games + '-0 chase.'}</p></div>
      <div class="panel opp"><div class="vs">${g.userHome ? 'Home vs' : 'Away at'}</div>
        <div class="row" style="flex-wrap:nowrap">${crest(o.t.tm, 44)}<div class="t">${esc(o.t.label)}</div></div>
        <div class="note">${o.top.map(p => esc(p.name) + ' (' + dp(p) + ')').join(' &middot; ')}</div>
        <div class="note">Roster strength <b>${od(o.ovr).toFixed(0)}</b> &middot; yours <b>${od(E.teamOvr(S.user, S.plan)).toFixed(0)}</b></div>
        <div class="acts"><div class="arow"><button class="abtn main" data-a="play"><b>Coach this game</b><span>Play it possession by possession</span></button><button class="abtn" data-a="quick"><b>Quick sim</b><span>Get the result now</span></button></div>
        <div class="arow2"><div class="segb"><button data-a="sim10">${IC.ten}Next 10 games</button><button data-a="simall">${IC.end}Rest of season</button></div><div class="segb"><button data-a="gocoach">${IC.tact}Tactics</button>${tradeBtn()}</div></div></div></div></div>
      <div class="two" style="margin-top:16px"><div class="panel"><div class="eyebrow">Recent games</div>${lastGames()}</div><div class="panel"><div class="eyebrow">${S.L.R.po.conf < 2 ? 'Standings' : 'Conference standings'}</div>${standingsHtml()}</div></div>
      <div class="panel" style="margin-top:16px"><div class="eyebrow">Season stats</div>${statsHtml()}</div>
      ${teamReport(S.user.players, 'Team report')}`;
  };

  // ---------- playoffs ----------
  SCREENS.po = () => {
    const L = S.L, po = L.po, us = LG.seriesOfUser(L), ng = LG.nextPlayoffGame(L);
    const nm = i => i === 0 ? esc(S.teamName) : esc(L.teams[i].label);
    const ser = s => `<div class="ser ${s.a === 0 || s.b === 0 ? 'me' : ''}"><div><span>${nm(s.a)}</span><span class="${s.done && s.winner === s.a ? 'w' : ''} num">${s.wa}</span></div><div><span>${nm(s.b)}</span><span class="${s.done && s.winner === s.b ? 'w' : ''} num">${s.wb}</span></div></div>`;
    const tbd = '<div class="ser tbd"><div><span>To be decided</span><span class="num">&ndash;</span></div><div><span>To be decided</span><span class="num">&ndash;</span></div></div>';
    const cols = L.R.po.rounds.map((_, ri) => (L.R.po.seeds * L.R.po.conf / 2) >> ri).map((n, ri) => `<div class="bcol"><div class="eyebrow">${LG.roundName(ri, L.R)}</div><div class="bcells">${Array.from({ length: n }, (_, i) => { const s = po.rounds[ri] && po.rounds[ri][i]; return `<div class="bcell ${i % 2 ? 'odd' : 'even'}">${s ? ser(s) : tbd}</div>`; }).join('')}</div></div>`).join('');
    const pw = (L.poGames || []).filter(g => g.win).length, pl = (L.poGames || []).filter(g => !g.win).length;
    return `${injBar()}<div class="grid2"><div class="panel"><div class="muted" style="font-family:var(--display);letter-spacing:.14em;text-transform:uppercase">Playoffs &middot; ${LG.roundName(po.round, L.R)}</div>
      <div class="rec led num">${us ? (us.a === 0 ? us.wa : us.wb) + '&ndash;' + (us.a === 0 ? us.wb : us.wa) : ''}</div>
      <div class="note">Playoff record ${pw}-${pl} &middot; regular season ${L.rec[0].w}-${L.rec[0].l}</div></div>
      <div class="panel opp"><div class="vs">${ng ? 'Game ' + (ng.gameNo + 1) + ' &middot; ' + (ng.series && ng.series.neutral ? 'neutral court vs' : ng.userHome ? 'home vs' : 'away at') : ''}</div>
      <div class="row" style="flex-wrap:nowrap">${ng ? crest(L.teams[ng.opp].tm, 44) : ''}<div class="t">${ng ? esc(L.teams[ng.opp].label) : ''}</div></div>
      <div class="acts"><div class="arow"><button class="abtn main" data-a="playpo"><b>Coach this game</b><span>Play it possession by possession</span></button><button class="abtn" data-a="quickpo"><b>Quick sim</b><span>Get the result now</span></button></div>
      <div class="arow2"><div class="segb"><button data-a="simseries">${IC.ten}Sim the series</button><button data-a="gocoach">${IC.tact}Tactics</button></div></div></div></div></div>
      <div class="panel" style="margin-top:16px"><div class="bracket">${cols}</div></div>`;
  };

  // ---------- season end ----------
  const resultLabel = L => Core.resultLabel(L);
  function seedOf(L) { const st = LG.standings(L).filter(x => x.conf === L.conf[0]); return st.findIndex(x => x.i === 0) + 1; }
  function pathHtml(L) {
    const po = L.po; if (!po || !L.userInPlayoffs) return '<p class="note">The team did not qualify for the playoffs.</p>';
    return `<div class="path">` + L.R.po.rounds.map((_, ri) => {
      const R = po.rounds[ri]; const s = R && R.find(x => x.a === 0 || x.b === 0);
      if (!s) return `<div class="step na"><div class="sn">${LG.roundName(ri, L.R)}</div><div class="sv">Not reached</div></div>`;
      const us = s.a === 0 ? s.wa : s.wb, them = s.a === 0 ? s.wb : s.wa, opp = s.a === 0 ? s.b : s.a;
      const state = !s.done ? 'na' : us > them ? 'win' : 'loss';
      return `<div class="step ${state}"><div class="sn">${LG.roundName(ri, L.R)}</div><div class="sv num">${state === 'win' ? 'Won' : state === 'loss' ? 'Lost' : ''} ${us}-${them}</div><div class="so">vs ${esc(L.teams[opp].label)}</div></div>`;
    }).join('') + '</div>';
  }
  // Milestones: the achievements that are not already a trophy (those are shown in the trophy case)
  function milestonesHtml(L, ach) {
    const A = ((L.awards && L.awards.mine) || []).concat((L.poAwards && L.poAwards.mine) || []).map(x => { const i = x.indexOf(': '); return i > 0 ? x.slice(0, i) : x; });
    const m = ach.filter(x => x[0] !== 'Champion' && !A.includes(x[0]));
    if (!m.length) return '';
    return `<div class="panel" style="margin-top:16px"><div class="eyebrow">Milestones</div><div class="mstones">${m.map(x => `<div class="ms"><b>${x[0]}</b><span>${x[1]}</span></div>`).join('')}</div></div>`;
  }
  // Every playoff game with its final score, grouped by round
  function poGamesHtml(L) {
    const g = L.poGames || []; if (!g.length) return '<p class="note">No playoff games were played.</p>';
    const out = []; let last = -1, n = 0;
    g.forEach(x => {
      if (x.round !== last) { last = x.round; n = 0; out.push(`<div class="pgh">${LG.roundName(x.round, L.R)}</div>`); }
      n++;
      out.push(`<div class="pgr"><span class="res ${x.win ? 'W' : 'L'}">${x.win ? 'W' : 'L'}</span><span class="pgg">Game ${n}</span><span class="pgo">${x.home ? 'vs' : '@'} ${esc(L.teams[x.opp].label)}</span><b class="num">${x.us}&ndash;${x.them}</b></div>`);
    });
    return `<div class="pglist">${out.join('')}</div>`;
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
        ${tile(L.R.po.conf < 2 ? 'League position' : 'Conference seed', '#' + seedOf(L), 'out of ' + (L.R.po.conf < 2 ? L.R.teams : L.R.teams / 2) + ' teams')}
        ${tile('Playoff record', pw + '-' + pl, L.userInPlayoffs ? (L.R.id === 'el' ? 'playoffs and Final Four' : 'best of 7 series') : 'did not qualify')}
      </div>
      <div class="panel" style="margin-top:16px"><div class="eyebrow">Playoff run</div>${pathHtml(L)}</div>
      ${milestonesHtml(L, ach)}
      <div class="panel" style="margin-top:16px"><div class="eyebrow">Playoff games</div>${poGamesHtml(L)}</div>
      <div class="panel" style="margin-top:16px"><div class="eyebrow">Season stats</div>${statsHtml()}</div>
      ${trophyCase(L)}
      ${L.po && L.po.champ != null ? `<div class="panel" style="margin-top:16px"><div class="eyebrow">Playoff awards</div>${poAwardsHtml(L)}</div>` : ''}
      <div class="panel" style="margin-top:16px"><div class="eyebrow">Regular season awards</div>${awardsHtml(L)}</div>
      <div class="panel" style="margin-top:16px;display:flex;gap:14px;align-items:center;flex-wrap:wrap"><button class="btn pri" data-a="newgame">New game</button><button class="btn" data-a="share">Share card</button><button class="btn" data-a="copy">Copy result</button><span class="note" id="saveInfo">${S.acct && S.D && S.D.id ? 'Verifying and saving result...' : 'Playing as guest: this result is not saved. Sign in with Google to keep results and achievements.'}</span></div>`;
  };

  // ---------- GAME ----------
  function stopLive() { if (S.live && S.live.timer) clearTimeout(S.live.timer); if (S.live && S.live.defer) clearTimeout(S.live.defer); if (S.live) { clearInterval(S.live.cint); S.live.cl = null; } }
  function beginGame(G) {
    S.G = G;
    S.live = { timer: null, playing: false, speed: 1, tab: 'rot', sel: null, fed: 0, run: { t: -1, pts: 0 }, alert: '', window: true, winLabel: 'Pre-game', runAlerted: false, foulAlerted: {} };
    S.screen = 'game'; render(); window.scrollTo(0, 0);
  }
  const mySide = () => S.G.userSide;
  const canCoach = () => S.live.window && S.G.coachOpen && !S.G.over;
  SCREENS.game = () => `<div id="alerts"></div><div id="sb" class="sb"></div>
    <div class="gm"><div class="panel"><div class="eyebrow">Court <button class="chip" data-a="ctoggle" style="margin-left:auto">Show / hide</button></div><div class="ctcourt" id="court">${courtSvg()}<div class="ctft" id="ctft"></div></div><div class="eyebrow" style="margin-top:14px">Play by play</div><div class="feed" id="feed"></div><div class="ctrl" id="ctrl"></div></div>
    <div class="panel"><div id="sidetabs"></div><div id="sidebody"></div><div class="ctrl" id="sidectl"></div></div></div>`;
  AFTER.game = () => { S.live.fed = 0; ctInit(); updateGame(true); };

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
    sb.innerHTML = tm(1, '') + `<div class="mid"><div class="qn">${G.over ? 'Final' : (G.q > 4 ? 'Overtime ' + (G.q - 4) : 'Quarter ' + G.q)}</div><div class="clk led num" id="clk">${mmss(Math.max(0, Math.round(shownClock())))}</div><div class="qs">${G.playoff ? 'Playoffs' : 'Regular season'} &middot; away @ home</div></div>` + tm(0, 'r');
    const feed = document.getElementById('feed');
    if (full) feed.innerHTML = '';
    const log = G.log; let h = '';
    const fresh = log.slice(live.fed), base0 = live.fed;
    for (let i = live.fed; i < log.length; i++) h = evHtml(G, log[i]) + h;
    if (h) feed.insertAdjacentHTML('afterbegin', h);
    live.fed = log.length;
    { const cf = Math.max(base0, live.cd || 0); courtFeed(log.slice(cf), cf, full); live.cd = log.length; }
    const spd = [1, 2, 4, 8].map(s => `<button class="chip ${live.speed === s ? 'on' : ''}" data-a="speed" data-v="${s}" title="${s === 1 ? 'Real time' : s + 'x real time'}">${s}x</button>`).join('');
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
        const p = P[i], s = st[i], e = Math.round(en[i]), out = s.pf >= G.R.fo, hurt = !!(G.out && G.out[side][i]);
        return `<div class="pl ${on.includes(i) ? 'on' : ''} ${live.sel === i ? 'pick' : ''} ${out ? 'out' : ''}" data-a="pl" data-i="${i}">
          <div class="a"><span>${esc(p.name)}</span><span class="pill">${esc(p.slot)}</span>${hurt ? '<span class="inj">Injured</span>' : ''}</div><div class="b">${s.pts} pts</div>
          <div class="c"><div class="bar ${e < 35 ? 'low' : e < 60 ? 'mid' : ''}"><i style="width:${e}%"></i></div><span>${Math.round(s.sec / 60)}' &middot; ${s.reb}r ${s.ast}a &middot; ${hurt ? 'out for this game' : `<span class="${s.pf >= 4 ? 'fl' : ''}">${s.pf}pf</span>`}</span></div></div>`;
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


  // ---------- COURT (cosmetic only: drawn from the play-by-play, it never touches the simulation) ----------
  // The engine only records the outcome of each possession, so positions are illustrative: shot spots come from a hash of the event index.
  const CT = { W: 940, H: 500, hx: 888, hy: 250 }, CTNS = 'http://www.w3.org/2000/svg';
  const OFFP = [[590, 250], [690, 110], [690, 390], [800, 165], [835, 330]];
  function ctHash(a, b) { let h = (Math.imul(a + 1, 2654435761) ^ Math.imul(b + 7, 40503) ^ 0x9e3779b9) >>> 0; h ^= h >>> 15; h = Math.imul(h, 2246822519) >>> 0; h ^= h >>> 13; return (h >>> 0) / 4294967296; }
  function svgEl(tag, at, parent) { const e = document.createElementNS(CTNS, tag); for (const k in at) e.setAttribute(k, at[k]); if (parent) parent.appendChild(e); return e; }
  const ctDir = t => (t === mySide() ? 1 : -1);
  const ctReal = (t, x, y) => ctDir(t) === 1 ? [x, y] : [CT.W - x, CT.H - y];
  const ctHoop = t => ctReal(t, CT.hx, CT.hy);
  function courtSvg(plain) {
    const ln = 'fill="none" stroke="#4a5d82" stroke-width="3"';
    const half = (m) => { const X = x => m ? CT.W - x : x, sw = m ? 0 : 1;
      return `<rect x="${m ? CT.W - 190 : 0}" y="170" width="190" height="160" ${ln}/><circle cx="${X(190)}" cy="250" r="60" ${ln}/><path d="M${X(0)} 30H${X(141.5)}A237.5 237.5 0 0 ${sw} ${X(141.5)} 470H${X(0)}" ${ln}/><path d="M${X(52)} 210A40 40 0 0 ${sw} ${X(52)} 290" ${ln}/><path d="M${X(40)} 220V280" stroke="#9fb2d1" stroke-width="5"/><circle cx="${X(52)}" cy="250" r="8" fill="none" stroke="#f97316" stroke-width="4"/>`; };
    return `<svg viewBox="0 0 ${CT.W} ${CT.H}" role="img" aria-label="Court"><rect x="1.5" y="1.5" width="${CT.W - 3}" height="${CT.H - 3}" rx="10" fill="none" stroke="#4a5d82" stroke-width="3"/><path d="M470 0V500" ${ln}/><circle cx="470" cy="250" r="60" ${ln}/>${half(0)}${half(1)}${plain ? '<g id="scMarks"></g>' : '<g id="ctTrail"></g><g id="ctDots"></g><g id="ctBall"><circle r="9" fill="#f59e0b" stroke="#fff" stroke-width="2"/><path d="M-9 0H9M0 -9V9" stroke="#7c3a05" stroke-width="1.4"/></g><g id="ctTxt"></g>'}</svg>`;
  }
  const ctOrd = (G, t) => G.on[t].slice().sort((a, b) => E.POS.indexOf(G.teams[t].players[a].slot) - E.POS.indexOf(G.teams[t].players[b].slot));
  const ctLay = (G, off) => {
    const out = {}, d = 1 - off, A = ctOrd(G, off), D = ctOrd(G, d), h = ctHoop(off);
    A.forEach((i, k) => { const q = OFFP[k] || OFFP[4]; out[off * 100 + i] = ctReal(off, q[0], q[1]); });
    D.forEach((i, k) => { const a = out[off * 100 + (A[k] != null ? A[k] : A[0])] || [470, 250]; out[d * 100 + i] = [a[0] + (h[0] - a[0]) * 0.28, a[1] + (h[1] - a[1]) * 0.28]; });
    return out;
  };
  function ctSpot(t, e, idx) {
    const r1 = ctHash(idx, 1), r2 = ctHash(idx, 2), th = (r1 - 0.5) * 2 * (e.is3 ? 1.25 : 1.4), near = !e.is3 && r2 < 0.38;
    const rad = e.is3 ? 246 : near ? 30 + r2 * 90 : 75 + r2 * 120;
    return ctReal(t, CT.hx - rad * Math.cos(th), Math.max(28, Math.min(472, CT.hy + rad * Math.sin(th))));
  }
  function ctColor(t) {
    const G = S.G;
    if (t === mySide()) return { f: '#fbbf24', t: '#1a1100' };
    const c = clubCols(G.teams[t].tm), hue = c.h;
    return { f: hue > 30 && hue < 64 ? c.d : c.a, t: '#fff' };
  }
  function ctInit() {
    const live = S.live; let on = true; try { on = localStorage.getItem('ps_court') !== '0'; } catch (e) { }
    live.ct = { on, off: mySide(), els: {}, pos: {}, ball: [CT.W / 2, CT.H / 2], basket: ctHoop(mySide()), tm: [] };
    const box = document.getElementById('court'); if (!box) return;
    box.classList.toggle('off', !on);
    const svg = document.getElementById('ctDots'); if (!svg) return;
    ctSync(); ctApply(ctLay(S.G, live.ct.off), 0, null);
  }
  function ctSync() {
    const G = S.G, ct = S.live.ct, layer = document.getElementById('ctDots'); if (!layer) return;
    const want = {};
    for (const t of [0, 1]) for (const i of G.on[t]) want[t * 100 + i] = [t, i];
    for (const k of Object.keys(ct.els)) if (!want[k]) { ct.els[k].remove(); delete ct.els[k]; delete ct.pos[k]; }
    for (const k of Object.keys(want)) {
      if (ct.els[k]) continue;
      const [t, i] = want[k], col = ctColor(t), nm = G.teams[t].players[i].name.split(' ');
      const g = svgEl('g', { class: 'ctd' }, layer);
      svgEl('circle', { r: 25, class: 'ring' }, g); svgEl('circle', { r: 18, fill: col.f, stroke: '#0b1220', 'stroke-width': 3 }, g);
      const tx = svgEl('text', { 'text-anchor': 'middle', dy: '.35em', fill: col.t, 'font-size': 14, 'font-weight': 700 }, g); tx.textContent = (nm[0][0] + (nm[nm.length - 1][0] || '')).toUpperCase();
      g.style.transform = 'translate(470px,-30px)'; ct.els[k] = g; ct.pos[k] = [470, -30];
    }
  }
  function ctApply(pos, ms, actor, ease) {
    const ct = S.live.ct;
    for (const k of Object.keys(pos)) {
      const g = ct.els[k]; if (!g) continue;
      g.style.transition = ms ? 'transform ' + ms + 'ms ' + (ease || 'cubic-bezier(.3,.7,.3,1)') : 'none';
      g.style.transform = 'translate(' + Math.round(pos[k][0]) + 'px,' + Math.round(pos[k][1]) + 'px)'; ct.pos[k] = pos[k];
      g.classList.toggle('act', String(k) === String(actor));
    }
  }
  function ctBall(xy, ms, ease) {
    const ct = S.live.ct, b = document.getElementById('ctBall'); if (!b) return;
    b.style.transition = ms ? 'transform ' + ms + 'ms ' + (ease || 'cubic-bezier(.35,.1,.3,1)') : 'none';
    b.style.transform = 'translate(' + Math.round(xy[0]) + 'px,' + Math.round(xy[1]) + 'px)'; ct.ball = xy;
  }
  function ctPop(txt, xy, cls) {
    const layer = document.getElementById('ctTxt'); if (!layer) return;
    const t = svgEl('text', { x: Math.round(xy[0]), y: Math.round(xy[1] - 30), 'text-anchor': 'middle', class: 'ctpop ' + (cls || '') }, layer); t.textContent = txt;
    setTimeout(() => t.remove(), 1400);
  }
  function ctTrail(a, b) {
    const layer = document.getElementById('ctTrail'); if (!layer) return;
    const l = svgEl('line', { x1: Math.round(a[0]), y1: Math.round(a[1]), x2: Math.round(b[0]), y2: Math.round(b[1]), class: 'cttr' }, layer);
    setTimeout(() => l.remove(), 1200);
  }
  // One list of stages per play: { f: ms at 1x, dots: moves, ball, pop, trail, mark, rim, lin: constant speed, bms: ball pass time }.
  // `D` is the game time (in ms at 1x) the play has to fill, so the players keep moving all possession long and the shot lands at its end.
  function ctPlan(e, idx, D) {
    const G = S.G, ct = S.live.ct, key = (t, i) => t * 100 + i, st = [];
    const off = e.k === 'qend' || e.k === 'sub' ? (e.k === 'qend' ? mySide() : ct.off) : e.k === 'foul' || e.k === 'out' ? 1 - e.t : e.t, lay = ctLay(G, off), h = ctHoop(off);
    const shotK = e.k === 'make' || e.k === 'miss' || e.k === 'block' || e.k === 'tov';
    const changed = ct.off !== off && shotK;
    ct.off = off;
    const dir = ctDir(off), A = ctOrd(G, off), Df = ctOrd(G, 1 - off), lerp = (a, b, f) => [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
    const front = x => dir === 1 ? Math.max(520, Math.min(900, x)) : Math.min(420, Math.max(40, x));
    const handBall = (pos, k) => [pos[key(off, A[k])][0] + 9 * dir, pos[key(off, A[k])][1] + 7];
    // the build-up: bring the ball up, then pass and cut around the defence until it is time to shoot
    let cur = lay, hb = 0;
    function buildUp(R) {
      const from = ct.pos;
      if (changed) {
        const tr = Math.min(4200, Math.max(900, R * 0.4));
        st.push({ f: tr, dots: lay, ball: handBall(lay, 0), lin: true, act: key(off, A[0]) }); R -= tr;
      }
      const nw = Math.floor(R / 1500);
      if (nw < 1) { if (R > 150) st.push({ f: R, dots: cur, ball: handBall(cur, hb), lin: true }); return; }
      let prev = cur;
      for (let w = 0; w < nw; w++) {
        const pos = {}, f = R / nw;
        A.forEach((i, k) => {
          const b = lay[key(off, i)] || [470, 250], cut = (w % 3 === 2 && k === (w + idx) % 5);
          const q = cut ? ctReal(off, CT.hx - 90 - ctHash(idx, 400 + w) * 40, CT.hy + (ctHash(idx, 410 + w) - 0.5) * 120) : [front(b[0] + (ctHash(idx, 200 + w * 13 + k) - 0.5) * 80), Math.max(40, Math.min(460, b[1] + (ctHash(idx, 300 + w * 17 + k) - 0.5) * 100))];
          pos[key(off, i)] = q;
        });
        Df.forEach((i, k) => { const o = prev[key(off, A[k] != null ? A[k] : A[0])] || [470, 250]; pos[key(1 - off, i)] = lerp(o, h, 0.3); });
        const nb = (hb + 1 + Math.floor(ctHash(idx, 500 + w) * 4)) % 5, pass = nb !== hb;
        hb = nb; cur = pos; prev = pos;
        st.push({ f, dots: pos, ball: handBall(pos, hb), lin: true, bms: pass ? 420 : undefined, act: key(off, A[hb]) });
      }
    }
    switch (e.k) {
      case 'make': case 'miss': case 'block': {
        const spot = ctSpot(e.t, e, idx), me = key(e.t, e.p), assist = e.k === 'make' && e.a >= 0 && lay[key(e.t, e.a)];
        const fin = (assist ? 600 : 0) + 700 + (e.k === 'block' ? 500 + 800 : 900 + (e.k === 'make' ? 600 : 800));
        buildUp((D > 0 ? D : fin + (changed ? 1800 : 600)) - fin);
        const mv = Object.assign({}, cur);
        if (mv[me]) mv[me] = spot;
        let dk = null, bd = 1e9; for (const k of Object.keys(mv)) if (Math.floor(k / 100) === 1 - e.t) { const dd = Math.hypot(mv[k][0] - spot[0], mv[k][1] - spot[1]); if (dd < bd) { bd = dd; dk = k; } }
        if (dk) mv[dk] = [spot[0] + (h[0] - spot[0]) * 0.1, spot[1] + (h[1] - spot[1]) * 0.1 - 16];
        if (assist) {
          const ap = cur[key(e.t, e.a)] || lay[key(e.t, e.a)];
          st.push({ f: 600, dots: cur, ball: ap, bms: 450, act: key(e.t, e.a) });
          st.push({ f: 700, dots: mv, ball: spot, bms: 500, act: me, trail: [ap, spot] });
        } else st.push({ f: 700, dots: mv, ball: spot, act: me });
        if (e.k === 'block') {
          const bk = key(1 - e.t, e.b), bp = mv[bk] ? [spot[0] + (h[0] - spot[0]) * 0.12, spot[1]] : spot, away = ctReal(e.t, CT.hx - 340, 250 + (ctHash(idx, 3) - 0.5) * 300);
          if (mv[bk]) mv[bk] = bp;
          st.push({ f: 500, dots: mv, ball: bp, act: bk, pop: ['BLOCK', bp, 'blk'] });
          st.push({ f: 800, dots: mv, ball: away, mark: [spot, false, e.t] });
        } else if (e.k === 'make') {
          st.push({ f: 900, dots: mv, ball: h, act: me, trail: [spot, h] });
          st.push({ f: 600, dots: mv, ball: [h[0], h[1] + 16], act: me, rim: 'swish', mark: [spot, true, e.t], pop: [e.is3 ? '3 PT' : e.and1 ? '+2 AND ONE' : '+2', spot, 'mk'] });
        } else {
          st.push({ f: 900, dots: mv, ball: h, act: me, trail: [spot, h] });
          const rb = [h[0] + (dir > 0 ? -1 : 1) * (40 + ctHash(idx, 4) * 40), h[1] + (ctHash(idx, 5) - 0.5) * 110];
          st.push({ f: 800, dots: mv, ball: rb, act: me, rim: 'clank', mark: [spot, false, e.t] });
        }
        ct.basket = h; break;
      }
      case 'reb': {
        const mv = Object.assign({}, lay), bk = ct.basket || h, k = key(e.t, e.p), px = [bk[0] + (bk[0] > CT.W / 2 ? -1 : 1) * (34 + ctHash(idx, 6) * 30), bk[1] + (ctHash(idx, 7) - 0.5) * 90];
        if (mv[k]) mv[k] = px;
        for (const x of Object.keys(lay)) { if (x === String(k)) continue; const c = ct.pos[x]; if (c) mv[x] = [c[0] + (bk[0] - c[0]) * 0.18, c[1] + (bk[1] - c[1]) * 0.18]; }
        st.push({ f: Math.max(700, D || 1000), dots: mv, ball: px, act: k, pop: [e.off ? 'OFF. REBOUND' : 'REBOUND', px, 'rb'] }); break;
      }
      case 'tov': {
        const me = key(e.t, e.p), stl = e.s >= 0 && lay[key(1 - e.t, e.s)];
        buildUp((D > 0 ? D : 2000) - 900);
        const mv = Object.assign({}, cur), bp = cur[me] || lay[me] || [470, 250];
        if (stl) { const sp = [bp[0] + (h[0] - bp[0]) * -0.06, bp[1] + 12]; mv[key(1 - e.t, e.s)] = sp; st.push({ f: 900, dots: mv, ball: sp, act: key(1 - e.t, e.s), pop: ['STEAL', sp, 'stl'] }); }
        else st.push({ f: 900, dots: mv, ball: [bp[0], bp[1] < 250 ? -10 : 510], act: me, pop: ['TURNOVER', bp, 'stl'] });
        break;
      }
      case 'foul': case 'out': {
        const k = key(e.t, e.p), c = ct.pos[k] || lay[k] || [470, 250]; st.push({ f: 800, dots: lay, ball: lay[key(off, G.on[off][0])] || c, act: k, pop: [e.k === 'out' ? 'FOULED OUT' : 'FOUL', c, 'fl'] }); break;
      }
      case 'sub': st.push({ f: 400, dots: lay, ball: ct.ball, act: null }); break;
      case 'qend': st.push({ f: 900, dots: ctLay(G, mySide()), ball: [CT.W / 2, CT.H / 2], act: null }); break;
      default: break;
    }
    return st;
  }
  function ctNet(kind) { const b = document.getElementById('court'); if (!b) return; b.classList.remove('swish', 'clank'); void b.offsetWidth; b.classList.add(kind); }
  // Free throws: a side view of the shooter, the rim and the net. Each shot lasts 2 s at 1x (the clock is stopped, so this is extra time).
  const FT_MS = 2000, ftMs = () => Math.max(240, Math.round(FT_MS / S.live.speed));
  function ftSvg(col) {
    const xt = [176, 184, 192, 200, 208, 216, 224], xb = [187, 192, 196, 200, 204, 208, 213];
    const net = xt.map((x, k) => `M${x} 128 ${xb[k]} 192`).join('') + [144, 160, 176].map(y => { const f = (y - 128) / 64, a = 24 - 11 * f; return `M${200 - a} ${y}Q200 ${y + 5} ${200 + a} ${y}`; }).join('') + xt.slice(0, -1).map((x, k) => `M${x} 128 ${xb[k + 1]} 192`).join('') + xt.slice(1).map((x, k) => `M${x} 128 ${xb[k]} 192`).join('');
    const ball = `<g transform="translate(200,292)"><g class="ftx"><g class="fty"><g class="ftz"><g class="fts"><circle r="17" fill="url(#ftbl)" stroke="#6d2a05" stroke-width="1.6"/><path d="M-17 0H17M0 -17V17M-12 -12Q0 0 -12 12M12 -12Q0 0 12 12" stroke="#4d1c04" stroke-width="1.4" fill="none"/><ellipse cx="-6" cy="-7" rx="5" ry="3" fill="#fff" opacity=".28" transform="rotate(-30)"/></g></g></g></g></g>`;
    const bokeh = [[40, 40, 14], [90, 150, 9], [330, 60, 16], [360, 160, 10], [20, 230, 12], [380, 250, 14], [70, 270, 8], [320, 210, 9]].map(([x, y, r], k) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${k % 3 ? '#8fb2ff' : '#ffcf7a'}"/>`).join('');
    return `<svg class="ftsc" viewBox="0 0 400 300" role="img" aria-label="Free throw"><defs>
      <linearGradient id="ftbg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#070b16"/><stop offset="1" stop-color="#152036"/></linearGradient>
      <radialGradient id="ftsp" cx=".5" cy=".38" r=".55"><stop offset="0" stop-color="#7ea2e6" stop-opacity=".38"/><stop offset="1" stop-color="#7ea2e6" stop-opacity="0"/></radialGradient>
      <linearGradient id="ftgl" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#d5e6ff" stop-opacity=".34"/><stop offset=".5" stop-color="#9db8e6" stop-opacity=".14"/><stop offset="1" stop-color="#d5e6ff" stop-opacity=".26"/></linearGradient>
      <linearGradient id="ftpo" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#121a2b"/><stop offset=".5" stop-color="#2a3a58"/><stop offset="1" stop-color="#121a2b"/></linearGradient>
      <radialGradient id="ftbl" cx=".35" cy=".3" r=".85"><stop offset="0" stop-color="#ffc472"/><stop offset=".55" stop-color="#e2731c"/><stop offset="1" stop-color="#8f3607"/></radialGradient>
      <filter id="ftblur"><feGaussianBlur stdDeviation="7"/></filter></defs>
      <rect width="400" height="300" fill="url(#ftbg)"/><g filter="url(#ftblur)" opacity=".42">${bokeh}</g><rect width="400" height="300" fill="url(#ftsp)"/>
      <rect x="188" y="128" width="24" height="180" fill="url(#ftpo)"/>
      <rect x="100" y="14" width="200" height="117" rx="6" fill="url(#ftgl)" stroke="#c4d3ee" stroke-width="4"/><path d="M112 22 150 22 112 62Z" fill="#fff" opacity=".1"/><path d="M258 120 288 120 288 90Z" fill="#fff" opacity=".07"/>
      <rect x="168" y="64" width="64" height="50" fill="none" stroke="#f2f6ff" stroke-width="3.5"/>
      <rect x="193" y="116" width="14" height="12" fill="#f97316"/>
      <g class="ftrim"><path d="M176 126A24 6.5 0 0 1 224 126" fill="none" stroke="#b3470d" stroke-width="4.5"/></g>
      <g class="bB">${ball}</g>
      <g class="ftnet"><path d="${net}" stroke="#f3f7ff" stroke-width="1.5" fill="none" opacity=".8"/></g>
      <g class="ftrim ftfront"><path d="M176 126A24 6.5 0 0 0 224 126" fill="none" stroke="#f97316" stroke-width="5" stroke-linecap="round"/><path d="M177 127A23 5.6 0 0 0 223 127" fill="none" stroke="#ffb066" stroke-width="1.4" opacity=".7"/></g><g class="bF">${ball}</g></svg>`;
  }
  function ctFT(e, idx) {
    const box = document.getElementById('ctft'), ct = S.live.ct, G = S.G; if (!box || !e.n) return 0;
    const u = ftMs(), pl = G.teams[e.t].players[e.p], nm = pl ? pl.name : '', col = ctColor(e.t).f;
    const order = Array.from({ length: e.n }, (_, k) => k < e.m);
    for (let k = e.n - 1; k > 0; k--) { const j = Math.floor(ctHash(idx, k + 50) * (k + 1)); const x = order[k]; order[k] = order[j]; order[j] = x; }
    box.className = 'ctft on';
    box.innerHTML = `<div class="ftw"><div class="ftl"></div>${ftSvg(col)}<div class="ftdots">${order.map(() => '<i></i>').join('')}</div><div class="ftbig"></div></div>`;
    const lab = box.querySelector('.ftl'), sc = box.querySelector('.ftsc'), dots = box.querySelectorAll('.ftdots i'), big = box.querySelector('.ftbig'), net = box.querySelector('.ftnet'), rims = box.querySelectorAll('.ftrim');
    sc.style.setProperty('--ftd', Math.round(u * 0.8) + 'ms');
    order.forEach((mk, k) => {
      const kind = mk ? 'make' : (ctHash(idx, k + 70) < 0.5 ? 'miss' : 'miss2');
      ct.tm.push(setTimeout(() => {
        lab.textContent = nm + ' · free throw ' + (k + 1) + ' of ' + e.n;
        sc.setAttribute('class', 'ftsc'); net.setAttribute('class', 'ftnet'); rims.forEach(r => r.setAttribute('class', 'ftrim' + (r.classList.contains('ftfront') ? ' ftfront' : ''))); big.textContent = ''; big.className = 'ftbig'; void sc.getBoundingClientRect();
        sc.setAttribute('class', 'ftsc go ' + kind);
      }, k * u + 60));
      ct.tm.push(setTimeout(() => {
        if (mk) { net.setAttribute('class', 'ftnet swish'); box.classList.add('good'); setTimeout(() => box.classList.remove('good'), 450); } else rims.forEach(r => r.setAttribute('class', 'ftrim shake' + (r.classList.contains('ftfront') ? ' ftfront' : '')));
        dots[k].className = mk ? 'ok' : 'no'; big.textContent = mk ? 'Good' : 'No good'; big.className = 'ftbig ' + (mk ? 'ok' : 'no');
      }, k * u + Math.round(u * 0.62)));
    });
    const total = e.n * u + 420;
    ct.tm.push(setTimeout(() => { box.className = 'ctft'; }, total));
    return total;
  }
  // Draws the new events and returns { total, lead } in ms: how long the animation takes, and when the result (score, feed) should show.
  function courtFeed(evs, base, full, dtMs) {
    const live = S.live, ct = live.ct, none = { total: 0, lead: 0 }; if (!ct || !ct.on || !document.getElementById('ctDots')) return none;
    if (!evs.length) { ctSync(); return none; }
    ct.tm.forEach(clearTimeout); ct.tm = [];
    const ftb = document.getElementById('ctft'); if (ftb) ftb.className = 'ctft';
    ctSync();
    const spd = live.speed || 1, batch = full || evs.length > 4, relevant = ['make', 'miss', 'block', 'reb', 'tov', 'foul', 'out', 'sub', 'qend'], list = [], skip = Math.max(0, evs.length - 70);
    evs.forEach((e, n) => {
      if (n < skip) return;
      if (e.k === 'ft') { list.push({ ft: e, idx: base + n }); return; }
      if (relevant.includes(e.k)) list.push({ e, idx: base + n });
    });
    // the game time of the step is shared out between its plays; shots and turnovers get most of it
    const WT = { make: 1, miss: 1, block: 1, tov: 1, reb: 0.2, foul: 0.08, out: 0.08, sub: 0.03, qend: 0.05 };
    const wsum = list.reduce((a, it) => a + (it.e ? WT[it.e.k] || 0 : 0), 0);
    for (const it of list) if (it.e) it.plan = ctPlan(it.e, it.idx, !batch && dtMs > 0 && wsum > 0 ? dtMs * (WT[it.e.k] || 0) / wsum : 0);
    if (batch) {
      let lastDots = null, lastBall = null;
      for (const it of list) { if (!it.plan) continue; for (const s of it.plan) { if (s.dots) lastDots = s.dots; if (s.ball) lastBall = s.ball; } }
      if (lastDots) ctApply(lastDots, 0, null);
      if (lastBall) ctBall(lastBall, 0);
      return none;
    }
    let at = 0, lead = 0;
    for (const it of list) {
      if (it.ft) { const tt = (() => { const d = ctFT(it.ft, it.idx); return d; })(); at += tt; lead = at; continue; }
      for (const s of it.plan) {
        const ms = Math.max(60, Math.round(s.f / spd)), t0 = Math.round(at);
        ct.tm.push(setTimeout(() => {
          if (!S.live || S.live.ct !== ct) return;
          ctSync(); ctApply(s.dots, ms, s.act, s.lin ? 'linear' : null); ctBall(s.ball, s.bms ? Math.min(ms, Math.round(s.bms / spd)) : ms, s.lin && !s.bms ? 'linear' : null);
          if (s.trail) ctTrail(s.trail[0], s.trail[1]);
          if (s.pop) ctPop(s.pop[0], s.pop[1], s.pop[2]);
          if (s.rim) ctNet(s.rim);
        }, t0));
        at += ms;
        if (s.mark || s.rim || s.pop) lead = at;
      }
    }
    return { total: Math.round(at), lead: list.some(x => x.ft || (x.e && ['make', 'miss', 'block', 'tov', 'reb'].includes(x.e.k))) ? Math.round(lead) : 0 };
  }

  // The game clock runs down second by second while a play is drawn (at 2x, 4x and 8x it runs that much faster).
  function shownClock() {
    const live = S.live, c = live && live.cl; if (!c) return S.G.clock;
    return Math.max(c.to, c.from - (Date.now() - c.t0) / 1000 * c.sp);
  }
  function startClock(from, to, dt) {
    const live = S.live; clearInterval(live.cint);
    live.cl = { from, to: dt > 0 ? from - dt : to, t0: Date.now(), sp: live.speed || 1 };
    live.cint = setInterval(() => {
      if (S.live !== live || S.screen !== 'game') { clearInterval(live.cint); return; }
      const v = shownClock(), el = document.getElementById('clk');
      if (el) el.textContent = mmss(Math.max(0, Math.round(v)));
      if (live.cl && v <= live.cl.to) { clearInterval(live.cint); live.cl = null; }
    }, Math.max(50, Math.round(500 / (live.speed || 1))));
  }

  // live loop
  const delay = () => 900 / (S.live.speed || 1);
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
    for (const i of G.on[side]) { if (G.st[side][i].pf === G.R.fo - 1 && !live.foulAlerted[i]) { live.foulAlerted[i] = 1; live.alert = G.teams[side].players[i].name + ' has ' + (G.R.fo - 1) + ' fouls. Call a timeout to sub him out, or leave it to the auto-subs.'; return true; } }
    return false;
  }
  function stepOnce() { const G = S.G, b = G.log.length; Core.step(S.SE, G); runTrack(G.log.slice(b)); }
  function openWindow(label) { S.live.window = true; S.live.winLabel = label; S.live.sel = null; }
  function loop() {
    const G = S.G, live = S.live;
    if (!live.playing) return;
    const q = G.q, c0 = G.clock, b0 = G.log.length;
    stepOnce(); live.alert = '';
    const dt = G.q === q ? Math.max(0, c0 - G.clock) : Math.max(0, c0);
    if (G.over) { live.playing = false; updateGame(); gameOverModal(); return; }
    if (G.q !== q) { live.playing = false; openWindow('end of ' + (q <= 4 ? 'Q' + q : 'overtime')); updateGame(); return; }
    if (G.mo && G.mo.pending) { live.playing = false; updateGame(); showMoment(); return; }
    if (checkAlerts()) { live.playing = false; updateGame(); return; }
    startClock(c0, G.clock, dt); const info = courtFeed(G.log.slice(b0), b0, false, dt * 1000); live.cd = G.log.length;
    if (info.lead > 0) { clearTimeout(live.defer); live.defer = setTimeout(() => { live.defer = null; if (S.live === live && S.screen === 'game') updateGame(); }, info.lead); } else updateGame();
    live.timer = setTimeout(loop, Math.max(Math.round(dt * 1000 / (live.speed || 1)), info.total + 80));
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
    double: ['Send two defenders at their best scorer.', 'Stops him, but opens a shot for someone else.'],
    hfeed: ['Run the next plays through him.', 'Works best with a real star who is still fresh.'],
    hspread: ['Move the ball and let the defense chase.', 'Works best with a tired or ordinary scorer and good passers.'],
    hrest: ['Stop play and let everyone catch their breath.', 'Costs one timeout. Helps when he is running out of gas.'],
    fsit: ['He goes to the bench for the rest of the quarter.', 'Right for role players, or when he is deep in trouble.'],
    fshort: ['A quick breather, then the staff decides again.', 'A middle road when it is not clear-cut.'],
    fride: ['No restrictions: he stays in unless he fouls out.', 'Right for a real star who is just at the limit.']
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
    const G = S.G, P = G.teams[G.userSide].players, res = done && done.type === 'call' ? done : null;
    const pn = pd.player != null && P[pd.player] ? P[pd.player] : null, fl = pn ? G.st[G.userSide][pd.player].pf : 0;
    const T = pd.kind === 'hot' && pn ? ['Hot hand: ' + pn.name, pn.name + ' has scored ' + pd.pts + ' points in the last few minutes.']
      : pd.kind === 'foul' && pn ? ['Foul trouble: ' + pn.name, pn.name + ' has ' + fl + ' fouls and it is still early. Sit him or ride the risk?'] : MO_TXT[pd.kind];
    const opt = (o, i) => `<button class="mo-opt ${res && res.idx === i ? 'chosen' : ''}" data-a="mochoice" data-i="${i}" ${res || o.off ? 'disabled' : ''}><b>${o.label}</b><span>${MO_HELP[o.id][0]}</span><span class="mo-need">${MO_HELP[o.id][1]}</span>${o.who && o.who.length ? `<em>On your floor: ${o.who.map(i => esc(P[i].name.split(' ').slice(-1)[0])).join(', ')}</em>` : o.off ? '<em>No timeouts left</em>' : ''}</button>`;
    let verdict = '';
    if (res) {
      const b = res.res.b;
      verdict = pd.kind === 'hot' || pd.kind === 'foul' ? (b > 0.03 ? '<div class="mo-verdict win">Good read</div>' : b < -0.03 ? '<div class="mo-verdict lose">Poor read for this player</div>' : '<div class="mo-verdict">Decision made</div>') : pd.kind === 'run' ? '<div class="mo-verdict">Play called</div>' : b > 0.03 ? '<div class="mo-verdict win">Good read: this lineup suits it</div>' : b < -0.03 ? '<div class="mo-verdict lose">Poor fit for this lineup</div>' : '<div class="mo-verdict">Play called</div>';
      verdict += '<p class="note">The next few possessions will show how it works out.</p>';
    }
    return `<div class="mo-head"><span class="mo-ic">${MO_ICON.call}</span><div><h2>${T[0]}</h2><p class="note">${T[1]}</p></div></div>${momentSb()}
      ${res ? '' : '<p class="mo-how">' + (pd.kind === 'foul' ? 'Pick one. The right call depends on how much better he is than your bench and how deep in trouble he is.' : pd.kind === 'hot' ? 'Pick one. It affects the next ten possessions, and the right call depends on how good and how fresh he is.' : 'Pick one play. It affects the next ten possessions, and the best choice depends on who is on your floor right now.') + '</p>'}<div class="mo-opts">${pd.opts.map(opt).join('')}</div>${verdict}
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


  // Share card: a 1080x1350 image drawn on a canvas (team, record, result, starting five, key numbers).
  function shareCanvas() {
    const L = S.L, r = L.rec[0], G = Math.max(1, r.w + r.l), champ = L.phase === 'champion', P = S.user.players;
    const cv = document.createElement('canvas'); cv.width = 1080; cv.height = 1350; const c = cv.getContext('2d');
    const gr = c.createLinearGradient(0, 0, 1080, 1350); gr.addColorStop(0, '#0a1020'); gr.addColorStop(.55, '#101a33'); gr.addColorStop(1, '#1b1230'); c.fillStyle = gr; c.fillRect(0, 0, 1080, 1350);
    const glow = c.createRadialGradient(540, 430, 20, 540, 430, 620); glow.addColorStop(0, champ ? 'rgba(255,190,60,.30)' : 'rgba(95,140,255,.20)'); glow.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = glow; c.fillRect(0, 0, 1080, 1350);
    c.strokeStyle = 'rgba(255,255,255,.04)'; c.lineWidth = 2; for (let i = -1350; i < 1080; i += 54) { c.beginPath(); c.moveTo(i, 0); c.lineTo(i + 1350, 1350); c.stroke(); }
    const F = 'Barlow Condensed, Oswald, Impact, Arial Narrow, sans-serif', B = 'Inter, Segoe UI, Arial, sans-serif';
    const txt = (t, x, y, size, col, w, al, font) => { c.font = (w || 700) + ' ' + size + 'px ' + (font || F); c.fillStyle = col; c.textAlign = al || 'left'; c.fillText(t, x, y); };
    c.fillStyle = '#f59e0b'; c.beginPath(); c.arc(86, 92, 24, 0, 7); c.fill(); c.strokeStyle = '#1a1100'; c.lineWidth = 3; c.beginPath(); c.arc(86, 92, 24, 0, 7); c.moveTo(62, 92); c.lineTo(110, 92); c.moveTo(86, 68); c.lineTo(86, 116); c.stroke();
    txt('PERFECT', 128, 106, 44, '#f59e0b', 800); c.font = '800 44px ' + F; const w1 = c.measureText('PERFECT ').width; txt('SEASON', 128 + w1, 106, 44, '#dbe5fa', 800);
    txt((S.hard ? 'HARD' : 'NORMAL') + ' · ' + eraLabel().toUpperCase(), 996, 104, 26, '#8fa3c7', 600, 'right');
    txt(String(S.teamName || 'My team').toUpperCase(), 540, 250, 54, '#dbe5fa', 700, 'center');
    c.save(); c.shadowColor = champ ? 'rgba(255,190,60,.6)' : 'rgba(95,140,255,.45)'; c.shadowBlur = 50;
    txt(r.w + '–' + r.l, 540, 500, 270, champ ? '#ffc94a' : '#ffffff', 800, 'center'); c.restore();
    const rl = (champ ? 'League champions' : resultLabel(L)).replace(/<[^>]+>/g, ''); 
    c.fillStyle = champ ? '#f59e0b' : 'rgba(255,255,255,.10)'; const tw = Math.min(900, c.measureText(rl).width + 10); c.font = '800 44px ' + F; const bw = Math.min(940, c.measureText(rl.toUpperCase()).width + 80); c.beginPath(); c.roundRect ? c.roundRect(540 - bw / 2, 545, bw, 76, 38) : c.rect(540 - bw / 2, 545, bw, 76); c.fill();
    txt(rl.toUpperCase(), 540, 598, 44, champ ? '#1a1100' : '#dbe5fa', 800, 'center');
    const margin = (r.pf - r.pa) / G, pw = (L.poGames || []).filter(g => g.win).length, pl = (L.poGames || []).filter(g => !g.win).length;
    const kp = [['SCORE', Core.calcScore(L, S.hard)], ['WIN STREAK', L.longestW], ['MARGIN', (margin > 0 ? '+' : '') + margin.toFixed(1)], ['PLAYOFFS', pw + '-' + pl]];
    kp.forEach((k, i) => { const x = 90 + i * 240; c.fillStyle = 'rgba(255,255,255,.05)'; c.fillRect(x, 670, 220, 128); c.fillStyle = '#f59e0b'; c.fillRect(x, 670, 5, 128); txt(String(k[1]), x + 24, 745, 58, '#fff', 800); txt(k[0], x + 24, 782, 22, '#8fa3c7', 600); });
    txt('STARTING FIVE', 90, 876, 28, '#f59e0b', 700);
    const five = (S.plan && S.plan.starters ? S.plan.starters.map(i => P[i]) : P.slice(0, 5)).filter(Boolean);
    five.forEach((p, i) => { const y = 930 + i * 66; c.fillStyle = i % 2 ? 'rgba(255,255,255,.02)' : 'rgba(255,255,255,.05)'; c.fillRect(90, y - 40, 900, 58); txt(p.slot || '', 112, y, 30, '#f59e0b', 700); txt(p.name, 200, y, 34, '#fff', 600, 'left', B); txt(p.fromSeason + ' ' + p.fromTm, 970, y, 28, '#8fa3c7', 600, 'right'); });
    txt('Draft 10 players. Coach every possession. Go perfect.', 540, 1296, 28, '#8fa3c7', 500, 'center', B);
    return cv;
  }
  // Shot chart of the finished game: every shot at the spot it was taken, both teams' players on the sides, a click on a player filters his shots.
  function shotChart(G) {
    const me = mySide(), shots = [];
    G.log.forEach((e, idx) => { if (e && (e.k === 'make' || e.k === 'miss' || e.k === 'block')) shots.push({ t: e.t, p: e.p, made: e.k === 'make', is3: !!e.is3, xy: ctSpot(e.t, e, idx) }); });
    const col = t => ctColor(t).f;
    const side = t => {
      const P = G.teams[t].players, st = G.st[t];
      const rows = P.map((p, i) => ({ p, i, s: st[i] })).filter(r => r.s.sec > 0 || r.s.fga > 0).sort((a, b) => b.s.pts - a.s.pts);
      return `<div class="shcs"><div class="shct" style="--c:${col(t)}"><i></i>${t === me ? esc(S.teamName) : esc(G.teams[t].label)}</div>` +
        rows.map(r => `<button class="shcr" data-a="scp" data-v="${t}:${r.i}" style="--c:${col(t)}"><b>${esc(r.p.name)}</b><span class="num">${r.s.pts} pts</span><em class="num">${r.s.fgm}/${r.s.fga}${r.s.tpa ? ' &middot; 3P ' + r.s.tpm + '/' + r.s.tpa : ''}</em></button>`).join('') + '</div>';
    };
    const marks = shots.map(x => {
      const c = col(x.t), px = Math.round(x.xy[0]), py = Math.round(x.xy[1]);
      return `<g class="mk ${x.made ? 'mkm' : 'mkx'}" data-k="${x.t}:${x.p}">` + (x.made ? `<circle cx="${px}" cy="${py}" r="7.5" fill="${c}" stroke="#fff" stroke-width="1.6"/>` : `<path d="M${px - 6} ${py - 6}l12 12m0 -12l-12 12" stroke="${c}" stroke-width="3" fill="none" stroke-linecap="round"/>`) + '</g>';
    }).join('');
    const sum = t => { const a = shots.filter(x => x.t === t), m = a.filter(x => x.made).length; return `${m}/${a.length}`; };
    return `<div class="shc" id="shotchart"><div class="shcl">${side(1 - me)}</div><div class="shcc"><div class="shcc-h"><span>${esc(G.teams[1 - me].label)} <b class="num">${sum(1 - me)}</b></span><span class="note">Click a player to see his shots</span><span>${esc(S.teamName)} <b class="num">${sum(me)}</b></span></div><div class="shcv">${courtSvg(true).replace('<g id="scMarks"></g>', `<g id="scMarks">${marks}</g>`)}</div><div class="shclg"><span><svg width="14" height="14"><circle cx="7" cy="7" r="5.5" fill="#9fb2d1" stroke="#fff" stroke-width="1.4"/></svg> Made</span><span><svg width="14" height="14"><path d="M2 2l10 10m0 -10l-10 10" stroke="#9fb2d1" stroke-width="2.4"/></svg> Missed</span></div></div><div class="shcr-side">${side(me)}</div></div>`;
  }
  function gameOverModal() {
    const G = S.G, side = mySide(), us = G.score[side], them = G.score[1 - side], win = us > them;
    const P = G.teams[side].players, st = G.st[side];
    const top = st.map((s, i) => [i, s]).sort((a, b) => b[1].pts - a[1].pts).slice(0, 3);
    document.body.insertAdjacentHTML('beforeend', `<div class="modal"><div class="box gov"><div class="govh ${win ? 'w' : 'l'}"><div><div class="govr">${win ? 'Win' : 'Loss'}${G.ot ? ' (OT)' : ''}</div><p class="note">${G.playoff ? 'Playoffs' : 'Regular season'} vs ${esc(G.teams[1 - side].label)}</p></div><div class="govs num"><b>${us}</b><i>-</i><b>${them}</b></div></div>
      <div class="govt">${top.map(([i, s]) => `<div class="ach"><div><b>${esc(P[i].name)}</b><div class="note">${s.pts} pts, ${s.reb} reb, ${s.ast} ast</div></div></div>`).join('')}</div>
      <div class="eyebrow" style="margin:16px 0 8px">Shot chart</div>${shotChart(G)}
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
  const FACTS_EL = [
    'The EuroLeague Final Four has decided the champion since 1988.',
    'Real Madrid holds the record for the most European club titles.',
    'EuroLeague games last 40 minutes, four quarters of ten.',
    'The EuroLeague three-point line sits 6.75 metres from the basket.',
    'Under FIBA rules a player fouls out on his fifth personal foul.',
    'The current format has 20 clubs and a 38-game regular season.',
    'Each club gets five team fouls per quarter before the opponent shoots bonus free throws.',
    'The game was called the European Champions Cup before it became the EuroLeague.',
    'A single bad quarter matters more in a 38-game season than in an 82-game one.'
  ];
  const simFact = { base: 0, t0: 0 };
  function simPanel(L) {
    const g = L.userGames, n = g.length, r = L.rec[0], last = g.slice(-12), lg = g[n - 1];
    const pips = last.map(x => `<i class="pip ${x.win ? 'w' : 'l'}">${x.win ? 'W' : 'L'}</i>`).join('');
    const FL = S.comp === 'el' ? FACTS_EL : FACTS, fact = FL[(simFact.base + Math.floor((performance.now() - simFact.t0) / 6500)) % FL.length], opp = lg && L.teams[lg.opp];
    return `<div class="simp"><div class="simp-top"><span class="eyebrow">Simulating the season</span><span class="simp-n num">Game ${n} of ${L.R.games}</span></div>
      <div class="simp-rec led num">${r.w}<small>&ndash;</small>${r.l}</div>
      <div class="simp-bar"><div style="width:${Math.round(n / L.R.games * 100)}%"></div></div>
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
      <p><b>Season.</b> ${RL().games} games against ${RL().teams - 1} strong historical rosters from the same era${S.comp === 'el' ? ' (EuroLeague rules: 40-minute games, five fouls to foul out, one table of 20 clubs)' : ''}. You coach games possession by possession. Play pauses at the end of each quarter and when the opponent goes on a run or your player picks up a fifth foul.</p>
      <p><b>Coaching.</b> Starting five, target minutes, tempo, offense and defense. During a game you can change things at quarter breaks and during timeouts: substitutions, tactics, feeding the ball to a player, doubling a star. Timeouts also restore energy and stop runs. Players tire and foul out.</p>
      <p><b>Moments.</b> When you coach a game step by step, play pauses a few times: a matchup duel in each half, and a coach's call in a close finish, in overtime, after a long scoring drought or when the opponent goes on a big run. A player on a hot streak or in early foul trouble also gets a decision: feed him or spread the ball, sit him or ride the risk. The right read is worth about a point a moment, a guess is worth nothing, and skipping costs nothing. Quick sims have no moments.</p>
      <p><b>Injuries.</b> Now and then one of your players is hurt for one to three games, never more than one at a time. He sits out in quick sims and coached games alike, and the rotation covers for him.</p>
      <p><b>Trades.</b> Until game 55 you can make up to two trades from the hub: choose a player to give up and pick one of three offers of similar quality from your era. The new player takes the old one's minutes and spot. A trade cannot be undone.</p>
      <p><b>Playoffs.</b> ${S.comp === 'el' ? 'The top eight of the table play best-of-five quarterfinals, then the Final Four: two single-game semifinals and the final on neutral ground.' : 'Top eight in each conference, best-of-seven series up to the Finals.'}</p>
      <p><b>Saving.</b> Results and achievements are saved only when you are signed in with Google. Guests play normally, but nothing is saved. We store your first name and last initial, your Google account ID and your finished seasons, nothing else. <button class="btn sm" data-a="delacct">Delete my account and data</button></p>
      <div class="ctrl"><button class="btn pri" data-a="closemodal">Close</button></div></div></div>`);
    },
    closemodal() { closeModal(); },
    preset(d) { S.from = +d.f; S.to = +d.t; setPool(); updateRangeUI(); const a = document.getElementById('rf'), b = document.getElementById('rt'); if (a) { a.value = S.from; b.value = S.to; } },
    async comp(d) {
      if (S.comp === d.v || S.starting) return;
      S.comp = d.v; await ensureData();
      S.from = CF().from; S.to = CF().to; setPool(); await loadProfile(); render();
    },
    hard(d) { S.hard = d.v === '1'; document.querySelectorAll('.mode').forEach((m, i) => m.classList.toggle('on', (i === 1) === S.hard)); },
    async start() {
      setPool(); if (S.pool.length < MIN_POOL || S.starting) return;
      newDraft();
      if (S.acct) {                               // signed in: the draft lives on the server so results can be verified
        S.starting = true;
        try {
          const r = await api('/api/draft', { method: 'POST', body: JSON.stringify({ op: 'start', comp: S.comp, hard: S.hard, from: S.from, to: S.to, ver: Core.VERSION }) });
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
      D.mv = null; D.sel = +d.i; const fp = fitPositions(p), main = String(p.elig || p.pos || '').split(',')[0];
      D.selPos = fp.includes(main) ? main : fp[0]; render();
    },
    mvsel(d) { const D = S.D, i = +d.i; if (!D.picks[i] || D.busy) return; D.mv = i; render(); },
    mvcancel() { S.D.mv = null; render(); },
    mvto(d) { const D = S.D; if (D.mv == null) return; const arr = Core.rearrange(D.picks, D.mv, d.v); if (!arr) return; Core.fixPicks(D.picks, arr); D.dirty = true; D.mv = null; render(); },
    mvswap(d) { const D = S.D; if (D.mv == null) return; const arr = Core.rearrange(D.picks, D.mv, E.assign(D.picks)[+d.i], +d.i); if (!arr) return; Core.fixPicks(D.picks, arr); D.dirty = true; D.mv = null; render(); },
    place(d) { const D = S.D; if (D.sel == null) return; if (fitPositions(D.cur.players[D.sel]).includes(d.v)) { D.selPos = d.v; render(); } },
    async confirm() {
      const D = S.D; if (D.sel == null || D.phase !== 'choose' || D.busy) return;
      const i = D.sel, pos = D.selPos || null, np = Core.makePick(D.picks, D.cur, i, pos);
      if (!np) return;
      if (D.busy) return;
      let seed = null;
      if (D.id) {
        D.busy = true;
        try { const r = await api('/api/draft', { method: 'POST', body: JSON.stringify({ op: 'pick', id: D.id, i, pos, ...(D.dirty ? { arr: E.assign(D.picks) } : {}) }) }); if (r.done) seed = r.seed; }
        catch (e) { return draftError(e); }
        D.busy = false;
      }
      D.picks.push(np); D.selPos = null; D.dirty = false; D.mv = null;
      D.round++; D.sel = null; D.cur = null; D.phase = 'idle'; D.reel = null;
      if (D.round >= 10) {
        S.revealed = true; S.seed = D.id ? seed : newSeed();
        S.user = E.userTeam(D.picks, S.teamName); S.plan = E.defaultPlan(S.user, RL());
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
    resetplan() { const k = { t: S.plan.tempo, o: S.plan.off, d: S.plan.def, a: S.plan.auto }; const np = E.defaultPlan(S.user, RL()); np.tempo = k.t; np.off = k.o; np.def = k.d; np.auto = k.a; Object.assign(S.plan, np); refreshCoach(); },
    beginSeason() {
      const nm = document.getElementById('tname'); if (nm && nm.value.trim()) S.teamName = nm.value.trim();
      const SE = Core.createSeason({ picks: S.D.picks, pool: S.pool, seed: S.seed, hard: S.hard, name: S.teamName, comp: S.comp });
      Object.assign(SE.plan, { starters: S.plan.starters.slice(), mins: S.plan.mins.slice(), tempo: S.plan.tempo, off: S.plan.off, def: S.plan.def, auto: S.plan.auto });
      SE.user.name = SE.user.label = S.teamName;
      S.SE = SE; S.L = SE.L; S.user = SE.user; S.plan = SE.plan; S.saved = false; S.lastRun = null; S.verdict = null;
      go('hub');
    },
    gotrade() { S.tr = { give: null }; go('trade'); },
    tback() { S.tr = null; go('hub'); },
    tgive(d) { S.tr = { give: +d.i, pos: null }; render(); },
    tpos(d) { S.tr.pos = d.p; render(); },
    toffer(d) {
      const out = S.user.players[S.tr.give], np = Core.tradeOffers(S.SE, S.tr.give, S.tr.pos)[+d.i], vis = !S.hard || S.revealed;
      if (!np) return;
      document.body.insertAdjacentHTML('beforeend', `<div class="modal"><div class="box"><h2>Confirm trade</h2><p>You give <b>${esc(out.name)}</b>${vis ? ' (' + dp(out) + ')' : ''} and get <b>${esc(np.name)}</b>${vis ? ' (' + dp(np) + ')' : ''}, ${np.fromSeason} ${esc(np.fromTm)}.</p><p class="note">${esc(np.name)} joins at ${esc(S.tr.pos)} and takes over the minutes of ${esc(out.name)} or of whoever shifts. This cannot be undone.</p>
        <div class="ctrl"><button class="btn pri" data-a="tconfirm" data-i="${d.i}">Make the trade</button><button class="btn" data-a="closemodal">Cancel</button></div></div></div>`);
    },
    tconfirm(d) { closeModal(); if (Core.doTrade(S.SE, S.tr.give, +d.i, S.tr.pos)) { S.tr = null; go('hub'); } },
    scp(d) {
      const root = document.getElementById('shotchart'); if (!root) return;
      const was = root.dataset.f === d.v, v = was ? '' : d.v; root.dataset.f = v;
      root.querySelectorAll('.shcr').forEach(b => b.classList.toggle('on', !!v && b.dataset.v === v));
      root.querySelectorAll('.mk').forEach(m => m.classList.toggle('dim', !!v && m.dataset.k !== v));
      root.classList.toggle('filt', !!v);
    },
    ctoggle() { const ct = S.live && S.live.ct; if (!ct) return; ct.on = !ct.on; try { localStorage.setItem('ps_court', ct.on ? '1' : '0'); } catch (e) { } const b = document.getElementById('court'); if (b) b.classList.toggle('off', !ct.on); if (ct.on) { ctSync(); ctApply(ctLay(S.G, ct.off), 0, null); } },
    gocoach() { S.coachBack = S.screen; go('coach'); },
    coachBack() { go(S.coachBack || 'hub'); },
    play() { beginGame(Core.beginLive(S.SE, false)); },
    quick() { Core.quick(S.SE); go('hub'); },
    sim10() { chunkSim(10); },
    simall() { chunkSim(S.L.R.games); },
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
      if (G.st[side][i].pf >= G.R.fo) return;
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
    async share() {
      const f = t => { const el = document.getElementById('saveInfo'); if (el) el.textContent = t; };
      try {
        const cv = shareCanvas(), blob = await new Promise(res => cv.toBlob(res, 'image/png')), file = new File([blob], 'perfect-season.png', { type: 'image/png' });
        if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], text: 'My Perfect Season: ' + S.L.rec[0].w + '-' + S.L.rec[0].l }); return; }
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'perfect-season.png'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); f('Image saved.');
      } catch (e) { if (!e || e.name !== 'AbortError') f('Could not create the image.'); }
    },
    copy() {
      const L = S.L, r = L.rec[0];
      const txt = `Perfect Season: ${r.w}-${r.l}, ${resultLabel(L)} (${S.hard ? 'Hard' : 'Normal'}, ${eraLabel()}). Roster: ${S.user.players.map(p => p.name).join(', ')}.`;
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

  async function ensureData() {
    const c = S.comp;
    if (!S.cache[c]) { const D = await (await fetch(CF().file)).json(); S.cache[c] = Core.mkTeams(D); }
    S.teams = S.cache[c]; S.byId = new Map(S.teams.map(t => [t.id, t]));
  }
  ensureData().then(() => {
    Report.setCore(Core, E);
    setPool(); S.screen = 'menu'; render(); initAccount();
  }).catch(err => { app.innerHTML = '<div class="loading">Could not load data: ' + esc(err.message) + '</div>'; });
  window.__S = S; window.__dp = dp;
})();
