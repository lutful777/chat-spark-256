import { createFileRoute } from "@tanstack/react-router";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Serper-API-Key, X-Firecrawl-API-Key",
  "Access-Control-Max-Age": "86400",
};

interface SearchSource {
  title: string;
  url: string;
  snippet: string;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

function stripHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function uniqueSources(sources: SearchSource[]): SearchSource[] {
  return Array.from(new Map(sources.filter((s) => s.url && s.snippet).map((s) => [s.url || s.title, s])).values()).slice(0, 8);
}

async function searchSerper(query: string, signal: AbortSignal, keyOverride = ""): Promise<SearchSource[]> {
  const key = (keyOverride || process.env.SERPER_API_KEY || "").trim();
  if (!key) return [];
  const res = await fetch("https://google.serper.dev/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-KEY": key,
    },
    body: JSON.stringify({ q: query, num: 8 }),
    signal,
  });
  if (!res.ok) return [];
  const data = (await res.json()) as {
    answerBox?: { title?: string; answer?: string; snippet?: string; link?: string };
    organic?: Array<{ title?: string; link?: string; snippet?: string }>;
  };
  const sources: SearchSource[] = [];
  if (data.answerBox?.answer || data.answerBox?.snippet) {
    sources.push({
      title: stripHtml(data.answerBox.title || "Serper answer").slice(0, 140),
      url: stripHtml(data.answerBox.link || `https://www.google.com/search?q=${encodeURIComponent(query)}`),
      snippet: stripHtml(data.answerBox.answer || data.answerBox.snippet),
    });
  }
  sources.push(
    ...(data.organic ?? []).map((item) => ({
      title: stripHtml(item.title).slice(0, 140),
      url: stripHtml(item.link),
      snippet: stripHtml(item.snippet),
    })),
  );
  return sources;
}

async function searchFirecrawl(query: string, signal: AbortSignal, keyOverride = ""): Promise<SearchSource[]> {
  const key = (keyOverride || process.env.FIRECRAWL_API_KEY || "").trim();
  if (!key) return [];
  
  try {
    const res = await fetch("https://api.firecrawl.dev/v1/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${key}`,
      },
      body: JSON.stringify({ query, limit: 8 }),
      signal,
    });
    
    if (!res.ok) return [];
    
    const data = (await res.json()) as {
      success?: boolean;
      data?: Array<{ title?: string; url?: string; description?: string; content?: string }>;
    };
    
    if (!data.success || !Array.isArray(data.data)) return [];
    
    return data.data.map((item) => ({
      title: stripHtml(item.title || "Firecrawl result").slice(0, 140),
      url: stripHtml(item.url || ""),
      snippet: stripHtml(item.description || item.content || ""),
    })).filter((s) => s.url && s.snippet);
  } catch {
    return [];
  }
}

async function searchBrave(query: string, signal: AbortSignal): Promise<SearchSource[]> {
  const key = process.env.BRAVE_SEARCH_API_KEY;
  if (!key) return [];
  const url = new URL("https://api.search.brave.com/res/v1/web/search");
  url.searchParams.set("q", query);
  url.searchParams.set("count", "8");
  url.searchParams.set("freshness", "pw");
  const res = await fetch(url.toString(), {
    headers: { Accept: "application/json", "X-Subscription-Token": key },
    signal,
  });
  if (!res.ok) return [];
  const data = (await res.json()) as { web?: { results?: Array<{ title?: string; url?: string; description?: string }> } };
  return (data.web?.results ?? []).map((item) => ({
    title: stripHtml(item.title).slice(0, 140),
    url: stripHtml(item.url),
    snippet: stripHtml(item.description),
  }));
}

async function searchTavily(query: string, signal: AbortSignal): Promise<SearchSource[]> {
  const key = process.env.TAVILY_API_KEY;
  if (!key) return [];
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ api_key: key, query, search_depth: "basic", max_results: 8, include_answer: true }),
    signal,
  });
  if (!res.ok) return [];
  const data = (await res.json()) as { answer?: string; results?: Array<{ title?: string; url?: string; content?: string }> };
  const sources = (data.results ?? []).map((item) => ({
    title: stripHtml(item.title).slice(0, 140),
    url: stripHtml(item.url),
    snippet: stripHtml(item.content),
  }));
  if (data.answer) {
    sources.unshift({ title: "Tavily answer", url: "https://tavily.com/", snippet: stripHtml(data.answer) });
  }
  return sources;
}

