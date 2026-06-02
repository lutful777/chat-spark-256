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
  /** Base64-encoded content — only present when explicitly requested. */
  contentBytes?: string;
}

/** Which field the KQL query targets. */
export type SearchIn = "all" | "subject" | "from" | "body" | "filename" | "pdf";

function buildKql(query: string, searchIn: SearchIn): string {
  const q = query.trim();
  switch (searchIn) {
    case "subject":
      return `subject:${q}`;
    case "from":
      return `from:${q}`;
    case "body":
      return `body:${q}`;
    case "filename":
      return `filename:${q}`;
    case "pdf":
      // Search for emails with PDF attachments; optional keyword to narrow.
      return q ? `filename:.pdf ${q}` : `filename:.pdf`;
    default:
      return q;
  }
}

function graphHeaders(token: string, extra?: Record<string, string>): Headers {
  const h = new Headers({
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    // Required for $search on mailbox resources.
    ConsistencyLevel: "eventual",
    ...extra,
  });
  return h;
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

/**
 * Search inbox messages via KQL.
 * Returns up to `top` messages (max 25 with $search due to Graph limits).
 */
export async function searchMessages(
  token: string,
  query: string,
  searchIn: SearchIn,
  top = 25,
): Promise<GraphMessage[]> {
  const kql = buildKql(query.trim(), searchIn);
  const params = new URLSearchParams({
    $search: `"${kql}"`,
    $select: "id,subject,bodyPreview,receivedDateTime,hasAttachments,from,webLink",
    $top: String(Math.min(top, 50)),
  });
  const res = await fetch(
    `https://graph.microsoft.com/v1.0/me/messages?${params}`,
    { headers: graphHeaders(token) },
  );
  await checkResponse(res);
  const data = (await res.json()) as { value?: unknown[] };
  return (data.value ?? []) as GraphMessage[];
}

/**
 * List attachments for a message.
 * Pass `pdfOnly=true` to filter client-side to PDF files.
 */
export async function getAttachments(
  token: string,
  messageId: string,
  pdfOnly = false,
): Promise<GraphAttachment[]> {
  const params = new URLSearchParams({
    $select: "id,name,contentType,size",
    $top: "50",
  });
  const res = await fetch(
    `https://graph.microsoft.com/v1.0/me/messages/${encodeURIComponent(messageId)}/attachments?${params}`,
    { headers: graphHeaders(token) },
  );
  await checkResponse(res);
  const data = (await res.json()) as { value?: unknown[] };
  let items = (data.value ?? []) as GraphAttachment[];
  if (pdfOnly) {
    items = items.filter(
      (a) =>
        a.contentType === "application/pdf" ||
        a.name?.toLowerCase().endsWith(".pdf"),
    );
  }
  return items;
}

/**
 * Download a single attachment (fetches contentBytes, returns a Blob URL + filename).
 * Caller is responsible for revoking the object URL when done.
 */
export async function downloadAttachment(
  token: string,
  messageId: string,
  attachmentId: string,
): Promise<{ url: string; filename: string; contentType: string }> {
  const params = new URLSearchParams({
    $select: "name,contentType,contentBytes",
  });
  const res = await fetch(
    `https://graph.microsoft.com/v1.0/me/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachmentId)}?${params}`,
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

  // Decode base64 → Blob.
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

/** Format bytes to human-readable string. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
