import { cookies } from "next/headers";
import crypto from "node:crypto";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import type { User } from "@/db/schema";

const SECRET = process.env.APP_SECRET ?? "cloudfusion-dev-secret-change-me";

export function signUid(uid: string): string {
  return crypto.createHmac("sha256", SECRET).update(uid).digest("hex");
}

export function sessionCookiePayload(uid: string) {
  return { uid, sig: signUid(uid) };
}

export async function getSessionUserId(): Promise<string | null> {
  const store = await cookies();
  const uid = store.get("cf_uid")?.value;
  const sig = store.get("cf_sig")?.value;
  if (!uid || !sig || sig.length !== 64) return null;
  const expected = signUid(uid);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  return uid;
}

export async function getSessionUser(): Promise<User | null> {
  const uid = await getSessionUserId();
  if (!uid) return null;
  const rows = await db.select().from(users).where(eq(users.id, uid)).limit(1);
  return rows[0] ?? null;
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function requireUserId(): Promise<string> {
  const uid = await getSessionUserId();
  if (!uid) throw new ApiError(401, "Authentication required");
  return uid;
}

export function jsonError(status: number, message: string): Response {
  return Response.json({ ok: false, error: message }, { status });
}

export function handleApiError(err: unknown): Response {
  if (err instanceof ApiError) return jsonError(err.status, err.message);
  console.error("[cloudfusion] api error:", err);
  const msg = err instanceof Error ? err.message : "Internal error";
  return jsonError(500, msg.slice(0, 300));
}
