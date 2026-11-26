import { send, assertSameOrigin, readJson } from '../lib/http.js';
import { currentUserId } from '../lib/session.js';
import { sql } from '../lib/db.js';
import { pgStore } from '../lib/store.js';
import { ApiError, opSubmit } from '../lib/draftlogic.js';

const shape = r => ({ ts: new Date(r.created_at).getTime(), w: r.wins, l: r.losses, res: r.result, hard: r.hard, eraLabel: r.era_label, score: r.score, champ: r.champion, verified: !!r.verified, comp: r.comp || 'nba' });

export default async function handler(req, res) {
  try {
    const id = await currentUserId(req);
    if (!id) return send(res, 401, { error: 'auth' });
    if (req.method === 'GET') {
      const rows = await sql()`select created_at, comp, wins, losses, result, hard, era_label, score, champion, verified
        from runs where user_id = ${id} order by created_at desc limit 60`;
      return send(res, 200, { runs: rows.map(shape) });
    }
    // POST /api/runs { id: <draft id>, log: [...] }. The body carries decisions only; the server replays the season.
    if (req.method === 'POST') {
      if (!assertSameOrigin(req)) return send(res, 403, { error: 'forbidden' });
      if (!String(req.headers['content-type'] || '').startsWith('application/json')) return send(res, 415, { error: 'type' });
      const b = await readJson(req, 260000);
      const out = await opSubmit(pgStore, id, { id: b && b.id, log: b && b.log }, true);
      return send(res, 201, { run: shape(out.run), summary: out.summary });
    }
    send(res, 405, { error: 'method' });
  } catch (e) {
    if (e instanceof ApiError) return send(res, e.status, { error: e.code, ...(e.code === 'invalid' ? { field: e.detail } : {}) });
    send(res, e && e.status ? e.status : 500, { error: 'server' });
  }
}
