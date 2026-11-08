/** Tiny in-memory sliding-window rate limiter (per-process; use Redis at scale). */

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

export function rateLimit(key: string, limit: number, windowMs: number): { ok: boolean; retryAfterSec: number } {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfterSec: 0 };
  }
  b.count++;
  if (b.count > limit) {
    return { ok: false, retryAfterSec: Math.ceil((b.resetAt - now) / 1000) };
  }
  return { ok: true, retryAfterSec: 0 };
}

// Periodic GC so the map stays small on low-RAM deployments.
if (typeof setInterval !== "undefined") {
  const g = globalThis as unknown as { __cfRlGc?: boolean };
  if (!g.__cfRlGc) {
    g.__cfRlGc = true;
    setInterval(() => {
      const now = Date.now();
      for (const [k, v] of buckets) if (v.resetAt <= now) buckets.delete(k);
    }, 60_000).unref?.();
  }
}
