// src/components/AppShell.tsx

import type { ReactNode } from "react";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <main className="min-h-screen bg-gradient-to-b from-background to-muted flex flex-col items-center px-4 py-3 sm:py-4">
      <header className="w-full max-w-md pt-1 pb-3 text-center">
        <h1 className="text-4xl sm:text-5xl font-black tracking-tight bg-gradient-to-r from-primary via-primary to-accent-foreground bg-clip-text text-transparent leading-none">
          AudioFly
        </h1>
        <p className="mt-1 text-[11px] uppercase tracking-[0.25em] text-muted-foreground">
          Offline Audio Toolkit
        </p>
      </header>

      <div className="w-full max-w-md flex-1">{children}</div>

      <footer className="w-full max-w-md pt-4 pb-1 text-center">
        <p className="text-[11px] text-muted-foreground">
          Copyright 2026. Sungyeon In All right reserved.
        </p>
      </footer>
    </main>
  );
}
