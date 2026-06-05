type QdrantProxyBody = {
  endpoint?: string;
  path?: string;
  method?: string;
  body?: unknown;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Qdrant-API-Key",
};

function sendJson(res: any, status: number, data: unknown) {
  Object.entries(corsHeaders).forEach(([key, value]) => res.setHeader(key, value));
  res.status(status).json(data);
}

function cleanEndpoint(endpoint: string): string {
  return endpoint.trim().replace(/\/$/, "");
}

function isAllowedPath(path: string): boolean {
  return path === "/collections" || /^\/collections\/[a-zA-Z0-9_-]+$/.test(path);
}

export default async function handler(req: any, res: any) {
  if (req.method === "OPTIONS") {
    Object.entries(corsHeaders).forEach(([key, value]) => res.setHeader(key, value));
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    return sendJson(res, 405, { error: "Method not allowed" });
  }

  const apiKey = String(req.headers["x-qdrant-api-key"] ?? "").trim();
  const payload = (req.body ?? {}) as QdrantProxyBody;
  const endpoint = cleanEndpoint(String(payload.endpoint ?? ""));
  const path = String(payload.path ?? "");
  const method = String(payload.method ?? "GET").toUpperCase();

  if (!endpoint || !endpoint.startsWith("https://")) {
    return sendJson(res, 400, { error: "Qdrant endpoint tidak valid. Gunakan URL https dari cluster Qdrant." });
  }

  if (!apiKey) {
    return sendJson(res, 400, { error: "Qdrant API key kosong." });
  }

  if (!isAllowedPath(path)) {
    return sendJson(res, 400, { error: "Path Qdrant tidak diizinkan." });
  }

  if (!["GET", "PUT"].includes(method)) {
    return sendJson(res, 400, { error: "Method Qdrant tidak diizinkan." });
  }

  try {
    const qdrantRes = await fetch(`${endpoint}${path}`, {
      method,
      headers: {
        "api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: method === "GET" ? undefined : JSON.stringify(payload.body ?? {}),
    });

    const text = await qdrantRes.text();
    let data: unknown = text;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { raw: text };
    }

    if (!qdrantRes.ok) {
      return sendJson(res, qdrantRes.status, {
        error:
          qdrantRes.status === 401 || qdrantRes.status === 403
            ? "Qdrant API Key ditolak. Cek API key atau buat key baru."
            : qdrantRes.status === 404
              ? "Endpoint atau collection Qdrant tidak ditemukan. Cek endpoint cluster."
              : "Qdrant error.",
        detail: data,
      });
    }

    return sendJson(res, 200, data);
  } catch (error) {
    return sendJson(res, 502, {
      error: "Server proxy tidak bisa menghubungi Qdrant. Cek endpoint cluster dan koneksi Qdrant.",
      detail: error instanceof Error ? error.message : String(error),
    });
  }
}
