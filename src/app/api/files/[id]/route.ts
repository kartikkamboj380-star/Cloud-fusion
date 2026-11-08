import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { activityEvents, driveAccounts, files } from "@/db/schema";
import { requireUserId, handleApiError, jsonError, ApiError } from "@/lib/session";
import { randomSlug } from "@/lib/crypto";
import { config } from "@/lib/config";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };
const VISIBILITIES = new Set(["private", "unlisted", "public"]);

export async function PATCH(request: Request, ctx: Ctx) {
  try {
    const uid = await requireUserId();
    const { id } = await ctx.params;
    const body = (await request.json().catch(() => null)) as {
      visibility?: string;
      rightsConfirmed?: boolean;
      description?: string;
      category?: string;
    } | null;
    if (!body) return jsonError(400, "Invalid body");

    const rows = await db
      .select()
      .from(files)
      .where(and(eq(files.id, id), eq(files.userId, uid)))
      .limit(1);
    const file = rows[0];
    if (!file) return jsonError(404, "File not found");

    const targetVis = body.visibility ?? file.visibility;
    if (!VISIBILITIES.has(targetVis)) return jsonError(400, "Invalid visibility");

    // Legal gate: publishing requires an explicit rights confirmation.
    if ((targetVis === "public" || targetVis === "unlisted") && file.visibility === "private" && !body.rightsConfirmed) {
      throw new ApiError(400, "You must confirm you own or have the legal right to share this file");
    }

    const wasPublic = file.visibility === "public";
    const becomingPublic = targetVis === "public" && !wasPublic;
    const becomingPrivate = targetVis === "private" && file.visibility !== "private";

    const shareSlug =
      targetVis === "private" ? file.shareSlug : (file.shareSlug ?? randomSlug("cf"));

    await db
      .update(files)
      .set({
        visibility: targetVis,
        shareSlug,
        ...(body.category ? { category: body.category } : {}),
        ...(body.description !== undefined ? { description: body.description.slice(0, 500) } : {}),
        ...(becomingPublic ? { publishedAt: file.publishedAt ?? new Date() } : {}),
      })
      .where(eq(files.id, id));

    if (becomingPrivate) {
      // Public listing removed immediately. With real OAuth tokens the engine
      // also revokes the Drive 'anyone' permission (see docs/SECURITY.md).
      await db.insert(activityEvents).values({
        userId: uid,
        type: "library",
        message: `${file.name} — made private; removed from Public Library${config.demoMode ? "" : " and revoked public Drive access"}`,
      });
    } else if (becomingPublic) {
      await db.insert(activityEvents).values({
        userId: uid,
        type: "library",
        message: `${file.name} — published to Public Library`,
      });
    }

    const fresh = await db.select().from(files).where(eq(files.id, id)).limit(1);
    return Response.json({ ok: true, file: fresh[0] });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(_req: Request, ctx: Ctx) {
  try {
    const uid = await requireUserId();
    const { id } = await ctx.params;
    const rows = await db
      .select()
      .from(files)
      .where(and(eq(files.id, id), eq(files.userId, uid)))
      .limit(1);
    const file = rows[0];
    if (!file) return jsonError(404, "File not found");

    if (file.driveAccountId) {
      await db
        .update(driveAccounts)
        .set({ quotaUsed: sql`GREATEST(0, ${driveAccounts.quotaUsed} - ${file.size})` })
        .where(eq(driveAccounts.id, file.driveAccountId));
    }
    await db.insert(activityEvents).values({
      userId: uid,
      type: "file",
      message: `${file.name} — removed from pool index`,
    });
    await db.delete(files).where(eq(files.id, id));
    return Response.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
