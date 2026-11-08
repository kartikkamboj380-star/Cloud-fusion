"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowDownUp, ArrowRight, Database, FolderClosed, Gauge, Globe2, HardDrive,
  Plus, RefreshCw, ShieldCheck, Trash2, Unplug,
} from "lucide-react";
import PoolRing, { type RingDrive } from "./pool-ring";
import { TransferForm } from "./transfers";
import { cn, fmtBytes, timeAgo } from "@/lib/format";

type Drive = RingDrive & { email: string; status: string; reservedBytes: number; connectedAt: string };
type Stats = {
  pool: { total: number; used: number; reserved: number; available: number };
  drives: number; activeTransfers: number; myFiles: number; myPublicFiles: number; openReports: number;
};
type Activity = { id: string; type: string; message: string; createdAt: string };

export default function Overview() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [drives, setDrives] = useState<Drive[]>([]);
  const [events, setEvents] = useState<Activity[]>([]);
  const [demoMode, setDemoMode] = useState(true);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    try {
      const [s, d, a] = await Promise.all([
        fetch("/api/stats").then((r) => r.json()),
        fetch("/api/drives").then((r) => r.json()),
        fetch("/api/activity").then((r) => r.json()),
      ]);
      if (s.ok) setStats(s);
      if (d.ok) {
        setDrives(d.drives);
        setDemoMode(d.demoMode);
      }
      if (a.ok) setEvents(a.events);
      setError("");
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
      timer.current = setTimeout(loop, 5000);
    };
    void loop();
    return () => {
      alive = false;
      if (timer.current) clearTimeout(timer.current);
    };
  }, [load]);

  const addDemoDrive = async () => {
    setAdding(true);
    await fetch("/api/drives", { method: "POST" });
    setAdding(false);
    void load();
  };

  const disconnect = async (id: string) => {
    const r = await fetch(`/api/drives/${id}`, { method: "DELETE" });
    if (!r.ok) {
      const j = (await r.json().catch(() => null)) as { error?: string } | null;
      setError(j?.error ?? "Disconnect failed");
    }
    void load();
  };

  return (
    <div className="space-y-7 anim-fade-up">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="display text-[26px] sm:text-[32px]">Pool <span className="grad-text">Overview</span></h1>
          <p className="mono text-[11px] text-[var(--faint)] mt-1.5">virtual pool · source-accurate · single-file allocation</p>
        </div>
        <Link href="/console/transfers" className="btn-primary !py-2.5 text-[13px]">
          <ArrowDownUp size={14} /> New remote download
        </Link>
      </div>

      {error && <Banner text={error} onRetry={() => void load()} />}

      <div className="grid xl:grid-cols-[420px_1fr] gap-5 items-stretch">
        {/* pool ring */}
        <section className="glass p-6 grid place-items-center">
          {loading && !stats ? (
            <div className="mono text-[12px] text-[var(--faint)] py-24">syncing pool…</div>
          ) : (
            <PoolRing drives={drives} available={stats?.pool.available ?? 0} used={stats?.pool.used ?? 0} />
          )}
        </section>

        {/* stats + quick transfer */}
        <div className="space-y-5 min-w-0">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3.5">
            <StatTile icon={Gauge} label="Pooled available" value={fmtBytes(stats?.pool.available)} accent="var(--cyan)" />
            <StatTile icon={Database} label="Used across pool" value={fmtBytes(stats?.pool.used)} accent="var(--violet)" />
            <StatTile icon={ArrowDownUp} label="Active transfers" value={String(stats?.activeTransfers ?? 0)} accent="var(--lime)" href="/console/transfers" />
            <StatTile icon={HardDrive} label="Reserved by jobs" value={fmtBytes(stats?.pool.reserved)} accent="var(--amber)" />
            <StatTile icon={FolderClosed} label="Indexed files" value={String(stats?.myFiles ?? 0)} accent="var(--cyan)" href="/console/files" />
            <StatTile icon={Globe2} label="My public files" value={String(stats?.myPublicFiles ?? 0)} accent="var(--violet)" href="/console/library" />
          </div>

          <section className="glass p-5">
            <div className="flex items-center gap-2 mono text-[10.5px] tracking-[0.24em] text-[var(--cyan)] mb-4 uppercase">
              <ShieldCheck size={13} /> Remote download — bytes never touch this device
            </div>
            <TransferForm compact onStarted={() => void load()} />
          </section>
        </div>
      </div>

      {/* drives */}
      <section>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h2 className="font-bold text-[16px]">Connected drives</h2>
          <div className="flex gap-2">
            <a href="/api/auth/google/start" className="btn-ghost !py-2 text-[12.5px]">
              <Plus size={14} /> Connect Google Drive
            </a>
            {demoMode && (
              <button onClick={addDemoDrive} disabled={adding} className="btn-ghost !py-2 text-[12.5px]">
                <Plus size={14} /> {adding ? "Linking…" : "Add demo drive"}
              </button>
            )}
          </div>
        </div>
        <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {drives.map((d) => (
            <DriveCard key={d.id} drive={d} onDisconnect={disconnect} />
          ))}
          {!drives.length && !loading && (
            <div className="glass p-8 sm:col-span-2 xl:col-span-4 text-center text-[13px] text-[var(--muted)]">
              No drives connected yet. OAuth-link a Google Drive or add a demo drive to start pooling.
            </div>
          )}
        </div>
      </section>

      {/* activity */}
      <section className="glass p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-[16px] flex items-center gap-2"><ArrowDownUp size={15} className="text-[var(--cyan)]" /> Live activity</h2>
          <button onClick={() => void load()} className="btn-icon" title="Refresh"><RefreshCw size={14} /></button>
        </div>
        <ul className="space-y-2.5">
          {events.map((e) => (
            <li key={e.id} className="flex items-start gap-3 text-[13px]">
              <span className={cn(
                "mt-1 w-1.5 h-1.5 rounded-full shrink-0",
                e.type === "security" ? "bg-[var(--red)]" : e.type === "library" ? "bg-[var(--violet)]" : e.type === "drive" ? "bg-[var(--cyan)]" : "bg-[var(--lime)]",
              )} style={{ boxShadow: "0 0 8px currentColor" }} />
              <span className="flex-1 text-[var(--muted)] leading-snug">{e.message}</span>
              <span className="mono text-[10.5px] text-[var(--faint)] shrink-0">{timeAgo(e.createdAt)}</span>
            </li>
          ))}
          {!events.length && <li className="text-[13px] text-[var(--faint)]">No activity yet.</li>}
        </ul>
      </section>
    </div>
  );
}

