import { send } from '../lib/http.js';
import { sql } from '../lib/db.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return send(res, 405, { error: 'method' });
  try {
    const rows = await sql()`select * from (
        select distinct on (r.user_id) u.name, r.wins, r.losses, r.result, r.hard, r.era_label, r.score
        from runs r join users u on u.id = r.user_id
        order by r.user_id, r.score desc
      ) t order by score desc limit 20`;
    res.setHeader('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=60');
    res.statusCode = 200; res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ board: rows.map(b => ({ name: b.name, w: b.wins, l: b.losses, res: b.result, hard: b.hard, era: b.era_label, score: b.score })) }));
  } catch { send(res, 500, { error: 'server' }); }
}
