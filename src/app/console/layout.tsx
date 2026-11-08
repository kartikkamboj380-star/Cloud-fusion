import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { ensureEngineStarted } from "@/lib/engine/worker";
import { ensureDemoData } from "@/db/seed";
import { config } from "@/lib/config";
import ConsoleShell from "@/components/console/shell";

export const dynamic = "force-dynamic";

export default async function ConsoleLayout({ children }: { children: ReactNode }) {
  if (config.demoMode) await ensureDemoData();
  const user = await getSessionUser();
  if (!user) redirect("/");
  ensureEngineStarted();
  return (
    <ConsoleShell
      user={{ name: user.name, email: user.email, avatarHue: user.avatarHue }}
      demoMode={config.demoMode}
    >
      {children}
    </ConsoleShell>
  );
}
