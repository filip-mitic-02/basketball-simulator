import { randomBytes, createHash } from 'node:crypto';
import { env, baseUrl } from '../../lib/env.js';
import { redirect, cookieName, setCookie } from '../../lib/http.js';
import { signToken } from '../../lib/session.js';

const b64u = b => Buffer.from(b).toString('base64url');

export default async function handler(req, res) {
  if (req.method !== 'GET') { res.statusCode = 405; return res.end(); }
  const state = b64u(randomBytes(24)), verifier = b64u(randomBytes(48)), nonce = b64u(randomBytes(16));
  const challenge = b64u(createHash('sha256').update(verifier).digest());
  const t = await signToken({ state, verifier, nonce }, 600, 'oauth');
  setCookie(res, cookieName('oauth'), t, 600);
  const u = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  u.search = new URLSearchParams({
    client_id: env('GOOGLE_CLIENT_ID'),
    redirect_uri: baseUrl() + '/api/auth/callback',
    response_type: 'code',
    scope: 'openid profile',
    state, nonce,
    code_challenge: challenge, code_challenge_method: 'S256',
    prompt: 'select_account'
  }).toString();
  redirect(res, u.toString());
}
