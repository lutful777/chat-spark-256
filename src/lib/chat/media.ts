import type { ProviderConfig } from "./types";

export class MediaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MediaError";
  }
}

/* ---------------- error mapping ---------------- */

function mapStatusToMessage(status: number, body: string): string {
  let detail = "";
  try {
    const parsed = JSON.parse(body);
    detail = parsed?.error?.message ?? parsed?.error ?? parsed?.message ?? "";
    if (typeof detail !== "string") detail = JSON.stringify(detail);
  } catch {
    detail = body.slice(0, 200);
  }

  switch (status) {
    case 400:
      return `Permintaan ditolak (400). Model mungkin tidak tersedia atau parameter salah.${
        detail ? ` Detail: ${detail}` : ""
      }`;
    case 401:
      return "API key salah atau tidak diizinkan (401). Periksa kembali API Key Anda.";
    case 403:
      return "Akses ditolak (403). API key tidak punya izin untuk model/endpoint ini.";
    case 404:
      return "Endpoint tidak ditemukan (404). Periksa Base URL dan Path media.";
    case 402:
      return "Saldo/credit habis (402). Top up credit pada provider Anda.";
    case 413:
      return "File terlalu besar (413). Coba kompres atau gunakan foto beresolusi lebih kecil.";
    case 415:
      return "Format foto tidak didukung (415). Gunakan PNG, JPG, atau WEBP.";
    case 422:
      return `Parameter tidak valid (422). Periksa model dan input.${
        detail ? ` Detail: ${detail}` : ""
      }`;
    case 429:
      return "Terlalu banyak permintaan atau credit habis (429). Coba lagi nanti.";
    case 500:
    case 502:
    case 503:
    case 504:
      return `Server provider bermasalah (${status}). ${detail || "Coba lagi nanti."}`;
    default:
      return `Gagal (${status}).${detail ? ` ${detail}` : ""}`;
  }
}

/* ---------------- proxy call ---------------- */

interface ProxyResult {
  /** object URL when the upstream returned binary image/video */
  url: string | null;
  /** parsed JSON body when the upstream returned JSON */
  json: Record<string, unknown> | null;
}

interface ProxyArgs {
  method?: "GET" | "POST";
  baseUrl: string;
  path: string;
  apiKey: string;
  payload?: unknown;
  signal?: AbortSignal;
}

async function callProxy({
  method = "POST",
  baseUrl,
  path,
  apiKey,
  payload,
  signal,
}: ProxyArgs): Promise<ProxyResult> {
  let res: Response;
  try {
    res = await fetch("/api/public/media-proxy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ method, baseUrl, path, apiKey, payload }),
      signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new MediaError("Permintaan dibatalkan.");
    }
    throw new MediaError("Gagal menghubungi server. Periksa koneksi Anda.");
  }

  const contentType = res.headers.get("Content-Type") ?? "";

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new MediaError(mapStatusToMessage(res.status, text));
  }

  if (contentType.startsWith("image/") || contentType.startsWith("video/")) {
    const blob = await res.blob();
    return { url: URL.createObjectURL(blob), json: null };
  }

  const text = await res.text();
  try {
    return { url: null, json: JSON.parse(text) as Record<string, unknown> };
  } catch {
    // Non-JSON, non-binary — surface as error so the user can fix the path.
    throw new MediaError("Response provider tidak dikenali (bukan JSON/gambar/video).");
  }
}

/* ---------------- extractors ---------------- */

type AnyRecord = Record<string, unknown>;

function get(obj: unknown, path: string[]): unknown {
  let cur: unknown = obj;
  for (const key of path) {
    if (cur && typeof cur === "object" && key in (cur as AnyRecord)) {
      cur = (cur as AnyRecord)[key];
    } else {
      return undefined;
    }
  }
  return cur;
}

