import { config } from "@/lib/config";

/**
 * Google Drive API v3 + OAuth 2.0 client.
 *
 * All calls are SERVER-ONLY. Access/refresh tokens live encrypted in the
 * database and are decrypted exclusively by the backend transfer engine.
 * Nothing here ever ships a token — or a file byte — to the phone.
 */

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const API = "https://www.googleapis.com/drive/v3";
const UPLOAD = "https://www.googleapis.com/upload/drive/v3";

export function googleOAuthConfigured(): boolean {
  return Boolean(config.google.clientId && config.google.clientSecret);
}

export function buildAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: config.google.clientId ?? "",
    redirect_uri: `${config.appBaseUrl}/api/auth/google/callback`,
    response_type: "code",
    scope: config.google.scopes,
    access_type: "offline",
    prompt: "consent",
    state,
  });
  return `${AUTH_URL}?${params.toString()}`;
}

export type TokenBundle = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope?: string;
};

export async function exchangeCode(code: string): Promise<TokenBundle> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: config.google.clientId ?? "",
      client_secret: config.google.clientSecret ?? "",
      redirect_uri: `${config.appBaseUrl}/api/auth/google/callback`,
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) throw new Error(`Token exchange failed (${res.status})`);
  return (await res.json()) as TokenBundle;
}

export async function refreshAccessToken(refreshToken: string): Promise<TokenBundle> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: config.google.clientId ?? "",
      client_secret: config.google.clientSecret ?? "",
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new Error(`Token refresh failed (${res.status})`);
  return (await res.json()) as TokenBundle;
}

export type DriveQuota = { total: number; used: number; email: string; displayName: string };

export async function getDriveQuota(accessToken: string): Promise<DriveQuota> {
  const res = await fetch(`${API}/about?fields=user,storageQuota`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`drive.about.get failed (${res.status})`);
  const data = (await res.json()) as {
    user: { emailAddress: string; displayName: string };
    storageQuota: { limit?: string; usage: string };
  };
  return {
    total: data.storageQuota.limit ? Number(data.storageQuota.limit) : 0,
    used: Number(data.storageQuota.usage ?? 0),
    email: data.user.emailAddress,
    displayName: data.user.displayName,
  };
}

/** Start a resumable upload session → returns the session URI. */
export async function createResumableSession(
  accessToken: string,
  meta: { name: string; mimeType: string; size: number },
): Promise<string> {
  const res = await fetch(`${UPLOAD}/files?uploadType=resumable&fields=id`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json; charset=UTF-8",
      "x-upload-content-type": meta.mimeType,
      "x-upload-content-length": String(meta.size),
    },
    body: JSON.stringify({ name: meta.name, mimeType: meta.mimeType }),
  });
  if (!res.ok) throw new Error(`Resumable session init failed (${res.status})`);
  const uri = res.headers.get("location");
  if (!uri) throw new Error("Resumable session missing Location header");
  return uri;
}

/** Upload one byte range of a resumable session. Memory-bounded by the caller. */
export async function uploadRange(
  sessionUri: string,
  body: Uint8Array,
  start: number,
  totalSize: number,
): Promise<{ complete: boolean; fileId?: string }> {
  const end = start + body.byteLength - 1;
  const res = await fetch(sessionUri, {
    method: "PUT",
    headers: { "content-range": `bytes ${start}-${end}/${totalSize}` },
    body: body as BodyInit,
  });
  if (res.status === 308) return { complete: false };
  if (!res.ok) throw new Error(`Chunk upload failed (${res.status})`);
  const json = (await res.json()) as { id?: string };
  return { complete: true, fileId: json.id };
}

/** Make a file world-readable (used ONLY when the owner publishes it). */
export async function grantAnyoneReader(accessToken: string, fileId: string): Promise<string | null> {
  const res = await fetch(`${API}/files/${fileId}/permissions?fields=id`, {
    method: "POST",
    headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
    body: JSON.stringify({ role: "reader", type: "anyone" }),
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { id?: string };
  return json.id ?? null;
}

/** Revoke a permission (used when a public file is made private). */
export async function revokePermission(accessToken: string, fileId: string, permissionId: string): Promise<void> {
  await fetch(`${API}/files/${fileId}/permissions/${permissionId}`, {
    method: "DELETE",
    headers: { authorization: `Bearer ${accessToken}` },
  });
}

/** Server-side cloud-to-cloud copy (no bytes flow through any client). */
export async function copyDriveFile(accessToken: string, fileId: string, name: string): Promise<string> {
  const res = await fetch(`${API}/files/${fileId}/copy?fields=id`, {
    method: "POST",
    headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw new Error(`Drive copy failed (${res.status})`);
  const json = (await res.json()) as { id: string };
  return json.id;
}
