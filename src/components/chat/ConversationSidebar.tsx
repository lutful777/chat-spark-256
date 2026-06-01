import { Link } from "@tanstack/react-router";
import { MessageSquarePlus, Settings, Sparkles, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { Conversation } from "@/lib/chat/types";

interface Props {
  conversations: Conversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNewChat: () => void;
  onDelete: (id: string) => void;
}

export function ConversationSidebar({
  conversations,
  activeId,
  onSelect,
  onNewChat,
  onDelete,
}: Props) {
  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <div className="flex items-center gap-2 px-4 py-4">
        <div className="flex size-9 items-center justify-center rounded-xl bg-primary/15 text-primary">
          <Sparkles className="size-5" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">AI API Chat</p>
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
              <button
                type="button"
                onClick={() => onSelect(c.id)}
                className="min-w-0 flex-1 truncate text-left"
                title={c.title}
              >
                {c.title}
              </button>
              <button
                type="button"
                onClick={() => onDelete(c.id)}
                aria-label="Hapus percakapan"
                className="shrink-0 rounded-md p-1 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
              >
                <Trash2 className="size-4" />
              </button>
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