/** Central deployment configuration — everything comes from env, nothing secret in code. */

export const config = {
  /** Demo mode engages automatically when Google OAuth creds are absent. */
  demoMode: !process.env.GOOGLE_CLIENT_ID || process.env.DEMO_MODE === "true",
  maxConnections: 50, // hard ceiling from the product spec
  defaultConnections: 4, // adaptive default — never 50 unless asked
  maxUrlLength: 2048,
  probeTimeoutMs: 15000,
  chunkMinBytes: 4 * 1024 * 1024,
  appBaseUrl: process.env.APP_BASE_URL ?? "http://localhost:3000",
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    scopes: "openid email profile https://www.googleapis.com/auth/drive.file",
  },
} as const;

export function clampConnections(n: unknown): number {
  const v = typeof n === "number" && Number.isFinite(n) ? Math.floor(n) : config.defaultConnections;
  return Math.max(1, Math.min(config.maxConnections, v));
}
