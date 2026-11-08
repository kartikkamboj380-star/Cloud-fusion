import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { driveAccounts, activityEvents } from "@/db/schema";
import { requireUserId, handleApiError, jsonError } from "@/lib/session";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** Disconnect a drive (ownership-verified). Files stay on Google Drive; pool shrink is immediate. */
export async function DELETE(_req: Request, ctx: Ctx) {
  try {
    const uid = await requireUserId();
    const { id } = await ctx.params;
    const rows = await db
      .select()
      .from(driveAccounts)
      .where(and(eq(driveAccounts.id, id), eq(driveAccounts.userId, uid)))
      .limit(1);
    const drive = rows[0];
    if (!drive) return jsonError(404, "Drive not found");

    const activeResv = Number(drive.reservedBytes ?? 0);
    if (activeResv > 0) {
      return jsonError(409, "Drive has active transfer reservations — pause/cancel running jobs first");
    }

    await db.insert(activityEvents).values({
      userId: uid,
      type: "drive",
      message: `Disconnected ${drive.email} from the pool`,
    });
    await db.delete(driveAccounts).where(eq(driveAccounts.id, id));
    return Response.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
