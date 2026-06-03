import type { ChatAttachment, ChatMessage, ProviderConfig } from "./types";

export interface ChatResult {
  content: string;
}

export class ChatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ChatError";
  }
}

type ApiMessage = {
  role: ChatMessage["role"];
  content:
    | string
    | Array<
        | { type: "text"; text: string }
        | { type: "image_url"; image_url: { url: string } }
      >;
};

function buildTarget(provider: ProviderConfig): string {
  const base = provider.baseUrl.replace(/\/$/, "");
  const path = provider.path.startsWith("/") ? provider.path : `/${provider.path}`;
  return `${base}${path}`;
}

function isThinkingMode(provider: ProviderConfig): boolean {
  return provider.systemPrompt?.toLowerCase().includes("thinking mode aktif") ?? false;
}

function isThinkingModelName(model: string): boolean {
  const lower = model.toLowerCase();
  return (
    lower.includes("thinking") ||
    lower.includes("reasoning") ||
    lower.includes("reasoner") ||
    lower.includes("deepseek-r1") ||
    lower.includes("/r1") ||
    lower.endsWith("-r1") ||
    lower.includes("o1") ||
    lower.includes("o3") ||
    lower.includes("o4")
  );
}

function selectRequestModel(provider: ProviderConfig): string {
  const selected = provider.model.trim();
  if (!isThinkingMode(provider)) return selected;
  if (isThinkingModelName(selected)) return selected;

  const models = Array.from(new Set([selected, ...(provider.models ?? [])].map((m) => m.trim()).filter(Boolean)));
  return models.find(isThinkingModelName) ?? selected;
}

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
      return `Permintaan ditolak (400). Model mungkin tidak support gambar/file, model tidak tersedia, atau parameter salah.${
        detail ? ` Detail: ${detail}` : ""
      }`;
    case 401:
      return "API key salah atau tidak diizinkan (401). Periksa kembali API Key Anda.";
    case 403:
      return "Akses ditolak (403). API key tidak punya izin untuk model/endpoint ini.";
    case 404:
      return "Endpoint tidak ditemukan (404). Periksa Base URL dan API Path.";
    case 402:
      return "Saldo/credit habis (402). Top up credit pada provider Anda.";
    case 429:
      return "Terlalu banyak permintaan atau credit habis (429). Coba lagi nanti.";
    case 500:
    case 502:
    case 503:
    case 504:
      return `Server provider bermasalah (${status}). Coba lagi nanti.`;
    default:
      return `Gagal (${status}).${detail ? ` ${detail}` : ""}`;
  }
}

function getImageAttachments(attachments?: ChatAttachment[]): ChatAttachment[] {
  return (attachments ?? []).filter((att) => att.type.startsWith("image/") && att.dataUrl);
}

function getTextFileContext(attachments?: ChatAttachment[]): string {
  const textAttachments = (attachments ?? []).filter((att) => att.text?.trim());
  if (textAttachments.length === 0) return "";

  return textAttachments
    .map((att, i) => `\n\nFile teks ${i + 1}: ${att.name}\n${att.text}`)
    .join("");
}

function getAttachmentNote(attachments?: ChatAttachment[]): string {
  const items = attachments ?? [];
  if (items.length === 0) return "";

  const notes = items
    .filter((att) => !att.text)
    .map((att) => `- ${att.name} (${att.type || "file"})`);

  if (notes.length === 0) return "";
  return `\n\nCatatan: ada file/gambar yang diupload, tetapi model/provider ini mungkin hanya menerima teks. File: \n${notes.join("\n")}`;
}

function toTextOnlyContent(message: ChatMessage): string {
  return `${message.content}${getTextFileContext(message.attachments)}${getAttachmentNote(message.attachments)}`;
}

function toApiContent(message: ChatMessage, textOnly = false): ApiMessage["content"] {
  const images = getImageAttachments(message.attachments);
  if (textOnly || message.role !== "user" || images.length === 0) {
    return toTextOnlyContent(message);
  }

  return [
    { type: "text", text: toTextOnlyContent(message) || "Tolong analisis gambar yang saya upload." },
    ...images.map((image) => ({
      type: "image_url" as const,
      image_url: { url: image.dataUrl! },
    })),
  ];
}

function toApiMessages(messages: ChatMessage[], textOnly = false): ApiMessage[] {
  return messages
    .filter(
      (m) =>
        !m.error &&
        (m.content.trim().length > 0 ||
          getTextFileContext(m.attachments).trim().length > 0 ||
          getImageAttachments(m.attachments).length > 0),
    )
    .map((m) => ({ role: m.role, content: toApiContent(m, textOnly) }));
}

function buildMessages(provider: ProviderConfig, messages: ChatMessage[], textOnly = false) {
  const out = toApiMessages(messages, textOnly);
  const sys = provider.systemPrompt?.trim();
  if (sys) {
    return [{ role: "system" as const, content: sys }, ...out];
  }
  return out;
}

function hasImages(messages: ChatMessage[]): boolean {
  return messages.some((m) => getImageAttachments(m.attachments).length > 0);
}

function buildPayload(
  provider: ProviderConfig,
  messages: ChatMessage[],
  stream: boolean,
  textOnly = false,
) {
  return {
    model: selectRequestModel(provider),
    messages: buildMessages(provider, messages, textOnly),
    temperature: provider.temperature,
    max_tokens: provider.maxTokens,
    stream,
  };
}

