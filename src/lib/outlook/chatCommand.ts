import { getAccessToken, loadOutlookConfig } from "@/lib/outlook/msal";
import {
  listMailFolders,
  searchMessages,
  type GraphMailFolder,
  type GraphMessage,
  type MailFolderTarget,
  type SearchIn,
} from "@/lib/outlook/graph";

interface ParsedOutlookCommand {
  folder: MailFolderTarget;
  searchIn: SearchIn;
  query: string;
  limit: number;
}

const MAIL_WORDS = [
  "email",
  "e-mail",
  "mail",
  "outlook",
  "inbox",
  "sent",
  "terkirim",
  "junk",
  "spam",
  "draft",
  "archive",
  "arsip",
  "folder",
  "pdf",
  "lampiran",
  "attachment",
];

const ACTION_WORDS = [
  "cek",
  "check",
  "cari",
  "search",
  "find",
  "lihat",
  "tampilkan",
  "buka",
  "recent",
  "terbaru",
  "terakhir",
];

function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

function hasAny(text: string, words: string[]): boolean {
  return words.some((word) => text.includes(word));
}

export function isOutlookMailCommand(text: string): boolean {
  const lower = normalize(text);
  return hasAny(lower, MAIL_WORDS) && hasAny(lower, ACTION_WORDS);
}

function detectBuiltInFolder(lower: string): MailFolderTarget {
  if (lower.includes("semua folder") || lower.includes("all mail") || lower.includes("all email")) {
    return "all";
  }
  if (lower.includes("sent") || lower.includes("terkirim")) return "wellKnown:sentitems";
  if (lower.includes("junk") || lower.includes("spam")) return "wellKnown:junkemail";
  if (lower.includes("draft")) return "wellKnown:drafts";
  if (lower.includes("archive") || lower.includes("arsip")) return "wellKnown:archive";
  if (lower.includes("deleted") || lower.includes("trash") || lower.includes("sampah")) {
    return "wellKnown:deleteditems";
  }
  if (lower.includes("inbox") || lower.includes("kotak masuk")) return "wellKnown:inbox";
  return "all";
}

function detectSearchIn(lower: string): SearchIn {
  if (lower.includes("pdf")) return "pdf";
  if (lower.includes("lampiran") || lower.includes("attachment") || lower.includes("file")) {
    return "filename";
  }
  if (lower.includes("subjek") || lower.includes("subject")) return "subject";
  if (lower.includes("pengirim") || /\bfrom\b/.test(lower)) return "from";
  if (lower.includes("isi email") || lower.includes("body")) return "body";
  return "all";
}

function stripCommandWords(text: string): string {
  let q = text;
  q = q.replace(/\b(cek|check|cari|search|find|lihat|tampilkan|buka)\b/gi, " ");
  q = q.replace(/\b(email|e-mail|mail|outlook|pesan|message|folder)\b/gi, " ");
  q = q.replace(/\b(inbox|kotak masuk|sent items|sent|terkirim|junk email|junk|spam|drafts?|archive|arsip|deleted items|deleted|trash|sampah)\b/gi, " ");
  q = q.replace(/\b(recent|terbaru|terakhir|latest|last|semua folder|all mail|all email)\b/gi, " ");
  q = q.replace(/\b(di|dari|from|yang|dengan|kata|keyword|subjek|subject|pengirim|isi|body|file|lampiran|attachment|pdf)\b/gi, " ");
  return q.replace(/[^\p{L}\p{N}@._-]+/gu, " ").replace(/\s+/g, " ").trim();
}

function extractQuery(originalText: string, lower: string): string {
  if (lower.includes("recent") || lower.includes("terbaru") || lower.includes("terakhir")) {
    return "";
  }

  const quoted = originalText.match(/["“”']([^"“”']+)["“”']/);
  if (quoted?.[1]?.trim()) return quoted[1].trim();

  const afterFrom = originalText.match(/(?:dari|from|pengirim)\s+(.+)$/i)?.[1]?.trim();
  if (afterFrom) return stripCommandWords(afterFrom);

  const afterKeyword = originalText.match(/(?:keyword|kata kunci|tentang)\s+(.+)$/i)?.[1]?.trim();
  if (afterKeyword) return stripCommandWords(afterKeyword);

  return stripCommandWords(originalText);
}

