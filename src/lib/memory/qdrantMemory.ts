export interface QdrantMemoryConfig {
  endpoint: string;
  apiKey: string;
  collection: string;
  vectorSize: number;
  enabled: boolean;
}

export interface QdrantCollectionInfo {
  name: string;
}

const QDRANT_MEMORY_KEY = "aiapichat:qdrant-memory";
const DEFAULT_COLLECTION = "ai_chat_memory";
const DEFAULT_VECTOR_SIZE = 1536;

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

function cleanEndpoint(endpoint: string): string {
  return endpoint.trim().replace(/\/$/, "");
}

function cleanCollection(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "") || DEFAULT_COLLECTION;
}

export function loadQdrantMemoryConfig(): QdrantMemoryConfig {
  if (!isBrowser()) {
    return { endpoint: "", apiKey: "", collection: DEFAULT_COLLECTION, vectorSize: DEFAULT_VECTOR_SIZE, enabled: false };
  }

  try {
    const raw = localStorage.getItem(QDRANT_MEMORY_KEY);
    if (!raw) return { endpoint: "", apiKey: "", collection: DEFAULT_COLLECTION, vectorSize: DEFAULT_VECTOR_SIZE, enabled: false };
    const parsed = JSON.parse(raw) as Partial<QdrantMemoryConfig>;
    return {
      endpoint: String(parsed.endpoint ?? ""),
      apiKey: String(parsed.apiKey ?? ""),
      collection: cleanCollection(String(parsed.collection ?? DEFAULT_COLLECTION)),
      vectorSize: Number(parsed.vectorSize || DEFAULT_VECTOR_SIZE),
      enabled: !!parsed.enabled,
    };
  } catch {
    return { endpoint: "", apiKey: "", collection: DEFAULT_COLLECTION, vectorSize: DEFAULT_VECTOR_SIZE, enabled: false };
  }
}

export function saveQdrantMemoryConfig(config: QdrantMemoryConfig): void {
  if (!isBrowser()) return;
  localStorage.setItem(
    QDRANT_MEMORY_KEY,
    JSON.stringify({
      endpoint: cleanEndpoint(config.endpoint),
      apiKey: config.apiKey.trim(),
      collection: cleanCollection(config.collection),
      vectorSize: Number(config.vectorSize || DEFAULT_VECTOR_SIZE),
      enabled: !!config.enabled,
    }),
  );
}

export function clearQdrantMemoryConfig(): void {
  if (!isBrowser()) return;
  localStorage.removeItem(QDRANT_MEMORY_KEY);
}

function requireConfig(config = loadQdrantMemoryConfig()): QdrantMemoryConfig {
  const endpoint = cleanEndpoint(config.endpoint);
  const apiKey = config.apiKey.trim();
  if (!endpoint) throw new Error("Isi Qdrant Endpoint terlebih dahulu.");
  if (!apiKey) throw new Error("Isi Qdrant API Key terlebih dahulu.");
  return { ...config, endpoint, apiKey, collection: cleanCollection(config.collection) };
}

async function qdrantFetch<T>(path: string, init: RequestInit = {}, config = loadQdrantMemoryConfig()): Promise<T> {
  const current = requireConfig(config);
  let res: Response;
  try {
    res = await fetch(`${current.endpoint}${path}`, {
      ...init,
      headers: {
        "api-key": current.apiKey,
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
      },
    });
  } catch {
    throw new Error("Tidak bisa menghubungi Qdrant. Cek Endpoint, koneksi internet, atau kemungkinan CORS browser.");
  }

  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!res.ok) {
    const detail = typeof data === "object" && data && "status" in data ? String((data as { status?: unknown }).status) : text.slice(0, 160);
    if (res.status === 401 || res.status === 403) throw new Error("Qdrant API Key ditolak. Buat API key baru atau cek akses cluster.");
    if (res.status === 404) throw new Error("Endpoint/collection Qdrant tidak ditemukan. Cek URL endpoint cluster.");
    throw new Error(detail || `Qdrant error ${res.status}.`);
  }

  return data as T;
}

export async function testQdrantConnection(config = loadQdrantMemoryConfig()): Promise<QdrantCollectionInfo[]> {
  const data = await qdrantFetch<{ result?: { collections?: Array<{ name: string }> } }>("/collections", {}, config);
  return data.result?.collections ?? [];
}

export async function ensureQdrantCollection(config = loadQdrantMemoryConfig()): Promise<void> {
  const current = requireConfig(config);
  const vectorSize = Number(current.vectorSize || DEFAULT_VECTOR_SIZE);
  if (!Number.isFinite(vectorSize) || vectorSize < 1) throw new Error("Vector size tidak valid.");

  await qdrantFetch(
    `/collections/${encodeURIComponent(current.collection)}`,
    {
      method: "PUT",
      body: JSON.stringify({
        vectors: {
          size: vectorSize,
          distance: "Cosine",
        },
      }),
    },
    current,
  );
}
