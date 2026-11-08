import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { activityEvents } from "@/db/schema";
import { requireUserId, handleApiError } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const uid = await requireUserId();
    const rows = await db
      .select()
      .from(activityEvents)
      .where(eq(activityEvents.userId, uid))
      .orderBy(desc(activityEvents.createdAt))
      .limit(12);
    return Response.json({ ok: true, events: rows });
  } catch (err) {
    return handleApiError(err);
  }
}
