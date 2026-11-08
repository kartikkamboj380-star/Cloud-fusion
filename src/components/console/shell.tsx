"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import {
  LayoutGrid, ArrowDownUp, FolderClosed, Globe2, LogOut, ShieldCheck, CloudLightning,
} from "lucide-react";
import { cn } from "@/lib/format";

const NAV = [
  { href: "/console", label: "Overview", icon: LayoutGrid },
  { href: "/console/transfers", label: "Transfers", icon: ArrowDownUp },
  { href: "/console/files", label: "My Files", icon: FolderClosed },
  { href: "/console/library", label: "Public Library", icon: Globe2 },
];

export default function ConsoleShell({
  user,
  demoMode,
  children,
}: {
  user: { name: string; email: string; avatarHue: number };
  demoMode: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  const signOut = async () => {
    setSigningOut(true);
    await fetch("/api/session", { method: "DELETE" });
    router.push("/");
    router.refresh();
  };

  const initials = user.name.split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase();

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[248px_1fr]">
      {/* Sidebar (desktop) */}
      <aside className="hidden lg:flex flex-col border-r border-[var(--line-soft)] bg-[var(--bg1)]/60 backdrop-blur-xl sticky top-0 h-dvh p-5">
        <Link href="/console" className="flex items-center gap-2.5 mb-9 group">
          <span className="relative grid place-items-center w-9 h-9 rounded-xl border border-[var(--line)] bg-[var(--bg2)]">
            <CloudLightning size={17} className="text-[var(--cyan)]" />
            <span className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity" style={{ boxShadow: "0 0 22px rgba(56,225,255,.35)" }} />
          </span>
          <span className="font-extrabold tracking-tight text-[17px]">
            Cloud<span className="grad-text">Fusion</span>
          </span>
        </Link>

        <nav className="flex flex-col gap-1">
          {NAV.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-[13.5px] font-semibold transition-all",
                  active
                    ? "text-[var(--ink)] bg-[var(--panel-strong)] border border-[var(--line)]"
                    : "text-[var(--muted)] hover:text-[var(--ink)] border border-transparent hover:bg-[var(--panel)]",
                )}
              >
                <item.icon size={16} className={active ? "text-[var(--cyan)]" : undefined} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto space-y-3">
          <div className="glass p-3.5">
            <div className="flex items-center gap-2 text-[11px] mono text-[var(--lime)]">
              <ShieldCheck size={13} />
              ZERO-LOCAL MODE
            </div>
            <p className="text-[11px] text-[var(--muted)] mt-1.5 leading-relaxed">
              This device only exchanges metadata. File bytes flow source → relay → drive.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span
              className="grid place-items-center w-9 h-9 rounded-full text-[12px] font-bold text-black/80 shrink-0"
              style={{ background: `linear-gradient(135deg, hsl(${user.avatarHue} 90% 65%), hsl(${(user.avatarHue + 70) % 360} 80% 55%))` }}
            >
              {initials}
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-semibold truncate">{user.name}</div>
              <div className="text-[11px] text-[var(--faint)] truncate mono">{demoMode ? "demo session" : user.email}</div>
            </div>
            <button onClick={signOut} disabled={signingOut} className="btn-icon danger" title="Sign out">
              <LogOut size={15} />
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile top bar */}
      <div className="lg:hidden sticky top-0 z-40 flex items-center justify-between px-4 py-3 border-b border-[var(--line-soft)] bg-[var(--bg0)]/85 backdrop-blur-xl">
        <Link href="/console" className="flex items-center gap-2">
          <CloudLightning size={18} className="text-[var(--cyan)]" />
          <span className="font-extrabold tracking-tight">Cloud<span className="grad-text">Fusion</span></span>
        </Link>
        <div className="flex items-center gap-2">
          <span className="chip"><ShieldCheck size={11} className="text-[var(--lime)]" /> 0 LOCAL BYTES</span>
          <button onClick={signOut} className="btn-icon danger" title="Sign out"><LogOut size={15} /></button>
        </div>
      </div>

      {/* Content */}
      <main className="min-w-0 px-4 sm:px-6 lg:px-9 py-6 lg:py-8 pb-28 lg:pb-10">{children}</main>

      {/* Mobile bottom nav */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 grid grid-cols-4 border-t border-[var(--line-soft)] bg-[var(--bg0)]/90 backdrop-blur-xl">
        {NAV.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-col items-center gap-1 py-3 text-[10px] font-semibold",
                active ? "text-[var(--cyan)]" : "text-[var(--muted)]",
              )}
            >
              <item.icon size={18} />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
