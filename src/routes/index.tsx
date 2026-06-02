import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, type TouchEvent } from "react";
import {
  ChevronDown,
  Download,
  Eraser,
  FileJson,
  FileText,
  Github,
  Menu,
  PanelLeftClose,
  Search,
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
import { ChatInput, type ChatInputHandle, type ChatMode } from "@/components/chat/ChatInput";
import { ChatMessageBubble } from "@/components/chat/ChatMessageBubble";
import { TypingIndicator } from "@/components/chat/TypingIndicator";
import { useChatStore } from "@/lib/chat/store";
import { uid } from "@/lib/chat/storage";
import { ChatError, sendChat } from "@/lib/chat/api";
import type { ChatAttachment, ChatMessage } from "@/lib/chat/types";
import { runOutlookMailCommand } from "@/lib/outlook/chatCommand";
import { runGitHubChatCommand } from "@/lib/github/chatCommand";
import { autoSaveImportantMemory, buildAiMemoryContext, loadSupabaseMemoryConfig } from "@/lib/memory/supabaseMemory";
import { buildRealtimeContext, searchRealtimeWeb } from "@/lib/search/realtime";
import { loadGitHubConfig } from "@/lib/github/api";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Ai Chat" },
      {
        name: "description",
        content:
          "Ai Chat — chat AI multi-provider dengan mode GitHub, Real Time Search, upload file, dan memory Supabase.",
      },
      { property: "og:title", content: "Ai Chat" },
      {
        property: "og:description",
        content: "Klien chat AI premium untuk API OpenAI-compatible dengan konfigurasi provider sendiri.",
      },
    ],
  }),
  component: ChatPage,
});

function stripModePrefix(text: string): string {
  return text.replace(/^\[(GITHUB|REALTIME)\]\s*/i, "").trim();
}

function ModeIcon({ mode }: { mode: ChatMode }) {
  if (mode === "github") return <Github className="size-4" />;
  if (mode === "realtime") return <Search className="size-4" />;
  return <Sparkles className="size-4" />;
}

function modeLabel(mode: ChatMode): string {
  if (mode === "github") return "GitHub";
  if (mode === "realtime") return "Real Time";
  return "Plain";
}

