import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  Download,
  ExternalLink,
  FileText,
  Loader2,
  LogOut,
  Mail,
  Paperclip,
  RefreshCw,
  Search,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  connectOutlook,
  disconnectOutlook,
  getAccessToken,
  getActiveAccount,
  loadOutlookConfig,
  saveOutlookConfig,
  type OutlookConfig,
} from "@/lib/outlook/msal";
import {
  downloadAttachment,
  formatBytes,
  getAttachments,
  searchMessages,
  type GraphAttachment,
  type GraphMessage,
  type SearchIn,
} from "@/lib/outlook/graph";

export const Route = createFileRoute("/outlook")({
  head: () => ({
    meta: [
      { title: "Outlook Search — AI Chat" },
      {
        name: "description",
        content: "Cari email Outlook dengan AI — keyword, pengirim, subjek, lampiran PDF.",
      },
    ],
  }),
  component: OutlookSearchPage,
});

/* ─── types ─────────────────────────────────────────────────────────────── */

interface MessageWithAttachments extends GraphMessage {
  attachments?: GraphAttachment[];
  attachmentsLoading?: boolean;
  attachmentsExpanded?: boolean;
  attachmentsError?: string;
}

/* ─── helpers ────────────────────────────────────────────────────────────── */

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

const SEARCH_IN_OPTIONS: { value: SearchIn; label: string }[] = [
  { value: "all", label: "Semua bidang" },
  { value: "subject", label: "Subjek" },
  { value: "from", label: "Pengirim" },
  { value: "body", label: "Isi email" },
  { value: "filename", label: "Nama file lampiran" },
  { value: "pdf", label: "File PDF saja" },
];

/* ─── main page ──────────────────────────────────────────────────────────── */

