import { createFileRoute, Link } from "@tanstack/react-router";
import { Home, Settings } from "lucide-react";

import { Button } from "@/components/ui/button";
import { AppRouteNav } from "@/components/layout/AppRouteNav";

export const Route = createFileRoute("/not-found")({
  head: () => ({
    meta: [
      { title: "Not Found — AI Chat" },
      { name: "description", content: "Halaman tidak ditemukan." },
    ],
  }),
  component: NotFoundPage,
});

function NotFoundPage() {
  return (
    <div className="min-h-[100dvh] overflow-x-hidden bg-background px-3 py-4 text-foreground">
      <div className="mx-auto flex min-h-[calc(100dvh-2rem)] w-full max-w-3xl flex-col gap-4">
        <AppRouteNav />
        <main className="flex flex-1 items-center justify-center rounded-3xl border border-border bg-card p-6 text-center shadow-xl shadow-black/10">
          <div className="max-w-sm space-y-4">
            <p className="text-sm font-medium text-primary">404</p>
            <h1 className="text-2xl font-semibold tracking-tight">Halaman tidak ditemukan</h1>
            <p className="text-sm text-muted-foreground">
              Link ini tidak ada atau sudah dipindahkan. Kembali ke Chat atau buka Settings.
            </p>
            <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
              <Button asChild className="rounded-xl">
                <Link to="/">
                  <Home className="mr-2 size-4" /> Chat
                </Link>
              </Button>
              <Button asChild variant="secondary" className="rounded-xl">
                <Link to="/settings">
                  <Settings className="mr-2 size-4" /> Settings
                </Link>
              </Button>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
