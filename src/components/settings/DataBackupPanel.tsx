import { useRef, useState } from "react";
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

function downloadFile(filename: string, text: string): void {
  const blob = new Blob([text], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 300);
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
  const textAreaRef = useRef<HTMLTextAreaElement | null>(null);
  const [importTextOpen, setImportTextOpen] = useState(false);
  const [importTextValue, setImportTextValue] = useState("");

  const focusImportBox = () => {
    window.setTimeout(() => {
      textAreaRef.current?.focus({ preventScroll: true });
    }, 80);
  };

  const closeImportTextDialog = () => {
    setImportTextOpen(false);
    setImportTextValue("");
  };

  const submitImportText = () => {
    if (!isBrowser()) return;
    const text = importTextValue.trim();
    if (!text) return;
    try {
      applyBackup(text);
      closeImportTextDialog();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Gagal impor data.");
    }
  };

  const pasteFromClipboard = async () => {
    if (!isBrowser()) return;
    try {
      const text = await navigator.clipboard.readText();
      if (!text.trim()) {
        toast.error("Clipboard kosong.");
        focusImportBox();
        return;
      }
      setImportTextValue(text);
      toast.success("Teks backup berhasil ditempel.");
      focusImportBox();
    } catch {
      toast.error("Tidak bisa paste otomatis. Tap kolom lalu tahan sebentar untuk Paste.");
      focusImportBox();
    }
  };

  const handleExport = async () => {
    if (!isBrowser()) return;
    const text = createBackupText();
    const filename = makeFilename();

    if (window.AndroidBackup?.saveBackup) {
      window.AndroidBackup.saveBackup(filename, text);
      try { await navigator.clipboard?.writeText(text); } catch { /* ignore */ }
      toast.success("File backup dibuat di folder Download.");
      return;
    }

    downloadFile(filename, text);

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
    setImportTextValue("");
    setImportTextOpen(true);
    focusImportBox();
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
    <>
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

      {importTextOpen ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 px-5"
          role="dialog"
          aria-modal="true"
          aria-labelledby="import-text-title"
        >
          <div className="w-full max-w-[600px] rounded-2xl border border-white/10 bg-[#3f4243] p-5 shadow-2xl">
            <label id="import-text-title" className="mb-4 block text-base font-medium text-white sm:text-lg">
              Tempel/ paste isi backup JSON di sini:
            </label>
            <textarea
              ref={textAreaRef}
              value={importTextValue}
              onChange={(event) => setImportTextValue(event.currentTarget.value)}
              onClick={focusImportBox}
              autoFocus
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              inputMode="text"
              className="h-16 max-h-16 min-h-16 w-full resize-none overflow-auto rounded-none border-0 border-b-2 border-[#8bd0cf] bg-[#080b14] px-2 py-2 text-sm text-white outline-none [scrollbar-width:thin] [-webkit-user-select:text] [user-select:text]"
              style={{ WebkitUserSelect: "text", userSelect: "text", caretColor: "#8bd0cf" }}
              aria-label="Isi backup JSON"
            />
            <div className="mt-4 flex items-center justify-between gap-3">
              <button
                type="button"
                className="rounded-lg border border-[#9ad7d6]/30 px-3 py-2 text-sm font-semibold text-[#9ad7d6]"
                onClick={() => void pasteFromClipboard()}
              >
                Paste
              </button>
              <div className="flex justify-end gap-8 text-sm font-semibold uppercase tracking-wide text-[#9ad7d6]">
                <button type="button" className="px-1 py-2" onClick={closeImportTextDialog}>
                  Cancel
                </button>
                <button type="button" className="px-1 py-2" onClick={submitImportText}>
                  OK
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
