"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  CheckCircle2, Copy, DownloadCloud, ExternalLink, Flag, Package, Search, ShieldCheck, X,
} from "lucide-react";
import { cn, fmtBytes, timeAgo } from "@/lib/format";
import { CAT_ICONS } from "./files";

type Item = {
  id: string;
  name: string;
  size: number;
  mimeType: string;
  category: string;
  description: string | null;
  shareSlug: string | null;
  publicDownloads: number;
  publishedAt: string | null;
  uploader: string;
};

const CATEGORIES = ["all", "archives", "video", "images", "apps", "docs", "audio", "other"];
const REASONS = ["copyright", "illegal", "malware", "privacy", "other"];

export default function LibraryView() {
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("all");
  const [items, setItems] = useState<Item[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState<Record<string, { ok: boolean; text: string }>>({});
  const [reportFor, setReportFor] = useState<Item | null>(null);
  const [copied, setCopied] = useState("");
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async (query: string, cat: string, p: number, append: boolean) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(p), pageSize: "12" });
      if (query) params.set("q", query);
      if (cat !== "all") params.set("category", cat);
      const res = await fetch(`/api/library?${params}`);
      const data = (await res.json()) as { ok: boolean; items?: Item[]; hasMore?: boolean; totalPublic?: number };
      if (data.ok && data.items) {
        setItems((prev) => (append ? [...prev, ...data.items!] : data.items!));
        setHasMore(Boolean(data.hasMore));
        setTotal(data.totalPublic ?? 0);
        setPage(p);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => void load(q, category, 1, false), 250);
    return () => { if (debounce.current) clearTimeout(debounce.current); };
  }, [q, category, load]);

  const note = (id: string, ok: boolean, text: string) => {
    setNotes((n) => ({ ...n, [id]: { ok, text } }));
    setTimeout(() => setNotes((n) => { const c = { ...n }; delete c[id]; return c; }), 4200);
  };

  const save = async (item: Item) => {
    if (!item.shareSlug) return;
    const res = await fetch(`/api/library/${item.shareSlug}/save`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    const j = (await res.json().catch(() => null)) as { ok?: boolean; error?: string; drive?: string } | null;
    if (res.status === 401) {
      location.href = "/";
      return;
    }
    note(item.id, Boolean(j?.ok), j?.ok ? `Saved to ${j.drive} — arrived private. 0 bytes touched this device.` : j?.error ?? "Save failed");
  };

  const copyLink = async (item: Item) => {
    if (!item.shareSlug) return;
    try {
      await navigator.clipboard.writeText(`${location.origin}/s/${item.shareSlug}`);
      setCopied(item.id);
      setTimeout(() => setCopied(""), 1600);
    } catch { /* denied */ }
  };

  return (
    <div className="space-y-6 anim-fade-up">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="display text-[26px] sm:text-[32px]">Public <span className="grad-text">Library</span></h1>
          <p className="mono text-[11px] text-[var(--faint)] mt-1.5">{total} files published with owner consent · moderated · takedown-ready</p>
        </div>
        <span className="chip"><ShieldCheck size={11} className="text-[var(--lime)]" /> private files never listed</span>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--faint)]" />
          <input className="input !pl-10" placeholder="Search public files…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {CATEGORIES.map((c) => (
          <button key={c} className={cn("chip cursor-pointer capitalize", category === c && "sel")} onClick={() => setCategory(c)}>
            {c}
          </button>
        ))}
      </div>

      {loading && !items.length && <p className="mono text-[12px] text-[var(--faint)]">indexing library…</p>}
      {!loading && !items.length && (
        <div className="glass p-10 text-center text-[13px] text-[var(--muted)]">Nothing here yet — publish a file from My Files with a rights confirmation.</div>
      )}

      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
        {items.map((item) => {
          const Icon = CAT_ICONS[item.category] ?? Package;
          const n = notes[item.id];
          return (
            <article key={item.id} className="glass p-5 flex flex-col gap-3.5 group hover:border-[var(--line)] transition-colors">
              <div className="flex items-start gap-3">
                <span className="grid place-items-center w-10 h-10 rounded-xl bg-[var(--bg2)] border border-[var(--line-soft)] shrink-0">
                  <Icon size={17} className="text-[var(--violet)]" />
                </span>
                <div className="min-w-0">
                  <h3 className="font-bold text-[13.5px] leading-snug break-all">{item.name}</h3>
                  <div className="mono text-[10.5px] text-[var(--faint)] mt-1">{fmtBytes(item.size)} · {item.category}</div>
                </div>
              </div>
              {item.description && <p className="text-[12.5px] text-[var(--muted)] leading-relaxed line-clamp-2">{item.description}</p>}
              <div className="mono text-[10.5px] text-[var(--faint)] flex flex-wrap gap-x-3 mt-auto">
                <span>by <span className="text-[var(--muted)]">{item.uploader}</span></span>
                <span>{item.publicDownloads} saves</span>
                <span>{timeAgo(item.publishedAt)}</span>
              </div>
              {n && (
                <p className={cn("text-[11.5px] flex items-start gap-1.5", n.ok ? "text-[var(--lime)]" : "text-[var(--red)]")}>
                  <CheckCircle2 size={13} className="shrink-0 mt-px" /> {n.text}
                </p>
              )}
              <div className="flex items-center gap-2">
                <button onClick={() => void save(item)} className="btn-primary !py-2 !px-3.5 text-[12px] flex-1 justify-center">
                  <DownloadCloud size={13} /> Save to my pool
                </button>
                <a href={`/s/${item.shareSlug}`} className="btn-icon" title="Open share page"><ExternalLink size={14} /></a>
                <button onClick={() => void copyLink(item)} className="btn-icon" title="Copy link">
                  {copied === item.id ? <CheckCircle2 size={14} className="text-[var(--lime)]" /> : <Copy size={14} />}
                </button>
                <button onClick={() => setReportFor(item)} className="btn-icon danger" title="Report file"><Flag size={14} /></button>
              </div>
            </article>
          );
        })}
      </div>

      {hasMore && (
        <div className="text-center pt-2">
          <button className="btn-ghost text-[13px]" onClick={() => void load(q, category, page + 1, true)}>Load more</button>
        </div>
      )}

      {reportFor && <ReportModal item={reportFor} onClose={() => setReportFor(null)} />}
    </div>
  );
}

