import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Check,
  Download,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Plus,
  Plug,
  Save,
  ShieldAlert,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useChatStore } from "@/lib/chat/store";
import { uid } from "@/lib/chat/storage";
import { ChatError, testConnection } from "@/lib/chat/api";
import { MediaError, testImageConnection, testVideoConnection } from "@/lib/chat/media";
import { PROVIDER_PRESETS, type ProviderConfig } from "@/lib/chat/types";
import { OutlookConnect } from "@/components/outlook/OutlookConnect";
import { GitHubConnect } from "@/components/github/GitHubConnect";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings — API Chat Client" },
      {
        name: "description",
        content: "Kelola provider API: Chat, Image, Video, Outlook, dan GitHub.",
      },
    ],
  }),
  component: SettingsPage,
});

type TestingKey = string | null;

type SafeBackupFile = {
  type: "ai-chat-safe-backup";
  version: 1;
  exportedAt: string;
  origin: string;
  data: Record<string, string>;
};

const SAFE_BACKUP_KEYS = [
  "aiapichat:providers",
  "aiapichat:activeProvider",
  "aiapichat:conversations",
  "aiapichat:github",
  "aiapichat:supabase-memory",
  "aiapichat:outlook",
] as const;

function normalizePath(path: string): string {
  const p = path.trim();
  if (!p) return "";
  return p.startsWith("/") ? p : `/${p}`;
}

function normalizeModels(models: string[]): string[] {
  return models.map((m) => m.trim()).filter(Boolean);
}

function cloneProvider(provider: ProviderConfig): ProviderConfig {
  return {
    ...provider,
    models: [...(provider.models ?? [])],
  };
}

function downloadJsonFile(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function getDateStamp(): string {
  return new Date().toISOString().slice(0, 10);
}

function sanitizeBackupValue(key: string, value: string): string {
  if (key !== "aiapichat:github") return value;
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    return JSON.stringify({ ...parsed, token: "" });
  } catch {
    return value;
  }
}

function collectSafeBackupData(): Record<string, string> {
  const data: Record<string, string> = {};
  if (typeof localStorage === "undefined") return data;
  SAFE_BACKUP_KEYS.forEach((key) => {
    const value = localStorage.getItem(key);
    if (value !== null) data[key] = sanitizeBackupValue(key, value);
  });
  return data;
}

function parseSafeBackupFile(value: unknown): SafeBackupFile {
  if (!value || typeof value !== "object") throw new Error("Format backup tidak valid.");
  const parsed = value as Partial<SafeBackupFile>;
  if (!parsed.data || typeof parsed.data !== "object" || Array.isArray(parsed.data)) {
    throw new Error("File ini bukan backup AI Chat.");
  }

  const allowed = new Set<string>(SAFE_BACKUP_KEYS);
  const data: Record<string, string> = {};
  Object.entries(parsed.data).forEach(([key, raw]) => {
    if (!allowed.has(key)) return;
    const value = typeof raw === "string" ? raw : JSON.stringify(raw);
    data[key] = sanitizeBackupValue(key, value);
  });

  if (Object.keys(data).length === 0) throw new Error("Backup kosong atau tidak berisi data AI Chat.");
  return {
    type: "ai-chat-safe-backup",
    version: 1,
    exportedAt: typeof parsed.exportedAt === "string" ? parsed.exportedAt : new Date().toISOString(),
    origin: typeof parsed.origin === "string" ? parsed.origin : "unknown",
    data,
  };
}

