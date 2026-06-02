import { sendChat } from "@/lib/chat/api";
import type { ChatMessage, ProviderConfig } from "@/lib/chat/types";
import {
  getFileContent,
  loadGitHubConfig,
  updateFileContent,
  type GitHubConfig,
} from "@/lib/github/api";

const PENDING_KEY = "aiapichat:github:pending-change";
const MAX_FILES_FOR_AI = 4;
const MAX_FILE_CHARS = 45000;

interface PendingFileChange {
  path: string;
  sha: string;
  content: string;
}

interface PendingGitHubChange {
  owner: string;
  repo: string;
  branch: string;
  changes: PendingFileChange[];
  message: string;
  summary: string;
  createdAt: number;
}

interface LoadedRepoFile {
  path: string;
  sha: string;
  content: string;
}

interface AiEditResult {
  summary?: string;
  files?: Array<{ path?: string; content?: string }>;
}

const PROJECT_FILES: Array<{ path: string; keywords: string[] }> = [
  {
    path: "src/routes/index.tsx",
    keywords: ["chat", "halaman utama", "main", "home", "input", "send", "kirim", "menu kanan", "header"],
  },
  {
    path: "src/components/chat/ChatInput.tsx",
    keywords: ["input", "upload", "file", "foto", "gambar", "pdf", "placeholder", "ketik pesan", "send", "kirim"],
  },
  {
    path: "src/components/chat/ChatMessageBubble.tsx",
    keywords: ["bubble", "pesan", "chat bubble", "foto", "gambar", "upload", "preview", "tampilan chat"],
  },
  {
    path: "src/components/chat/ConversationSidebar.tsx",
    keywords: ["sidebar", "riwayat", "history", "obrolan", "new chat", "hapus chat", "settings"],
  },
  {
    path: "src/components/media/MediaNav.tsx",
    keywords: ["nav", "tab", "menu", "chat", "image", "video", "outlook", "tombol outlook", "hapus outlook"],
  },
  {
    path: "src/routes/settings.tsx",
    keywords: ["setting", "settings", "api key", "provider", "chat api", "image api", "video api", "github", "outlook"],
  },
  {
    path: "src/lib/chat/types.ts",
    keywords: ["provider", "preset", "model", "x.ai", "xai", "grok", "gemini", "openrouter", "bluesminds", "openai"],
  },
  {
    path: "src/lib/chat/api.ts",
    keywords: ["chat api", "api", "vision", "gambar", "foto", "stream", "error", "400", "provider", "request"],
  },
  {
    path: "src/lib/chat/media.ts",
    keywords: ["image", "video", "generate", "edit foto", "media", "x.ai", "grok", "duration", "durasi"],
  },
  {
    path: "src/routes/image.tsx",
    keywords: ["image", "gambar", "foto", "edit foto", "generate image", "remove background"],
  },
  {
    path: "src/routes/video.tsx",
    keywords: ["video", "generate video", "continue", "durasi", "duration", "photo to video"],
  },
  {
    path: "src/routes/outlook.tsx",
    keywords: ["outlook", "email", "inbox", "sent", "junk", "folder", "mail"],
  },
  {
    path: "src/components/outlook/OutlookConnect.tsx",
    keywords: ["outlook", "connect outlook", "switch account", "microsoft", "client id"],
  },
  {
    path: "src/lib/outlook/graph.ts",
    keywords: ["outlook", "graph", "email", "attachment", "pdf", "folder", "mail"],
  },
  {
    path: "src/lib/outlook/msal.ts",
    keywords: ["outlook", "msal", "microsoft", "login", "switch account", "scope"],
  },
  {
    path: "src/components/github/GitHubConnect.tsx",
    keywords: ["github", "connect github", "token", "repo", "admin", "permission"],
  },
  {
    path: "src/lib/github/api.ts",
    keywords: ["github api", "github", "repo", "file", "commit", "token", "update file"],
  },
  {
    path: "src/lib/github/chatCommand.ts",
    keywords: ["github agent", "github chat", "ai agent", "command", "push", "commit"],
  },
  {
    path: "src/styles.css",
    keywords: ["style", "css", "warna", "color", "background", "lovable", "tampilan", "tema"],
  },
  {
    path: "package.json",
    keywords: ["package", "dependency", "library", "install", "npm"],
  },
  {
    path: "vite.config.ts",
    keywords: ["vite", "proxy", "server", "build", "config"],
  },
];

function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

function isPushCommand(lower: string): boolean {
  return lower === "push" || lower === "commit" || lower === "kirim push" || lower.includes("push sekarang");
}

