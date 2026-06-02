import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Github, Loader2, Plug, ShieldCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SupabaseMemoryKey } from "@/components/memory/SupabaseMemoryKey";
import {
  clearGitHubConfig,
  fetchGitHubUser,
  listUserRepos,
  loadGitHubConfig,
  parseRepoFullName,
  saveGitHubConfig,
  type GitHubConfig,
  type GitHubRepo,
} from "@/lib/github/api";

export function GitHubConnect() {
  const [config, setConfig] = useState<GitHubConfig>({
    token: "",
    owner: "",
    repo: "",
    branch: "main",
  });
  const [repos, setRepos] = useState<GitHubRepo[]>([]);
  const [selectedRepo, setSelectedRepo] = useState<GitHubRepo | null>(null);
  const [loading, setLoading] = useState<string | null>(null);

  useEffect(() => {
    const saved = loadGitHubConfig();
    setConfig(saved);
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
      const matched = repoList.find((r) => r.full_name === repoFullName) ?? null;
      setSelectedRepo(matched);
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
    setSelectedRepo(null);
    toast.success("GitHub diputuskan.");
  };

  const chooseRepo = (fullName: string) => {
    if (!fullName) {
      patch({ owner: "", repo: "", branch: "main" });
      setSelectedRepo(null);
      return;
    }
    const { owner, repo } = parseRepoFullName(fullName);
    const selected = repos.find((r) => r.full_name === fullName) ?? null;
    setSelectedRepo(selected);
    patch({ owner, repo, branch: selected?.default_branch || "main" });
  };

  const connected = Boolean(config.username);
  const permissionText = selectedRepo?.permissions
    ? `${selectedRepo.permissions.admin ? "Admin" : selectedRepo.permissions.push ? "Write" : selectedRepo.permissions.pull ? "Read" : "No access"}`
    : "Belum dicek";

  return (
    <>
      <SupabaseMemoryKey />

      <section className="rounded-2xl border border-border bg-card p-4 md:p-6">
        <div className="mb-3 flex items-center gap-2">
          <Github className="size-4 text-primary" />
          <h2 className="text-sm font-semibold">GitHub Connect</h2>
        </div>
        <p className="mb-4 text-xs text-muted-foreground">
          Hanya untuk menghubungkan aplikasi ke GitHub. Menu search/edit file sudah dihapus dari UI.
          Akses admin penuh tergantung permission token GitHub yang kamu buat.
        </p>

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
              Untuk akses penuh gunakan token GitHub dengan izin repository yang sesuai, misalnya Contents read/write dan Administration jika memang diperlukan.
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

          {connected && (
            <div className="rounded-xl border border-primary/25 bg-primary/10 px-3 py-2 text-xs">
              <div className="flex items-center gap-1.5 font-medium text-primary">
                <CheckCircle2 className="size-3.5" /> Terhubung sebagai {config.username}
              </div>
            </div>
          )}

          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Repository</Label>
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
              <p className="text-xs text-muted-foreground">
                Klik Connect GitHub dulu agar daftar repo muncul.
              </p>
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

          <div className="rounded-xl border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
            <div className="mb-1 flex items-center gap-1.5 font-medium text-foreground">
              <ShieldCheck className="size-3.5 text-primary" /> Status akses repo
            </div>
            <p>
              Repo: <b>{repoFullName || "belum dipilih"}</b>
            </p>
            <p>
              Permission token untuk repo ini: <b>{permissionText}</b>
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
