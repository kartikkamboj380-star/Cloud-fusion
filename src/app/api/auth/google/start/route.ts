import crypto from "node:crypto";
import { buildAuthUrl, googleOAuthConfigured } from "@/lib/google/drive";
import { jsonError } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Starts the Google OAuth 2.0 flow to connect a Drive account. */
export async function GET() {
  if (!googleOAuthConfigured()) {
    return jsonError(
      400,
      "Google OAuth is not configured. Set GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET (never in source code) or use demo mode.",
    );
  }
  const state = crypto.randomBytes(16).toString("hex");
  const res = new Response(null, { status: 302, headers: { Location: buildAuthUrl(state) } });
  res.headers.append("Set-Cookie", `cf_oauth_state=${state}; HttpOnly; Path=/; SameSite=Lax; Max-Age=600`);
  return res;
}
