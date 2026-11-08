<div align="center">

# ⚡ CloudFusion

**Virtual cloud storage platform — pool multiple Google Drive accounts and pull remote files straight into them.**
**The phone is a remote control. Zero file bytes ever touch the device.**

`SOURCE URL ──▶ CLOUDFUSION RELAY ──▶ GOOGLE DRIVE  ∥  PHONE ⇢ metadata · progress · controls`

</div>

---

## What this is

CloudFusion is a fullstack platform that turns several Google Drive accounts into **one virtual storage pool** (e.g. 10 + 12 + 8 + 15 GB free = **45 GB pooled**), then downloads files from **direct HTTP(S) links** *server-to-server* into the drive that has room — never through the user's phone, never into app cache, never into RAM as a whole file.

Two clients ship in this repo:

| Client | Path | Status |
|---|---|---|
| **Next.js web console** (mobile-first, installable) | `src/` | ✅ Primary. Built, type-checked and smoke-tested in CI |
| **Flutter Android app** | `mobile/` | 📦 Source-complete scaffold that talks to the same API. Built by the Android CI workflow |

> **Zero-local invariant (Section 2 of the spec):** remote transfer payloads never exist on the phone — not in internal storage, external storage, Downloads, Flutter cache, temp dirs, unbounded RAM buffers, or as a pre-upload staging copy. The backend streams with **bounded memory** (`chunkSize × live connections`) and the client only receives job IDs, metadata, progress, speed, quota and errors.

## Feature map

- **Multi-drive pooling** via Google OAuth 2.0 (`drive.file` scope; tokens AES-256-GCM at rest; never leave the server)
- **Smart allocation** — largest-free strategy, logical space **reservations** per active job, byte-exact verification; files are never split across accounts
- **Direct-link cloud downloads** — SSRF-safe probing (headers, filename, size, Range support), resumable Drive upload sessions
- **Adaptive parallel engine** — 1–50 range connections (default 4), bounded pool, per-chunk retry/backoff, ordered assembly, ordered single-stream fallback
- **Resumable everything** — pause / resume / retry / cancel, chunk state persisted to Postgres, **backend-restart recovery**, exponential backoff, bounded retries
- **Public Library** — search, categories, size/uploader/retro-share links, rights-confirmation publishing, copyright reports, auto-delist moderation
- **Cloud-to-cloud copy** — provider-native when possible, bounded backend stream otherwise; copies always land **private**
- **Security** — OAuth 2.0, redirect re-validation, private/loopback/CGNAT/metadata-IP blocking, port allow-list, rate limiting, ownership checks, secrets only in env

## Quickstart (web platform)

```bash
cp .env.example .env          # fill DATABASE_URL at minimum
npm install
npx drizzle-kit push          # create tables (schema from src/db/schema.ts)
npm run dev                   # http://localhost:3000
```

Open the landing page → **Launch console** (demo session) or **Sign in with Google** once OAuth env vars are set.

### Demo mode vs. real mode

- **Demo mode** auto-engages when `GOOGLE_CLIENT_ID/SECRET` are unset. Everything works — engine, pooling, retries, library — but byte movement is a **clearly labeled virtual-throughput simulation** requiring no credentials and no Google writes. Great for evaluating the whole UX.
- **Real mode** executes actual ranged downloads into resumable Drive sessions on your server. Deploy somewhere with real egress (see `docs/DEPLOYMENT.md` for free-tier honesty).

## Scripts

```bash
npm run dev        # develop
npm run build      # production build
npm run typecheck  # strict TS
npm run lint       # eslint
npx tsx --test src/lib/engine/__tests__/*.test.ts   # engine unit tests (SSRF guard, allocator)
```

## Repo layout

```
src/
  app/            Next.js App Router — landing, /console (dashboard), /s/[slug] share pages, /api/*
  components/     console UI (pool ring, transfer console, files, library)
  db/             Drizzle schema + idempotent demo seed
  lib/
    engine/       ssrf.ts · probe.ts · allocator.ts · worker.ts (transfer engine) · __tests__/
    google/       drive.ts (OAuth + Drive v3 + resumable uploads)
    session.ts · crypto.ts · ratelimit.ts · serialize.ts
mobile/           Flutter Android client (source scaffold)
docs/             ARCHITECTURE · API · DEPLOYMENT · SECURITY
.github/workflows web-ci.yml (test+build) · android-apk.yml (Flutter analyze/test/APK artifact)
```

## GitHub Actions

- **`build-app.yml`** — **builds the app from this repo's source, from the Actions tab**
  - **Actions → build-app → Run workflow** (optionally paste your backend URL)
  - `cloudfusion-web` artifact → standalone Next.js console (zip, `node server.js`) — see `docs/RUN-ARTIFACT.md`
  - `cloudfusion-apk` artifact → installable Android debug APKs (`arm64-v8a`, `armeabi-v7a`, `x86_64`)
  - Also runs automatically on pushes to `main` touching `src/**` or `mobile/**`
- **`web-ci.yml`** — install, typecheck, engine unit tests, production build (PRs + main)
- **`android-apk.yml`** — Flutter install → `pub get` → format check → analyze → test → **debug APK artifact**

### 📱 Install on your Android phone (Android 8.0+ · Android 12 ready)

1. Open **Actions → build-app → Run workflow** (`publish_release` ticked) — or grab the
   newest build from the **[Releases](../../releases)** page.
2. On the phone tap the asset **`cloudfusion-arm64-v8a.apk`** — that covers practically
   every 64-bit phone from ~2016 onward (`armeabi-v7a` only for older 32-bit devices,
   `x86_64` for emulators).
3. Chrome will warn about a debug-signed APK — allow *Install unknown apps* for Chrome
   and continue. Debug builds are signed with the Flutter debug key, so Play Protect
   asks for confirmation; this is expected.
4. Open **CloudFusion**, set **Relay URL** to your backend
   (`http://<your-lan-ip>:3000` on the same Wi-Fi, or your deployed `https://` URL),
   tap **Use demo session**.

The phone only exchanges JSON — file bytes never land on the device.

### Building the app yourself (without Actions)

```bash
npm ci && npm run build          # web: production build (.next/standalone → node .next/standalone/server.js)
cd mobile && flutter pub get && flutter build apk --debug
```

Bake a backend into the APK: `flutter build apk --debug --dart-define=CF_BACKEND_URL=https://relay.example.com`
(without it, the app's **Relay URL** field is the source of truth).

**Required secrets:** none for CI itself. For **real-mode deploys**, set `DATABASE_URL`, `APP_SECRET`, `TOKEN_ENCRYPTION_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `APP_BASE_URL` in your hosting provider — never in the repo.

## Tested

See `docs/DEPLOYMENT.md` → *Verification log* for exactly what was executed and passed in the delivery environment (drizzle push, unit tests, typecheck, production build, health check, end-to-end demo transfer lifecycle via curl: schedule → ranged progress → pause → resume → verify → library publish → cloud-to-cloud save → report).

## Honest limits (read me)

- No "unlimited storage" — the pool is the arithmetic sum of real Google quotas.
- Gated links (login, cookies, CAPTCHA, DRM, expiring tokens) are **reported as unsupported**; CloudFusion does not bypass access controls.
- GitHub Actions is CI/CD only. It is **not** your transfer server; run the Next app (or the worker entry) on infrastructure with steady bandwidth.
- On a 3 GB-RAM Android device the OS may still kill the app process; jobs live on the backend, so the UI simply re-syncs on relaunch.
