import type { TransferJob } from "@/db/schema";

/** Canonical job shape sent to clients — metadata only, never file bytes. */
export function serializeJob(job: TransferJob) {
  return {
    id: job.id,
    sourceUrl: job.sourceUrl,
    fileName: job.fileName,
    fileSize: job.fileSize ?? null,
    mimeType: job.mimeType,
    status: job.status,
    progressBytes: Number(job.progressBytes),
    uploadedBytes: Number(job.uploadedBytes),
    speedBps: Number(job.speedBps),
    connections: job.connections,
    rangeSupported: job.rangeSupported,
    chunkCount: job.chunks?.length ?? 0,
    chunksDone: (job.chunks ?? []).filter((c) => c.state === "complete").length,
    attempts: job.attempts,
    error: job.error,
    nextRetryAt: job.nextRetryAt,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    completedAt: job.completedAt,
    driveFileId: job.driveFileId,
  };
}

export type SerializedJob = ReturnType<typeof serializeJob>;
