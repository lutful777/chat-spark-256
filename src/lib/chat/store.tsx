import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  loadActiveProviderId,
  loadConversations,
  loadProviders,
  saveActiveProviderId,
  saveConversations,
  saveProviders,
  uid,
} from "./storage";
import type { ChatMessage, Conversation, ProviderConfig } from "./types";
import { DEFAULT_PROVIDER } from "./types";

interface ChatStore {
  ready: boolean;
  providers: ProviderConfig[];
  activeProviderId: string | null;
  activeProvider: ProviderConfig | null;
  conversations: Conversation[];
  setActiveProviderId: (id: string | null) => void;
  upsertProvider: (provider: ProviderConfig) => void;
  removeProvider: (id: string) => void;
  createConversation: () => string;
  removeConversation: (id: string) => void;
  clearConversation: (id: string) => void;
  clearAllConversations: () => void;
  renameConversation: (id: string, title: string) => void;
  setConversationMessages: (id: string, messages: ChatMessage[]) => void;
  setConversationProvider: (id: string, providerId: string | null) => void;
  importProviders: (incoming: Array<Omit<ProviderConfig, "id">>) => number;
  clearAllApiKeys: () => void;
  resetAllData: () => void;
}

const ChatContext = createContext<ChatStore | null>(null);

export function ChatStoreProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [providers, setProviders] = useState<ProviderConfig[]>([]);
  const [activeProviderId, setActiveProviderIdState] = useState<string | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);

  // hydrate from localStorage on mount (client only)
  useEffect(() => {
    const p = loadProviders();
    const active = loadActiveProviderId() ?? p[0]?.id ?? null;
    setProviders(p);
    setActiveProviderIdState(active);
    setConversations(loadConversations());
    setReady(true);
  }, []);

  // persist
  useEffect(() => {
    if (ready) saveProviders(providers);
  }, [providers, ready]);
  useEffect(() => {
    if (ready) saveActiveProviderId(activeProviderId);
  }, [activeProviderId, ready]);
  useEffect(() => {
    if (ready) saveConversations(conversations);
  }, [conversations, ready]);

  const setActiveProviderId = useCallback((id: string | null) => {
    setActiveProviderIdState(id);
  }, []);

  const upsertProvider = useCallback((provider: ProviderConfig) => {
    setProviders((prev) => {
      const exists = prev.some((p) => p.id === provider.id);
      return exists
        ? prev.map((p) => (p.id === provider.id ? provider : p))
        : [...prev, provider];
    });
    setActiveProviderIdState((cur) => cur ?? provider.id);
  }, []);

  const removeProvider = useCallback((id: string) => {
    setProviders((prev) => {
      const next = prev.filter((p) => p.id !== id);
      setActiveProviderIdState((cur) => (cur === id ? (next[0]?.id ?? null) : cur));
      return next;
    });
  }, []);

  const touch = (c: Conversation): Conversation => ({ ...c, updatedAt: Date.now() });

  const createConversation = useCallback((): string => {
    const id = uid();
    const now = Date.now();
    setConversations((prev) => [
      {
        id,
        title: "Percakapan baru",
        providerId: null,
        messages: [],
        createdAt: now,
        updatedAt: now,
      },
      ...prev,
    ]);
    return id;
  }, []);

  const removeConversation = useCallback((id: string) => {
    setConversations((prev) => prev.filter((c) => c.id !== id));
  }, []);

  const clearConversation = useCallback((id: string) => {
    setConversations((prev) =>
      prev.map((c) => (c.id === id ? touch({ ...c, messages: [] }) : c)),
    );
  }, []);

  const clearAllConversations = useCallback(() => {
    setConversations([]);
  }, []);

  const renameConversation = useCallback((id: string, title: string) => {
    setConversations((prev) =>
      prev.map((c) => (c.id === id ? { ...c, title } : c)),
    );
  }, []);

  const setConversationMessages = useCallback(
    (id: string, messages: ChatMessage[]) => {
      setConversations((prev) =>
        prev.map((c) => {
          if (c.id !== id) return c;
          const firstUser = messages.find((m) => m.role === "user");
          const autoTitle =
            c.title === "Percakapan baru" && firstUser
              ? firstUser.content.slice(0, 40) +
                (firstUser.content.length > 40 ? "…" : "")
              : c.title;
          return touch({ ...c, messages, title: autoTitle });
        }),
      );
    },
    [],
  );

  const setConversationProvider = useCallback(
    (id: string, providerId: string | null) => {
      setConversations((prev) =>
        prev.map((c) => (c.id === id ? { ...c, providerId } : c)),
      );
    },
    [],
  );

  const importProviders = useCallback((incoming: Array<Omit<ProviderConfig, "id">>): number => {
    let added = 0;
    setProviders((prev) => {
      const next = [...prev];
      for (const inc of incoming) {
        const provider: ProviderConfig = { ...inc, id: uid() };
        next.push(provider);
        added += 1;
      }
      return next;
    });
    return added;
  }, []);

  const clearAllApiKeys = useCallback(() => {
    setProviders((prev) =>
      prev.map((p) => ({ ...p, apiKey: "", imageApiKey: "", videoApiKey: "" })),
    );
  }, []);

  const resetAllData = useCallback(() => {
    setConversations([]);
    const seeded: ProviderConfig = { id: uid(), ...DEFAULT_PROVIDER };
    setProviders([seeded]);
    setActiveProviderIdState(seeded.id);
  }, []);

  const activeProvider = useMemo(
    () => providers.find((p) => p.id === activeProviderId) ?? null,
    [providers, activeProviderId],
  );

  const value: ChatStore = {
    ready,
    providers,
    activeProviderId,
    activeProvider,
    conversations,
    setActiveProviderId,
    upsertProvider,
    removeProvider,
    createConversation,
    removeConversation,
    clearConversation,
    clearAllConversations,
    renameConversation,
    setConversationMessages,
    setConversationProvider,
    importProviders,
    clearAllApiKeys,
    resetAllData,
  };

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

export function useChatStore(): ChatStore {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error("useChatStore must be used within ChatStoreProvider");
  return ctx;
}
