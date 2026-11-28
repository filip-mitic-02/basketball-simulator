import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPair, SignJWT, createLocalJWKSet, exportJWK } from 'jose';
import { verifyGoogleIdToken } from '../lib/google.js';

const AUD = 'client-123.apps.googleusercontent.com';
async function setup() {
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  const jwk = { ...(await exportJWK(publicKey)), kid: 'k1', alg: 'RS256', use: 'sig' };
  return { privateKey, keys: createLocalJWKSet({ keys: [jwk] }) };
}
const mk = (key, o = {}) => new SignJWT({ sub: 's-1', given_name: 'Ana', ...(o.claims || {}) }).setProtectedHeader({ alg: 'RS256', kid: 'k1' })
  .setIssuer(o.iss || 'https://accounts.google.com').setAudience(o.aud || AUD).setIssuedAt().setExpirationTime(o.exp || '1h').sign(key);

test('a Google ID token for our client is accepted', async () => {
  const { privateKey, keys } = await setup();
  const p = await verifyGoogleIdToken(await mk(privateKey), keys, AUD); assert.equal(p.sub, 's-1');
});
test('wrong audience, wrong issuer, expired, unsigned and junk tokens are all refused', async () => {
  const { privateKey, keys } = await setup(), other = await setup();
  for (const t of [await mk(privateKey, { aud: 'someone-else' }), await mk(privateKey, { iss: 'https://evil.example' }), await mk(privateKey, { exp: Math.floor(Date.now() / 1000) - 60 }),
    await mk(other.privateKey), await mk(privateKey, { claims: { sub: 5 } }), 'abc.def.ghi', '', null, 'x'.repeat(5000)])
    await assert.rejects(verifyGoogleIdToken(t, keys, AUD));
});
