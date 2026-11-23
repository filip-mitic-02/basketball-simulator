import test from 'node:test';
import assert from 'node:assert/strict';

process.env.SESSION_SECRET = 'x'.repeat(48);
process.env.BASE_URL = 'https://example.com';
const { signToken, verifyToken, currentUserId } = await import('../lib/session.js');
const { assertSameOrigin, parseCookies } = await import('../lib/http.js');

test('tokens round trip and are bound to their audience', async () => {
  const t = await signToken({ sub: 'u1' }, 60, 'session');
  assert.equal((await verifyToken(t, 'session')).sub, 'u1');
  await assert.rejects(verifyToken(t, 'oauth'));
});
test('tampered or expired tokens are rejected', async () => {
  const t = await signToken({ sub: 'u1' }, 60, 'session');
  await assert.rejects(verifyToken(t.slice(0, -2) + 'AA', 'session'));
  const old = await signToken({ sub: 'u1' }, -10, 'session');
  await assert.rejects(verifyToken(old, 'session'));
});
test('currentUserId ignores garbage cookies', async () => {
  assert.equal(await currentUserId({ headers: { cookie: '__Host-sid=garbage' } }), null);
  assert.equal(await currentUserId({ headers: {} }), null);
  const t = await signToken({ sub: 'abc' }, 60, 'session');
  assert.equal(await currentUserId({ headers: { cookie: `__Host-sid=${encodeURIComponent(t)}` } }), 'abc');
});
test('origin check for state-changing requests', () => {
  const ok = { headers: { origin: 'https://example.com', 'x-requested-with': '82-0-coach', 'sec-fetch-site': 'same-origin' } };
  assert.equal(assertSameOrigin(ok), true);
  assert.equal(assertSameOrigin({ headers: { ...ok.headers, origin: 'https://evil.com' } }), false);
  assert.equal(assertSameOrigin({ headers: { origin: 'https://example.com' } }), false);
  assert.equal(assertSameOrigin({ headers: { ...ok.headers, 'sec-fetch-site': 'cross-site' } }), false);
  assert.equal(assertSameOrigin({ headers: {} }), false);
});
test('cookie parsing', () => {
  assert.deepEqual(parseCookies({ headers: { cookie: 'a=1; b=x%20y' } }), { a: '1', b: 'x y' });
});
