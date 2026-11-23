import { send, assertSameOrigin, readJson } from '../lib/http.js';
import { currentUserId } from '../lib/session.js';
import { sql } from '../lib/db.js';
import { validateRun } from '../lib/validate.js';

const shape = r => ({ ts: new Date(r.created_at).getTime(), w: r.wins, l: r.losses, res: r.result, hard: r.hard, eraLabel: r.era_label, score: r.score, champ: r.champion });

export default async function handler(req, res) {
  try {
    const id = await currentUserId(req);
    if (!id) return send(res, 401, { error: 'auth' });
    const db = sql();
    if (req.method === 'GET') {
      const rows = await db`select created_at, wins, losses, result, hard, era_label, score, champion
        from runs where user_id = ${id} order by created_at desc limit 60`;
      return send(res, 200, { runs: rows.map(shape) });
    }
    if (req.method === 'POST') {
      if (!assertSameOrigin(req)) return send(res, 403, { error: 'forbidden' });
      const ctype = String(req.headers['content-type'] || '');
      if (!ctype.startsWith('application/json')) return send(res, 415, { error: 'type' });
      const v = validateRun(await readJson(req));
      if (!v.ok) return send(res, 400, { error: 'invalid', field: v.error });
      const lim = await db`select
          count(*) filter (where created_at > now() - interval '20 seconds') as recent,
          count(*) filter (where created_at > now() - interval '1 day') as day
        from runs where user_id = ${id}`;
      if (Number(lim[0].recent) > 0 || Number(lim[0].day) >= 150) return send(res, 429, { error: 'rate' });
      const r = v.run;
      const ins = await db`insert into runs (user_id, wins, losses, po_wins, champion, result, hard, era_from, era_to, era_label, score, roster, achievements)
        values (${id}, ${r.wins}, ${r.losses}, ${r.poWins}, ${r.champion}, ${r.result}, ${r.hard}, ${r.eraFrom}, ${r.eraTo}, ${r.eraLabel}, ${r.score},
                ${JSON.stringify(r.roster)}::jsonb, ${JSON.stringify(r.achievements)}::jsonb)
        returning created_at, wins, losses, result, hard, era_label, score, champion`;
      return send(res, 201, { run: shape(ins[0]) });
    }
    send(res, 405, { error: 'method' });
  } catch (e) {
    send(res, e && e.status ? e.status : 500, { error: 'server' });
  }
}
