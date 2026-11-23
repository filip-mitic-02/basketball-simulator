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
| Integrity of scores | The leaderboard only contains runs the server verified by replaying the whole season. Signed-in players draft through `/api/draft`: the server rolls every team with an HMAC keyed by a per-draft secret the browser never sees, validates every pick, and only then issues the season seed. When the season ends the browser sends only its decisions (lineups, timeouts, tactics, which games were quick-simmed), never a result. The server replays them with the same simulation code (`public/engine.js`, `league.js`, `core.js`), rejects any log that breaks the rules (coaching outside a window, impossible lineups, unfinished season, runaway input) and derives the record, title, score and achievements itself. One run per draft (unique `draft_id`), at most three rejected submissions per draft, one draft started per request cycle with a per-hour cap, one saved season per 20 seconds and 150 per day per user. Every run stores its simulation version and log. |
| Privacy | Stored: Google account ID (`sub`), first name + last initial, finished seasons. No email, no profile picture, no tracking. Leaderboard shows first name + last initial. `DELETE /api/me` removes the account and all runs. |
| Secrets | Only in environment variables. `.env` is git-ignored. CI runs `npm audit`. |

## Known limits (please read)

- **The season seed is known to the player.** The server hands it out after the draft so the browser can play the season. A player
  who reads it can simulate the season offline many times and look for lineup and timing decisions that win, then submit exactly
  those decisions. The server will accept them because they are a legal, honestly replayable season. This is "perfect play with
  hindsight", not forging. It cannot be removed without running every game on the server (one request per quarter), which does not
  fit the Vercel Hobby plan. Treat top scores as "best of an unlimited number of attempts" and delete outliers in SQL if needed:
  `delete from runs where id = ...;`
- Anyone can write a bot that plays the game well. Bots are not distinguishable from people.
- Guests play fully locally and nothing they do is stored or ranked.
- **Version pinning.** `tests/sim-lock.test.js` fails if the simulation or data changes without a new `Core.VERSION` and a refreshed
  `tests/sim.lock.json` (`node scripts/update-sim-lock.mjs`). A draft started on an older version is refused with 409 and the
  player is asked to reload. Runs saved before this protection exist as unverified history and never appear on the leaderboard.
- The replay costs about two seconds of CPU per season, so `api/runs.js` has `maxDuration: 30` in `vercel.json`.
- Rate limiting for the login endpoints relies on Vercel's platform protections. Turn on Vercel Firewall / Attack Challenge Mode if you see abuse.
- `style-src` still allows `'unsafe-inline'` because the UI uses inline `style=""` attributes. Scripts remain locked down.

## Reporting

Open a private security advisory on the GitHub repository.
