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
}

const REALTIME_SEARCH_KEY = "ai-chat-realtime-search";

export function loadRealtimeSearchConfig(): RealtimeSearchConfig {
  if (typeof window === "undefined") return { serperApiKey: "" };
  try {
    const raw = localStorage.getItem(REALTIME_SEARCH_KEY);
    if (!raw) return { serperApiKey: "" };
    const parsed = JSON.parse(raw) as Partial<RealtimeSearchConfig>;
    return { serperApiKey: String(parsed.serperApiKey ?? "") };
  } catch {
    return { serperApiKey: "" };
  }
}

export function saveRealtimeSearchConfig(config: RealtimeSearchConfig) {
  if (typeof window === "undefined") return;
  localStorage.setItem(
    REALTIME_SEARCH_KEY,
    JSON.stringify({ serperApiKey: config.serperApiKey.trim() }),
  );
}

export function clearRealtimeSearchConfig() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(REALTIME_SEARCH_KEY);
}

export async function searchRealtimeWeb(query: string, signal?: AbortSignal): Promise<RealtimeSearchResult> {
  const q = query.trim();
  if (!q) return { query: "", generatedAt: new Date().toISOString(), sources: [] };

  const serperApiKey = loadRealtimeSearchConfig().serperApiKey.trim();
  const headers: HeadersInit = serperApiKey ? { "X-Serper-API-Key": serperApiKey } : {};
  const res = await fetch(`/api/public/realtime-search?q=${encodeURIComponent(q)}`, { headers, signal });
  const text = await res.text();
  const data = JSON.parse(text) as Partial<RealtimeSearchResult> & { error?: string };

  if (!res.ok) {
    throw new Error(data.error || `Realtime search gagal (${res.status}).`);
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
