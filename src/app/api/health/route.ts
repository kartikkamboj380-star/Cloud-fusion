import { db } from "@/db";
import { sql } from "drizzle-orm";
import { config } from "@/lib/config";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await db.execute(sql`select 1`);
    return Response.json({
      ok: true,
      service: "cloudfusion",
      engine: "online",
      demoMode: config.demoMode,
      googleOAuth: !config.demoMode,
      maxConnections: config.maxConnections,
      ts: Date.now(),
    });
  } catch {
    return Response.json({ ok: false, service: "cloudfusion", engine: "degraded" }, { status: 500 });
  }
}
