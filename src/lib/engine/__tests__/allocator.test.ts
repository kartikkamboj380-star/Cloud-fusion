import { test } from "node:test";
import assert from "node:assert/strict";
import { allocateDrive, effectiveFree, poolTotals, type AllocationCandidate } from "../allocator.js";

const GB = 1024 ** 3;

function drive(id: string, used: number, reserved = 0, status = "connected"): AllocationCandidate {
  return { id, displayName: id, status, quotaTotal: 15 * GB, quotaUsed: used, reservedBytes: reserved };
}

test("picks the fitting drive with the most effective free space", () => {
  const pool = [drive("A", 5 * GB), drive("B", 3 * GB), drive("C", 7 * GB), drive("D", 0)];
  const picked = allocateDrive(pool, 9 * GB);
  assert.equal(picked?.id, "D");
});

test("honors logical reservations held by active jobs", () => {
  const pool = [drive("A", 0, 12 * GB), drive("B", 2 * GB)];
  const picked = allocateDrive(pool, 10 * GB);
  assert.equal(picked?.id, "B");
  assert.equal(effectiveFree(pool[0]), 3 * GB);
});

test("returns null when no single account can hold the file", () => {
  const pool = [drive("A", 14 * GB), drive("B", 14.5 * GB)];
  assert.equal(allocateDrive(pool, 2 * GB), null);
});

test("ignores revoked or errored accounts", () => {
  // Revoked A has 15 GB free but must be skipped → B (1 GB free) wins.
  const pool = [drive("A", 0, 0, "revoked"), drive("B", 14 * GB)];
  assert.equal(allocateDrive(pool, 0.5 * GB)?.id, "B");
  // Only the revoked drive could fit 10 GB → allocation fails cleanly.
  assert.equal(allocateDrive(pool, 10 * GB), null);
});

test("pool totals sum correctly (spec example: 45 GB available)", () => {
  const pool = [drive("A", 5 * GB), drive("B", 3 * GB), drive("C", 7 * GB), drive("D", 0)];
  const t = poolTotals(pool);
  assert.equal(t.total, 60 * GB);
  assert.equal(t.used, 15 * GB);
  assert.equal(t.available, 45 * GB);
});
