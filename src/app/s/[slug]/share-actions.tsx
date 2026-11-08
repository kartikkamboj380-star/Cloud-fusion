"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Copy, DownloadCloud, Flag, LogIn } from "lucide-react";

export default function ShareActions({ slug, authed }: { slug: string; authed: boolean }) {
  const router = useRouter();
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const save = async () => {
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch(`/api/library/${slug}/save`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      const j = (await res.json().catch(() => null)) as { ok?: boolean; error?: string; drive?: string } | null;
      if (res.status === 401) {
        router.push("/");
        return;
      }
      setNote(
        j?.ok
          ? { ok: true, text: `Saved cloud-to-cloud → ${j.drive}. It landed as private in your pool.` }
          : { ok: false, text: j?.error ?? "Save failed" },
      );
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch { /* denied */ }
  };

  const report = async () => {
    const details = prompt("Describe the issue (copyright reports need ≥ 20 chars):");
    if (details === null) return;
    const res = await fetch(`/api/library/${slug}/report`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reason: "copyright", details }),
    });
    const j = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
    setNote(j?.ok ? { ok: true, text: "Report filed — moderators have been notified." } : { ok: false, text: j?.error ?? "Report failed" });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        {authed ? (
          <button onClick={() => void save()} disabled={busy} className="btn-primary">
            <DownloadCloud size={15} /> {busy ? "Saving…" : "Save to my pool"}
          </button>
        ) : (
          <button onClick={() => router.push("/")} className="btn-primary">
            <LogIn size={15} /> Sign in to save cloud-to-cloud
          </button>
        )}
        <button onClick={() => void copy()} className="btn-ghost">
          {copied ? <CheckCircle2 size={14} className="text-[var(--lime)]" /> : <Copy size={14} />} Copy link
        </button>
        <button onClick={() => void report()} className="btn-ghost !text-[var(--red)]">
          <Flag size={14} /> Report
        </button>
      </div>
      {note && (
        <p className={`text-[13px] flex items-start gap-2 ${note.ok ? "text-[var(--lime)]" : "text-[var(--red)]"}`}>
          <CheckCircle2 size={15} className="shrink-0 mt-0.5" /> {note.text}
        </p>
      )}
    </div>
  );
}
