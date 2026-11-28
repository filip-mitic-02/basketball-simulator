import { timingSafeEqual } from 'node:crypto';
import { env, baseUrl } from '../../lib/env.js';
import { redirect, parseCookies, cookieName, clearCookie } from '../../lib/http.js';
import { verifyToken, startSession, currentUserId } from '../../lib/session.js';
import { verifyGoogleIdToken, upsertGoogleUser } from '../../lib/google.js';

const same = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && timingSafeEqual(x, y); };

export default async function handler(req, res) {
  if (req.method !== 'GET') { res.statusCode = 405; return res.end(); }
  // Browsers sometimes fire the callback twice (prefetch, double tap). The second call has no OAuth cookie left; if the first one already
  // signed the user in, that is a success, not a failure.
  const fail = async () => {
    clearCookie(res, cookieName('oauth'));
    let uid = null; try { uid = await currentUserId(req); } catch { }
    redirect(res, baseUrl() + (uid ? '/' : '/?login=failed'));
  };
  try {
    const q = new URL(req.url, baseUrl()).searchParams;
    const code = q.get('code'), state = q.get('state');
    if (!code || !state || code.length > 2048 || state.length > 128) return await fail();
    const raw = parseCookies(req)[cookieName('oauth')];
    if (!raw) return await fail();
    const ck = await verifyToken(raw, 'oauth');
    if (!same(ck.state, state)) return await fail();

    const tr = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code, grant_type: 'authorization_code',
        client_id: env('GOOGLE_CLIENT_ID'), client_secret: env('GOOGLE_CLIENT_SECRET'),
        redirect_uri: baseUrl() + '/api/auth/callback', code_verifier: String(ck.verifier)
      })
    });
    if (!tr.ok) return await fail();
    const tok = await tr.json();
    let payload; try { payload = await verifyGoogleIdToken(tok.id_token); } catch { return await fail(); }
    if (!same(payload.nonce, ck.nonce)) return await fail();
    await startSession(res, await upsertGoogleUser(payload));
    clearCookie(res, cookieName('oauth'));
    redirect(res, baseUrl() + '/');
  } catch {
    await fail();   // never leak internals to the browser
  }
}
