import { and, count, eq, ne } from "drizzle-orm";
import { db } from "@/db";
import { activityEvents, files, libraryReports } from "@/db/schema";
import { getSessionUserId, handleApiError, jsonError } from "@/lib/session";
import { rateLimit } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ slug: string }> };
const REASONS = new Set(["copyright", "illegal", "malware", "privacy", "other"]);
const AUTO_DEMOTE_THRESHOLD = 3;

/**
 * Copyright / abuse reporting with a moderation workflow.
 * Files with ≥ AUTO_DEMOTE_THRESHOLD open reports are demoted from the Public
 * Library to unlisted pending moderator review (takedown policy).
 */
export async function POST(request: Request, ctx: Ctx) {
  try {
    const uid = await getSessionUserId();
    const rl = rateLimit(`report:${uid ?? "anon"}`, 6, 60_000);
    if (!rl.ok) return jsonError(429, `Rate limited — retry in ${rl.retryAfterSec}s`);
    const { slug } = await ctx.params;
    const body = (await request.json().catch(() => null)) as {
      reason?: string;
      details?: string;
      reporter?: string;
    } | null;
    const reason = body?.reason ?? "";
    const details = (body?.details ?? "").slice(0, 1000);
    const reporter = (body?.reporter ?? "").slice(0, 160);

    if (!REASONS.has(reason)) return jsonError(400, "reason must be copyright | illegal | malware | privacy | other");
    if (reason === "copyright" && details.trim().length < 20) {
      return jsonError(400, "Copyright reports need enough detail for a takedown review (≥ 20 chars)");
    }

    const rows = await db.select().from(files).where(and(eq(files.shareSlug, slug), ne(files.visibility, "private"))).limit(1);
    const file = rows[0];
    if (!file) return jsonError(404, "File not found");

    const [report] = await db
      .insert(libraryReports)
      .values({
        fileId: file.id,
        reason,
        details,
        reporter: reporter || null,
        status: reason === "copyright" ? "reviewing" : "open",
      })
      .returning();

    const open = await db
      .select({ n: count() })
      .from(libraryReports)
      .where(and(eq(libraryReports.fileId, file.id), ne(libraryReports.status, "resolved")));

    let demoted = false;
    if (open[0].n >= AUTO_DEMOTE_THRESHOLD && file.visibility === "public") {
      demoted = true;
      await db.update(files).set({ visibility: "unlisted" }).where(eq(files.id, file.id));
      await db.insert(activityEvents).values({
        userId: file.userId,
        type: "library",
        message: `${file.name} — temporarily delisted pending moderation (${open[0].n} reports)`,
      });
    }

    return Response.json({ ok: true, reportId: report.id, status: report.status, demoted });
  } catch (err) {
    return handleApiError(err);
  }
}
