import {
  forwardRef,
  useImperativeHandle,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
} from "react";
import { FileUp, Send, Square, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { ChatAttachment } from "@/lib/chat/types";

export interface ChatInputHandle {
  setText: (text: string) => void;
}

interface ChatInputProps {
  onSend: (text: string, attachments?: ChatAttachment[]) => void;
  onStop?: () => void;
  loading?: boolean;
  disabled?: boolean;
  placeholder?: string;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("Gagal membaca file."));
    reader.readAsDataURL(file);
  });
}

function readAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("Gagal membaca file."));
    reader.readAsText(file);
  });
}

async function fileToAttachment(file: File): Promise<ChatAttachment> {
  const attachment: ChatAttachment = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    name: file.name,
    type: file.type || "application/octet-stream",
    size: file.size,
  };

  if (file.type.startsWith("image/")) {
    attachment.dataUrl = await readAsDataUrl(file);
    return attachment;
  }

  if (
    file.type.startsWith("text/") ||
    file.type === "application/json" ||
    file.name.toLowerCase().endsWith(".txt") ||
    file.name.toLowerCase().endsWith(".json") ||
    file.name.toLowerCase().endsWith(".md") ||
    file.name.toLowerCase().endsWith(".csv")
  ) {
    attachment.text = (await readAsText(file)).slice(0, 12000);
  }

  return attachment;
}

export const ChatInput = forwardRef<ChatInputHandle, ChatInputProps>(
  function ChatInput({ onSend, onStop, loading, disabled, placeholder }, handleRef) {
    const [value, setValue] = useState("");
    const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
    const [readingFiles, setReadingFiles] = useState(false);
    const ref = useRef<HTMLTextAreaElement>(null);
    const fileRef = useRef<HTMLInputElement>(null);

    const resize = () => {
      const el = ref.current;
      if (!el) return;
      el.style.height = "auto";
      el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
    };

    useImperativeHandle(handleRef, () => ({
      setText: (text: string) => {
        setValue(text);
        requestAnimationFrame(() => {
          ref.current?.focus();
          resize();
        });
      },
    }));

    const submit = () => {
      const text = value.trim();
      if ((!text && attachments.length === 0) || loading || disabled || readingFiles) return;
      onSend(text || "Tolong analisis file yang saya upload.", attachments);
      setValue("");
      setAttachments([]);
      requestAnimationFrame(() => {
        if (ref.current) ref.current.style.height = "auto";
      });
    };

    const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        submit();
      }
    };

    const onFiles = async (e: ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files ?? []);
      if (files.length === 0) return;
      setReadingFiles(true);
      try {
        const next = await Promise.all(files.slice(0, 5).map(fileToAttachment));
        setAttachments((prev) => [...prev, ...next].slice(0, 5));
      } finally {
        setReadingFiles(false);
        e.target.value = "";
      }
    };

    const removeAttachment = (id: string) => {
      setAttachments((prev) => prev.filter((x) => x.id !== id));
    };

    return (
      <div className="border-t border-border bg-background/80 px-3 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto w-full max-w-3xl space-y-2">
          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-2 rounded-2xl border border-border bg-card p-2">
              {attachments.map((att) => (
                <div key={att.id} className="flex max-w-full items-center gap-2 rounded-xl bg-muted px-2 py-1 text-xs">
                  {att.dataUrl ? (
                    <img src={att.dataUrl} alt={att.name} className="size-8 rounded-lg object-cover" />
                  ) : (
                    <FileUp className="size-4 shrink-0 text-muted-foreground" />
                  )}
                  <span className="max-w-[150px] truncate">{att.name}</span>
                  <span className="shrink-0 text-[10px] text-muted-foreground">{formatSize(att.size)}</span>
                  <button type="button" onClick={() => removeAttachment(att.id)} aria-label="Hapus file" className="rounded p-0.5 hover:bg-background">
                    <X className="size-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-end gap-2">
            <input
              ref={fileRef}
              type="file"
              multiple
              accept="image/*,.pdf,.txt,.md,.json,.csv,.doc,.docx,.xls,.xlsx"
              className="hidden"
              onChange={onFiles}
            />
            <Button
              type="button"
              size="icon"
              variant="outline"
              onClick={() => fileRef.current?.click()}
              disabled={disabled || loading || readingFiles}
              className="size-11 shrink-0 rounded-2xl"
              aria-label="Upload file"
              title="Upload foto/PDF/file"
            >
              {readingFiles ? <Square className="size-4" /> : <FileUp className="size-4" />}
            </Button>
            <Textarea
              ref={ref}
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
                resize();
              }}
              onKeyDown={onKeyDown}
              rows={1}
              disabled={disabled}
              placeholder={placeholder ?? "Ketik pesan…"}
              className="max-h-40 min-h-[44px] flex-1 resize-none rounded-2xl bg-card"
            />
            {loading ? (
              <Button
                type="button"
                size="icon"
                variant="secondary"
                onClick={onStop}
                className="size-11 shrink-0 rounded-2xl"
                aria-label="Hentikan"
              >
                <Square className="size-4" />
              </Button>
            ) : (
              <Button
                type="button"
                size="icon"
                onClick={submit}
                disabled={disabled || readingFiles || (!value.trim() && attachments.length === 0)}
                className="size-11 shrink-0 rounded-2xl"
                aria-label="Kirim"
              >
                <Send className="size-4" />
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  },
);
