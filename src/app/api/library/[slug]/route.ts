import { eq } from "drizzle-orm";
import { db } from "@/db";
import { files, users } from "@/db/schema";
import { handleApiError, jsonError } from "@/lib/session";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ slug: string }> };

/** Public share-page payload. Private files are invisible (404) — never leaked. */
export async function GET(_req: Request, ctx: Ctx) {
  try {
    const { slug } = await ctx.params;
    const rows = await db
      .select({ file: files, owner: users })
      .from(files)
      .innerJoin(users, eq(files.userId, users.id))
      .where(eq(files.shareSlug, slug))
      .limit(1);
    const row = rows[0];
    if (!row || !["public", "unlisted"].includes(row.file.visibility)) {
      return jsonError(404, "File not found");
    }
    const { file, owner } = row;
    return Response.json({
      ok: true,
      item: {
        name: file.name,
        size: file.size,
        mimeType: file.mimeType,
        category: file.category,
        description: file.description,
        visibility: file.visibility,
        publicDownloads: file.publicDownloads,
        publishedAt: file.publishedAt,
        uploader: owner.name,
      },
    });
  } catch (err) {
    return handleApiError(err);
  }
}
