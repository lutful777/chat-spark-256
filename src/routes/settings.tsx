import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Check,
  Eye,
  EyeOff,
  Loader2,
  Plus,
  Plug,
  Save,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
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
import {
  PROVIDER_PRESETS,
  type ProviderConfig,
} from "@/lib/chat/types";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings — AI API Chat" },
      {
        name: "description",
        content: "Kelola konfigurasi provider: Base URL, API Path, API Key, dan Model.",
      },
      { property: "og:title", content: "Settings — AI API Chat" },
      {
        property: "og:description",
        content: "Kelola konfigurasi provider OpenAI-compatible Anda.",
      },
    ],
  }),
  component: SettingsPage,
});

const providerSchema = z.object({
  name: z.string().trim().min(1, "Nama provider wajib diisi").max(60, "Maksimal 60 karakter"),
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
    .refine((v) => v.startsWith("/"), "Path harus diawali '/' (contoh: /chat/completions)"),
  apiKey: z.string().trim().max(8192).optional().default(""),
  model: z.string().trim().max(256).optional().default(""),
  temperature: z.number().min(0, "Min 0").max(2, "Maks 2"),
  maxTokens: z
    .number()
    .int("Harus bilangan bulat")
    .min(1, "Min 1")
    .max(200000, "Maks 200000"),
  directCall: z.boolean(),
});

type FormErrors = Partial<Record<keyof ProviderConfig, string>>;

function SettingsPage() {
  const {
    ready,
    providers,
    activeProviderId,
    setActiveProviderId,
    upsertProvider,
    removeProvider,
  } = useChatStore();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<ProviderConfig | null>(null);
  const [errors, setErrors] = useState<FormErrors>({});
  const [showKey, setShowKey] = useState(false);
  const [testing, setTesting] = useState(false);

  // choose a provider to edit
  useEffect(() => {
    if (!ready) return;
    if (selectedId && providers.some((p) => p.id === selectedId)) return;
    const next = activeProviderId ?? providers[0]?.id ?? null;
    setSelectedId(next);
  }, [ready, providers, selectedId, activeProviderId]);

  // sync form with selected provider
  useEffect(() => {
    const p = providers.find((x) => x.id === selectedId) ?? null;
    setForm(p ? { ...p } : null);
    setErrors({});
    setShowKey(false);
  }, [selectedId, providers]);

  const isActive = useMemo(
    () => form?.id === activeProviderId,
    [form, activeProviderId],
  );

  const update = <K extends keyof ProviderConfig>(key: K, value: ProviderConfig[K]) => {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
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
      return null;
    }
    setErrors({});
    return { ...form, ...parsed.data };
  };

  const handleSave = () => {
    const valid = validate();
    if (!valid) {
      toast.error("Periksa kembali kolom yang ditandai.");
      return;
    }
    upsertProvider(valid);
    toast.success("Settings disimpan");
  };

  const handleTest = async () => {
    const valid = validate();
    if (!valid) {
      toast.error("Periksa kembali kolom yang ditandai.");
      return;
    }
    if (!valid.apiKey.trim()) {
      toast.error("Isi API Key dulu untuk Test Connection.");
      return;
    }
    if (!valid.model.trim()) {
      toast.error("Isi Model dulu untuk Test Connection.");
      return;
    }
    setTesting(true);
    try {
      await testConnection(valid);
      toast.success("Koneksi berhasil! Provider siap dipakai.");
    } catch (err) {
      const message = err instanceof ChatError ? err.message : "Test koneksi gagal.";
      toast.error(message);
    } finally {
      setTesting(false);
    }
  };

  const handleAdd = (preset?: Omit<ProviderConfig, "id">) => {
    const created: ProviderConfig = {
      id: uid(),
      ...(preset ?? PROVIDER_PRESETS[0]),
    };
    upsertProvider(created);
    setSelectedId(created.id);
    toast.success(`Provider "${created.name}" ditambahkan`);
  };

  const handleDelete = () => {
    if (!form) return;
    if (providers.length <= 1) {
      toast.error("Minimal satu provider harus ada.");
      return;
    }
    removeProvider(form.id);
    setSelectedId(null);
    toast.success("Provider dihapus");
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
      <div className="mx-auto grid w-full max-w-5xl gap-4 p-3 md:grid-cols-[260px_1fr] md:p-6">
        {/* Provider list */}
        <section className="rounded-2xl border border-border bg-card p-3">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Provider</h2>
          </div>
          <ScrollArea className="max-h-64 md:max-h-[60vh]">
            <div className="flex flex-col gap-1 pr-1">
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

              <Field label="Provider name" error={errors.name}>
                <Input
                  value={form.name}
                  onChange={(e) => update("name", e.target.value)}
                  placeholder="Custom API"
                  className="rounded-xl"
                />
              </Field>

              <Field label="Base URL" error={errors.baseUrl}>
                <Input
                  value={form.baseUrl}
                  onChange={(e) => update("baseUrl", e.target.value)}
                  placeholder="https://api.bluesminds.com/v1"
                  inputMode="url"
                  className="rounded-xl"
                />
              </Field>

              <Field label="API Path" error={errors.path}>
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
              >
                <div className="relative">
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
              </Field>

              <Field label="Model name" error={errors.model} hint="Isi manual, mis. gpt-4o-mini">
                <Input
                  value={form.model}
                  onChange={(e) => update("model", e.target.value)}
                  placeholder="nama-model"
                  className="rounded-xl"
                />
              </Field>

              <div className="grid gap-5 sm:grid-cols-2">
                <Field
                  label={`Temperature: ${form.temperature.toFixed(2)}`}
                  error={errors.temperature}
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

                <Field label="Max tokens" error={errors.maxTokens}>
                  <Input
                    value={Number.isFinite(form.maxTokens) ? form.maxTokens : ""}
                    onChange={(e) =>
                      update("maxTokens", parseInt(e.target.value, 10) || 0)
                    }
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

              <div className="flex flex-wrap gap-2 pt-1">
                <Button onClick={handleSave} className="gap-2 rounded-xl">
                  <Save className="size-4" />
                  Save Settings
                </Button>
                <Button
                  variant="secondary"
                  onClick={handleTest}
                  disabled={testing}
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
                  Hapus
                </Button>
              </div>
            </div>
          )}
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
}: {
  label: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
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