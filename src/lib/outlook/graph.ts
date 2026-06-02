/**
 * Microsoft Graph API helpers for Outlook mail search.
 * All calls are made client-side with a delegated Bearer token from MSAL.
 */

export interface GraphMessage {
  id: string;
  subject: string | null;
  bodyPreview: string | null;
  receivedDateTime: string;
  sentDateTime?: string | null;
  hasAttachments: boolean;
  parentFolderId?: string;
  folderDisplayName?: string;
  from?: {
    emailAddress?: { name?: string; address?: string };
  };
  webLink?: string;
}

export interface GraphAttachment {
  id: string;
  name: string;
  contentType: string;
  size: number;
  contentBytes?: string;
}

export interface GraphMailFolder {
  id: string;
  displayName: string;
  parentFolderId?: string;
  childFolderCount?: number;
  totalItemCount?: number;
  unreadItemCount?: number;
  path?: string;
}

type MessageWithLoadedAttachments = GraphMessage & {
  attachments?: GraphAttachment[];
  attachmentsExpanded?: boolean;
};

export type SearchIn = "all" | "subject" | "from" | "body" | "filename" | "pdf";
export type MailFolderTarget = string;

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";
const MESSAGE_SELECT =
  "id,subject,bodyPreview,receivedDateTime,sentDateTime,hasAttachments,from,webLink,parentFolderId";
const FOLDER_SELECT = "id,displayName,parentFolderId,childFolderCount,totalItemCount,unreadItemCount";
const ATTACHMENT_SELECT = "id,name,contentType,size";
const MAX_ATTACHMENT_SCAN = 150;
const PAGE_SIZE = 50;

function cleanQuery(query: string): string {
  return query.trim().replace(/\s+/g, " ");
}

function escapeSearchValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function includesText(value: string | null | undefined, query: string): boolean {
  if (!query) return true;
  return (value ?? "").toLowerCase().includes(query.toLowerCase());
}

function messageDate(message: GraphMessage): string {
  return message.receivedDateTime || message.sentDateTime || "";
}

function sortMessagesNewestFirst<T extends GraphMessage>(messages: T[]): T[] {
  return [...messages].sort(
    (a, b) => new Date(messageDate(b)).getTime() - new Date(messageDate(a)).getTime(),
  );
}

function getSenderText(message: GraphMessage): string {
  const from = message.from?.emailAddress;
  return `${from?.name ?? ""} ${from?.address ?? ""}`.trim();
}

export function isPdfAttachment(att: GraphAttachment): boolean {
  return (
    att.contentType?.toLowerCase() === "application/pdf" ||
    att.name?.toLowerCase().endsWith(".pdf")
  );
}

function messageMatchesKeyword(message: GraphMessage, query: string): boolean {
  if (!query) return true;
  return (
    includesText(message.subject, query) ||
    includesText(message.bodyPreview, query) ||
    includesText(getSenderText(message), query)
  );
}

function attachmentMatchesKeyword(att: GraphAttachment, query: string): boolean {
  return includesText(att.name, query) || includesText(att.contentType, query);
}

function buildSearchText(query: string, searchIn: SearchIn): string {
  const q = cleanQuery(query);
  const escaped = escapeSearchValue(q);

  switch (searchIn) {
    case "subject":
      return `subject:${escaped}`;
    case "from":
      return `from:${escaped}`;
    case "body":
      return `body:${escaped}`;
    default:
      return escaped;
  }
}

function graphHeaders(token: string): Headers {
  return new Headers({
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    ConsistencyLevel: "eventual",
  });
}

async function checkResponse(res: Response): Promise<void> {
  if (!res.ok) {
    let detail = "";
    try {
      const body = await res.json();
      detail = body?.error?.message ?? body?.message ?? "";
    } catch {
      detail = await res.text().catch(() => "");
    }
    throw new Error(
      `Microsoft Graph ${res.status}: ${detail.slice(0, 300) || res.statusText}`,
    );
  }
}

async function graphGet<T>(token: string, url: string): Promise<T> {
  const res = await fetch(url, { headers: graphHeaders(token) });
  await checkResponse(res);
  return (await res.json()) as T;
}

function paramsToSearch(params: Record<string, string | number>): string {
  const sp = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => sp.set(key, String(value)));
  return sp.toString();
}

