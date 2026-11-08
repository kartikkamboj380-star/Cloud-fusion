"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle, CheckCircle2, ClipboardPaste, Link2, Pause, Play, RotateCcw,
  ShieldAlert, XCircle, Zap,
} from "lucide-react";
import { cn, fmtBytes, fmtPct, fmtSpeed, hostOf, timeAgo } from "@/lib/format";
import { config as clientLimits } from "@/lib/client-limits";
import { Banner } from "./overview";
import type { SerializedJob } from "@/lib/serialize";

export type Job = SerializedJob & { driveLabel?: string | null };

const ACTIVE_STATUSES = new Set(["queued", "probing", "allocating", "downloading", "uploading", "verifying"]);

// ---------------------------------------------------------------------------

export function TransferForm({ compact, onStarted }: { compact?: boolean; onStarted?: () => void }) {
  const [url, setUrl] = useState("");
  const [connections, setConnections] = useState(4);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  const submit = async () => {
    if (!url.trim() || busy) return;
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch("/api/transfers", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: url.trim(), connections }),
      });
      const data = (await res.json().catch(() => null)) as { ok?: boolean; error?: string; drive?: string } | null;
      if (res.ok && data?.ok) {
        setResult({ ok: true, text: `Remote job live → ${data.drive ?? "pool"}. Nothing was downloaded to this device.` });
        setUrl("");
        onStarted?.();
      } else {
        setResult({ ok: false, text: data?.error ?? `Request failed (${res.status})` });
      }
    } catch {
      setResult({ ok: false, text: "Network error talking to the relay." });
    } finally {
      setBusy(false);
    }
  };

  const paste = async () => {
    try {
      const t = await navigator.clipboard.readText();
      if (t) setUrl(t.trim());
    } catch {
      /* clipboard may be denied — user can paste manually */
    }
  };

  return (
    <div className={cn("space-y-4", !compact && "max-w-3xl")}>
      <div className={cn("flex gap-2.5", compact && "flex-col sm:flex-row")}>
        <div className="relative flex-1">
          <Link2 size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--faint)]" />
          <input
            className="input !pl-10 mono !text-[12.5px]"
            placeholder="Paste direct download link — https://…/file.iso"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void submit()}
            inputMode="url"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
          />
        </div>
        <div className="flex gap-2.5">
          <button onClick={paste} className="btn-ghost !px-3.5" title="Paste from clipboard">
            <ClipboardPaste size={15} />
          </button>
          <button onClick={() => void submit()} disabled={busy || !url.trim()} className="btn-primary">
            {busy ? "Scheduling…" : "Beam to Drive"} <Zap size={14} />
          </button>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-5">
        <div className="flex-1 flex items-center gap-4">
          <input
            type="range"
            min={1}
            max={clientLimits.maxConnections}
            value={connections}
            onChange={(e) => setConnections(Number(e.target.value))}
            className="slider"
            style={{ ["--val" as string]: `${(connections / clientLimits.maxConnections) * 100}%` }}
            aria-label="Parallel range connections"
          />
          <span className="mono text-[13px] font-bold text-[var(--cyan)] w-14 text-right">{connections}×</span>
        </div>
        <p className="mono text-[10.5px] text-[var(--faint)] sm:text-right leading-relaxed">
          parallel range connections (max {clientLimits.maxConnections}). Engine adapts down when the
          source lacks Range support or rate-limits.
        </p>
      </div>

      {result && (
        <div className={cn(
          "flex items-start gap-2.5 text-[12.5px] rounded-xl border p-3.5",
          result.ok
            ? "border-[rgba(163,230,53,0.35)] bg-[rgba(163,230,53,0.06)] text-[var(--lime)]"
            : "border-[rgba(244,112,127,0.4)] bg-[rgba(244,112,127,0.06)] text-[var(--red)]",
        )}>
          {result.ok ? <CheckCircle2 size={15} className="shrink-0 mt-px" /> : <ShieldAlert size={15} className="shrink-0 mt-px" />}
          <span>{result.text}</span>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

export default function TransfersView() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const jobsRef = useRef<Job[]>([]);
  jobsRef.current = jobs;

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/transfers?pageSize=24");
      const data = (await res.json()) as { ok: boolean; items?: Job[] };
      if (data.ok && data.items) {
        setJobs(data.items);
        setError("");
      }
    } catch {
      setError("Relay unreachable — retrying…");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let alive = true;
    const loop = async () => {
      if (!alive) return;
      await load();
      if (!alive) return;
      // Adaptive polling: fast while jobs are live, lazy when idle (battery-friendly).
      const hasActive = jobsRef.current.some((j) => ACTIVE_STATUSES.has(j.status));
      timer.current = setTimeout(loop, hasActive ? 1600 : 9000);
    };
    void loop();
    return () => {
      alive = false;
      if (timer.current) clearTimeout(timer.current);
    };
  }, [load]);

  const control = async (id: string, action: "pause" | "resume" | "cancel" | "retry") => {
    const res = await fetch(`/api/transfers/${id}/control`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action }),
    });
    if (!res.ok) {
      const j = (await res.json().catch(() => null)) as { error?: string } | null;
      setError(j?.error ?? "Control request failed");
    }
    await load();
  };

  return (
    <div className="space-y-7 anim-fade-up">
      <div>
        <h1 className="display text-[26px] sm:text-[32px]">Transfer <span className="grad-text">Console</span></h1>
        <p className="mono text-[11px] text-[var(--faint)] mt-1.5">
          source url → relay engine → drive session · chunk-persisted · survives app kill
        </p>
      </div>

      <section className="glass-strong p-5 sm:p-6">
        <div className="mono text-[10.5px] tracking-[0.24em] text-[var(--cyan)] mb-4 uppercase">Paste direct download link</div>
        <TransferForm onStarted={() => void load()} />
      </section>

      {error && <Banner text={error} onRetry={() => void load()} />}

      <section className="space-y-3.5">
        {loading && !jobs.length && <p className="mono text-[12px] text-[var(--faint)]">loading jobs…</p>}
        {!loading && !jobs.length && (
          <div className="glass p-10 text-center text-[13px] text-[var(--muted)]">
            No transfers yet — paste a link above and watch the relay work.
          </div>
        )}
        {jobs.map((j) => (
          <JobCard key={j.id} job={j} onControl={control} />
        ))}
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------

function JobCard({ job, onControl }: { job: Job; onControl: (id: string, action: "pause" | "resume" | "cancel" | "retry") => void }) {
  const size = job.fileSize;
  const pct =
    job.status === "uploading" || job.status === "verifying"
      ? fmtPct(job.uploadedBytes, size)
      : fmtPct(job.progressBytes, size);
  const isLive = ACTIVE_STATUSES.has(job.status);

  return (
    <article className="glass p-4.5 sm:p-5 p-5 space-y-3.5">
      <div className="flex flex-wrap items-center gap-2.5">
        <span className={cn("pill pill-live", `pill-${job.status}`)}>
          <span className="dot" />
          {job.status}
        </span>
        <h3 className="font-bold text-[14px] truncate flex-1 min-w-[180px]">{job.fileName}</h3>
        <div className="flex gap-1.5">
          {isLive && job.status !== "verifying" && (
            <button className="btn-icon" title="Pause" onClick={() => onControl(job.id, "pause")}><Pause size={14} /></button>
          )}
          {job.status === "paused" && (
            <button className="btn-icon" title="Resume" onClick={() => onControl(job.id, "resume")}><Play size={14} /></button>
          )}
          {(job.status === "failed" || job.status === "canceled") && (
            <button className="btn-icon" title="Retry" onClick={() => onControl(job.id, "retry")}><RotateCcw size={14} /></button>
          )}
          {job.status !== "completed" && job.status !== "canceled" && (
            <button className="btn-icon danger" title="Cancel" onClick={() => onControl(job.id, "cancel")}><XCircle size={14} /></button>
          )}
          {job.status === "completed" && <CheckCircle2 size={18} className="text-[var(--lime)] mx-1.5 self-center" />}
        </div>
      </div>

      <div className="track">
        <div
          className={cn("fill", !isLive && "static")}
          style={{
            width: `${job.status === "completed" ? 100 : pct}%`,
            ...(job.status === "failed" ? { background: "linear-gradient(90deg,var(--red),#fca5a5)" } : {}),
            ...(job.status === "paused" ? { background: "linear-gradient(90deg,var(--amber),#fcd34d)" } : {}),
            ...(job.status === "completed" ? { background: "linear-gradient(90deg,var(--lime),#bef264)" } : {}),
          }}
        />
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mono text-[11px] text-[var(--muted)]">
        <span className="text-[var(--ink)] font-bold">{job.status === "completed" ? "100" : pct}%</span>
        <span>{fmtBytes(job.status === "uploading" || job.status === "verifying" ? job.uploadedBytes : job.progressBytes)} / {fmtBytes(size)}</span>
        {isLive && <span className="text-[var(--cyan)]">{fmtSpeed(job.speedBps)}</span>}
        <span>{job.connections}× conn{job.rangeSupported ? " · ranged" : " · single-stream"}</span>
        {job.chunkCount > 1 && <span>{job.chunksDone}/{job.chunkCount} chunks</span>}
        {job.driveLabel && <span className="truncate">→ {job.driveLabel}</span>}
        <span className="text-[var(--faint)]">{hostOf(job.sourceUrl)}</span>
        {job.attempts > 0 && <span className="text-[var(--amber)]">attempt {job.attempts + 1}</span>}
        <span className="text-[var(--faint)] ml-auto">{timeAgo(job.createdAt)}</span>
      </div>

      {job.error && (
        <p className="flex items-start gap-2 text-[12px] text-[var(--red)]">
          <AlertTriangle size={13} className="shrink-0 mt-0.5" /> {job.error}
          {job.nextRetryAt && <span className="mono text-[10.5px] text-[var(--amber)]"> · auto-retry queued</span>}
        </p>
      )}
    </article>
  );
}
