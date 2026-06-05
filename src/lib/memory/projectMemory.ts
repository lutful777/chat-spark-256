export interface ProjectMemoryItem {
  title: string;
  content: string;
  category: string;
  updatedAt: number;
}

const PROJECT_MEMORY_KEY = "aiapichat:project-memory";
const MAX_PROJECT_MEMORY_ITEMS = 40;

const DEFAULT_PROJECT_MEMORY: ProjectMemoryItem[] = [
  {
    title: "Project: AI Chat + APK WebView",
    category: "project_context",
    content:
      "User sedang mengembangkan aplikasi AI Chat berbasis web dan APK Android WebView. Website utama: https://chat-spark-256.vercel.app. Repo utama: lutful777/chat-spark-256. APK biasanya hanya WebView yang membuka website, jadi update fitur web biasanya cukup tunggu Vercel deploy tanpa install APK baru.",
    updatedAt: 0,
  },
  {
    title: "User preference: simple Indonesian steps",
    category: "user_preference",
    content:
      "User lebih suka jawaban bahasa Indonesia yang singkat, jelas, step-by-step, dan sering meminta prompt siap copy-paste. User tidak nyaman coding manual, jadi instruksi harus praktis untuk Android, GitHub, Replit, Vercel, dan APK.",
    updatedAt: 0,
  },
  {
    title: "API usage preference: save tokens",
    category: "api_usage",
    content:
      "User memakai x.ai API dan ingin hemat pemakaian API. Thinking dan Think Deeply jangan otomatis. Real Time Search boleh otomatis hanya untuk pertanyaan data terbaru saat mode Plain/normal.",
    updatedAt: 0,
  },
  {
    title: "Qdrant Memory status and error note",
    category: "troubleshooting",
    content:
      "Qdrant cluster user sudah dibuat di region Australia/Sydney. Halaman Qdrant Memory ada di /qdrant-memory. Error awal: tidak bisa menghubungi Qdrant karena request langsung dari browser terkena CORS. Solusi sudah ditambahkan lewat Vercel proxy /api/public/qdrant-memory, lalu frontend Qdrant diarahkan memakai proxy. Settings juga diberi tombol Buka Qdrant Memory sebelum Real Time Search. Jika masih error, tunggu Vercel deploy selesai, buka ulang APK/browser, cek endpoint Qdrant, dan pastikan API key Qdrant murni tanpa awalan Bearer. Jangan simpan atau tampilkan API key ke chat/GitHub.",
    updatedAt: 0,
  },
];

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

function cleanText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function containsSensitiveValue(text: string): boolean {
  const lower = text.toLowerCase();
  return (
    lower.includes("api key") ||
    lower.includes("apikey") ||
    lower.includes("secret") ||
    lower.includes("password") ||
    lower.includes("token") ||
    lower.includes("refresh_token") ||
    lower.includes("access_token") ||
    lower.includes("authorization:") ||
    lower.includes("bearer ") ||
    /\b(sk-|ghp_|github_pat_|xai-|or-|sb_secret_)[a-z0-9_\-]{10,}/i.test(text)
  );
}

function containsLargeOrMedia(text: string): boolean {
  const lower = text.toLowerCase();
  return (
    text.length > 2400 ||
    lower.includes("data:image") ||
    lower.includes("data:video") ||
    lower.includes("base64,") ||
    lower.includes("blob:")
  );
}

function readProjectMemory(): ProjectMemoryItem[] {
  if (!isBrowser()) return DEFAULT_PROJECT_MEMORY;
  try {
    const raw = localStorage.getItem(PROJECT_MEMORY_KEY);
    if (!raw) return DEFAULT_PROJECT_MEMORY;
    const parsed = JSON.parse(raw) as ProjectMemoryItem[];
    if (!Array.isArray(parsed)) return DEFAULT_PROJECT_MEMORY;
    return [...DEFAULT_PROJECT_MEMORY, ...parsed]
      .filter((item) => item.title && item.content)
      .slice(0, MAX_PROJECT_MEMORY_ITEMS + DEFAULT_PROJECT_MEMORY.length);
  } catch {
    return DEFAULT_PROJECT_MEMORY;
  }
}

function writeProjectMemory(items: ProjectMemoryItem[]): void {
  if (!isBrowser()) return;
  const defaults = new Set(DEFAULT_PROJECT_MEMORY.map((item) => item.title));
  const customOnly = items.filter((item) => !defaults.has(item.title)).slice(0, MAX_PROJECT_MEMORY_ITEMS);
  localStorage.setItem(PROJECT_MEMORY_KEY, JSON.stringify(customOnly));
}

