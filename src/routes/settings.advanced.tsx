import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { QdrantMemorySettings } from "@/components/memory/QdrantMemorySettings";
import { SupabaseMemoryKey } from "@/components/memory/SupabaseMemoryKey";
import { SerperSearchSettings } from "@/components/search/SerperSearchSettings";

export const Route = createFileRoute("/settings/advanced")({
  component: AdvancedSettingsPage,
});

function AdvancedSettingsPage() {
  return (
    <div className="settings-page min-h-[100dvh] text-foreground">
      <header className="relative z-10 flex items-center gap-2 border-b border-border px-3 py-3">
        <Button type="button" variant="ghost" size="icon" aria-label="Kembali" onClick={() => window.location.assign("/settings")}>
          <ArrowLeft className="size-5" />
        </Button>
        <h1 className="text-base font-semibold">Advanced</h1>
      </header>

      <div className="mx-auto w-full max-w-5xl space-y-4 p-3 md:p-6">
        <div className="grid grid-cols-2 gap-2 rounded-2xl border border-border bg-card p-2">
          <Button type="button" variant="ghost" className="rounded-xl" onClick={() => window.location.assign("/settings")}>Setting</Button>
          <Button className="rounded-xl">Advanced</Button>
        </div>

        <section className="rounded-2xl border border-border bg-card p-4 md:p-6">
          <h2 className="mb-2 text-sm font-semibold">Advanced Chat</h2>
          <p className="text-xs text-muted-foreground">
            System Prompt, Temperature, Max Tokens, Enable Streaming, dan Direct Call.
          </p>
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

        <section className="rounded-2xl border border-border bg-card p-4 md:p-6">
          <h2 className="mb-1 text-sm font-semibold">Backup Data</h2>
          <p className="text-xs text-muted-foreground">
            Export Settings, Import Settings, Export tanpa API key, Safe Backup, Clear API keys, dan Delete all data.
          </p>
        </section>
      </div>
    </div>
  );
}
