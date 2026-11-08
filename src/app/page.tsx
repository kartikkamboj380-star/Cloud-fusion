"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  CloudLightning, Smartphone, Server, HardDrive, ShieldCheck, Zap, ArrowRight,
  Layers, RotateCcw, Globe2, CopyCheck, Radar, ArrowDownUp, CheckCircle2,
} from "lucide-react";

const FEATURES = [
  { icon: Layers, title: "Virtual Storage Pool", body: "OAuth-link any number of Google Drive accounts. Quotas aggregate into one live pool — 10 + 12 + 8 + 15 GB becomes 45 GB you can actually allocate." },
  { icon: Zap, title: "Adaptive 50-Range Engine", body: "Range-aware scheduler splits big files into byte-exact chunks across up to 50 bounded connections — and dials itself back when a source can't take the heat." },
  { icon: RotateCcw, title: "Resumable Everything", body: "Every chunk is persisted in Postgres. Pause, resume, retry with exponential backoff, survive app kills and backend restarts mid-flight." },
  { icon: Globe2, title: "Public Library", body: "Publish with an explicit rights confirmation. Search, categories, share links — plus copyright reporting and auto-delist moderation." },
  { icon: CopyCheck, title: "Cloud-to-Cloud Copy", body: "Save library files into your own pool. Provider-native copies when possible, bounded backend streams otherwise. Never via your phone." },
  { icon: Radar, title: "SSRF Armor", body: "Every URL and every redirect hop is re-validated: loopback, RFC1918, CGNAT and 169.254.169.254 are dead on arrival. Tokens encrypted AES-256-GCM." },
];

const PIPELINE_STEPS = ["validate", "probe", "allocate", "reserve", "ranged pull", "resumable push", "verify", "index"];

