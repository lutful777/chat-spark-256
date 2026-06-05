import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ArrowLeft, Check, Eye, EyeOff, Loader2, Plus, Plug, Save, Settings2, ShieldAlert, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DataBackupPanel } from "@/components/settings/DataBackupPanel";
import { useChatStore } from "@/lib/chat/store";
import { uid } from "@/lib/chat/storage";
import { ChatError, testConnection } from "@/lib/chat/api";
import { MediaError, testImageConnection, testVideoConnection } from "@/lib/chat/media";
import { PROVIDER_PRESETS, type ProviderConfig } from "@/lib/chat/types";
import { OutlookConnect } from "@/components/outlook/OutlookConnect";
import { GitHubConnect } from "@/components/github/GitHubConnect";
import { QdrantMemorySettings } from "@/components/memory/QdrantMemorySettings";
import { SupabaseMemoryKey } from "@/components/memory/SupabaseMemoryKey";
import { SerperSearchSettings } from "@/components/search/SerperSearchSettings";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings — AI Chat" },
      { name: "description", content: "Pengaturan AI Chat." },
    ],
  }),
  component: SettingsPage,
});

type TestingKey = string | null;

function normalizePath(path: string): string {
  const p = path.trim();
  if (!p) return "";
  return p.startsWith("/") ? p : `/${p}`;
}

function normalizeModels(models: string[]): string[] {
  return models.map((m) => m.trim()).filter(Boolean);
}

function cloneProvider(provider: ProviderConfig): ProviderConfig {
  return { ...provider, models: [...(provider.models ?? [])] };
}

