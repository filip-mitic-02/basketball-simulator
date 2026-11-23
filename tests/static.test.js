import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const cfg = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url)));
const hdr = Object.fromEntries(cfg.headers[0].headers.map(h => [h.key, h.value]));

test('security headers are configured', () => {
  for (const k of ['Content-Security-Policy', 'Strict-Transport-Security', 'X-Content-Type-Options', 'Referrer-Policy', 'X-Frame-Options']) assert.ok(hdr[k], k);
  assert.match(hdr['Content-Security-Policy'], /script-src 'self'(;|$)/);
  assert.match(hdr['Content-Security-Policy'], /frame-ancestors 'none'/);
  assert.ok(!/unsafe-eval/.test(hdr['Content-Security-Policy']));
});
test('no inline scripts or event handlers in the page (CSP forbids them)', () => {
  const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  assert.ok(!/<script(?![^>]*\bsrc=)[^>]*>/i.test(html));
  assert.ok(!/\son(click|load|error)=/i.test(html));
});
test('no secrets are committed', () => {
  assert.ok(!existsSync(new URL('../.env', import.meta.url)));
  for (const f of ['public/app.js', 'public/index.html', 'lib/env.js']) {
    const t = readFileSync(new URL('../' + f, import.meta.url), 'utf8');
    assert.ok(!/GOCSPX-|client_secret\s*[:=]\s*['"][^'"]+/i.test(t), f);
  }
});
