import { createFileRoute } from "@tanstack/react-router";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
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
    if (out.length >= 6) break;
  }
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
          const ddg = new URL("https://api.duckduckgo.com/");
          ddg.searchParams.set("q", query);
          ddg.searchParams.set("format", "json");
          ddg.searchParams.set("no_html", "1");
          ddg.searchParams.set("no_redirect", "1");
          ddg.searchParams.set("skip_disambig", "1");

          const res = await fetch(ddg.toString(), {
            headers: { Accept: "application/json" },
            signal: controller.signal,
          });
          if (!res.ok) return json({ error: `Search gagal (${res.status}).` }, 502);

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
              if (sources.length >= 6) break;
            }
          }

          if (Array.isArray(data.RelatedTopics) && sources.length < 6) {
            flattenRelated(data.RelatedTopics, sources);
          }

          const unique = Array.from(new Map(sources.map((s) => [s.url || s.title, s])).values()).slice(0, 6);
          return json({
            query,
            generatedAt: new Date().toISOString(),
            sources: unique,
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
