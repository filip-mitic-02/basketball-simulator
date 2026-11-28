import { send, assertSameOrigin } from '../lib/http.js';
import { currentUserId, endSession } from '../lib/session.js';
import { sql } from '../lib/db.js';
import { pgStore } from '../lib/store.js';
import { loadProgress } from '../lib/sim.js';

export default async function handler(req, res) {
  try {
    const id = await currentUserId(req);
    if (req.method === 'GET') {
      if (!id) return send(res, 200, { user: null });
      const r = await sql()`select id, name from users where id = ${id}`;
      if (!r[0]) return send(res, 200, { user: null });
      const pr = await pgStore.getProfile(id), P = loadProgress();
      return send(res, 200, { user: { id: r[0].id, name: r[0].name }, prog: pr && { ...P.stateOf(pr.xp), coins: pr.coins, owned: pr.owned, equipped: pr.equipped } });
    }
    if (req.method === 'DELETE') {   // delete my account and every stored run
      if (!assertSameOrigin(req)) return send(res, 403, { error: 'forbidden' });
      if (!id) return send(res, 401, { error: 'auth' });
      await sql()`delete from users where id = ${id}`;
      endSession(res);
      return send(res, 200, { ok: true });
    }
    send(res, 405, { error: 'method' });
  } catch { send(res, 500, { error: 'server' }); }
}
