import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  Download,
  ExternalLink,
  FileText,
  FolderOpen,
  Inbox,
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
  listMailFolders,
  searchMessages,
  type GraphAttachment,
  type GraphMailFolder,
  type GraphMessage,
  type MailFolderTarget,
  type SearchIn,
} from "@/lib/outlook/graph";

export const Route = createFileRoute("/outlook")({
  head: () => ({
    meta: [
      { title: "Outlook Search — AI Chat" },
      {
        name: "description",
        content: "Cari email Outlook di semua folder: inbox, sent, junk, custom folder, dan PDF.",
      },
    ],
  }),
  component: OutlookSearchPage,
});

interface MessageWithAttachments extends GraphMessage {
  attachments?: GraphAttachment[];
  attachmentsLoading?: boolean;
  attachmentsExpanded?: boolean;
  attachmentsError?: string;
}

const SEARCH_IN_OPTIONS: { value: SearchIn; label: string }[] = [
  { value: "all", label: "Semua bidang" },
  { value: "subject", label: "Subjek" },
  { value: "from", label: "Pengirim" },
  { value: "body", label: "Isi email" },
  { value: "filename", label: "Nama file lampiran" },
  { value: "pdf", label: "File PDF saja" },
];

const DEFAULT_FOLDER_OPTIONS: { value: MailFolderTarget; label: string }[] = [
  { value: "all", label: "All Mail / Semua folder" },
  { value: "wellKnown:inbox", label: "Inbox" },
  { value: "wellKnown:sentitems", label: "Sent Items" },
  { value: "wellKnown:junkemail", label: "Junk Email" },
  { value: "wellKnown:drafts", label: "Drafts" },
  { value: "wellKnown:archive", label: "Archive" },
  { value: "wellKnown:deleteditems", label: "Deleted Items" },
];

