import { SignJWT, jwtVerify } from 'jose';
import { env } from './env.js';
import { cookieName, parseCookies, setCookie, clearCookie } from './http.js';

const SESSION_DAYS = 14;
const key = () => {
  const s = env('SESSION_SECRET');
  if (s.length < 32) throw new Error('SESSION_SECRET must be at least 32 characters');
  return new TextEncoder().encode(s);
};
export async function signToken(payload, ttlSec, aud) {
  return new SignJWT(payload).setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setAudience(aud).setExpirationTime(`${ttlSec}s`).sign(key());
}
export async function verifyToken(token, aud) {
  const { payload } = await jwtVerify(token, key(), { algorithms: ['HS256'], audience: aud });
  return payload;
}
export async function startSession(res, userId) {
  const t = await signToken({ sub: userId }, SESSION_DAYS * 86400, 'session');
  setCookie(res, cookieName('sid'), t, SESSION_DAYS * 86400);
}
export function endSession(res) { clearCookie(res, cookieName('sid')); }
export async function currentUserId(req) {
  const t = parseCookies(req)[cookieName('sid')];
  if (!t) return null;
  try { const p = await verifyToken(t, 'session'); return typeof p.sub === 'string' ? p.sub : null; } catch { return null; }
}
