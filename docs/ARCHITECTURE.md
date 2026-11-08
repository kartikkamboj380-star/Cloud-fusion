# CloudFusion — Architecture

```
┌────────────────────┐  metadata only (REST, ≤KB payloads)
│  Phone / Web client │ ────────────────────────────────┐
│  (Flutter · Next)   │ ◀──────────── job JSON state    │
└────────────────────┘                                 │
                                             ┌─────────▼──────────┐
                                             │  Next.js platform  │
                                             │  /api/* routes     │
                                             │  session · quotas  │
                                             │  library · reports │
                                             └─────────┬──────────┘
                                                       │ owns job rows
                                             ┌─────────▼──────────┐
                                             │ Transfer engine    │
                                             │ (lib/engine/worker)│
                                             │ bounded scheduler  │     SOURCE (http/s)
                                             │ 1..50 ranged conns │ ── ranged GETs ──▶ chunk buffer (≤ chunkSize)
                                             │ probe · allocator  │                        │
                                             │ retry · backoff    │                        ▼
                                             └─────────┬──────────┘        Drive resumable session
                                                       │                  PUT Content-Range…
                                             ┌─────────▼──────────┐
                                             │ PostgreSQL (Drizzle)│
                                             │ users · drives ·    │
                                             │ jobs+chunks · files │
                                             │ reports · activity  │
                                             └─────────────────────┘
```

## Data-plane invariants

1. Clients **never** receive payload bytes — only `transfer_jobs` projections (`lib/serialize.ts`), quotas and library listings.
2. Engine memory per job ≤ `chunkSize × active connections` (default chunk 8 MiB). No `readAsBytes`-style whole-file loads anywhere.
3. Chunks assemble **in order**; every chunk's persisted `done` must equal `end−start+1` before a job verifies.
4. Reservations (`drives.reservedBytes`) make allocation atomic across concurrent jobs; released on cancel/fail, converted to `quota_used` on verify.
5. Jobs are crash-safe: chunk state is in Postgres, so `recoverJobs()` re-registers in-flight jobs after a backend restart and resumes mid-chunk state.

## Scaling the engine

`src/lib/engine/worker.ts` runs in-process for a single deployment. To scale out: run the same engine loop in a separate worker process against the same Postgres, claim jobs with `UPDATE … SET status='probing' … WHERE status='queued' RETURNING` (advisory-lock or `FOR UPDATE SKIP LOCKED`), and keep API routes control-plane only. The module boundary already assumes this split.

## Why the phone can't accidentally download

- The client bundle contains no code path that fetches `sourceUrl` content (only JSON APIs).
- No DownloadManager / no file writes — the Flutter scaffold stores only base-URL + session cookie (shared_preferences).
- API routes scope responses: source URLs are validated server-side; Drive tokens are never serialized (`/api/drives` maps explicit safe fields).
