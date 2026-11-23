# Security notes

## What is protected, and how

| Area | Measure |
|---|---|
| Authentication | Google OAuth 2.0 authorization-code flow on the server with PKCE (S256), random `state` and `nonce` held in a signed, short-lived HttpOnly cookie. The ID token signature, issuer, audience, expiry and nonce are verified against Google's JWKS. The client secret never reaches the browser. |
| Sessions | HS256 JWT in an `HttpOnly; Secure; SameSite=Lax` `__Host-sid` cookie (14 days). JavaScript cannot read it. Logout clears it. |
| CSRF | Every state-changing endpoint (POST/DELETE) requires the exact `Origin` of the site, the `X-Requested-With: 82-0-coach` header, a JSON content type, and rejects `Sec-Fetch-Site` values other than same-origin. |
| XSS | `script-src 'self'` (no inline scripts, no `eval`), all dynamic text is HTML-escaped in the UI, stored strings are stripped of control characters and angle brackets on the server. `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'none'`. |
| Transport / headers | HSTS (preload), `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, COOP. API responses are `no-store`. |
| Injection | Neon client with tagged templates: all values are bound parameters. DB constraints (`check`) duplicate the validation. |
| Integrity of scores | The server ignores the client score and recomputes it from the record, playoff wins, title and mode. Records, playoff wins and round labels must be mutually consistent. Max one saved season per 20 seconds and 150 per day per user. |
| Privacy | Stored: Google account ID (`sub`), first name + last initial, finished seasons. No email, no profile picture, no tracking. Leaderboard shows first name + last initial. `DELETE /api/me` removes the account and all runs. |
| Secrets | Only in environment variables. `.env` is git-ignored. CI runs `npm audit`. |

## Known limits (please read)

- **The game simulation runs in the browser.** A determined player can forge a request with an impossible but self-consistent season
  (for example 82-0 and a title). The server checks consistency and rate limits, it cannot prove the season was actually played.
  Fully fixing this means running the simulation on the server and sending only coaching decisions, which is a larger change.
  Until then treat the leaderboard as casual, and delete outliers in SQL if needed:
  `delete from runs where id = ...;`
- Rate limiting for the login endpoints relies on Vercel's platform protections. Turn on Vercel Firewall / Attack Challenge Mode if you see abuse.
- `style-src` still allows `'unsafe-inline'` because the UI uses inline `style=""` attributes. Scripts remain locked down.

## Reporting

Open a private security advisory on the GitHub repository.
