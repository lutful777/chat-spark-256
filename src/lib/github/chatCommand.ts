import {
  getFileContent,
  loadGitHubConfig,
  updateFileContent,
  type GitHubConfig,
} from "@/lib/github/api";

const PENDING_KEY = "aiapichat:github:pending-change";

interface PendingGitHubChange {
  owner: string;
  repo: string;
  branch: string;
  path: string;
  sha: string;
  content: string;
  message: string;
  summary: string;
  createdAt: number;
}

function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

function hasGitHubIntent(lower: string): boolean {
  return (
    lower === "push" ||
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
    lower.includes("tambahkan x.ai")
  );
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
    return raw ? (JSON.parse(raw) as PendingGitHubChange) : null;
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
    path,
    sha: file.sha,
    content: nextContent,
    message: "Add x.ai provider preset",
    summary,
    createdAt: Date.now(),
  });

  return [
    "Saya sudah menemukan file provider dan menyiapkan perubahan GitHub.",
    "",
    summary,
    "",
    "Belum ada perubahan yang di-commit.",
    "Ketik **PUSH** untuk commit ke GitHub, atau ketik perintah lain untuk membatalkan/mengganti perubahan.",
  ].join("\n");
}

async function pushPending(config: GitHubConfig): Promise<string> {
  requireGitHubConfig(config);
  const pending = loadPending();
  if (!pending) {
    return "Tidak ada perubahan GitHub yang menunggu push. Kirim dulu perintah seperti: `tambah provider x.ai di menu setting`.";
  }

  if (pending.owner !== config.owner || pending.repo !== config.repo) {
    return "Perubahan pending dibuat untuk repo berbeda. Kirim ulang perintah edit untuk repo yang sedang dipilih.";
  }

  const result = await updateFileContent({
    token: config.token,
    owner: pending.owner,
    repo: pending.repo,
    path: pending.path,
    branch: pending.branch,
    sha: pending.sha,
    content: pending.content,
    message: pending.message,
  });
  clearPending();

  const sha = result.commit?.sha?.slice(0, 8) ?? "berhasil";
  const url = result.commit?.html_url;

  return [
    "Perubahan berhasil di-push ke GitHub ✅",
    `Commit: **${sha}**`,
    url ? `[Buka commit di GitHub](${url})` : "",
    "",
    "Setelah ini lakukan **Sync / Pull / Redeploy** di Lovable agar website ikut update.",
  ]
    .filter(Boolean)
    .join("\n");
}

export async function runGitHubChatCommand(text: string): Promise<string | null> {
  const lower = normalize(text);
  if (!hasGitHubIntent(lower)) return null;

  const config = loadGitHubConfig();

  if (lower === "push" || lower === "commit" || lower.includes("ketik push") || lower.includes("push sekarang")) {
    return pushPending(config);
  }

  if (isAddXaiProviderRequest(lower)) {
    return prepareAddXaiProvider(config);
  }

  return [
    "Saya bisa menjalankan perintah GitHub dari chat, tapi saat ini command otomatis yang tersedia adalah:",
    "",
    "`tambah provider x.ai di menu setting`",
    "",
    "Alurnya: saya cari file provider, siapkan perubahan, tampilkan ringkasan, lalu kamu ketik **PUSH** untuk commit.",
  ].join("\n");
}