function formatDate(iso?: string | null): string {
  if (!iso) return "—";
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

function messageDate(msg: GraphMessage): string {
  return msg.receivedDateTime || msg.sentDateTime || "";
}

function folderLabel(value: MailFolderTarget, folders: GraphMailFolder[]): string {
  const builtIn = DEFAULT_FOLDER_OPTIONS.find((x) => x.value === value)?.label;
  if (builtIn) return builtIn;
  const f = folders.find((x) => x.id === value);
  return f?.path ?? f?.displayName ?? "Folder";
}

function OutlookSearchPage() {
  const [config, setConfig] = useState<OutlookConfig>({ clientId: "", tenant: "common" });
  const [connectedEmail, setConnectedEmail] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);

  const [query, setQuery] = useState("");
  const [searchIn, setSearchIn] = useState<SearchIn>("all");
  const [folderTarget, setFolderTarget] = useState<MailFolderTarget>("all");
  const [folders, setFolders] = useState<GraphMailFolder[]>([]);
  const [foldersLoading, setFoldersLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<MessageWithAttachments[]>([]);
  const [searched, setSearched] = useState(false);

  const queryRef = useRef(query);
  queryRef.current = query;

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

  const patch = (delta: Partial<OutlookConfig>) =>
    setConfig((prev) => {
      const next = { ...prev, ...delta };
      saveOutlookConfig(next);
      return next;
    });

  const loadFolders = useCallback(async () => {
    setFoldersLoading(true);
    try {
      const token = await getAccessToken(config);
      const loaded = await listMailFolders(token);
      setFolders(loaded);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal memuat folder Outlook.");
    } finally {
      setFoldersLoading(false);
    }
  }, [config]);

  useEffect(() => {
    if (connectedEmail) void loadFolders();
  }, [connectedEmail, loadFolders]);

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
      setResults([]);
      setSearched(false);
      toast.success(`Terhubung sebagai ${email ?? "akun Microsoft"}.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal menghubungkan akun.");
    } finally {
      setAuthLoading(false);
    }
  };

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
    setFolders([]);
    toast.success("Akun Microsoft diputuskan.");
  };

  const runSearch = useCallback(
    async (targetFolder: MailFolderTarget = folderTarget, forcedQuery?: string, forcedSearchIn?: SearchIn) => {
      const q = forcedQuery ?? queryRef.current.trim();
      const mode = forcedSearchIn ?? searchIn;
      setSearching(true);
      setSearched(false);
      setResults([]);
      try {
        const token = await getAccessToken(config);
        const msgs = await searchMessages(token, q, mode, targetFolder);
        setResults(msgs.map((m) => ({ ...m })));
        setSearched(true);
        if (msgs.length === 0) toast.info("Tidak ada email yang cocok ditemukan.");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Pencarian gagal.");
      } finally {
        setSearching(false);
      }
    },
    [config, folderTarget, searchIn],
  );

  const handleRecentInbox = () => {
    setFolderTarget("wellKnown:inbox");
    setQuery("");
    setSearchIn("all");
    void runSearch("wellKnown:inbox", "", "all");
  };

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
            m.id === messageId ? { ...m, attachments, attachmentsLoading: false } : m,
          ),
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Gagal memuat lampiran.";
        setResults((prev) =>
          prev.map((m) =>
            m.id === messageId ? { ...m, attachmentsLoading: false, attachmentsError: msg } : m,
          ),
        );
      }
    },
    [config, searchIn],
  );

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

  const handleDownload = async (messageId: string, att: GraphAttachment, open: boolean) => {
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
  const customFolderOptions = folders.filter(
    (folder) =>
      !DEFAULT_FOLDER_OPTIONS.some((opt) => opt.label.toLowerCase() === folder.displayName.toLowerCase()),
  );

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background text-foreground">
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
          <AuthPanel
            config={config}
            connectedEmail={connectedEmail}
            authLoading={authLoading}
            onPatch={patch}
            onConnect={handleConnect}
            onDisconnect={handleDisconnect}
          />

          {connected && (
            <div className="rounded-2xl border border-border bg-card p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-sm font-semibold">Cari email Outlook</h2>
                  <p className="text-xs text-muted-foreground">
                    Bisa cek Inbox, Sent, Junk, Archive, Deleted, dan folder custom.
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRecentInbox}
                  disabled={searching}
                  className="gap-2 rounded-xl"
                >
                  {searching ? <Loader2 className="size-4 animate-spin" /> : <Inbox className="size-4" />}
                  Recent Inbox
                </Button>
              </div>

              <div className="grid gap-3 sm:grid-cols-[1fr_190px]">
                <div className="space-y-1.5">
                  <Label className="block text-xs">Folder</Label>
                  <Select value={folderTarget} onValueChange={(v) => setFolderTarget(v as MailFolderTarget)} disabled={searching}>
                    <SelectTrigger className="rounded-xl">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DEFAULT_FOLDER_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                      {customFolderOptions.map((folder) => (
                        <SelectItem key={folder.id} value={folder.id}>
                          {folder.path ?? folder.displayName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="block text-xs">Cari di</Label>
                  <Select value={searchIn} onValueChange={(v) => setSearchIn(v as SearchIn)} disabled={searching}>
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
              </div>

              <div className="mt-3 flex flex-wrap items-end gap-3">
                <div className="min-w-0 flex-1">
                  <Label className="mb-1.5 block text-xs">Kata kunci</Label>
                  <Input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={
                      searchIn === "pdf"
                        ? "Kosongkan untuk semua PDF, atau tulis kata kunci…"
                        : "Kosongkan untuk email terbaru, atau cari email…"
                    }
                    className="rounded-xl"
                    onKeyDown={(e) => e.key === "Enter" && void runSearch()}
                    disabled={searching}
                  />
                </div>
                <Button onClick={() => void runSearch()} disabled={searching} className="gap-2 rounded-xl">
                  {searching ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
                  Cari
                </Button>
                <Button variant="outline" onClick={() => void loadFolders()} disabled={foldersLoading} className="gap-2 rounded-xl">
                  {foldersLoading ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
                  Folder
                </Button>
              </div>
            </div>
          )}

          {searched && results.length === 0 && !searching && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Tidak ada email yang cocok ditemukan.
            </p>
          )}

          {results.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                {results.length} email ditemukan di {folderLabel(folderTarget, folders)}
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
            Tambahkan Redirect URI: {" "}
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
              {authLoading ? <Loader2 className="size-3 animate-spin" /> : <RefreshCw className="size-3" />}
              Switch Account
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
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="px-4 py-3">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="truncate text-sm font-medium">{msg.subject || "(Tanpa Subjek)"}</p>
              {msg.hasAttachments && <Paperclip className="size-3 shrink-0 text-muted-foreground" />}
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              <span className="font-medium text-foreground/80">
                {msg.from?.emailAddress?.name || msg.from?.emailAddress?.address || "Unknown sender"}
              </span>
              {msg.from?.emailAddress?.address ? ` — ${msg.from.emailAddress.address}` : ""}
            </p>
            {msg.folderDisplayName && (
              <p className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                <FolderOpen className="size-3" /> {msg.folderDisplayName}
              </p>
            )}
            {msg.bodyPreview && (
              <p className="mt-1.5 line-clamp-2 text-xs text-muted-foreground">{msg.bodyPreview}</p>
            )}
          </div>
          <div className="shrink-0 space-y-1 text-right">
            <p className="whitespace-nowrap text-[11px] text-muted-foreground">
              {formatDate(messageDate(msg))}
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

        {msg.hasAttachments && (
          <button
            onClick={onToggleAttachments}
            className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            {msg.attachmentsExpanded ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
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

      {msg.attachmentsExpanded && (
        <div className="space-y-2 border-t border-border bg-muted/30 px-4 py-3">
          {msg.attachmentsLoading && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" />
              Memuat lampiran…
            </div>
          )}
          {msg.attachmentsError && <p className="text-xs text-destructive">{msg.attachmentsError}</p>}
          {msg.attachments !== undefined && !msg.attachmentsLoading && (
            <>
              {(pdfMode ? msg.attachments.filter(isPdf) : msg.attachments).length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  {pdfMode ? "Tidak ada lampiran PDF." : "Tidak ada lampiran."}
                </p>
              ) : (
                (pdfMode ? msg.attachments.filter(isPdf) : msg.attachments).map((att) => (
                  <AttachmentRow key={att.id} att={att} onDownload={(open) => onDownload(att, open)} />
                ))
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

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

  const isPdf = att.contentType === "application/pdf" || att.name?.toLowerCase().endsWith(".pdf");

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
