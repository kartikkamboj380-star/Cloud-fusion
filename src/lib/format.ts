import clsx, { type ClassValue } from "clsx";

export const cn = (...args: ClassValue[]) => clsx(...args);

export function fmtBytes(n: number | null | undefined, digits = 1): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  if (n >= 1024 ** 4) return `${(n / 1024 ** 4).toFixed(2)} TB`;
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(digits)} GB`;
  if (n >= 1024 ** 2) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  if (n >= 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${Math.floor(n)} B`;
}

export function fmtSpeed(bps: number | null | undefined): string {
  if (!bps || bps <= 0) return "0 MB/s";
  if (bps >= 1024 ** 3) return `${(bps / 1024 ** 3).toFixed(2)} GB/s`;
  return `${(bps / 1024 ** 2).toFixed(1)} MB/s`;
}

export function fmtPct(part: number, total: number | null | undefined): string {
  if (!total || total <= 0) return "0";
  return Math.min(100, (part / total) * 100).toFixed(1);
}

export function timeAgo(iso: string | Date | null | undefined): string {
  if (!iso) return "—";
  const t = typeof iso === "string" ? new Date(iso) : iso;
  const s = Math.max(0, (Date.now() - t.getTime()) / 1000);
  if (s < 10) return "just now";
  if (s < 60) return `${Math.floor(s)}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "—";
  }
}

export function categoryIconName(category: string): string {
  return category;
}
