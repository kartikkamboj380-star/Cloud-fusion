import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { ensureDemoData, DEMO_EMAIL } from "@/db/seed";
import { getSessionUser, sessionCookiePayload } from "@/lib/session";
import { config } from "@/lib/config";

export const dynamic = "force-dynamic";

const COOKIE_OPTS = { httpOnly: true, sameSite: "lax" as const, path: "/", maxAge: 60 * 60 * 24 * 30 };

export async function GET() {
  const user = await getSessionUser();
  if (!user) return Response.json({ ok: true, user: null, demoMode: config.demoMode });
  return Response.json({
    ok: true,
    demoMode: config.demoMode,
    user: { id: user.id, name: user.name, email: user.email, avatarHue: user.avatarHue },
  });
}

/** Demo-mode sign in. Real deployments authenticate via Google OAuth (see /api/auth/google/start). */
export async function POST() {
  await ensureDemoData();
  const rows = await db.select().from(users).where(eq(users.email, DEMO_EMAIL)).limit(1);
  const user = rows[0];
  if (!user) return Response.json({ ok: false, error: "demo user unavailable" }, { status: 500 });
  const { uid, sig } = sessionCookiePayload(user.id);
  const res = Response.json({ ok: true, user: { id: user.id, name: user.name, email: user.email } });
  res.headers.append("Set-Cookie", `cf_uid=${uid}; ${cookieString()}`);
  res.headers.append("Set-Cookie", `cf_sig=${sig}; ${cookieString()}`);
  return res;
}

export async function DELETE() {
  const res = Response.json({ ok: true });
  res.headers.append("Set-Cookie", `cf_uid=; ${cookieString(0)}`);
  res.headers.append("Set-Cookie", `cf_sig=; ${cookieString(0)}`);
  return res;
}

function cookieString(maxAge?: number): string {
  const o = { ...COOKIE_OPTS, ...(maxAge !== undefined ? { maxAge } : {}) };
  return `HttpOnly; Path=${o.path}; SameSite=Lax; Max-Age=${o.maxAge}`;
}
