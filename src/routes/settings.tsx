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
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useChatStore } from "@/lib/chat/store";
import { uid } from "@/lib/chat/storage";
import { ChatError, testConnection } from "@/lib/chat/api";
import { PROVIDER_PRESETS, type ProviderConfig } from "@/lib/chat/types";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings — API Chat Client" },
      {
        name: "description",
        content: "Kelola provider API: Base URL, API Path, API Key, Model, system prompt, dan streaming.",
      },
      { property: "og:title", content: "Settings — API Chat Client" },
      {
        property: "og:description",
        content: "Kelola konfigurasi provider OpenAI-compatible Anda.",
      },
    ],
  }),
  component: SettingsPage,
});

const providerSchema = z.object({
  name: z.string().trim().min(1, "Provider Name wajib diisi").max(60, "Maksimal 60 karakter"),
  baseUrl: z
    .string()
    .trim()
    .min(1, "Base URL wajib diisi")
    .url("Base URL tidak valid (contoh: https://api.example.com/v1)")
    .max(2048),
  path: z
    .string()
    .trim()
    .min(1, "API Path wajib diisi")
    .max(512)
    .transform((v) => (v.startsWith("/") ? v : `/${v}`)),
  apiKey: z.string().trim().min(1, "API Key wajib diisi").max(8192),
  models: z
    .array(z.string())
    .transform((arr) => arr.map((s) => s.trim()).filter(Boolean))
    .pipe(
      z
        .array(z.string().min(1).max(256))
        .min(1, "Tambahkan minimal satu model"),
    ),
  systemPrompt: z.string().trim().max(8000).optional().default(""),
  temperature: z.coerce
    .number({ invalid_type_error: "Temperature harus angka" })
    .min(0, "Min 0")
    .max(2, "Maks 2")
    .default(0.7),
  maxTokens: z.coerce
    .number({ invalid_type_error: "Max Tokens harus angka" })
    .int("Harus bilangan bulat")
    .min(1, "Min 1")
    .max(200000, "Maks 200000")
    .default(1024),
  stream: z.boolean(),
  directCall: z.boolean(),
});

// Import schema (without requiring API key)
const importSchema = z.array(
  z.object({
    name: z.string().trim().min(1).max(60),
    baseUrl: z.string().trim().url().max(2048),
    path: z.string().trim().min(1).max(512),
    apiKey: z.string().max(8192).optional().default(""),
    model: z.string().trim().max(256).optional().default(""),
    models: z.array(z.string().trim().max(256)).optional(),
    systemPrompt: z.string().max(8000).optional().default(""),
    temperature: z.number().min(0).max(2).optional().default(0.7),
    maxTokens: z.number().int().min(1).max(200000).optional().default(1024),
    stream: z.boolean().optional().default(true),
    directCall: z.boolean().optional().default(false),
  }),
);

