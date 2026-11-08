/**
 * Smart storage allocation for the virtual pool.
 * Picks the destination drive for a single file among connected accounts.
 * Files are NEVER split across accounts — a file lands on exactly one drive.
 */

export type AllocationCandidate = {
  id: string;
  displayName: string;
  status: string;
  quotaTotal: number;
  quotaUsed: number;
  reservedBytes: number;
};

export function effectiveFree(d: AllocationCandidate): number {
  return Math.max(0, d.quotaTotal - d.quotaUsed - d.reservedBytes);
}

export function isAllocatable(d: AllocationCandidate): boolean {
  return d.status === "connected" || d.status === "demo";
}

/**
 * Strategy "largest-free": among accounts that can hold the whole file, pick
 * the one with the most effective free space (least fragmentation pressure).
 * Returns null when no single account fits → caller must surface a clear error.
 */
export function allocateDrive(
  drives: AllocationCandidate[],
  sizeBytes: number | null,
): AllocationCandidate | null {
  const candidates = drives.filter(isAllocatable);
  if (!candidates.length) return null;
  const needed = sizeBytes ?? 0;
  const fitting = candidates.filter((d) => effectiveFree(d) >= needed);
  if (!fitting.length) return null;
  return fitting.sort((a, b) => effectiveFree(b) - effectiveFree(a))[0];
}

export type PoolTotals = {
  total: number;
  used: number;
  reserved: number;
  available: number;
};

export function poolTotals(drives: AllocationCandidate[]): PoolTotals {
  const total = drives.reduce((s, d) => s + d.quotaTotal, 0);
  const used = drives.reduce((s, d) => s + d.quotaUsed, 0);
  const reserved = drives.reduce((s, d) => s + d.reservedBytes, 0);
  return { total, used, reserved, available: Math.max(0, total - used - reserved) };
}
