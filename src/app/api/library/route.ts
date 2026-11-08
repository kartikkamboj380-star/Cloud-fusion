import { and, desc, eq, gte, ilike, lte, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { files, libraryReports, users } from "@/db/schema";
import { handleApiError } from "@/lib/session";

export const dynamic = "force-dynamic";

const CATEGORIES = new Set(["archives", "video", "images", "apps", "docs", "audio", "other"]);

/**
 * Public Library index — shows ONLY files the owner explicitly published.
 * Private/unlisted files never appear here; tokens are never involved.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q")?.trim().slice(0, 120) ?? "";
    const category = searchParams.get("category") ?? "";
    const page = Math.max(1, Number(searchParams.get("page") ?? 1) || 1);
    const pageSize = Math.min(24, Math.max(1, Number(searchParams.get("pageSize") ?? 12) || 12));
    const minSize = Math.max(0, Number(searchParams.get("minSize") ?? 0) || 0);
    const maxSize = Math.max(0, Number(searchParams.get("maxSize") ?? 0) || 0);

    const conds = [eq(files.visibility, "public")];
    if (q) {
      const like = `%${q}%`;
      conds.push(or(ilike(files.name, like), ilike(files.description, like))!);
    }
    if (CATEGORIES.has(category)) conds.push(eq(files.category, category));
    if (minSize > 0) conds.push(gte(files.size, minSize));
    if (maxSize > 0) conds.push(lte(files.size, maxSize));

    const rows = await db
      .select({ file: files, owner: users })
      .from(files)
      .innerJoin(users, eq(files.userId, users.id))
      .where(and(...conds))
      .orderBy(desc(files.publishedAt))
      .limit(pageSize + 1)
      .offset((page - 1) * pageSize);

    const hasMore = rows.length > pageSize;
    const items = rows.slice(0, pageSize).map(({ file, owner }) => ({
      id: file.id,
      name: file.name,
      size: file.size,
      mimeType: file.mimeType,
      category: file.category,
      description: file.description,
      shareSlug: file.shareSlug,
      publicDownloads: file.publicDownloads,
      publishedAt: file.publishedAt,
      uploader: owner.name,
    }));

    const totals = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(files)
      .where(eq(files.visibility, "public"));

    // Moderation transparency note for clients.
    const underReview = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(libraryReports)
      .where(eq(libraryReports.status, "reviewing"));

    return Response.json({ ok: true, items, page, pageSize, hasMore, totalPublic: totals[0].n, underReview: underReview[0].n });
  } catch (err) {
    return handleApiError(err);
  }
}
