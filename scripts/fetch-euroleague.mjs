// Downloads EuroLeague regular-season player totals, one season at a time, from the public API that euroleaguebasketball.net itself uses.
//
//   node scripts/fetch-euroleague.mjs                 # seasons 2000..current, writes data/euroleague/
//   node scripts/fetch-euroleague.mjs 2022 2024       # only these start years
//   node scripts/fetch-euroleague.mjs --probe 2023    # print the field names of one season and stop
//   node scripts/fetch-euroleague.mjs --probe 2010 TS # same, for another phase (older seasons: the Top 16 stage)
//
// Output (all in data/euroleague/):
//   raw/E<year>.json     the unmodified API answer per season (send these to Claude if the mapping below needs fixing)
//   players.csv          one row per player-season-team, same columns as the NBA csv the game was built from
//   report.txt           seasons found, player counts, fields that could not be mapped
//
// Needs Node 18+. Be polite: one request at a time with a pause, results are cached in raw/ and not downloaded twice.
// The data belongs to Euroleague Basketball; this is for building the game's own rating tables, not for redistributing the raw files.
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';

const BASE = process.env.EL_BASE || 'https://api-live.euroleague.net';
const OUT = 'data/euroleague';
const args = process.argv.slice(2), probe = args[0] === '--probe';
const nums = args.filter(a => /^\d{4}$/.test(a)).map(Number);
const thisYear = new Date().getFullYear();
const from = nums.length ? nums[0] : 2000, to = nums.length > 1 ? nums[1] : nums.length ? nums[0] : thisYear;
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function get(url, tries = 4) {
  for (let k = 0; k < tries; k++) {
    try {
      const r = await fetch(url, { headers: { accept: 'application/json', 'user-agent': 'coach-82-0 data build (personal project)' } });
      if (r.status === 429 || r.status >= 500) { await sleep(2000 * (k + 1)); continue; }
      if (!r.ok) return { status: r.status, body: null };
      return { status: r.status, body: await r.json() };
    } catch (e) { await sleep(1500 * (k + 1)); }
  }
  return { status: 0, body: null };
}

// ---- tolerant field lookup: the API camelCases its keys, but I do not trust the exact spelling ----
const flat = (o, pre = '', acc = {}) => { for (const [k, v] of Object.entries(o || {})) { if (v && typeof v === 'object' && !Array.isArray(v)) flat(v, pre + k + '.', acc); else acc[pre + k] = v; } return acc; };
const norm = s => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const WANT = {
  G: ['gamesplayed', 'games'], MP: ['minutesplayed', 'minutes'], PTS: ['points', 'pointsscored'],
  FG2: ['twopointersmade', 'twopointsmade', 'fieldgoals2made'], FG2A: ['twopointersattempted', 'twopointsattempted', 'fieldgoals2attempted'],
  FG3: ['threepointersmade', 'threepointsmade', 'fieldgoals3made'], FG3A: ['threepointersattempted', 'threepointsattempted', 'fieldgoals3attempted'],
  FT: ['freethrowsmade'], FTA: ['freethrowsattempted'],
  ORB: ['offensiverebounds'], DRB: ['defensiverebounds'], TRB: ['totalrebounds', 'rebounds'],
  AST: ['assists', 'assistances'], STL: ['steals'], BLK: ['blocks', 'blocksfavour', 'blocksfavor'], TOV: ['turnovers'],
  PF: ['foulscommited', 'foulscommitted', 'fouls', 'personalfouls']
};
function mapRow(row, miss) {
  const f = flat(row), by = {};
  for (const [k, v] of Object.entries(f)) by[norm(k.split('.').pop())] = v;
  const out = {};
  for (const [col, names] of Object.entries(WANT)) {
    const hit = names.find(n => by[n] != null && by[n] !== '');
    if (hit) out[col] = Number(by[hit]); else { out[col] = ''; miss[col] = (miss[col] || 0) + 1; }
  }
  const pl = row.player || row;
  out.Player = String(pl.name || pl.person?.name || by.name || '').trim();
  out.Code = pl.code || pl.person?.code || by.code || '';
  out.Age = pl.age ?? '';
  const tm = pl.team || row.team || {};
  out.Tm = tm.code || tm.abbreviatedName || '';
  out.TmName = tm.name || '';
  return out;
}
const rowsOf = b => (Array.isArray(b) ? b : b?.players || b?.data || []);

