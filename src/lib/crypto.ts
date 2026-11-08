import crypto from "node:crypto";

/**
 * AES-256-GCM encryption for OAuth tokens at rest.
 * Keys come ONLY from environment variables. Tokens are never logged and
 * never included in any API response.
 */

const KEY = crypto
  .createHash("sha256")
  .update(
    process.env.TOKEN_ENCRYPTION_KEY ??
      process.env.APP_SECRET ??
      "cloudfusion-dev-encryption-key-change-me",
  )
  .digest();

export function encryptText(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", KEY, iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ct]).toString("base64url");
}

export function decryptText(enc: string): string {
  const raw = Buffer.from(enc, "base64url");
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const ct = raw.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", KEY, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
}

export function randomSlug(prefix = "cf"): string {
  return `${prefix}-${crypto.randomBytes(6).toString("hex")}`;
}
