const MEMORY_CONFIG_KEY = "aiapichat:supabase-memory";
const AUTO_MEMORY_LAST_KEY = "aiapichat:supabase-memory:last-auto-save";
const DEFAULT_SUPABASE_URL = "https://qxzkjnpbavbmolzomrwy.supabase.co";

export interface SupabaseMemoryConfig {
  url: string;
  anonKey: string;
  enabled: boolean;
}

export interface AiMemoryItem {
  title: string;
  content: string;
  category?: string;
}

export interface RepoIndexMemoryItem {
  path: string;
  summary: string;
  file_type?: string;
}

export function loadSupabaseMemoryConfig(): SupabaseMemoryConfig {
  if (typeof localStorage === "undefined") {
    return { url: DEFAULT_SUPABASE_URL, anonKey: "", enabled: false };
  }

  try {
    const raw = localStorage.getItem(MEMORY_CONFIG_KEY);
    if (!raw) return { url: DEFAULT_SUPABASE_URL, anonKey: "", enabled: false };
    const parsed = JSON.parse(raw) as Partial<SupabaseMemoryConfig>;
    return {
      url: parsed.url || DEFAULT_SUPABASE_URL,
      anonKey: parsed.anonKey ?? "",
      enabled: !!parsed.enabled,
    };
  } catch {
    return { url: DEFAULT_SUPABASE_URL, anonKey: "", enabled: false };
  }
}

export function saveSupabaseMemoryConfig(config: SupabaseMemoryConfig): void {
  localStorage.setItem(
    MEMORY_CONFIG_KEY,
    JSON.stringify({ ...config, url: config.url || DEFAULT_SUPABASE_URL }),
  );
}

function cleanBaseUrl(url: string): string {
  return (url || DEFAULT_SUPABASE_URL).trim().replace(/\/$/, "");
}