function StatTile({ icon: Icon, label, value, accent, href }: { icon: typeof Gauge; label: string; value: string; accent: string; href?: string }) {
  const inner = (
    <div className="glass p-4 h-full hover:border-[var(--line)] transition-colors">
      <div className="flex items-center gap-2 text-[var(--muted)] mb-2.5">
        <Icon size={14} style={{ color: accent }} />
        <span className="text-[11px] font-semibold tracking-wide uppercase">{label}</span>
      </div>
      <div className="mono text-[19px] font-bold">{value}</div>
    </div>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}

function DriveCard({ drive, onDisconnect }: { drive: Drive; onDisconnect: (id: string) => void }) {
  const usedPct = Math.min(100, (drive.quotaUsed / Math.max(1, drive.quotaTotal)) * 100);
  const resvPct = Math.min(100 - usedPct, (drive.reservedBytes / Math.max(1, drive.quotaTotal)) * 100);
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="glass p-5 flex flex-col gap-4 group">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-bold text-[14px] truncate flex items-center gap-2">
            <HardDrive size={14} className="text-[var(--cyan)] shrink-0" /> {drive.displayName}
          </div>
          <div className="mono text-[11px] text-[var(--faint)] truncate mt-1">{drive.email}</div>
        </div>
        <span className={cn("pill", drive.status === "connected" ? "pill-connected" : drive.status === "demo" ? "pill-demo" : "pill-error")}>
          <span className={cn("dot", (drive.status === "connected" || drive.status === "demo") && "pulse-dot")} style={drive.status !== "connected" && drive.status !== "demo" ? {} : undefined} />
          {drive.status}
        </span>
      </div>
      <div>
        <div className="track h-[7px]">
          <div className="fill static" style={{ width: `${usedPct}%`, background: "linear-gradient(90deg,var(--violet),#b79cff)" }} />
          <div className="fill static" style={{ left: `${usedPct}%`, width: `${resvPct}%`, background: "linear-gradient(90deg,var(--amber),#fcd34d)" }} />
        </div>
        <div className="flex justify-between mt-2.5 mono text-[10.5px]">
          <span className="text-[var(--lime)] font-bold">{fmtBytes(drive.free)} free</span>
          <span className="text-[var(--faint)]">{fmtBytes(drive.quotaUsed)} / {fmtBytes(drive.quotaTotal)}</span>
        </div>
      </div>
      <div className="flex items-center justify-between mt-auto">
        <span className="mono text-[10px] text-[var(--faint)]">linked {timeAgo(drive.connectedAt)}</span>
        {confirming ? (
          <span className="flex gap-1.5">
            <button className="chip !text-[10px] hover:!border-[var(--red)] cursor-pointer" onClick={() => { onDisconnect(drive.id); setConfirming(false); }}>confirm</button>
            <button className="chip !text-[10px] cursor-pointer" onClick={() => setConfirming(false)}>keep</button>
          </span>
        ) : (
          <button className="btn-icon danger !w-8 !h-8" title="Disconnect drive" onClick={() => setConfirming(true)}>
            {confirming ? <Trash2 size={13} /> : <Unplug size={13} />}
          </button>
        )}
      </div>
    </div>
  );
}

export function Banner({ text, onRetry }: { text: string; onRetry?: () => void }) {
  return (
    <div className="glass !border-[rgba(244,112,127,0.4)] p-4 flex items-center gap-3 text-[13px] text-[var(--red)]">
      <ShieldCheck size={15} className="shrink-0" />
      <span className="flex-1">{text}</span>
      {onRetry && (
        <button onClick={onRetry} className="chip cursor-pointer hover:!border-[rgba(56,225,255,0.5)]">
          retry <ArrowRight size={11} />
        </button>
      )}
    </div>
  );
}