function shortModelName(model?: string): string {
  const clean = model?.trim();
  if (!clean) return "Pilih model";
  return clean.split("/").filter(Boolean).at(-1) ?? clean;
}

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
  const [statusOpen, setStatusOpen] = useState(false);
  const [desktopOpen, setDesktopOpen] = useState(true);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<ChatMode>("normal");
  const abortRef = useRef<AbortController | null>(null);
  const scrollEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<ChatInputHandle>(null);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

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

  const memoryConfig = loadSupabaseMemoryConfig();
  const githubConfig = loadGitHubConfig();
  const memoryOk = !!(memoryConfig.enabled && memoryConfig.anonKey.trim());
  const githubOk = !!(githubConfig.token.trim() && githubConfig.owner && githubConfig.repo);
  const activeModelLabel = shortModelName(activeProvider?.model);

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
        {shortModelName(m)}
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

  const handleStop = () => abortRef.current?.abort();

  const fillGitHubCommand = (command: string) => {
    setMode("github");
    setStatusOpen(false);
    inputRef.current?.setText(command);
  };

  const handleTouchStart = (event: TouchEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (target.closest("textarea,input,button,a,[role='dialog']")) return;
    const touch = event.touches[0];
    touchStartRef.current = { x: touch.clientX, y: touch.clientY };
  };

  const handleTouchEnd = (event: TouchEvent<HTMLDivElement>) => {
    const start = touchStartRef.current;
    touchStartRef.current = null;
    if (!start) return;
    const touch = event.changedTouches[0];
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    if (Math.abs(dx) < 80 || Math.abs(dy) > 90) return;
    if (dx > 0) {
      setMobileOpen(true);
    } else {
      setStatusOpen(true);
    }
  };

  const runCompletion = async (convId: string, base: ChatMessage[], realtimeContext = "") => {
    if (!activeProvider) return;
    setConversationProvider(convId, activeProvider.id);
    setLoading(true);
    const controller = new AbortController();
    abortRef.current = controller;
    const assistantId = uid();
    let streamed = false;

    try {
      const memoryContext = await buildAiMemoryContext(base[base.length - 1]?.content ?? "");
      const extraContext = [memoryContext.trim(), realtimeContext.trim()].filter(Boolean).join("\n\n");
      const providerWithContext = extraContext
        ? { ...activeProvider, systemPrompt: [activeProvider.systemPrompt?.trim(), extraContext].filter(Boolean).join("\n\n") }
        : activeProvider;

      const res = await sendChat({
        provider: realtimeContext ? { ...providerWithContext, stream: false } : providerWithContext,
        messages: base,
        signal: controller.signal,
        onToken: (full) => {
          streamed = true;
          setConversationMessages(convId, [...base, { id: assistantId, role: "assistant", content: full, createdAt: Date.now() }]);
        },
      });
      const assistantMsg: ChatMessage = { id: assistantId, role: "assistant", content: res.content, createdAt: Date.now() };
      setConversationMessages(convId, [...base, assistantMsg]);
      void autoSaveImportantMemory(base[base.length - 1]?.content ?? "", res.content);
    } catch (err) {
      const message = err instanceof ChatError ? err.message : "Terjadi kesalahan tak terduga.";
      if (!(streamed && message === "Permintaan dibatalkan.")) {
        setConversationMessages(convId, [...base, { id: uid(), role: "assistant", content: message, createdAt: Date.now(), error: true }]);
      }
      toast.error(message);
    } finally {
      setLoading(false);
      abortRef.current = null;
    }
  };

  const handleSend = async (text: string, attachments?: ChatAttachment[], realtime = false) => {
    let convId = activeId;
    if (!convId) {
      convId = createConversation();
      setActiveId(convId);
    }
    const cleanText = stripModePrefix(text);
    const existing = conversations.find((c) => c.id === convId)?.messages ?? [];
    const userMsg: ChatMessage = { id: uid(), role: "user", content: cleanText, attachments, createdAt: Date.now() };
    const withUser = [...existing, userMsg];
    setConversationMessages(convId, withUser);

    setLoading(true);
    try {
      const githubReply = await runGitHubChatCommand(text, activeProvider);
      if (githubReply) {
        setConversationMessages(convId, [...withUser, { id: uid(), role: "assistant", content: githubReply, createdAt: Date.now() }]);
        void autoSaveImportantMemory(text, githubReply);
        return;
      }
      const outlookReply = await runOutlookMailCommand(cleanText);
      if (outlookReply) {
        setConversationMessages(convId, [...withUser, { id: uid(), role: "assistant", content: outlookReply, createdAt: Date.now() }]);
        return;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Gagal menjalankan perintah.";
      setConversationMessages(convId, [...withUser, { id: uid(), role: "assistant", content: message, createdAt: Date.now(), error: true }]);
      toast.error(message);
      return;
    } finally {
      setLoading(false);
    }

    if (!activeProvider) return toast.error("Tambahkan provider API terlebih dahulu di Settings.");
    if (!canSend) return toast.error("Lengkapi Base URL, API Path, API Key, dan Model terlebih dahulu.");

    let realtimeContext = "";
    if (realtime || text.trim().startsWith("[REALTIME]")) {
      setLoading(true);
      try {
        toast.info("Mencari data real-time...");
        realtimeContext = buildRealtimeContext(await searchRealtimeWeb(cleanText));
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Realtime search gagal.");
      } finally {
        setLoading(false);
      }
    }
    await runCompletion(convId, withUser, realtimeContext);
  };

  const handleRegenerate = async () => {
    if (!activeId || loading || !canSend) return;
    let base = [...messages];
    while (base.length && base[base.length - 1].role === "assistant") base = base.slice(0, -1);
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
    setConversationMessages(activeId, messages.filter((m) => m.id !== msg.id));
  };

  const handleExport = (format: "txt" | "json") => {
    if (!activeConversation || messages.length === 0) return toast.error("Tidak ada pesan untuk diekspor.");
    const content = format === "json"
      ? JSON.stringify({ title: activeConversation.title, createdAt: activeConversation.createdAt, messages: messages.map((m) => ({ role: m.role, content: m.content, attachments: m.attachments })) }, null, 2)
      : messages.map((m) => `${m.role === "user" ? "User" : "Assistant"}:\n${m.content}`).join("\n\n----------------\n\n");
    const blob = new Blob([content], { type: format === "json" ? "application/json" : "text/plain" });
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
    return <div className="flex h-[100dvh] w-full items-center justify-center bg-background text-muted-foreground"><Sparkles className="size-6 animate-pulse text-primary" /></div>;
  }

  const sidebar = (
    <ConversationSidebar conversations={conversations} activeId={activeId} onSelect={handleSelect} onNewChat={handleNewChat} onRename={renameConversation} onDelete={(id) => { removeConversation(id); if (id === activeId) setActiveId(null); }} onClearAll={handleClearAllChats} />
  );
  const lastAssistantId = [...messages].reverse().find((m) => m.role === "assistant" && !m.error)?.id;

  return (
    <div className="keyboard-safe-app flex h-[100dvh] w-full overflow-hidden bg-background text-foreground" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
      {desktopOpen && <aside className="hidden w-72 shrink-0 border-r border-border/70 bg-sidebar/95 md:block">{sidebar}</aside>}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}><SheetContent side="left" className="w-72 p-0">{sidebar}</SheetContent></Sheet>
      <Sheet open={statusOpen} onOpenChange={setStatusOpen}>
        <SheetContent side="right" className="w-80 p-0">
          <StatusPanel
            mode={mode}
            canSend={canSend}
            githubOk={githubOk}
            memoryOk={memoryOk}
            realtimeOk
            providerName={activeProvider?.name ?? "Provider"}
            providerModel={activeProvider?.model ?? "Belum dipilih"}
            repoName={githubOk ? `${githubConfig.owner}/${githubConfig.repo}` : "Belum connect"}
            onMode={setMode}
            onCommand={fillGitHubCommand}
          />
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-2 border-b border-border/70 bg-background/90 px-3 py-2.5 backdrop-blur-xl">
          <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setMobileOpen(true)} aria-label="Buka menu"><Menu className="size-5" /></Button>
          <Button variant="ghost" size="icon" className="hidden md:inline-flex" onClick={() => setDesktopOpen((v) => !v)} aria-label="Toggle sidebar"><PanelLeftClose className="size-5" /></Button>
          <div className="min-w-0 flex-1">
            {providers.length > 0 ? (
              <Select value={selectedValue} onValueChange={handleProviderModelChange}>
                <SelectTrigger className="h-9 max-w-[42vw] rounded-xl border-0 bg-transparent px-0 text-sm font-semibold md:hidden">
                  <SelectValue placeholder={activeModelLabel} />
                </SelectTrigger>
                <SelectContent>{providerModelItems}</SelectContent>
              </Select>
            ) : (
              <p className="truncate text-sm font-semibold tracking-tight text-foreground md:hidden">{activeModelLabel}</p>
            )}
            <p className="hidden truncate text-sm font-semibold tracking-tight text-foreground md:block" title={activeProvider?.model ?? ""}>{activeModelLabel}</p>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2 rounded-full bg-card/70"><ModeIcon mode={mode} /> {modeLabel(mode)} <ChevronDown className="size-3" /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 rounded-2xl">
              <DropdownMenuItem onClick={() => setMode("normal")}><Sparkles className="mr-2 size-4" /> Plain</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setMode("realtime")}><Search className="mr-2 size-4" /> Real Time</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setMode("github")}><Github className="mr-2 size-4" /> GitHub</DropdownMenuItem>
              {mode === "github" && <>
                <DropdownMenuItem onClick={() => inputRef.current?.setText("Tambah tombol ")}>Tambah tombol</DropdownMenuItem>
                <DropdownMenuItem onClick={() => inputRef.current?.setText("Hapus tombol ")}>Hapus tombol</DropdownMenuItem>
                <DropdownMenuItem onClick={() => inputRef.current?.setText("Perbaiki error ")}>Perbaiki error</DropdownMenuItem>
                <DropdownMenuItem onClick={() => inputRef.current?.setText("cek build")}>Cek build</DropdownMenuItem>
                <DropdownMenuItem onClick={() => inputRef.current?.setText("PUSH")}>Push</DropdownMenuItem>
              </>}
            </DropdownMenuContent>
          </DropdownMenu>

          {providers.length > 0 && <Select value={selectedValue} onValueChange={handleProviderModelChange}><SelectTrigger className="hidden h-9 w-56 rounded-xl text-xs lg:flex"><SelectValue placeholder="Pilih provider" /></SelectTrigger><SelectContent>{providerModelItems}</SelectContent></Select>}
          <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label="Menu"><FileText className="size-5" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end" className="w-52"><DropdownMenuItem onClick={() => setStatusOpen(true)}><Sparkles className="mr-2 size-4" /> Status</DropdownMenuItem><DropdownMenuItem asChild><Link to="/settings"><Settings className="mr-2 size-4" /> Settings</Link></DropdownMenuItem><DropdownMenuItem onClick={() => handleExport("txt")} disabled={!messages.length}><Download className="mr-2 size-4" /> Export TXT</DropdownMenuItem><DropdownMenuItem onClick={() => handleExport("json")} disabled={!messages.length}><FileJson className="mr-2 size-4" /> Export JSON</DropdownMenuItem><DropdownMenuItem onClick={handleClear} disabled={!messages.length}><Eraser className="mr-2 size-4" /> Clear Chat</DropdownMenuItem><DropdownMenuItem onClick={handleClearAllChats} disabled={!conversations.length} className="text-destructive focus:text-destructive"><Eraser className="mr-2 size-4" /> Hapus semua chat</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
        </header>

        <main className="keyboard-safe-main min-h-0 flex-1 overflow-hidden">
          <ScrollArea className="h-full">
            <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-3 py-6 sm:px-4">
              {messages.length === 0 ? <div className="flex min-h-[55vh] flex-col items-center justify-center text-center"><div className="mb-5 rounded-[2rem] border border-border/70 bg-card/80 p-5 shadow-2xl shadow-black/20 backdrop-blur"><Sparkles className="size-9 text-primary" /></div><h1 className="text-3xl font-semibold tracking-tight">Ai Chat</h1><p className="mt-2 max-w-md text-sm text-muted-foreground">Pilih mode di header, gunakan Real Time untuk data terbaru, atau GitHub untuk update aplikasi.</p><div className="mt-5 grid w-full max-w-xl grid-cols-1 gap-2 sm:grid-cols-3"><PremiumCard title="GitHub Mode" desc="Update web app via chat" /><PremiumCard title="Real Time" desc="Cari data terbaru" /><PremiumCard title="Upload File" desc="Analisis foto/dokumen" /></div></div> : messages.map((m) => <ChatMessageBubble key={m.id} message={m} onRegenerate={m.id === lastAssistantId ? handleRegenerate : undefined} onEdit={m.role === "user" ? handleEdit : undefined} onDelete={handleDelete} />)}
              {loading && <TypingIndicator />}
              <div ref={scrollEndRef} />
            </div>
          </ScrollArea>
        </main>

        <ChatInput ref={inputRef} disabled={loading} canSend={true} onSend={handleSend} onStop={handleStop} loading={loading} placeholder="Ketik pesan" mode={mode} />
      </div>
    </div>
  );
}