function SettingsPage() {
  const { ready, providers, activeProviderId, setActiveProviderId, upsertProvider, removeProvider } = useChatStore();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<ProviderConfig | null>(null);
  const [showKey, setShowKey] = useState(false);
  const [showImageKey, setShowImageKey] = useState(false);
  const [showVideoKey, setShowVideoKey] = useState(false);
  const [testing, setTesting] = useState<TestingKey>(null);

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
  const isChatComplete = useMemo(() => Boolean(form?.baseUrl.trim() && form?.path.trim() && form?.apiKey.trim() && normalizeModels(form?.models ?? []).length > 0), [form]);

  const update = <K extends keyof ProviderConfig>(key: K, value: ProviderConfig[K]) => {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  };

  const updateModel = (index: number, value: string) => {
    setForm((prev) => (prev ? { ...prev, models: prev.models.map((m, i) => (i === index ? value : m)) } : prev));
  };

  const addModel = () => setForm((prev) => (prev ? { ...prev, models: [...(prev.models ?? []), ""] } : prev));

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
    if (!form.baseUrl.trim()) return toast.error("Base URL wajib diisi.");
    if (!form.path.trim()) return toast.error("API Path wajib diisi.");
    if (!form.apiKey.trim()) return toast.error("API Key wajib diisi.");
    if (!models.length) return toast.error("Tambahkan minimal satu model.");
    const current = form.model?.trim();
    persist({ ...form, name: form.name.trim(), baseUrl: form.baseUrl.trim(), path: normalizePath(form.path), apiKey: form.apiKey.trim(), models, model: current && models.includes(current) ? current : models[0] }, "Chat API");
  };

  const handleSaveImage = () => {
    if (!form) return;
    persist({ ...form, imageBaseUrl: form.imageBaseUrl?.trim() ?? "", imagePath: normalizePath(form.imagePath ?? ""), imageApiKey: form.imageApiKey?.trim() ?? "", imageModel: form.imageModel?.trim() ?? "", imageEditPath: normalizePath(form.imageEditPath ?? ""), imageEditModel: form.imageEditModel?.trim() ?? "" }, "Image API");
  };

  const handleSaveVideo = () => {
    if (!form) return;
    persist({ ...form, videoBaseUrl: form.videoBaseUrl?.trim() ?? "", videoPath: normalizePath(form.videoPath ?? ""), videoApiKey: form.videoApiKey?.trim() ?? "", videoModel: form.videoModel?.trim() ?? "", videoStatusPath: normalizePath(form.videoStatusPath ?? "") }, "Video API");
  };

  const handleTestChatModel = async (idx: number, model: string) => {
    if (!form) return;
    const models = normalizeModels(form.models ?? []);
    if (!isChatComplete || !model.trim()) return toast.error("Lengkapi Provider API, API Key, dan model terlebih dahulu.");
    setTesting(`chat-${idx}`);
    try {
      await testConnection({ ...form, path: normalizePath(form.path), models, model: model.trim() });
      toast.success(`Model \"${model.trim()}\" berhasil terhubung.`);
    } catch (err) {
      toast.error(err instanceof ChatError ? err.message : "Test koneksi gagal.");
    } finally {
      setTesting(null);
    }
  };

  const handleTestImage = async () => {
    if (!form) return;
    const provider = { ...form, imageBaseUrl: form.imageBaseUrl?.trim() ?? "", imagePath: normalizePath(form.imagePath ?? ""), imageApiKey: form.imageApiKey?.trim() ?? "", imageModel: form.imageModel?.trim() ?? "" };
    const effectiveKey = provider.imageApiKey || provider.apiKey.trim();
    if (!effectiveKey) return toast.error("Isi Image API Key atau Chat API Key sebagai fallback.");
    if (!provider.imagePath || !provider.imageModel) return toast.error("Isi Image Path dan Image Model terlebih dahulu.");
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
    const provider = { ...form, videoBaseUrl: form.videoBaseUrl?.trim() ?? "", videoPath: normalizePath(form.videoPath ?? ""), videoApiKey: form.videoApiKey?.trim() ?? "", videoModel: form.videoModel?.trim() ?? "", videoStatusPath: normalizePath(form.videoStatusPath ?? "") };
    const effectiveKey = provider.videoApiKey || provider.apiKey.trim();
    if (!effectiveKey) return toast.error("Isi Video API Key atau Chat API Key sebagai fallback.");
    if (!provider.videoPath || !provider.videoModel) return toast.error("Isi Video Path dan Video Model terlebih dahulu.");
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
    toast.success(`Provider \"${created.name}\" ditambahkan.`);
  };

  const handleDelete = () => {
    if (!form) return;
    if (!confirm(`Hapus provider \"${form.name}\"?`)) return;
    removeProvider(form.id);
    setSelectedId(null);
    toast.success("Provider dihapus.");
  };

  const handleClearKey = () => {
    if (!form) return;
    const next = { ...form, apiKey: "" };
    setForm(next);
    upsertProvider(next);
    toast.success("API Key dihapus dari provider ini.");
  };

  if (!ready) {
    return <div className="settings-page flex min-h-[100dvh] items-center justify-center text-muted-foreground"><Loader2 className="size-6 animate-spin" /></div>;
  }

  if (typeof window !== "undefined" && window.location.pathname.startsWith("/settings/advanced")) {
    return <AdvancedSettingsPage />;
  }

  return (
    <div className="settings-page min-h-[100dvh] text-foreground">
      <header className="sticky top-0 z-10 flex items-center gap-2 border-b border-border px-3 py-3">
        <Button asChild variant="ghost" size="icon" aria-label="Kembali"><Link to="/"><ArrowLeft className="size-5" /></Link></Button>
        <h1 className="text-base font-semibold">Settings</h1>
      </header>

      <div className="mx-auto w-full max-w-5xl space-y-4 p-3 md:p-6">
        <div className="flex items-start gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-foreground">
          <ShieldAlert className="mt-0.5 size-5 shrink-0 text-amber-500" />
          <p>API key disimpan di perangkat/browser kamu. Jangan gunakan perangkat publik.</p>
        </div>

        <DataBackupPanel />

        <div className="grid gap-4 md:grid-cols-[260px_1fr]">
          <ProviderList providers={providers} selectedId={selectedId} activeProviderId={activeProviderId} onSelect={setSelectedId} onAdd={handleAdd} />
          <section className="rounded-2xl border border-border bg-card p-4 md:p-6">
            {!form ? <p className="py-12 text-center text-sm text-muted-foreground">Pilih atau tambah provider untuk mengedit.</p> : (
              <div className="space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-sm font-semibold">Provider API</h2>
                  {isActive ? <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2.5 py-1 text-xs font-medium text-primary"><Check className="size-3.5" /> Provider aktif</span> : <Button variant="secondary" size="sm" className="rounded-xl" onClick={() => setActiveProviderId(form.id)}>Jadikan aktif</Button>}
                </div>
                <Field label="Provider Name"><Input value={form.name} onChange={(e) => update("name", e.target.value)} placeholder="x.ai (Grok)" className="rounded-xl" /></Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Provider API / Base URL"><Input value={form.baseUrl} onChange={(e) => update("baseUrl", e.target.value)} placeholder="https://api.x.ai/v1" inputMode="url" className="rounded-xl" /></Field>
                  <Field label="API Path"><Input value={form.path} onChange={(e) => update("path", e.target.value)} placeholder="/chat/completions" className="rounded-xl" /></Field>
                </div>
                <Field label="API Key" hint="Disimpan hanya di perangkat ini."><SecretInput value={form.apiKey} onChange={(v) => update("apiKey", v)} visible={showKey} onToggle={() => setShowKey((v) => !v)} onClear={handleClearKey} placeholder="API key" /></Field>
                <Field label="Model" hint="Klik Test untuk uji koneksi model.">
                  <div className="space-y-2">
                    {(form.models ?? []).map((m, i) => (
                      <div key={i} className="flex gap-2">
                        <Input value={m} onChange={(e) => updateModel(i, e.target.value)} placeholder="grok-4-latest" className="rounded-xl" />
                        <Button type="button" variant="secondary" size="icon" className="shrink-0 rounded-xl" onClick={() => handleTestChatModel(i, m)} disabled={testing !== null || !m.trim()}>{testing === `chat-${i}` ? <Loader2 className="size-4 animate-spin" /> : <Plug className="size-4" />}</Button>
                        <Button type="button" variant="outline" size="icon" className="shrink-0 rounded-xl" onClick={() => removeModel(i)}><Trash2 className="size-4" /></Button>
                      </div>
                    ))}
                    <Button type="button" variant="outline" size="sm" className="gap-2 rounded-xl" onClick={addModel}><Plus className="size-4" /> Tambah Model</Button>
                  </div>
                </Field>
                <div className="flex flex-wrap gap-2 pt-1"><Button onClick={handleSaveChat} className="gap-2 rounded-xl"><Save className="size-4" /> Save</Button><Button variant="ghost" onClick={handleDelete} className="ml-auto gap-2 rounded-xl text-destructive hover:text-destructive"><Trash2 className="size-4" /> Hapus Provider</Button></div>
              </div>
            )}
          </section>
        </div>

        <section className="rounded-2xl border border-border bg-card p-4 md:p-6">
          <h2 className="mb-3 text-sm font-semibold">Image API</h2>
          <p className="mb-4 text-xs text-muted-foreground">Opsional. Jika Image API Key kosong, memakai Chat API Key.</p>
          {form ? <MediaImageForm form={form} update={update} showKey={showImageKey} setShowKey={setShowImageKey} onSave={handleSaveImage} onTest={handleTestImage} testing={testing} /> : <p className="text-xs text-muted-foreground">Pilih provider dulu.</p>}
        </section>

        <section className="rounded-2xl border border-border bg-card p-4 md:p-6">
          <h2 className="mb-3 text-sm font-semibold">Video API</h2>
          <p className="mb-4 text-xs text-muted-foreground">Opsional. Jika Video API Key kosong, memakai Chat API Key.</p>
          {form ? <MediaVideoForm form={form} update={update} showKey={showVideoKey} setShowKey={setShowVideoKey} onSave={handleSaveVideo} onTest={handleTestVideo} testing={testing} /> : <p className="text-xs text-muted-foreground">Pilih provider dulu.</p>}
        </section>

        <section className="rounded-2xl border border-border bg-card p-4 md:p-6">
          <h2 className="mb-1 text-sm font-semibold">Advanced</h2>
          <p className="mb-3 text-xs text-muted-foreground">Advanced dipisah agar halaman Settings lebih stabil di Android WebView.</p>
          <Button type="button" variant="secondary" className="w-full justify-center gap-2 rounded-xl" onClick={() => window.location.assign("/settings/advanced")}><Settings2 className="size-4" /> Advanced</Button>
        </section>
      </div>
    </div>
  );
}

