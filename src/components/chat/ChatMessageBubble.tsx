import { useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  AlertTriangle,
  Bot,
  Check,
  Copy,
  FileUp,
  Pencil,
  Share2,
  Trash2,
  User,
} from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import type { ChatAttachment, ChatMessage } from "@/lib/chat/types";

interface Props {
  message: ChatMessage;
  onRegenerate?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function cleanUserContent(content: string): string {
  return content
    .replace(/\n?---\s*\nFile yang diupload:[\s\S]*$/i, "")
    .replace(/\n?File yang diupload:[\s\S]*$/i, "")
    .trim();
}

function textFromNode(node: React.ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textFromNode).join("");
  if (node && typeof node === "object" && "props" in node) {
    return textFromNode((node as { props?: { children?: React.ReactNode } }).props?.children);
  }
  return "";
}

function looksLikeScript(content: string): boolean {
  const text = content.trim();
  if (text.includes("```")) return false;
  const markers = [
    "import ",
    "export ",
    "function ",
    "const ",
    "let ",
    "class ",
    "return ",
    "<div",
    "<script",
    "android {",
    "dependencies {",
    "plugins {",
    "public class ",
    "package ",
    "<?xml",
    "<manifest",
  ];
  const lineCount = text.split("\n").filter((line) => line.trim()).length;
  const markerCount = markers.filter((marker) => text.includes(marker)).length;
  return text.length > 120 && lineCount >= 4 && markerCount >= 2;
}

function AttachmentPreview({ attachment }: { attachment: ChatAttachment }) {
  const isImage = attachment.dataUrl && attachment.type.startsWith("image/");

  return (
    <div className="max-w-full overflow-hidden rounded-xl border border-border/60 bg-background text-xs">
      {isImage ? (
        <img
          src={attachment.dataUrl}
          alt={attachment.name}
          className="max-h-72 max-w-full rounded-t-xl object-contain"
        />
      ) : null}
      <div className="flex min-w-0 items-center gap-2 px-2 py-1.5">
        <FileUp className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate">{attachment.name}</span>
        <span className="shrink-0 text-[10px] text-muted-foreground">{formatSize(attachment.size)}</span>
      </div>
    </div>
  );
}

function CopyScriptButton({ text, compact = false }: { text: string; compact?: boolean }) {
  const [copied, setCopied] = useState(false);

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(text.trim());
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
      toast.success("Script disalin.");
    } catch {
      toast.error("Gagal menyalin script.");
    }
  };

  return (
    <button
      type="button"
      onClick={copyCode}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground active:scale-95",
        compact ? "px-2 py-1" : "px-2.5 py-1.5",
      )}
      aria-label="Copy script"
    >
      {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      {copied ? "Copied" : "Copy script"}
    </button>
  );
}

function CodeBlock({ children }: { children?: React.ReactNode }) {
  const code = textFromNode(children).replace(/\n$/, "");

  return (
    <div className="my-2 overflow-hidden rounded-xl border border-border bg-secondary">
      <pre className="m-0 max-w-full overflow-x-auto whitespace-pre-wrap break-words p-3 pb-2 text-xs">
        <code className="bg-transparent p-0">{children}</code>
      </pre>
      <div className="flex justify-end border-t border-border/70 bg-background px-2 py-1.5">
        <CopyScriptButton text={code} compact />
      </div>
    </div>
  );
}