function OutlookSearchPage() {
  /* auth state */
  const [config, setConfig] = useState<OutlookConfig>({ clientId: "", tenant: "common" });
  const [connectedEmail, setConnectedEmail] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);

  /* search state */
  const [query, setQuery] = useState("");
  const [searchIn, setSearchIn] = useState<SearchIn>("all");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<MessageWithAttachments[]>([]);
  const [searched, setSearched] = useState(false);

  const queryRef = useRef(query);
  queryRef.current = query;

  /* ── boot: load config + check for active session ── */
  useEffect(() => {
    const cfg = loadOutlookConfig();
    setConfig(cfg);
    if (!cfg.clientId.trim()) return;
    getActiveAccount(cfg)
      .then((acc) => {
        if (acc?.username) {
          setConnectedEmail(acc.username);
          saveOutlookConfig({ ...cfg, email: acc.username });
        }
      })
      .catch(() => {
        /* no session — silent ignore */
      });
  }, []);

  /* ── update config field ── */
  const patch = (delta: Partial<OutlookConfig>) =>
    setConfig((prev) => {
      const next = { ...prev, ...delta };
      saveOutlookConfig(next);
      return next;
    });

  /* ── connect / switch account ── */
  const handleConnect = async (promptMode: "select_account" | "none" = "select_account") => {
    if (!config.clientId.trim()) {
      toast.error("Isi Microsoft Client ID terlebih dahulu.");
      return;
    }
    setAuthLoading(true);
    try {
      const account = await connectOutlook(config, promptMode);
      const email = account.username ?? null;
      setConnectedEmail(email);
      patch({ email: email ?? undefined });
      toast.success(`Terhubung sebagai ${email ?? "akun Microsoft"}.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal menghubungkan akun.");
    } finally {
      setAuthLoading(false);
    }
  };

  /* ── disconnect ── */
  const handleDisconnect = async () => {
    try {
      await disconnectOutlook(config);
    } catch {
      /* ignore */
    }
    setConnectedEmail(null);
    patch({ email: undefined });
    setResults([]);
    setSearched(false);
    toast.success("Akun Microsoft diputuskan.");
  };

  /* ── search ── */
  const handleSearch = useCallback(async () => {
    const q = queryRef.current.trim();
    if (!q && searchIn !== "pdf") {
      toast.error("Masukkan kata kunci pencarian.");
      return;
    }
    setSearching(true);
    setSearched(false);
    setResults([]);
    try {
      const token = await getAccessToken(config);
      const msgs = await searchMessages(token, q, searchIn);
      setResults(msgs.map((m) => ({ ...m })));
      setSearched(true);
      if (msgs.length === 0) toast.info("Tidak ada email yang cocok ditemukan.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Pencarian gagal.");
    } finally {
      setSearching(false);
    }
  }, [config, searchIn]);

  /* ── expand attachments for a message ── */
  const loadAttachments = useCallback(
    async (messageId: string) => {
      const pdfOnly = searchIn === "pdf";
      setResults((prev) =>
        prev.map((m) =>
          m.id === messageId
            ? { ...m, attachmentsLoading: true, attachmentsExpanded: true, attachmentsError: undefined }
            : m,
        ),
      );
      try {
        const token = await getAccessToken(config);
        const attachments = await getAttachments(token, messageId, pdfOnly);
        setResults((prev) =>
          prev.map((m) =>
            m.id === messageId
              ? { ...m, attachments, attachmentsLoading: false }
              : m,
          ),
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Gagal memuat lampiran.";
        setResults((prev) =>
          prev.map((m) =>
            m.id === messageId
              ? { ...m, attachmentsLoading: false, attachmentsError: msg }
              : m,
          ),
        );
      }
    },
    [config, searchIn],
  );

  /* ── toggle attachment panel ── */
  const toggleAttachments = (msg: MessageWithAttachments) => {
    if (msg.attachmentsExpanded) {
      setResults((prev) =>
        prev.map((m) => (m.id === msg.id ? { ...m, attachmentsExpanded: false } : m)),
      );
    } else if (msg.attachments !== undefined) {
      setResults((prev) =>
        prev.map((m) => (m.id === msg.id ? { ...m, attachmentsExpanded: true } : m)),
      );
    } else {
      void loadAttachments(msg.id);
    }
  };

  /* ── download attachment ── */
  const handleDownload = async (
    messageId: string,
    att: GraphAttachment,
    open: boolean,
  ) => {
    try {
      const token = await getAccessToken(config);
      const { url, filename } = await downloadAttachment(token, messageId, att.id);
      if (open) {
        window.open(url, "_blank");
      } else {
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 10000);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal mengunduh lampiran.");
    }
  };

  const connected = Boolean(connectedEmail);

  /* ─── render ────────────────────────────────────────────────────────────── */
  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background text-foreground">
      {/* ── header ── */}
      <header className="flex shrink-0 items-center gap-3 border-b border-border px-4 py-3">
        <Link to="/">
          <Button variant="ghost" size="icon" className="size-8 rounded-xl">
            <ArrowLeft className="size-4" />
          </Button>
        </Link>
        <div className="flex items-center gap-2">
          <Mail className="size-4 text-primary" />
          <h1 className="text-sm font-semibold">Outlook AI Search</h1>
        </div>
      </header>

      <ScrollArea className="flex-1">
        <div className="mx-auto max-w-3xl space-y-4 px-4 py-6">
          {/* ── auth panel ── */}
          <AuthPanel
            config={config}
            connectedEmail={connectedEmail}
            authLoading={authLoading}
            onPatch={patch}
            onConnect={handleConnect}
            onDisconnect={handleDisconnect}
          />

          {/* ── search panel ── */}
          {connected && (
            <div className="rounded-2xl border border-border bg-card p-4">
              <div className="flex flex-wrap items-end gap-3">
                <div className="min-w-0 flex-1">
                  <Label className="mb-1.5 block text-xs">Kata kunci</Label>
                  <Input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={
                      searchIn === "pdf"
                        ? "Kosongkan untuk semua PDF, atau tulis kata kunci…"
                        : "Cari email…"
                    }
                    className="rounded-xl"
                    onKeyDown={(e) => e.key === "Enter" && void handleSearch()}
                    disabled={searching}
                  />
                </div>
                <div className="w-48 shrink-0">
                  <Label className="mb-1.5 block text-xs">Cari di</Label>
                  <Select
                    value={searchIn}
                    onValueChange={(v) => setSearchIn(v as SearchIn)}
                    disabled={searching}
                  >
                    <SelectTrigger className="rounded-xl">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SEARCH_IN_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  onClick={() => void handleSearch()}
                  disabled={searching}
                  className="gap-2 rounded-xl"
                >
                  {searching ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Search className="size-4" />
                  )}
                  Cari
                </Button>
              </div>
            </div>
          )}

          {/* ── results ── */}
          {searched && results.length === 0 && !searching && (
            <p className="text-center text-sm text-muted-foreground py-8">
              Tidak ada email yang cocok ditemukan.
            </p>
          )}

          {results.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                {results.length} email ditemukan
              </p>
              {results.map((msg) => (
                <EmailCard
                  key={msg.id}
                  msg={msg}
                  pdfMode={searchIn === "pdf"}
                  onToggleAttachments={() => toggleAttachments(msg)}
                  onDownload={(att, open) => void handleDownload(msg.id, att, open)}
                />
              ))}
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

/* ─── AuthPanel ──────────────────────────────────────────────────────────── */

function AuthPanel({
  config,
  connectedEmail,
  authLoading,
  onPatch,
  onConnect,
  onDisconnect,
}: {
  config: OutlookConfig;
  connectedEmail: string | null;
  authLoading: boolean;
  onPatch: (delta: Partial<OutlookConfig>) => void;
  onConnect: (prompt?: "select_account" | "none") => void;
  onDisconnect: () => void;
}) {
  const connected = Boolean(connectedEmail);

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center gap-2">
        <Mail className="size-4 text-primary" />
        <span className="text-sm font-semibold">Akun Microsoft</span>
      </div>

      {!connected && (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Microsoft Client ID</Label>
            <Input
              value={config.clientId}
              onChange={(e) => onPatch({ clientId: e.target.value })}
              placeholder="Application (client) ID dari Azure App Registration"
              className="rounded-xl"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Tenant (opsional)</Label>
            <Input
              value={config.tenant}
              onChange={(e) => onPatch({ tenant: e.target.value })}
              placeholder="common"
              className="rounded-xl"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Buat App Registration tipe <span className="font-medium">SPA</span> di Azure Portal.
            Tambahkan Redirect URI:{" "}
            <code className="rounded bg-muted px-1">
              {typeof window !== "undefined" ? window.location.origin : "https://your-app"}
            </code>
            . Scope: <span className="font-medium">User.Read, Mail.Read, offline_access</span>.
          </p>
          <Button
            onClick={() => onConnect("select_account")}
            disabled={authLoading || !config.clientId.trim()}
            className="gap-2 rounded-xl"
          >
            {authLoading ? <Loader2 className="size-4 animate-spin" /> : <Mail className="size-4" />}
            Hubungkan Akun Microsoft
          </Button>
        </div>
      )}

      {connected && (
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <UserRound className="size-4 shrink-0 text-muted-foreground" />
            <span className="truncate text-sm">{connectedEmail}</span>
            <Badge variant="secondary" className="shrink-0 text-[10px]">
              Terhubung
            </Badge>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={authLoading}
              onClick={() => onConnect("select_account")}
              className="gap-1.5 rounded-xl text-xs"
            >
              {authLoading ? (
                <Loader2 className="size-3 animate-spin" />
              ) : (
                <RefreshCw className="size-3" />
              )}
              Ganti Akun
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={onDisconnect}
              className="gap-1.5 rounded-xl text-xs text-destructive hover:text-destructive"
            >
              <LogOut className="size-3" />
              Putuskan
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── EmailCard ──────────────────────────────────────────────────────────── */

function EmailCard({
  msg,
  pdfMode,
  onToggleAttachments,
  onDownload,
}: {
  msg: MessageWithAttachments;
  pdfMode: boolean;
  onToggleAttachments: () => void;
  onDownload: (att: GraphAttachment, open: boolean) => void;
}) {
  const isPdf = (att: GraphAttachment) =>
    att.contentType === "application/pdf" || att.name?.toLowerCase().endsWith(".pdf");

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      {/* email header */}
      <div className="px-4 py-3">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-medium text-sm truncate">
                {msg.subject || "(Tanpa Subjek)"}
              </p>
              {msg.hasAttachments && (
                <Paperclip className="size-3 text-muted-foreground shrink-0" />
              )}
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              <span className="font-medium text-foreground/80">
                {msg.from?.emailAddress?.name || msg.from?.emailAddress?.address}
              </span>
              {" — "}
              {msg.from?.emailAddress?.address}
            </p>
            {msg.bodyPreview && (
              <p className="mt-1.5 text-xs text-muted-foreground line-clamp-2">
                {msg.bodyPreview}
              </p>
            )}
          </div>
          <div className="shrink-0 text-right space-y-1">
            <p className="text-[11px] text-muted-foreground whitespace-nowrap">
              {formatDate(msg.receivedDateTime)}
            </p>
            {msg.webLink && (
              <a
                href={msg.webLink}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
              >
                Buka <ExternalLink className="size-3" />
              </a>
            )}
          </div>
        </div>

        {/* attachment toggle */}
        {msg.hasAttachments && (
          <button
            onClick={onToggleAttachments}
            className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {msg.attachmentsExpanded ? (
              <ChevronDown className="size-3.5" />
            ) : (
              <ChevronRight className="size-3.5" />
            )}
            <Paperclip className="size-3" />
            {pdfMode ? "Lihat lampiran PDF" : "Lihat lampiran"}
            {msg.attachments !== undefined && (
              <span className="text-muted-foreground">
                ({pdfMode ? msg.attachments.filter(isPdf).length : msg.attachments.length})
              </span>
            )}
          </button>
        )}
      </div>

      {/* attachment list */}
      {msg.attachmentsExpanded && (
        <div className="border-t border-border bg-muted/30 px-4 py-3 space-y-2">
          {msg.attachmentsLoading && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" />
              Memuat lampiran…
            </div>
          )}
          {msg.attachmentsError && (
            <p className="text-xs text-destructive">{msg.attachmentsError}</p>
          )}
          {msg.attachments !== undefined && !msg.attachmentsLoading && (
            <>
              {(pdfMode ? msg.attachments.filter(isPdf) : msg.attachments).length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  {pdfMode ? "Tidak ada lampiran PDF." : "Tidak ada lampiran."}
                </p>
              ) : (
                (pdfMode ? msg.attachments.filter(isPdf) : msg.attachments).map((att) => (
                  <AttachmentRow
                    key={att.id}
                    att={att}
                    onDownload={(open) => onDownload(att, open)}
                  />
                ))
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── AttachmentRow ──────────────────────────────────────────────────────── */

function AttachmentRow({
  att,
  onDownload,
}: {
  att: GraphAttachment;
  onDownload: (open: boolean) => void;
}) {
  const [loading, setLoading] = useState(false);

  const handle = async (open: boolean) => {
    setLoading(true);
    try {
      await onDownload(open);
    } finally {
      setLoading(false);
    }
  };

  const isPdf =
    att.contentType === "application/pdf" || att.name?.toLowerCase().endsWith(".pdf");

  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-background px-3 py-2">
      <FileText className={`size-4 shrink-0 ${isPdf ? "text-red-400" : "text-muted-foreground"}`} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium">{att.name}</p>
        <p className="text-[10px] text-muted-foreground">
          {att.contentType} · {formatBytes(att.size)}
        </p>
      </div>
      <div className="flex shrink-0 gap-1.5">
        {isPdf && (
          <Button
            variant="outline"
            size="sm"
            disabled={loading}
            onClick={() => void handle(true)}
            className="h-7 gap-1 rounded-lg px-2 text-[11px]"
          >
            {loading ? <Loader2 className="size-3 animate-spin" /> : <ExternalLink className="size-3" />}
            Buka
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          disabled={loading}
          onClick={() => void handle(false)}
          className="h-7 gap-1 rounded-lg px-2 text-[11px]"
        >
          {loading ? <Loader2 className="size-3 animate-spin" /> : <Download className="size-3" />}
          Unduh
        </Button>
      </div>
    </div>
  );
}
