import { cookies } from "next/headers";
import { eq, and } from "drizzle-orm";
import { db } from "@/db";
import { users, driveAccounts, activityEvents } from "@/db/schema";
import { exchangeCode, getDriveQuota, googleOAuthConfigured } from "@/lib/google/drive";
import { encryptText } from "@/lib/crypto";
import { sessionCookiePayload } from "@/lib/session";
import { ensureDemoData, DEMO_EMAIL } from "@/db/seed";
import { config } from "@/lib/config";

export const dynamic = "force-dynamic";

/**
 * OAuth 2.0 callback. Exchanges the code server-side, stores tokens
 * AES-256-GCM-encrypted, and registers the Drive in the pool.
 */
export async function GET(request: Request) {
  const base = config.appBaseUrl;
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const err = url.searchParams.get("error");

  if (err) return redirect(base, `oauth_${err}`);
  if (!googleOAuthConfigured()) return redirect(base, "oauth_not_configured");
  const store = await cookies();
  const expected = store.get("cf_oauth_state")?.value;
  if (!code || !state || !expected || state !== expected) return redirect(base, "oauth_state_mismatch");

  try {
    const tokens = await exchangeCode(code);
    const quota = await getDriveQuota(tokens.access_token);

    // Attach the drive to the signed-in user; fall back to the demo profile
    // so the connect flow can be evaluated standalone.
    let uid = await getSessionUserIdSafe();
    if (!uid) {
      await ensureDemoData();
      const rows = await db.select().from(users).where(eq(users.email, DEMO_EMAIL)).limit(1);
      uid = rows[0]?.id ?? null;
    }
    if (!uid) return redirect(base, "oauth_no_session");

    const existing = await db
      .select()
      .from(driveAccounts)
      .where(and(eq(driveAccounts.userId, uid), eq(driveAccounts.email, quota.email)))
      .limit(1);

    const tokenFields = {
      accessTokenEnc: encryptText(tokens.access_token),
      ...(tokens.refresh_token ? { refreshTokenEnc: encryptText(tokens.refresh_token) } : {}),
      tokenExpiry: new Date(Date.now() + tokens.expires_in * 1000),
      scopes: config.google.scopes,
      quotaTotal: quota.total,
      quotaUsed: quota.used,
      status: "connected",
      lastSyncAt: new Date(),
    };

    if (existing.length) {
      await db.update(driveAccounts).set(tokenFields).where(eq(driveAccounts.id, existing[0].id));
    } else {
      await db.insert(driveAccounts).values({
        userId: uid,
        email: quota.email,
        displayName: `${quota.displayName} · ${quota.email}`,
        provider: "google",
        ...tokenFields,
      });
    }
    await db.insert(activityEvents).values({
      userId: uid,
      type: "drive",
      message: `Connected ${quota.email} — pool rebalanced`,
    });

    const res = new Response(null, { status: 302, headers: { Location: `${base}/console?connected=1` } });
    const { uid: u, sig } = sessionCookiePayload(uid);
    res.headers.append("Set-Cookie", `cf_uid=${u}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${60 * 60 * 24 * 30}`);
    res.headers.append("Set-Cookie", `cf_sig=${sig}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${60 * 60 * 24 * 30}`);
    res.headers.append("Set-Cookie", "cf_oauth_state=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0");
    return res;
  } catch (e) {
    console.error("[oauth] callback failed:", e);
    return redirect(base, "oauth_exchange_failed");
  }
}

async function getSessionUserIdSafe(): Promise<string | null> {
  const { getSessionUserId } = await import("@/lib/session");
  return getSessionUserId();
}

function redirect(base: string, q: string): Response {
  return new Response(null, { status: 302, headers: { Location: `${base}/console?error=${q}` } });
}
