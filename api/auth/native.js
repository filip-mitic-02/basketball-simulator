import { send, assertSameOrigin, readJson } from '../../lib/http.js';
import { env } from '../../lib/env.js';
import { startSession } from '../../lib/session.js';
import { verifyGoogleIdToken, upsertGoogleUser } from '../../lib/google.js';

// Android app sign-in. The app gets a Google ID token natively (a WebView may not use the redirect flow) and sends it here.
//   GET  -> { clientId }   the public web client id the native plugin needs
//   POST { idToken }       verified like any Google token, then the same session cookie as the web flow is set
export default async function handler(req, res) {
  try {
    if (req.method === 'GET') { res.setHeader('Cache-Control', 'public, max-age=3600'); res.statusCode = 200; res.setHeader('Content-Type', 'application/json; charset=utf-8'); return res.end(JSON.stringify({ clientId: env('GOOGLE_CLIENT_ID') })); }
    if (req.method !== 'POST') return send(res, 405, { error: 'method' });
    if (!assertSameOrigin(req)) return send(res, 403, { error: 'forbidden' });
    if (!String(req.headers['content-type'] || '').startsWith('application/json')) return send(res, 415, { error: 'type' });
    const b = await readJson(req, 6000);
    let payload; try { payload = await verifyGoogleIdToken(b && b.idToken); } catch { return send(res, 401, { error: 'token' }); }
    await startSession(res, await upsertGoogleUser(payload));
    send(res, 200, { ok: true });
  } catch { send(res, 500, { error: 'server' }); }
}
