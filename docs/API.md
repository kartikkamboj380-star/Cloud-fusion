# CloudFusion — API Reference

All responses are JSON. Auth = HttpOnly session cookies (`cf_uid` + HMAC `cf_sig`). Clients only ever receive **metadata** — there is no endpoint that returns transfer payload bytes.

## Session & OAuth
| Method | Path | Notes |
|---|---|---|
| GET | `/api/session` | current user + `demoMode` flag |
| POST | `/api/session` | demo sign-in (seeded profile) |
| DELETE | `/api/session` | sign out |
| GET | `/api/auth/google/start` | 302 → Google consent (CSRF state cookie). 400 if OAuth unconfigured |
| GET | `/api/auth/google/callback` | code exchange → encrypted token storage → drive upsert |
| GET | `/api/health` | liveness + `demoMode`, engine state |

## Pool
| Method | Path | Notes |
|---|---|---|
| GET | `/api/stats` | pool totals `{total, used, reserved, available}`, counts |
| GET | `/api/drives` | drives with computed `free`. **Tokens never returned** |
| POST | `/api/drives` | demo-mode connector (real mode: OAuth only) |
| DELETE | `/api/drives/{id}` | disconnect (409 while reservations active) |
| GET | `/api/activity` | audit feed (incl. `security` SSRF-block events) |

## Remote transfers
| Method | Path | Notes |
|---|---|---|
| POST | `/api/transfers` | `{url, connections?}` → validate → probe → allocate → reserve → schedule. 400 SSRF reject, 409 no capacity, 422 gated/unreachable source |
| GET | `/api/transfers?page&pageSize&status` | paginated job projections (progress, speed, chunk tallies, ETA fields) |
| GET | `/api/transfers/{id}` | single job |
| POST | `/api/transfers/{id}/control` | `{action: pause\|resume\|cancel\|retry}` with state-machine validation |

## Files & visibility
| Method | Path | Notes |
|---|---|---|
| GET | `/api/files?page&pageSize&visibility` | my indexed files + owning drive label |
| PATCH | `/api/files/{id}` | `{visibility, rightsConfirmed?, description?, category?}` — sharing requires `rightsConfirmed:true`; going private delists immediately + revokes public Drive access (real mode) |
| DELETE | `/api/files/{id}` | remove from index; quota reconciled |

## Public Library
| Method | Path | Notes |
|---|---|---|
| GET | `/api/library?q&category&minSize&maxSize&page` | public-only search with uploader names |
| GET | `/api/library/{slug}` | share payload (private → 404, existence not leaked) |
| POST | `/api/library/{slug}/save` | cloud-to-cloud copy into caller's pool (allocate → native copy / bounded stream) → lands **private** |
| POST | `/api/library/{slug}/report` | `{reason, details, reporter?}` — copyright needs ≥20 chars; ≥3 open reports auto-delist pending review |

## Errors
`{ ok:false, error:"human-readable" }` with matching HTTP status (400 validation · 401 auth · 404 missing · 409 conflict/capacity · 422 source problem · 429 rate limited · 500 relay fault).