function messagesUrl(folder: MailFolderTarget = "all", params: Record<string, string | number>): string {
  const qs = paramsToSearch(params);
  if (!folder || folder === "all") return `${GRAPH_BASE}/me/messages?${qs}`;

  const folderId = folder.startsWith("wellKnown:") ? folder.replace("wellKnown:", "") : folder;
  return `${GRAPH_BASE}/me/mailFolders/${encodeURIComponent(folderId)}/messages?${qs}`;
}

function mergeMessages(
  primary: MessageWithLoadedAttachments[],
  secondary: MessageWithLoadedAttachments[],
  top: number,
): MessageWithLoadedAttachments[] {
  const map = new Map<string, MessageWithLoadedAttachments>();

  [...primary, ...secondary].forEach((message) => {
    const existing = map.get(message.id);
    map.set(message.id, {
      ...(existing ?? message),
      ...message,
      attachments: message.attachments ?? existing?.attachments,
      attachmentsExpanded: message.attachmentsExpanded ?? existing?.attachmentsExpanded,
    });
  });

  return sortMessagesNewestFirst(Array.from(map.values())).slice(0, top);
}

async function listFolderPage(
  token: string,
  url: string,
  parentPath = "",
): Promise<GraphMailFolder[]> {
  const folders: GraphMailFolder[] = [];
  let nextUrl: string | undefined = url;

  while (nextUrl) {
    const data = await graphGet<{ value?: unknown[]; "@odata.nextLink"?: string }>(token, nextUrl);
    const page = (data.value ?? []) as GraphMailFolder[];

    for (const folder of page) {
      const path = parentPath ? `${parentPath} / ${folder.displayName}` : folder.displayName;
      folders.push({ ...folder, path });

      if ((folder.childFolderCount ?? 0) > 0) {
        const childUrl = `${GRAPH_BASE}/me/mailFolders/${encodeURIComponent(folder.id)}/childFolders?${paramsToSearch({
          $select: FOLDER_SELECT,
          $top: 100,
        })}`;
        folders.push(...(await listFolderPage(token, childUrl, path)));
      }
    }

    nextUrl = data["@odata.nextLink"];
  }

  return folders;
}

export async function listMailFolders(token: string): Promise<GraphMailFolder[]> {
  const url = `${GRAPH_BASE}/me/mailFolders?${paramsToSearch({
    $select: FOLDER_SELECT,
    $top: 100,
  })}`;
  const folders = await listFolderPage(token, url);

  const priority = ["inbox", "sent items", "junk email", "drafts", "archive", "deleted items"];
  return folders.sort((a, b) => {
    const ai = priority.indexOf((a.displayName ?? "").toLowerCase());
    const bi = priority.indexOf((b.displayName ?? "").toLowerCase());
    if (ai !== -1 || bi !== -1) return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    return (a.path ?? a.displayName).localeCompare(b.path ?? b.displayName);
  });
}

export async function listRecentMessages(
  token: string,
  folder: MailFolderTarget = "all",
  top = 25,
): Promise<GraphMessage[]> {
  const data = await graphGet<{ value?: unknown[] }>(
    token,
    messagesUrl(folder, {
      $select: MESSAGE_SELECT,
      $orderby: "receivedDateTime desc",
      $top: Math.min(top, PAGE_SIZE),
    }),
  );

  return (data.value ?? []) as GraphMessage[];
}

// Backward-compatible helper for existing callers.
export async function listInboxMessages(token: string, top = 25): Promise<GraphMessage[]> {
  return listRecentMessages(token, "wellKnown:inbox", top);
}

async function searchMessagesWithGraph(
  token: string,
  query: string,
  searchIn: Exclude<SearchIn, "filename" | "pdf">,
  folder: MailFolderTarget,
  top: number,
): Promise<GraphMessage[]> {
  const searchText = buildSearchText(query, searchIn);
  const data = await graphGet<{ value?: unknown[] }>(
    token,
    messagesUrl(folder, {
      $search: `"${searchText}"`,
      $select: MESSAGE_SELECT,
      $top: Math.min(top, PAGE_SIZE),
    }),
  );

  return (data.value ?? []) as GraphMessage[];
}

