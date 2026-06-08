import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, type TouchEvent } from "react";
import { Brain, BrainCircuit, Check, ChevronDown, Download, Eraser, File as FileJson, FileText, Menu, PanelLeftClose, Settings, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
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
import { compactConversationMessages, getConversationSummaryStatus } from "@/lib/chat/summary";
import { autoSaveProjectMemory, buildProjectMemoryContext } from "@/lib/memory/projectMemory";
import { runOutlookMailCommand } from "@/lib/outlook/chatCommand";
import { autoSaveImportantMemory, buildAiMemoryContext, loadSupabaseMemoryConfig } from "@/lib/memory/supabaseMemory";
import { buildRealtimeContext, loadRealtimeSearchConfig, searchRealtimeWeb } from "@/lib/search/realtime";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "AI Chat" },
      {
        name: "description",
        content:
          "AI Chat — chat AI multi-provider dengan auto Real Time Search, Thinking, upload file, dan memory.",
      },
      { property: "og:title", content: "AI Chat" },
      {
        property: "og:description",
        content: "Klien chat AI premium untuk API OpenAI-compatible dengan konfigurasi provider sendiri.",
      },
    ],
  }),
  component: ChatPage,
});

const THINKING_CONTEXT = [
  "Thinking Mode aktif.",
  "Jawab dengan lebih teliti dan terstruktur.",
  "Periksa asumsi, risiko, dan langkah yang mungkin salah sebelum memberi solusi.",
  "Jangan tampilkan proses berpikir panjang atau chain-of-thought internal.",
  "Tampilkan hanya: Analisis singkat, Solusi, dan Langkah jika relevan.",
].join("\n");

const THINKING_DEEP_CONTEXT = [
  "Think Deeply Mode aktif.",
  "Analisis pertanyaan ini secara menyeluruh dan mendalam sebelum menjawab.",
  "Identifikasi asumsi tersembunyi, edge case, risiko, dan kemungkinan yang sering terlewat.",
  "Pertimbangkan perspektif yang berbeda dan sudut pandang alternatif.",
  "Periksa ulang setiap langkah logika — jangan terburu-buru menyimpulkan.",
  "Pastikan solusi yang kamu berikan robust terhadap kondisi yang tidak biasa.",
  "Jangan tampilkan chain-of-thought internal.",
  "Tampilkan: Analisis mendalam, Asumsi & Risiko yang perlu diwaspadai, Solusi terbaik, Langkah detail jika relevan.",
].join("\n");

function stripModePrefix(text: string): string {
  return text.replace(/^\[(REALTIME|THINKING_DEEP|THINKING)\]\s*/i, "").trim();
}

function shouldUseAutoRealtime(text: string): boolean {
  const q = text.toLowerCase();
  if (!q.trim()) return false;

  const realtimePatterns = [
    /\b(real\s*time|realtime|terbaru|hari\s*ini|sekarang|saat\s*ini|baru\s*rilis|rilis\s*terbaru|breaking|live)\b/i,
    /\b(kurs|nilai\s*tukar|usd|idr|dolar|dollar|rupiah|euro|yen|ringgit|ruble|rubel)\b/i,
    /\b(harga|price|saham|ihsg|crypto|kripto|bitcoin|btc|eth|emas|minyak)\b/i,
    /\b(cuaca|gempa|banjir|jadwal|skor|score|hasil\s+pertandingan|klasemen)\b/i,
    /\b(berita|news|trend|tren|viral|streaming|nonton\s+dimana|tayang\s+dimana)\b/i,
  ];

  return realtimePatterns.some((pattern) => pattern.test(q));
}

function ModeIcon({ mode }: { mode: ChatMode }) {
  if (mode === "thinking") return <Brain className="size-4" />;
  if (mode === "thinking-deep") return <BrainCircuit className="size-4" />;
  return <Sparkles className="size-4" />;
}

function modeLabel(mode: ChatMode): string {
  if (mode === "thinking") return "Thinking";
  if (mode === "thinking-deep") return "Think Deeply";
  return "Plain";
}

function displayModelName(model?: string): string {
  const clean = model?.trim();
  if (!clean) return "Pilih model";
  return clean;
}

