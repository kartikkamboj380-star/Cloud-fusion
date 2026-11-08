import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { driveAccounts, files } from "@/db/schema";
import { requireUserId, handleApiError } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const uid = await requireUserId();
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, Number(searchParams.get("page") ?? 1) || 1);
    const pageSize = Math.min(50, Math.max(1, Number(searchParams.get("pageSize") ?? 24) || 24));
    const vis = searchParams.get("visibility");

    const where =
      vis && ["private", "unlisted", "public"].includes(vis)
        ? and(eq(files.userId, uid), eq(files.visibility, vis))
        : eq(files.userId, uid);

    const rows = await db
      .select({ file: files, drive: driveAccounts })
      .from(files)
      .leftJoin(driveAccounts, eq(files.driveAccountId, driveAccounts.id))
      .where(where)
      .orderBy(desc(files.createdAt))
      .limit(pageSize + 1)
      .offset((page - 1) * pageSize);

    const hasMore = rows.length > pageSize;
    return Response.json({
      ok: true,
      page,
      hasMore,
      items: rows.slice(0, pageSize).map(({ file, drive }) => ({
        ...file,
        driveLabel: drive?.displayName ?? "—",
      })),
    });
  } catch (err) {
    return handleApiError(err);
  }
}
