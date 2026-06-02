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
import type { ChatAttachment, ChatMessage } from "@/lib/chat/types";
import { runOutlookMailCommand } from "@/lib/outlook/chatCommand";
import { runGitHubChatCommand } from "@/lib/github/chatCommand";
import { buildAiMemoryContext } from "@/lib/memory/supabaseMemory";

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
    upsertProvider,
    createConversation,
    removeConversation,
    clearConversation,
    clearAllConversations,
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

  const selectedValue =
    activeProviderId && activeProvider?.model
      ? `${activeProviderId}:::${activeProvider.model}`
      : activeProviderId
        ? `${activeProviderId}:::`
        : undefined;

  const handleProviderModelChange = (value: string) => {
    const sep = value.indexOf(":::");
    const pid = sep === -1 ? value : value.slice(0, sep);
    const model = sep === -1 ? "" : value.slice(sep + 3);
    setActiveProviderId(pid);
    const provider = providers.find((p) => p.id === pid);
    if (provider && model && provider.model !== model) {
      upsertProvider({ ...provider, model });
    }
  };

  const providerModelItems = providers.flatMap((p) => {
    const models = p.models?.length ? p.models : p.model ? [p.model] : [];
    if (models.length === 0) {
      return [
        <SelectItem key={`${p.id}:::`} value={`${p.id}:::`}>
          {p.name}
        </SelectItem>,
      ];
    }
    return models.map((m) => (
      <SelectItem key={`${p.id}:::${m}`} value={`${p.id}:::${m}`}>
        {p.name} · {m}
      </SelectItem>
    ));
  });

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

  const handleClearAllChats = () => {
    if (conversations.length === 0) return;
    if (!confirm("Hapus semua riwayat chat? API key dan provider tidak akan dihapus.")) return;
    clearAllConversations();
    setActiveId(null);
    setMobileOpen(false);
    toast.success("Semua riwayat chat dihapus.");
  };

  const handleStop = () => {
    abortRef.current?.abort();
  };

  const runCompletion = async (convId: string, base: ChatMessage[]) => {
    if (!activeProvider) return;
    setConversationProvider(convId, activeProvider.id);
    setLoading(true);

    const controller = new AbortController();
    abortRef.current = controller;

    const assistantId = uid();
    let streamed = false;

    try {
      const memoryContext = await buildAiMemoryContext();
      const providerWithMemory = memoryContext.trim()
        ? {
            ...activeProvider,
            systemPrompt: [activeProvider.systemPrompt?.trim(), memoryContext.trim()]
              .filter(Boolean)
              .join("\n\n"),
          }
        : activeProvider;

      const res = await sendChat({
        provider: providerWithMemory,
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

  const handleSend = async (text: string, attachments?: ChatAttachment[]) => {
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
      attachments,
      createdAt: Date.now(),
    };
    const withUser = [...existing, userMsg];
    setConversationMessages(convId, withUser);

    setLoading(true);
    try {
      const githubReply = await runGitHubChatCommand(text, activeProvider);
      if (githubReply) {
        const assistantMsg: ChatMessage = {
          id: uid(),
          role: "assistant",
          content: githubReply,
          createdAt: Date.now(),
        };
        setConversationMessages(convId, [...withUser, assistantMsg]);
        return;
      }

      const outlookReply = await runOutlookMailCommand(text);
      if (outlookReply) {
        const assistantMsg: ChatMessage = {
          id: uid(),
          role: "assistant",
          content: outlookReply,
          createdAt: Date.now(),
        };
        setConversationMessages(convId, [...withUser, assistantMsg]);
        return;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Gagal menjalankan perintah.";
      const errorMsg: ChatMessage = {
        id: uid(),
        role: "assistant",
        content: message,
        createdAt: Date.now(),
        error: true,
      };
      setConversationMessages(convId, [...withUser, errorMsg]);
      toast.error(message);
      return;
    } finally {
      setLoading(false);
    }

    if (!activeProvider) {
      toast.error("Tambahkan provider API terlebih dahulu di Settings.");
      return;
    }
    if (!canSend) {
      toast.error("Lengkapi Base URL, API Path, API Key, dan Model terlebih dahulu.");
      return;
    }

    await runCompletion(convId, withUser);
  };

  const handleRegenerate = async () => {
    if (!activeId || loading || !canSend) return;
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
          messages: messages.map((m) => ({ role: m.role, content: m.content, attachments: m.attachments })),
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
      onClearAll={handleClearAllChats}
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
            <Select value={selectedValue} onValueChange={handleProviderModelChange}>
              <SelectTrigger className="hidden h-9 w-56 rounded-xl text-xs sm:flex">
                <SelectValue placeholder="Pilih provider" />
              </SelectTrigger>
              <SelectContent>{providerModelItems}</SelectContent>
            </Select>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Menu">
                <FileText className="size-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem asChild>
                <Link to="/settings">
                  <Settings className="mr-2 size-4" /> Settings
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleExport("txt")} disabled={!messages.length}>
                <Download className="mr-2 size-4" /> Export TXT
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleExport("json")} disabled={!messages.length}>
                <FileJson className="mr-2 size-4" /> Export JSON
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleClear} disabled={!messages.length}>
                <Eraser className="mr-2 size-4" /> Clear Chat
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleClearAllChats} disabled={!conversations.length} className="text-destructive focus:text-destructive">
                <Eraser className="mr-2 size-4" /> Hapus semua chat
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>

        <main className="min-h-0 flex-1 overflow-hidden">
          <ScrollArea className="h-full">
            <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-3 py-6 sm:px-4">
              {messages.length === 0 ? (
                <div className="flex min-h-[55vh] flex-col items-center justify-center text-center">
                  <div className="mb-4 rounded-3xl border border-border bg-card p-4 shadow-sm">
                    <Sparkles className="size-8 text-primary" />
                  </div>
                  <h1 className="text-2xl font-semibold tracking-tight">Mulai chat</h1>
                  <p className="mt-2 max-w-md text-sm text-muted-foreground">
                    Tulis pertanyaan, upload foto/PDF/file, atau gunakan perintah Outlook/GitHub jika sudah terkoneksi.
                  </p>
                </div>
              ) : (
                messages.map((m) => (
                  <ChatMessageBubble
                    key={m.id}
                    message={m}
                    onRegenerate={m.id === lastAssistantId ? handleRegenerate : undefined}
                    onEdit={m.role === "user" ? handleEdit : undefined}
                    onDelete={handleDelete}
                  />
                ))
              )}
              {loading && <TypingIndicator />}
              <div ref={scrollEndRef} />
            </div>
          </ScrollArea>
        </main>

        <ChatInput
          ref={inputRef}
          disabled={loading}
          canSend={true}
          onSend={handleSend}
          onStop={handleStop}
          loading={loading}
          placeholder="Ketik pesan"
        />
      </div>
    </div>
  );
}