function AdvancedSettingsPage() {
  return (
    <div className="settings-page min-h-[100dvh] text-foreground">
      <header className="sticky top-0 z-10 flex items-center gap-2 border-b border-border px-3 py-3">
        <Button asChild variant="ghost" size="icon" aria-label="Kembali ke Settings"><Link to="/settings"><ArrowLeft className="size-5" /></Link></Button>
        <h1 className="text-base font-semibold">Advanced</h1>
      </header>
      <div className="mx-auto w-full max-w-5xl space-y-4 p-3 md:p-6">
        <DataBackupPanel compact />
        <section className="rounded-2xl border border-border bg-card p-4 md:p-6"><h2 className="mb-2 text-sm font-semibold">Advanced Chat</h2><p className="text-xs text-muted-foreground">System Prompt, Temperature, Max Tokens, Enable Streaming, dan Direct Call.</p></section>
        <OutlookConnect />
        <GitHubConnect />
        <QdrantMemorySettings />
        <SupabaseMemoryKey />
        <SerperSearchSettings />
        <section className="rounded-2xl border border-border bg-card p-4 md:p-6"><h2 className="mb-1 text-sm font-semibold">Private AI Memory</h2><p className="text-xs text-muted-foreground">Local Project Memory aktif otomatis. Supabase dan Qdrant bisa dipakai sebagai memory lanjutan.</p></section>
      </div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return <div className="space-y-1.5"><Label className="text-sm">{label}</Label>{children}{hint && <p className="text-xs text-muted-foreground">{hint}</p>}</div>;
}

function ProviderList({ providers, selectedId, activeProviderId, onSelect, onAdd }: { providers: ProviderConfig[]; selectedId: string | null; activeProviderId: string | null; onSelect: (id: string) => void; onAdd: (preset?: Omit<ProviderConfig, "id">) => void }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-3">
      <h2 className="mb-2 text-sm font-semibold">Provider</h2>
      <div className="space-y-1">
        {providers.length === 0 && <p className="px-2 py-4 text-center text-xs text-muted-foreground">Belum ada provider.</p>}
        {providers.map((p) => <button key={p.id} type="button" onClick={() => onSelect(p.id)} className={`flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-left text-sm ${p.id === selectedId ? "bg-accent text-accent-foreground" : "hover:bg-accent/50"}`}><span className="min-w-0 truncate">{p.name}</span>{p.id === activeProviderId && <Check className="size-4 shrink-0 text-primary" />}</button>)}
      </div>
      <div className="mt-3 space-y-2"><Button variant="outline" className="w-full justify-start gap-2 rounded-xl" onClick={() => onAdd()}><Plus className="size-4" /> Tambah Provider</Button><select className="h-10 w-full rounded-xl border border-input bg-background px-3 text-xs" defaultValue="" onChange={(e) => { const preset = PROVIDER_PRESETS.find((x) => x.name === e.target.value); if (preset) onAdd(preset); e.currentTarget.value = ""; }}><option value="">Dari preset…</option>{PROVIDER_PRESETS.map((p) => <option key={p.name} value={p.name}>{p.name}</option>)}</select></div>
    </section>
  );
}

