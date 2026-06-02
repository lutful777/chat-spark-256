import { sendChat } from "@/lib/chat/api";
import type { ChatMessage, ProviderConfig } from "@/lib/chat/types";
import {
  commitMultipleFiles,
  getCommitCheckRuns,
  getCommitStatus,
  getFileContent,
  getRepositoryTree,
  loadGitHubConfig,
  updateFileContent,
  type GitHubConfig,
  type GitHubTreeItem,
} from "@/lib/github/api";

const PENDING_KEY = "aiapichat:github:pending-change";
const INDEX_KEY = "aiapichat:github:repo-index";
const MAX_FILES_FOR_AI = 8;
const MAX_FILE_CHARS = 50000;
const MAX_TOTAL_CHARS = 180000;

interface PendingFileChange {
  path: string;
  sha: string;
  content: string;
  oldContent?: string;
}

interface PendingGitHubChange {
  owner: string;
  repo: string;
  branch: string;
  changes: PendingFileChange[];
  message: string;
  summary: string;
  createdAt: number;
  lastCommitSha?: string;
}

interface RepoIndexFile {
  path: string;
  sha: string;
  size: number;
  ext: string;
  scoreText: string;
}

interface RepoIndex {
  owner: string;
  repo: string;
  branch: string;
  createdAt: number;
  files: RepoIndexFile[];
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

const STATIC_HINTS: Array<{ path: string; keywords: string[] }> = [
  { path: "src/routes/index.tsx", keywords: ["chat", "home", "input", "send", "kirim", "header"] },
  { path: "src/components/chat/ChatInput.tsx", keywords: ["input", "upload", "file", "foto", "gambar", "pdf", "placeholder", "send", "kirim"] },
  { path: "src/components/chat/ChatMessageBubble.tsx", keywords: ["bubble", "pesan", "foto", "gambar", "preview", "tampilan chat"] },
  { path: "src/components/chat/ConversationSidebar.tsx", keywords: ["sidebar", "riwayat", "history", "new chat", "hapus chat"] },
  { path: "src/components/media/MediaNav.tsx", keywords: ["nav", "tab", "menu", "chat", "image", "video", "outlook"] },
  { path: "src/routes/settings.tsx", keywords: ["setting", "settings", "api key", "provider", "github", "outlook"] },
  { path: "src/lib/chat/types.ts", keywords: ["provider", "preset", "model", "x.ai", "xai", "grok", "gemini", "openrouter", "bluesminds", "openai"] },
  { path: "src/lib/chat/api.ts", keywords: ["chat api", "vision", "stream", "error", "400", "provider", "request"] },
  { path: "src/lib/chat/media.ts", keywords: ["image", "video", "generate", "edit foto", "media", "x.ai", "grok", "duration", "durasi"] },
  { path: "src/routes/image.tsx", keywords: ["image", "gambar", "foto", "edit foto", "generate image"] },
  { path: "src/routes/video.tsx", keywords: ["video", "generate video", "continue", "durasi", "duration", "photo to video"] },
  { path: "src/routes/outlook.tsx", keywords: ["outlook", "email", "inbox", "sent", "junk", "folder", "mail"] },
  { path: "src/components/github/GitHubConnect.tsx", keywords: ["github", "connect github", "token", "repo", "permission"] },
  { path: "src/lib/github/api.ts", keywords: ["github api", "repo", "file", "commit", "token", "update file", "tree"] },
  { path: "src/lib/github/chatCommand.ts", keywords: ["github agent", "github chat", "ai agent", "command", "push", "commit", "planner"] },
  { path: "src/styles.css", keywords: ["style", "css", "warna", "background", "lovable", "tampilan", "tema"] },
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

function isIndexCommand(lower: string): boolean {
  return lower.includes("index repo") || lower.includes("refresh repo") || lower.includes("scan repo") || lower.includes("buat database repo") || lower.includes("database repo");
}

function isCheckCommand(lower: string): boolean {
  return lower.includes("cek build") || lower.includes("check build") || lower.includes("cek status") || lower.includes("cek action") || lower.includes("cek workflow");
}

function looksLikeAppEditRequest(lower: string): boolean {
  const verbs = ["ubah", "edit", "hapus", "hilangkan", "tambah", "tambahkan", "perbaiki", "fix", "buat", "pindahkan", "ganti", "rapikan"];
  const appTargets = ["aplikasi", "website", "tombol", "menu", "halaman", "setting", "settings", "chat", "video", "image", "foto", "gambar", "outlook", "github", "provider", "api", "sidebar", "upload", "file", "riwayat", "tampilan", "warna", "lovable"];
  return verbs.some((v) => lower.includes(v)) && appTargets.some((t) => lower.includes(t));
}

function hasGitHubIntent(lower: string): boolean {
  return isPushCommand(lower) || isCancelCommand(lower) || isIndexCommand(lower) || isCheckCommand(lower) || lower.includes("github") || lower.includes("repo") || lower.includes("commit") || lower.includes("push") || looksLikeAppEditRequest(lower);
}

function isAddXaiProviderRequest(lower: string): boolean {
  const wantsXai = lower.includes("x.ai") || lower.includes("xai") || lower.includes("grok");
  const wantsProvider = lower.includes("provider") || lower.includes("preveder") || lower.includes("previder");
  const wantsSettings = lower.includes("setting") || lower.includes("settings") || lower.includes("menu");
  const wantsAdd = lower.includes("tambah") || lower.includes("tambahkan") || lower.includes("add");
  return wantsXai && wantsProvider && (wantsSettings || wantsAdd);
}

function loadPending(): PendingGitHubChange | null {
  try {
    const raw = localStorage.getItem(PENDING_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PendingGitHubChange & PendingFileChange;
    if (!parsed.changes && parsed.path && parsed.sha && parsed.content) {
      return { owner: parsed.owner, repo: parsed.repo, branch: parsed.branch, changes: [{ path: parsed.path, sha: parsed.sha, content: parsed.content }], message: parsed.message, summary: parsed.summary, createdAt: parsed.createdAt };
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

function loadIndex(config: GitHubConfig): RepoIndex | null {
  try {
    const raw = localStorage.getItem(INDEX_KEY);
    if (!raw) return null;
    const index = JSON.parse(raw) as RepoIndex;
    if (index.owner !== config.owner || index.repo !== config.repo || index.branch !== (config.branch || "main")) return null;
    return index;
  } catch {
    return null;
  }
}

function saveIndex(index: RepoIndex): void {
  localStorage.setItem(INDEX_KEY, JSON.stringify(index));
}

function requireGitHubConfig(config: GitHubConfig): void {
  if (!config.token.trim()) throw new Error("GitHub token belum diisi. Buka Settings → Chat API → GitHub Connect.");
  if (!config.owner || !config.repo) throw new Error("Repository GitHub belum dipilih di GitHub Connect.");
}

function isCodeFile(path: string): boolean {
  if (path.includes("node_modules/") || path.includes("dist/") || path.includes(".git/")) return false;
  return /\.(ts|tsx|js|jsx|css|json|html|md|yml|yaml|toml|env\.example)$/i.test(path);
}

function extOf(path: string): string {
  return path.split(".").pop()?.toLowerCase() ?? "";
}

async function buildRepoIndex(config: GitHubConfig): Promise<RepoIndex> {
  requireGitHubConfig(config);
  const tree = await getRepositoryTree({ token: config.token, owner: config.owner, repo: config.repo, branch: config.branch || "main" });
  const files = tree
    .filter((item: GitHubTreeItem) => item.type === "blob" && isCodeFile(item.path) && (item.size ?? 0) < 350000)
    .map((item) => ({
      path: item.path,
      sha: item.sha,
      size: item.size ?? 0,
      ext: extOf(item.path),
      scoreText: `${item.path} ${item.path.split(/[/.\-_]/).join(" ")}`.toLowerCase(),
    }))
    .slice(0, 350);

  const index = { owner: config.owner, repo: config.repo, branch: config.branch || "main", createdAt: Date.now(), files };
  saveIndex(index);
  return index;
}

async function getOrBuildIndex(config: GitHubConfig): Promise<RepoIndex> {
  const existing = loadIndex(config);
  if (existing && Date.now() - existing.createdAt < 1000 * 60 * 60 * 12) return existing;
  return buildRepoIndex(config);
}

function scoreFileForRequest(file: RepoIndexFile, request: string): number {
  const words = normalize(request).split(" ").filter((w) => w.length >= 3);
  const staticHint = STATIC_HINTS.find((hint) => hint.path === file.path);
  let score = 0;
  for (const word of words) {
    if (file.scoreText.includes(word)) score += 3;
    if (file.path.toLowerCase().includes(word)) score += 5;
  }
  if (staticHint) {
    for (const keyword of staticHint.keywords) {
      if (normalize(request).includes(keyword)) score += 8;
    }
  }
  if (file.path.startsWith("src/")) score += 1;
  if (file.ext === "tsx" || file.ext === "ts") score += 1;
  return score;
}

function selectCandidatePaths(index: RepoIndex, request: string): string[] {
  const ranked = index.files
    .map((file) => ({ file, score: scoreFileForRequest(file, request) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.file.path.length - b.file.path.length)
    .map((x) => x.file.path);
  const hints = STATIC_HINTS.map((hint) => hint.path).filter((path) => index.files.some((file) => file.path === path));
  return Array.from(new Set([...ranked, ...hints])).slice(0, MAX_FILES_FOR_AI);
}

async function loadCandidateFiles(config: GitHubConfig, request: string): Promise<LoadedRepoFile[]> {
  const index = await getOrBuildIndex(config);
  const paths = selectCandidatePaths(index, request);
  const loaded: LoadedRepoFile[] = [];
  let total = 0;
  for (const path of paths) {
    if (total > MAX_TOTAL_CHARS) break;
    try {
      const file = await getFileContent(config.token, config.owner, config.repo, path, config.branch || "main");
      const content = file.content.length > MAX_FILE_CHARS ? file.content.slice(0, MAX_FILE_CHARS) : file.content;
      total += content.length;
      loaded.push({ path, sha: file.sha, content });
    } catch {
      // ignore unreadable file
    }
  }
  if (loaded.length === 0) throw new Error("Tidak bisa membaca file kandidat dari GitHub repo.");
  return loaded;
}

function simpleDiff(oldContent: string, newContent: string): string {
  const oldLines = oldContent.split("\n");
  const newLines = newContent.split("\n");
  let changed = 0;
  const samples: string[] = [];
  const max = Math.max(oldLines.length, newLines.length);
  for (let i = 0; i < max; i++) {
    if (oldLines[i] !== newLines[i]) {
      changed++;
      if (samples.length < 12) {
        if (oldLines[i] !== undefined) samples.push(`- ${oldLines[i].slice(0, 120)}`);
        if (newLines[i] !== undefined) samples.push(`+ ${newLines[i].slice(0, 120)}`);
      }
    }
  }
  return `Perkiraan baris berubah: ${changed}\n\n${samples.join("\n")}`.trim();
}

function extractJson(text: string): AiEditResult {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const raw = (fenced ?? text).trim();
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) throw new Error("AI tidak mengembalikan JSON edit yang valid.");
  return JSON.parse(raw.slice(start, end + 1)) as AiEditResult;
}

function buildAiPrompt(request: string, files: LoadedRepoFile[], index: RepoIndex): string {
  const fileList = index.files.slice(0, 180).map((file) => `- ${file.path} (${file.ext}, ${file.size} bytes)`).join("\n");
  const fileBlock = files.map((file) => `--- FILE: ${file.path}\n${file.content}\n--- END FILE: ${file.path}`).join("\n\n");
  return [
    "User request:", request, "",
    "You are an AI Planner and code editing agent for a React + TypeScript + Tailwind app.",
    "Plan silently, then edit only files provided below. Return ONLY valid JSON. No markdown.",
    "JSON schema:", '{"summary":"short Indonesian summary","files":[{"path":"exact provided path","content":"full new file content"}]}',
    "Rules:",
    "- Read the repo index to understand available files.",
    "- Return full content for every edited file.",
    "- Do not include unchanged files.",
    "- Do not invent paths not provided in FILE blocks.",
    "- Keep API keys/secrets unchanged. Never add hardcoded secret keys.",
    "- If unclear, return an empty files array with a clear Indonesian summary.",
    "", "Repo index:", fileList, "", fileBlock,
  ].join("\n");
}

function insertXaiPreset(content: string): string {
  if (content.includes('name: "x.ai (Grok)"') || content.includes("name: 'x.ai (Grok)'")) return content;
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
  const marker = `  {\n    name: "OpenAI",`;
  if (content.includes(marker)) return content.replace(marker, `${preset}${marker}`);
  const end = content.lastIndexOf("];\n");
  if (end !== -1) return `${content.slice(0, end)}${preset}${content.slice(end)}`;
  throw new Error("Tidak bisa menemukan daftar PROVIDER_PRESETS.");
}

function pendingPreview(summary: string, changes: PendingFileChange[]): string {
  const diffs = changes.map((change) => {
    const preview = change.oldContent ? simpleDiff(change.oldContent, change.content) : "Preview diff tersedia setelah file lama dibaca.";
    return `### ${change.path}\n${preview}`;
  }).join("\n\n");
  return [
    "Saya sudah menyiapkan perubahan GitHub.", "", summary, "", "Preview diff:", diffs, "",
    "Belum ada perubahan yang di-commit. Ketik **PUSH** untuk commit ke GitHub, atau ketik **batal** untuk membatalkan.",
  ].join("\n");
}

async function prepareAddXaiProvider(config: GitHubConfig): Promise<string> {
  requireGitHubConfig(config);
  const path = "src/lib/chat/types.ts";
  const file = await getFileContent(config.token, config.owner, config.repo, path, config.branch || "main");
  const nextContent = insertXaiPreset(file.content);
  if (nextContent === file.content) return "Provider **x.ai (Grok)** sudah ada di daftar provider. Tidak ada perubahan yang perlu di-push.";
  const summary = ["AI Planner:", "- File provider ditemukan.", "- Preset x.ai disiapkan untuk Chat, Image, dan Video.", "", "File yang akan diedit:", `- \`${path}\``].join("\n");
  const changes = [{ path, sha: file.sha, content: nextContent, oldContent: file.content }];
  savePending({ owner: config.owner, repo: config.repo, branch: config.branch || "main", changes, message: "Add x.ai provider preset", summary, createdAt: Date.now() });
  return pendingPreview(summary, changes);
}

async function prepareAiEdit(config: GitHubConfig, request: string, provider?: ProviderConfig | null): Promise<string> {
  requireGitHubConfig(config);
  if (!provider?.apiKey?.trim() || !provider?.model?.trim()) return "Untuk edit GitHub otomatis, lengkapi Chat API provider dulu di Settings.";
  const index = await getOrBuildIndex(config);
  const files = await loadCandidateFiles(config, request);
  const prompt = buildAiPrompt(request, files, index);
  const result = await sendChat({
    provider: { ...provider, stream: false, maxTokens: Math.max(provider.maxTokens ?? 0, 6000) },
    messages: [
      { id: "github-agent-system", role: "system", content: "Return only valid JSON for the requested code edit.", createdAt: Date.now() },
      { id: "github-agent-user", role: "user", content: prompt, createdAt: Date.now() },
    ] as ChatMessage[],
  });
  const edit = extractJson(result.content);
  const allowed = new Map(files.map((file) => [file.path, file]));
  const changes = (edit.files ?? [])
    .filter((file): file is { path: string; content: string } => Boolean(file.path && typeof file.content === "string"))
    .filter((file) => allowed.has(file.path))
    .filter((file) => file.content !== allowed.get(file.path)?.content)
    .map((file) => ({ path: file.path, sha: allowed.get(file.path)!.sha, content: file.content, oldContent: allowed.get(file.path)!.content }));
  if (changes.length === 0) return edit.summary || "AI tidak menemukan perubahan yang aman untuk dibuat. Coba tulis perintah lebih spesifik.";
  const summary = ["AI Planner:", edit.summary || "Perubahan kode sudah disiapkan.", "", "File yang akan diedit:", ...changes.map((change) => `- \`${change.path}\``)].join("\n");
  savePending({ owner: config.owner, repo: config.repo, branch: config.branch || "main", changes, message: `AI update: ${request.slice(0, 60)}`, summary, createdAt: Date.now() });
  return pendingPreview(summary, changes);
}

async function pushPending(config: GitHubConfig): Promise<string> {
  requireGitHubConfig(config);
  const pending = loadPending();
  if (!pending) return "Tidak ada perubahan GitHub yang menunggu push.";
  if (pending.owner !== config.owner || pending.repo !== config.repo) return "Perubahan pending dibuat untuk repo berbeda. Kirim ulang perintah edit untuk repo yang sedang dipilih.";
  let commitSha = "";
  try {
    const commit = await commitMultipleFiles({ token: config.token, owner: pending.owner, repo: pending.repo, branch: pending.branch, files: pending.changes.map((c) => ({ path: c.path, content: c.content })), message: pending.message });
    commitSha = commit.sha;
  } catch {
    const commits: string[] = [];
    for (const change of pending.changes) {
      const result = await updateFileContent({ token: config.token, owner: pending.owner, repo: pending.repo, path: change.path, branch: pending.branch, sha: change.sha, content: change.content, message: pending.message });
      commits.push(result.commit?.sha ?? "");
    }
    commitSha = commits.filter(Boolean).at(-1) ?? "";
  }
  clearPending();
  if (commitSha) savePending({ ...pending, changes: [], summary: pending.summary, lastCommitSha: commitSha, createdAt: Date.now() });
  return ["Perubahan berhasil di-push ke GitHub ✅", commitSha ? `Commit: **${commitSha.slice(0, 8)}**` : "", "", "Ketik **cek build** untuk melihat status GitHub Actions/checks.", "Lakukan **Sync / Pull / Redeploy** di Lovable agar website ikut update."].filter(Boolean).join("\n");
}

async function checkBuildStatus(config: GitHubConfig): Promise<string> {
  requireGitHubConfig(config);
  const pending = loadPending();
  const ref = pending?.lastCommitSha || config.branch || "main";
  const [status, checks] = await Promise.all([
    getCommitStatus({ token: config.token, owner: config.owner, repo: config.repo, ref }).catch(() => null),
    getCommitCheckRuns({ token: config.token, owner: config.owner, repo: config.repo, ref }).catch(() => []),
  ]);
  const lines = [`Status build/check untuk \`${ref.slice(0, 8)}\`:`];
  if (status?.state) lines.push(`- Commit status: **${status.state}**`);
  if (checks.length) lines.push(...checks.slice(0, 10).map((c) => `- ${c.name}: **${c.conclusion || c.status}**`));
  if (!status?.state && checks.length === 0) lines.push("Belum ada GitHub Actions/checks yang ditemukan untuk commit/branch ini.");
  return lines.join("\n");
}

export async function runGitHubChatCommand(text: string, provider?: ProviderConfig | null): Promise<string | null> {
  const lower = normalize(text);
  if (!hasGitHubIntent(lower)) return null;
  const config = loadGitHubConfig();
  if (isCancelCommand(lower)) { clearPending(); return "Perubahan GitHub pending sudah dibatalkan."; }
  if (isIndexCommand(lower)) {
    const index = await buildRepoIndex(config);
    return `Repo Index / Database berhasil dibuat ✅\nFile terindeks: **${index.files.length}**\nRepo: **${index.owner}/${index.repo}** (${index.branch})`;
  }
  if (isCheckCommand(lower)) return checkBuildStatus(config);
  if (isPushCommand(lower)) return pushPending(config);
  if (isAddXaiProviderRequest(lower)) return prepareAddXaiProvider(config);
  return prepareAiEdit(config, text, provider);
}
