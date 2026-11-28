import { send, assertSameOrigin, readJson } from '../lib/http.js';
import { currentUserId } from '../lib/session.js';
import { pgStore } from '../lib/store.js';
import { ApiError } from '../lib/draftlogic.js';
import { opShop } from '../lib/shoplogic.js';

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return send(res, 405, { error: 'method' });
    const id = await currentUserId(req);
    if (!id) return send(res, 401, { error: 'auth' });
    if (!assertSameOrigin(req)) return send(res, 403, { error: 'forbidden' });
    if (!String(req.headers['content-type'] || '').startsWith('application/json')) return send(res, 415, { error: 'type' });
    const b = await readJson(req, 2000);
    return send(res, 200, await opShop(pgStore, id, b));
  } catch (e) {
    if (e instanceof ApiError) return send(res, e.status, { error: e.code });
    send(res, 500, { error: 'server' });
  }
}