type FormErrors = Partial<Record<keyof ProviderConfig, string>>;

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
  const [errors, setErrors] = useState<FormErrors>({});
  const [showKey, setShowKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const fieldRefs = useRef<Partial<Record<keyof ProviderConfig, HTMLDivElement | null>>>({});

  // order used to find the first errored field for scrolling/focus
  const FIELD_ORDER: Array<keyof ProviderConfig> = [
    "name",
    "baseUrl",
    "path",
    "apiKey",
    "models",
    "systemPrompt",
    "temperature",
    "maxTokens",
  ];

  const scrollToFirstError = (errs: FormErrors) => {
    const firstKey = FIELD_ORDER.find((k) => errs[k]);
    if (!firstKey) return;
    const el = fieldRefs.current[firstKey];
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      const focusable = el.querySelector<HTMLElement>("input, textarea");
      focusable?.focus({ preventScroll: true });
    }
  };

  useEffect(() => {
    if (!ready) return;
    if (selectedId && providers.some((p) => p.id === selectedId)) return;
    setSelectedId(activeProviderId ?? providers[0]?.id ?? null);
  }, [ready, providers, selectedId, activeProviderId]);

  useEffect(() => {
    const p = providers.find((x) => x.id === selectedId) ?? null;
    setForm(p ? { ...p } : null);
    setErrors({});
    setShowKey(false);
  }, [selectedId, providers]);

  const isActive = useMemo(() => form?.id === activeProviderId, [form, activeProviderId]);

  const isComplete = useMemo(
    () =>
      !!form &&
      !!form.baseUrl.trim() &&
      !!form.path.trim() &&
      !!form.apiKey.trim() &&
      (form.models ?? []).some((m) => m.trim().length > 0),
    [form],
  );

  const update = <K extends keyof ProviderConfig>(key: K, value: ProviderConfig[K]) => {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  };

  const updateModel = (index: number, value: string) => {
    setForm((prev) =>
      prev
        ? { ...prev, models: prev.models.map((m, i) => (i === index ? value : m)) }
        : prev,
    );
  };

  const addModel = () => {
    setForm((prev) => (prev ? { ...prev, models: [...(prev.models ?? []), ""] } : prev));
  };

  const removeModel = (index: number) => {
    setForm((prev) =>
      prev ? { ...prev, models: prev.models.filter((_, i) => i !== index) } : prev,
    );
  };

  const validate = (): ProviderConfig | null => {
    if (!form) return null;
    const parsed = providerSchema.safeParse(form);
    if (!parsed.success) {
      const errs: FormErrors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof ProviderConfig;
        if (!errs[key]) errs[key] = issue.message;
      }
      setErrors(errs);
      scrollToFirstError(errs);
      return null;
    }
    setErrors({});
    const models = parsed.data.models;
    const current = (form.model ?? "").trim();
    const model = current && models.includes(current) ? current : models[0];
    return { ...form, ...parsed.data, models, model };
  };

  const handleSave = () => {
    const valid = validate();
    if (!valid) return;
    upsertProvider(valid);
    setForm(valid);
    toast.success("Provider berhasil disimpan.");
  };

  const handleTest = async () => {
    const valid = validate();
    if (!valid) {
      toast.error("Periksa kembali kolom yang ditandai.");
      return;
    }
    setTesting(true);
    try {
      await testConnection(valid);
      toast.success("Provider berhasil terhubung.");
    } catch (err) {
      const message = err instanceof ChatError ? err.message : "Test koneksi gagal.";
      toast.error(message);
    } finally {
      setTesting(false);
    }
  };

  const handleAdd = (preset?: Omit<ProviderConfig, "id">) => {
    const created: ProviderConfig = { id: uid(), ...(preset ?? PROVIDER_PRESETS[0]) };
    upsertProvider(created);
    setSelectedId(created.id);
    toast.success(`Provider "${created.name}" ditambahkan`);
  };

  const handleDelete = () => {
    if (!form) return;
    removeProvider(form.id);
    setSelectedId(null);
    toast.success("Provider dihapus");
  };

  const handleClearKey = () => {
    if (!form) return;
    update("apiKey", "");
    upsertProvider({ ...form, apiKey: "" });
    toast.success("API Key dihapus dari provider ini");
  };

  // Export all providers WITHOUT API keys
  const handleExportProviders = () => {
    const data = providers.map((p) => ({
      name: p.name,
      baseUrl: p.baseUrl,
      path: p.path,
      apiKey: "",
      model: p.model,
      models: p.models ?? (p.model ? [p.model] : []),
      systemPrompt: p.systemPrompt ?? "",
      temperature: p.temperature,
      maxTokens: p.maxTokens,
      stream: p.stream ?? true,
      directCall: p.directCall ?? false,
    }));
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "api-chat-providers.json";
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Pengaturan provider diekspor (tanpa API key)");
  };

  const handleImportFile = async (file: File) => {
    try {
      const text = await file.text();
      const parsed = importSchema.safeParse(JSON.parse(text));
      if (!parsed.success) {
        toast.error("File tidak valid: " + (parsed.error.issues[0]?.message ?? ""));
        return;
      }
      const normalized = parsed.data.map((p) => {
        const models =
          p.models && p.models.length > 0
            ? p.models.map((m) => m.trim()).filter(Boolean)
            : p.model
              ? [p.model.trim()].filter(Boolean)
              : [];
        return { ...p, models, model: models[0] ?? "" };
      });
      const count = importProviders(normalized as Omit<ProviderConfig, "id">[]);
      toast.success(`${count} provider diimpor. Isi API Key tiap provider.`);
    } catch {
      toast.error("Gagal membaca file JSON.");
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };

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

      {!ready ? (
        <div className="flex min-h-[60vh] items-center justify-center text-muted-foreground">
          <Loader2 className="size-6 animate-spin" />
        </div>
      ) : (
        <div className="mx-auto w-full max-w-5xl space-y-4 p-3 md:p-6">
          {/* Security notice */}
          <div className="flex items-start gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-foreground">
            <ShieldAlert className="mt-0.5 size-5 shrink-0 text-amber-500" />
            <p>
              API key disimpan di perangkat/browser kamu (localStorage), bukan di server kami.
              Jangan gunakan perangkat publik. Aplikasi ini hanya client chat — setiap user memakai
              API key miliknya sendiri.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-[260px_1fr]">
            {/* Provider list */}
            <section className="rounded-2xl border border-border bg-card p-3">
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-sm font-semibold">Provider</h2>
              </div>
              <ScrollArea className="max-h-64 md:max-h-[50vh]">
                <div className="flex flex-col gap-1 pr-1">
                  {providers.length === 0 && (
                    <p className="px-2 py-4 text-center text-xs text-muted-foreground">
                      Belum ada provider.
                    </p>
                  )}
                  {providers.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setSelectedId(p.id)}
                      className={cn(
                        "flex items-center justify-between gap-2 rounded-xl px-3 py-2 text-left text-sm transition-colors",
                        p.id === selectedId
                          ? "bg-accent text-accent-foreground"
                          : "hover:bg-accent/50",
                      )}
                    >
                      <span className="min-w-0 truncate">{p.name}</span>
                      {p.id === activeProviderId && (
                        <Check className="size-4 shrink-0 text-primary" />
                      )}
                    </button>
                  ))}
                </div>
              </ScrollArea>

              <div className="mt-3 space-y-2">
                <Button
                  variant="outline"
                  className="w-full justify-start gap-2 rounded-xl"
                  onClick={() => handleAdd()}
                >
                  <Plus className="size-4" />
                  Tambah Provider
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
                      <SelectItem key={p.name} value={p.name}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </section>

            {/* Editor */}
            <section className="rounded-2xl border border-border bg-card p-4 md:p-6">
              {!form ? (
                <p className="py-12 text-center text-sm text-muted-foreground">
                  Pilih atau tambah provider untuk mengedit.
                </p>
              ) : (
                <div className="space-y-5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="text-sm font-semibold">Konfigurasi API</h2>
                    {isActive ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2.5 py-1 text-xs font-medium text-primary">
                        <Check className="size-3.5" /> Provider aktif
                      </span>
                    ) : (
                      <Button
                        variant="secondary"
                        size="sm"
                        className="rounded-xl"
                        onClick={() => setActiveProviderId(form.id)}
                      >
                        Jadikan aktif
                      </Button>
                    )}
                  </div>

                  <Field
                    label="Provider Name"
                    error={errors.name}
                    fieldRef={(el) => (fieldRefs.current.name = el)}
                  >
                    <Input
                      value={form.name}
                      onChange={(e) => update("name", e.target.value)}
                      placeholder="BluesMinds"
                      className="rounded-xl"
                    />
                  </Field>

                  <Field
                    label="Base URL"
                    error={errors.baseUrl}
                    fieldRef={(el) => (fieldRefs.current.baseUrl = el)}
                  >
                    <Input
                      value={form.baseUrl}
                      onChange={(e) => update("baseUrl", e.target.value)}
                      placeholder="https://api.provider.com/v1"
                      inputMode="url"
                      className="rounded-xl"
                    />
                  </Field>

                  <Field
                    label="API Path"
                    error={errors.path}
                    fieldRef={(el) => (fieldRefs.current.path = el)}
                  >
                    <Input
                      value={form.path}
                      onChange={(e) => update("path", e.target.value)}
                      placeholder="/chat/completions"
                      className="rounded-xl"
                    />
                  </Field>

                  <Field
                    label="API Key"
                    error={errors.apiKey}
                    hint="Disimpan hanya di perangkat ini (localStorage)."
                    fieldRef={(el) => (fieldRefs.current.apiKey = el)}
                  >
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <Input
                          value={form.apiKey}
                          onChange={(e) => update("apiKey", e.target.value)}
                          type={showKey ? "text" : "password"}
                          placeholder="sk-..."
                          autoComplete="off"
                          className="rounded-xl pr-10"
                        />
                        <button
                          type="button"
                          onClick={() => setShowKey((v) => !v)}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                          aria-label={showKey ? "Sembunyikan" : "Tampilkan"}
                        >
                          {showKey ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                        </button>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="shrink-0 rounded-xl"
                        onClick={handleClearKey}
                        aria-label="Hapus API Key"
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </Field>

                  <Field
                    label="Models"
                    error={errors.models}
                    hint="Tambahkan satu atau beberapa model untuk API key ini. Mis. mistralai/mistral-large"
                    fieldRef={(el) => (fieldRefs.current.models = el)}
                  >
                    <div className="space-y-2">
                      {(form.models ?? []).map((m, i) => (
                        <div key={i} className="flex gap-2">
                          <Input
                            value={m}
                            onChange={(e) => updateModel(i, e.target.value)}
                            placeholder="contoh: openai/gpt-4o-mini"
                            className="rounded-xl"
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="shrink-0 rounded-xl"
                            onClick={() => removeModel(i)}
                            disabled={(form.models ?? []).length <= 1}
                            aria-label="Hapus model"
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </div>
                      ))}
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="gap-2 rounded-xl"
                        onClick={addModel}
                      >
                        <Plus className="size-4" />
                        Tambah Model
                      </Button>
                    </div>
                  </Field>

                  <Field
                    label="System Prompt (opsional)"
                    error={errors.systemPrompt}
                    hint="Instruksi default untuk AI, mis. 'You are a helpful assistant.'"
                    fieldRef={(el) => (fieldRefs.current.systemPrompt = el)}
                  >
                    <Textarea
                      value={form.systemPrompt ?? ""}
                      onChange={(e) => update("systemPrompt", e.target.value)}
                      placeholder="You are a helpful assistant."
                      rows={3}
                      className="rounded-xl"
                    />
                  </Field>

                  <div className="grid gap-5 sm:grid-cols-2">
                    <Field
                      label={`Temperature: ${form.temperature.toFixed(2)}`}
                      error={errors.temperature}
                      fieldRef={(el) => (fieldRefs.current.temperature = el)}
                    >
                      <Slider
                        value={[form.temperature]}
                        min={0}
                        max={2}
                        step={0.05}
                        onValueChange={([v]) => update("temperature", v)}
                        className="py-2"
                      />
                    </Field>

                    <Field
                      label="Max Tokens"
                      error={errors.maxTokens}
                      fieldRef={(el) => (fieldRefs.current.maxTokens = el)}
                    >
                      <Input
                        value={Number.isFinite(form.maxTokens) ? form.maxTokens : ""}
                        onChange={(e) => update("maxTokens", parseInt(e.target.value, 10) || 0)}
                        type="number"
                        min={1}
                        max={200000}
                        inputMode="numeric"
                        className="rounded-xl"
                      />
                    </Field>
                  </div>

                  <div className="flex items-center justify-between rounded-xl border border-border px-3 py-3">
                    <div className="pr-3">
                      <p className="text-sm font-medium">Enable Streaming</p>
                      <p className="text-xs text-muted-foreground">
                        Tampilkan jawaban AI token demi token saat tersedia.
                      </p>
                    </div>
                    <Switch
                      checked={form.stream ?? true}
                      onCheckedChange={(v) => update("stream", v)}
                    />
                  </div>

                  <div className="flex items-center justify-between rounded-xl border border-border px-3 py-3">
                    <div className="pr-3">
                      <p className="text-sm font-medium">Panggil langsung dari browser</p>
                      <p className="text-xs text-muted-foreground">
                        Default lewat proxy untuk hindari CORS. Aktifkan jika provider mengizinkan CORS.
                      </p>
                    </div>
                    <Switch
                      checked={!!form.directCall}
                      onCheckedChange={(v) => update("directCall", v)}
                    />
                  </div>

                  {!isComplete && (
                    <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-foreground">
                      Lengkapi Base URL, API Path, API Key, dan Model terlebih dahulu.
                    </p>
                  )}

                  <div className="flex flex-wrap gap-2 pt-1">
                    <Button onClick={handleSave} className="gap-2 rounded-xl">
                      <Save className="size-4" />
                      Save
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={handleTest}
                      disabled={testing || !isComplete}
                      className="gap-2 rounded-xl"
                    >
                      {testing ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Plug className="size-4" />
                      )}
                      Test Connection
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={handleDelete}
                      className="ml-auto gap-2 rounded-xl text-destructive hover:text-destructive"
                    >
                      <Trash2 className="size-4" />
                      Hapus Provider
                    </Button>
                  </div>
                </div>
              )}
            </section>
          </div>

          {/* Data & privacy */}
          <section className="rounded-2xl border border-border bg-card p-4 md:p-6">
            <h2 className="mb-1 text-sm font-semibold">Data & Privasi</h2>
            <p className="mb-4 text-xs text-muted-foreground">
              Kelola data yang tersimpan di perangkat ini.
            </p>
            <input
              ref={fileRef}
              type="file"
              accept="application/json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleImportFile(f);
              }}
            />
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" className="gap-2 rounded-xl" onClick={handleExportProviders}>
                <Download className="size-4" />
                Export tanpa API key
              </Button>
              <Button
                variant="outline"
                className="gap-2 rounded-xl"
                onClick={() => fileRef.current?.click()}
              >
                <Upload className="size-4" />
                Import settings
              </Button>

              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" className="gap-2 rounded-xl">
                    <KeyRound className="size-4" />
                    Clear API keys
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Hapus semua API key?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Semua API key pada setiap provider akan dikosongkan. Konfigurasi lain tetap ada.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Batal</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => {
                        clearAllApiKeys();
                        toast.success("Semua API key dihapus");
                      }}
                    >
                      Hapus API key
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>

              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="ghost" className="ml-auto gap-2 rounded-xl text-destructive hover:text-destructive">
                    <Trash2 className="size-4" />
                    Delete all data
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Hapus semua data?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Semua provider, API key, dan riwayat chat akan dihapus permanen dari perangkat ini.
                      Tindakan ini tidak bisa dibatalkan.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Batal</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => {
                        resetAllData();
                        setSelectedId(null);
                        toast.success("Semua data dihapus");
                      }}
                    >
                      Hapus semua
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  error,
  hint,
  children,
  fieldRef,
}: {
  label: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
  fieldRef?: (el: HTMLDivElement | null) => void;
}) {
  return (
    <div ref={fieldRef} className="space-y-1.5">
      <Label className="text-sm">{label}</Label>
      {children}
      {error ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}
