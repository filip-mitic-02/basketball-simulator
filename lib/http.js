import { baseUrl, isSecure } from './env.js';

export function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}
export function redirect(res, url) {
  res.statusCode = 302;
  res.setHeader('Location', url);
  res.setHeader('Cache-Control', 'no-store');
  res.end();
}
export function parseCookies(req) {
  const out = {};
  for (const part of String(req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}
// "__Host-" cookies must be Secure, Path=/, and have no Domain. On plain-http localhost we fall back to a normal name.
export function cookieName(base) {
  return isSecure() ? '__Host-' + base : base;
}
export function setCookie(res, name, value, maxAgeSec) {
  const parts = [`${name}=${encodeURIComponent(value)}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAgeSec}`];
  if (isSecure()) parts.push('Secure');
  const prev = res.getHeader('Set-Cookie');
  const list = prev ? (Array.isArray(prev) ? prev : [prev]) : [];
  list.push(parts.join('; '));
  res.setHeader('Set-Cookie', list);
}
export function clearCookie(res, name) { setCookie(res, name, '', 0); }

// State-changing requests must come from our own origin, carry our custom header and be JSON (or empty).
export function assertSameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin || origin !== baseUrl()) return false;
  if (req.headers['x-requested-with'] !== '82-0-coach') return false;
  const site = req.headers['sec-fetch-site'];
  if (site && site !== 'same-origin') return false;
  return true;
}
export async function readJson(req, maxBytes = 8192) {
  if (req.body && typeof req.body === 'object') {
    if (JSON.stringify(req.body).length > maxBytes) throw Object.assign(new Error('too large'), { status: 413 });
    return req.body;
  }
  const chunks = []; let n = 0;
  for await (const c of req) { n += c.length; if (n > maxBytes) throw Object.assign(new Error('too large'), { status: 413 }); chunks.push(c); }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); } catch { throw Object.assign(new Error('bad json'), { status: 400 }); }
}