async function season(y, ph = 'RS') {
  const file = ph === 'RS' ? `${OUT}/raw/E${y}.json` : `${OUT}/raw/E${y}-${ph}.json`;
  if (existsSync(file)) return JSON.parse(readFileSync(file, 'utf8'));
  const url = `${BASE}/v3/competitions/E/statistics/players/traditional?SeasonMode=Single&SeasonCode=E${y}&statisticMode=Accumulated&phaseTypeCode=${ph}&limit=500`;
  const r = await get(url);
  if (!r.body) return { status: r.status, players: [] };
  if (r.body.total > rowsOf(r.body).length) { const r2 = await get(url.replace('limit=500', `limit=${r.body.total + 1}`)); if (r2.body) r.body = r2.body; }
  mkdirSync(`${OUT}/raw`, { recursive: true });
  writeFileSync(file, JSON.stringify(r.body));
  await sleep(700);
  return r.body;
}

mkdirSync(`${OUT}/raw`, { recursive: true });
if (probe) {
  const b = await season(from, args[2] || 'RS'), rows = rowsOf(b);
  console.log('rows:', rows.length, 'total:', b.total);
  console.log('first row:', JSON.stringify(rows[0], null, 1));
  console.log('mapped:', rows[0] ? mapRow(rows[0], {}) : null);
  process.exit(0);
}

const lines = ['Player,Code,Age,Tm,TmName,Season,G,MP,PTS,2P,2PA,3P,3PA,FT,FTA,ORB,DRB,TRB,AST,STL,BLK,TOV,PF'];
const rep = []; const miss = {};
// Before 2016-17 the league played a first group stage (10 to 14 games) and then a Top 16 stage. The default phase RS holds only the first one,
// so for those seasons the other stages are fetched as well (codes that do not exist are skipped) and added up per player and club.
const EXTRA = (process.env.EL_PHASES || 'TS,T16,LS').split(',').filter(Boolean), SUM = ['G', 'MP', 'PTS', 'FG2', 'FG2A', 'FG3', 'FG3A', 'FT', 'FTA', 'ORB', 'DRB', 'TRB', 'AST', 'STL', 'BLK', 'TOV', 'PF'];
for (let y = from; y <= to; y++) {
  const b = await season(y), rows = rowsOf(b);
  if (!rows.length) { rep.push(`${y}: no data (status ${b.status ?? 'n/a'})`); continue; }
  let n = 0; const merged = new Map(), got = ['RS:' + rows.length];
  const add = row => {
    const o = mapRow(row, miss); if (!o.Player || !(o.G > 0)) return;
    const k = (o.Code || o.Player) + '|' + o.Tm, m = merged.get(k);
    if (!m) merged.set(k, o); else for (const c of SUM) m[c] = (Number(m[c]) || 0) + (Number(o[c]) || 0);
  };
  rows.forEach(add);
  if (y < 2016) for (const ph of EXTRA) { const e = await season(y, ph), er = rowsOf(e); if (er.length) { got.push(ph + ':' + er.length); er.forEach(add); } }
  for (const o of merged.values()) {
    // the API reports minutes as decimal minutes in per-game mode and as totals in accumulated mode; keep totals
    lines.push([JSON.stringify(o.Player), o.Code, o.Age, o.Tm, JSON.stringify(o.TmName), y, o.G, o.MP, o.PTS, o.FG2, o.FG2A, o.FG3, o.FG3A, o.FT, o.FTA, o.ORB, o.DRB, o.TRB, o.AST, o.STL, o.BLK, o.TOV, o.PF].join(','));
    n++;
  }
  rep.push(`${y}: ${n} player rows (${got.join(', ')})`);
  console.log(rep.at(-1));
}
writeFileSync(`${OUT}/players.csv`, lines.join('\n') + '\n');
rep.push('', 'fields that were missing (count of rows): ' + (Object.keys(miss).length ? JSON.stringify(miss) : 'none'));
writeFileSync(`${OUT}/report.txt`, rep.join('\n') + '\n');
console.log('\n' + rep.join('\n'));
