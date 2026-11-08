import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { activityEvents, driveAccounts, transferJobs } from "@/db/schema";
import { requireUserId, handleApiError, jsonError, ApiError } from "@/lib/session";
import { cancelJob, pauseJob, resumeJob, retryJobNow, ensureEngineStarted } from "@/lib/engine/worker";
import { effectiveFree } from "@/lib/engine/allocator";
import { rateLimit } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };
type Action = "pause" | "resume" | "cancel" | "retry";

const ACTIVE = new Set(["queued", "probing", "downloading", "uploading", "verifying"]);

export async function POST(request: Request, ctx: Ctx) {
  try {
    const uid = await requireUserId();
    const rl = rateLimit(`ctl:${uid}`, 30, 60_000);
    if (!rl.ok) return jsonError(429, `Rate limited — retry in ${rl.retryAfterSec}s`);
    const { id } = await ctx.params;
    const body = (await request.json().catch(() => null)) as { action?: Action } | null;
    const action = body?.action;
    if (!action || !["pause", "resume", "cancel", "retry"].includes(action)) {
      return jsonError(400, "action must be pause | resume | cancel | retry");
    }

    const rows = await db
      .select()
      .from(transferJobs)
      .where(and(eq(transferJobs.id, id), eq(transferJobs.userId, uid)))
      .limit(1);
    const job = rows[0];
    if (!job) return jsonError(404, "Transfer not found");

    ensureEngineStarted();

    switch (action) {
      case "pause": {
        if (!ACTIVE.has(job.status)) throw new ApiError(409, `Cannot pause a ${job.status} transfer`);
        await pauseJob(job);
        break;
      }
      case "resume": {
        if (job.status !== "paused") throw new ApiError(409, "Only paused transfers can resume");
        await resumeJob(job);
        break;
      }
      case "cancel": {
        if (job.status === "completed") throw new ApiError(409, "Completed transfers cannot be canceled");
        if (job.status !== "canceled") await cancelJob(job);
        break;
      }
      case "retry": {
        if (job.status !== "failed" && job.status !== "canceled") {
          throw new ApiError(409, "Only failed or canceled transfers can be retried");
        }
        const size = Number(job.fileSize ?? 0);
        if (job.driveAccountId && size > 0 && job.error) {
          // Reservation was released on permanent failure — re-check capacity.
          const d = await db.select().from(driveAccounts).where(eq(driveAccounts.id, job.driveAccountId)).limit(1);
          if (d[0] && effectiveFree(d[0]) < size) {
            throw new ApiError(409, "Destination drive no longer has enough free space");
          }
          if (d[0]) {
            await db
              .update(driveAccounts)
              .set({ reservedBytes: sql`${driveAccounts.reservedBytes} + ${size}` })
              .where(eq(driveAccounts.id, d[0].id));
          }
        }
        await retryJobNow(job);
        break;
      }
    }

    await db.insert(activityEvents).values({
      userId: uid,
      type: "transfer",
      message: `${job.fileName} — ${action} requested`,
      meta: { jobId: job.id },
    });

    const fresh = await db.select().from(transferJobs).where(eq(transferJobs.id, id)).limit(1);
    return Response.json({ ok: true, status: fresh[0]?.status ?? job.status });
  } catch (err) {
    return handleApiError(err);
  }
}
