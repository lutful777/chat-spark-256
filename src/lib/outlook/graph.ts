/**
 * Microsoft Graph API helpers for Outlook mail search.
 * All calls are made client-side with a delegated Bearer token from MSAL.
 */

export interface GraphMessage {
  id: string;
  subject: string | null;
  bodyPreview: string | null;
  receivedDateTime: string;
  hasAttachments: boolean;
  from: {
    emailAddress: { name: string; address: string };
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

type MessageWithLoadedAttachments = GraphMessage & {
  attachments?: GraphAttachment[];
  attachmentsExpanded?: boolean;
};

export type SearchIn = "all" | "subject" | "from" | "body" | "filename" | "pdf";

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";
const MESSAGE_SELECT = "id,subject,bodyPreview,receivedDateTime,hasAttachments,from,webLink";
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

function inboxMessagesUrl(params: Record<string, string | number>): string {
  const sp = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => sp.set(key, String(value)));
  return `${GRAPH_BASE}/me/mailFolders/inbox/messages?${sp}`;
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

  return Array.from(map.values())
    .sort(
      (a, b) =>
        new Date(b.receivedDateTime).getTime() -
        new Date(a.receivedDateTime).getTime(),
    )
    .slice(0, top);
}

export async function listInboxMessages(token: string, top = 25): Promise<GraphMessage[]> {
  const url = inboxMessagesUrl({
    $select: MESSAGE_SELECT,
    $orderby: "receivedDateTime desc",
    $top: Math.min(top, PAGE_SIZE),
  });

  const data = await graphGet<{ value?: unknown[] }>(token, url);
  return (data.value ?? []) as GraphMessage[];
}

async function searchInboxMessagesWithGraph(
  token: string,
  query: string,
  searchIn: Exclude<SearchIn, "filename" | "pdf">,
  top: number,
): Promise<GraphMessage[]> {
  const searchText = buildSearchText(query, searchIn);
  const url = inboxMessagesUrl({
    $search: `"${searchText}"`,
    $select: MESSAGE_SELECT,
    $top: Math.min(top, PAGE_SIZE),
  });

  const data = await graphGet<{ value?: unknown[] }>(token, url);
  return (data.value ?? []) as GraphMessage[];
}

async function listInboxMessagesWithAttachments(
  token: string,
  maxMessages = MAX_ATTACHMENT_SCAN,
): Promise<GraphMessage[]> {
  const messages: GraphMessage[] = [];
  let url: string | undefined = inboxMessagesUrl({
    $select: MESSAGE_SELECT,
    $filter: "hasAttachments eq true",
    $orderby: "receivedDateTime desc",
    $top: Math.min(PAGE_SIZE, maxMessages),
  });

  while (url && messages.length < maxMessages) {
    const data = await graphGet<{ value?: unknown[]; "@odata.nextLink"?: string }>(
      token,
      url,
    );
    messages.push(
      ...(((data.value ?? []) as GraphMessage[]).slice(
        0,
        maxMessages - messages.length,
      )),
    );
    url = data["@odata.nextLink"];
  }

  return messages;
}

async function searchInboxByAttachments(
  token: string,
  query: string,
  mode: "filename" | "pdf",
  top: number,
): Promise<MessageWithLoadedAttachments[]> {
  const q = cleanQuery(query);
  const messages = await listInboxMessagesWithAttachments(token, MAX_ATTACHMENT_SCAN);
  const matched: MessageWithLoadedAttachments[] = [];

  for (const message of messages) {
    const pdfOnly = mode === "pdf";
    const attachments = await getAttachments(token, message.id, pdfOnly);

    const filteredAttachments = attachments.filter((att) => {
      if (mode === "pdf") {
        if (!isPdfAttachment(att)) return false;
        return !q || attachmentMatchesKeyword(att, q) || messageMatchesKeyword(message, q);
      }

      return attachmentMatchesKeyword(att, q);
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
  top = 25,
): Promise<GraphMessage[]> {
  const q = cleanQuery(query);
  const limit = Math.min(top, PAGE_SIZE);

  if (!q && searchIn !== "pdf") {
    return listInboxMessages(token, limit);
  }

  if (searchIn === "filename" || searchIn === "pdf") {
    return searchInboxByAttachments(token, q, searchIn, limit);
  }

  const graphMatches = await searchInboxMessagesWithGraph(token, q, searchIn, limit);

  if (searchIn !== "all") {
    return graphMatches;
  }

  const attachmentMatches = await searchInboxByAttachments(token, q, "filename", limit);
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
