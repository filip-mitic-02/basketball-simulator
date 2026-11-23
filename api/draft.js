import { send, assertSameOrigin, readJson } from '../lib/http.js';
import { currentUserId } from '../lib/session.js';
import { pgStore } from '../lib/store.js';
import { ApiError, opStart, opSpin, opPick, opState } from '../lib/draftlogic.js';

// POST /api/draft  { op: 'start' | 'spin' | 'respin' | 'pick' | 'state', ... }
export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return send(res, 405, { error: 'method' });
    const userId = await currentUserId(req);
    if (!userId) return send(res, 401, { error: 'auth' });
    if (!assertSameOrigin(req)) return send(res, 403, { error: 'forbidden' });
    if (!String(req.headers['content-type'] || '').startsWith('application/json')) return send(res, 415, { error: 'type' });
    const b = await readJson(req);
    let out;
    switch (b && b.op) {
      case 'start': out = await opStart(pgStore, userId, b); break;
      case 'spin': out = await opSpin(pgStore, userId, b, false); break;
      case 'respin': out = await opSpin(pgStore, userId, b, true); break;
      case 'pick': out = await opPick(pgStore, userId, b); break;
      case 'state': out = await opState(pgStore, userId, b); break;
      default: throw new ApiError(400, 'op');
    }
    send(res, 200, out);
  } catch (e) {
    if (e instanceof ApiError) return send(res, e.status, { error: e.code });
    send(res, e && e.status ? e.status : 500, { error: 'server' });
  }
}
