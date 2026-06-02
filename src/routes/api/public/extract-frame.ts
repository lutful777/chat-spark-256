import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { spawn } from "node:child_process";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

const ExtractFrameSchema = z.object({
  videoUrl: z.string().min(1),
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

async function toFile(urlOrData: string, dest: string): Promise<void> {
  if (urlOrData.startsWith("data:")) {
    const comma = urlOrData.indexOf(",");
    if (comma === -1) throw new Error("Data URL tidak valid.");
    await writeFile(dest, Buffer.from(urlOrData.slice(comma + 1), "base64"));
    return;
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120_000);
  try {
    const res = await fetch(urlOrData, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status} saat mengunduh video.`);
    await writeFile(dest, Buffer.from(await res.arrayBuffer()));
  } finally {
    clearTimeout(timeout);
  }
}

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn("ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    proc.stderr?.on("data", (d: Buffer) => {
      stderr += d.toString();
    });
    proc.on("close", (code: number | null) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg error (kode ${code}): ${stderr.slice(-400)}`));
    });
    proc.on("error", (err: Error) =>
      reject(new Error(`Tidak dapat menjalankan ffmpeg: ${err.message}`)),
    );
  });
}

export const Route = createFileRoute("/api/public/extract-frame")({
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

        const parsed = ExtractFrameSchema.safeParse(raw);
        if (!parsed.success) {
          return json(
            { error: "Input tidak valid: " + (parsed.error.issues[0]?.message ?? "") },
            400,
          );
        }

        const { videoUrl } = parsed.data;
        const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const dir = join(tmpdir(), `frame-${id}`);

        try {
          await mkdir(dir, { recursive: true });
          const videoFile = join(dir, "video.mp4");
          const frameFile = join(dir, "frame.jpg");

          await toFile(videoUrl, videoFile);

          // Extract last frame: seek 1 s before end, take 1 frame, JPEG quality 2
          await runFfmpeg([
            "-sseof", "-1",
            "-i", videoFile,
            "-frames:v", "1",
            "-q:v", "2",
            "-y", frameFile,
          ]);

          const data = await readFile(frameFile);
          return new Response(data, {
            status: 200,
            headers: {
              "Content-Type": "image/jpeg",
              "Cache-Control": "no-cache",
              ...corsHeaders,
            },
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Kesalahan tidak diketahui.";
          console.error("[extract-frame]", msg);
          return json({ error: `Gagal mengambil frame terakhir: ${msg}` }, 500);
        } finally {
          rm(dir, { recursive: true, force: true }).catch(() => {});
        }
      },
    },
  },
});
