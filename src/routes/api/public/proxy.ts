import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

const RequestSchema = z.object({
  baseUrl: z.string().trim().url().max(2048),
  path: z.string().trim().min(1).max(512),
  apiKey: z.string().trim().min(1).max(8192),
  payload: z.object({
    model: z.string().trim().min(1).max(256),
    messages: z
      .array(
        z.object({
          role: z.enum(["system", "user", "assistant"]),
          content: z.string().max(200000),
        }),
      )
      .min(1)
      .max(200),
    temperature: z.number().min(0).max(2).optional(),
    max_tokens: z.number().int().min(1).max(200000).optional(),
  }),
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

export const Route = createFileRoute("/api/public/proxy")({
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

        const { baseUrl, path, apiKey, payload } = parsed.data;
        const target = `${baseUrl.replace(/\/$/, "")}${path.startsWith("/") ? "" : "/"}${path}`;

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

          const text = await upstream.text();
          return new Response(text, {
            status: upstream.status,
            headers: {
              "Content-Type":
                upstream.headers.get("Content-Type") ?? "application/json",
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