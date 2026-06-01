import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Download,
  Eraser,
  FileJson,
  FileText,
  Menu,
  PanelLeftClose,
  Settings,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ConversationSidebar } from "@/components/chat/ConversationSidebar";
import { ChatInput, type ChatInputHandle } from "@/components/chat/ChatInput";
import { ChatMessageBubble } from "@/components/chat/ChatMessageBubble";
import { TypingIndicator } from "@/components/chat/TypingIndicator";
import { useChatStore } from "@/lib/chat/store";
import { uid } from "@/lib/chat/storage";
import { ChatError, sendChat } from "@/lib/chat/api";
import type { ChatMessage } from "@/lib/chat/types";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "API Chat Client — Klien Chat AI Multi-Provider" },
      {
        name: "description",
        content:
          "Chat dengan model AI lewat API OpenAI-compatible. Pakai API key Anda sendiri, atur provider, base URL, dan model bebas.",
      },
      { property: "og:title", content: "API Chat Client" },
      {
        property: "og:description",
        content: "Klien chat AI untuk API OpenAI-compatible dengan konfigurasi provider sendiri.",
      },
    ],
  }),
  component: ChatPage,
});

function ChatPage() {
  const {
    ready,
    conversations,
    providers,
    activeProvider,
    activeProviderId,
    setActiveProviderId,
    createConversation,
    removeConversation,
    clearConversation,
    renameConversation,
    setConversationMessages,
    setConversationProvider,
  } = useChatStore();

  const [activeId, setActiveId] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [desktopOpen, setDesktopOpen] = useState(true);
  const [loading, setLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const scrollEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<ChatInputHandle>(null);

  useEffect(() => {
    if (!ready) return;
    if (activeId && conversations.some((c) => c.id === activeId)) return;
    setActiveId(conversations[0]?.id ?? null);
  }, [ready, conversations, activeId]);

  const activeConversation = useMemo(
    () => conversations.find((c) => c.id === activeId) ?? null,
    [conversations, activeId],
  );

  const messages = activeConversation?.messages ?? [];
  const canSend =
    !!activeProvider?.baseUrl.trim() &&
    !!activeProvider?.path.trim() &&
    !!activeProvider?.apiKey.trim() &&
    !!activeProvider?.model.trim();

  useEffect(() => {
    scrollEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, loading]);

  const handleNewChat = () => {
    const id = createConversation();
    setActiveId(id);
    setMobileOpen(false);
  };

  const handleSelect = (id: string) => {
    setActiveId(id);
    setMobileOpen(false);
  };

  const handleClear = () => {
    if (!activeId) return;
    clearConversation(activeId);
    toast.success("Chat dibersihkan");
  };

  const handleStop = () => {
    abortRef.current?.abort();
  };

  // Run a completion for the given base history and append the assistant reply.
  const runCompletion = async (convId: string, base: ChatMessage[]) => {
    if (!activeProvider) return;
    setConversationProvider(convId, activeProvider.id);
    setLoading(true);

    const controller = new AbortController();
    abortRef.current = controller;

    const assistantId = uid();
    let streamed = false;

    try {
      const res = await sendChat({
        provider: activeProvider,
        messages: base,
        signal: controller.signal,
        onToken: (full) => {
          streamed = true;
          const partial: ChatMessage = {
            id: assistantId,
            role: "assistant",
            content: full,
            createdAt: Date.now(),
          };
          setConversationMessages(convId, [...base, partial]);
        },
      });
      const assistantMsg: ChatMessage = {
        id: assistantId,
        role: "assistant",
        content: res.content,
        createdAt: Date.now(),
      };
      setConversationMessages(convId, [...base, assistantMsg]);
    } catch (err) {
      const message =
        err instanceof ChatError ? err.message : "Terjadi kesalahan tak terduga.";
      // keep any partially streamed text only if it was a deliberate stop
      if (!(streamed && message === "Permintaan dibatalkan.")) {
        const errorMsg: ChatMessage = {
          id: uid(),
          role: "assistant",
          content: message,
          createdAt: Date.now(),
          error: true,
        };
        setConversationMessages(convId, [...base, errorMsg]);
      }
      toast.error(message);
    } finally {
      setLoading(false);
      abortRef.current = null;
    }
  };

  const handleSend = async (text: string) => {
    if (!activeProvider) {
      toast.error("Tambahkan provider API terlebih dahulu di Settings.");
      return;
    }
    if (!canSend) {
      toast.error("API Key / Model belum diisi. Buka Settings.");
      return;
    }

    let convId = activeId;
    if (!convId) {
      convId = createConversation();
      setActiveId(convId);
    }

    const existing = conversations.find((c) => c.id === convId)?.messages ?? [];
    const userMsg: ChatMessage = {
      id: uid(),
      role: "user",
      content: text,
      createdAt: Date.now(),
    };
    const withUser = [...existing, userMsg];
    setConversationMessages(convId, withUser);
    await runCompletion(convId, withUser);
  };

  const handleRegenerate = async () => {
    if (!activeId || loading || !canSend) return;
    // drop trailing assistant message(s) and re-run from the last user turn
    let base = [...messages];
    while (base.length && base[base.length - 1].role === "assistant") {
      base = base.slice(0, -1);
    }
    if (!base.length) return;
    setConversationMessages(activeId, base);
    await runCompletion(activeId, base);
  };

  const handleEdit = (msg: ChatMessage) => {
    if (!activeId || loading) return;
    const idx = messages.findIndex((m) => m.id === msg.id);
    if (idx === -1) return;
    setConversationMessages(activeId, messages.slice(0, idx));
    inputRef.current?.setText(msg.content);
  };

  const handleDelete = (msg: ChatMessage) => {
    if (!activeId) return;
    setConversationMessages(
      activeId,
      messages.filter((m) => m.id !== msg.id),
    );
  };

  const handleExport = (format: "txt" | "json") => {
    if (!activeConversation || messages.length === 0) {
      toast.error("Tidak ada pesan untuk diekspor.");
      return;
    }
    let content: string;
    let type: string;
    if (format === "json") {
      content = JSON.stringify(
        {
          title: activeConversation.title,
          createdAt: activeConversation.createdAt,
          messages: messages.map((m) => ({ role: m.role, content: m.content })),
        },
        null,
        2,
      );
      type = "application/json";
    } else {
      content = messages
        .map((m) => `${m.role === "user" ? "User" : "Assistant"}:\n${m.content}`)
        .join("\n\n----------------\n\n");
      type = "text/plain";
    }
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const safe = activeConversation.title.replace(/[^a-z0-9]+/gi, "-").slice(0, 40);
    a.download = `${safe || "chat"}.${format}`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Chat diekspor");
  };

  if (!ready) {
    return (
      <div className="flex h-[100dvh] w-full items-center justify-center bg-background text-muted-foreground">
        <Sparkles className="size-6 animate-pulse text-primary" />
      </div>
    );
  }

  const sidebar = (
    <ConversationSidebar
      conversations={conversations}
      activeId={activeId}
      onSelect={handleSelect}
      onNewChat={handleNewChat}
      onRename={renameConversation}
      onDelete={(id) => {
        removeConversation(id);
        if (id === activeId) setActiveId(null);
      }}
    />
  );

  const lastAssistantId = [...messages].reverse().find((m) => m.role === "assistant" && !m.error)?.id;

  return (
    <div className="flex h-[100dvh] w-full overflow-hidden bg-background text-foreground">
      {desktopOpen && (
        <aside className="hidden w-72 shrink-0 border-r border-border md:block">
          {sidebar}
        </aside>
      )}

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-72 p-0">
          {sidebar}
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-2 border-b border-border px-3 py-2.5">
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={() => setMobileOpen(true)}
            aria-label="Buka menu"
          >
            <Menu className="size-5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="hidden md:inline-flex"
            onClick={() => setDesktopOpen((v) => !v)}
            aria-label="Toggle sidebar"
          >
            <PanelLeftClose className="size-5" />
          </Button>

          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">
              {activeConversation?.title ?? "API Chat Client"}
            </p>
          </div>

          {providers.length > 0 && (
            <Select
              value={activeProviderId ?? undefined}
              onValueChange={(v) => setActiveProviderId(v)}
            >
              <SelectTrigger className="hidden h-9 w-48 rounded-xl text-xs sm:flex">
                <SelectValue placeholder="Pilih provider" />
              </SelectTrigger>
              <SelectContent>
                {providers.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                    {p.model ? ` · ${p.model}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                disabled={!activeConversation || messages.length === 0}
                aria-label="Ekspor chat"
              >
                <Download className="size-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => handleExport("txt")}>
                <FileText className="mr-2 size-4" /> Ekspor .txt
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleExport("json")}>
                <FileJson className="mr-2 size-4" /> Ekspor .json
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button
            variant="ghost"
            size="icon"
            onClick={handleClear}
            disabled={!activeConversation || messages.length === 0}
            aria-label="Bersihkan chat"
          >
            <Eraser className="size-5" />
          </Button>
        </header>

        {/* Mobile provider selector */}
        {providers.length > 0 && (
          <div className="border-b border-border px-3 py-2 sm:hidden">
            <Select
              value={activeProviderId ?? undefined}
              onValueChange={(v) => setActiveProviderId(v)}
            >
              <SelectTrigger className="h-9 w-full rounded-xl text-xs">
                <SelectValue placeholder="Pilih provider" />
              </SelectTrigger>
              <SelectContent>
                {providers.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                    {p.model ? ` · ${p.model}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <ScrollArea className="flex-1">
          <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-3 py-5">
            {messages.length === 0 && !loading ? (
              <EmptyState hasProvider={providers.length > 0} canSend={canSend} />
            ) : (
              messages.map((m) => (
                <ChatMessageBubble
                  key={m.id}
                  message={m}
                  onRegenerate={
                    !loading && canSend && m.id === lastAssistantId
                      ? handleRegenerate
                      : undefined
                  }
                  onEdit={m.role === "user" && !loading ? () => handleEdit(m) : undefined}
                  onDelete={!loading ? () => handleDelete(m) : undefined}
                />
              ))
            )}
            {loading && messages[messages.length - 1]?.role === "user" && (
              <div className="flex justify-start">
                <div className="rounded-2xl rounded-bl-md border border-border bg-card px-3 py-1">
                  <TypingIndicator />
                </div>
              </div>
            )}
            <div ref={scrollEndRef} />
          </div>
        </ScrollArea>

        <ChatInput
          ref={inputRef}
          onSend={handleSend}
          onStop={handleStop}
          loading={loading}
          disabled={!canSend}
          placeholder={
            providers.length === 0
              ? "Tambahkan provider di Settings…"
              : !canSend
                ? "Lengkapi API Key & Model di Settings…"
                : `Pesan ke ${activeProvider?.name}…`
          }
        />
      </div>
    </div>
  );
}

function EmptyState({
  hasProvider,
  canSend,
}: {
  hasProvider: boolean;
  canSend: boolean;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
      <div className="flex size-14 items-center justify-center rounded-2xl bg-primary/15 text-primary">
        <Sparkles className="size-7" />
      </div>
      <h1 className="text-lg font-semibold">Mulai percakapan</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        {!hasProvider
          ? "Tambahkan provider API terlebih dahulu di Settings, lalu masukkan API key milik Anda."
          : !canSend
            ? "Lengkapi API Key dan Model pada provider aktif di Settings."
            : "Ketik pesan di bawah untuk mengobrol dengan model AI Anda."}
      </p>
      {(!hasProvider || !canSend) && (
        <Button asChild variant="outline" className="mt-1 rounded-xl">
          <Link to="/settings">
            <Settings className="mr-2 size-4" />
            Buka Settings
          </Link>
        </Button>
      )}
    </div>
  );
}