function asString(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

function b64ToDataUrl(b64: string, mime = "image/png"): string {
  return b64.startsWith("data:") ? b64 : `data:${mime};base64,${b64}`;
}

function extractImage(json: AnyRecord | null): string | null {
  if (!json) return null;
  const d0 = get(json, ["data", "0"]) ?? (Array.isArray(json.data) ? json.data[0] : undefined);
  const b64 =
    asString(get(d0, ["b64_json"])) ?? asString(get(json, ["b64_json"]));
  if (b64) return b64ToDataUrl(b64);
  const url =
    asString(get(d0, ["url"])) ??
    asString(get(json, ["url"])) ??
    asString(get(json, ["image", "url"]));
  if (url) return url;
  const inlineImage = get(json, ["image"]);
  if (typeof inlineImage === "string" && inlineImage.length > 0) {
    return inlineImage.startsWith("data:") || inlineImage.startsWith("http")
      ? inlineImage
      : b64ToDataUrl(inlineImage);
  }
  // OpenRouter / Gemini chat-style image response
  const chatImg = asString(
    get(json, ["choices", "0", "message", "images", "0", "image_url", "url"]),
  );
  if (chatImg) return chatImg;
  return null;
}

function extractVideoUrl(json: AnyRecord | null): string | null {
  if (!json) return null;
  const candidates = [
    get(json, ["data", "0", "url"]),
    get(json, ["video", "url"]),
    get(json, ["output", "url"]),
    get(json, ["result", "url"]),
    get(json, ["url"]),
    get(json, ["video_url"]),
    get(json, ["result", "video_url"]),
  ];
  for (const c of candidates) {
    const s = asString(c);
    if (s) return s;
  }
  const output = get(json, ["output"]);
  if (Array.isArray(output) && typeof output[0] === "string") return output[0];
  if (Array.isArray(json.data) && typeof json.data[0] === "string") {
    return json.data[0] as string;
  }
  return null;
}

function extractRequestId(json: AnyRecord | null): string | null {
  if (!json) return null;
  return (
    asString(json.request_id) ??
    asString(json.requestId) ??
    asString(json.task_id) ??
    asString(json.id) ??
    asString(get(json, ["data", "request_id"])) ??
    asString(get(json, ["data", "id"]))
  );
}

function extractStatus(json: AnyRecord | null): string {
  if (!json) return "";
  const s =
    asString(json.status) ??
    asString(json.state) ??
    asString(get(json, ["data", "status"])) ??
    "";
  return s.toLowerCase();
}

const DONE_STATUS = ["completed", "succeeded", "success", "done", "ready", "finished", "complete"];
const FAIL_STATUS = ["failed", "error", "canceled", "cancelled", "rejected"];

function imageBase(provider: ProviderConfig): string {
  return (provider.imageBaseUrl?.trim() || provider.baseUrl || "").trim();
}

function videoBase(provider: ProviderConfig): string {
  return (provider.videoBaseUrl?.trim() || provider.baseUrl || "").trim();
}

function effectiveImageApiKey(provider: ProviderConfig): string {
  return (provider.imageApiKey?.trim() || provider.apiKey || "").trim();
}

function effectiveVideoApiKey(provider: ProviderConfig): string {
  return (provider.videoApiKey?.trim() || provider.apiKey || "").trim();
}

/* ---------------- public API ---------------- */

export async function generateImage(opts: {
  provider: ProviderConfig;
  prompt: string;
  signal?: AbortSignal;
}): Promise<string> {
  const { provider, prompt, signal } = opts;
  const imgKey = effectiveImageApiKey(provider);
  if (!imgKey) throw new MediaError("API Key belum diisi di Settings (Image atau Chat API).");
  if (!provider.imagePath?.trim()) throw new MediaError("Image Generate Path belum diatur di Settings.");
  if (!provider.imageModel?.trim()) throw new MediaError("Image Generate Model belum diatur di Settings.");

  const result = await callProxy({
    baseUrl: imageBase(provider),
    path: provider.imagePath.trim(),
    apiKey: imgKey,
    payload: {
      model: provider.imageModel.trim(),
      prompt,
      n: 1,
      response_format: "b64_json",
    },
    signal,
  });

  if (result.url) return result.url;
  const img = extractImage(result.json);
  if (!img) throw new MediaError("Provider tidak mengembalikan gambar. Periksa model dan path.");
  return img;
}

export async function editImage(opts: {
  provider: ProviderConfig;
  prompt: string;
  imageDataUrl: string;
  signal?: AbortSignal;
}): Promise<string> {
  const { provider, prompt, imageDataUrl, signal } = opts;
  const imgKey = effectiveImageApiKey(provider);
  if (!imgKey) throw new MediaError("API Key belum diisi di Settings (Image atau Chat API).");
  if (!provider.imageEditPath?.trim()) throw new MediaError("Image Edit Path belum diatur di Settings.");
  if (!provider.imageEditModel?.trim()) throw new MediaError("Image Edit Model belum diatur di Settings.");

  const result = await callProxy({
    baseUrl: imageBase(provider),
    path: provider.imageEditPath.trim(),
    apiKey: imgKey,
    payload: {
      model: provider.imageEditModel.trim(),
      prompt,
      image: { url: imageDataUrl, type: "image_url" },
      n: 1,
      response_format: "b64_json",
    },
    signal,
  });

  if (result.url) return result.url;
  const img = extractImage(result.json);
  if (!img) throw new MediaError("Provider tidak mengembalikan gambar hasil edit. Periksa model dan path.");
  return img;
}

function buildStatusPath(provider: ProviderConfig, requestId: string): string {
  const tmpl = provider.videoStatusPath?.trim();
  const id = encodeURIComponent(requestId);
  if (tmpl) {
    if (tmpl.includes("{request_id}")) return tmpl.replace("{request_id}", id);
    if (tmpl.includes("{id}")) return tmpl.replace("{id}", id);
    return `${tmpl.replace(/\/$/, "")}/${id}`;
  }
  const vp = (provider.videoPath?.trim() || "").replace(/\/$/, "");
  return `${vp}/${id}`;
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function photoToVideo(opts: {
  provider: ProviderConfig;
  prompt: string;
  imageDataUrl: string;
  signal?: AbortSignal;
  onStatus?: (message: string) => void;
}): Promise<string> {
  const { provider, prompt, imageDataUrl, signal, onStatus } = opts;
  const vidKey = effectiveVideoApiKey(provider);
  if (!vidKey) throw new MediaError("API Key belum diisi di Settings (Video atau Chat API).");
  if (!provider.videoPath?.trim()) throw new MediaError("Video Generate Path belum diatur di Settings.");
  if (!provider.videoModel?.trim()) throw new MediaError("Video Model belum diatur di Settings.");

  const apiKey = vidKey;
  const initial = await callProxy({
    baseUrl: videoBase(provider),
    path: provider.videoPath.trim(),
    apiKey,
    payload: {
      model: provider.videoModel.trim(),
      prompt,
      image: { url: imageDataUrl },
      duration: 15,
    },
    signal,
  });

  if (initial.url) return initial.url;

  const directUrl = extractVideoUrl(initial.json);
  if (directUrl) return directUrl;

  const requestId = extractRequestId(initial.json);
  if (!requestId) {
    throw new MediaError(
      "Provider tidak mengembalikan video maupun request_id. Periksa Video Path/Model.",
    );
  }

  const statusPath = buildStatusPath(provider, requestId);
  const maxAttempts = 90; // ~ up to 6 minutes at 4s interval
  for (let i = 0; i < maxAttempts; i++) {
    if (signal?.aborted) throw new MediaError("Permintaan dibatalkan.");
    await delay(4000);
    onStatus?.(`Video masih diproses… (${i + 1})`);

    const poll = await callProxy({
      method: "GET",
      baseUrl: videoBase(provider),
      path: statusPath,
      apiKey,
      signal,
    });

    const status = extractStatus(poll.json);
    const url = extractVideoUrl(poll.json) ?? poll.url;

    if (FAIL_STATUS.includes(status)) {
      throw new MediaError("Pembuatan video gagal di server provider.");
    }
    if (url && (status === "" || DONE_STATUS.includes(status))) {
      return url;
    }
  }

  throw new MediaError(
    "Video masih diproses oleh provider. Coba lagi beberapa saat lagi.",
  );
}

/* ---------------- file helpers ---------------- */

/* ---------------- connection tests ---------------- */

/** 1x1 transparent PNG used as a placeholder for connection tests. */
const TINY_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

export async function testImageConnection(opts: {
  provider: ProviderConfig;
  signal?: AbortSignal;
}): Promise<void> {
  await generateImage({
    provider: opts.provider,
    prompt: "connection test: a small solid red dot on white background",
    signal: opts.signal,
  });
}

export async function testVideoConnection(opts: {
  provider: ProviderConfig;
  signal?: AbortSignal;
}): Promise<void> {
  const { provider, signal } = opts;
  const vidKey = effectiveVideoApiKey(provider);
  if (!vidKey) throw new MediaError("API Key belum diisi (Video atau Chat API).");
  if (!provider.videoPath?.trim())
    throw new MediaError("Video Generate Path belum diatur.");
  if (!provider.videoModel?.trim()) throw new MediaError("Video Model belum diatur.");

  // Only send the initial request — getting any 2xx response (request_id,
  // url, or json) means the endpoint and API key are reachable.
  await callProxy({
    baseUrl: videoBase(provider),
    path: provider.videoPath.trim(),
    apiKey: vidKey,
    payload: {
      model: provider.videoModel.trim(),
      prompt: "connection test",
      image: { url: TINY_PNG },
      duration: 15,
    },
    signal,
  });
}

export async function mergeVideos(
  url1: string,
  url2: string,
  signal?: AbortSignal,
): Promise<string> {
  const toSendable = async (url: string): Promise<string> => {
    if (!url.startsWith("blob:")) return url;
    const res = await fetch(url);
    const blob = await res.blob();
    if (blob.size > 50 * 1024 * 1024) {
      throw new MediaError(
        "Video terlalu besar untuk digabungkan via browser. Unduh masing-masing video secara terpisah.",
      );
    }
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new MediaError("Gagal membaca file video lokal."));
      reader.readAsDataURL(blob);
    });
  };

  let v1: string, v2: string;
  try {
    [v1, v2] = await Promise.all([toSendable(url1), toSendable(url2)]);
  } catch (err) {
    if (err instanceof MediaError) throw err;
    throw new MediaError("Gagal mempersiapkan video untuk digabungkan.");
  }

  let res: Response;
  try {
    res = await fetch("/api/public/merge-videos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url1: v1, url2: v2 }),
      signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new MediaError("Permintaan dibatalkan.");
    }
    throw new MediaError("Gagal menghubungi server untuk menggabungkan video.");
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let msg = "Gagal menggabungkan video.";
    try {
      msg = (JSON.parse(text) as { error?: string }).error ?? msg;
    } catch {}
    throw new MediaError(msg);
  }

  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

export const ACCEPTED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // 8 MB

export function validateImageFile(file: File): string | null {
  if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
    return "Format foto tidak didukung. Gunakan PNG, JPG, atau WEBP.";
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return "File terlalu besar. Maksimal 8 MB.";
  }
  return null;
}

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new MediaError("Gagal membaca file foto."));
    reader.readAsDataURL(file);
  });
}

export async function downloadMedia(url: string, filename: string): Promise<void> {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(objectUrl);
  } catch {
    // cross-origin without CORS — fall back to opening in a new tab
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.target = "_blank";
    a.rel = "noopener";
    a.click();
  }
}