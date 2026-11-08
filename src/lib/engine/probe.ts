import path from "node:path";
import { fetchWithSafeRedirects } from "./ssrf";
import { config } from "@/lib/config";

export type ProbeResult = {
  finalUrl: string;
  fileName: string;
  fileSize: number | null;
  mimeType: string;
  rangeSupported: boolean;
  /** Source demanded login/cookies — we do NOT bypass access controls. */
  authRequired: boolean;
};

function filenameFromDisposition(cd: string | null): string | null {
  if (!cd) return null;
  const star = cd.match(/filename\*\s*=\s*(?:UTF-8'')?([^;]+)/i);
  if (star) {
    try {
      return path.basename(decodeURIComponent(star[1].trim().replace(/^"|"$/g, "")));
    } catch {
      /* fall through */
    }
  }
  const plain = cd.match(/filename\s*=\s*"?([^";]+)"?/i);
  if (plain) return path.basename(plain[1].trim());
  return null;
}

function filenameFromUrl(url: string): string {
  try {
    const base = path.basename(new URL(url).pathname);
    return decodeURIComponent(base || "download.bin");
  } catch {
    return "download.bin";
  }
}

function looksLikeHtmlGate(mime: string, _status: number): boolean {
  return mime.includes("text/html"); // 200-OK login/CAPTCHA interstitial
}

/**
 * Inspect a direct-download URL without downloading the payload.
 * HEAD first; falls back to a 1-byte ranged GET when HEAD is refused.
 */
export async function probeUrl(rawUrl: string): Promise<ProbeResult> {
  let res = await fetchWithSafeRedirects(rawUrl, {
    method: "HEAD",
    timeoutMs: config.probeTimeoutMs,
    headers: { "user-agent": "CloudFusion-RemoteFetcher/1.0" },
  });

  if (res.status === 405 || res.status === 501 || !res.headers.get("content-length")) {
    // HEAD unsupported → ranged GET of a single byte, then abort the body.
    const ranged = await fetchWithSafeRedirects(rawUrl, {
      method: "GET",
      timeoutMs: config.probeTimeoutMs,
      headers: { "user-agent": "CloudFusion-RemoteFetcher/1.0", range: "bytes=0-0" },
    });
    void ranged.body?.cancel().catch(() => undefined);
    res = ranged;
  }

  if (res.status === 401 || res.status === 403) {
    return {
      finalUrl: rawUrl,
      fileName: filenameFromUrl(rawUrl),
      fileSize: null,
      mimeType: res.headers.get("content-type")?.split(";")[0]?.trim() ?? "application/octet-stream",
      rangeSupported: false,
      authRequired: true,
    };
  }
  if (res.status >= 400) {
    throw new Error(`source responded HTTP ${res.status}`);
  }

  const mime = res.headers.get("content-type")?.split(";")[0]?.trim() ?? "application/octet-stream";
  if (looksLikeHtmlGate(mime, res.status)) {
    return {
      finalUrl: rawUrl,
      fileName: filenameFromUrl(rawUrl),
      fileSize: null,
      mimeType: mime,
      rangeSupported: false,
      authRequired: true,
    };
  }

  let size: number | null = null;
  const len = res.headers.get("content-length");
  const rangeHeader = res.headers.get("content-range");
  if (rangeHeader) {
    const total = rangeHeader.match(/\/(\d+)\s*$/)?.[1];
    if (total) size = Number(total);
  } else if (len && /^\d+$/.test(len)) {
    size = Number(len);
  }

  const acceptRanges = (res.headers.get("accept-ranges") ?? "").toLowerCase();
  const rangeSupported = acceptRanges.includes("bytes") || Boolean(rangeHeader);

  return {
    finalUrl: rawUrl,
    fileName: filenameFromDisposition(res.headers.get("content-disposition")) ?? filenameFromUrl(rawUrl),
    fileSize: size && size > 0 ? size : null,
    mimeType: mime,
    rangeSupported,
    authRequired: false,
  };
}
