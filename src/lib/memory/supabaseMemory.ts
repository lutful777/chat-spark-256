const MEMORY_CONFIG_KEY = "aiapichat:supabase-memory";

export interface SupabaseMemoryConfig {
  url: string;
  anonKey: string;
  enabled: boolean;
}

export interface AiMemoryItem {
  title: string;
  content: string;
  category?: string;
  tags?: string[];
  priority?: number;
}

export interface RepoIndexMemoryItem {
  path: string;
  summary: string;
  file_type?: string;
  tags?: string[];
  priority?: number;
}

export function loadSupabaseMemoryConfig(): SupabaseMemoryConfig {
  if (typeof localStorage === "undefined") {
    return { url: "", anonKey: "", enabled: false };
  }

  try {
    const raw = localStorage.getItem(MEMORY_CONFIG_KEY);
    if (!raw) return { url: "", anonKey: "", enabled: false };
    const parsed = JSON.parse(raw) as Partial<SupabaseMemoryConfig>;
    return {
      url: parsed.url ?? "",
      anonKey: parsed.anonKey ?? "",
      enabled: !!parsed.enabled,
    };
  } catch {
    return { url: "", anonKey: "", enabled: false };
  }
}

export function saveSupabaseMemoryConfig(config: SupabaseMemoryConfig): void {
  localStorage.setItem(MEMORY_CONFIG_KEY, JSON.stringify(config));
}

function cleanBaseUrl(url: string): string {
  return url.trim().replace(/\/$/, "");
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

  return (await res.json()) as T;
}

export async function fetchAiMemory(limit = 20): Promise<AiMemoryItem[]> {
  const config = loadSupabaseMemoryConfig();
  if (!config.enabled || !config.url || !config.anonKey) return [];

  return supabaseRest<AiMemoryItem[]>(
    config,
    `ai_memory?select=title,content,category,tags,priority&is_active=eq.true&order=priority.desc,updated_at.desc&limit=${limit}`,
  ).catch(() => []);
}

export async function fetchRepoIndexMemory(limit = 40): Promise<RepoIndexMemoryItem[]> {
  const config = loadSupabaseMemoryConfig();
  if (!config.enabled || !config.url || !config.anonKey) return [];

  return supabaseRest<RepoIndexMemoryItem[]>(
    config,
    `repo_index?select=path,summary,file_type,tags,priority&is_active=eq.true&order=priority.desc,updated_at.desc&limit=${limit}`,
  ).catch(() => []);
}

export async function buildAiMemoryContext(): Promise<string> {
  const [memory, repoIndex] = await Promise.all([fetchAiMemory(), fetchRepoIndexMemory()]);
  if (memory.length === 0 && repoIndex.length === 0) return "";

  const memoryText = memory
    .map((item) => `- ${item.title}: ${item.content}`)
    .join("\n");

  const repoText = repoIndex
    .map((item) => `- ${item.path}: ${item.summary}`)
    .join("\n");

  return [
    "AI APP MEMORY FROM SUPABASE:",
    memoryText ? `General memory:\n${memoryText}` : "",
    repoText ? `Repo index memory:\n${repoText}` : "",
    "Important privacy rule: never store or reveal user API keys, provider settings, or chat history in Supabase memory.",
  ]
    .filter(Boolean)
    .join("\n\n");
}

export async function testSupabaseMemoryConnection(config: SupabaseMemoryConfig): Promise<number> {
  const rows = await supabaseRest<Array<{ id?: string }>>(
    config,
    "ai_memory?select=id&is_active=eq.true&limit=1",
  );
  return rows.length;
}
