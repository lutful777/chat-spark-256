import {
  DEFAULT_PROVIDER,
  type Conversation,
  type ProviderConfig,
} from "./types";

const PROVIDERS_KEY = "aiapichat:providers";
const ACTIVE_PROVIDER_KEY = "aiapichat:activeProvider";
const CONVERSATIONS_KEY = "aiapichat:conversations";
const MIGRATION_KEY = "aiapichat:migrations";

export function uid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

function read<T>(key: string, fallback: T): T {
  if (!isBrowser()) return fallback;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  if (!isBrowser()) return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore quota errors */
  }
}

/* ---------------- Providers ---------------- */

/**
 * One-time migration: clear leftover hardcoded defaults from older versions.
 * Only blanks fields that match the old auto-filled defaults so user-entered
 * values and user-created providers are never touched.
 */
const OLD_DEFAULT_BASE_URL = "https://api.bluesminds.com/v1";
const OLD_DEFAULT_PATH = "/chat/completions";
const OLD_DEFAULT_MODELS = ["gpt-5-chat", "gpt-4o-mini", "openai/gpt-4o-mini", "mistralai/mistral-large"];

function runProviderMigration(providers: ProviderConfig[]): {
  providers: ProviderConfig[];
  changed: boolean;
} {
  const done = read<string[]>(MIGRATION_KEY, []);
  if (done.includes("clear-old-defaults")) return { providers, changed: false };

  let changed = false;
  const next = providers.map((p) => {
    // Only target an untouched default provider (no API key entered by user).
    if (p.apiKey.trim()) return p;
    const matchesOldDefault =
      p.baseUrl === OLD_DEFAULT_BASE_URL && p.path === OLD_DEFAULT_PATH;
    if (!matchesOldDefault) return p;
    changed = true;
    return {
      ...p,
      baseUrl: "",
      path: "",
      model: OLD_DEFAULT_MODELS.includes(p.model.trim()) ? "" : p.model,
    };
  });

  write(MIGRATION_KEY, [...done, "clear-old-defaults"]);
  return { providers: next, changed };
}

export function loadProviders(): ProviderConfig[] {
  const providers = read<ProviderConfig[]>(PROVIDERS_KEY, []);
  if (providers.length === 0) {
    const seeded: ProviderConfig = { id: uid(), ...DEFAULT_PROVIDER };
    write(PROVIDERS_KEY, [seeded]);
    write(ACTIVE_PROVIDER_KEY, seeded.id);
    return [seeded];
  }
  const { providers: migrated, changed } = runProviderMigration(providers);
  if (changed) write(PROVIDERS_KEY, migrated);
  return migrated;
}

export function saveProviders(providers: ProviderConfig[]): void {
  write(PROVIDERS_KEY, providers);
}

export function loadActiveProviderId(): string | null {
  return read<string | null>(ACTIVE_PROVIDER_KEY, null);
}

export function saveActiveProviderId(id: string | null): void {
  write(ACTIVE_PROVIDER_KEY, id);
}

/* ---------------- Conversations ---------------- */

export function loadConversations(): Conversation[] {
  return read<Conversation[]>(CONVERSATIONS_KEY, []);
}

export function saveConversations(conversations: Conversation[]): void {
  write(CONVERSATIONS_KEY, conversations);
}