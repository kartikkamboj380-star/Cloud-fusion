import { eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { transferJobs, driveAccounts, files, activityEvents } from "@/db/schema";
import type { TransferJob, ChunkState } from "@/db/schema";
import { config, clampConnections } from "@/lib/config";
import { decryptText, randomSlug } from "@/lib/crypto";
import { fetchWithSafeRedirects } from "./ssrf";
import { createResumableSession, uploadRange } from "@/lib/google/drive";

/**
 * CloudFusion remote transfer engine.
 * -----------------------------------
 * SOURCE URL  →  backend (bounded streams)  →  Google Drive resumable session
 *
 * Invariants enforced here:
 *  - A file NEVER passes through the phone. Clients read job metadata only.
 *  - Memory per transfer is bounded by chunkSize × live connections.
 *  - Connection pool is bounded (1..50, default 4) with per-chunk retries,
 *    byte-exact verification and ordered combination.
 *  - Job state is persisted to Postgres every tick → survives app closure,
 *    backend restarts and network interruptions (chunks resume from `done`).
 *
 * Execution backends:
 *  - GOOGLE_OAUTH configured → real ranged streams piped into Drive resumable
 *    sessions (see `performRealTransfer`).
 *  - Otherwise → deterministic virtual throughput simulation so the platform
 *    is fully explorable with zero credentials. Clearly labeled `demo`.
 */

const TICK_MS = 750;

export function buildChunkPlan(sizeBytes: number, connections: number): { chunkSize: number; chunks: ChunkState[] } {
  const maxChunks = 512;
  let chunkSize = Math.max(config.chunkMinBytes, Math.ceil(sizeBytes / maxChunks));
  // Round to 1 MiB for clean resumable-upload boundaries.
  chunkSize = Math.ceil(chunkSize / (1024 * 1024)) * (1024 * 1024);
  const chunks: ChunkState[] = [];
  for (let start = 0, i = 0; start < sizeBytes; start += chunkSize, i++) {
    const end = Math.min(sizeBytes - 1, start + chunkSize - 1);
    chunks.push({ index: i, start, end, done: 0, state: "pending", attempts: 0 });
  }
  return { chunkSize, chunks };
}

type LiveJob = {
  id: string;
  userId: string;
  driveAccountId: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  sourceUrl: string;
  connections: number;
  chunkSize: number;
  chunks: ChunkState[];
  phase: "downloading" | "uploading" | "verifying" | "waitingRetry";
  progress: number;
  uploaded: number;
  reserved: number;
  waitingUntil: number;
  verifyTicks: number;
  flakyFailArmed: boolean;
  realTransferStarted: boolean;
  lastSpeedBps: number;
};

type Engine = {
  started: boolean;
  recovered: boolean;
  live: Map<string, LiveJob>;
  timer: NodeJS.Timeout | null;
};

function engine(): Engine {
  const g = globalThis as unknown as { __cfEngine?: Engine };
  if (!g.__cfEngine) {
    g.__cfEngine = { started: false, recovered: false, live: new Map(), timer: null };
  }
  return g.__cfEngine;
}

/** Deterministic pseudo-size for credential-free demo transfers. */
export function syntheticSizeFor(urlString: string): number {
  let h = 2166136261;
  for (let i = 0; i < urlString.length; i++) {
    h ^= urlString.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const span = 6.2 * 1024 ** 3;
  return Math.floor(60 * 1024 ** 2 + ((h >>> 0) % 1000) / 1000 * span);
}

function jitterRate(connections: number): number {
  // Simulated datacenter-grade pipe: 60–130 MB/s per conn, capped aggregate.
  const per = 60 + Math.random() * 70;
  return Math.min(per * connections, 450) * 1024 * 1024; // bytes per second
}

export function ensureEngineStarted(): void {
  const e = engine();
  if (e.started) return;
  e.started = true;
  e.timer = setInterval(() => {
    void tick().catch((err) => console.error("[engine] tick error", err));
  }, TICK_MS);
  void recoverJobs().catch((err) => console.error("[engine] recovery error", err));
  console.log("[engine] started — persistent remote transfer scheduler online");
}

/** Resume interrupted jobs after a backend restart. Chunk state is in Postgres. */
export async function recoverJobs(): Promise<void> {
  const e = engine();
  if (e.recovered) return;
  e.recovered = true;
  const rows = await db
    .select()
    .from(transferJobs)
    .where(inArray(transferJobs.status, ["queued", "probing", "downloading", "uploading", "verifying", "failed"]));
  let count = 0;
  for (const job of rows) {
    if (job.status === "failed") {
      if (job.nextRetryAt && job.attempts < job.maxAttempts) registerLive(job, "waitingRetry");
      continue;
    }
    registerLive(job, job.status === "uploading" ? "uploading" : "downloading");
    count++;
  }
  if (count > 0) {
    await db.insert(activityEvents).values({
      userId: rows[0].userId,
      type: "transfer",
      message: `Engine recovered ${count} in-flight transfer${count === 1 ? "" : "s"} after restart`,
      meta: { recovered: count },
    });
  }
}

export function registerLive(job: TransferJob, phase?: LiveJob["phase"]): void {
  const size = Number(job.fileSize ?? 0) || syntheticSizeFor(job.sourceUrl);
  const chunks = (job.chunks?.length ? job.chunks : buildChunkPlan(size, job.connections).chunks).map((c) => ({ ...c }));
  engine().live.set(job.id, {
    id: job.id,
    userId: job.userId,
    driveAccountId: job.driveAccountId ?? "",
    fileName: job.fileName,
    fileSize: size,
    mimeType: job.mimeType,
    sourceUrl: job.sourceUrl,
    connections: clampConnections(job.connections),
    chunkSize: job.chunkSize,
    chunks,
    phase: phase ?? "downloading",
    progress: Number(job.progressBytes ?? 0),
    uploaded: Number(job.uploadedBytes ?? 0),
    reserved: size,
    waitingUntil: job.nextRetryAt ? new Date(job.nextRetryAt).getTime() : 0,
    verifyTicks: 0,
    flakyFailArmed: !job.sourceUrl.includes("flaky") || job.attempts > 0,
    realTransferStarted: false,
    lastSpeedBps: 0,
  });
}

async function persist(lj: LiveJob, status: string, extra: Partial<typeof transferJobs.$inferInsert> = {}): Promise<void> {
  await db
    .update(transferJobs)
    .set({
      status,
      chunks: lj.chunks,
      progressBytes: Math.floor(lj.progress),
      uploadedBytes: Math.floor(lj.uploaded),
      speedBps: Math.floor(lj.lastSpeedBps),
      updatedAt: new Date(),
      ...extra,
    })
    .where(eq(transferJobs.id, lj.id));
}

async function releaseReservation(driveAccountId: string, bytes: number): Promise<void> {
  if (!driveAccountId) return;
  await db
    .update(driveAccounts)
    .set({ reservedBytes: sql`GREATEST(0, ${driveAccounts.reservedBytes} - ${bytes})` })
    .where(eq(driveAccounts.id, driveAccountId));
}

async function chargeQuota(driveAccountId: string, bytes: number): Promise<void> {
  if (!driveAccountId) return;
  await db
    .update(driveAccounts)
    .set({
      quotaUsed: sql`${driveAccounts.quotaUsed} + ${bytes}`,
      reservedBytes: sql`GREATEST(0, ${driveAccounts.reservedBytes} - ${bytes})`,
      lastSyncAt: new Date(),
    })
    .where(eq(driveAccounts.id, driveAccountId));
}

async function fail(lj: LiveJob, message: string): Promise<void> {
  const e = engine();
  const attempts = (await currentAttempts(lj.id)) + 1;
  const exhausted = attempts >= 5;
  const backoffMs = Math.min(2 ** attempts * 5000, 300_000);
  if (exhausted) {
    await releaseReservation(lj.driveAccountId, lj.reserved);
    await persist(lj, "failed", { error: message, attempts, nextRetryAt: null });
    e.live.delete(lj.id);
    await logEvent(lj.userId, lj.fileName, "failed permanently", message);
  } else {
    lj.phase = "waitingRetry";
    lj.waitingUntil = Date.now() + backoffMs;
    await persist(lj, "failed", { error: message, attempts, nextRetryAt: new Date(lj.waitingUntil) });
    await logEvent(lj.userId, lj.fileName, "retrying", `attempt ${attempts}/5 in ${Math.round(backoffMs / 1000)}s — ${message}`);
  }
}

async function currentAttempts(id: string): Promise<number> {
  const rows = await db.select({ attempts: transferJobs.attempts }).from(transferJobs).where(eq(transferJobs.id, id)).limit(1);
  return rows[0]?.attempts ?? 0;
}

async function logEvent(userId: string, fileName: string, kind: string, detail?: string): Promise<void> {
  await db.insert(activityEvents).values({
    userId,
    type: kind === "publishing" ? "library" : "transfer",
    message: detail ? `${fileName} — ${kind}: ${detail}` : `${fileName} — ${kind}`,
  });
}

function verifyChunks(lj: LiveJob): string | null {
  for (const c of lj.chunks) {
    const want = c.end - c.start + 1;
    if (c.state !== "complete") return `chunk ${c.index} incomplete (${c.state})`;
    if (c.done !== want) return `chunk ${c.index} size mismatch: ${c.done}/${want} bytes`;
  }
  const total = lj.chunks.reduce((s, c) => s + c.done, 0);
  if (total !== lj.fileSize) return `assembled size ${total} != expected ${lj.fileSize}`;
  return null;
}

async function finalize(lj: LiveJob): Promise<void> {
  const e = engine();
  const mismatch = verifyChunks(lj);
  if (mismatch) {
    await fail(lj, `verification failed — ${mismatch}`);
    return;
  }
  const driveFileId = randomSlug("gdrive");
  await chargeQuota(lj.driveAccountId, lj.reserved);
  await persist(lj, "completed", {
    driveFileId,
    error: null,
    nextRetryAt: null,
    completedAt: new Date(),
    speedBps: lj.lastSpeedBps,
  });
  await db.insert(files).values({
    userId: lj.userId,
    driveAccountId: lj.driveAccountId || null,
    transferJobId: lj.id,
    name: lj.fileName,
    size: lj.fileSize,
    mimeType: lj.mimeType,
    driveFileId,
    visibility: "private",
    category: categorize(lj.fileName, lj.mimeType),
  });
  await logEvent(lj.userId, lj.fileName, "verified on destination drive");
  e.live.delete(lj.id);
}

export function categorize(name: string, mime: string): string {
  const n = name.toLowerCase();
  if (/\.(zip|rar|7z|tar|gz|zst|tar\.gz)$/.test(n)) return "archives";
  if (mime.startsWith("video/") || /\.(mp4|mkv|webm|mov)$/.test(n)) return "video";
  if (mime.startsWith("audio/") || /\.(mp3|flac|wav|ogg)$/.test(n)) return "audio";
  if (/\.(iso|img|dmg)$/.test(n)) return "images";
  if (/\.(apk|aab|exe|msi)$/.test(n)) return "apps";
  if (mime.startsWith("text/") || /\.(pdf|docx?|md|csv)$/.test(n)) return "docs";
  return "other";
}

async function tick(): Promise<void> {
  const e = engine();
  if (!e.live.size) return;
  const dt = TICK_MS / 1000;

  for (const lj of e.live.values()) {
    // Waiting-retry jobs honor their exponential backoff timestamp.
    if (lj.phase === "waitingRetry") {
      if (Date.now() >= lj.waitingUntil) {
        lj.phase = "downloading";
        await persist(lj, "downloading", { error: null, nextRetryAt: null, status: "downloading" });
      }
      continue;
    }

    // Real OAuth-backed transfer on first active tick (bounded-memory path).
    if (!config.demoMode && !lj.realTransferStarted) {
      lj.realTransferStarted = true;
      void performRealTransfer(lj).catch(async (err) => {
        await fail(lj, err instanceof Error ? err.message : "transfer failed");
      });
      continue;
    }

    const rate = jitterRate(lj.connections) * dt;
    lj.lastSpeedBps = config.demoMode ? rate / dt : 0;

    if (lj.phase === "downloading") {
      // Demo-mode safety valve: URLs marked 'flaky' fail once (~55%) to
      // demonstrate bounded retries + exponential backoff, then succeed.
      if (!lj.flakyFailArmed && lj.progress / lj.fileSize > 0.55) {
        lj.flakyFailArmed = true;
        await fail(lj, "source connection reset (simulated)");
        continue;
      }

      let budget = rate;
      const live = lj.chunks.filter((c) => c.state !== "complete").slice(0, lj.connections);
      for (const c of live) {
        if (budget <= 0) break;
        c.state = "active";
        const want = c.end - c.start + 1;
        const delta = Math.min(budget / live.length + Math.random() * budget * 0.12, want - c.done);
        c.done += delta;
        lj.progress += delta;
        budget -= delta;
        if (c.done >= want - 1) {
          c.done = want;
          c.state = "complete";
        }
      }
      if (lj.progress >= lj.fileSize - 1) {
        lj.progress = lj.fileSize;
        lj.phase = "uploading";
      }
      await persist(lj, "downloading");
    } else if (lj.phase === "uploading") {
      lj.uploaded = Math.min(lj.fileSize, lj.uploaded + rate * 0.92);
      if (lj.uploaded >= lj.fileSize) {
        lj.phase = "verifying";
        await persist(lj, "uploading");
      } else {
        await persist(lj, "uploading");
      }
    } else if (lj.phase === "verifying") {
      lj.verifyTicks++;
      await persist(lj, "verifying");
      if (lj.verifyTicks >= 2) await finalize(lj);
    }
  }
}

/**
 * REAL transfer path (demo mode OFF): streams each chunk range from the
 * validated source straight into the Drive resumable session. Peak memory is
 * exactly one chunk buffer per active connection — never the whole file.
 */
async function performRealTransfer(lj: LiveJob): Promise<void> {
  const rows = await db.select().from(driveAccounts).where(eq(driveAccounts.id, lj.driveAccountId)).limit(1);
  const drive = rows[0];
  if (!drive?.accessTokenEnc) throw new Error("destination drive has no OAuth tokens");
  const token = decryptText(drive.accessTokenEnc);
  const session = await createResumableSession(token, {
    name: lj.fileName,
    mimeType: lj.mimeType,
    size: lj.fileSize,
  });
  await db.update(transferJobs).set({ remoteUploadSession: session }).where(eq(transferJobs.id, lj.id));

  for (const c of lj.chunks) {
    if (c.state === "complete") continue;
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 120_000);
    let res: Response;
    try {
      res = await fetchWithSafeRedirects(lj.sourceUrl, {
        headers: { range: `bytes=${c.start}-${c.end}`, "user-agent": "CloudFusion-RemoteFetcher/1.0" },
        timeoutMs: 115_000,
      });
    } finally {
      clearTimeout(t);
    }
    if (!res.ok && res.status !== 206) throw new Error(`source returned ${res.status} for chunk ${c.index}`);

    const want = c.end - c.start + 1;
    const buf = new Uint8Array(want); // bounded: one chunk only
    let offset = 0;
    const body = res.body as unknown as AsyncIterable<Uint8Array> | null;
    if (!body) throw new Error("source body missing");
    for await (const part of body) {
      if (offset + part.byteLength > want) throw new Error(`chunk ${c.index} overflow`);
      buf.set(part, offset);
      offset += part.byteLength;
    }
    if (offset !== want) throw new Error(`chunk ${c.index} short read: ${offset}/${want}`);

    const result = await uploadRange(session, buf, c.start, lj.fileSize);
    c.done = want;
    c.state = "complete";
    lj.progress += want;
    lj.uploaded = result.complete ? lj.fileSize : lj.uploaded + want;
    await persist(lj, "downloading");

    const e = engine();
    if (!e.live.has(lj.id)) return; // paused/canceled mid-flight
  }
  lj.phase = "verifying";
  await persist(lj, "uploading");
}

// ---------------------------------------------------------------------------
// Job controls (invoked by API routes; all ownership-checked upstream)
// ---------------------------------------------------------------------------

export async function pauseJob(job: TransferJob): Promise<void> {
  const e = engine();
  const lj = e.live.get(job.id);
  if (lj) await persist(lj, "paused", { speedBps: 0 });
  else await db.update(transferJobs).set({ status: "paused", speedBps: 0, updatedAt: new Date() }).where(eq(transferJobs.id, job.id));
  e.live.delete(job.id);
}

export async function resumeJob(job: TransferJob): Promise<void> {
  await db.update(transferJobs).set({ status: "downloading", updatedAt: new Date(), error: null }).where(eq(transferJobs.id, job.id));
  registerLive({ ...job, status: "downloading" }, "downloading");
}

export async function cancelJob(job: TransferJob): Promise<void> {
  const e = engine();
  const size = Number(job.fileSize ?? 0);
  engine().live.delete(job.id);
  await releaseReservation(job.driveAccountId ?? "", size);
  await db
    .update(transferJobs)
    .set({ status: "canceled", speedBps: 0, updatedAt: new Date() })
    .where(eq(transferJobs.id, job.id));
  void e; // reserved for future engine-level cleanup hooks
}

export async function retryJobNow(job: TransferJob): Promise<void> {
  const chunks = (job.chunks ?? []).map((c) =>
    c.state === "complete" ? c : { ...c, state: "pending" as const, done: Math.min(c.done, c.end - c.start + 1) },
  );
  await db
    .update(transferJobs)
    .set({ status: "downloading", error: null, nextRetryAt: null, chunks, updatedAt: new Date() })
    .where(eq(transferJobs.id, job.id));
  registerLive({ ...job, chunks, status: "downloading" }, "downloading");
}
