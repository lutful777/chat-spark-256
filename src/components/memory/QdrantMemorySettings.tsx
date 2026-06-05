import { useEffect, useState } from "react";
import { Database, Eye, EyeOff, Loader2, Plug, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  clearQdrantMemoryConfig,
  ensureQdrantCollection,
  loadQdrantMemoryConfig,
  saveQdrantMemoryConfig,
  type QdrantMemoryConfig,
} from "@/lib/memory/qdrantMemory";

const DEFAULT_COLLECTION = "ai_chat_memory";
const DEFAULT_VECTOR_SIZE = 1536;

export function QdrantMemorySettings() {
  const [config, setConfig] = useState<QdrantMemoryConfig>({
    endpoint: "",
    apiKey: "",
    collection: DEFAULT_COLLECTION,
    vectorSize: DEFAULT_VECTOR_SIZE,
    enabled: false,
  });
  const [visible, setVisible] = useState(false);
  const [testing, setTesting] = useState(false);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    setConfig(loadQdrantMemoryConfig());
  }, []);

  const update = <K extends keyof QdrantMemoryConfig>(key: K, value: QdrantMemoryConfig[K]) => {
    setConfig((prev) => ({ ...prev, [key]: value }));
  };

  const save = () => {
    if (!config.endpoint.trim()) return toast.error("Isi Qdrant Endpoint terlebih dahulu.");
    if (!config.apiKey.trim()) return toast.error("Isi Qdrant API Key terlebih dahulu.");
    saveQdrantMemoryConfig(config);
    toast.success("Qdrant Memory disimpan di perangkat ini.");
  };

  const clear = () => {
    clearQdrantMemoryConfig();
    setConfig({ endpoint: "", apiKey: "", collection: DEFAULT_COLLECTION, vectorSize: DEFAULT_VECTOR_SIZE, enabled: false });
    toast.success("Qdrant Memory dihapus dari perangkat ini.");
  };

  const test = async () => {
    setTesting(true);
    try {
      const collections = await import("@/lib/memory/qdrantMemory").then((m) => m.testQdrantConnection(config));
      saveQdrantMemoryConfig(config);
      toast.success(`Qdrant terhubung. Collection terdeteksi: ${collections.length}.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Test Qdrant gagal.");
    } finally {
      setTesting(false);
    }
  };

  const createCollection = async () => {
    setCreating(true);
    try {
      await ensureQdrantCollection(config);
      saveQdrantMemoryConfig({ ...config, enabled: true });
      setConfig((prev) => ({ ...prev, enabled: true }));
      toast.success(`Collection "${config.collection || DEFAULT_COLLECTION}" siap dipakai.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal membuat collection Qdrant.");
    } finally {
      setCreating(false);
    }
  };

  return (
    <section className="rounded-2xl border border-border bg-card p-4 md:p-6">
      <div className="mb-3 flex items-center gap-2">
        <Database className="size-4 text-primary" />
        <h2 className="text-sm font-semibold">Qdrant Vector Memory</h2>
      </div>
      <p className="mb-4 text-xs text-muted-foreground">
        Untuk memory AI besar berbasis vector. Endpoint dan API key disimpan hanya di browser/perangkat ini. Jangan masukkan key ke GitHub.
      </p>

      <div className="space-y-4">
        <div className="flex items-center justify-between rounded-xl border border-border px-3 py-3">
          <div className="pr-3">
            <p className="text-sm font-medium">Aktifkan Qdrant Memory</p>
            <p className="text-xs text-muted-foreground">Aktif setelah endpoint, API key, dan collection berhasil disiapkan.</p>
          </div>
          <Switch checked={config.enabled} onCheckedChange={(value) => update("enabled", value)} />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Qdrant Endpoint</Label>
          <Input
            value={config.endpoint}
            onChange={(e) => update("endpoint", e.target.value)}
            placeholder="https://xxxx.australia-southeast1-0.gcp.cloud.qdrant.io"
            inputMode="url"
            className="rounded-xl"
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Qdrant API Key</Label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Input
                value={config.apiKey}
                onChange={(e) => update("apiKey", e.target.value)}
                type={visible ? "text" : "password"}
                placeholder="paste API key Qdrant"
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
            <Button type="button" variant="outline" size="icon" className="shrink-0 rounded-xl" onClick={clear} aria-label="Hapus Qdrant config">
              <Trash2 className="size-4" />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">Jangan isi “Bearer”. Masukkan API key murni saja.</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Collection Name</Label>
            <Input
              value={config.collection}
              onChange={(e) => update("collection", e.target.value)}
              placeholder={DEFAULT_COLLECTION}
              className="rounded-xl"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Vector Size</Label>
            <Input
              value={config.vectorSize}
              onChange={(e) => update("vectorSize", parseInt(e.target.value, 10) || DEFAULT_VECTOR_SIZE)}
              type="number"
              min={1}
              inputMode="numeric"
              className="rounded-xl"
            />
            <p className="text-xs text-muted-foreground">Default 1536, cocok untuk embedding umum seperti text-embedding-3-small.</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button onClick={save} className="gap-2 rounded-xl">
            <Save className="size-4" /> Save
          </Button>
          <Button variant="secondary" onClick={test} disabled={testing || creating} className="gap-2 rounded-xl">
            {testing ? <Loader2 className="size-4 animate-spin" /> : <Plug className="size-4" />} Test Qdrant
          </Button>
          <Button variant="outline" onClick={createCollection} disabled={testing || creating} className="gap-2 rounded-xl">
            {creating ? <Loader2 className="size-4 animate-spin" /> : <Database className="size-4" />} Create Collection
          </Button>
        </div>
      </div>
    </section>
  );
}
