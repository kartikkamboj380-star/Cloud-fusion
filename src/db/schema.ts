import {
  pgTable,
  uuid,
  text,
  integer,
  bigint,
  boolean,
  timestamp,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import type { InferSelectModel, InferInsertModel } from "drizzle-orm";

/**
 * CloudFusion schema
 * ------------------
 * The Android / web client NEVER sees file bytes. The database only stores
 * metadata, job state, chunk plans and quota accounting for the remote
 * transfer engine running on the backend.
 */

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  avatarHue: integer("avatar_hue").notNull().default(200),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const driveAccounts = pgTable(
  "drive_accounts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: text("provider").notNull().default("google"),
    email: text("email").notNull(),
    displayName: text("display_name").notNull(),
    status: text("status").notNull().default("connected"), // connected | error | revoked | demo
    quotaTotal: bigint("quota_total", { mode: "number" }).notNull().default(0),
    quotaUsed: bigint("quota_used", { mode: "number" }).notNull().default(0),
    // Logical reservation held by active jobs so two jobs cannot over-commit
    // the same account. Quota updates are applied when a file is finalized.
    reservedBytes: bigint("reserved_bytes", { mode: "number" }).notNull().default(0),
    // OAuth tokens are AES-256-GCM encrypted at rest. They are NEVER sent to
    // any client — only the backend transfer engine may decrypt them.
    accessTokenEnc: text("access_token_enc"),
    refreshTokenEnc: text("refresh_token_enc"),
    tokenExpiry: timestamp("token_expiry", { withTimezone: true }),
    scopes: text("scopes"),
    connectedAt: timestamp("connected_at", { withTimezone: true }).notNull().defaultNow(),
    lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
  },
  (t) => [index("drive_accounts_user_idx").on(t.userId)],
);

/** Per-chunk state of the adaptive parallel download engine (max 50 conns). */
export type ChunkState = {
  index: number;
  start: number;
  end: number; // inclusive
  done: number; // bytes persisted remotely for this chunk
  state: "pending" | "active" | "complete" | "failed";
  attempts: number;
};

export const transferJobs = pgTable(
  "transfer_jobs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    driveAccountId: uuid("drive_account_id").references(() => driveAccounts.id, {
      onDelete: "set null",
    }),
    sourceUrl: text("source_url").notNull(),
    fileName: text("file_name").notNull(),
    fileSize: bigint("file_size", { mode: "number" }),
    mimeType: text("mime_type").notNull().default("application/octet-stream"),
    // queued | probing | allocating | downloading | paused | uploading |
    // verifying | completed | failed | canceled
    status: text("status").notNull().default("queued"),
    progressBytes: bigint("progress_bytes", { mode: "number" }).notNull().default(0),
    uploadedBytes: bigint("uploaded_bytes", { mode: "number" }).notNull().default(0),
    speedBps: bigint("speed_bps", { mode: "number" }).notNull().default(0),
    connections: integer("connections").notNull().default(4), // 1..50
    rangeSupported: boolean("range_supported").notNull().default(false),
    chunkSize: integer("chunk_size").notNull().default(8 * 1024 * 1024),
    chunks: jsonb("chunks").$type<ChunkState[]>().notNull().default([]),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(5),
    nextRetryAt: timestamp("next_retry_at", { withTimezone: true }),
    error: text("error"),
    driveFileId: text("drive_file_id"),
    remoteUploadSession: text("remote_upload_session"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [index("transfer_jobs_user_idx").on(t.userId), index("transfer_jobs_status_idx").on(t.status)],
);

export const files = pgTable(
  "files",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    driveAccountId: uuid("drive_account_id").references(() => driveAccounts.id, {
      onDelete: "set null",
    }),
    transferJobId: uuid("transfer_job_id").references(() => transferJobs.id, {
      onDelete: "set null",
    }),
    name: text("name").notNull(),
    size: bigint("size", { mode: "number" }).notNull().default(0),
    mimeType: text("mime_type").notNull().default("application/octet-stream"),
    category: text("category").notNull().default("other"), // archives | video | images | apps | docs | audio | other
    driveFileId: text("drive_file_id"),
    visibility: text("visibility").notNull().default("private"), // private | unlisted | public
    description: text("description"),
    shareSlug: text("share_slug").unique(),
    publicDownloads: integer("public_downloads").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
  },
  (t) => [
    index("files_user_idx").on(t.userId),
    index("files_visibility_idx").on(t.visibility),
    index("files_category_idx").on(t.category),
  ],
);

export const libraryReports = pgTable("library_reports", {
  id: uuid("id").defaultRandom().primaryKey(),
  fileId: uuid("file_id")
    .notNull()
    .references(() => files.id, { onDelete: "cascade" }),
  reporter: text("reporter"),
  reason: text("reason").notNull(), // copyright | illegal | malware | privacy | other
  details: text("details"),
  status: text("status").notNull().default("open"), // open | reviewing | resolved | removed
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const activityEvents = pgTable(
  "activity_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(), // transfer | drive | file | library | security
    message: text("message").notNull(),
    meta: jsonb("meta").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("activity_events_user_idx").on(t.userId)],
);

export type User = InferSelectModel<typeof users>;
export type DriveAccount = InferSelectModel<typeof driveAccounts>;
export type TransferJob = InferSelectModel<typeof transferJobs>;
export type CloudFile = InferSelectModel<typeof files>;
export type LibraryReport = InferSelectModel<typeof libraryReports>;
export type ActivityEvent = InferSelectModel<typeof activityEvents>;
export type NewTransferJob = InferInsertModel<typeof transferJobs>;
