import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Eraser, Menu, PanelLeftClose, Settings, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ConversationSidebar } from "@/components/chat/ConversationSidebar";
import { ChatInput } from "@/components/chat/ChatInput";
import { ChatMessageBubble } from "@/components/chat/ChatMessageBubble";
import { TypingIndicator } from "@/components/chat/TypingIndicator";
import { useChatStore } from "@/lib/chat/store";
import { uid } from "@/lib/chat/storage";
import { ChatError, sendChat } from "@/lib/chat/api";
import type { ChatMessage } from "@/lib/chat/types";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "AI API Chat — Klien Chat AI" },
      {
        name: "description",
        content:
          "Chat dengan model AI lewat API OpenAI-compatible. Atur provider, base URL, API key, dan model Anda sendiri.",
      },
      { property: "og:title", content: "AI API Chat — Klien Chat AI" },
      {
        property: "og:description",
        content: "Klien chat AI untuk API OpenAI-compatible dengan konfigurasi provider sendiri.",
      },
    ],
  }),
  component: ChatPage,
});

function ChatPage() {
  const store = useChatStore();
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
    setConversationMessages,
    setConversationProvider,
  } = store;

  const [activeId, setActiveId] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [desktopOpen, setDesktopOpen] = useState(true);
  const [loading, setLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const scrollEndRef = useRef<HTMLDivElement>(null);

  // pick an active conversation once data is ready
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

  const handleSend = async (text: string) => {
    if (!activeProvider) {
      toast.error("Belum ada provider. Buka Settings untuk menambahkannya.");
      return;
    }
    if (!activeProvider.apiKey.trim() || !activeProvider.model.trim()) {
      toast.error("API Key / Model belum diisi. Buka Settings.");
      return;
    }

    // ensure a conversation exists
    let convId = activeId;
    if (!convId) {
      convId = createConversation();
      setActiveId(convId);
    }

    const base = conversations.find((c) => c.id === convId)?.messages ?? [];
    const userMsg: ChatMessage = {
      id: uid(),
      role: "user",
      content: text,
      createdAt: Date.now(),
    };
    const withUser = [...base, userMsg];
    setConversationMessages(convId, withUser);
    setConversationProvider(convId, activeProvider.id);
    setLoading(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await sendChat({
        provider: activeProvider,
        messages: withUser,
        signal: controller.signal,
      });
      const assistantMsg: ChatMessage = {
        id: uid(),
        role: "assistant",
        content: res.content,
        createdAt: Date.now(),
      };
      setConversationMessages(convId, [...withUser, assistantMsg]);
    } catch (err) {
      const message =
        err instanceof ChatError ? err.message : "Terjadi kesalahan tak terduga.";
      const errorMsg: ChatMessage = {
        id: uid(),
        role: "assistant",
        content: message,
        createdAt: Date.now(),
        error: true,
      };
      setConversationMessages(convId, [...withUser, errorMsg]);
      toast.error(message);
    } finally {
      setLoading(false);
      abortRef.current = null;
    }
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
      onDelete={(id) => {
        removeConversation(id);
        if (id === activeId) setActiveId(null);
      }}
    />
  );

  return (
    <div className="flex h-[100dvh] w-full overflow-hidden bg-background text-foreground">
      {/* Desktop sidebar */}
      {desktopOpen && (
        <aside className="hidden w-72 shrink-0 border-r border-border md:block">
          {sidebar}
        </aside>
      )}

      {/* Mobile sidebar */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-72 p-0">
          {sidebar}
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Header */}
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
              {activeConversation?.title ?? "AI API Chat"}
            </p>
          </div>

          <Select
            value={activeProviderId ?? undefined}
            onValueChange={(v) => setActiveProviderId(v)}
          >
            <SelectTrigger className="hidden h-9 w-44 rounded-xl text-xs sm:flex">
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

          <Button
            variant="ghost"
            size="icon"
            onClick={handleClear}
            disabled={!activeConversation || messages.length === 0}
            aria-label="Clear chat"
          >
            <Eraser className="size-5" />
          </Button>
        </header>

        {/* Messages */}
        <ScrollArea className="flex-1">
          <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-3 py-5">
            {messages.length === 0 && !loading ? (
              <EmptyState hasProvider={!!activeProvider?.apiKey && !!activeProvider?.model} />
            ) : (
              messages.map((m) => <ChatMessageBubble key={m.id} message={m} />)
            )}
            {loading && (
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
          onSend={handleSend}
          onStop={handleStop}
          loading={loading}
          placeholder={
            activeProvider ? `Pesan ke ${activeProvider.name}…` : "Atur provider di Settings…"
          }
        />
      </div>
    </div>
  );
}

function EmptyState({ hasProvider }: { hasProvider: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
      <div className="flex size-14 items-center justify-center rounded-2xl bg-primary/15 text-primary">
        <Sparkles className="size-7" />
      </div>
      <h1 className="text-lg font-semibold">Mulai percakapan</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        Ketik pesan di bawah untuk mengobrol dengan model AI Anda.
      </p>
      {!hasProvider && (
        <Button asChild variant="outline" className="mt-1 rounded-xl">
          <Link to="/settings">
            <Settings className="mr-2 size-4" />
            Atur API di Settings
          </Link>
        </Button>
      )}
    </div>
  );
}
