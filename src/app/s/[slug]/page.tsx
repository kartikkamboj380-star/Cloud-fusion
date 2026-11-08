import { notFound } from "next/navigation";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { CloudLightning, DownloadCloud, HardDrive, ShieldCheck, User } from "lucide-react";
import { db } from "@/db";
import { files, users } from "@/db/schema";
import { getSessionUserId } from "@/lib/session";
import { fmtBytes, timeAgo } from "@/lib/format";
import ShareActions from "./share-actions";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ slug: string }> };

export async function generateMetadata(ctx: Ctx) {
  const { slug } = await ctx.params;
  const rows = await db.select({ name: files.name }).from(files).where(eq(files.shareSlug, slug)).limit(1);
  return { title: rows[0] ? `${rows[0].name} — CloudFusion` : "CloudFusion Share" };
}

/** Public share landing. Private files 404 — existence is never leaked. */
export default async function SharePage(ctx: Ctx) {
  const { slug } = await ctx.params;
  const rows = await db
    .select({ file: files, owner: users })
    .from(files)
    .innerJoin(users, eq(files.userId, users.id))
    .where(eq(files.shareSlug, slug))
    .limit(1);
  const row = rows[0];
  if (!row || row.file.visibility === "private") notFound();

  const authed = Boolean(await getSessionUserId());
  const { file, owner } = row;

  return (
    <div className="relative min-h-dvh overflow-hidden">
      <div className="grid-bg absolute inset-0 -z-10" />
      <div className="glow-orb -z-10 w-[500px] h-[500px] -top-32 left-[20%]" style={{ background: "rgba(139,92,246,0.13)" }} />
      <div className="glow-orb -z-10 w-[420px] h-[420px] bottom-[-10%] right-[10%]" style={{ background: "rgba(56,225,255,0.10)" }} />

      <header className="max-w-3xl mx-auto flex items-center justify-between px-5 py-5">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="grid place-items-center w-9 h-9 rounded-xl border border-[var(--line)] bg-[var(--bg2)]">
            <CloudLightning size={17} className="text-[var(--cyan)]" />
          </span>
          <span className="font-extrabold tracking-tight text-[17px]">Cloud<span className="grad-text">Fusion</span></span>
        </Link>
        <span className="chip"><ShieldCheck size={11} className="text-[var(--lime)]" /> ZERO-LOCAL</span>
      </header>

      <main className="max-w-3xl mx-auto px-5 py-12">
        <div className="glass-strong p-7 sm:p-10 space-y-7 anim-fade-up">
          <div>
            <p className="eyebrow mb-4">{file.visibility === "public" ? "public library file" : "unlisted shared file"}</p>
            <h1 className="display text-[clamp(1.5rem,4.4vw,2.4rem)] break-all">{file.name}</h1>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { icon: HardDrive, k: "Size", v: fmtBytes(file.size) },
              { icon: DownloadCloud, k: "Saves", v: String(file.publicDownloads) },
              { icon: User, k: "Shared by", v: owner.name },
              { icon: CloudLightning, k: "Published", v: timeAgo(file.publishedAt) },
            ].map((s) => (
              <div key={s.k} className="glass p-4">
                <s.icon size={14} className="text-[var(--cyan)] mb-2" />
                <div className="mono text-[10px] text-[var(--faint)] uppercase tracking-widest">{s.k}</div>
                <div className="text-[13px] font-bold mt-1 truncate">{s.v}</div>
              </div>
            ))}
          </div>

          {file.description && <p className="text-[14px] text-[var(--muted)] leading-relaxed">{file.description}</p>}

          <ShareActions slug={slug} authed={authed} />

          <p className="mono text-[10px] text-[var(--faint)] leading-relaxed">
            Saving streams cloud-to-cloud: bytes move between the pool backend and Google Drive — never
            through this device. Abusive or infringing file? Report it for takedown review.
          </p>
        </div>
      </main>
    </div>
  );
}
