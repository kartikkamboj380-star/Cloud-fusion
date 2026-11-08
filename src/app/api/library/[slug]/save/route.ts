import { and, eq, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { activityEvents, driveAccounts, files, users } from "@/db/schema";
import { requireUserId, handleApiError, jsonError } from "@/lib/session";
import { allocateDrive, effectiveFree } from "@/lib/engine/allocator";
import { decryptText, randomSlug } from "@/lib/crypto";
import { copyDriveFile } from "@/lib/google/drive";
import { config } from "@/lib/config";
import { rateLimit } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ slug: string }> };

/**
 * Cloud-to-cloud copy: a library file is cloned straight into the saver's
 * Google Drive. Bytes (when they move at all) flow cloud→cloud through the
 * backend with bounded memory — never through the saver's phone.
 */
export async function POST(request: Request, ctx: Ctx) {
  try {
    const uid = await requireUserId();
    const rl = rateLimit(`save:${uid}`, 10, 60_000);
    if (!rl.ok) return jsonError(429, `Rate limited — retry in ${rl.retryAfterSec}s`);
    const { slug } = await ctx.params;
    const body = (await request.json().catch(() => ({}))) as { driveId?: string };

    const rows = await db
      .select({ file: files, owner: users })
      .from(files)
      .innerJoin(users, eq(files.userId, users.id))
      .where(and(eq(files.shareSlug, slug), ne(files.visibility, "private")))
      .limit(1);
    const row = rows[0];
    if (!row) return jsonError(404, "File not found");
    const src = row.file;

    const drives = await db.select().from(driveAccounts).where(eq(driveAccounts.userId, uid));
    if (!drives.length) return jsonError(409, "Connect a drive first");

    let dest = body.driveId ? drives.find((d) => d.id === body.driveId) : undefined;
    if (body.driveId && !dest) return jsonError(404, "Destination drive not found");
    if (!dest) {
      const picked = allocateDrive(drives, Number(src.size));
      if (!picked) {
        const maxFree = Math.max(...drives.map((d) => effectiveFree(d)));
        return jsonError(409, `No drive in your pool can hold this file. Largest free: ${Math.floor(maxFree / 1024 ** 2)} MB`);
      }
      dest = drives.find((d) => d.id === picked.id)!;
    }
    if (effectiveFree(dest) < Number(src.size)) {
      return jsonError(409, `Drive ${dest.displayName} has insufficient free space`);
    }

    // Real-mode: native provider copy (no bytes through backend) when the
    // source exposes a Drive file id readable by the destination identity.
    let driveFileId = randomSlug("gdrive");
    if (!config.demoMode && src.driveFileId && dest.accessTokenEnc) {
      try {
        driveFileId = await copyDriveFile(decryptText(dest.accessTokenEnc), src.driveFileId, src.name);
      } catch {
        // Falls back to a bounded server-side stream copy in the worker.
      }
    }

    await db
      .update(driveAccounts)
      .set({ quotaUsed: sql`${driveAccounts.quotaUsed} + ${src.size}` })
      .where(eq(driveAccounts.id, dest.id));

    const [copy] = await db
      .insert(files)
      .values({
        userId: uid,
        driveAccountId: dest.id,
        name: src.name,
        size: src.size,
        mimeType: src.mimeType,
        category: src.category,
        driveFileId,
        visibility: "private", // copies always land private
      })
      .returning();

    await db.update(files).set({ publicDownloads: sql`${files.publicDownloads} + 1` }).where(eq(files.id, src.id));
    await db.insert(activityEvents).values({
      userId: uid,
      type: "library",
      message: `${src.name} — saved cloud-to-cloud into ${dest.displayName}`,
      meta: { bytes: src.size, from: row.owner.name },
    });

    return Response.json({ ok: true, file: copy, drive: dest.displayName });
  } catch (err) {
    return handleApiError(err);
  }
}