function score(item: ProjectMemoryItem, query: string): number {
  const q = cleanText(query).toLowerCase();
  if (!q) return 1;
  const haystack = `${item.title} ${item.category} ${item.content}`.toLowerCase();
  const words = q.split(/[^a-z0-9_.-]+/i).filter((word) => word.length >= 3).slice(0, 30);
  let total = 0;
  for (const word of words) {
    if (haystack.includes(word)) total += word.length >= 6 ? 3 : 1;
  }
  return total;
}

function categoryFor(text: string): string {
  const lower = text.toLowerCase();
  if (["jangan", "lebih suka", "singkat", "copas", "prompt", "hemat"].some((word) => lower.includes(word))) return "user_preference";
  if (["github", "repo", "commit", "push", "vercel", "deploy", "apk", "webview"].some((word) => lower.includes(word))) return "project_workflow";
  if (["realtime", "real time", "serper", "thinking", "summary", "memory", "mode", "qdrant"].some((word) => lower.includes(word))) return "app_feature";
  if (["error", "bug", "gagal", "tidak bisa", "crash"].some((word) => lower.includes(word))) return "troubleshooting";
  return "project_note";
}

function isWorthRemembering(text: string): boolean {
  const lower = text.toLowerCase();
  return [
    "github",
    "repo",
    "vercel",
    "apk",
    "webview",
    "replit",
    "x.ai",
    "xai",
    "serper",
    "qdrant",
    "realtime",
    "real time",
    "thinking",
    "summary",
    "memory",
    "error handling",
    "mode router",
    "hemat api",
    "jangan otomatis",
    "lebih suka",
    "prompt",
    "copas",
  ].some((word) => lower.includes(word));
}

export function saveProjectMemoryNote(title: string, content: string, category = "project_note"): void {
  const safeTitle = cleanText(title).slice(0, 120);
  const safeContent = cleanText(content).slice(0, 900);
  if (!safeTitle || !safeContent) return;
  if (containsSensitiveValue(`${safeTitle}\n${safeContent}`) || containsLargeOrMedia(`${safeTitle}\n${safeContent}`)) return;

  const existing = readProjectMemory();
  const withoutSameTitle = existing.filter((item) => item.title.toLowerCase() !== safeTitle.toLowerCase());
  const next: ProjectMemoryItem[] = [
    { title: safeTitle, content: safeContent, category, updatedAt: Date.now() },
    ...withoutSameTitle,
  ].slice(0, MAX_PROJECT_MEMORY_ITEMS + DEFAULT_PROJECT_MEMORY.length);
  writeProjectMemory(next);
}

export function autoSaveProjectMemory(userText: string, assistantText: string): void {
  const cleanUser = cleanText(userText);
  const cleanAssistant = cleanText(assistantText);
  const combined = `${cleanUser}\n${cleanAssistant}`;
  if (!cleanUser || !cleanAssistant) return;
  if (!isWorthRemembering(combined)) return;
  if (containsSensitiveValue(combined) || containsLargeOrMedia(combined)) return;

  const category = categoryFor(combined);
  const title = `${category}: ${cleanUser.slice(0, 80)}`;
  const content = [`User: ${cleanUser.slice(0, 260)}`, `Decision/result: ${cleanAssistant.slice(0, 520)}`].join("\n");
  saveProjectMemoryNote(title, content, category);
}

export function buildProjectMemoryContext(query = ""): string {
  const items = readProjectMemory()
    .map((item, index) => ({ item, index, score: score(item, query) }))
    .sort((a, b) => b.score - a.score || b.item.updatedAt - a.item.updatedAt || a.index - b.index)
    .filter((row, index) => row.score > 0 || index < 8)
    .slice(0, 16)
    .map((row) => row.item);

  if (items.length === 0) return "";

  return [
    "LOCAL PROJECT MEMORY:",
    ...items.map((item) => `- ${item.title}: ${item.content}`),
    "Privacy rule: this memory must never include API keys, passwords, tokens, OAuth sessions, full chat history, or uploaded files.",
  ].join("\n");
}

export function clearProjectMemory(): void {
  if (!isBrowser()) return;
  localStorage.removeItem(PROJECT_MEMORY_KEY);
}
