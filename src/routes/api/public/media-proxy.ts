import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import {
  isXaiUrl,
  estimateCost,
  checkBudget,
  debitBudget,
} from "@/lib/server/budget";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

/**
 * Generic forwarding proxy for media (image/video) endpoints.
 * Forwards an arbitrary JSON payload (or a GET poll) to {baseUrl}{path}
 * using the user's own API key. No keys are stored server-side.
 *
 * x.ai POST requests (initial generation, not status-polling GETs) are
 * gated by a configurable daily USD budget (DAILY_XAI_BUDGET_USD env var).
 */
const RequestSchema = z.object({
  method: z.enum(["GET", "POST"]).optional().default("POST"),
  baseUrl: z.string().trim().url().max(2048),
  path: z.string().trim().min(1).max(2048),
  apiKey: z.string().trim().min(1).max(8192),
  // payload is forwarded as-is for POST; ignored for GET
  payload: z.unknown().optional(),
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

export const Route = createFileRoute("/api/public/media-proxy")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: corsHeaders }),
      POST: async ({ request }) => {
        let raw: unknown;
        try {
          raw = await request.json();
        } catch {
          return json({ error: "Body bukan JSON yang valid." }, 400);
        }

        const parsed = RequestSchema.safeParse(raw);
        if (!parsed.success) {
          return json(
            { error: "Konfigurasi tidak valid: " + parsed.error.issues[0]?.message },
            400,
          );
        }

        const { method, baseUrl, path, apiKey, payload } = parsed.data;

        // ── x.ai daily budget gate ────────────────────────────────────────────
        // Only applies to POST (initial generation) requests, not GET polls.
        if (method === "POST" && isXaiUrl(baseUrl)) {
          const cost = estimateCost({ path, payload });
          const check = checkBudget(cost);
          if (!check.allowed) {
            return json({ error: check.message }, 429);
          }
          // Debit optimistically — if upstream fails the cost is still logged
          // (acceptable for a budget guard; avoids under-counting retries).
          debitBudget(cost);
        }
        // ─────────────────────────────────────────────────────────────────────

        const target = `${baseUrl.replace(/\/$/, "")}${path.startsWith("/") ? "" : "/"}${path}`;

        const controller = new AbortController();
        // video generation can take a while; polling requests are short.
        const timeout = setTimeout(() => controller.abort(), 120000);

        try {
          const upstream = await fetch(target, {
            method,
            headers:
              method === "GET"
                ? { Authorization: `Bearer ${apiKey}`, Accept: "application/json" }
                : {
                    Authorization: `Bearer ${apiKey}`,
                    "Content-Type": "application/json",
                  },
            body: method === "GET" ? undefined : JSON.stringify(payload ?? {}),
            signal: controller.signal,
          });

          clearTimeout(timeout);

          // Pass the upstream body (json, image/* or video/*) straight through.
          return new Response(upstream.body, {
            status: upstream.status,
            headers: {
              "Content-Type":
                upstream.headers.get("Content-Type") ?? "application/json",
              "Cache-Control": "no-cache",
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
      },
    },
  },
});
