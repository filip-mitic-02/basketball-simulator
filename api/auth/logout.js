import { send, assertSameOrigin } from '../../lib/http.js';
import { endSession } from '../../lib/session.js';
export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'method' });
  if (!assertSameOrigin(req)) return send(res, 403, { error: 'forbidden' });
  endSession(res);
  send(res, 200, { ok: true });
}
