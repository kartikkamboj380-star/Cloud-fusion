# CloudFusion — Deployment & Build

## Web platform (Next.js + PostgreSQL)

### Local
```bash
cp .env.example .env
npm install
npx drizzle-kit push
npm run dev
```

### Production (self-host)
Any Node 20+ host with egress to the internet (the relay needs bandwidth proportional to your transfers):

```bash
npm ci && npm run build && npm run start
# Postgres: managed instance or docker run -p5432:5432 postgres:17
npx drizzle-kit push   # once, against production DATABASE_URL
```

### Free-tier reality check
- **Render/Railway/Fly free tiers** sleep on idle and cap monthly bandwidth. Transfers are chunked + persisted, so a sleeping backend *pauses* progress and resumes on wake — but large files will take real time. Provisioning a small always-on VPS (or a Hetzner/Oracle free VM) is the honest recommendation for multi-GB transfers.
- **Vercel serverless** is *not* suitable for the transfer engine (function time limits). Deploy on a container/VM where a long-lived process may keep the engine interval alive.
- Google OAuth consent: create a Google Cloud project → consent screen (Testing is fine; add your Gmail) → OAuth client (Web) with redirect URI `{APP_BASE_URL}/api/auth/google/callback`.

## Android client (Flutter scaffold, `mobile/`)

Via CI (recommended): push to GitHub → the `android-apk` workflow builds a **debug APK artifact** (no secrets needed).

Locally:
```bash
cd mobile
flutter pub get
flutter analyze
flutter test
flutter build apk --debug        # app/build/outputs/flutter-apk/app-debug.apk
```
First launch: set the server URL (Android emulator → `http://10.0.2.2:3000`), tap **Use demo session**, or complete Google sign-in on the web console.

## Verification log (what was actually executed for this delivery)

| Check | Tooling | Result |
|---|---|---|
| Schema applied to Postgres | `npx drizzle-kit push` | ✅ passed |
| Engine unit tests (SSRF guard, allocator, pool math) | `npx tsx --test src/lib/engine/__tests__/*.test.ts` | ✅ passed |
| Type generation | `npx next typegen` | ✅ passed |
| Strict typecheck | `tsc --noEmit --pretty false` | ✅ passed |
| Production build | `npm run build` | ✅ passed |
| Boot + `/api/health` | platform runtime (production server) | ✅ healthy |
| E2E demo transfer via curl | schedule → ranged progress → pause → resume → verify → file indexed | ✅ passed |
| Library flows via curl | publish gate (rights) → public search → cloud-to-cloud save → copyright report | ✅ passed |
| Flutter compile | — | ⚠️ **not built in this authoring sandbox (no Flutter SDK)** — source shipped; the `android-apk` workflow compiles it on GitHub runners |

Nothing above is aspirational: each ✅ was run in the delivery environment; the ⚠️ is where the sandbox ended and CI takes over.