function flattenRelated(items: unknown[], out: SearchSource[]) {
  for (const item of items) {
    const related = item as Record<string, unknown>;
    if (Array.isArray(related.Topics)) {
      flattenRelated(related.Topics, out);
      continue;
    }

    const title = stripHtml(related.Text).slice(0, 120);
    const url = stripHtml(related.FirstURL);
    const snippet = stripHtml(related.Text);
    if (title && url && snippet) {
      out.push({ title, url, snippet });
    }
    if (out.length >= 8) break;
  }
}

async function searchDuckDuckGo(query: string, signal: AbortSignal): Promise<SearchSource[]> {
  const ddg = new URL("https://api.duckduckgo.com/");
  ddg.searchParams.set("q", query);
  ddg.searchParams.set("format", "json");
  ddg.searchParams.set("no_html", "1");
  ddg.searchParams.set("no_redirect", "1");
  ddg.searchParams.set("skip_disambig", "1");

  const res = await fetch(ddg.toString(), {
    headers: { Accept: "application/json" },
    signal,
  });
  if (!res.ok) return [];

  const data = (await res.json()) as Record<string, unknown>;
  const sources: SearchSource[] = [];

  const heading = stripHtml(data.Heading);
  const abstract = stripHtml(data.AbstractText);
  const abstractUrl = stripHtml(data.AbstractURL);
  if (heading && abstract && abstractUrl) {
    sources.push({ title: heading, url: abstractUrl, snippet: abstract });
  }

  const answer = stripHtml(data.Answer);
  if (answer) {
    sources.push({ title: "Instant answer", url: "https://duckduckgo.com/?q=" + encodeURIComponent(query), snippet: answer });
  }

  if (Array.isArray(data.Results)) {
    for (const item of data.Results) {
      const result = item as Record<string, unknown>;
      const title = stripHtml(result.Text).slice(0, 120);
      const sourceUrl = stripHtml(result.FirstURL);
      const snippet = stripHtml(result.Text);
      if (title && sourceUrl && snippet) sources.push({ title, url: sourceUrl, snippet });
      if (sources.length >= 8) break;
    }
  }

  if (Array.isArray(data.RelatedTopics) && sources.length < 8) {
    flattenRelated(data.RelatedTopics, sources);
  }

  return sources;
}

export const Route = createFileRoute("/api/public/realtime-search")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: corsHeaders }),
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const query = (url.searchParams.get("q") ?? "").trim().slice(0, 500);
        if (!query) return json({ error: "Query kosong." }, 400);

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);

        try {
          const userSerperKey = request.headers.get("X-Serper-API-Key") ?? "";
          const userFirecrawlKey = request.headers.get("X-Firecrawl-API-Key") ?? "";
          
          let sources: SearchSource[] = [];
          let provider = "duckduckgo";

          // Try Firecrawl first if key provided
          if (userFirecrawlKey) {
            const firecrawl = await searchFirecrawl(query, controller.signal, userFirecrawlKey).catch(() => []);
            sources = uniqueSources(firecrawl);
            if (sources.length > 0) {
              provider = "firecrawl";
              return json({ query, provider, generatedAt: new Date().toISOString(), sources });
            }
          }

          // Try Serper
          const serper = await searchSerper(query, controller.signal, userSerperKey).catch(() => []);
          sources = uniqueSources(serper);
          if (sources.length > 0) {
            provider = "serper";
            return json({ query, provider, generatedAt: new Date().toISOString(), sources });
          }

          // Try Brave and Tavily in parallel
          if (sources.length === 0) {
            const [brave, tavily] = await Promise.all([
              searchBrave(query, controller.signal).catch(() => []),
              searchTavily(query, controller.signal).catch(() => []),
            ]);
            sources = uniqueSources([...brave, ...tavily]);
            provider = brave.length || tavily.length ? "brave/tavily" : "duckduckgo";
          }

          // Fallback to DuckDuckGo
          if (sources.length === 0) {
            const ddg = await searchDuckDuckGo(query, controller.signal);
            sources = uniqueSources(ddg);
          }

          return json({
            query,
            provider,
            generatedAt: new Date().toISOString(),
            sources,
          });
        } catch (err) {
          const aborted = err instanceof Error && err.name === "AbortError";
          return json(
            { error: aborted ? "Search timeout." : "Gagal mengambil data real-time." },
            aborted ? 504 : 502,
          );
        } finally {
          clearTimeout(timeout);
        }
      },
    },
  },
});