async function listMessagesWithAttachments(
  token: string,
  folder: MailFolderTarget,
  maxMessages = MAX_ATTACHMENT_SCAN,
): Promise<GraphMessage[]> {
  const messages: GraphMessage[] = [];
  let url: string | undefined = messagesUrl(folder, {
    $select: MESSAGE_SELECT,
    // Do not combine this filter with $orderby. Some Microsoft Graph tenants reject
    // that combination with "InefficientFilter", especially on large mailboxes.
    $filter: "hasAttachments eq true",
    $top: Math.min(PAGE_SIZE, maxMessages),
  });

  while (url && messages.length < maxMessages) {
    const data = await graphGet<{ value?: unknown[]; "@odata.nextLink"?: string }>(token, url);
    messages.push(
      ...(((data.value ?? []) as GraphMessage[]).slice(0, maxMessages - messages.length)),
    );
    url = data["@odata.nextLink"];
  }

  return sortMessagesNewestFirst(messages).slice(0, maxMessages);
}

async function searchByAttachments(
  token: string,
  query: string,
  mode: "filename" | "pdf",
  folder: MailFolderTarget,
  top: number,
): Promise<MessageWithLoadedAttachments[]> {
  const q = cleanQuery(query);
  const messages = await listMessagesWithAttachments(token, folder, MAX_ATTACHMENT_SCAN);
  const matched: MessageWithLoadedAttachments[] = [];

  for (const message of messages) {
    const pdfOnly = mode === "pdf";
    const attachments = await getAttachments(token, message.id, pdfOnly);

    const filteredAttachments = attachments.filter((att) => {
      if (mode === "pdf") {
        if (!isPdfAttachment(att)) return false;
        return !q || attachmentMatchesKeyword(att, q) || messageMatchesKeyword(message, q);
      }

      return !q || attachmentMatchesKeyword(att, q);
    });

    if (filteredAttachments.length > 0) {
      matched.push({
        ...message,
        attachments: filteredAttachments,
        attachmentsExpanded: true,
      });

      if (matched.length >= top) break;
    }
  }

  return matched;
}

export async function searchMessages(
  token: string,
  query: string,
  searchIn: SearchIn,
  folder: MailFolderTarget = "all",
  top = 25,
): Promise<GraphMessage[]> {
  const q = cleanQuery(query);
  const limit = Math.min(top, PAGE_SIZE);

  if (!q && searchIn !== "pdf" && searchIn !== "filename") {
    return listRecentMessages(token, folder, limit);
  }

  if (searchIn === "filename" || searchIn === "pdf") {
    return searchByAttachments(token, q, searchIn, folder, limit);
  }

  const graphMatches = await searchMessagesWithGraph(token, q, searchIn, folder, limit);

  if (searchIn !== "all") {
    return graphMatches;
  }

  const attachmentMatches = await searchByAttachments(token, q, "filename", folder, limit);
  return mergeMessages(graphMatches, attachmentMatches, limit);
}

export async function getAttachments(
  token: string,
  messageId: string,
  pdfOnly = false,
): Promise<GraphAttachment[]> {
  const params = new URLSearchParams({
    $select: ATTACHMENT_SELECT,
    $top: "50",
  });

  const res = await fetch(
    `${GRAPH_BASE}/me/messages/${encodeURIComponent(messageId)}/attachments?${params}`,
    { headers: graphHeaders(token) },
  );

  await checkResponse(res);
  const data = (await res.json()) as { value?: unknown[] };
  let items = (data.value ?? []) as GraphAttachment[];

  if (pdfOnly) {
    items = items.filter(isPdfAttachment);
  }

  return items;
}

export async function downloadAttachment(
  token: string,
  messageId: string,
  attachmentId: string,
): Promise<{ url: string; filename: string; contentType: string }> {
  const params = new URLSearchParams({
    $select: "name,contentType,contentBytes",
  });

  const res = await fetch(
    `${GRAPH_BASE}/me/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachmentId)}?${params}`,
    { headers: graphHeaders(token) },
  );

  await checkResponse(res);
  const data = (await res.json()) as {
    name?: string;
    contentType?: string;
    contentBytes?: string;
  };

  if (!data.contentBytes) {
    throw new Error("Server tidak mengembalikan konten lampiran.");
  }

  const binary = atob(data.contentBytes);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

  const contentType = data.contentType ?? "application/octet-stream";
  const blob = new Blob([bytes], { type: contentType });

  return {
    url: URL.createObjectURL(blob),
    filename: data.name ?? "attachment",
    contentType,
  };
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
