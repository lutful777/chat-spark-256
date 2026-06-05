import type { ChatMessage } from "./types";

export const SUMMARY_TRIGGER_MESSAGES = 30;
export const RECENT_MESSAGES_TO_KEEP = 18;

function cleanText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function messagePreview(message: ChatMessage, max = 260): string {
  const text = cleanText(message.content);
  if (!text) return "";
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function roleLabel(role: ChatMessage["role"]): string {
  if (role === "user") return "User";
  if (role === "assistant") return "Assistant";
  return "System";
}

function importantMessages(messages: ChatMessage[]): ChatMessage[] {
  return messages.filter((message) => !message.error && cleanText(message.content).length > 0);
}

export function shouldCompactConversation(messages: ChatMessage[]): boolean {
  return importantMessages(messages).length >= SUMMARY_TRIGGER_MESSAGES;
}

export function buildConversationSummary(messages: ChatMessage[]): string {
  const valid = importantMessages(messages);
  if (valid.length === 0) return "";

  const firstUser = valid.find((message) => message.role === "user");
  const userTopics = valid
    .filter((message) => message.role === "user")
    .slice(-8)
    .map((message) => `- ${messagePreview(message, 180)}`)
    .filter(Boolean);
  const assistantDecisions = valid
    .filter((message) => message.role === "assistant")
    .slice(-6)
    .map((message) => `- ${messagePreview(message, 180)}`)
    .filter(Boolean);

  const lines = [
    "Ringkasan percakapan lama untuk menjaga konteks tanpa mengirim seluruh chat:",
    firstUser ? `Topik awal: ${messagePreview(firstUser, 220)}` : "Topik awal: tidak tersedia.",
  ];

  if (userTopics.length) {
    lines.push("Permintaan user yang penting:", ...userTopics);
  }
  if (assistantDecisions.length) {
    lines.push("Jawaban/keputusan terakhir yang relevan:", ...assistantDecisions);
  }

  return lines.join("\n").slice(0, 3600);
}

export function compactConversationMessages(messages: ChatMessage[]): ChatMessage[] {
  if (!shouldCompactConversation(messages)) return messages;

  const olderMessages = messages.slice(0, Math.max(0, messages.length - RECENT_MESSAGES_TO_KEEP));
  const recentMessages = messages.slice(-RECENT_MESSAGES_TO_KEEP);
  const summary = buildConversationSummary(olderMessages);

  if (!summary) return messages;

  return [
    {
      id: "conversation-summary",
      role: "system",
      content: `${summary}\n\nInstruksi: gunakan ringkasan ini sebagai konteks. Prioritaskan pesan terbaru jika ada konflik. Jangan sebutkan ringkasan kecuali user bertanya.`,
      createdAt: Date.now(),
    },
    ...recentMessages,
  ];
}

export function getConversationSummaryStatus(messages: ChatMessage[]) {
  const validCount = importantMessages(messages).length;
  return {
    enabled: validCount >= SUMMARY_TRIGGER_MESSAGES,
    totalMessages: validCount,
    recentMessagesKept: RECENT_MESSAGES_TO_KEEP,
    summarizedMessages: Math.max(0, validCount - RECENT_MESSAGES_TO_KEEP),
  };
}