async function supabaseRest<T>(
  config: SupabaseMemoryConfig,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const url = cleanBaseUrl(config.url);
  const key = config.anonKey.trim();
  if (!config.enabled || !url || !key) throw new Error("Supabase AI Memory belum aktif.");

  const res = await fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Supabase ${res.status}: ${body || res.statusText}`);
  }

  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T;
}

async function supabaseInsert(config: SupabaseMemoryConfig, path: string, body: unknown): Promise<void> {
  await supabaseRest<null>(config, path, {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify(body),
  });
}

export async function fetchAiMemory(limit = 80): Promise<AiMemoryItem[]> {
  const config = loadSupabaseMemoryConfig();
  if (!config.enabled || !config.url || !config.anonKey) return [];

  return supabaseRest<AiMemoryItem[]>(
    config,
    `ai_memory?select=title,content,category&order=created_at.desc&limit=${limit}`,
  ).catch(() => []);
}

export async function fetchRepoIndexMemory(limit = 80): Promise<RepoIndexMemoryItem[]> {
  const config = loadSupabaseMemoryConfig();
  if (!config.enabled || !config.url || !config.anonKey) return [];

  return supabaseRest<RepoIndexMemoryItem[]>(
    config,
    `repo_index?select=path,summary,file_type&order=created_at.desc&limit=${limit}`,
  ).catch(() => []);
}

function words(text: string): string[] {
  return cleanMemoryText(text)
    .toLowerCase()
    .split(/[^a-z0-9_.-]+/i)
    .filter((word) => word.length >= 3)
    .slice(0, 40);
}

function scoreText(text: string, query: string): number {
  const q = words(query);
  if (q.length === 0) return 1;
  const haystack = cleanMemoryText(text).toLowerCase();
  let score = 0;
  for (const word of q) {
    if (haystack.includes(word)) score += word.length >= 6 ? 3 : 1;
  }
  return score;
}

function rankMemory<T>(items: T[], query: string, textOf: (item: T) => string, limit: number): T[] {
  return items
    .map((item, index) => ({ item, index, score: scoreText(textOf(item), query) }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .filter((row, index) => row.score > 0 || index < Math.min(8, limit))
    .slice(0, limit)
    .map((row) => row.item);
}

export async function buildAiMemoryContext(query = ""): Promise<string> {
  const [memoryRaw, repoRaw] = await Promise.all([fetchAiMemory(), fetchRepoIndexMemory()]);
  const memory = rankMemory(memoryRaw, query, (item) => `${item.title} ${item.category ?? ""} ${item.content}`, 16);
  const repoIndex = rankMemory(repoRaw, query, (item) => `${item.path} ${item.file_type ?? ""} ${item.summary}`, 24);
  if (memory.length === 0 && repoIndex.length === 0) return "";

  const memoryText = memory
    .map((item) => `- ${item.title}: ${item.content}`)
    .join("\n");

  const repoText = repoIndex
    .map((item) => `- ${item.path}: ${item.summary}`)
    .join("\n");

  return [
    "AI APP MEMORY FROM SUPABASE:",
    query ? `Memory search query: ${cleanMemoryText(query).slice(0, 240)}` : "",
    memoryText ? `Most relevant general memory:\n${memoryText}` : "",
    repoText ? `Most relevant repo index memory:\n${repoText}` : "",
    "Important privacy rule: never store or reveal user API keys, provider settings, or chat history in Supabase memory.",
  ]
    .filter(Boolean)
    .join("\n\n");
}

export async function testSupabaseMemoryConnection(config: SupabaseMemoryConfig): Promise<number> {
  const rows = await supabaseRest<Array<{ id?: string }>>(
    config,
    "ai_memory?select=id&limit=1",
  );
  return rows.length;
}

function cleanMemoryText(text: string): string {
  return text
    .replace(/^\[(GITHUB|REALTIME)\]\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function containsSensitiveValue(text: string): boolean {
  const lower = text.toLowerCase();
  return (
    lower.includes("sb_secret_") ||
    lower.includes("service_role") ||
    lower.includes("api key") ||
    lower.includes("apikey") ||
    lower.includes("secret key") ||
    lower.includes("password") ||
    /\b(sk-|ghp_|github_pat_|xai-|or-)[a-z0-9_\-]{12,}/i.test(text)
  );
}

function isImportantForProject(text: string): boolean {
  const lower = text.toLowerCase();
  return [
    "github",
    "supabase",
    "lovable",
    "settings",
    "setting",
    "tombol",
    "error",
    "bug",
    "build",
    "deploy",
    "memory",
    "memori",
    "outlook",
    "real time",
    "realtime",
    "aplikasi",
    "web app",
    "provider",
    "model",
  ].some((word) => lower.includes(word));
}

export async function saveAiMemoryNote(title: string, content: string, category = "auto"): Promise<void> {
  const config = loadSupabaseMemoryConfig();
  if (!config.enabled || !config.url || !config.anonKey) return;

  const safeTitle = cleanMemoryText(title).slice(0, 120);
  const safeContent = cleanMemoryText(content).slice(0, 1800);
  if (!safeTitle || !safeContent) return;
  if (containsSensitiveValue(`${safeTitle}\n${safeContent}`)) return;

  await supabaseInsert(config, "ai_memory", {
    title: safeTitle,
    content: safeContent,
    category,
    tags: ["auto", "chat"],
    priority: 20,
    is_active: true,
  });
}

export async function autoSaveImportantMemory(userText: string, assistantText: string): Promise<void> {
  try {
    const cleanUser = cleanMemoryText(userText);
    const cleanAssistant = cleanMemoryText(assistantText);
    if (!cleanUser || !cleanAssistant) return;
    if (!isImportantForProject(`${cleanUser}\n${cleanAssistant}`)) return;
    if (containsSensitiveValue(`${cleanUser}\n${cleanAssistant}`)) return;

    const title = `Auto: ${cleanUser.slice(0, 90)}`;
    const content = [
      `User request: ${cleanUser.slice(0, 300)}`,
      `Assistant result: ${cleanAssistant.slice(0, 700)}`,
    ].join("\n");

    const marker = `${title}\n${content}`;
    if (typeof localStorage !== "undefined") {
      if (localStorage.getItem(AUTO_MEMORY_LAST_KEY) === marker) return;
      localStorage.setItem(AUTO_MEMORY_LAST_KEY, marker);
    }

    await saveAiMemoryNote(title, content, "auto");
  } catch {
    // Memory saving must never break chat.
  }
}
