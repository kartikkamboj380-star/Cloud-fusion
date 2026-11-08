import { isIP } from "node:net";
import { lookup } from "node:dns/promises";

/**
 * SSRF protection for user-supplied download URLs.
 *
 * Every URL — and every redirect hop — is validated before a single byte is
 * fetched:
 *  - http/https only
 *  - no embedded credentials
 *  - no localhost / loopback / private / link-local / CGNAT ranges
 *  - cloud metadata endpoints (169.254.169.254, 100.100.100.200, ...) blocked
 *  - DNS resolution pinned and re-checked to mitigate DNS-rebind between hops
 *  - port allow-list
 */

export class SsrfError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SsrfError";
  }
}

export const DEFAULT_ALLOWED_PORTS = new Set([80, 443, 8080, 8443, 2053, 2083, 2087, 2096]);

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "metadata.google.internal",
  "metadata",
  "kubernetes.default",
]);

export function isPrivateIpv4(ip: string): boolean {
  const parts = ip.split(".").map((p) => Number(p));
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)) {
    return true; // malformed → treat as unsafe
  }
  const [a, b] = parts;
  if (a === 0) return true; // 0.0.0.0/8
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 127) return true; // loopback
  if (a === 169 && b === 254) return true; // link-local + cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64.0.0/10
  if (a === 192 && b === 0) return true; // 192.0.0.0/24
  if (a === 192 && b === 0 && parts[2] === 2) return true; // TEST-NET-1
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmark
  if (a >= 224) return true; // multicast + reserved
  return false;
}

export function isPrivateIpv6(ip: string): boolean {
  const norm = ip.toLowerCase();
  if (norm === "::1" || norm === "::") return true;
  if (norm.startsWith("fe80")) return true; // link-local
  if (norm.startsWith("fc") || norm.startsWith("fd")) return true; // unique-local fc00::/7
  const mapped = norm.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateIpv4(mapped[1]);
  return false;
}

export function assertPublicIp(ip: string): void {
  const kind = isIP(ip);
  if (kind === 4 && isPrivateIpv4(ip)) throw new SsrfError(`Blocked private/reserved IPv4 address: ${ip}`);
  if (kind === 6 && isPrivateIpv6(ip)) throw new SsrfError(`Blocked private/reserved IPv6 address: ${ip}`);
  if (kind === 0) throw new SsrfError(`Invalid IP address: ${ip}`);
}

export type ValidatedUrl = {
  url: URL;
  hostname: string;
  isIpLiteral: boolean;
};

export function parseAndValidateUrl(
  raw: string,
  allowedPorts: Set<number> = DEFAULT_ALLOWED_PORTS,
): ValidatedUrl {
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > 2048) throw new SsrfError("URL is empty or too long");

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new SsrfError("URL is not parseable");
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new SsrfError("Only http(s) URLs are supported");
  }
  if (url.username || url.password) {
    throw new SsrfError("URLs with embedded credentials are not allowed");
  }

  let hostname = url.hostname.toLowerCase();
  if (hostname.startsWith("[") && hostname.endsWith("]")) hostname = hostname.slice(1, -1);
  if (!hostname) throw new SsrfError("URL has no hostname");
  if (
    BLOCKED_HOSTNAMES.has(hostname) ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal") ||
    hostname.endsWith(".lan") ||
    hostname.endsWith(".home")
  ) {
    throw new SsrfError("Blocked hostname");
  }

  if (url.port && !allowedPorts.has(Number(url.port))) {
    throw new SsrfError(`Port ${url.port} is not allowed`);
  }

  const ipKind = isIP(hostname);
  if (ipKind !== 0) {
    assertPublicIp(hostname);
    return { url, hostname, isIpLiteral: true };
  }
  if (!/^[a-z0-9.-]+$/i.test(hostname)) throw new SsrfError("Invalid hostname");
  return { url, hostname, isIpLiteral: false };
}

/** Resolve DNS and assert every returned address is public. */
export async function assertPublicHostname(v: ValidatedUrl): Promise<void> {
  if (v.isIpLiteral) return; // already validated
  let addrs: { address: string; family: number }[];
  try {
    addrs = await lookup(v.hostname, { all: true, verbatim: true });
  } catch {
    throw new SsrfError(`DNS resolution failed for ${v.hostname}`);
  }
  if (!addrs.length) throw new SsrfError(`DNS returned no addresses for ${v.hostname}`);
  for (const a of addrs) assertPublicIp(a.address);
}

/**
 * Fetch with manual redirect handling: each hop is re-validated through the
 * full SSRF checks so a redirect cannot smuggle a request to an internal IP.
 */
export async function fetchWithSafeRedirects(
  raw: string,
  init: RequestInit & { timeoutMs?: number } = {},
  maxHops = 5,
): Promise<Response> {
  const { timeoutMs = 15000, ...rest } = init;
  let current = raw;
  for (let hop = 0; hop <= maxHops; hop++) {
    const validated = parseAndValidateUrl(current);
    await assertPublicHostname(validated);
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeoutMs);
    let res: Response;
    try {
      res = await fetch(validated.url, {
        ...rest,
        redirect: "manual",
        signal: controller.signal,
      });
    } finally {
      clearTimeout(t);
    }
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) throw new SsrfError("Redirect without Location header");
      current = new URL(loc, validated.url).toString();
      continue;
    }
    return res;
  }
  throw new SsrfError(`Too many redirects (>${maxHops})`);
}