function PremiumCard({ title, desc }: { title: string; desc: string }) {
  return <div className="rounded-2xl border border-border/70 bg-card/70 p-4 text-left shadow-xl shadow-black/10 backdrop-blur"><p className="text-sm font-semibold">{title}</p><p className="mt-1 text-xs text-muted-foreground">{desc}</p></div>;
}

function StatusPanel({
  mode,
  canSend,
  githubOk,
  memoryOk,
  realtimeOk,
  providerName,
  providerModel,
  repoName,
  onMode,
  onCommand,
}: {
  mode: ChatMode;
  canSend: boolean;
  githubOk: boolean;
  memoryOk: boolean;
  realtimeOk: boolean;
  providerName: string;
  providerModel: string;
  repoName: string;
  onMode: (mode: ChatMode) => void;
  onCommand: (command: string) => void;
}) {
  return (
    <div className="flex h-full flex-col bg-sidebar p-4 text-sidebar-foreground">
      <div className="mb-4 rounded-3xl border border-sidebar-border bg-sidebar-accent/40 p-4">
        <p className="text-sm font-semibold">Status Ai Chat</p>
        <p className="mt-1 text-xs text-muted-foreground">Usap dari kanan ke kiri untuk membuka menu ini.</p>
      </div>

      <div className="space-y-2">
        <StatusRow ok={canSend} title="Provider" desc={canSend ? `${providerName} · ${providerModel}` : "Belum lengkap"} />
        <StatusRow ok={githubOk} title="GitHub" desc={repoName} />
        <StatusRow ok={memoryOk} title="Memory" desc={memoryOk ? "Supabase aktif" : "Supabase belum aktif"} />
        <StatusRow ok={realtimeOk} title="Realtime" desc="DuckDuckGo fallback aktif" />
      </div>

      <div className="mt-5 rounded-3xl border border-sidebar-border bg-sidebar-accent/30 p-3">
        <p className="mb-2 text-xs font-semibold text-muted-foreground">Mode</p>
        <div className="grid gap-2">
          <Button variant={mode === "normal" ? "default" : "secondary"} className="justify-start rounded-2xl" onClick={() => onMode("normal")}><Sparkles className="mr-2 size-4" />Plain</Button>
          <Button variant={mode === "realtime" ? "default" : "secondary"} className="justify-start rounded-2xl" onClick={() => onMode("realtime")}><Search className="mr-2 size-4" />Real Time</Button>
          <Button variant={mode === "github" ? "default" : "secondary"} className="justify-start rounded-2xl" onClick={() => onMode("github")}><Github className="mr-2 size-4" />GitHub</Button>
        </div>
      </div>

      <div className="mt-5 rounded-3xl border border-sidebar-border bg-sidebar-accent/30 p-3">
        <p className="mb-2 text-xs font-semibold text-muted-foreground">Command GitHub</p>
        <div className="grid gap-2">
          <Button variant="secondary" className="justify-start rounded-2xl" onClick={() => onCommand("Tambah tombol ")}>Tambah tombol</Button>
          <Button variant="secondary" className="justify-start rounded-2xl" onClick={() => onCommand("Hapus tombol ")}>Hapus tombol</Button>
          <Button variant="secondary" className="justify-start rounded-2xl" onClick={() => onCommand("Perbaiki error ")}>Perbaiki error</Button>
          <Button variant="secondary" className="justify-start rounded-2xl" onClick={() => onCommand("cek build")}>Cek build</Button>
          <Button variant="secondary" className="justify-start rounded-2xl" onClick={() => onCommand("PUSH")}>Push</Button>
        </div>
      </div>
    </div>
  );
}

function StatusRow({ ok, title, desc }: { ok: boolean; title: string; desc: string }) {
  return (
    <div className="rounded-2xl border border-sidebar-border bg-sidebar-accent/30 p-3">
      <div className="flex items-center gap-2">
        <span className={ok ? "size-2 rounded-full bg-emerald-400" : "size-2 rounded-full bg-muted-foreground/50"} />
        <p className="text-sm font-medium">{title}</p>
        <span className="ml-auto text-xs text-muted-foreground">{ok ? "OK" : "Belum"}</span>
      </div>
      <p className="mt-1 truncate text-xs text-muted-foreground">{desc}</p>
    </div>
  );
}
