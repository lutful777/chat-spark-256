import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { DataBackupPanel } from "@/components/settings/DataBackupPanel";
import { OutlookConnect } from "@/components/outlook/OutlookConnect";
import { GitHubConnect } from "@/components/github/GitHubConnect";
import { QdrantMemorySettings } from "@/components/memory/QdrantMemorySettings";
import { SupabaseMemoryKey } from "@/components/memory/SupabaseMemoryKey";
import { SerperSearchSettings } from "@/components/search/SerperSearchSettings";

export const Route = createFileRoute("/qdrant-memory")({
  head: () => ({
    meta: [
      { title: "Qdrant Memory / Advanced — AI Chat" },
      {
        name: "description",
        content: "Qdrant Memory dan pengaturan lanjutan AI Chat.",
      },
    ],
  }),
  component: QdrantMemoryPage,
});

function QdrantMemoryPage() {
  return (
    <div className="settings-page min-h-[100dvh] overflow-x-hidden text-foreground">
      <header className="sticky top-0 z-10 flex items-center gap-2 border-b border-border px-3 py-3">
        <Button asChild variant="ghost" size="icon" aria-label="Kembali ke Settings">
          <Link to="/settings">
            <ArrowLeft className="size-5" />
          </Link>
        </Button>
        <h1 className="min-w-0 truncate text-base font-semibold">Qdrant Memory / Advanced</h1>
      </header>

      <div className="mx-auto w-full max-w-5xl space-y-4 p-3 md:p-6">
        <DataBackupPanel compact />

        <section className="rounded-2xl border border-border bg-card p-4 md:p-6">
          <h2 className="mb-2 text-sm font-semibold">Advanced Chat</h2>
          <p className="text-xs text-muted-foreground">
            System Prompt, Temperature, Max Tokens, Enable Streaming, dan Direct Call.
          </p>
        </section>

        <OutlookConnect />
        <GitHubConnect />

        <section className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-foreground">
          Endpoint dan API key Qdrant disimpan lokal di browser/perangkat ini. Jangan masukkan API key ke GitHub, APK, atau file public.
        </section>
        <QdrantMemorySettings />

        <SupabaseMemoryKey />
        <SerperSearchSettings />

        <section className="rounded-2xl border border-border bg-card p-4 md:p-6">
          <h2 className="mb-1 text-sm font-semibold">Private AI Memory</h2>
          <p className="text-xs text-muted-foreground">
            Local Project Memory aktif otomatis. Supabase dan Qdrant bisa dipakai sebagai memory lanjutan.
          </p>
        </section>
      </div>
    </div>
  );
}