function SecretInput({ value, onChange, visible, onToggle, onClear, placeholder }: { value: string; onChange: (value: string) => void; visible: boolean; onToggle: () => void; onClear: () => void; placeholder: string }) {
  return <div className="flex gap-2"><div className="relative flex-1"><Input value={value} onChange={(e) => onChange(e.target.value)} type={visible ? "text" : "password"} placeholder={placeholder} autoComplete="off" className="rounded-xl pr-10" /><button type="button" onClick={onToggle} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" aria-label={visible ? "Sembunyikan" : "Tampilkan"}>{visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</button></div><Button type="button" variant="outline" size="icon" className="shrink-0 rounded-xl" onClick={onClear} aria-label="Hapus API Key"><Trash2 className="size-4" /></Button></div>;
}

function MediaImageForm({ form, update, showKey, setShowKey, onSave, onTest, testing }: { form: ProviderConfig; update: <K extends keyof ProviderConfig>(key: K, value: ProviderConfig[K]) => void; showKey: boolean; setShowKey: (updater: (value: boolean) => boolean) => void; onSave: () => void; onTest: () => void; testing: TestingKey }) {
  return <div className="space-y-4"><Field label="Base URL"><Input value={form.imageBaseUrl ?? ""} onChange={(e) => update("imageBaseUrl", e.target.value)} placeholder="https://api.x.ai/v1" inputMode="url" className="rounded-xl" /></Field><Field label="Path"><Input value={form.imagePath ?? ""} onChange={(e) => update("imagePath", e.target.value)} placeholder="/images/generations" className="rounded-xl" /></Field><Field label="Image API Key"><SecretInput value={form.imageApiKey ?? ""} onChange={(v) => update("imageApiKey", v)} visible={showKey} onToggle={() => setShowKey((x) => !x)} onClear={() => update("imageApiKey", "")} placeholder="opsional" /></Field><Field label="Image Model"><Input value={form.imageModel ?? ""} onChange={(e) => update("imageModel", e.target.value)} placeholder="grok-imagine-image-quality" className="rounded-xl" /></Field><div className="flex flex-wrap gap-2"><Button onClick={onSave} className="gap-2 rounded-xl"><Save className="size-4" /> Save Image</Button><Button variant="secondary" onClick={onTest} disabled={testing !== null} className="gap-2 rounded-xl">{testing === "image" ? <Loader2 className="size-4 animate-spin" /> : <Plug className="size-4" />} Test Image</Button></div></div>;
}