function SettingsPage() {
  const {
    ready,
    providers,
    activeProviderId,
    setActiveProviderId,
    upsertProvider,
    removeProvider,
    importProviders,
    clearAllApiKeys,
    resetAllData,
  } = useChatStore();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<ProviderConfig | null>(null);
  const [showKey, setShowKey] = useState(false);
  const [showImageKey, setShowImageKey] = useState(false);
  const [showVideoKey, setShowVideoKey] = useState(false);
  const [testing, setTesting] = useState<TestingKey>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const safeBackupFileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!ready) return;
    if (selectedId && providers.some((p) => p.id === selectedId)) return;
    setSelectedId(activeProviderId ?? providers[0]?.id ?? null);
  }, [ready, providers, selectedId, activeProviderId]);

  useEffect(() => {
    const provider = providers.find((p) => p.id === selectedId) ?? null;
    setForm(provider ? cloneProvider(provider) : null);
    setShowKey(false);
    setShowImageKey(false);
    setShowVideoKey(false);
  }, [selectedId, providers]);

  const isActive = useMemo(() => form?.id === activeProviderId, [form, activeProviderId]);
  const isChatComplete = useMemo(
    () =>
      Boolean(
        form?.baseUrl.trim() &&
          form?.path.trim() &&
          form?.apiKey.trim() &&
          normalizeModels(form?.models ?? []).length > 0,
      ),
    [form],
  );

  const update = <K extends keyof ProviderConfig>(key: K, value: ProviderConfig[K]) => {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  };

  const updateModel = (index: number, value: string) => {
    setForm((prev) =>
      prev ? { ...prev, models: prev.models.map((m, i) => (i === index ? value : m)) } : prev,
    );
  };

  const addModel = () => {
    setForm((prev) => (prev ? { ...prev, models: [...(prev.models ?? []), ""] } : prev));
  };

  const removeModel = (index: number) => {
    setForm((prev) => {
      if (!prev) return prev;
      const models = prev.models.filter((_, i) => i !== index);
      return { ...prev, models: models.length ? models : [""] };
    });
  };

  const persist = (next: ProviderConfig, label: string) => {
    upsertProvider(next);
    setForm(cloneProvider(next));
    toast.success(`${label} disimpan.`);
  };

  const handleSaveChat = () => {
    if (!form) return;
    const models = normalizeModels(form.models ?? []);
    if (!form.name.trim()) return toast.error("Provider Name wajib diisi.");
    if (!form.baseUrl.trim()) return toast.error("Base URL Chat wajib diisi.");
    if (!form.path.trim()) return toast.error("API Path Chat wajib diisi.");
    if (!form.apiKey.trim()) return toast.error("API Key Chat wajib diisi.");
    if (models.length === 0) return toast.error("Tambahkan minimal satu model chat.");

    const current = form.model?.trim();
    persist(
      {
        ...form,
        name: form.name.trim(),
        baseUrl: form.baseUrl.trim(),
        path: normalizePath(form.path),
        apiKey: form.apiKey.trim(),
        models,
        model: current && models.includes(current) ? current : models[0],
      },
      "Chat API",
    );
  };

  const handleSaveImage = () => {
    if (!form) return;
    persist(
      {
        ...form,
        imageBaseUrl: form.imageBaseUrl?.trim() ?? "",
        imagePath: normalizePath(form.imagePath ?? ""),
        imageApiKey: form.imageApiKey?.trim() ?? "",
        imageModel: form.imageModel?.trim() ?? "",
        imageEditPath: normalizePath(form.imageEditPath ?? ""),
        imageEditModel: form.imageEditModel?.trim() ?? "",
      },
      "Image API",
    );
  };

  const handleSaveVideo = () => {
    if (!form) return;
    persist(
      {
        ...form,
        videoBaseUrl: form.videoBaseUrl?.trim() ?? "",
        videoPath: normalizePath(form.videoPath ?? ""),
        videoApiKey: form.videoApiKey?.trim() ?? "",
        videoModel: form.videoModel?.trim() ?? "",
        videoStatusPath: normalizePath(form.videoStatusPath ?? ""),
      },
      "Video API",
    );
  };

  const handleTestChatModel = async (idx: number, model: string) => {
    if (!form) return;
    const models = normalizeModels(form.models ?? []);
    if (!isChatComplete || !model.trim()) {
      toast.error("Lengkapi Chat API dan model terlebih dahulu.");
      return;
    }
    const next = { ...form, path: normalizePath(form.path), models, model: model.trim() };
    setTesting(`chat-${idx}`);
    try {
      await testConnection(next);
      toast.success(`Model "${model.trim()}" berhasil terhubung.`);
    } catch (err) {
      toast.error(err instanceof ChatError ? err.message : "Test koneksi gagal.");
    } finally {
      setTesting(null);
    }
  };

  const handleTestImage = async () => {
    if (!form) return;
    const provider = {
      ...form,
      imageBaseUrl: form.imageBaseUrl?.trim() ?? "",
      imagePath: normalizePath(form.imagePath ?? ""),
      imageApiKey: form.imageApiKey?.trim() ?? "",
      imageModel: form.imageModel?.trim() ?? "",
    };
    const effectiveKey = provider.imageApiKey || provider.apiKey.trim();
    if (!effectiveKey) return toast.error("Isi Image API Key atau Chat API Key sebagai fallback.");
    if (!provider.imagePath || !provider.imageModel) {
      return toast.error("Isi Generate Path dan Generate Model terlebih dahulu.");
    }
    setTesting("image");
    try {
      await testImageConnection({ provider });
      toast.success("Image API berhasil terhubung.");
    } catch (err) {
      toast.error(err instanceof MediaError ? err.message : "Test koneksi Image gagal.");
    } finally {
      setTesting(null);
    }
  };

  const handleTestVideo = async () => {
    if (!form) return;
    const provider = {
      ...form,
      videoBaseUrl: form.videoBaseUrl?.trim() ?? "",
      videoPath: normalizePath(form.videoPath ?? ""),
      videoApiKey: form.videoApiKey?.trim() ?? "",
      videoModel: form.videoModel?.trim() ?? "",
      videoStatusPath: normalizePath(form.videoStatusPath ?? ""),
    };
    const effectiveKey = provider.videoApiKey || provider.apiKey.trim();
    if (!effectiveKey) return toast.error("Isi Video API Key atau Chat API Key sebagai fallback.");
    if (!provider.videoPath || !provider.videoModel) {
      return toast.error("Isi Video Path dan Video Model terlebih dahulu.");
    }
    setTesting("video");
    try {
      await testVideoConnection({ provider });
      toast.success("Video API berhasil terhubung.");
    } catch (err) {
      toast.error(err instanceof MediaError ? err.message : "Test koneksi Video gagal.");
    } finally {
      setTesting(null);
    }
  };

  const handleAdd = (preset?: Omit<ProviderConfig, "id">) => {
    const created: ProviderConfig = { id: uid(), ...(preset ?? PROVIDER_PRESETS[0]) };
    upsertProvider(created);
    setSelectedId(created.id);
    toast.success(`Provider "${created.name}" ditambahkan.`);
  };

  const handleDelete = () => {
    if (!form) return;
    if (!confirm(`Hapus provider "${form.name}"?`)) return;
    removeProvider(form.id);
    setSelectedId(null);
    toast.success("Provider dihapus.");
  };

  const handleClearKey = () => {
    if (!form) return;
    const next = { ...form, apiKey: "" };
    setForm(next);
    upsertProvider(next);
    toast.success("Chat API Key dihapus dari provider ini.");
  };

  const handleExportSettings = (withKeys: boolean) => {
    const data = providers.map((p) => ({
      ...p,
      id: undefined,
      apiKey: withKeys ? p.apiKey : "",
      imageApiKey: withKeys ? (p.imageApiKey ?? "") : "",
      videoApiKey: withKeys ? (p.videoApiKey ?? "") : "",
    }));
    downloadJsonFile(withKeys ? "api-chat-settings.json" : "api-chat-providers.json", data);
    toast.success(withKeys ? "Settings diekspor." : "Provider diekspor tanpa API key.");
  };

  const handleExportSafeBackup = () => {
    if (typeof localStorage === "undefined") return toast.error("Browser storage tidak tersedia.");
    if (!confirm("Backup aman berisi chat, provider, API key provider, dan konfigurasi lokal. File ini tetap privat. Lanjutkan?")) return;

    const backup: SafeBackupFile = {
      type: "ai-chat-safe-backup",
      version: 1,
      exportedAt: new Date().toISOString(),
      origin: window.location.origin,
      data: collectSafeBackupData(),
    };

    downloadJsonFile(`ai-chat-safe-backup-${getDateStamp()}.json`, backup);
    toast.success("Backup berhasil diekspor.");
  };

  const handleImportFile = async (file: File) => {
    try {
      const parsed = JSON.parse(await file.text());
      if (!Array.isArray(parsed)) throw new Error("Format harus array provider.");
      const normalized = parsed.map((p) => ({
        ...PROVIDER_PRESETS[0],
        ...p,
        models: Array.isArray(p.models) ? normalizeModels(p.models) : p.model ? [String(p.model)] : [],
        model: p.model ?? p.models?.[0] ?? "",
      }));
      const count = importProviders(normalized as Omit<ProviderConfig, "id">[]);
      toast.success(`${count} provider diimpor.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal membaca file JSON.");
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const handleImportSafeBackupFile = async (file: File) => {
    try {
      const parsed = parseSafeBackupFile(JSON.parse(await file.text()));
      const count = Object.keys(parsed.data).length;
      if (!confirm(`Import backup akan mengganti data lokal AI Chat (${count} item). Lanjutkan?`)) return;

      Object.entries(parsed.data).forEach(([key, value]) => {
        localStorage.setItem(key, value);
      });
      toast.success("Backup berhasil diimpor. Halaman akan dimuat ulang.");
      window.setTimeout(() => window.location.reload(), 600);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal import backup.");
    } finally {
      if (safeBackupFileRef.current) safeBackupFileRef.current.value = "";
    }
  };

  if (!ready) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-background text-muted-foreground">
        <Loader2 className="size-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-background text-foreground">
      <header className="sticky top-0 z-10 flex items-center gap-2 border-b border-border bg-background/80 px-3 py-3 backdrop-blur">
        <Button asChild variant="ghost" size="icon" aria-label="Kembali">
          <Link to="/">
            <ArrowLeft className="size-5" />
          </Link>
        </Button>
        <h1 className="text-base font-semibold">Settings</h1>
      </header>

      <div className="mx-auto w-full max-w-5xl space-y-4 p-3 md:p-6">
        <div className="flex items-start gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-foreground">
          <ShieldAlert className="mt-0.5 size-5 shrink-0 text-amber-500" />
          <p>
            API key disimpan di perangkat/browser kamu (localStorage), bukan di server kami. Jangan gunakan perangkat publik.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-[260px_1fr]">
          <section className="rounded-2xl border border-border bg-card p-3">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-semibold">Provider</h2>
            </div>
            <ScrollArea className="max-h-64 md:max-h-[50vh]">
              <div className="flex flex-col gap-1 pr-1">
                {providers.length === 0 && (
                  <p className="px-2 py-4 text-center text-xs text-muted-foreground">Belum ada provider.</p>
                )}
                {providers.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setSelectedId(p.id)}
                    className={`flex items-center justify-between gap-2 rounded-xl px-3 py-2 text-left text-sm transition-colors ${
                      p.id === selectedId ? "bg-accent text-accent-foreground" : "hover:bg-accent/50"
                    }`}
                  >
                    <span className="min-w-0 truncate">{p.name}</span>
                    {p.id === activeProviderId && <Check className="size-4 shrink-0 text-primary" />}
                  </button>
                ))}
              </div>
            </ScrollArea>
            <div className="mt-3 space-y-2">
              <Button variant="outline" className="w-full justify-start gap-2 rounded-xl" onClick={() => handleAdd()}>
                <Plus className="size-4" /> Tambah Provider
              </Button>
              <Select
                onValueChange={(v) => {
                  const preset = PROVIDER_PRESETS.find((x) => x.name === v);
                  if (preset) handleAdd(preset);
                }}
              >
                <SelectTrigger className="rounded-xl text-xs">
                  <SelectValue placeholder="Dari preset…" />
                </SelectTrigger>
                <SelectContent>
                  {PROVIDER_PRESETS.map((p) => (
                    <SelectItem key={p.name} value={p.name}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </section>

          <section className="rounded-2xl border border-border bg-card p-4 md:p-6">
            {!form ? (
              <p className="py-12 text-center text-sm text-muted-foreground">Pilih atau tambah provider untuk mengedit.</p>
            ) : (
              <div className="space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-sm font-semibold">Konfigurasi API</h2>
                  {isActive ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2.5 py-1 text-xs font-medium text-primary">
                      <Check className="size-3.5" /> Provider aktif
                    </span>
                  ) : (
                    <Button variant="secondary" size="sm" className="rounded-xl" onClick={() => setActiveProviderId(form.id)}>
                      Jadikan aktif
                    </Button>
                  )}
                </div>

                <Field label="Provider Name">
                  <Input value={form.name} onChange={(e) => update("name", e.target.value)} placeholder="BluesMinds" className="rounded-xl" />
                </Field>

                <Tabs defaultValue="chat" className="w-full">
                  <TabsList className="grid w-full grid-cols-3 rounded-xl">
                    <TabsTrigger value="chat" className="rounded-lg text-xs sm:text-sm">Chat API</TabsTrigger>
                    <TabsTrigger value="image" className="rounded-lg text-xs sm:text-sm">Image API</TabsTrigger>
                    <TabsTrigger value="video" className="rounded-lg text-xs sm:text-sm">Video API</TabsTrigger>
                  </TabsList>

                  <TabsContent value="chat" className="mt-4 space-y-5">
                    <Field label="Base URL">
                      <Input value={form.baseUrl} onChange={(e) => update("baseUrl", e.target.value)} placeholder="https://api.provider.com/v1" inputMode="url" className="rounded-xl" />
                    </Field>
                    <Field label="API Path">
                      <Input value={form.path} onChange={(e) => update("path", e.target.value)} placeholder="/chat/completions" className="rounded-xl" />
                    </Field>
                    <Field label="API Key" hint="Disimpan hanya di perangkat ini (localStorage).">
                      <SecretInput value={form.apiKey} onChange={(v) => update("apiKey", v)} visible={showKey} onToggle={() => setShowKey((v) => !v)} onClear={handleClearKey} placeholder="sk-..." />
                    </Field>
                    <Field label="Chat Models" hint="Tambahkan satu atau beberapa model. Klik Test untuk uji koneksi per model.">
                      <div className="space-y-2">
                        {(form.models ?? []).map((m, i) => (
                          <div key={i} className="flex gap-2">
                            <Input value={m} onChange={(e) => updateModel(i, e.target.value)} placeholder="contoh: openai/gpt-4o-mini" className="rounded-xl" />
                            <Button type="button" variant="secondary" size="icon" className="shrink-0 rounded-xl" onClick={() => handleTestChatModel(i, m)} disabled={testing !== null || !m.trim()}>
                              {testing === `chat-${i}` ? <Loader2 className="size-4 animate-spin" /> : <Plug className="size-4" />}
                            </Button>
                            <Button type="button" variant="outline" size="icon" className="shrink-0 rounded-xl" onClick={() => removeModel(i)}>
                              <Trash2 className="size-4" />
                            </Button>
                          </div>
                        ))}
                        <Button type="button" variant="outline" size="sm" className="gap-2 rounded-xl" onClick={addModel}>
                          <Plus className="size-4" /> Tambah Model
                        </Button>
                      </div>
                    </Field>
                    <Field label="System Prompt (opsional)">
                      <Textarea value={form.systemPrompt ?? ""} onChange={(e) => update("systemPrompt", e.target.value)} rows={3} className="rounded-xl" />
                    </Field>
                    <div className="grid gap-5 sm:grid-cols-2">
                      <Field label={`Temperature: ${(form.temperature ?? 0.7).toFixed(2)}`}>
                        <Slider value={[form.temperature ?? 0.7]} min={0} max={2} step={0.05} onValueChange={([v]) => update("temperature", v)} className="py-2" />
                      </Field>
                      <Field label="Max Tokens">
                        <Input value={Number.isFinite(form.maxTokens) ? form.maxTokens : ""} onChange={(e) => update("maxTokens", parseInt(e.target.value, 10) || 1)} type="number" min={1} max={200000} inputMode="numeric" className="rounded-xl" />
                      </Field>
                    </div>
                    <ToggleRow title="Enable Streaming" desc="Tampilkan jawaban AI token demi token saat tersedia." checked={form.stream ?? true} onChange={(v) => update("stream", v)} />
                    <ToggleRow title="Panggil langsung dari browser" desc="Default lewat proxy untuk hindari CORS. Aktifkan jika provider mengizinkan CORS." checked={!!form.directCall} onChange={(v) => update("directCall", v)} />
                    {!isChatComplete && (
                      <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-foreground">Lengkapi Base URL, API Path, API Key, dan Model terlebih dahulu.</p>
                    )}
                    <div className="flex flex-wrap gap-2 pt-1">
                      <Button onClick={handleSaveChat} className="gap-2 rounded-xl"><Save className="size-4" /> Save</Button>
                      <Button variant="ghost" onClick={handleDelete} className="ml-auto gap-2 rounded-xl text-destructive hover:text-destructive"><Trash2 className="size-4" /> Hapus Provider</Button>
                    </div>

                    <div className="border-t border-border pt-5">
                      <OutlookConnect />
                    </div>
                    <div className="border-t border-border pt-5">
                      <GitHubConnect />
                    </div>
                  </TabsContent>

                  <TabsContent value="image" className="mt-4 space-y-5">
                    <p className="text-xs text-muted-foreground">Opsional. Jika Image API Key dikosongkan, akan memakai Chat API Key sebagai fallback.</p>
                    <Field label="Base URL (opsional)" hint="Kosongkan untuk memakai Base URL dari tab Chat API.">
                      <Input value={form.imageBaseUrl ?? ""} onChange={(e) => update("imageBaseUrl", e.target.value)} placeholder="https://api.provider.com/v1" inputMode="url" className="rounded-xl" />
                    </Field>
                    <Field label="Generate Path">
                      <Input value={form.imagePath ?? ""} onChange={(e) => update("imagePath", e.target.value)} placeholder="/images/generations" className="rounded-xl" />
                    </Field>
                    <Field label="Image API Key" hint="Kosongkan untuk memakai Chat API Key.">
                      <SecretInput value={form.imageApiKey ?? ""} onChange={(v) => update("imageApiKey", v)} visible={showImageKey} onToggle={() => setShowImageKey((x) => !x)} onClear={() => update("imageApiKey", "")} placeholder="sk-... (opsional)" />
                    </Field>
                    <Field label="Generate Model">
                      <Input value={form.imageModel ?? ""} onChange={(e) => update("imageModel", e.target.value)} placeholder="contoh: grok-imagine-image-quality" className="rounded-xl" />
                    </Field>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field label="Edit Path (opsional)">
                        <Input value={form.imageEditPath ?? ""} onChange={(e) => update("imageEditPath", e.target.value)} placeholder="/images/edits" className="rounded-xl" />
                      </Field>
                      <Field label="Edit Model (opsional)">
                        <Input value={form.imageEditModel ?? ""} onChange={(e) => update("imageEditModel", e.target.value)} placeholder="contoh: grok-imagine-image-quality" className="rounded-xl" />
                      </Field>
                    </div>
                    <div className="flex flex-wrap gap-2 pt-1">
                      <Button onClick={handleSaveImage} className="gap-2 rounded-xl"><Save className="size-4" /> Save</Button>
                      <Button variant="secondary" onClick={handleTestImage} disabled={testing !== null} className="gap-2 rounded-xl">
                        {testing === "image" ? <Loader2 className="size-4 animate-spin" /> : <Plug className="size-4" />} Test Connection
                      </Button>
                    </div>
                  </TabsContent>

                  <TabsContent value="video" className="mt-4 space-y-5">
                    <p className="text-xs text-muted-foreground">Opsional. Jika Video API Key dikosongkan, akan memakai Chat API Key sebagai fallback.</p>
                    <Field label="Base URL (opsional)" hint="Kosongkan untuk memakai Base URL dari tab Chat API.">
                      <Input value={form.videoBaseUrl ?? ""} onChange={(e) => update("videoBaseUrl", e.target.value)} placeholder="https://api.provider.com/v1" inputMode="url" className="rounded-xl" />
                    </Field>
                    <Field label="API Path">
                      <Input value={form.videoPath ?? ""} onChange={(e) => update("videoPath", e.target.value)} placeholder="/videos/generations" className="rounded-xl" />
                    </Field>
                    <Field label="Video API Key" hint="Kosongkan untuk memakai Chat API Key.">
                      <SecretInput value={form.videoApiKey ?? ""} onChange={(v) => update("videoApiKey", v)} visible={showVideoKey} onToggle={() => setShowVideoKey((x) => !x)} onClear={() => update("videoApiKey", "")} placeholder="sk-... (opsional)" />
                    </Field>
                    <Field label="Video Model">
                      <Input value={form.videoModel ?? ""} onChange={(e) => update("videoModel", e.target.value)} placeholder="contoh: grok-imagine-video" className="rounded-xl" />
                    </Field>
                    <Field label="Status Path (opsional)" hint="Untuk polling request_id. Pakai {request_id} sbg placeholder.">
                      <Input value={form.videoStatusPath ?? ""} onChange={(e) => update("videoStatusPath", e.target.value)} placeholder="/videos/status/{request_id}" className="rounded-xl" />
                    </Field>
                    <div className="flex flex-wrap gap-2 pt-1">
                      <Button onClick={handleSaveVideo} className="gap-2 rounded-xl"><Save className="size-4" /> Save</Button>
                      <Button variant="secondary" onClick={handleTestVideo} disabled={testing !== null} className="gap-2 rounded-xl">
                        {testing === "video" ? <Loader2 className="size-4 animate-spin" /> : <Plug className="size-4" />} Test Connection
                      </Button>
                    </div>
                  </TabsContent>
                </Tabs>
              </div>
            )}
          </section>
        </div>

        <section className="rounded-2xl border border-border bg-card p-4 md:p-6">
          <h2 className="mb-1 text-sm font-semibold">Data & Privasi</h2>
          <p className="mb-3 text-xs text-muted-foreground">Kelola data yang tersimpan di perangkat ini.</p>
          <p className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-foreground">
            Backup aman berisi chat, provider, API key provider, GitHub repo config tanpa token, memory config, Outlook config, dan setting lokal. Login ulang mungkin diperlukan setelah restore.
          </p>
          <input ref={fileRef} type="file" accept="application/json" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleImportFile(f); }} />
          <input ref={safeBackupFileRef} type="file" accept="application/json" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleImportSafeBackupFile(f); }} />
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" className="gap-2 rounded-xl" onClick={() => handleExportSettings(true)}><Download className="size-4" /> Export Settings</Button>
            <Button variant="outline" className="gap-2 rounded-xl" onClick={() => fileRef.current?.click()}><Upload className="size-4" /> Import Settings</Button>
            <Button variant="outline" className="gap-2 rounded-xl" onClick={() => handleExportSettings(false)}><Download className="size-4" /> Export tanpa API key</Button>
            <Button variant="secondary" className="gap-2 rounded-xl" onClick={handleExportSafeBackup}><Download className="size-4" /> Export Backup Aman</Button>
            <Button variant="secondary" className="gap-2 rounded-xl" onClick={() => safeBackupFileRef.current?.click()}><Upload className="size-4" /> Import Backup Aman</Button>
            <Button variant="outline" className="gap-2 rounded-xl" onClick={() => { clearAllApiKeys(); toast.success("Semua API key dihapus."); }}><KeyRound className="size-4" /> Clear API keys</Button>
            <Button variant="ghost" className="ml-auto gap-2 rounded-xl text-destructive hover:text-destructive" onClick={() => { if (confirm("Hapus semua provider, API key, dan riwayat chat?")) { resetAllData(); setSelectedId(null); toast.success("Semua data dihapus."); } }}><Trash2 className="size-4" /> Delete all data</Button>
          </div>
        </section>
      </div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm">{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function SecretInput({
  value,
  onChange,
  visible,
  onToggle,
  onClear,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  visible: boolean;
  onToggle: () => void;
  onClear: () => void;
  placeholder: string;
}) {
  return (
    <div className="flex gap-2">
      <div className="relative flex-1">
        <Input value={value} onChange={(e) => onChange(e.target.value)} type={visible ? "text" : "password"} placeholder={placeholder} autoComplete="off" className="rounded-xl pr-10" />
        <button type="button" onClick={onToggle} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" aria-label={visible ? "Sembunyikan" : "Tampilkan"}>
          {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      </div>
      <Button type="button" variant="outline" size="icon" className="shrink-0 rounded-xl" onClick={onClear} aria-label="Hapus API Key">
        <Trash2 className="size-4" />
      </Button>
    </div>
  );
}

function ToggleRow({ title, desc, checked, onChange }: { title: string; desc: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-border px-3 py-3">
      <div className="pr-3">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-muted-foreground">{desc}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
