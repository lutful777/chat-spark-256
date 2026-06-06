import { useEffect, useState } from "react";
import { Eye, EyeOff, Loader2, Plug, Save, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { clearRealtimeSearchConfig, loadRealtimeSearchConfig, saveRealtimeSearchConfig } from "@/lib/search/realtime";

function parseTestError(status: number, text: string): string {
  try {
    const parsed = JSON.parse(text) as { error?: unknown; message?: unknown };
    const detail = parsed.error ?? parsed.message;
    if (typeof detail === "string" && detail.trim()) return detail.trim();
  } catch {
    // handled below
  }

  const clean = text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 140);
  if (status === 404) return "Endpoint Real Time Search belum aktif. Tunggu deploy Vercel selesai atau redeploy commit terbaru.";
  if (status === 401 || status === 403) return "API Key ditolak. Cek key dan jangan pakai awalan Bearer.";
  if (status === 429) return "Quota/limit Search habis. Coba lagi nanti atau ganti API key.";
  if (status >= 500) return "Server Real Time Search bermasalah. Coba redeploy Vercel atau coba lagi nanti.";
  return clean ? `Test gagal (${status}): ${clean}` : `Test gagal (${status}).`;
}

export function SerperSearchSettings() {
  const [serperApiKey, setSerperApiKey] = useState("");
  const [firecrawlApiKey, setFirecrawlApiKey] = useState("");
  const [visibleSerper, setVisibleSerper] = useState(false);
  const [visibleFirecrawl, setVisibleFirecrawl] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);

  useEffect(() => {
    const config = loadRealtimeSearchConfig();
    setSerperApiKey(config.serperApiKey);
    setFirecrawlApiKey(config.firecrawlApiKey);
  }, []);

  const save = () => {
    saveRealtimeSearchConfig({ 
      serperApiKey: serperApiKey.trim(),
      firecrawlApiKey: firecrawlApiKey.trim()
    });
    toast.success("Search API Keys disimpan di perangkat ini.");
  };

  const clear = () => {
    clearRealtimeSearchConfig();
    setSerperApiKey("");
    setFirecrawlApiKey("");
    toast.success("Semua Search API Keys dihapus.");
  };

  const testSerper = async () => {
    const key = serperApiKey.trim();
    if (!key) return toast.error("Isi Serper API Key terlebih dahulu.");

    setTesting("serper");
    try {
      const res = await fetch(`/api/public/realtime-search?q=${encodeURIComponent("berita teknologi terbaru")}`, {
        headers: { "X-Serper-API-Key": key },
      });
      const text = await res.text();
      let data: { provider?: string; sources?: unknown[]; error?: string } = {};
      try {
        data = JSON.parse(text) as { provider?: string; sources?: unknown[]; error?: string };
      } catch {
        throw new Error(parseTestError(res.status, text));
      }
      if (!res.ok) throw new Error(data.error || parseTestError(res.status, text));
      if (data.provider !== "serper" || !Array.isArray(data.sources) || data.sources.length === 0) {
        throw new Error("Serper belum mengembalikan hasil. Cek API key atau quota.");
      }
      saveRealtimeSearchConfig({ serperApiKey: key, firecrawlApiKey: firecrawlApiKey.trim() });
      toast.success("Serper berhasil terhubung.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Test Serper gagal.");
    } finally {
      setTesting(null);
    }
  };

  const testFirecrawl = async () => {
    const key = firecrawlApiKey.trim();
    if (!key) return toast.error("Isi Firecrawl API Key terlebih dahulu.");

    setTesting("firecrawl");
    try {
      const res = await fetch(`/api/public/realtime-search?q=${encodeURIComponent("artificial intelligence latest")}`, {
        headers: { "X-Firecrawl-API-Key": key },
      });
      const text = await res.text();
      let data: { provider?: string; sources?: unknown[]; error?: string } = {};
      try {
        data = JSON.parse(text) as { provider?: string; sources?: unknown[]; error?: string };
      } catch {
        throw new Error(parseTestError(res.status, text));
      }
      if (!res.ok) throw new Error(data.error || parseTestError(res.status, text));
      if (data.provider !== "firecrawl" || !Array.isArray(data.sources) || data.sources.length === 0) {
        throw new Error("Firecrawl belum mengembalikan hasil. Cek API key atau quota.");
      }
      saveRealtimeSearchConfig({ serperApiKey: serperApiKey.trim(), firecrawlApiKey: key });
      toast.success("Firecrawl berhasil terhubung.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Test Firecrawl gagal.");
    } finally {
      setTesting(null);
    }
  };

  return (
    <section className="rounded-2xl border border-border bg-card p-4 md:p-6">
      <div className="mb-3 flex items-center gap-2">
        <Search className="size-4 text-primary" />
        <h2 className="text-sm font-semibold">Real Time Search</h2>
      </div>
      <p className="mb-4 text-xs text-muted-foreground">
        Isi API key untuk menggunakan Real Time Search. Key disimpan hanya di browser/perangkat ini.
      </p>

      <div className="space-y-4">
        {/* Serper API Key */}
        <div className="space-y-1.5">
          <Label className="text-xs">Serper API Key</Label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Input
                value={serperApiKey}
                onChange={(e) => setSerperApiKey(e.target.value)}
                type={visibleSerper ? "text" : "password"}
                placeholder="c5c0f876..."
                autoComplete="off"
                className="rounded-xl pr-10"
              />
              <button
                type="button"
                onClick={() => setVisibleSerper((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label={visibleSerper ? "Sembunyikan" : "Tampilkan"}
              >
                {visibleSerper ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
            <Button 
              type="button" 
              variant="outline" 
              size="icon" 
              className="shrink-0 rounded-xl" 
              onClick={() => {
                setSerperApiKey("");
                toast.success("Serper API Key dihapus.");
              }} 
              aria-label="Hapus Serper API Key"
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Jangan isi "Bearer". Masukkan API key murni saja.
          </p>
        </div>

        {/* Firecrawl API Key */}
        <div className="space-y-1.5">
          <Label className="text-xs">Firecrawl API Key</Label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Input
                value={firecrawlApiKey}
                onChange={(e) => setFirecrawlApiKey(e.target.value)}
                type={visibleFirecrawl ? "text" : "password"}
                placeholder="fc-..."
                autoComplete="off"
                className="rounded-xl pr-10"
              />
              <button
                type="button"
                onClick={() => setVisibleFirecrawl((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label={visibleFirecrawl ? "Sembunyikan" : "Tampilkan"}
              >
                {visibleFirecrawl ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
            <Button 
              type="button" 
              variant="outline" 
              size="icon" 
              className="shrink-0 rounded-xl" 
              onClick={() => {
                setFirecrawlApiKey("");
                toast.success("Firecrawl API Key dihapus.");
              }} 
              aria-label="Hapus Firecrawl API Key"
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Jangan isi "Bearer". Masukkan API key murni saja.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap gap-2">
          <Button onClick={save} className="gap-2 rounded-xl">
            <Save className="size-4" /> Save
          </Button>
          <Button 
            variant="secondary" 
            onClick={testSerper} 
            disabled={testing !== null} 
            className="gap-2 rounded-xl"
          >
            {testing === "serper" ? <Loader2 className="size-4 animate-spin" /> : <Plug className="size-4" />} 
            Test Serper
          </Button>
          <Button 
            variant="secondary" 
            onClick={testFirecrawl} 
            disabled={testing !== null} 
            className="gap-2 rounded-xl"
          >
            {testing === "firecrawl" ? <Loader2 className="size-4 animate-spin" /> : <Plug className="size-4" />} 
            Test Firecrawl
          </Button>
          <Button 
            variant="outline" 
            onClick={clear} 
            className="gap-2 rounded-xl"
          >
            <Trash2 className="size-4" /> Clear All
          </Button>
        </div>
      </div>
    </section>
  );
}
