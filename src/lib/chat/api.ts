import type { ChatMessage, ProviderConfig } from "./types";

export interface ChatResult {
  content: string;
}

export class ChatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ChatError";
  }
}

function buildTarget(provider: ProviderConfig): string {
  const base = provider.baseUrl.replace(/\/$/, "");
  const path = provider.path.startsWith("/") ? provider.path : `/${provider.path}`;
  return `${base}${path}`;
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
      return `Permintaan ditolak (400). Model mungkin tidak tersedia atau parameter salah.${
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

function toApiMessages(messages: ChatMessage[]) {
  return messages
    .filter((m) => !m.error && m.content.trim().length > 0)
    .map((m) => ({ role: m.role, content: m.content }));
}

function buildMessages(provider: ProviderConfig, messages: ChatMessage[]) {
  const out = toApiMessages(messages);
  const sys = provider.systemPrompt?.trim();
  if (sys) {
    return [{ role: "system" as const, content: sys }, ...out];
  }
  return out;
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

  const wantStream = !!provider.stream && !!onToken;

  const payload = {
    model: provider.model.trim(),
    messages: buildMessages(provider, messages),
    temperature: provider.temperature,
    max_tokens: provider.maxTokens,
    stream: wantStream,
  };

  // -------- Streaming path --------
  if (wantStream) {
    return streamChat({ provider, payload, signal, onToken: onToken! });
  }

  let status: number;
  let body: string;

  try {
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
      status = res.status;
      body = await res.text();
    } else {
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
      status = res.status;
      body = await res.text();
      // Proxy-level errors (502/504/400) return { error }
      if (status >= 500 || status === 400) {
        try {
          const parsed = JSON.parse(body);
          if (parsed?.error && status >= 502) {
            throw new ChatError(String(parsed.error));
          }
        } catch (e) {
          if (e instanceof ChatError) throw e;
        }
      }
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
        content: "Say hello in one short sentence.",
        createdAt: Date.now(),
      },
    ],
  });
  return res.content;
}