export default function Landing() {
  const router = useRouter();
  const [launching, setLaunching] = useState(false);

  const launch = async () => {
    setLaunching(true);
    try {
      await fetch("/api/session", { method: "POST" });
      router.push("/console");
    } finally {
      setLaunching(false);
    }
  };

  return (
    <div className="relative overflow-hidden">
      {/* ambient */}
      <div className="grid-bg absolute inset-0 -z-10" />
      <div className="glow-orb -z-10 w-[560px] h-[560px] -top-40 left-[8%]" style={{ background: "rgba(56,225,255,0.10)" }} />
      <div className="glow-orb -z-10 w-[640px] h-[640px] top-[30%] right-[-10%]" style={{ background: "rgba(139,92,246,0.12)" }} />
      <div className="glow-orb -z-10 w-[420px] h-[420px] bottom-[-6%] left-[30%]" style={{ background: "rgba(163,230,53,0.05)" }} />

      {/* nav */}
      <header className="max-w-6xl mx-auto flex items-center justify-between px-5 py-5">
        <div className="flex items-center gap-2.5">
          <span className="grid place-items-center w-9 h-9 rounded-xl border border-[var(--line)] bg-[var(--bg2)]">
            <CloudLightning size={17} className="text-[var(--cyan)]" />
          </span>
          <span className="font-extrabold tracking-tight text-[17px]">Cloud<span className="grad-text">Fusion</span></span>
        </div>
        <div className="flex items-center gap-2.5">
          <span className="chip hidden sm:inline-flex"><ShieldCheck size={11} className="text-[var(--lime)]" /> ZERO-LOCAL</span>
          <button onClick={launch} disabled={launching} className="btn-primary !py-2.5 !px-4 text-[13px]">
            Launch console <ArrowRight size={14} />
          </button>
        </div>
      </header>

      {/* hero */}
      <section className="max-w-6xl mx-auto px-5 pt-10 sm:pt-16 pb-16 grid lg:grid-cols-[1.15fr_0.85fr] gap-14 items-center">
        <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}>
          <p className="eyebrow mb-5">zero-local cloud orchestration</p>
          <h1 className="display text-[clamp(2.6rem,6.4vw,4.6rem)]">
            Every drive.<br />
            <span className="grad-text">One pool.</span><br />
            Zero bytes on your phone.
          </h1>
          <p className="mt-6 text-[15.5px] leading-relaxed text-[var(--muted)] max-w-xl">
            Paste a direct link. CloudFusion&apos;s remote engine pulls it range-by-range and pushes it
            straight into the Google Drive with room to spare — your 3&nbsp;GB-RAM phone only ever sees
            progress bars, metadata and speed readouts.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <button onClick={launch} disabled={launching} className="btn-primary">
              {launching ? "Opening…" : "Launch console"} <ArrowRight size={15} />
            </button>
            <a href="/api/auth/google/start" className="btn-ghost">
              Sign in with Google
            </a>
            <Link href="/console/library" className="btn-ghost">
              Browse Public Library <Globe2 size={14} />
            </Link>
          </div>
          <div className="mt-7 mono text-[11px] text-[var(--faint)] flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <span className="text-[var(--cyan)]">SOURCE URL</span><ArrowRight size={11} />
            <span className="text-[var(--violet)]">CLOUDFUSION RELAY</span><ArrowRight size={11} />
            <span className="text-[var(--lime)]">GOOGLE DRIVE</span>
            <span className="text-[var(--faint)]">// phone never touches payload</span>
          </div>
        </motion.div>

        {/* orbital pool visual */}
        <motion.div
          initial={{ opacity: 0, scale: 0.92 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
          className="relative mx-auto w-[320px] h-[320px] sm:w-[420px] sm:h-[420px]"
        >
          <div className="orbit-ring solid inset-0" />
          <div className="orbit-ring inset-[13%]" style={{ animation: "spin-slow 46s linear infinite" }} />
          <div className="orbit-ring inset-[27%]" style={{ animation: "spin-rev 34s linear infinite" }} />
          <div className="absolute inset-[41%] rounded-full grid place-items-center border border-[var(--line)] bg-[var(--bg2)]/80 backdrop-blur-xl" style={{ boxShadow: "0 0 60px rgba(56,225,255,0.25), inset 0 0 30px rgba(139,92,246,0.2)" }}>
            <CloudLightning size={30} className="text-[var(--cyan)]" />
          </div>
          {[
            { label: "A", free: "10 GB", top: "6%", left: "50%", delay: "0s", color: "var(--cyan)" },
            { label: "B", free: "12 GB", top: "50%", left: "94%", delay: "1.2s", color: "var(--violet)" },
            { label: "C", free: "8 GB", top: "88%", left: "32%", delay: "0.6s", color: "var(--lime)" },
            { label: "D", free: "15 GB", top: "44%", left: "6%", delay: "1.8s", color: "var(--amber)" },
          ].map((d) => (
            <div
              key={d.label}
              className="absolute -translate-x-1/2 -translate-y-1/2 glass-strong px-3 py-2 flex items-center gap-2"
              style={{ top: d.top, left: d.left, animation: `float-y 5s ease-in-out ${d.delay} infinite` }}
            >
              <HardDrive size={13} style={{ color: d.color }} />
              <span className="mono text-[11px] font-bold">{d.label}</span>
              <span className="mono text-[10px] text-[var(--muted)]">{d.free}</span>
            </div>
          ))}
          <div className="absolute left-1/2 -translate-x-1/2 bottom-[-8%] chip !text-[13px] !px-4 !py-2" style={{ color: "var(--cyan)", borderColor: "rgba(56,225,255,0.4)" }}>
            <Zap size={13} /> 45 GB POOLED
          </div>
        </motion.div>
      </section>

      {/* pipeline strip */}
      <section className="border-y border-[var(--line-soft)] bg-[var(--bg1)]/50 backdrop-blur-sm">
        <div className="max-w-6xl mx-auto px-5 py-12">
          <p className="eyebrow mb-7 text-center">the zero-local pipeline</p>
          <div className="flex items-center gap-3 sm:gap-5 max-w-3xl mx-auto">
            <PipeNode icon={Smartphone} title="Your phone" sub="metadata only · 0 B payload" tone="var(--cyan)" />
            <div className="flow-line" />
            <PipeNode icon={Server} title="Relay core" sub="bounded streams · ≤50 ranges" tone="var(--violet)" />
            <div className="flow-line data" />
            <PipeNode icon={HardDrive} title="Best-fit drive" sub="resumable session" tone="var(--lime)" />
          </div>
          <div className="mt-9 flex flex-wrap justify-center gap-2">
            {PIPELINE_STEPS.map((s, i) => (
              <span key={s} className="chip">
                <span className="text-[var(--cyan)]">{String(i + 1).padStart(2, "0")}</span> {s}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* stats */}
      <section className="max-w-6xl mx-auto px-5 py-16 grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { k: "45.0 GB", v: "pooled available storage" },
          { k: "4", v: "drives in the demo pool" },
          { k: "≤ 50", v: "parallel range connections" },
          { k: "0 B", v: "ever stored on your device" },
        ].map((s) => (
          <motion.div key={s.v} initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-60px" }} transition={{ duration: 0.6 }} className="glass p-6 text-center">
            <div className="mono text-[26px] sm:text-[32px] font-bold grad-text">{s.k}</div>
            <div className="text-[12px] text-[var(--muted)] mt-2">{s.v}</div>
          </motion.div>
        ))}
      </section>

      {/* features */}
      <section className="max-w-6xl mx-auto px-5 pb-20">
        <p className="eyebrow mb-3">platform</p>
        <h2 className="display text-[clamp(1.8rem,3.6vw,2.6rem)] mb-10">Built like infrastructure.<br /><span className="grad-text">Feels like magic.</span></h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {FEATURES.map((f, i) => (
            <motion.div
              key={f.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ duration: 0.55, delay: (i % 3) * 0.08 }}
              className="glass p-6 group hover:border-[rgba(56,225,255,0.35)] transition-colors"
            >
              <span className="grid place-items-center w-10 h-10 rounded-xl bg-[var(--bg2)] border border-[var(--line)] mb-4 group-hover:border-[rgba(56,225,255,0.5)] transition-colors">
                <f.icon size={18} className="text-[var(--cyan)]" />
              </span>
              <h3 className="font-bold text-[15px] mb-2">{f.title}</h3>
              <p className="text-[13px] leading-relaxed text-[var(--muted)]">{f.body}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* integrity */}
      <section className="border-t border-[var(--line-soft)] bg-[var(--bg1)]/40">
        <div className="max-w-6xl mx-auto px-5 py-14 flex flex-col lg:flex-row items-start lg:items-center gap-8">
          <ShieldCheck size={34} className="text-[var(--lime)] shrink-0" />
          <div className="flex-1">
            <h3 className="font-bold text-lg mb-2">Honest by design</h3>
            <p className="text-[13.5px] text-[var(--muted)] leading-relaxed max-w-2xl">
              No unlimited-storage claims. No password collection — OAuth 2.0 only. No bypassing logins,
              CAPTCHAs or DRM: gated sources are reported as unsupported. GitHub Actions builds and tests
              the client; it never runs your transfers. Free-tier hosting limits are documented, not hidden.
            </p>
          </div>
          <button onClick={launch} disabled={launching} className="btn-primary shrink-0">
            Open the console <ArrowRight size={15} />
          </button>
        </div>
      </section>

      <footer className="max-w-6xl mx-auto px-5 py-8 flex flex-col sm:flex-row items-center justify-between gap-3 text-[11.5px] mono text-[var(--faint)]">
        <span className="flex items-center gap-2"><CloudLightning size={13} className="text-[var(--cyan)]" /> CLOUDFUSION · virtual cloud storage platform</span>
        <span className="flex items-center gap-2"><CheckCircle2 size={12} className="text-[var(--lime)]" /> source-ready · CI-tested · self-hostable</span>
      </footer>
    </div>
  );
}

function PipeNode({ icon: Icon, title, sub, tone }: { icon: typeof Smartphone; title: string; sub: string; tone: string }) {
  return (
    <div className="glass-strong px-4 sm:px-6 py-4 sm:py-5 text-center min-w-[110px] sm:min-w-[150px]">
      <Icon size={20} style={{ color: tone }} className="mx-auto mb-2" />
      <div className="text-[13px] font-bold">{title}</div>
      <div className="mono text-[9.5px] sm:text-[10.5px] text-[var(--muted)] mt-1 leading-snug">{sub}</div>
    </div>
  );
}
