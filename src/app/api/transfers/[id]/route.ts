import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { driveAccounts, transferJobs } from "@/db/schema";
import { requireUserId, handleApiError, jsonError } from "@/lib/session";
import { serializeJob } from "@/lib/serialize";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** Job status for the lightweight client — metadata only, never file bytes. */
export async function GET(_req: Request, ctx: Ctx) {
  try {
    const uid = await requireUserId();
    const { id } = await ctx.params;
    const rows = await db
      .select({ job: transferJobs, drive: driveAccounts })
      .from(transferJobs)
      .leftJoin(driveAccounts, eq(transferJobs.driveAccountId, driveAccounts.id))
      .where(and(eq(transferJobs.id, id), eq(transferJobs.userId, uid)))
      .limit(1);
    const row = rows[0];
    if (!row) return jsonError(404, "Transfer not found");
    return Response.json({ ok: true, job: serializeJob(row.job), driveLabel: row.drive?.displayName ?? null });
  } catch (err) {
    return handleApiError(err);
  }
}
