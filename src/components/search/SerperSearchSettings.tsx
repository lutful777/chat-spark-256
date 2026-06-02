import { useEffect, useState } from "react";
import { Eye, EyeOff, Loader2, Plug, Save, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { clearRealtimeSearchConfig, loadRealtimeSearchConfig, saveRealtimeSearchConfig } from "@/lib/search/realtime";

export function SerperSearchSettings() {
  const [apiKey, setApiKey] = useState("");
  const [visible, setVisible] = useState(false);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    setApiKey(loadRealtimeSearchConfig().serperApiKey);
  }, []);

  const save = () => {
    saveRealtimeSearchConfig({ serperApiKey: apiKey.trim() });
    toast.success("Serper API Key disimpan di perangkat ini.");
  };

  const clear = () => {
    clearRealtimeSearchConfig();
    setApiKey("");
    toast.success("Serper API Key dihapus.");
  };

  const test = async () => {
    const key = apiKey.trim();
    if (!key) return toast.error("Isi Serper API Key terlebih dahulu.");

    setTesting(true);
    try {
      const res = await fetch(`/api/public/realtime-search?q=${encodeURIComponent("berita teknologi terbaru")}`, {
        headers: { "X-Serper-API-Key": key },
      });
      const data = (await res.json()) as { provider?: string; sources?: unknown[]; error?: string };
      if (!res.ok) throw new Error(data.error || "Test Serper gagal.");
      if (data.provider !== "serper" || !Array.isArray(data.sources) || data.sources.length === 0) {
        throw new Error("Serper belum mengembalikan hasil. Cek API key atau quota.");
      }
      saveRealtimeSearchConfig({ serperApiKey: key });
      toast.success("Serper berhasil terhubung.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Test Serper gagal.");
    } finally {
      setTesting(false);
    }
  };

  return (
    <section className="rounded-2xl border border-border bg-card p-4 md:p-6">
      <div className="mb-3 flex items-center gap-2">
        <Search className="size-4 text-primary" />
        <h2 className="text-sm font-semibold">Real Time Search</h2>
      </div>
      <p className="mb-4 text-xs text-muted-foreground">
        Isi Serper.dev API key agar mode Real Time memakai Serper. Key disimpan hanya di browser/perangkat ini.
      </p>

      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label className="text-xs">Serper API Key</Label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Input
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                type={visible ? "text" : "password"}
                placeholder="c5c0f876..."
                autoComplete="off"
                className="rounded-xl pr-10"
              />
              <button
                type="button"
                onClick={() => setVisible((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label={visible ? "Sembunyikan" : "Tampilkan"}
              >
                {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
            <Button type="button" variant="outline" size="icon" className="shrink-0 rounded-xl" onClick={clear} aria-label="Hapus Serper API Key">
              <Trash2 className="size-4" />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Jangan isi “Bearer”. Masukkan API key murni saja.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button onClick={save} className="gap-2 rounded-xl">
            <Save className="size-4" /> Save
          </Button>
          <Button variant="secondary" onClick={test} disabled={testing} className="gap-2 rounded-xl">
            {testing ? <Loader2 className="size-4 animate-spin" /> : <Plug className="size-4" />} Test Search
          </Button>
        </div>
      </div>
    </section>
  );
}
