type SearchSource = {
  title: string;
  url: string;
  snippet: string;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Serper-API-Key",
  "Access-Control-Max-Age": "86400",
};

function stripHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function uniqueSources(sources: SearchSource[]): SearchSource[] {
  return Array.from(
    new Map(
      sources
        .filter((source) => source.url && source.snippet)
        .map((source) => [source.url || source.title, source]),
    ).values(),
  ).slice(0, 8);
}

async function searchSerper(query: string, signal: AbortSignal, keyOverride = ""): Promise<SearchSource[]> {
  const key = (keyOverride || process.env.SERPER_API_KEY || "").trim();
  if (!key) return [];

  const response = await fetch("https://google.serper.dev/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-KEY": key,
    },
    body: JSON.stringify({ q: query, num: 8 }),
    signal,
  });

  if (!response.ok) return [];

  const data = (await response.json()) as {
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

  return uniqueSources(sources);
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
    if (title && url && snippet) out.push({ title, url, snippet });
    if (out.length >= 8) break;
  }
}

async function searchDuckDuckGo(query: string, signal: AbortSignal): Promise<SearchSource[]> {
  const url = new URL("https://api.duckduckgo.com/");
  url.searchParams.set("q", query);
  url.searchParams.set("format", "json");
  url.searchParams.set("no_html", "1");
  url.searchParams.set("no_redirect", "1");
  url.searchParams.set("skip_disambig", "1");

  const response = await fetch(url.toString(), {
    headers: { Accept: "application/json" },
    signal,
  });

  if (!response.ok) return [];

  const data = (await response.json()) as Record<string, unknown>;
  const sources: SearchSource[] = [];

  const heading = stripHtml(data.Heading);
  const abstract = stripHtml(data.AbstractText);
  const abstractUrl = stripHtml(data.AbstractURL);
  if (heading && abstract && abstractUrl) {
    sources.push({ title: heading, url: abstractUrl, snippet: abstract });
  }

  const answer = stripHtml(data.Answer);
  if (answer) {
    sources.push({
      title: "Instant answer",
      url: `https://duckduckgo.com/?q=${encodeURIComponent(query)}`,
      snippet: answer,
    });
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

  return uniqueSources(sources);
}

function sendJson(res: any, status: number, body: unknown) {
  Object.entries({ ...corsHeaders, "Content-Type": "application/json" }).forEach(([key, value]) => {
    res.setHeader(key, value);
  });
  res.status(status).json(body);
}

export default async function handler(req: any, res: any) {
  if (req.method === "OPTIONS") {
    Object.entries(corsHeaders).forEach(([key, value]) => res.setHeader(key, value));
    res.status(204).end();
    return;
  }

  if (req.method !== "GET") {
    sendJson(res, 405, { error: "Method tidak didukung." });
    return;
  }

  const queryValue = Array.isArray(req.query?.q) ? req.query.q[0] : req.query?.q;
  const query = String(queryValue ?? "").trim().slice(0, 500);
  if (!query) {
    sendJson(res, 400, { error: "Query kosong." });
    return;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const headerKey = req.headers?.["x-serper-api-key"];
    const serperKey = Array.isArray(headerKey) ? headerKey[0] : String(headerKey ?? "");
    const serper = await searchSerper(query, controller.signal, serperKey).catch(() => []);
    let sources = uniqueSources(serper);
    let provider = sources.length ? "serper" : "duckduckgo";

    if (sources.length === 0) {
      const duckDuckGo = await searchDuckDuckGo(query, controller.signal).catch(() => []);
      sources = uniqueSources(duckDuckGo);
    }

    sendJson(res, 200, {
      query,
      provider,
      generatedAt: new Date().toISOString(),
      sources,
    });
  } catch (error) {
    const aborted = error instanceof Error && error.name === "AbortError";
    sendJson(res, aborted ? 504 : 502, {
      error: aborted ? "Search timeout." : "Gagal mengambil data real-time.",
    });
  } finally {
    clearTimeout(timeout);
  }
}
