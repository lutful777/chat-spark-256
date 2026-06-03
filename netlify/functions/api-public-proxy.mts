const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export default async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "Method tidak didukung." }, 405);
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return json({ error: "Body bukan JSON yang valid." }, 400);
  }

  if (!isObject(raw)) {
    return json({ error: "Konfigurasi tidak valid." }, 400);
  }

  const { baseUrl, path, apiKey, payload } = raw;

  if (typeof baseUrl !== "string" || typeof path !== "string" || typeof apiKey !== "string" || !isObject(payload)) {
    return json({ error: "Konfigurasi tidak valid." }, 400);
  }

  let target: string;
  try {
    target = `${baseUrl.replace(/\/$/, "")}${path.startsWith("/") ? "" : "/"}${path}`;
    new URL(target);
  } catch {
    return json({ error: "Base URL / Path tidak valid." }, 400);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90000);

  try {
    const upstream = await fetch(target, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if ((payload as Record<string, unknown>).stream === true && upstream.ok && upstream.body) {
      clearTimeout(timeout);
      return new Response(upstream.body, {
        status: upstream.status,
        headers: {
          "Content-Type": upstream.headers.get("Content-Type") ?? "text/event-stream",
          "Cache-Control": "no-cache",
          ...corsHeaders,
        },
      });
    }

    const text = await upstream.text();
    return new Response(text, {
      status: upstream.status,
      headers: {
        "Content-Type": upstream.headers.get("Content-Type") ?? "application/json",
        ...corsHeaders,
      },
    });
  } catch (err) {
    const aborted = err instanceof Error && err.name === "AbortError";
    return json(
      {
        error: aborted
          ? "Permintaan timeout. Server tidak merespons."
          : "Gagal menghubungi server. Periksa Base URL / koneksi.",
      },
      aborted ? 504 : 502,
    );
  } finally {
    clearTimeout(timeout);
  }
};

export const config = {
  path: "/api/public/proxy",
};