function pickCustomFolder(
  lower: string,
  folders: GraphMailFolder[],
  fallback: MailFolderTarget,
): MailFolderTarget {
  if (fallback !== "all") return fallback;

  const match = folders.find((folder) => {
    const name = normalize(folder.displayName ?? "");
    const path = normalize(folder.path ?? "");
    return Boolean(name && lower.includes(name)) || Boolean(path && lower.includes(path));
  });

  return match?.id ?? fallback;
}

function folderLabel(folder: MailFolderTarget, folders: GraphMailFolder[]): string {
  const labels: Record<string, string> = {
    all: "All Mail / semua folder",
    "wellKnown:inbox": "Inbox",
    "wellKnown:sentitems": "Sent Items",
    "wellKnown:junkemail": "Junk Email",
    "wellKnown:drafts": "Drafts",
    "wellKnown:archive": "Archive",
    "wellKnown:deleteditems": "Deleted Items",
  };
  if (labels[folder]) return labels[folder];
  const found = folders.find((f) => f.id === folder);
  return found?.path ?? found?.displayName ?? folder;
}

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

function messageDate(message: GraphMessage): string {
  return message.receivedDateTime || message.sentDateTime || "";
}

function formatMessage(message: GraphMessage, index: number): string {
  const from = message.from?.emailAddress;
  const sender = from?.name || from?.address || "Unknown sender";
  const date = formatDate(messageDate(message));
  const preview = message.bodyPreview ? `\n   ${message.bodyPreview.slice(0, 220)}` : "";
  const link = message.webLink ? `\n   [Buka di Outlook](${message.webLink})` : "";
  return `${index + 1}. **${message.subject || "(Tanpa Subjek)"}**\n   Dari: ${sender}\n   Tanggal: ${date}${preview}${link}`;
}

function parseCommand(text: string, folders: GraphMailFolder[]): ParsedOutlookCommand {
  const lower = normalize(text);
  const builtInFolder = detectBuiltInFolder(lower);
  const folder = pickCustomFolder(lower, folders, builtInFolder);
  const searchIn = detectSearchIn(lower);
  const query = extractQuery(text, lower);

  return {
    folder,
    searchIn,
    query,
    limit: 25,
  };
}

export async function runOutlookMailCommand(text: string): Promise<string | null> {
  if (!isOutlookMailCommand(text)) return null;

  const config = loadOutlookConfig();
  if (!config.clientId.trim()) {
    return "Outlook belum dikonfigurasi. Buka **Settings → Microsoft Outlook**, isi Microsoft Client ID, lalu klik **Connect Outlook**.";
  }

  const token = await getAccessToken(config);
  const folders = await listMailFolders(token).catch(() => [] as GraphMailFolder[]);
  const parsed = parseCommand(text, folders);
  const messages = await searchMessages(
    token,
    parsed.query,
    parsed.searchIn,
    parsed.folder,
    parsed.limit,
  );

  const label = folderLabel(parsed.folder, folders);
  const queryLabel = parsed.query ? `"${parsed.query}"` : "email terbaru";
  const fieldLabel =
    parsed.searchIn === "pdf"
      ? "PDF/lampiran PDF"
      : parsed.searchIn === "filename"
        ? "nama file/lampiran"
        : parsed.searchIn === "all"
          ? "semua bidang"
          : parsed.searchIn;

  if (messages.length === 0) {
    return `Saya sudah cek Outlook. Tidak ada email yang cocok.\n\nFolder: **${label}**\nPencarian: **${queryLabel}**\nMode: **${fieldLabel}**`;
  }

  return [
    `Saya menemukan **${messages.length} email** di Outlook.`,
    `Folder: **${label}**`,
    `Pencarian: **${queryLabel}**`,
    `Mode: **${fieldLabel}**`,
    "",
    ...messages.map(formatMessage),
  ].join("\n");
}
