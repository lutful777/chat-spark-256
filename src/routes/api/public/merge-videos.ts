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

const MergeSchema = z.object({
  url1: z.string().min(1),
  url2: z.string().min(1),
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
    const b64 = urlOrData.slice(comma + 1);
    const buf = Buffer.from(b64, "base64");
    await writeFile(dest, buf);
    return;
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120_000);
  try {
    const res = await fetch(urlOrData, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status} saat mengunduh video.`);
    const buf = await res.arrayBuffer();
    await writeFile(dest, Buffer.from(buf));
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
      else reject(new Error(`ffmpeg keluar dengan kode ${code}: ${stderr.slice(-400)}`));
    });
    proc.on("error", (err: Error) =>
      reject(new Error(`Tidak dapat menjalankan ffmpeg: ${err.message}`)),
    );
  });
}

export const Route = createFileRoute("/api/public/merge-videos")({
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

        const parsed = MergeSchema.safeParse(raw);
        if (!parsed.success) {
          return json(
            { error: "Input tidak valid: " + (parsed.error.issues[0]?.message ?? "") },
            400,
          );
        }

        const { url1, url2 } = parsed.data;
        const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const dir = join(tmpdir(), `merge-${id}`);

        try {
          await mkdir(dir, { recursive: true });
          const v1 = join(dir, "v1.mp4");
          const v2 = join(dir, "v2.mp4");
          const listFile = join(dir, "list.txt");
          const merged = join(dir, "merged.mp4");

          await Promise.all([toFile(url1, v1), toFile(url2, v2)]);

          await writeFile(listFile, `file '${v1}'\nfile '${v2}'\n`);

          await runFfmpeg([
            "-f", "concat",
            "-safe", "0",
            "-i", listFile,
            "-c", "copy",
            "-movflags", "+faststart",
            "-y", merged,
          ]);

          const data = await readFile(merged);
          return new Response(data, {
            status: 200,
            headers: {
              "Content-Type": "video/mp4",
              "Content-Disposition": 'attachment; filename="merged-video.mp4"',
              "Cache-Control": "no-cache",
              ...corsHeaders,
            },
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Kesalahan tidak diketahui.";
          console.error("[merge-videos]", msg);
          return json({ error: `Gagal menggabungkan video: ${msg}` }, 500);
        } finally {
          rm(dir, { recursive: true, force: true }).catch(() => {});
        }
      },
    },
  },
});