function isCancelCommand(lower: string): boolean {
  return ["batal", "cancel", "batalkan", "jangan push", "hapus pending"].some((x) => lower.includes(x));
}

function hasGitHubIntent(lower: string): boolean {
  return (
    isPushCommand(lower) ||
    lower.includes("github") ||
    lower.includes("repo") ||
    lower.includes("commit") ||
    lower.includes("push") ||
    lower.includes("provider x.ai") ||
    lower.includes("provider xai") ||
    lower.includes("preveder x.ai") ||
    lower.includes("previder x.ai") ||
    lower.includes("x.ai di menu setting") ||
    lower.includes("xai di menu setting") ||
    lower.includes("tambah x.ai") ||
    lower.includes("tambahkan x.ai") ||
    looksLikeAppEditRequest(lower)
  );
}

function looksLikeAppEditRequest(lower: string): boolean {
  const verbs = [
    "ubah",
    "edit",
    "hapus",
    "hilangkan",
    "tambah",
    "tambahkan",
    "perbaiki",
    "fix",
    "buat",
    "pindahkan",
    "ganti",
    "rapikan",
  ];
  const appTargets = [
    "aplikasi",
    "website",
    "tombol",
    "menu",
    "halaman",
    "setting",
    "settings",
    "chat",
    "video",
    "image",
    "foto",
    "gambar",
    "outlook",
    "github",
    "provider",
    "api",
    "sidebar",
    "upload",
    "file",
    "riwayat",
    "tampilan",
    "warna",
    "lovable",
  ];
  return verbs.some((v) => lower.includes(v)) && appTargets.some((t) => lower.includes(t));
}

function isAddXaiProviderRequest(lower: string): boolean {
  const wantsXai = lower.includes("x.ai") || lower.includes("xai") || lower.includes("grok");
  const wantsProvider = lower.includes("provider") || lower.includes("preveder") || lower.includes("previder");
  const wantsSettings = lower.includes("setting") || lower.includes("settings") || lower.includes("menu");
  const wantsAdd = lower.includes("tambah") || lower.includes("tambahkan") || lower.includes("add");
  return wantsXai && wantsProvider && (wantsSettings || wantsAdd);
}

function loadPending(): PendingGitHubChange | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(PENDING_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PendingGitHubChange & PendingFileChange;
    // Backward compatibility with the old single-file pending format.
    if (!parsed.changes && parsed.path && parsed.sha && parsed.content) {
      return {
        owner: parsed.owner,
        repo: parsed.repo,
        branch: parsed.branch,
        changes: [{ path: parsed.path, sha: parsed.sha, content: parsed.content }],
        message: parsed.message,
        summary: parsed.summary,
        createdAt: parsed.createdAt,
      };
    }
    return parsed;
  } catch {
    return null;
  }
}

function savePending(change: PendingGitHubChange): void {
  localStorage.setItem(PENDING_KEY, JSON.stringify(change));
}

function clearPending(): void {
  localStorage.removeItem(PENDING_KEY);
}

function requireGitHubConfig(config: GitHubConfig): void {
  if (!config.token.trim()) throw new Error("GitHub token belum diisi. Buka Settings → Chat API → GitHub Connect.");
  if (!config.owner || !config.repo) throw new Error("Repository GitHub belum dipilih di GitHub Connect.");
}

function insertXaiPreset(content: string): string {
  if (content.includes('name: "x.ai (Grok)"') || content.includes("name: 'x.ai (Grok)'")) {
    return content;
  }

  const preset = `  {
    name: "x.ai (Grok)",
    baseUrl: "https://api.x.ai/v1",
    path: "/chat/completions",
    apiKey: "",
    model: "grok-4-latest",
    models: ["grok-4-latest", "grok-3-latest"],
    temperature: 0.7,
    maxTokens: 1024,
    systemPrompt: "",
    stream: true,
    directCall: false,
    imageBaseUrl: "https://api.x.ai/v1",
    imageApiKey: "",
    imagePath: "/images/generations",
    imageModel: "grok-imagine-image-quality",
    imageEditPath: "/images/edits",
    imageEditModel: "grok-imagine-image-quality",
    videoBaseUrl: "https://api.x.ai/v1",
    videoApiKey: "",
    videoPath: "/videos/generations",
    videoModel: "grok-imagine-video",
    videoStatusPath: "/videos/{request_id}",
  },
`;

  const openAiMarker = `  {
    name: "OpenAI",`;
  if (content.includes(openAiMarker)) {
    return content.replace(openAiMarker, `${preset}${openAiMarker}`);
  }

  const arrayEnd = content.lastIndexOf("]; ");
  if (arrayEnd !== -1) return `${content.slice(0, arrayEnd)}${preset}${content.slice(arrayEnd)}`;

  const fallbackEnd = content.lastIndexOf("];\n");
  if (fallbackEnd !== -1) return `${content.slice(0, fallbackEnd)}${preset}${content.slice(fallbackEnd)}`;

  throw new Error("Tidak bisa menemukan daftar PROVIDER_PRESETS di src/lib/chat/types.ts.");
}

