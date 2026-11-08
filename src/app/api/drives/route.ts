import { desc, eq } from "drizzle-orm";
import { randomInt } from "node:crypto";
import { db } from "@/db";
import { driveAccounts, activityEvents } from "@/db/schema";
import { requireUserId, handleApiError, jsonError } from "@/lib/session";
import { config } from "@/lib/config";
import { rateLimit } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";

const GB = 1024 ** 3;

/** List pool drives. Tokens are NEVER selected or returned. */
export async function GET() {
  try {
    const uid = await requireUserId();
    const rows = await db
      .select()
      .from(driveAccounts)
      .where(eq(driveAccounts.userId, uid))
      .orderBy(desc(driveAccounts.connectedAt));
    return Response.json({
      ok: true,
      demoMode: config.demoMode,
      drives: rows.map((d) => ({
        id: d.id,
        provider: d.provider,
        email: d.email,
        displayName: d.displayName,
        status: d.status,
        quotaTotal: d.quotaTotal,
        quotaUsed: d.quotaUsed,
        reservedBytes: d.reservedBytes,
        free: Math.max(0, d.quotaTotal - d.quotaUsed - d.reservedBytes),
        scopes: d.scopes,
        connectedAt: d.connectedAt,
        lastSyncAt: d.lastSyncAt,
      })),
    });
  } catch (err) {
    return handleApiError(err);
  }
}

/**
 * Demo connector — only available when Google OAuth is not configured.
 * Real deployments connect drives exclusively through OAuth: /api/auth/google/start
 */
export async function POST() {
  try {
    const uid = await requireUserId();
    const rl = rateLimit(`drives:${uid}`, 6, 60_000);
    if (!rl.ok) return jsonError(429, `Rate limited — retry in ${rl.retryAfterSec}s`);
    if (!config.demoMode) return jsonError(400, "Demo connector disabled — use Google OAuth");

    const existing = await db.select().from(driveAccounts).where(eq(driveAccounts.userId, uid));
    const letter = String.fromCharCode(65 + existing.length);
    const aliases = ["nova", "quartz", "ember", "sonic", "atlas", "pixel", "orbit", "zephyr"];
    const alias = aliases[randomInt(aliases.length)] + "." + randomInt(90, 999);
    const total = 15 * GB;
    const used = randomInt(0, 6) * GB + randomInt(0, 512) * 1024 ** 2;

    const [drive] = await db
      .insert(driveAccounts)
      .values({
        userId: uid,
        provider: "google",
        email: `${alias}@gmail.com`,
        displayName: `Drive ${letter} · ${alias}`,
        status: "demo",
        quotaTotal: total,
        quotaUsed: used,
        scopes: "demo-simulation",
      })
      .returning();

    await db.insert(activityEvents).values({
      userId: uid,
      type: "drive",
      message: `Connected Drive ${letter} (${alias}@gmail.com) — pool rebalanced`,
    });

    return Response.json({
      ok: true,
      drive: {
        id: drive.id,
        email: drive.email,
        displayName: drive.displayName,
        status: drive.status,
        quotaTotal: drive.quotaTotal,
        quotaUsed: drive.quotaUsed,
        reservedBytes: drive.reservedBytes,
        free: drive.quotaTotal - drive.quotaUsed,
      },
    });
  } catch (err) {
    return handleApiError(err);
  }
}
