const MEMORY_CONFIG_KEY = "aiapichat:supabase-memory";
const AUTH_SESSION_KEY = "aiapichat:supabase-auth-session";
const AUTO_MEMORY_LAST_KEY = "aiapichat:supabase-memory:last-auto-save";
const AUTO_MEMORY_SEEN_KEY = "aiapichat:supabase-memory:seen-auto-save";
const DEFAULT_SUPABASE_URL = "https://qxzkjnpbavbmolzomrwy.supabase.co";

export interface SupabaseMemoryConfig {
  url: string;
  anonKey: string;
  enabled: boolean;
}

export interface SupabaseAuthUser {
  id: string;
  email?: string;
}

export interface SupabaseAuthSession {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  user: SupabaseAuthUser;
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

interface SupabaseAuthResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  expires_at?: number;
  user?: SupabaseAuthUser;
}

interface AutoMemoryDecision {
  shouldSave: boolean;
  title: string;
  content: string;
  category: string;
  priority: number;
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

export function loadSupabaseAuthSession(): SupabaseAuthSession | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(AUTH_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SupabaseAuthSession>;
    if (!parsed.accessToken || !parsed.user?.id) return null;
    return {
      accessToken: parsed.accessToken,
      refreshToken: parsed.refreshToken ?? "",
      expiresAt: Number(parsed.expiresAt || 0),
      user: { id: parsed.user.id, email: parsed.user.email },
    };
  } catch {
    return null;
  }
}

function saveSupabaseAuthSession(session: SupabaseAuthSession): void {
  localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(session));
}

export function clearSupabaseAuthSession(): void {
  if (typeof localStorage === "undefined") return;
  localStorage.removeItem(AUTH_SESSION_KEY);
}

function cleanBaseUrl(url: string): string {
  return (url || DEFAULT_SUPABASE_URL).trim().replace(/\/$/, "");
}

function getSupabaseAuthUrl(config: SupabaseMemoryConfig, path: string): string {
  return `${cleanBaseUrl(config.url)}/auth/v1/${path}`;
}

function requireSupabaseKey(config: SupabaseMemoryConfig): string {
  const key = config.anonKey.trim();
  if (!config.enabled || !key) throw new Error("Aktifkan Supabase Memory dan isi publishable key dulu.");
  return key;
}

function sessionFromAuthResponse(data: SupabaseAuthResponse): SupabaseAuthSession | null {
  if (!data.access_token || !data.user?.id) return null;
  const expiresAt = data.expires_at ? data.expires_at * 1000 : Date.now() + (data.expires_in ?? 3600) * 1000;
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? "",
    expiresAt,
    user: { id: data.user.id, email: data.user.email },
  };
}

