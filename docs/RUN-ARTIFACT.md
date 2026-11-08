# CloudFusion web console — runnable artifact

This zip is the standalone build of the web console (`src/`) produced by the
`build-app` GitHub Actions workflow. It needs Node.js 22+ and a PostgreSQL database.

## 1. Configure

```bash
export DATABASE_URL="postgresql://user:pass@host:5432/app_db"
export APP_SECRET="$(openssl rand -hex 32)"          # session cookie HMAC
export TOKEN_ENCRYPTION_KEY="$(openssl rand -hex 32)" # AES-256-GCM for OAuth tokens
export APP_BASE_URL="https://your-host"               # public URL of this deployment
export PORT=3000
```

## 2. Create the tables (once)

Run from a full repo checkout (schema lives in `src/db/schema.ts`):

```bash
npx drizzle-kit push
```

## 3. Start

```bash
node server.js
```

Open `http://localhost:3000` → landing page → **Launch console** (demo session).

## Notes

- Google OAuth is optional. Without `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`
  the app runs in clearly labelled **demo mode** (virtual throughput, no Google writes).
- Never put real secrets in the repository; supply them as environment variables.
- Full documentation is in the `docs/` folder shipped inside this artifact.