function ReportModal({ item, onClose }: { item: Item; onClose: () => void }) {
  const [reason, setReason] = useState("copyright");
  const [details, setDetails] = useState("");
  const [reporter, setReporter] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState("");
  const [err, setErr] = useState("");

  const submit = async () => {
    setBusy(true);
    setErr("");
    const res = await fetch(`/api/library/${item.shareSlug}/report`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reason, details, reporter }),
    });
    const j = (await res.json().catch(() => null)) as { ok?: boolean; error?: string; status?: string; demoted?: boolean } | null;
    setBusy(false);
    if (j?.ok) {
      setDone(`Report received (status: ${j.status}).${j.demoted ? " File auto-delisted pending review." : ""} Our moderation queue takes it from here.`);
    } else {
      setErr(j?.error ?? "Report failed");
    }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4" style={{ background: "rgba(2,4,10,0.75)", backdropFilter: "blur(6px)" }} onClick={onClose}>
      <div className="glass-strong w-full max-w-md p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-[15px] flex items-center gap-2"><Flag size={15} className="text-[var(--red)]" /> Report file</h3>
          <button className="btn-icon !w-8 !h-8" onClick={onClose}><X size={14} /></button>
        </div>
        <p className="mono text-[11px] text-[var(--muted)] break-all">{item.name}</p>
        {done ? (
          <p className="text-[13px] text-[var(--lime)] leading-relaxed flex items-start gap-2"><CheckCircle2 size={15} className="shrink-0 mt-0.5" /> {done}</p>
        ) : (
          <>
            <select className="input" value={reason} onChange={(e) => setReason(e.target.value)}>
              {REASONS.map((r) => <option key={r} value={r} className="bg-[var(--bg2)] capitalize">{r}</option>)}
            </select>
            <textarea
              className="input min-h-[90px] resize-y"
              placeholder={reason === "copyright" ? "Describe the copyrighted work and your authorization (≥ 20 chars)…" : "Details for the moderators…"}
              value={details}
              onChange={(e) => setDetails(e.target.value)}
            />
            <input className="input" placeholder="Contact (optional) — rights holder email" value={reporter} onChange={(e) => setReporter(e.target.value)} />
            {err && <p className="text-[12px] text-[var(--red)]">{err}</p>}
            <button className="btn-primary w-full justify-center" disabled={busy} onClick={() => void submit()}>
              {busy ? "Sending…" : "Submit report"}
            </button>
            <p className="mono text-[10px] text-[var(--faint)] leading-relaxed">
              3+ open reports auto-delist a file pending human review. Copyright reports go straight to the takedown queue.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