async function authRequest<T>(path: string, init: RequestInit = {}, accessToken?: string): Promise<T> {
  const config = loadSupabaseMemoryConfig();
  const key = requireSupabaseKey(config);
  const res = await fetch(getSupabaseAuthUrl(config, path), {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${accessToken || key}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(body || `Supabase Auth ${res.status}`);
  }

  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T;
}

export async function signInSupabaseAuth(email: string, password: string): Promise<SupabaseAuthSession> {
  const data = await authRequest<SupabaseAuthResponse>("token?grant_type=password", {
    method: "POST",
    body: JSON.stringify({ email: email.trim(), password }),
  });
  const session = sessionFromAuthResponse(data);
  if (!session) throw new Error("Login gagal. Cek email dan password.");
  saveSupabaseAuthSession(session);
  return session;
}

export async function signUpSupabaseAuth(email: string, password: string): Promise<SupabaseAuthSession | null> {
  const data = await authRequest<SupabaseAuthResponse>("signup", {
    method: "POST",
    body: JSON.stringify({ email: email.trim(), password }),
  });
  const session = sessionFromAuthResponse(data);
  if (session) saveSupabaseAuthSession(session);
  return session;
}

export async function refreshSupabaseAuthSession(): Promise<SupabaseAuthSession | null> {
  const current = loadSupabaseAuthSession();
  if (!current?.refreshToken) return current;

  const data = await authRequest<SupabaseAuthResponse>("token?grant_type=refresh_token", {
    method: "POST",
    body: JSON.stringify({ refresh_token: current.refreshToken }),
  });
  const session = sessionFromAuthResponse(data);
  if (session) saveSupabaseAuthSession(session);
  return session;
}

export async function getValidSupabaseAuthSession(): Promise<SupabaseAuthSession | null> {
  const current = loadSupabaseAuthSession();
  if (!current) return null;
  if (current.expiresAt > Date.now() + 60_000) return current;
  try {
    return await refreshSupabaseAuthSession();
  } catch {
    clearSupabaseAuthSession();
    return null;
  }
}

export async function signOutSupabaseAuth(): Promise<void> {
  const current = loadSupabaseAuthSession();
  try {
    if (current?.accessToken) {
      await authRequest<null>("logout", { method: "POST" }, current.accessToken);
    }
  } finally {
    clearSupabaseAuthSession();
  }
}

async function supabaseRest<T>(
  config: SupabaseMemoryConfig,
  path: string,
  init?: RequestInit,
  options: { auth?: boolean } = {},
): Promise<T> {
  const url = cleanBaseUrl(config.url);
  const key = config.anonKey.trim();
  if (!config.enabled || !url || !key) throw new Error("Supabase AI Memory belum aktif.");

  const session = options.auth ? await getValidSupabaseAuthSession() : null;
  if (options.auth && !session) throw new Error("Login Supabase dulu agar memory per akun aktif.");

  const res = await fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${session?.accessToken || key}`,
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

async function supabaseInsert(
  config: SupabaseMemoryConfig,
  path: string,
  body: unknown,
  options: { auth?: boolean } = {},
): Promise<void> {
  await supabaseRest<null>(config, path, {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify(body),
  }, options);
}

export async function fetchAiMemory(limit = 80): Promise<AiMemoryItem[]> {
  const config = loadSupabaseMemoryConfig();
  if (!config.enabled || !config.url || !config.anonKey) return [];
  const session = await getValidSupabaseAuthSession();
  if (!session?.user.id) return [];

  return supabaseRest<AiMemoryItem[]>(
    config,
    `ai_memory?select=title,content,category&user_id=eq.${encodeURIComponent(session.user.id)}&is_active=eq.true&order=created_at.desc&limit=${limit}`,
    undefined,
    { auth: true },
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
    memoryText ? `Most relevant user-scoped memory:\n${memoryText}` : "",
    repoText ? `Most relevant repo index memory:\n${repoText}` : "",
    "Memory is automatic, private, and scoped to the logged-in Supabase user. Do not expose the memory list unless the user explicitly asks.",
    "Important privacy rule: never store or reveal user API keys, provider settings, secrets, passwords, tokens, full chat history, uploaded files, images, videos, or large attachments in Supabase memory.",
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
    lower.includes("token") ||
    /\b(sk-|ghp_|github_pat_|xai-|or-)[a-z0-9_\-]{12,}/i.test(text)
  );
}

function containsLargeMediaOrAttachment(text: string): boolean {
  const lower = text.toLowerCase();
  return (
    text.length > 2400 ||
    lower.includes("data:image") ||
    lower.includes("data:video") ||
    lower.includes("data:audio") ||
    lower.includes("base64,") ||
    lower.includes("blob:") ||
    lower.includes("attachment:") ||
    lower.includes("uploaded file") ||
    lower.includes("file upload") ||
    lower.includes("lampiran besar")
  );
}

function isTemporaryLookup(text: string): boolean {
  const lower = text.toLowerCase();
  return [
    "harga usd",
    "usd sekarang",
    "kurs sekarang",
    "cuaca sekarang",
    "berita terbaru",
    "cek harga",
    "hari ini",
    "sekarang",
  ].some((word) => lower.includes(word));
}

function categoryFor(text: string): string {
  const lower = text.toLowerCase();
  if (["jawaban singkat", "singkat", "bahasa indonesia", "copas", "prompt"].some((word) => lower.includes(word))) return "user_preference";
  if (["jangan hardcode", "api key", "secret", "token", "privacy", "privasi"].some((word) => lower.includes(word))) return "privacy_rule";
  if (["github", "repo", "commit", "push", "build", "deploy", "lovable", "sync", "redeploy"].some((word) => lower.includes(word))) return "project_workflow";
  if (["memory", "memori", "ingat", "settings", "setting", "serper", "realtime", "real time", "outlook", "supabase"].some((word) => lower.includes(word))) return "app_feature";
  if (["tampilan", "menu", "mobile", "hp", "header", "sidebar", "status"].some((word) => lower.includes(word))) return "ui_decision";
  return "auto";
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
    "menu",
    "header",
    "mobile",
    "hp",
    "error",
    "bug",
    "build",
    "deploy",
    "memory",
    "memori",
    "outlook",
    "serper",
    "real time",
    "realtime",
    "aplikasi",
    "web app",
    "provider",
    "model",
    "jawaban singkat",
    "bahasa indonesia",
    "copas",
    "prompt",
  ].some((word) => lower.includes(word));
}

function makeAutomaticMemoryDecision(userText: string, assistantText: string): AutoMemoryDecision {
  const cleanUser = cleanMemoryText(userText);
  const cleanAssistant = cleanMemoryText(assistantText);
  const combined = `${cleanUser}\n${cleanAssistant}`;
  const category = categoryFor(combined);

  if (!cleanUser || !cleanAssistant) {
    return { shouldSave: false, title: "", content: "", category, priority: 0 };
  }
  if (!isImportantForProject(combined)) {
    return { shouldSave: false, title: "", content: "", category, priority: 0 };
  }
  if (isTemporaryLookup(cleanUser) && category === "auto") {
    return { shouldSave: false, title: "", content: "", category, priority: 0 };
  }
  if (containsSensitiveValue(combined) || containsLargeMediaOrAttachment(combined)) {
    return { shouldSave: false, title: "", content: "", category, priority: 0 };
  }

  const titlePrefix: Record<string, string> = {
    user_preference: "Preference",
    privacy_rule: "Privacy rule",
    project_workflow: "Project workflow",
    app_feature: "App feature",
    ui_decision: "UI decision",
    auto: "Auto",
  };
  const title = `${titlePrefix[category] ?? "Auto"}: ${cleanUser.slice(0, 90)}`;
  const content = [
    `User preference/request: ${cleanUser.slice(0, 360)}`,
    `Useful result/decision: ${cleanAssistant.slice(0, 900)}`,
  ].join("\n");
  const priority = category === "user_preference" || category === "privacy_rule" || category === "project_workflow" ? 40 : 25;

  return { shouldSave: true, title, content, category, priority };
}

function recentlySaved(marker: string): boolean {
  if (typeof localStorage === "undefined") return false;

  const shortMarker = marker.toLowerCase().replace(/\s+/g, " ").slice(0, 500);
  if (localStorage.getItem(AUTO_MEMORY_LAST_KEY) === shortMarker) return true;

  try {
    const seen = JSON.parse(localStorage.getItem(AUTO_MEMORY_SEEN_KEY) || "[]") as string[];
    if (seen.includes(shortMarker)) return true;
    const next = [shortMarker, ...seen].slice(0, 40);
    localStorage.setItem(AUTO_MEMORY_SEEN_KEY, JSON.stringify(next));
    localStorage.setItem(AUTO_MEMORY_LAST_KEY, shortMarker);
    return false;
  } catch {
    localStorage.setItem(AUTO_MEMORY_LAST_KEY, shortMarker);
    return false;
  }
}

export async function saveAiMemoryNote(title: string, content: string, category = "auto", priority = 20): Promise<void> {
  const config = loadSupabaseMemoryConfig();
  if (!config.enabled || !config.url || !config.anonKey) return;
  const session = await getValidSupabaseAuthSession();
  if (!session?.user.id) return;

  const safeTitle = cleanMemoryText(title).slice(0, 120);
  const safeContent = cleanMemoryText(content).slice(0, 1800);
  if (!safeTitle || !safeContent) return;
  if (containsSensitiveValue(`${safeTitle}\n${safeContent}`) || containsLargeMediaOrAttachment(`${safeTitle}\n${safeContent}`)) return;

  await supabaseInsert(config, "ai_memory", {
    user_id: session.user.id,
    title: safeTitle,
    content: safeContent,
    category,
    tags: ["auto", "chat", category],
    priority,
    is_active: true,
  }, { auth: true });
}

export async function autoSaveImportantMemory(userText: string, assistantText: string): Promise<void> {
  try {
    const decision = makeAutomaticMemoryDecision(userText, assistantText);
    if (!decision.shouldSave) return;

    const marker = `${decision.category}\n${decision.title}\n${decision.content}`;
    if (recentlySaved(marker)) return;

    await saveAiMemoryNote(decision.title, decision.content, decision.category, decision.priority);
  } catch {
    // Memory saving must never break chat.
  }
}
