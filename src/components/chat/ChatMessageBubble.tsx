import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  AlertTriangle,
  Bot,
  Check,
  Copy,
  FileUp,
  Pencil,
  RefreshCw,
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

function AttachmentPreview({ attachment }: { attachment: ChatAttachment }) {
  return (
    <div className="mt-2 overflow-hidden rounded-xl border border-border/60 bg-background/40 text-xs">
      {attachment.dataUrl && attachment.type.startsWith("image/") ? (
        <img src={attachment.dataUrl} alt={attachment.name} className="max-h-56 w-full object-cover" />
      ) : null}
      <div className="flex items-center gap-2 px-2 py-1.5">
        <FileUp className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate">{attachment.name}</span>
        <span className="shrink-0 text-[10px] text-muted-foreground">{formatSize(attachment.size)}</span>
      </div>
    </div>
  );
}

export function ChatMessageBubble({
  message,
  onRegenerate,
  onEdit,
  onDelete,
}: Props) {
  const isUser = message.role === "user";
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Gagal menyalin.");
    }
  };

  return (
    <div className={cn("group flex w-full gap-2.5", isUser ? "justify-end" : "justify-start")}>
      {!isUser && (
        <div
          className={cn(
            "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full",
            message.error ? "bg-destructive/15 text-destructive" : "bg-primary/15 text-primary",
          )}
        >
          {message.error ? <AlertTriangle className="size-4" /> : <Bot className="size-4" />}
        </div>
      )}

      <div className={cn("flex min-w-0 max-w-[82%] flex-col gap-1", isUser ? "items-end" : "items-start")}>
        <div
          className={cn(
            "min-w-0 max-w-full rounded-2xl px-4 py-2.5 text-sm leading-relaxed shadow-sm",
            isUser
              ? "rounded-br-md bg-primary text-primary-foreground"
              : message.error
                ? "rounded-bl-md border border-destructive/40 bg-destructive/10 text-destructive-foreground"
                : "rounded-bl-md border border-border bg-card text-card-foreground",
          )}
        >
          {isUser ? (
            <>
              <p className="whitespace-pre-wrap break-words">{message.content}</p>
              {message.attachments?.map((attachment) => (
                <AttachmentPreview key={attachment.id} attachment={attachment} />
              ))}
            </>
          ) : (
            <div
              className={cn(
                "min-w-0 [overflow-wrap:anywhere] [&_a]:break-all [&_a]:text-primary [&_a]:underline",
                "[&_p]:my-1.5 first:[&_p]:mt-0 last:[&_p]:mb-0",
                "[&_ul]:my-1.5 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-1.5 [&_ol]:list-decimal [&_ol]:pl-5",
                "[&_h1]:mt-2 [&_h1]:mb-1 [&_h1]:text-base [&_h1]:font-semibold",
                "[&_h2]:mt-2 [&_h2]:mb-1 [&_h2]:text-base [&_h2]:font-semibold",
                "[&_h3]:mt-2 [&_h3]:mb-1 [&_h3]:font-semibold",
                "[&_pre]:my-2 [&_pre]:max-w-full [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-secondary [&_pre]:p-3 [&_pre]:text-xs",
                "[&_code]:rounded [&_code]:bg-secondary [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-xs",
                "[&_pre_code]:bg-transparent [&_pre_code]:p-0",
                "[&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground",
                "[&_table]:my-2 [&_table]:w-full [&_th]:border [&_th]:border-border [&_th]:px-2 [&_th]:py-1 [&_td]:border [&_td]:border-border [&_td]:px-2 [&_td]:py-1",
              )}
            >
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
            </div>
          )}
        </div>

        <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          {!isUser && !message.error && (
            <ActionButton label={copied ? "Tersalin" : "Salin"} onClick={copy}>
              {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
            </ActionButton>
          )}
          {!isUser && onRegenerate && (
            <ActionButton label="Buat ulang" onClick={onRegenerate}>
              <RefreshCw className="size-3.5" />
            </ActionButton>
          )}
          {isUser && onEdit && (
            <ActionButton label="Edit" onClick={onEdit}>
              <Pencil className="size-3.5" />
            </ActionButton>
          )}
          {onDelete && (
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
      className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
    >
      {children}
    </button>
  );
}
