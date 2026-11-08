"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  CheckCircle2, Copy, FileArchive, FileAudio, FileImage, FileText, FileVideo, FolderClosed,
  Globe2, Link2, Lock, Package, RefreshCw, Trash2, TriangleAlert,
} from "lucide-react";
import { cn, fmtBytes, timeAgo } from "@/lib/format";
import { Banner } from "./overview";

type FileItem = {
  id: string;
  name: string;
  size: number;
  mimeType: string;
  category: string;
  visibility: string;
  shareSlug: string | null;
  publicDownloads: number;
  createdAt: string;
  driveLabel: string;
};

export const CAT_ICONS: Record<string, typeof FileArchive> = {
  archives: FileArchive,
  video: FileVideo,
  images: FileImage,
  apps: Package,
  docs: FileText,
  audio: FileAudio,
  other: FolderClosed,
};

export default function FilesView() {
  const [items, setItems] = useState<FileItem[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");

  const load = useCallback(async (p = 1, append = false, f = filter) => {
    try {
      const vis = f === "all" ? "" : `&visibility=${f}`;
      const res = await fetch(`/api/files?page=${p}&pageSize=24${vis}`);
      const data = (await res.json()) as { ok: boolean; items?: FileItem[]; hasMore?: boolean };
      if (data.ok && data.items) {
        setItems((prev) => (append ? [...prev, ...data.items!] : data.items!));
        setHasMore(Boolean(data.hasMore));
        setPage(p);
        setError("");
      }
    } catch {
      setError("Relay unreachable — retry.");
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    setLoading(true);
    void load(1, false, filter);
  }, [filter, load]);

  const remove = async (id: string) => {
    const res = await fetch(`/api/files/${id}`, { method: "DELETE" });
    if (!res.ok) setError("Delete failed");
    void load(1, false);
  };

  const copyLink = async (f: FileItem) => {
    if (!f.shareSlug) return;
    const link = `${location.origin}/s/${f.shareSlug}`;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(f.id);
      setTimeout(() => setCopied(""), 1800);
    } catch {
      setError("Clipboard unavailable — link: " + link);
    }
  };

  return (
    <div className="space-y-6 anim-fade-up">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="display text-[26px] sm:text-[32px]">My <span className="grad-text">Files</span></h1>
          <p className="mono text-[11px] text-[var(--faint)] mt-1.5">pointers into your drives · bytes live in the cloud, not here</p>
        </div>
        <div className="flex items-center gap-2">
          {["all", "private", "unlisted", "public"].map((f) => (
            <button key={f} className={cn("chip cursor-pointer capitalize", filter === f && "sel")} onClick={() => setFilter(f)}>
              {f}
            </button>
          ))}
          <button className="btn-icon" onClick={() => void load(1, false)} title="Refresh"><RefreshCw size={14} /></button>
        </div>
      </div>

      {error && <Banner text={error} onRetry={() => void load(1, false)} />}

      <section className="space-y-3">
        {loading && !items.length && <p className="mono text-[12px] text-[var(--faint)]">loading index…</p>}
        {!loading && !items.length && (
          <div className="glass p-10 text-center text-[13px] text-[var(--muted)]">No files match this filter.</div>
        )}
        {items.map((f) => (
          <FileRow key={f.id} file={f} onChanged={() => void load(1, false)} onDelete={remove} onCopy={copyLink} copied={copied === f.id} />
        ))}
      </section>

      {hasMore && (
        <div className="text-center">
          <button className="btn-ghost text-[13px]" onClick={() => void load(page + 1, true)}>Load more</button>
        </div>
      )}
    </div>
  );
}

function FileRow({
  file, onChanged, onDelete, onCopy, copied,
}: {
  file: FileItem;
  onChanged: () => void;
  onDelete: (id: string) => void;
  onCopy: (f: FileItem) => void;
  copied: boolean;
}) {
  const [menu, setMenu] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [rights, setRights] = useState(false);
  const [pendingVis, setPendingVis] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const Icon = CAT_ICONS[file.category] ?? Package;

  const askVisibility = (v: string) => {
    if (v === file.visibility) return setMenu(false);
    if ((v === "public" || v === "unlisted") && file.visibility === "private") {
      setPendingVis(v);
      return; // wait for rights confirmation
    }
    void apply(v);
  };

  const apply = async (v: string) => {
    setMsg("");
    const res = await fetch(`/api/files/${file.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ visibility: v, rightsConfirmed: rights }),
    });
    const j = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
    if (!res.ok || !j?.ok) {
      setMsg(j?.error ?? "Update failed");
      return;
    }
    setMenu(false);
    setPendingVis(null);
    setRights(false);
    onChanged();
  };

  return (
    <article className="glass p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-3">
        <span className="grid place-items-center w-10 h-10 rounded-xl bg-[var(--bg2)] border border-[var(--line-soft)] shrink-0">
          <Icon size={17} className="text-[var(--cyan)]" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="font-bold text-[13.5px] truncate">{file.name}</h3>
          <div className="mono text-[10.5px] text-[var(--faint)] mt-0.5 flex flex-wrap gap-x-3">
            <span>{fmtBytes(file.size)}</span>
            <span>{file.category}</span>
            <span className="truncate">→ {file.driveLabel}</span>
            <span>{timeAgo(file.createdAt)}</span>
            {file.visibility === "public" && <span className="text-[var(--violet)]">{file.publicDownloads} library saves</span>}
          </div>
        </div>
        <div className="flex items-center gap-2 relative">
          <span className={cn("pill cursor-pointer", `pill-${file.visibility}`)} onClick={() => setMenu((m) => !m)} title="Change visibility">
            <span className="dot" />
            {file.visibility}
          </span>
          {file.shareSlug && file.visibility !== "private" && (
            <button className="btn-icon" title="Copy share link" onClick={() => onCopy(file)}>
              {copied ? <CheckCircle2 size={14} className="text-[var(--lime)]" /> : <Copy size={14} />}
            </button>
          )}
          {confirmDel ? (
            <span className="flex gap-1.5">
              <button className="chip !text-[10px] cursor-pointer hover:!border-[var(--red)]" onClick={() => onDelete(file.id)}>confirm</button>
              <button className="chip !text-[10px] cursor-pointer" onClick={() => setConfirmDel(false)}>keep</button>
            </span>
          ) : (
            <button className="btn-icon danger" title="Remove from pool index" onClick={() => setConfirmDel(true)}><Trash2 size={14} /></button>
          )}
        </div>
      </div>

      {menu && (
        <div className="mt-4 glass-strong p-4 space-y-3 anim-fade-up">
          <div className="flex flex-wrap gap-2">
            {[
              { v: "private", icon: Lock, hint: "only you" },
              { v: "unlisted", icon: Link2, hint: "anyone with link" },
              { v: "public", icon: Globe2, hint: "listed in library" },
            ].map((o) => (
              <button
                key={o.v}
                onClick={() => askVisibility(o.v)}
                className={cn("chip cursor-pointer capitalize !py-2 !px-3.5", file.visibility === o.v && "sel")}
              >
                <o.icon size={12} /> {o.v} <span className="opacity-60">· {o.hint}</span>
              </button>
            ))}
          </div>
          {pendingVis && (
            <label className="flex items-start gap-2.5 text-[12px] text-[var(--muted)] leading-relaxed">
              <input type="checkbox" checked={rights} onChange={(e) => setRights(e.target.checked)} className="mt-0.5 accent-cyan-400" />
              <span>I own this file or have the <b className="text-[var(--ink)]">legal right to share it</b>. I accept the takedown policy.</span>
            </label>
          )}
          {pendingVis && (
            <button className="btn-primary !py-2 text-[12.5px]" disabled={!rights} onClick={() => void apply(pendingVis)}>
              Confirm &amp; make {pendingVis}
            </button>
          )}
          {msg && <p className="flex items-center gap-2 text-[12px] text-[var(--red)]"><TriangleAlert size={13} /> {msg}</p>}
          <p className="mono text-[10px] text-[var(--faint)]">Making a file private removes its Public Library listing immediately.</p>
        </div>
      )}
    </article>
  );
}
