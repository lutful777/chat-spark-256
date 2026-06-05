import { useRef } from "react";
import { Clipboard, Download, Upload } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

declare global {
  interface Window {
    AndroidBackup?: {
      saveBackup: (fileName: string, content: string) => void;
    };
  }
}

interface BackupPayload {
  app: "AI Chat";
  type: "localStorage-backup";
  version: number;
  exportedAt: string;
  origin: string;
  data: Record<string, string>;
}

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

function makeFilename(): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `ai-chat-backup-${stamp}.json`;
}

function readAllLocalStorage(): Record<string, string> {
  const data: Record<string, string> = {};
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (!key) continue;
    const value = localStorage.getItem(key);
    if (value != null) data[key] = value;
  }
  return data;
}

function createBackupText(): string {
  const payload: BackupPayload = {
    app: "AI Chat",
    type: "localStorage-backup",
    version: 1,
    exportedAt: new Date().toISOString(),
    origin: window.location.origin,
    data: readAllLocalStorage(),
  };
  return JSON.stringify(payload, null, 2);
}

function parseBackup(text: string): BackupPayload {
  const parsed = JSON.parse(text) as Partial<BackupPayload>;
  if (!parsed || parsed.type !== "localStorage-backup" || typeof parsed.data !== "object" || parsed.data == null) {
    throw new Error("File backup tidak valid.");
  }
  return parsed as BackupPayload;
}

function applyBackup(text: string): void {
  const backup = parseBackup(text);
  const count = Object.keys(backup.data).length;
  if (!count) throw new Error("Backup kosong.");
  const ok = confirm(`Impor ${count} data ke aplikasi ini? Data lokal sekarang akan diganti.`);
  if (!ok) return;

  localStorage.clear();
  for (const [key, value] of Object.entries(backup.data)) {
    if (typeof value === "string") localStorage.setItem(key, value);
  }
  toast.success("Data berhasil diimpor. Aplikasi akan dimuat ulang.");
  window.setTimeout(() => window.location.reload(), 700);
}

export function DataBackupPanel({ compact = false }: { compact?: boolean }) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  const handleExport = async () => {
    if (!isBrowser()) return;
    const text = createBackupText();
    const filename = makeFilename();

    if (window.AndroidBackup?.saveBackup) {
      window.AndroidBackup.saveBackup(filename, text);
      try {
        await navigator.clipboard?.writeText(text);
      } catch {
        /* native file export is enough */
      }
      toast.success("File backup dibuat di folder Download.");
      return;
    }

    const blob = new Blob([text], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);

    try {
      await navigator.clipboard?.writeText(text);
      toast.success("Data diexport dan juga disalin. Simpan file/catatan backup dengan aman.");
    } catch {
      toast.success("Data diexport. Simpan file backup dengan aman.");
    }
  };

  const handleCopy = async () => {
    if (!isBrowser()) return;
    const text = createBackupText();
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Data backup disalin ke clipboard.");
    } catch {
      toast.error("Tidak bisa copy otomatis. Pakai Export Data sebagai file backup.");
    }
  };

  const handleImportText = () => {
    if (!isBrowser()) return;
    const text = prompt("Tempel/ paste isi backup JSON di sini:");
    if (!text) return;
    try {
      applyBackup(text);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Gagal impor data.");
    }
  };

  const handleImportFile = async (file: File) => {
    try {
      const text = await file.text();
      applyBackup(text);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Gagal impor data.");
    } finally {
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <section className="rounded-2xl border border-border bg-card p-4 md:p-6">
      <h2 className="mb-1 text-sm font-semibold">Backup Data</h2>
      <p className="mb-3 text-xs text-muted-foreground">
        Export untuk memindahkan API key, provider, history, dan pengaturan dari APK lama. File/copy backup berisi data sensitif, jangan dibagikan.
      </p>
      <input
        ref={inputRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          if (file) void handleImportFile(file);
        }}
      />
      <div className={compact ? "grid gap-2 sm:grid-cols-2" : "flex flex-wrap gap-2"}>
        <Button type="button" variant="secondary" className="gap-2 rounded-xl" onClick={() => void handleExport()}>
          <Download className="size-4" /> Export Data
        </Button>
        <Button type="button" variant="outline" className="gap-2 rounded-xl" onClick={() => void handleCopy()}>
          <Clipboard className="size-4" /> Copy Data
        </Button>
        <Button type="button" variant="outline" className="gap-2 rounded-xl" onClick={() => inputRef.current?.click()}>
          <Upload className="size-4" /> Import File
        </Button>
        <Button type="button" variant="outline" className="gap-2 rounded-xl" onClick={handleImportText}>
          <Upload className="size-4" /> Import Text
        </Button>
      </div>
    </section>
  );
}
