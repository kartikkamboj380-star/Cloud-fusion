import { and, count, eq, inArray, ne } from "drizzle-orm";
import { db } from "@/db";
import { driveAccounts, files, libraryReports, transferJobs } from "@/db/schema";
import { getSessionUserId, handleApiError } from "@/lib/session";
import { poolTotals } from "@/lib/engine/allocator";
import { ensureEngineStarted } from "@/lib/engine/worker";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const uid = await getSessionUserId();
    if (!uid) return Response.json({ ok: true, authed: false });
    ensureEngineStarted();

    const drives = await db.select().from(driveAccounts).where(eq(driveAccounts.userId, uid));
    const pool = poolTotals(drives);

    const active = await db
      .select({ n: count() })
      .from(transferJobs)
      .where(
        and(eq(transferJobs.userId, uid), inArray(transferJobs.status, ["queued", "probing", "downloading", "uploading", "verifying"])),
      );
    const mine = await db.select({ n: count() }).from(files).where(eq(files.userId, uid));
    const pub = await db
      .select({ n: count() })
      .from(files)
      .where(and(eq(files.userId, uid), eq(files.visibility, "public")));
    const openReports = await db
      .select({ n: count() })
      .from(libraryReports)
      .where(ne(libraryReports.status, "resolved"));

    return Response.json({
      ok: true,
      authed: true,
      pool,
      drives: drives.length,
      activeTransfers: active[0].n,
      myFiles: mine[0].n,
      myPublicFiles: pub[0].n,
      openReports: openReports[0].n,
    });
  } catch (err) {
    return handleApiError(err);
  }
}
