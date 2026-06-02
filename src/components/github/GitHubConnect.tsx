import { useEffect, useMemo, useState } from "react";
import {
  ExternalLink,
  FileCode2,
  Github,
  Loader2,
  Plug,
  Save,
  Search,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  clearGitHubConfig,
  fetchGitHubUser,
  getFileContent,
  listUserRepos,
  loadGitHubConfig,
  parseRepoFullName,
  saveGitHubConfig,
  searchRepoFiles,
  updateFileContent,
  type GitHubConfig,
  type GitHubFileContent,
  type GitHubRepo,
  type GitHubSearchFile,
} from "@/lib/github/api";

export function GitHubConnect() {
  const [config, setConfig] = useState<GitHubConfig>({
    token: "",
    owner: "",
    repo: "",
    branch: "main",
  });
  const [repos, setRepos] = useState<GitHubRepo[]>([]);
  const [keyword, setKeyword] = useState("");
  const [path, setPath] = useState("");
  const [results, setResults] = useState<GitHubSearchFile[]>([]);
  const [file, setFile] = useState<GitHubFileContent | null>(null);
  const [content, setContent] = useState("");
  const [commitMessage, setCommitMessage] = useState("Update file from app");
  const [loading, setLoading] = useState<string | null>(null);

  useEffect(() => {
    setConfig(loadGitHubConfig());
  }, []);

  const repoFullName = useMemo(
    () => (config.owner && config.repo ? `${config.owner}/${config.repo}` : ""),
    [config.owner, config.repo],
  );

  const patch = (delta: Partial<GitHubConfig>) => {
    setConfig((prev) => {
      const next = { ...prev, ...delta };
      saveGitHubConfig(next);
      return next;
    });
  };

  const connect = async () => {
    setLoading("connect");
    try {
      const user = await fetchGitHubUser(config.token);
      const repoList = await listUserRepos(config.token);
      setRepos(repoList);
      patch({ username: user.login });
      toast.success(`GitHub terhubung: ${user.login}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal konek GitHub.");
    } finally {
      setLoading(null);
    }
  };

  const disconnect = () => {
    clearGitHubConfig();
    setConfig({ token: "", owner: "", repo: "", branch: "main" });
    setRepos([]);
    setResults([]);
    setFile(null);
    setContent("");
    toast.success("GitHub diputuskan.");
  };

  const chooseRepo = (fullName: string) => {
    if (!fullName) return;
    const { owner, repo } = parseRepoFullName(fullName);
    const selected = repos.find((r) => r.full_name === fullName);
    patch({ owner, repo, branch: selected?.default_branch || "main" });
    setResults([]);
    setFile(null);
    setContent("");
  };

  const searchFiles = async () => {
    if (!config.owner || !config.repo) {
      toast.error("Pilih repo dulu.");
      return;
    }
    setLoading("search");
    try {
      const items = await searchRepoFiles(config.token, config.owner, config.repo, keyword);
      setResults(items);
      if (items.length === 0) toast.info("File tidak ditemukan.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Search gagal.");
    } finally {
      setLoading(null);
    }
  };

  const openFile = async (targetPath = path) => {
    if (!config.owner || !config.repo) {
      toast.error("Pilih repo dulu.");
      return;
    }
    if (!targetPath.trim()) {
      toast.error("Isi path file.");
      return;
    }
    setLoading("open");
    try {
      const opened = await getFileContent(
        config.token,
        config.owner,
        config.repo,
        targetPath.trim(),
        config.branch,
      );
      setPath(opened.path);
      setFile(opened);
      setContent(opened.content);
      toast.success("File dibuka.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal buka file.");
    } finally {
      setLoading(null);
    }
  };

  const commitFile = async () => {
    if (!file) {
      toast.error("Buka file dulu.");
      return;
    }
    setLoading("commit");
    try {
      const res = await updateFileContent({
        token: config.token,
        owner: config.owner,
        repo: config.repo,
        path: file.path,
        branch: config.branch,
        sha: file.sha,
        content,
        message: commitMessage,
      });
      setFile({ ...file, sha: res.content?.sha ?? file.sha, content });
      toast.success("File berhasil di-commit ke GitHub.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Commit gagal.");
    } finally {
      setLoading(null);
    }
  };

  return (
    <section className="rounded-2xl border border-border bg-card p-4 md:p-6">
      <div className="mb-3 flex items-center gap-2">
        <Github className="size-4 text-primary" />
        <h2 className="text-sm font-semibold">GitHub Connect</h2>
      </div>

      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label className="text-xs">GitHub Token</Label>
          <Input
            value={config.token}
            onChange={(e) => patch({ token: e.target.value })}
            type="password"
            placeholder="ghp_... atau github_pat_..."
            autoComplete="off"
            className="rounded-xl"
          />
          <p className="text-xs text-muted-foreground">
            Gunakan token GitHub. Untuk edit/push public repo: public_repo. Untuk private repo: repo.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button onClick={connect} disabled={loading !== null || !config.token.trim()} className="gap-2 rounded-xl">
            {loading === "connect" ? <Loader2 className="size-4 animate-spin" /> : <Plug className="size-4" />}
            Connect GitHub
          </Button>
          <Button variant="outline" onClick={disconnect} className="gap-2 rounded-xl">
            <Trash2 className="size-4" />
            Disconnect
          </Button>
        </div>

        {config.username && (
          <p className="rounded-xl border border-border bg-muted/30 px-3 py-2 text-xs">
            Terhubung sebagai <b>{config.username}</b>
          </p>
        )}

        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Pilih Repo</Label>
            <select
              value={repoFullName}
              onChange={(e) => chooseRepo(e.target.value)}
              className="h-10 w-full rounded-xl border border-input bg-background px-3 text-sm"
            >
              <option value="">Pilih repository...</option>
              {repos.map((repo) => (
                <option key={repo.id} value={repo.full_name}>
                  {repo.full_name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Branch</Label>
            <Input
              value={config.branch}
              onChange={(e) => patch({ branch: e.target.value || "main" })}
              placeholder="main"
              className="rounded-xl"
            />
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-[1fr_auto]">
          <div className="space-y-1.5">
            <Label className="text-xs">Search file by keyword</Label>
            <Input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void searchFiles()}
              placeholder="contoh: outlook, package.json, api"
              className="rounded-xl"
            />
          </div>
          <Button onClick={searchFiles} disabled={loading !== null} className="self-end gap-2 rounded-xl">
            {loading === "search" ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
            Search
          </Button>
        </div>

        {results.length > 0 && (
          <div className="space-y-2 rounded-xl border border-border p-2">
            {results.map((item) => (
              <button
                key={item.path}
                type="button"
                onClick={() => void openFile(item.path)}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-xs hover:bg-accent"
              >
                <FileCode2 className="size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate">{item.path}</span>
                <ExternalLink className="size-3 shrink-0" />
              </button>
            ))}
          </div>
        )}

        <div className="grid gap-3 md:grid-cols-[1fr_auto]">
          <div className="space-y-1.5">
            <Label className="text-xs">Open file by path</Label>
            <Input
              value={path}
              onChange={(e) => setPath(e.target.value)}
              placeholder="src/routes/index.tsx"
              className="rounded-xl"
            />
          </div>
          <Button variant="secondary" onClick={() => void openFile()} disabled={loading !== null} className="self-end rounded-xl">
            Open
          </Button>
        </div>

        {file && (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Editing: <b>{file.path}</b>
            </p>
            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={14}
              className="font-mono text-xs rounded-xl"
            />
            <Input
              value={commitMessage}
              onChange={(e) => setCommitMessage(e.target.value)}
              placeholder="Commit message"
              className="rounded-xl"
            />
            <Button onClick={commitFile} disabled={loading !== null} className="gap-2 rounded-xl">
              {loading === "commit" ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
              Commit to GitHub
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}
