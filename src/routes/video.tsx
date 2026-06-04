import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, type FocusEvent } from "react";
import {
  ArrowLeft,
  Download,
  Loader2,
  Settings,
  Upload,
  Video as VideoIcon,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MediaNav } from "@/components/media/MediaNav";
import { useChatStore } from "@/lib/chat/store";
import {
  MediaError,
  downloadMedia,
  extractLastFrame,
  fileToDataUrl,
  mergeVideos,
  photoToVideo,
  validateImageFile,
} from "@/lib/chat/media";

export const Route = createFileRoute("/video")({
  head: () => ({
    meta: [
      { title: "Video — AI Chat Exploit" },
      {
        name: "description",
        content: "Ubah foto menjadi video dengan AI memakai API key Anda sendiri.",
      },
      { property: "og:title", content: "Video — AI Chat Exploit" },
      {
        property: "og:description",
        content: "Foto ke video AI lewat provider Anda, dengan polling status otomatis.",
      },
    ],
  }),
  component: VideoPage,
});

function VideoPage() {
  const { ready, providers, activeProviderId } = useChatStore();

  const [providerId, setProviderId] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [results, setResults] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!ready) return;
    if (providerId && providers.some((p) => p.id === providerId)) return;
    setProviderId(activeProviderId ?? providers[0]?.id ?? null);
  }, [ready, providers, providerId, activeProviderId]);

  const provider = useMemo(
    () => providers.find((p) => p.id === providerId) ?? null,
    [providers, providerId],
  );

  const configured =
    !!provider?.apiKey.trim() && !!provider?.videoModel?.trim() && !!provider?.videoPath?.trim();

  const handlePromptFocus = (event: FocusEvent<HTMLTextAreaElement>) => {
    const target = event.currentTarget;
    window.setTimeout(() => {
      target.scrollIntoView({ block: "center", behavior: "smooth" });
    }, 180);
  };

  const handleFile = async (file: File) => {
    const validationError = validateImageFile(file);
    if (validationError) {
      setError(validationError);
      toast.error(validationError);
      return;
    }
    try {
      const dataUrl = await fileToDataUrl(file);
      setSourceUrl(dataUrl);
      setError(null);
    } catch {
      toast.error("Gagal membaca file foto.");
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const handleStop = () => {
    abortRef.current?.abort();
  };

  const handleSubmit = async () => {
    setError(null);
    if (!provider) {
      toast.error("Tambahkan provider di Settings terlebih dahulu.");
      return;
    }
    if (!sourceUrl) {
      setError("Upload foto terlebih dahulu.");
      return;
    }
    if (!prompt.trim()) {
      setError("Tulis prompt video terlebih dahulu.");
      return;
    }
    if (!configured) {
      const msg = "Lengkapi Video Generate Path & Model di Settings.";
      setError(msg);
      toast.error(msg);
      return;
    }

    setLoading(true);
    setResults([]);
    setStatus("Mengirim permintaan…");
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      setStatus("Part 1: Mengirim permintaan…");
      const url1 = await photoToVideo({
        provider,
        prompt: prompt.trim(),
        imageDataUrl: sourceUrl,
        signal: controller.signal,
        onStatus: (m) => setStatus(`Part 1: ${m}`),
      });

      setStatus("Mengambil frame terakhir Part 1…");
      const lastFrame = await extractLastFrame(url1, controller.signal);

      setStatus("Part 2: Mengirim permintaan…");
      const url2 = await photoToVideo({
        provider,
        prompt: prompt.trim(),
        imageDataUrl: lastFrame,
        signal: controller.signal,
        onStatus: (m) => setStatus(`Part 2: ${m}`),
      });

      setStatus("Menggabungkan video di server…");
      const mergedUrl = await mergeVideos(url1, url2, controller.signal);
      setResults([mergedUrl]);
      setStatus(null);
    } catch (err) {
      const message = err instanceof MediaError ? err.message : "Permintaan gagal.";
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
      abortRef.current = null;
    }
  };

  return (
    <div className="min-h-[100dvh] bg-background text-foreground">
      <header className="sticky top-0 z-10 flex items-center gap-2 border-b border-border bg-background/80 px-3 py-3 backdrop-blur">
        <Button asChild variant="ghost" size="icon" aria-label="Kembali ke chat">
          <Link to="/">
            <ArrowLeft className="size-5" />
          </Link>
        </Button>
        <h1 className="text-base font-semibold">Video</h1>
        <div className="ml-auto flex items-center gap-2">
          <MediaNav className="hidden sm:inline-flex" />
          <Button asChild variant="ghost" size="icon" aria-label="Settings">
            <Link to="/settings">
              <Settings className="size-5" />
            </Link>
          </Button>
        </div>
      </header>

      <div className="border-b border-border px-3 py-2 sm:hidden">
        <MediaNav className="w-full justify-between" />
      </div>

      {!ready ? (
        <div className="flex min-h-[60vh] items-center justify-center text-muted-foreground">
          <Loader2 className="size-6 animate-spin" />
        </div>
      ) : (
        <div
          className="mx-auto w-full max-w-3xl space-y-4 p-3 md:p-6"
          style={{ paddingBottom: "calc(13rem + var(--keyboard-offset) + env(safe-area-inset-bottom))" }}
        >
          {providers.length === 0 ? (
            <NoProvider />
          ) : (
            <div className="space-y-4 rounded-2xl border border-border bg-card p-4 md:p-6">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Provider & Model</label>
                <Select value={providerId ?? undefined} onValueChange={setProviderId}>
                  <SelectTrigger className="rounded-xl">
                    <SelectValue placeholder="Pilih provider" />
                  </SelectTrigger>
                  <SelectContent>
                    {providers.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                        {p.videoModel ? ` · ${p.videoModel}` : " · (model belum diatur)"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium">Foto sumber</label>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleFile(f);
                  }}
                />
                {sourceUrl ? (
                  <div className="relative inline-block">
                    <img
                      src={sourceUrl}
                      alt="Foto sumber"
                      className="max-h-56 rounded-xl border border-border object-contain"
                    />
                    <Button
                      type="button"
                      size="icon"
                      variant="secondary"
                      className="absolute right-2 top-2 size-8 rounded-full"
                      onClick={() => setSourceUrl(null)}
                      aria-label="Hapus foto"
                    >
                      <X className="size-4" />
                    </Button>
                  </div>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full justify-start gap-2 rounded-xl"
                    onClick={() => fileRef.current?.click()}
                  >
                    <Upload className="size-4" />
                    Upload foto (PNG/JPG/WEBP, maks 8MB)
                  </Button>
                )}
              </div>

              {error && (
                <p className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                  {error}
                </p>
              )}
              {!configured && !error && (
                <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-foreground">
                  Provider ini belum dikonfigurasi untuk video. Atur Video Path & Model di Settings.
                </p>
              )}

              {loading && (
                <Button variant="secondary" onClick={handleStop} className="rounded-xl">
                  Batalkan
                </Button>
              )}
            </div>
          )}

          {(loading || results.length > 0) && (
            <div className="space-y-3 rounded-2xl border border-border bg-card p-4 md:p-6">
              <h2 className="text-sm font-semibold">Hasil</h2>
              {loading ? (
                <div className="flex h-40 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border text-muted-foreground">
                  <Loader2 className="size-5 animate-spin" />
                  <span className="text-xs">{status ?? "Memproses…"}</span>
                </div>
              ) : results.length > 0 ? (
                <div className="space-y-2">
                  <video
                    src={results[0]}
                    controls
                    className="max-h-[60vh] w-full rounded-xl border border-border"
                  />
                  <Button
                    variant="outline"
                    className="gap-2 rounded-xl"
                    onClick={() => downloadMedia(results[0], `video-${Date.now()}.mp4`)}
                  >
                    <Download className="size-4" />
                    Download video
                  </Button>
                </div>
              ) : null}
            </div>
          )}
        </div>
      )}

      {ready && providers.length > 0 && (
        <form
          className="keyboard-safe-input px-3 pb-3 pt-2"
          onSubmit={(event) => {
            event.preventDefault();
            handleSubmit();
          }}
        >
          <div className="mx-auto flex w-full max-w-3xl items-end gap-2 rounded-3xl border border-border bg-card/90 p-2 shadow-2xl backdrop-blur">
            <div className="min-w-0 flex-1 space-y-1">
              <label className="px-2 text-xs font-medium text-muted-foreground">Prompt video</label>
              <Textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onFocus={handlePromptFocus}
                rows={2}
                placeholder="contoh: kamera perlahan zoom in, daun bergerak tertiup angin"
                className="min-h-[3.3rem] resize-none rounded-2xl px-3 py-2 text-base"
              />
            </div>
            <Button type="submit" disabled={loading} className="h-12 shrink-0 gap-2 rounded-2xl px-4">
              {loading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <VideoIcon className="size-4" />
              )}
              <span className="hidden xs:inline sm:inline">Foto ke Video</span>
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}

function NoProvider() {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border p-10 text-center">
      <p className="text-sm text-muted-foreground">
        Belum ada provider. Tambahkan provider dan API key Anda di Settings.
      </p>
      <Button asChild variant="outline" className="rounded-xl">
        <Link to="/settings">
          <Settings className="mr-2 size-4" /> Buka Settings
        </Link>
      </Button>
    </div>
  );
}
