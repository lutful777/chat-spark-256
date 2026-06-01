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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { useChatStore } from "@/lib/chat/store";
import { uid } from "@/lib/chat/storage";
import { ChatError, testConnection } from "@/lib/chat/api";
import {
  MediaError,
  testImageConnection,
  testVideoConnection,
} from "@/lib/chat/media";
import { PROVIDER_PRESETS, type ProviderConfig } from "@/lib/chat/types";
import { OutlookConnect } from "@/components/outlook/OutlookConnect";

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

const optionalUrl = z
  .string()
  .trim()
  .max(2048)
  .optional()
  .refine((v) => !v || /^https?:\/\//.test(v), "URL tidak valid (harus diawali http/https)");
const optionalPath = z.string().trim().max(512).optional();
const optionalModel = z.string().trim().max(256).optional();

const chatSchema = z.object({
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

const imageSchema = z.object({
  imageBaseUrl: optionalUrl,
  imageApiKey: z.string().trim().max(8192).optional().default(""),
  imagePath: optionalPath,
  imageModel: optionalModel,
  imageEditPath: optionalPath,
  imageEditModel: optionalModel,
});

const videoSchema = z.object({
  videoBaseUrl: optionalUrl,
  videoApiKey: z.string().trim().max(8192).optional().default(""),
  videoPath: optionalPath,
  videoModel: optionalModel,
  videoStatusPath: optionalPath,
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
    imageBaseUrl: z.string().trim().max(2048).optional(),
    imageApiKey: z.string().max(8192).optional().default(""),
    imagePath: z.string().trim().max(512).optional(),
    imageModel: z.string().trim().max(256).optional(),
    imageEditPath: z.string().trim().max(512).optional(),
    imageEditModel: z.string().trim().max(256).optional(),
    videoBaseUrl: z.string().trim().max(2048).optional(),
    videoApiKey: z.string().max(8192).optional().default(""),
    videoPath: z.string().trim().max(512).optional(),
    videoModel: z.string().trim().max(256).optional(),
    videoStatusPath: z.string().trim().max(512).optional(),
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
  const [showImageKey, setShowImageKey] = useState(false);
  const [showVideoKey, setShowVideoKey] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
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

  const applyErrors = (issues: z.ZodIssue[]) => {
    const errs: FormErrors = {};
    for (const issue of issues) {
      const key = issue.path[0] as keyof ProviderConfig;
      if (!errs[key]) errs[key] = issue.message;
    }
    setErrors(errs);
    scrollToFirstError(errs);
  };

  /** Validate only the Chat API fields and return a merged provider. */
  const validateChat = (): ProviderConfig | null => {
    if (!form) return null;
    const parsed = chatSchema.safeParse(form);
    if (!parsed.success) {
      applyErrors(parsed.error.issues);
      return null;
    }
    setErrors({});
    const models = parsed.data.models;
    const current = (form.model ?? "").trim();
    const model = current && models.includes(current) ? current : models[0];
    return { ...form, ...parsed.data, models, model };
  };

  /** Validate only the Image API fields and return a merged provider. */
  const validateImage = (): ProviderConfig | null => {
    if (!form) return null;
    const parsed = imageSchema.safeParse(form);
    if (!parsed.success) {
      applyErrors(parsed.error.issues);
      return null;
    }
    setErrors({});
    return { ...form, ...parsed.data };
  };

  /** Validate only the Video API fields and return a merged provider. */
  const validateVideo = (): ProviderConfig | null => {
    if (!form) return null;
    const parsed = videoSchema.safeParse(form);
    if (!parsed.success) {
      applyErrors(parsed.error.issues);
      return null;
    }
    setErrors({});
    return { ...form, ...parsed.data };
  };

  const persist = (valid: ProviderConfig, label: string) => {
    upsertProvider(valid);
    setForm(valid);
    toast.success(`${label} disimpan.`);
  };

  const handleSaveChat = () => {
    const valid = validateChat();
    if (valid) persist(valid, "Chat API");
  };
  const handleSaveImage = () => {
    const valid = validateImage();
    if (valid) persist(valid, "Image API");
  };
  const handleSaveVideo = () => {
    const valid = validateVideo();
    if (valid) persist(valid, "Video API");
  };

  const handleTestImage = async () => {
    const valid = validateImage();
    if (!valid) {
      toast.error("Periksa kembali kolom yang ditandai.");
      return;
    }
    const effectiveKey = valid.imageApiKey?.trim() || valid.apiKey.trim();
    if (!effectiveKey) {
      toast.error("Isi Image API Key (atau Chat API Key sebagai fallback) terlebih dahulu.");
      return;
    }
    if (!valid.imagePath?.trim() || !valid.imageModel?.trim()) {
      toast.error("Isi Generate Path dan Generate Model terlebih dahulu.");
      return;
    }
    setTesting("image");
    try {
      await testImageConnection({ provider: valid });
      toast.success("Image API berhasil terhubung.");
    } catch (err) {
      toast.error(err instanceof MediaError ? err.message : "Test koneksi gagal.");
    } finally {
      setTesting(null);
    }
  };

  const handleTestVideo = async () => {
    const valid = validateVideo();
    if (!valid) {
      toast.error("Periksa kembali kolom yang ditandai.");
      return;
    }
    const effectiveKey = valid.videoApiKey?.trim() || valid.apiKey.trim();
    if (!effectiveKey) {
      toast.error("Isi Video API Key (atau Chat API Key sebagai fallback) terlebih dahulu.");
      return;
    }
    if (!valid.videoPath?.trim() || !valid.videoModel?.trim()) {
      toast.error("Isi Video Generate Path dan Video Model terlebih dahulu.");
      return;
    }
    setTesting("video");
    try {
      await testVideoConnection({ provider: valid });
      toast.success("Video API berhasil terhubung.");
    } catch (err) {
      toast.error(err instanceof MediaError ? err.message : "Test koneksi gagal.");
    } finally {
      setTesting(null);
    }
  };

  const handleTestChatModel = async (idx: number, model: string) => {
    const valid = validateChat();
    if (!valid) {
      toast.error("Periksa kembali kolom yang ditandai.");
      return;
    }
    if (!model.trim()) {
      toast.error("Nama model tidak boleh kosong.");
      return;
    }
    const testKey = `chat-${idx}`;
    setTesting(testKey);
    try {
      await testConnection({ ...valid, model: model.trim() });
      toast.success(`Model "${model.trim()}" berhasil terhubung.`);
    } catch (err) {
      toast.error(err instanceof ChatError ? err.message : "Test koneksi gagal.");
    } finally {
      setTesting(null);
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
      imageBaseUrl: p.imageBaseUrl ?? "",
      imageApiKey: "",
      imagePath: p.imagePath ?? "",
      imageModel: p.imageModel ?? "",
      imageEditPath: p.imageEditPath ?? "",
      imageEditModel: p.imageEditModel ?? "",
      videoBaseUrl: p.videoBaseUrl ?? "",
      videoApiKey: "",
      videoPath: p.videoPath ?? "",
      videoModel: p.videoModel ?? "",
      videoStatusPath: p.videoStatusPath ?? "",
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

                  <Tabs defaultValue="chat" className="w-full">
                    <TabsList className="grid w-full grid-cols-3 rounded-xl">
                      <TabsTrigger value="chat" className="rounded-lg text-xs sm:text-sm">
                        Chat API
                      </TabsTrigger>
                      <TabsTrigger value="image" className="rounded-lg text-xs sm:text-sm">
                        Image API
                      </TabsTrigger>
                      <TabsTrigger value="video" className="rounded-lg text-xs sm:text-sm">
                        Video API
                      </TabsTrigger>
                    </TabsList>

                    {/* ---------------- Chat API ---------------- */}
                    <TabsContent value="chat" className="mt-4 space-y-5">
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
                        label="Chat Models"
                        error={errors.models}
                        hint="Tambahkan satu atau beberapa model. Klik Test untuk uji koneksi per model."
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
                                variant="secondary"
                                size="icon"
                                className="shrink-0 rounded-xl"
                                onClick={() => handleTestChatModel(i, m)}
                                disabled={testing !== null || !m.trim() || !isComplete}
                                aria-label={`Test model ${m}`}
                                title="Test koneksi model ini"
                              >
                                {testing === `chat-${i}` ? (
                                  <Loader2 className="size-4 animate-spin" />
                                ) : (
                                  <Plug className="size-4" />
                                )}
                              </Button>
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
                        <Button onClick={handleSaveChat} className="gap-2 rounded-xl">
                          <Save className="size-4" />
                          Save
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
                    </TabsContent>

                    {/* ---------------- Image API ---------------- */}
                    <TabsContent value="image" className="mt-4 space-y-5">
                      <p className="text-xs text-muted-foreground">
                        Opsional. Jika Image API Key dikosongkan, akan memakai Chat API Key sebagai fallback.
                      </p>

                      <Field
                        label="Base URL (opsional)"
                        error={errors.imageBaseUrl}
                        hint="Kosongkan untuk memakai Base URL dari tab Chat API."
                        fieldRef={(el) => (fieldRefs.current.imageBaseUrl = el)}
                      >
                        <Input
                          value={form.imageBaseUrl ?? ""}
                          onChange={(e) => update("imageBaseUrl", e.target.value)}
                          placeholder="https://api.provider.com/v1"
                          inputMode="url"
                          className="rounded-xl"
                        />
                      </Field>

                      <Field
                        label="API Path"
                        error={errors.imagePath}
                        fieldRef={(el) => (fieldRefs.current.imagePath = el)}
                      >
                        <Input
                          value={form.imagePath ?? ""}
                          onChange={(e) => update("imagePath", e.target.value)}
                          placeholder="/images/generations"
                          className="rounded-xl"
                        />
                      </Field>

                      <Field
                        label="Image API Key"
                        error={errors.imageApiKey}
                        hint="Disimpan di perangkat ini (localStorage). Kosongkan untuk memakai Chat API Key."
                        fieldRef={(el) => (fieldRefs.current.imageApiKey = el)}
                      >
                        <div className="flex gap-2">
                          <div className="relative flex-1">
                            <Input
                              value={form.imageApiKey ?? ""}
                              onChange={(e) => update("imageApiKey", e.target.value)}
                              type={showImageKey ? "text" : "password"}
                              placeholder="sk-... (opsional)"
                              autoComplete="off"
                              className="rounded-xl pr-10"
                            />
                            <button
                              type="button"
                              onClick={() => setShowImageKey((v) => !v)}
                              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                              aria-label={showImageKey ? "Sembunyikan" : "Tampilkan"}
                            >
                              {showImageKey ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                            </button>
                          </div>
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="shrink-0 rounded-xl"
                            onClick={() => update("imageApiKey", "")}
                            aria-label="Hapus Image API Key"
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </div>
                      </Field>

                      <Field
                        label="Model"
                        error={errors.imageModel}
                        fieldRef={(el) => (fieldRefs.current.imageModel = el)}
                      >
                        <Input
                          value={form.imageModel ?? ""}
                          onChange={(e) => update("imageModel", e.target.value)}
                          placeholder="contoh: gpt-image-1"
                          className="rounded-xl"
                        />
                      </Field>

                      <div className="grid gap-4 sm:grid-cols-2">
                        <Field
                          label="Edit Path (opsional)"
                          error={errors.imageEditPath}
                          fieldRef={(el) => (fieldRefs.current.imageEditPath = el)}
                        >
                          <Input
                            value={form.imageEditPath ?? ""}
                            onChange={(e) => update("imageEditPath", e.target.value)}
                            placeholder="/images/edits"
                            className="rounded-xl"
                          />
                        </Field>
                        <Field
                          label="Edit Model (opsional)"
                          error={errors.imageEditModel}
                          fieldRef={(el) => (fieldRefs.current.imageEditModel = el)}
                        >
                          <Input
                            value={form.imageEditModel ?? ""}
                            onChange={(e) => update("imageEditModel", e.target.value)}
                            placeholder="contoh: gpt-image-1"
                            className="rounded-xl"
                          />
                        </Field>
                      </div>

                      <div className="flex flex-wrap gap-2 pt-1">
                        <Button onClick={handleSaveImage} className="gap-2 rounded-xl">
                          <Save className="size-4" />
                          Save
                        </Button>
                        <Button
                          variant="secondary"
                          onClick={handleTestImage}
                          disabled={testing !== null}
                          className="gap-2 rounded-xl"
                        >
                          {testing === "image" ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : (
                            <Plug className="size-4" />
                          )}
                          Test Connection
                        </Button>
                      </div>
                    </TabsContent>

                    {/* ---------------- Video API ---------------- */}
                    <TabsContent value="video" className="mt-4 space-y-5">
                      <p className="text-xs text-muted-foreground">
                        Opsional. Jika Video API Key dikosongkan, akan memakai Chat API Key sebagai fallback.
                      </p>

                      <Field
                        label="Base URL (opsional)"
                        error={errors.videoBaseUrl}
                        hint="Kosongkan untuk memakai Base URL dari tab Chat API."
                        fieldRef={(el) => (fieldRefs.current.videoBaseUrl = el)}
                      >
                        <Input
                          value={form.videoBaseUrl ?? ""}
                          onChange={(e) => update("videoBaseUrl", e.target.value)}
                          placeholder="https://api.provider.com/v1"
                          inputMode="url"
                          className="rounded-xl"
                        />
                      </Field>

                      <Field
                        label="API Path"
                        error={errors.videoPath}
                        fieldRef={(el) => (fieldRefs.current.videoPath = el)}
                      >
                        <Input
                          value={form.videoPath ?? ""}
                          onChange={(e) => update("videoPath", e.target.value)}
                          placeholder="/videos/generations"
                          className="rounded-xl"
                        />
                      </Field>

                      <Field
                        label="Video API Key"
                        error={errors.videoApiKey}
                        hint="Disimpan di perangkat ini (localStorage). Kosongkan untuk memakai Chat API Key."
                        fieldRef={(el) => (fieldRefs.current.videoApiKey = el)}
                      >
                        <div className="flex gap-2">
                          <div className="relative flex-1">
                            <Input
                              value={form.videoApiKey ?? ""}
                              onChange={(e) => update("videoApiKey", e.target.value)}
                              type={showVideoKey ? "text" : "password"}
                              placeholder="sk-... (opsional)"
                              autoComplete="off"
                              className="rounded-xl pr-10"
                            />
                            <button
                              type="button"
                              onClick={() => setShowVideoKey((v) => !v)}
                              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                              aria-label={showVideoKey ? "Sembunyikan" : "Tampilkan"}
                            >
                              {showVideoKey ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                            </button>
                          </div>
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="shrink-0 rounded-xl"
                            onClick={() => update("videoApiKey", "")}
                            aria-label="Hapus Video API Key"
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </div>
                      </Field>

                      <Field
                        label="Model"
                        error={errors.videoModel}
                        fieldRef={(el) => (fieldRefs.current.videoModel = el)}
                      >
                        <Input
                          value={form.videoModel ?? ""}
                          onChange={(e) => update("videoModel", e.target.value)}
                          placeholder="contoh: veo-3"
                          className="rounded-xl"
                        />
                      </Field>

                      <Field
                        label="Status Path (opsional)"
                        error={errors.videoStatusPath}
                        hint="Untuk polling request_id. Pakai {request_id} sbg placeholder, mis. /videos/status/{request_id}"
                        fieldRef={(el) => (fieldRefs.current.videoStatusPath = el)}
                      >
                        <Input
                          value={form.videoStatusPath ?? ""}
                          onChange={(e) => update("videoStatusPath", e.target.value)}
                          placeholder="/videos/status/{request_id}"
                          className="rounded-xl"
                        />
                      </Field>

                      <div className="flex flex-wrap gap-2 pt-1">
                        <Button onClick={handleSaveVideo} className="gap-2 rounded-xl">
                          <Save className="size-4" />
                          Save
                        </Button>
                        <Button
                          variant="secondary"
                          onClick={handleTestVideo}
                          disabled={testing !== null}
                          className="gap-2 rounded-xl"
                        >
                          {testing === "video" ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : (
                            <Plug className="size-4" />
                          )}
                          Test Connection
                        </Button>
                      </div>
                    </TabsContent>
                  </Tabs>
                </div>
              )}
            </section>
          </div>

          {/* Microsoft Outlook (MSAL / OAuth) */}
          <OutlookConnect />

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
