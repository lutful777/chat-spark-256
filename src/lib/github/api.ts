const GITHUB_KEY = "aiapichat:github";
const GITHUB_API = "https://api.github.com";

export interface GitHubConfig {
  token: string;
  owner: string;
  repo: string;
  branch: string;
  username?: string;
}

export interface GitHubUser {
  login: string;
  name?: string | null;
  avatar_url?: string;
  html_url?: string;
}

export interface GitHubRepo {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  default_branch: string;
  html_url: string;
  updated_at: string;
  permissions?: { admin?: boolean; push?: boolean; pull?: boolean };
}

export interface GitHubSearchFile {
  name: string;
  path: string;
  html_url: string;
  repository: { full_name: string };
}

export interface GitHubFileContent {
  path: string;
  name: string;
  sha: string;
  content: string;
  encoding: string;
  html_url?: string;
}

export function loadGitHubConfig(): GitHubConfig {
  if (typeof localStorage === "undefined") return { token: "", owner: "", repo: "", branch: "main" };
  try {
    const raw = localStorage.getItem(GITHUB_KEY);
    if (!raw) return { token: "", owner: "", repo: "", branch: "main" };
    const p = JSON.parse(raw) as Partial<GitHubConfig>;
    return {
      token: p.token ?? "",
      owner: p.owner ?? "",
      repo: p.repo ?? "",
      branch: p.branch || "main",
      username: p.username,
    };
  } catch {
    return { token: "", owner: "", repo: "", branch: "main" };
  }
}

export function saveGitHubConfig(config: GitHubConfig): void {
  localStorage.setItem(GITHUB_KEY, JSON.stringify(config));
}

export function clearGitHubConfig(): void {
  localStorage.removeItem(GITHUB_KEY);
}

function token(tokenValue: string): string {
  const clean = tokenValue.trim();
  if (!clean) throw new Error("GitHub token belum diisi.");
  return clean;
}

async function githubFetch<T>(tokenValue: string, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${GITHUB_API}${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token(tokenValue)}`,
      "X-GitHub-Api-Version": "2022-11-28",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers ?? {}),
    },
  });

  if (!res.ok) {
    let detail = "";
    try {
      const body = await res.json();
      detail = body?.message ?? "";
    } catch {
      detail = await res.text().catch(() => "");
    }
    throw new Error(`GitHub ${res.status}: ${detail || res.statusText}`);
  }

  return (await res.json()) as T;
}

export async function fetchGitHubUser(tokenValue: string): Promise<GitHubUser> {
  return githubFetch<GitHubUser>(tokenValue, "/user");
}

export async function listUserRepos(tokenValue: string): Promise<GitHubRepo[]> {
  return githubFetch<GitHubRepo[]>(
    tokenValue,
    "/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator,organization_member",
  );
}

export function parseRepoFullName(fullName: string): { owner: string; repo: string } {
  const [owner, repo] = fullName.trim().split("/");
  if (!owner || !repo) throw new Error("Format repo harus owner/repo.");
  return { owner, repo };
}

export async function searchRepoFiles(
  tokenValue: string,
  owner: string,
  repo: string,
  query: string,
): Promise<GitHubSearchFile[]> {
  const q = query.trim();
  if (!q) throw new Error("Masukkan keyword atau nama file.");
  const search = encodeURIComponent(`${q} repo:${owner}/${repo}`);
  const data = await githubFetch<{ items?: GitHubSearchFile[] }>(
    tokenValue,
    `/search/code?q=${search}&per_page=30`,
  );
  return data.items ?? [];
}

function decodeBase64Utf8(base64: string): string {
  const binary = atob(base64.replace(/\n/g, ""));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

function encodeBase64Utf8(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary);
}

export async function getFileContent(
  tokenValue: string,
  owner: string,
  repo: string,
  path: string,
  branch: string,
): Promise<GitHubFileContent> {
  const safePath = path.split("/").map(encodeURIComponent).join("/");
  const data = await githubFetch<GitHubFileContent & { type?: string }>(
    tokenValue,
    `/repos/${owner}/${repo}/contents/${safePath}?ref=${encodeURIComponent(branch || "main")}`,
  );

  if (data.type && data.type !== "file") throw new Error("Path ini bukan file.");
  return { ...data, content: decodeBase64Utf8(data.content ?? "") };
}

export async function updateFileContent(args: {
  token: string;
  owner: string;
  repo: string;
  path: string;
  branch: string;
  sha: string;
  content: string;
  message: string;
}): Promise<{ commit?: { sha: string; html_url?: string }; content?: { sha: string } }> {
  const safePath = args.path.split("/").map(encodeURIComponent).join("/");
  return githubFetch(args.token, `/repos/${args.owner}/${args.repo}/contents/${safePath}`, {
    method: "PUT",
    body: JSON.stringify({
      message: args.message.trim(),
      content: encodeBase64Utf8(args.content),
      sha: args.sha,
      branch: args.branch || "main",
    }),
  });
}
