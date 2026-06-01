import {
  DEFAULT_PROVIDER,
  type Conversation,
  type ProviderConfig,
} from "./types";

const PROVIDERS_KEY = "aiapichat:providers";
const ACTIVE_PROVIDER_KEY = "aiapichat:activeProvider";
const CONVERSATIONS_KEY = "aiapichat:conversations";

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

export function loadProviders(): ProviderConfig[] {
  const providers = read<ProviderConfig[]>(PROVIDERS_KEY, []);
  if (providers.length === 0) {
    const seeded: ProviderConfig = { id: uid(), ...DEFAULT_PROVIDER };
    write(PROVIDERS_KEY, [seeded]);
    write(ACTIVE_PROVIDER_KEY, seeded.id);
    return [seeded];
  }
  return providers;
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