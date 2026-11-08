import { db } from "@/db";
import { users, driveAccounts, files, transferJobs, activityEvents, libraryReports } from "@/db/schema";
import { eq } from "drizzle-orm";
import { randomSlug } from "@/lib/crypto";

const GB = 1024 ** 3;
const MB = 1024 ** 2;

export const DEMO_EMAIL = "demo@cloudfusion.app";

let seeded = false;

/**
 * Idempotent demo bootstrap. Mirrors the spec's pool example:
 * Drive A 10 GB free + Drive B 12 GB + Drive C 8 GB + Drive D 15 GB
 * = 45 GB pooled available storage.
 */
export async function ensureDemoData(): Promise<void> {
  if (seeded) return;
  try {
    const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, DEMO_EMAIL)).limit(1);
    if (existing.length > 0) {
      seeded = true;
      return;
    }

    const [ari] = await db
      .insert(users)
      .values({ name: "Ari Vale", email: DEMO_EMAIL, avatarHue: 190 })
      .returning();
    const [mira] = await db
      .insert(users)
      .values({ name: "Mira Chen", email: "mira@cloudfusion.app", avatarHue: 280 })
      .returning();

    // Four drives → 45 GB total available (10 + 12 + 8 + 15)
    const spec: Array<[string, string, number, number, number]> = [
      ["ari.vale@gmail.com", "Drive A · ari.vale", 15 * GB, 5 * GB, 190],
      ["ari.work@gmail.com", "Drive B · ari.work", 15 * GB, 3 * GB, 262],
      ["archive.ari@gmail.com", "Drive C · archive.ari", 15 * GB, 7 * GB, 330],
      ["vault.ari@gmail.com", "Drive D · vault.ari", 15 * GB, 0, 24],
    ];
    const drives = [];
    for (const [email, label, total, used] of spec) {
      const [d] = await db
        .insert(driveAccounts)
        .values({
          userId: ari.id,
          email,
          displayName: label,
          status: "demo",
          quotaTotal: total,
          quotaUsed: used,
          scopes: "openid email drive.file",
        })
        .returning();
      drives.push(d);
    }

    const mkSlug = () => randomSlug("cf");
    const now = Date.now();

    const publicFiles = [
      { owner: ari, drive: drives[3], name: "aurora-4k-wallpaper-pack.zip", size: 2.41 * GB, mime: "application/zip", cat: "archives", desc: "120 hand-graded aurora wallpapers, 4K and ultrawide crops.", dl: 1840 },
      { owner: ari, drive: drives[2], name: "openreel-documentary-1080p.mp4", size: 3.2 * GB, mime: "video/mp4", cat: "video", desc: "CC-BY short documentary: the last lighthouse keepers.", dl: 942 },
      { owner: mira, drive: null, name: "pixelbench-benchmark-suite.apk", size: 84 * MB, mime: "application/vnd.android.package-archive", cat: "apps", desc: "Open-source GPU/CPU benchmark for low-RAM Android devices.", dl: 5210 },
      { owner: mira, drive: null, name: "field-notes-compendium.pdf", size: 42 * MB, mime: "application/pdf", cat: "docs", desc: "300 pages of scanned 1960s botanical field notes (public domain).", dl: 388 },
      { owner: ari, drive: drives[0], name: "synthwave-sample-pack.zip", size: 640 * MB, mime: "application/zip", cat: "audio", desc: "480 royalty-free synthwave loops and one-shots, 24-bit WAV.", dl: 2761 },
      { owner: ari, drive: drives[1], name: "cloudfusion-research-dataset.csv.zst", size: 1.1 * GB, mime: "application/zstd", cat: "archives", desc: "Anonymized transfer telemetry dataset for research use.", dl: 156 },
      { owner: mira, drive: null, name: "lumen-game-demo-build.apk", size: 212 * MB, mime: "application/vnd.android.package-archive", cat: "apps", desc: "Free demo of the indie puzzler Lumen. Runs on 3 GB RAM devices.", dl: 1204 },
      { owner: ari, drive: drives[3], name: "orbit-renders-blender-scenes.zip", size: 5.6 * GB, mime: "application/zip", cat: "archives", desc: "Full Blender scene files for the Orbit short film (CC-BY-NC).", dl: 690 },
    ];

    for (const [i, f] of publicFiles.entries()) {
      await db.insert(files).values({
        userId: f.owner.id,
        driveAccountId: f.drive?.id ?? null,
        name: f.name,
        size: Math.floor(f.size),
        mimeType: f.mime,
        category: f.cat,
        description: f.desc,
        visibility: "public",
        shareSlug: mkSlug(),
        publicDownloads: f.dl,
        createdAt: new Date(now - (i + 2) * 86400000),
        publishedAt: new Date(now - (i + 2) * 86400000),
      });
    }

    // Unlisted + private examples
    await db.insert(files).values({
      userId: ari.id, driveAccountId: drives[1].id, name: "ubuntu-24.04.3-live-server-amd64.iso",
      size: Math.floor(2.9 * GB), mimeType: "application/x-iso9660-image", category: "images",
      visibility: "unlisted", shareSlug: mkSlug(), createdAt: new Date(now - 86400000),
    });
    await db.insert(files).values([
      { userId: ari.id, driveAccountId: drives[0].id, name: "tax-records-2025.zip", size: Math.floor(310 * MB), mimeType: "application/zip", category: "docs" },
      { userId: ari.id, driveAccountId: drives[2].id, name: "family-archive-2019-2024.zip", size: Math.floor(4.4 * GB), mimeType: "application/zip", category: "archives" },
    ]);

    // Transfer history
    const completed = [
      { name: "synthwave-sample-pack.zip", size: Math.floor(640 * MB), drive: drives[0], hoursAgo: 30, secs: 214 },
      { name: "ubuntu-24.04.3-live-server-amd64.iso", size: Math.floor(2.9 * GB), drive: drives[1], hoursAgo: 26, secs: 912 },
      { name: "orbit-renders-blender-scenes.zip", size: Math.floor(5.6 * GB), drive: drives[3], hoursAgo: 6, secs: 1833 },
    ];
    for (const c of completed) {
      await db.insert(transferJobs).values({
        userId: ari.id,
        driveAccountId: c.drive.id,
        sourceUrl: `https://releases.cdn.example.org/${c.name}`,
        fileName: c.name,
        fileSize: c.size,
        mimeType: "application/octet-stream",
        status: "completed",
        progressBytes: c.size,
        uploadedBytes: c.size,
        rangeSupported: true,
        connections: 8,
        driveFileId: randomSlug("gdrive"),
        createdAt: new Date(now - c.hoursAgo * 3600000),
        updatedAt: new Date(now - c.hoursAgo * 3600000 + c.secs * 1000),
        completedAt: new Date(now - c.hoursAgo * 3600000 + c.secs * 1000),
      });
    }

    await db.insert(libraryReports).values({
      fileId: (await db.select({ id: files.id }).from(files).where(eq(files.name, "pixelbench-benchmark-suite.apk")))[0].id,
      reporter: "rights-desk@example.org",
      reason: "copyright",
      details: "Claim: APK embeds proprietary CPU microcode tables. Under review per takedown policy.",
      status: "reviewing",
    });

    await db.insert(activityEvents).values([
      { userId: ari.id, type: "library", message: "orbit-renders-blender-scenes.zip published to Public Library" },
      { userId: ari.id, type: "transfer", message: "orbit-renders-blender-scenes.zip verified on Drive D · vault.ari", meta: { bytes: Math.floor(5.6 * GB) } },
      { userId: ari.id, type: "drive", message: "Pool synced — 45 GB available across 4 drives" },
      { userId: ari.id, type: "security", message: "SSRF guard blocked redirect to 169.254.169.254", meta: { blocked: true } },
    ].map((e, i) => ({ ...e, createdAt: new Date(now - i * 5400000) })));

    seeded = true;
  } catch (err) {
    // DB might not be migrated yet — pages must still render.
    console.warn("[cloudfusion] seed skipped:", err instanceof Error ? err.message : err);
  }
}