function isImageFormatRejected(status: number, body: string): boolean {
  if (status !== 400) return false;
  const lower = body.toLowerCase();
  return (
    lower.includes("expected string") ||
    lower.includes("received array") ||
    lower.includes("content must be a string") ||
    lower.includes("invalid type")
  );
}

async function postChatPayload(
  provider: ProviderConfig,
  payload: unknown,
  signal?: AbortSignal,
): Promise<{ status: number; body: string }> {
  if (provider.directCall) {
    const res = await fetch(buildTarget(provider), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${provider.apiKey.trim()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal,
    });
    return { status: res.status, body: await res.text() };
  }

  const res = await fetch("/api/public/proxy", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      baseUrl: provider.baseUrl.trim(),
      path: provider.path.trim(),
      apiKey: provider.apiKey.trim(),
      payload,
    }),
    signal,
  });
  const body = await res.text();

  if (res.status >= 500 || res.status === 400) {
    try {
      const parsed = JSON.parse(body);
      if (parsed?.error && res.status >= 502) {
        throw new ChatError(String(parsed.error));
      }
    } catch (e) {
      if (e instanceof ChatError) throw e;
    }
  }

  return { status: res.status, body };
}

export interface SendChatOptions {
  provider: ProviderConfig;
  messages: ChatMessage[];
  signal?: AbortSignal;
  /** called incrementally when the provider streams its response */
  onToken?: (full: string) => void;
}

export async function sendChat({
  provider,
  messages,
  signal,
  onToken,
}: SendChatOptions): Promise<ChatResult> {
  if (!provider.apiKey.trim()) {
    throw new ChatError("API Key belum diisi. Buka Settings untuk mengaturnya.");
  }
  if (!provider.model.trim()) {
    throw new ChatError("Model belum diisi. Buka Settings untuk mengaturnya.");
  }

  const containsImage = hasImages(messages);
  const wantStream = !!provider.stream && !!onToken && !containsImage;
  const payload = buildPayload(provider, messages, wantStream, false);

  if (wantStream) {
    return streamChat({ provider, payload, signal, onToken: onToken! });
  }

  let status: number;
  let body: string;

  try {
    const result = await postChatPayload(provider, payload, signal);
    status = result.status;
    body = result.body;

    // Some OpenAI-compatible providers are text-only and reject multimodal content arrays.
    // If that happens, retry once with all history converted to plain text.
    if (containsImage && isImageFormatRejected(status, body)) {
      const retryPayload = buildPayload(provider, messages, false, true);
      const retry = await postChatPayload(provider, retryPayload, signal);
      status = retry.status;
      body = retry.body;
    }
  } catch (err) {
    if (err instanceof ChatError) throw err;
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new ChatError("Permintaan dibatalkan.");
    }
    throw new ChatError(
      "Provider ini mungkin tidak mengizinkan request langsung dari browser (CORS), atau ada masalah jaringan. Coba aktifkan/nonaktifkan mode panggilan langsung di Settings.",
    );
  }

  if (status < 200 || status >= 300) {
    throw new ChatError(mapStatusToMessage(status, body));
  }

  let data: unknown;
  try {
    data = JSON.parse(body);
  } catch {
    throw new ChatError("Response provider bukan JSON yang valid.");
  }

  const content =
    (data as { choices?: Array<{ message?: { content?: string } }> })?.choices?.[0]
      ?.message?.content ?? "";

  if (!content) {
    throw new ChatError("Provider tidak mengembalikan jawaban. Periksa model dan parameter.");
  }

  return { content };
}

interface StreamOptions {
  provider: ProviderConfig;
  payload: unknown;
  signal?: AbortSignal;
  onToken: (full: string) => void;
}

async function streamChat({
  provider,
  payload,
  signal,
  onToken,
}: StreamOptions): Promise<ChatResult> {
  let res: Response;
  try {
    if (provider.directCall) {
      res = await fetch(buildTarget(provider), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${provider.apiKey.trim()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        signal,
      });
    } else {
      res = await fetch("/api/public/proxy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          baseUrl: provider.baseUrl.trim(),
          path: provider.path.trim(),
          apiKey: provider.apiKey.trim(),
          payload,
        }),
        signal,
      });
    }
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new ChatError("Permintaan dibatalkan.");
    }
    throw new ChatError(
      "Provider ini mungkin tidak mengizinkan request langsung dari browser (CORS), atau ada masalah jaringan. Coba aktifkan/nonaktifkan mode panggilan langsung di Settings.",
    );
  }

  if (!res.ok || !res.body) {
    const body = await res.text().catch(() => "");
    throw new ChatError(mapStatusToMessage(res.status, body));
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let full = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const data = trimmed.slice(5).trim();
        if (data === "[DONE]") continue;
        try {
          const json = JSON.parse(data);
          const delta = json?.choices?.[0]?.delta?.content;
          if (typeof delta === "string" && delta.length) {
            full += delta;
            onToken(full);
          }
        } catch {
          /* ignore partial / non-JSON keepalive lines */
        }
      }
    }
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      if (full) return { content: full };
      throw new ChatError("Permintaan dibatalkan.");
    }
    throw err;
  }

  if (!full) {
    throw new ChatError("Provider tidak mengembalikan jawaban. Periksa model dan parameter.");
  }
  return { content: full };
}

export async function testConnection(provider: ProviderConfig): Promise<string> {
  const res = await sendChat({
    provider: { ...provider, stream: false },
    messages: [
      {
        id: "test",
        role: "user",
        content: "Reply with exactly: OK",
        createdAt: Date.now(),
      },
    ],
  });
  return res.content;
}
