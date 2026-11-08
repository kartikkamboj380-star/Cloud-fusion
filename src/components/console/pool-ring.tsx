"use client";

import { fmtBytes } from "@/lib/format";

export type RingDrive = {
  id: string;
  displayName: string;
  quotaTotal: number;
  quotaUsed: number;
  free: number;
};

const DRIVE_COLORS = ["#38e1ff", "#8b5cf6", "#a3e635", "#fbbf24", "#f472b6", "#2dd4bf", "#fb923c", "#818cf8"];

/** Multi-segment pool donut: one arc per drive, bright portion = free space. */
export default function PoolRing({ drives, available, used }: { drives: RingDrive[]; available: number; used: number }) {
  const size = 250;
  const r = 104;
  const c = 2 * Math.PI * r;
  const poolTotal = Math.max(1, drives.reduce((s, d) => s + d.quotaTotal, 0));
  const gapDeg = drives.length > 1 ? 2.2 : 0;
  const gapPx = (gapDeg / 360) * c;

  // Pure prefix sums — no accumulator mutated inside a render callback.
  const shareOf = (d: RingDrive) => (d.quotaTotal / poolTotal) * (c - gapPx * drives.length);
  const startOf = (i: number) =>
    drives.slice(0, i).reduce((sum, d) => sum + shareOf(d) + gapPx, 0);

  const segs = drives.map((d, i) => {
    const sharePx = shareOf(d);
    const freeRatio = d.quotaTotal > 0 ? Math.min(1, Math.max(0, d.free / d.quotaTotal)) : 0;
    return {
      drive: d,
      color: DRIVE_COLORS[i % DRIVE_COLORS.length],
      start: startOf(i),
      sharePx,
      brightPx: sharePx * freeRatio,
    };
  });

  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(148,163,255,0.08)" strokeWidth="15" />
          {segs.map((s) => (
            <g key={s.drive.id}>
              <circle
                cx={size / 2} cy={size / 2} r={r} fill="none"
                stroke={s.color} strokeOpacity={0.18} strokeWidth={15}
                strokeDasharray={`${s.sharePx} ${c - s.sharePx}`}
                strokeDashoffset={-s.start}
              />
              <circle
                cx={size / 2} cy={size / 2} r={r} fill="none"
                stroke={s.color} strokeWidth={15} strokeLinecap="round"
                strokeDasharray={`${Math.max(0, s.brightPx - 4)} ${c - Math.max(0, s.brightPx - 4)}`}
                strokeDashoffset={-(s.start + 2)}
                style={{ filter: `drop-shadow(0 0 6px ${s.color}66)`, transition: "stroke-dasharray 0.9s ease" }}
              />
            </g>
          ))}
        </svg>
        <div className="absolute inset-0 grid place-items-center text-center">
          <div className="anim-fade-up">
            <div className="mono text-[34px] font-bold grad-text leading-none">{fmtBytes(available)}</div>
            <div className="mono text-[10px] tracking-[0.28em] text-[var(--muted)] mt-2.5 uppercase">Pooled available</div>
            <div className="mono text-[10px] text-[var(--faint)] mt-1">{drives.length} drives · {fmtBytes(used)} used</div>
          </div>
        </div>
      </div>
      <div className="flex flex-wrap justify-center gap-2 mt-5">
        {segs.map((s) => (
          <span key={s.drive.id} className="chip">
            <span className="w-2 h-2 rounded-full" style={{ background: s.color, boxShadow: `0 0 8px ${s.color}` }} />
            {s.drive.displayName.split("·")[0]?.trim() ?? s.drive.displayName}
            <span className="text-[var(--ink)] font-bold">{fmtBytes(s.drive.free)}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
