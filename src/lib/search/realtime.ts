export interface RealtimeSearchSource {
  title: string;
  url: string;
  snippet: string;
}

export interface RealtimeSearchResult {
  query: string;
  generatedAt: string;
  sources: RealtimeSearchSource[];
}

export interface RealtimeSearchConfig {
  serperApiKey: string;
  firecrawlApiKey: string;
}

const REALTIME_SEARCH_KEY = "ai-chat-realtime-search";

export function loadRealtimeSearchConfig(): RealtimeSearchConfig {
  if (typeof window === "undefined") return { serperApiKey: "", firecrawlApiKey: "" };
  try {
    const raw = localStorage.getItem(REALTIME_SEARCH_KEY);
    if (!raw) return { serperApiKey: "", firecrawlApiKey: "" };
    const parsed = JSON.parse(raw) as Partial<RealtimeSearchConfig>;
    return { 
      serperApiKey: String(parsed.serperApiKey ?? ""), 
      firecrawlApiKey: String(parsed.firecrawlApiKey ?? "") 
    };
  } catch {
    return { serperApiKey: "", firecrawlApiKey: "" };
  }
}

export function saveRealtimeSearchConfig(config: RealtimeSearchConfig) {
  if (typeof window === "undefined") return;
  localStorage.setItem(
    REALTIME_SEARCH_KEY,
    JSON.stringify({ 
      serperApiKey: config.serperApiKey.trim(),
      firecrawlApiKey: config.firecrawlApiKey.trim()
    }),
  );
}

export function clearRealtimeSearchConfig() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(REALTIME_SEARCH_KEY);
}

function readErrorMessage(status: number, text: string): string {
  try {
    const parsed = JSON.parse(text) as { error?: unknown; message?: unknown };
    const detail = parsed.error ?? parsed.message;
    if (typeof detail === "string" && detail.trim()) return detail.trim();
  } catch {
    // handled below
  }

  const short = text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 140);
  if (status === 404) {
    return "Endpoint Real Time Search belum aktif di server. Tunggu deploy Vercel selesai atau lakukan redeploy.";
  }
  if (status === 401 || status === 403) {
    return "API key search ditolak. Cek Serper API Key atau Firecrawl API Key, jangan pakai awalan Bearer.";
  }
  if (status === 429) {
    return "Limit atau quota Real Time Search habis. Coba lagi nanti atau ganti API key.";
  }
  if (status >= 500) {
    return "Server Real Time Search bermasalah. Coba redeploy Vercel atau coba lagi nanti.";
  }
  return short ? `Realtime search gagal (${status}): ${short}` : `Realtime search gagal (${status}).`;
}

export async function searchRealtimeWeb(query: string, signal?: AbortSignal): Promise<RealtimeSearchResult> {
  const q = query.trim();
  if (!q) return { query: "", generatedAt: new Date().toISOString(), sources: [] };

  const config = loadRealtimeSearchConfig();
  const headers: HeadersInit = {};
  if (config.serperApiKey) headers["X-Serper-API-Key"] = config.serperApiKey;
  if (config.firecrawlApiKey) headers["X-Firecrawl-API-Key"] = config.firecrawlApiKey;

  let res: Response;
  try {
    res = await fetch(`/api/public/realtime-search?q=${encodeURIComponent(q)}`, { headers, signal });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw new Error("Realtime search dibatalkan.");
    throw new Error("Tidak bisa menghubungi Real Time Search. Cek koneksi atau deploy Vercel.");
  }

  const text = await res.text();
  let data: Partial<RealtimeSearchResult> & { error?: string } = {};
  try {
    data = JSON.parse(text) as Partial<RealtimeSearchResult> & { error?: string };
  } catch {
    throw new Error(readErrorMessage(res.status, text));
  }

  if (!res.ok) {
    throw new Error(data.error || readErrorMessage(res.status, text));
  }

  return {
    query: data.query || q,
    generatedAt: data.generatedAt || new Date().toISOString(),
    sources: Array.isArray(data.sources) ? data.sources.slice(0, 6) : [],
  };
}

export function buildRealtimeContext(result: RealtimeSearchResult): string {
  const lines = [
    `REALTIME WEB SEARCH (${result.generatedAt})`,
    `Query: ${result.query}`,
    "Use these web results to answer the user's question. If results are insufficient, say so.",
    "Sources:",
  ];

  if (result.sources.length === 0) {
    lines.push("No search results found.");
  } else {
    result.sources.forEach((source, index) => {
      lines.push(`${index + 1}. ${source.title}`);
      lines.push(`URL: ${source.url}`);
      lines.push(`Snippet: ${source.snippet}`);
    });
  }

  return lines.join("\n");
}