function compactDiffSummary(path: string): string {
  return [
    `File yang akan diedit: \`${path}\``,
    "Perubahan:",
    "- Menambahkan preset provider **x.ai (Grok)** di menu Settings.",
    "- Chat API: `https://api.x.ai/v1` + `/chat/completions`.",
    "- Image API: `/images/generations` dan `/images/edits`.",
    "- Video API: `/videos/generations` dan status `/videos/{request_id}`.",
  ].join("\n");
}

async function prepareAddXaiProvider(config: GitHubConfig): Promise<string> {
  requireGitHubConfig(config);

  const path = "src/lib/chat/types.ts";
  const file = await getFileContent(config.token, config.owner, config.repo, path, config.branch || "main");
  const nextContent = insertXaiPreset(file.content);

  if (nextContent === file.content) {
    return "Provider **x.ai (Grok)** sudah ada di daftar provider. Tidak ada perubahan yang perlu di-push.";
  }

  const summary = compactDiffSummary(path);
  savePending({
    owner: config.owner,
    repo: config.repo,
    branch: config.branch || "main",
    changes: [{ path, sha: file.sha, content: nextContent }],
    message: "Add x.ai provider preset",
    summary,
    createdAt: Date.now(),
  });

  return pendingPreview(summary);
}

function pendingPreview(summary: string): string {
  return [
    "Saya sudah menyiapkan perubahan GitHub.",
    "",
    summary,
    "",
    "Belum ada perubahan yang di-commit.",
    "Ketik **PUSH** untuk commit ke GitHub, atau ketik **batal** untuk membatalkan.",
  ].join("\n");
}

function pickCandidatePaths(request: string): string[] {
  const lower = normalize(request);
  const scored = PROJECT_FILES.map((file) => {
    const score = file.keywords.reduce((total, keyword) => total + (lower.includes(keyword) ? 1 : 0), 0);
    return { path: file.path, score };
  })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.path);

  const fallback = [
    "src/routes/index.tsx",
    "src/components/chat/ChatInput.tsx",
    "src/components/chat/ChatMessageBubble.tsx",
    "src/components/media/MediaNav.tsx",
    "src/routes/settings.tsx",
    "src/lib/chat/types.ts",
  ];

  return Array.from(new Set([...scored, ...fallback])).slice(0, MAX_FILES_FOR_AI);
}

async function loadCandidateFiles(config: GitHubConfig, request: string): Promise<LoadedRepoFile[]> {
  const paths = pickCandidatePaths(request);
  const loaded: LoadedRepoFile[] = [];

  for (const path of paths) {
    try {
      const file = await getFileContent(config.token, config.owner, config.repo, path, config.branch || "main");
      loaded.push({
        path,
        sha: file.sha,
        content:
          file.content.length > MAX_FILE_CHARS
            ? `${file.content.slice(0, MAX_FILE_CHARS)}\n\n/* FILE TRUNCATED: ask user to be more specific if edit needs hidden part */`
            : file.content,
      });
    } catch {
      // Ignore missing optional files.
    }
  }

  if (loaded.length === 0) throw new Error("Tidak bisa membaca file kandidat dari GitHub repo.");
  return loaded;
}

function extractJson(text: string): AiEditResult {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const raw = (fenced ?? text).trim();
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("AI tidak mengembalikan JSON edit yang valid.");
  }
  return JSON.parse(raw.slice(start, end + 1)) as AiEditResult;
}

function buildAiPrompt(request: string, files: LoadedRepoFile[]): string {
  const fileBlock = files
    .map(
      (file) =>
        `--- FILE: ${file.path}\n${file.content}\n--- END FILE: ${file.path}`,
    )
    .join("\n\n");

  return [
    "User request:",
    request,
    "",
    "You are editing a React + TypeScript + Tailwind app. You can only edit files provided below.",
    "Return ONLY valid JSON. No markdown. No explanation outside JSON.",
    "JSON schema:",
    '{"summary":"short Indonesian summary","files":[{"path":"exact provided path","content":"full new file content"}]}',
    "Rules:",
    "- Return full file content for each edited file.",
    "- Do not include files that do not change.",
    "- Preserve imports, TypeScript, JSX, and formatting as much as possible.",
    "- Do not invent files or paths that were not provided.",
    "- If the request is unclear or unsafe, return {\"summary\":\"Perintah belum cukup jelas.\",\"files\":[]}.",
    "",
    fileBlock,
  ].join("\n");
}

