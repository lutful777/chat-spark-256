import { Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  Check,
  MessageSquarePlus,
  Pencil,
  Settings,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { Conversation } from "@/lib/chat/types";

interface Props {
  conversations: Conversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNewChat: () => void;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => void;
}

function formatDate(ts: number): string {
  try {
    return new Date(ts).toLocaleDateString(undefined, {
      day: "2-digit",
      month: "short",
    });
  } catch {
    return "";
  }
}

export function ConversationSidebar({
  conversations,
  activeId,
  onSelect,
  onNewChat,
  onDelete,
  onRename,
}: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingId) inputRef.current?.focus();
  }, [editingId]);

  const startEdit = (c: Conversation) => {
    setEditingId(c.id);
    setDraft(c.title);
  };

  const commitEdit = () => {
    if (editingId) {
      const title = draft.trim();
      if (title) onRename(editingId, title.slice(0, 80));
    }
    setEditingId(null);
  };

  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <div className="flex items-center gap-2 px-4 py-4">
        <div className="flex size-9 items-center justify-center rounded-xl bg-primary/15 text-primary">
          <Sparkles className="size-5" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">API Chat Client</p>
          <p className="truncate text-xs text-muted-foreground">OpenAI-compatible</p>
        </div>
      </div>

      <div className="px-3">
        <Button onClick={onNewChat} className="w-full justify-start gap-2 rounded-xl">
          <MessageSquarePlus className="size-4" />
          New Chat
        </Button>
      </div>

      <ScrollArea className="mt-3 flex-1 px-2">
        <div className="flex flex-col gap-1 pb-2">
          {conversations.length === 0 && (
            <p className="px-3 py-6 text-center text-xs text-muted-foreground">
              Belum ada percakapan. Mulai chat baru.
            </p>
          )}
          {conversations.map((c) => (
            <div
              key={c.id}
              className={cn(
                "group flex items-center gap-2 rounded-xl px-3 py-2 text-sm transition-colors",
                c.id === activeId
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "hover:bg-sidebar-accent/50",
              )}
            >
              {editingId === c.id ? (
                <>
                  <Input
                    ref={inputRef}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitEdit();
                      if (e.key === "Escape") setEditingId(null);
                    }}
                    className="h-7 flex-1 rounded-md px-2 text-sm"
                  />
                  <button
                    type="button"
                    onClick={commitEdit}
                    aria-label="Simpan nama"
                    className="shrink-0 rounded-md p-1 text-primary"
                  >
                    <Check className="size-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingId(null)}
                    aria-label="Batal"
                    className="shrink-0 rounded-md p-1 text-muted-foreground"
                  >
                    <X className="size-4" />
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => onSelect(c.id)}
                    className="min-w-0 flex-1 text-left"
                    title={c.title}
                  >
                    <span className="block truncate">{c.title}</span>
                    <span className="block truncate text-[10px] text-muted-foreground">
                      {formatDate(c.createdAt)}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => startEdit(c)}
                    aria-label="Ganti nama"
                    className="shrink-0 rounded-md p-1 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100"
                  >
                    <Pencil className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(c.id)}
                    aria-label="Hapus percakapan"
                    className="shrink-0 rounded-md p-1 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      </ScrollArea>

      <div className="border-t border-sidebar-border p-3">
        <Button asChild variant="ghost" className="w-full justify-start gap-2 rounded-xl">
          <Link to="/settings">
            <Settings className="size-4" />
            Settings
          </Link>
        </Button>
      </div>
    </div>
  );
}