function normalizeMode(next: ChatMode): ChatMode {
  return next === "realtime" ? "normal" : next;
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
  const [mode, setModeState] = useState<ChatMode>("normal");
  const abortRef = useRef<AbortController | null>(null);
  const scrollEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<ChatInputHandle>(null);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  const setMode = (next: ChatMode) => setModeState(normalizeMode(next));

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
  const summaryStatus = getConversationSummaryStatus(messages);
  const canSend =
    !!activeProvider?.baseUrl.trim() &&
    !!activeProvider?.path.trim() &&
    !!activeProvider?.apiKey.trim() &&
    !!activeProvider?.model.trim();

  const memoryConfig = loadSupabaseMemoryConfig();
  const realtimeConfig = loadRealtimeSearchConfig();
  const memoryOk = !!(memoryConfig.enabled && memoryConfig.anonKey.trim());
  const realtimeDesc = realtimeConfig.serperApiKey.trim() ? "Auto search · Serper aktif" : "Auto search · fallback aktif";
  const activeModelLabel = displayModelName(activeProvider?.model);

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
        {providers.length > 1 ? `${p.name} · ${m}` : m}
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

  const runCompletion = async (
    convId: string,
    base: ChatMessage[],
    extraContext = "",
    thinkingDepth: "none" | "standard" | "deep" = "none",
  ) => {
    if (!activeProvider) return;
    setConversationProvider(convId, activeProvider.id);
    setLoading(true);
    const controller = new AbortController();
    abortRef.current = controller;
    const assistantId = uid();
    let streamed = false;

    try {
      const compactBase = compactConversationMessages(base);
      const lastUserText = base[base.length - 1]?.content ?? "";
      const projectMemoryContext = buildProjectMemoryContext(lastUserText);
      const memoryContext = await buildAiMemoryContext(lastUserText);
      const modeContext =
        thinkingDepth === "deep"
          ? THINKING_DEEP_CONTEXT
          : thinkingDepth === "standard"
            ? THINKING_CONTEXT
            : "";
      const compactNotice = compactBase.length < base.length ? "Conversation Summary aktif: beberapa pesan lama diringkas agar chat panjang tetap ringan dan hemat token." : "";
      const combinedContext = [projectMemoryContext.trim(), memoryContext.trim(), compactNotice, modeContext.trim(), extraContext.trim()].filter(Boolean).join("\n\n");
      const providerWithContext = combinedContext
        ? { ...activeProvider, systemPrompt: [activeProvider.systemPrompt?.trim(), combinedContext].filter(Boolean).join("\n\n") }
        : activeProvider;

      const res = await sendChat({
        provider: extraContext || thinkingDepth !== "none" || compactBase.length < base.length || projectMemoryContext ? { ...providerWithContext, stream: false } : providerWithContext,
        messages: compactBase,
        signal: controller.signal,
        onToken: (full) => {
          streamed = true;
          setConversationMessages(convId, [...base, { id: assistantId, role: "assistant", content: full, createdAt: Date.now() }]);
        },
      });
      const assistantMsg: ChatMessage = { id: assistantId, role: "assistant", content: res.content, createdAt: Date.now() };
      setConversationMessages(convId, [...base, assistantMsg]);
      autoSaveProjectMemory(lastUserText, res.content);
      void autoSaveImportantMemory(lastUserText, res.content);
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
      const outlookReply = await runOutlookMailCommand(cleanText);
      if (outlookReply) {
        setConversationMessages(convId, [...withUser, { id: uid(), role: "assistant", content: outlookReply, createdAt: Date.now() }]);
        autoSaveProjectMemory(cleanText, outlookReply);
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

    const trimmedText = text.trim();
    const isThinkingDeep = trimmedText.startsWith("[THINKING_DEEP]");
    const isThinkingStd = !isThinkingDeep && trimmedText.startsWith("[THINKING]");
    const thinkingDepth: "none" | "standard" | "deep" = isThinkingDeep ? "deep" : isThinkingStd ? "standard" : "none";
    const explicitRealtime = realtime || trimmedText.startsWith("[REALTIME]");
    const autoRealtime = !explicitRealtime && mode === "normal" && shouldUseAutoRealtime(cleanText);

    let realtimeContext = "";
    if (explicitRealtime || autoRealtime) {
      setLoading(true);
      try {
        toast.info(autoRealtime ? "Auto Search mencari data terbaru..." : "Mencari data real-time...");
        realtimeContext = buildRealtimeContext(await searchRealtimeWeb(cleanText));
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Realtime search gagal.");
      } finally {
        setLoading(false);
      }
    }
    await runCompletion(convId, withUser, realtimeContext, thinkingDepth);
  };

  const handleRegenerate = async () => {
    if (!activeId || loading || !canSend) return;
    let base = [...messages];
    while (base.length && base[base.length - 1].role === "assistant") base = base.slice(0, -1);
    if (!base.length) return;
    setConversationMessages(activeId, base);
    const regenDepth: "none" | "standard" | "deep" =
      mode === "thinking-deep" ? "deep" : mode === "thinking" ? "standard" : "none";
    await runCompletion(activeId, base, "", regenDepth);
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
      {desktopOpen && <aside className="hidden w-72 shrink-0 border-r border-border/70 bg-sidebar md:block">{sidebar}</aside>}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}><SheetContent side="left" className="w-72 p-0">{sidebar}</SheetContent></Sheet>
      <Sheet open={statusOpen} onOpenChange={setStatusOpen}>
        <SheetContent side="right" className="w-80 p-0">
          <StatusPanel
            mode={mode}
            canSend={canSend}
            memoryOk={memoryOk}
            realtimeOk
            realtimeDesc={realtimeDesc}
            summaryEnabled={summaryStatus.enabled}
            summaryDesc={summaryStatus.enabled ? `Aktif · ringkas ${summaryStatus.summarizedMessages} pesan lama` : `${summaryStatus.totalMessages}/30 pesan`}
            providerName={activeProvider?.name ?? "Provider"}
            providerModel={activeProvider?.model ?? "Belum dipilih"}
            onMode={setMode}
          />
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-2 border-b border-border/70 bg-background px-3 py-2.5">
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
              <DropdownMenuItem onClick={() => setMode("normal")}>
                <Sparkles className="mr-2 size-4" /> Plain
                {mode === "normal" && <Check className="ml-auto size-3" />}
              </DropdownMenuItem>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger className={(mode === "thinking" || mode === "thinking-deep") ? "text-primary" : ""}>
                  <Brain className="mr-2 size-4" /> Thinking
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="rounded-2xl">
                  <DropdownMenuItem onClick={() => setMode("thinking")}>
                    <Brain className="mr-2 size-4" /> Standard
                    {mode === "thinking" && <Check className="ml-auto size-3" />}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setMode("thinking-deep")}>
                    <BrainCircuit className="mr-2 size-4" /> Think Deeply
                    {mode === "thinking-deep" && <Check className="ml-auto size-3" />}
                  </DropdownMenuItem>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            </DropdownMenuContent>
          </DropdownMenu>

          {providers.length > 0 && <Select value={selectedValue} onValueChange={handleProviderModelChange}><SelectTrigger className="hidden h-9 w-56 rounded-xl text-xs lg:flex"><SelectValue placeholder="Pilih provider" /></SelectTrigger><SelectContent>{providerModelItems}</SelectContent></Select>}
          <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label="Menu"><FileText className="size-5" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end" className="w-52"><DropdownMenuItem onClick={() => setStatusOpen(true)}><Sparkles className="mr-2 size-4" /> Status</DropdownMenuItem><DropdownMenuItem asChild><Link to="/settings"><Settings className="mr-2 size-4" /> Settings</Link></DropdownMenuItem><DropdownMenuItem onClick={() => handleExport("txt")} disabled={!messages.length}><Download className="mr-2 size-4" /> Export TXT</DropdownMenuItem><DropdownMenuItem onClick={() => handleExport("json")} disabled={!messages.length}><FileJson className="mr-2 size-4" /> Export JSON</DropdownMenuItem><DropdownMenuItem onClick={handleClear} disabled={!messages.length}><Eraser className="mr-2 size-4" /> Clear Chat</DropdownMenuItem><DropdownMenuItem onClick={handleClearAllChats} disabled={!conversations.length} className="text-destructive focus:text-destructive"><Eraser className="mr-2 size-4" /> Hapus semua chat</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
        </header>

        <main className="keyboard-safe-main min-h-0 flex-1 overflow-hidden">
          <ScrollArea className="h-full">
            <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-3 py-6 sm:px-4">
              {summaryStatus.enabled && <div className="rounded-2xl border border-primary/20 bg-primary/10 px-3 py-2 text-xs text-primary">Conversation Summary aktif — chat panjang diringkas saat dikirim ke AI agar lebih ringan dan hemat token. Riwayat lengkap tetap tampil di layar.</div>}
              {messages.length === 0 ? <div className="flex min-h-[55vh] flex-col items-center justify-center text-center"><div className="mb-5 rounded-[2rem] border border-border/70 bg-card/80 p-5 shadow-2xl shadow-black/20 backdrop-blur"><Sparkles className="size-9 text-primary" /></div><h1 className="text-3xl font-semibold tracking-tight">AI Chat</h1><p className="mt-2 max-w-md text-sm text-muted-foreground">Pilih mode di header. Plain otomatis mencari data terbaru jika diperlukan, dan Thinking untuk jawaban lebih teliti.</p><div className="mt-5 grid w-full max-w-xl grid-cols-1 gap-2 sm:grid-cols-2"><PremiumCard title="Plain" desc="Auto Search bila perlu" /><PremiumCard title="Thinking" desc="Jawaban lebih teliti" /></div></div> : messages.map((m) => <ChatMessageBubble key={m.id} message={m} onRegenerate={m.id === lastAssistantId ? handleRegenerate : undefined} onEdit={m.role === "user" ? () => handleEdit(m) : undefined} onDelete={() => handleDelete(m)} />)}
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
  memoryOk,
  realtimeOk,
  realtimeDesc,
  summaryEnabled,
  summaryDesc,
  providerName,
  providerModel,
  onMode,
}: {
  mode: ChatMode;
  canSend: boolean;
  memoryOk: boolean;
  realtimeOk: boolean;
  realtimeDesc: string;
  summaryEnabled: boolean;
  summaryDesc: string;
  providerName: string;
  providerModel: string;
  onMode: (mode: ChatMode) => void;
}) {
  return (
    <div className="flex h-full flex-col bg-sidebar p-4 text-sidebar-foreground">
      <div className="mb-4 rounded-3xl border border-sidebar-border bg-sidebar-accent/40 p-4">
        <p className="text-sm font-semibold">Status AI Chat</p>
        <p className="mt-1 text-xs text-muted-foreground">Usap dari kanan ke kiri untuk membuka menu ini.</p>
      </div>

      <div className="space-y-2">
        <StatusRow ok={canSend} title="Provider" desc={canSend ? `${providerName} · ${providerModel}` : "Belum lengkap"} />
        <StatusRow ok={memoryOk} title="Memory" desc={memoryOk ? "Supabase aktif" : "Supabase belum aktif"} />
        <StatusRow ok={realtimeOk} title="Auto Search" desc={realtimeDesc} />
        <StatusRow ok={summaryEnabled} title="Summary" desc={summaryDesc} />
      </div>

      <div className="mt-5 rounded-3xl border border-sidebar-border bg-sidebar-accent/30 p-3">
        <p className="mb-2 text-xs font-semibold text-muted-foreground">Mode</p>
        <div className="grid gap-2">
          <Button variant={mode === "normal" ? "default" : "secondary"} className="justify-start rounded-2xl" onClick={() => onMode("normal")}><Sparkles className="mr-2 size-4" />Plain</Button>
          <Button variant={mode === "thinking" ? "default" : "secondary"} className="justify-start rounded-2xl" onClick={() => onMode("thinking")}><Brain className="mr-2 size-4" />Thinking</Button>
          <Button variant={mode === "thinking-deep" ? "default" : "secondary"} className="justify-start rounded-2xl" onClick={() => onMode("thinking-deep")}><BrainCircuit className="mr-2 size-4" />Think Deeply</Button>
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
