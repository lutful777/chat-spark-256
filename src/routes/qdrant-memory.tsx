import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { QdrantMemorySettings } from "@/components/memory/QdrantMemorySettings";

export const Route = createFileRoute("/qdrant-memory")({
  head: () => ({
    meta: [
      { title: "Qdrant Memory — AI Chat" },
      {
        name: "description",
        content: "Konfigurasi Qdrant Vector Memory untuk AI Chat.",
      },
    ],
  }),
  component: QdrantMemoryPage,
});

function QdrantMemoryPage() {
  return (
    <div className="settings-page min-h-[100dvh] text-foreground">
      <header className="sticky top-0 z-10 flex items-center gap-2 border-b border-border px-3 py-3">
        <Button asChild variant="ghost" size="icon" aria-label="Kembali ke Advanced">
          <Link to="/settings/advanced">
            <ArrowLeft className="size-5" />
          </Link>
        </Button>
        <h1 className="text-base font-semibold">Qdrant Memory</h1>
      </header>

      <div className="mx-auto w-full max-w-3xl space-y-4 p-3 md:p-6">
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-foreground">
          Endpoint dan API key Qdrant disimpan lokal di browser/perangkat ini. Jangan masukkan API key ke GitHub, APK, atau file public.
        </div>
        <QdrantMemorySettings />
      </div>
    </div>
  );
}
