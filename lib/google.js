// Google sign-in helpers shared by the web redirect flow (api/auth/callback.js) and the Android app (api/auth/native.js).
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { env } from './env.js';
import { sql } from './db.js';
import { publicName } from './validate.js';

const REMOTE = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));
const ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];

// Checks signature, issuer, audience (our own client id) and expiry. `keys` is injectable so tests can use a local key set.
export async function verifyGoogleIdToken(idToken, keys = REMOTE, audience = env('GOOGLE_CLIENT_ID')) {
  if (typeof idToken !== 'string' || idToken.length > 4096) throw new Error('token');
  const { payload } = await jwtVerify(idToken, keys, { issuer: ISSUERS, audience });
  if (typeof payload.sub !== 'string') throw new Error('sub');
  return payload;
}
// Creates the account on first sign-in, or refreshes the display name. Only the first name and the family initial are ever stored.
export async function upsertGoogleUser(payload) {
  const name = publicName(payload.given_name || String(payload.name || '').split(' ')[0], payload.family_name);
  const rows = await sql()`insert into users (google_sub, name) values (${payload.sub}, ${name})
    on conflict (google_sub) do update set name = excluded.name returning id`;
  return rows[0].id;
}
