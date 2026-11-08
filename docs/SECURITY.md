# CloudFusion — Security Model

## SSRF defense (`src/lib/engine/ssrf.ts`)

User URLs fetch **server-side**, so every URL *and every redirect hop* must pass:

- scheme allow-list: `http` / `https` only (no `file:`, `ftp:`, `gopher:`…)
- credential smuggling rejected (`user:pass@host`)
- IP literals checked against: loopback, RFC1918, link-local **169.254.0.0/16** (cloud metadata, incl. `169.254.169.254`), CGNAT 100.64/10, multicast/reserved, `::1`, ULA `fc00::/7`, `fe80::/10`
- hostname suffix blocks: `localhost`, `.local`, `.internal`, `.lan`, `.home`, `metadata.google.internal`
- DNS pinned per hop: all resolved addresses must be public (mitigates naive rebind); port allow-list `{80,443,8080,8443,2053,2083,2087,2096}`
- max 5 redirects, manual (`redirect: "manual"`) so each `Location` is re-validated
- blocked attempts are written to the audit feed (`activity_events`, type `security`)

## Identity & tokens

- Google OAuth 2.0 authorization-code flow with server-side exchange (`/api/auth/google/*`), `drive.file` scope (least privilege), CSRF state cookie.
- Access/refresh tokens encrypted **AES-256-GCM** (`lib/crypto.ts`, key = SHA-256 of `TOKEN_ENCRYPTION_KEY`) and stored in `drives.access_token_enc` — they are never selected into API responses and never sent to clients.
- Sessions = `cf_uid` + `cf_sig` (HMAC-SHA256 over uid, `timingSafeEqual`), HttpOnly cookies, 30-day.
- Demo mode signs in a seeded profile and uses **no real tokens**; clearly labeled in UI.

## Authorization

Every mutating/query route resolves `requireUserId()` and scopes queries by `userId`; ownership is re-verified on every control action (pause/resume/cancel/retry, file PATCH/DELETE, drive disconnect, save).

## Rate limiting

In-memory sliding window per user per endpoint: transfers 12/min, controls 30/min, drive-connect 6/min, library-save 10/min, reports 6/min. Swap in Redis for multi-instance deploys (`lib/ratelimit.ts`).

## Public library & takedown

- Publishing requires an explicit `rightsConfirmed` flag (enforced server-side).
- Making a file private **removes the listing immediately** and (real mode) revokes the Drive `anyone` permission.
- Reports: `copyright|illegal|malware|privacy|other`; copyright requires ≥20-char substantiation; **3 open reports auto-delist** (public→unlisted) pending human review; statuses `open→reviewing→resolved|removed`.

## Non-goals (explicit)

No password collection, no cookie/headers relay for gated sources, no CAPTCHA/DRM bypass. Password-protected or login-gated URLs return **422 unsupported**.

## Secrets hygiene

`.env*` and key material are git-ignored; `.env.example` contains placeholders only. CI needs **zero** secrets; deploys read env from the hosting provider.