function MediaVideoForm({ form, update, showKey, setShowKey, onSave, onTest, testing }: { form: ProviderConfig; update: <K extends keyof ProviderConfig>(key: K, value: ProviderConfig[K]) => void; showKey: boolean; setShowKey: (updater: (value: boolean) => boolean) => void; onSave: () => void; onTest: () => void; testing: TestingKey }) {
  return <div className="space-y-4"><Field label="Base URL"><Input value={form.videoBaseUrl ?? ""} onChange={(e) => update("videoBaseUrl", e.target.value)} placeholder="https://api.x.ai/v1" inputMode="url" className="rounded-xl" /></Field><Field label="Path"><Input value={form.videoPath ?? ""} onChange={(e) => update("videoPath", e.target.value)} placeholder="/videos/generations" className="rounded-xl" /></Field><Field label="Video API Key"><SecretInput value={form.videoApiKey ?? ""} onChange={(v) => update("videoApiKey", v)} visible={showKey} onToggle={() => setShowKey((x) => !x)} onClear={() => update("videoApiKey", "")} placeholder="opsional" /></Field><Field label="Video Model"><Input value={form.videoModel ?? ""} onChange={(e) => update("videoModel", e.target.value)} placeholder="grok-imagine-video" className="rounded-xl" /></Field><Field label="Status Path"><Input value={form.videoStatusPath ?? ""} onChange={(e) => update("videoStatusPath", e.target.value)} placeholder="/videos/{request_id}" className="rounded-xl" /></Field><div className="flex flex-wrap gap-2"><Button onClick={onSave} className="gap-2 rounded-xl"><Save className="size-4" /> Save Video</Button><Button variant="secondary" onClick={onTest} disabled={testing !== null} className="gap-2 rounded-xl">{testing === "video" ? <Loader2 className="size-4 animate-spin" /> : <Plug className="size-4" />} Test Video</Button></div></div>;
}