export function ChatMessageBubble({
  message,
  onEdit,
  onDelete,
}: Props) {
  const isUser = message.role === "user";
  const [copied, setCopied] = useState(false);
  const displayContent = useMemo(
    () => (isUser ? cleanUserContent(message.content) : message.content),
    [isUser, message.content],
  );
  const showScriptFallback = !isUser && !message.error && looksLikeScript(message.content);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(displayContent || message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
      toast.success("Disalin.");
    } catch {
      toast.error("Gagal menyalin.");
    }
  };

  const share = async () => {
    const text = displayContent || message.content;
    try {
      if (navigator.share) {
        await navigator.share({ text });
      } else {
        await navigator.clipboard.writeText(text);
        toast.success("Teks disalin untuk dibagikan.");
      }
    } catch {
      // User may cancel native share sheet.
    }
  };

  return (
    <div className={cn("group flex w-full min-w-0 gap-2.5 overflow-hidden", isUser ? "justify-end" : "justify-start")}>
      {!isUser && (
        <div
          className={cn(
            "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full",
            message.error ? "bg-destructive text-destructive-foreground" : "bg-primary/15 text-primary",
          )}
        >
          {message.error ? <AlertTriangle className="size-4" /> : <Bot className="size-4" />}
        </div>
      )}

      <div className={cn("flex min-w-0 max-w-[calc(100vw-4.5rem)] flex-col gap-1 sm:max-w-[82%]", isUser ? "items-end" : "items-start")}>
        <div
          className={cn(
            "min-w-0 max-w-full overflow-hidden rounded-2xl px-4 py-2.5 text-sm leading-relaxed shadow-sm",
            isUser
              ? "rounded-br-md bg-primary text-primary-foreground"
              : message.error
                ? "rounded-bl-md border border-destructive/40 bg-destructive/15 text-destructive-foreground"
                : "rounded-bl-md border border-border bg-card text-card-foreground",
          )}
        >
          {isUser ? (
            <div className="min-w-0 max-w-full space-y-2 overflow-hidden">
              {message.attachments?.map((attachment) => (
                <AttachmentPreview key={attachment.id} attachment={attachment} />
              ))}
              {displayContent && (
                <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{displayContent}</p>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <div
                className={cn(
                  "min-w-0 max-w-full overflow-hidden [overflow-wrap:anywhere] [&_*]:max-w-full [&_a]:break-all [&_a]:text-primary [&_a]:underline",
                  "[&_p]:my-1.5 first:[&_p]:mt-0 last:[&_p]:mb-0 [&_p]:break-words",
                  "[&_ul]:my-1.5 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-1.5 [&_ol]:list-decimal [&_ol]:pl-5",
                  "[&_h1]:mt-2 [&_h1]:mb-1 [&_h1]:break-words [&_h1]:text-base [&_h1]:font-semibold",
                  "[&_h2]:mt-2 [&_h2]:mb-1 [&_h2]:break-words [&_h2]:text-base [&_h2]:font-semibold",
                  "[&_h3]:mt-2 [&_h3]:mb-1 [&_h3]:break-words [&_h3]:font-semibold",
                  "[&_code]:rounded [&_code]:bg-secondary [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-xs [&_code]:break-words [&_code]:[overflow-wrap:anywhere]",
                  "[&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground",
                  "[&_table]:my-2 [&_table]:block [&_table]:max-w-full [&_table]:overflow-x-auto [&_th]:border [&_th]:border-border [&_th]:px-2 [&_th]:py-1 [&_td]:border [&_td]:border-border [&_td]:px-2 [&_td]:py-1",
                )}
              >
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
                  }}
                >
                  {message.content}
                </ReactMarkdown>
              </div>
              {showScriptFallback && (
                <div className="flex justify-end border-t border-border/60 pt-2">
                  <CopyScriptButton text={message.content} />
                </div>
              )}
            </div>
          )}
        </div>

        <div className={cn("flex items-center gap-1", isUser ? "opacity-100 sm:opacity-0 sm:transition-opacity sm:group-hover:opacity-100" : "opacity-100")}>
          {!isUser && !message.error && (
            <>
              <ActionButton label={copied ? "Tersalin" : "Salin"} onClick={copy}>
                {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
              </ActionButton>
              <ActionButton label="Bagikan" onClick={share}>
                <Share2 className="size-4" />
              </ActionButton>
            </>
          )}
          {isUser && onEdit && (
            <ActionButton label="Edit" onClick={onEdit}>
              <Pencil className="size-3.5" />
            </ActionButton>
          )}
          {isUser && onDelete && (
            <ActionButton label="Hapus" onClick={onDelete}>
              <Trash2 className="size-3.5" />
            </ActionButton>
          )}
          {!isUser && message.error && onDelete && (
            <ActionButton label="Hapus" onClick={onDelete}>
              <Trash2 className="size-3.5" />
            </ActionButton>
          )}
        </div>
      </div>

      {isUser && (
        <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary text-secondary-foreground">
          <User className="size-4" />
        </div>
      )}
    </div>
  );
}

function ActionButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground active:scale-95"
    >
      {children}
    </button>
  );
}