async function prepareAiEdit(
  config: GitHubConfig,
  request: string,
  provider?: ProviderConfig | null,
): Promise<string> {
  requireGitHubConfig(config);
  if (!provider?.apiKey?.trim() || !provider?.model?.trim()) {
    return "Untuk edit GitHub otomatis yang lebih pintar, pilih dan lengkapi Chat API provider dulu di Settings. AI perlu model aktif untuk memahami perintah dan mengubah kode.";
  }

  const files = await loadCandidateFiles(config, request);
  const prompt = buildAiPrompt(request, files);

  const aiMessages: ChatMessage[] = [
    {
      id: "github-agent-system",
      role: "system",
      content: "You are a careful code editing agent. Return only valid JSON as requested.",
      createdAt: Date.now(),
    },
    {
      id: "github-agent-user",
      role: "user",
      content: prompt,
      createdAt: Date.now(),
    },
  ];

  const result = await sendChat({
    provider: { ...provider, stream: false, maxTokens: Math.max(provider.maxTokens ?? 0, 4000) },
    messages: aiMessages,
  });

  const edit = extractJson(result.content);
  const allowed = new Map(files.map((file) => [file.path, file]));
  const changes = (edit.files ?? [])
    .filter((file): file is { path: string; content: string } => Boolean(file.path && typeof file.content === "string"))
    .filter((file) => allowed.has(file.path))
    .filter((file) => file.content !== allowed.get(file.path)?.content)
    .map((file) => ({
      path: file.path,
      sha: allowed.get(file.path)!.sha,
      content: file.content,
    }));

  if (changes.length === 0) {
    return edit.summary || "AI tidak menemukan perubahan yang aman untuk dibuat. Coba tulis perintah lebih spesifik.";
  }

  const summary = [
    edit.summary || "AI menyiapkan perubahan kode.",
    "",
    "File yang akan diedit:",
    ...changes.map((change) => `- \`${change.path}\``),
  ].join("\n");

  savePending({
    owner: config.owner,
    repo: config.repo,
    branch: config.branch || "main",
    changes,
    message: `AI update: ${request.slice(0, 60)}`,
    summary,
    createdAt: Date.now(),
  });

  return pendingPreview(summary);
}

async function pushPending(config: GitHubConfig): Promise<string> {
  requireGitHubConfig(config);
  const pending = loadPending();
  if (!pending) {
    return "Tidak ada perubahan GitHub yang menunggu push. Kirim dulu perintah edit, misalnya: `hapus tombol outlook` atau `tambah provider x.ai di menu setting`.";
  }

  if (pending.owner !== config.owner || pending.repo !== config.repo) {
    return "Perubahan pending dibuat untuk repo berbeda. Kirim ulang perintah edit untuk repo yang sedang dipilih.";
  }

  const commits: string[] = [];
  for (const change of pending.changes) {
    const result = await updateFileContent({
      token: config.token,
      owner: pending.owner,
      repo: pending.repo,
      path: change.path,
      branch: pending.branch,
      sha: change.sha,
      content: change.content,
      message: pending.message,
    });
    commits.push(result.commit?.sha?.slice(0, 8) ?? "berhasil");
  }
  clearPending();

  return [
    "Perubahan berhasil di-push ke GitHub ✅",
    `Commit: **${commits.join(", ")}**`,
    "",
    "Setelah ini lakukan **Sync / Pull / Redeploy** di Lovable agar website ikut update.",
  ].join("\n");
}

export async function runGitHubChatCommand(
  text: string,
  provider?: ProviderConfig | null,
): Promise<string | null> {
  const lower = normalize(text);
  if (!hasGitHubIntent(lower)) return null;

  const config = loadGitHubConfig();

  if (isCancelCommand(lower)) {
    clearPending();
    return "Perubahan GitHub pending sudah dibatalkan.";
  }

  if (isPushCommand(lower)) {
    return pushPending(config);
  }

  if (isAddXaiProviderRequest(lower)) {
    return prepareAddXaiProvider(config);
  }

  return prepareAiEdit(config, text, provider);
}
