import { useEffect, useState } from "react";
import { CheckCircle2, Loader2, LogOut, Mail, ShieldCheck, UserRound } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  connectOutlook,
  disconnectOutlook,
  fetchOutlookProfile,
  getActiveAccount,
  loadOutlookConfig,
  saveOutlookConfig,
  type OutlookConfig,
  type OutlookProfile,
} from "@/lib/outlook/msal";

export function OutlookConnect() {
  const [config, setConfig] = useState<OutlookConfig>({ clientId: "", tenant: "common" });
  const [email, setEmail] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [testing, setTesting] = useState(false);
  const [profile, setProfile] = useState<OutlookProfile | null>(null);

  // Hydrate from localStorage and check for an existing session.
  useEffect(() => {
    const loaded = loadOutlookConfig();
    setConfig(loaded);
    if (loaded.email) setEmail(loaded.email);
    if (loaded.clientId.trim()) {
      getActiveAccount(loaded)
        .then((acc) => {
          if (acc?.username) {
            setEmail(acc.username);
            saveOutlookConfig({ ...loaded, email: acc.username });
          }
        })
        .catch(() => {
          /* no active session — ignore */
        });
    }
  }, []);

  const updateConfig = (patch: Partial<OutlookConfig>) => {
    setConfig((prev) => {
      const next = { ...prev, ...patch };
      saveOutlookConfig(next);
      return next;
    });
  };

  const handleConnect = async () => {
    if (!config.clientId.trim()) {
      toast.error("Isi Microsoft Client ID terlebih dahulu.");
      return;
    }
    setConnecting(true);
    try {
      const account = await connectOutlook(config);
      const acctEmail = account.username ?? null;
      setEmail(acctEmail);
      updateConfig({ email: acctEmail ?? undefined });
      toast.success("Outlook terhubung.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Gagal menghubungkan Outlook.";
      toast.error(message);
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    try {
      await disconnectOutlook(config);
    } catch {
      /* ignore — still clear UI state */
    }
    setEmail(null);
    setProfile(null);
    updateConfig({ email: undefined });
    toast.success("Outlook diputuskan.");
  };

  const handleTestProfile = async () => {
    setTesting(true);
    try {
      const p = await fetchOutlookProfile(config);
      setProfile(p);
      const acctEmail = p.mail ?? p.userPrincipalName ?? email;
      if (acctEmail) {
        setEmail(acctEmail);
        updateConfig({ email: acctEmail });
      }
      toast.success(`Profil berhasil diambil: ${p.displayName ?? acctEmail ?? "OK"}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Gagal mengambil profil.";
      toast.error(message);
    } finally {
      setTesting(false);
    }
  };

  const connected = Boolean(email);

  return (
    <section className="rounded-2xl border border-border bg-card p-4 md:p-6">
      <div className="mb-1 flex items-center gap-2">
        <Mail className="size-4 text-primary" />
        <h2 className="text-sm font-semibold">Microsoft Outlook</h2>
      </div>
      <p className="mb-4 text-xs text-muted-foreground">
        Hubungkan akun Microsoft via Microsoft Identity Platform (MSAL). Login dilakukan
        langsung ke Microsoft dengan izin kamu — aplikasi tidak pernah meminta email/password.
        Scope: User.Read, Mail.Read, Mail.Send, Calendars.Read, offline_access.
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label className="text-sm">Microsoft Client ID</Label>
          <Input
            value={config.clientId}
            onChange={(e) => updateConfig({ clientId: e.target.value })}
            placeholder="Application (client) ID dari Azure App Registration"
            className="rounded-xl"
            disabled={connected}
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-sm">Tenant (opsional)</Label>
          <Input
            value={config.tenant}
            onChange={(e) => updateConfig({ tenant: e.target.value })}
            placeholder="common"
            className="rounded-xl"
            disabled={connected}
          />
        </div>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Buat App Registration tipe <span className="font-medium">SPA</span> di Azure Portal dan
        tambahkan Redirect URI: <code className="rounded bg-muted px-1">{typeof window !== "undefined" ? window.location.origin : "https://your-app"}</code>
      </p>

      {connected && (
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-primary/30 bg-primary/10 px-3 py-2.5">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/15 px-2.5 py-1 text-xs font-medium text-primary">
            <CheckCircle2 className="size-3.5" /> Outlook Connected
          </span>
          <span className="inline-flex min-w-0 items-center gap-1.5 text-sm text-foreground">
            <UserRound className="size-4 shrink-0 text-muted-foreground" />
            <span className="truncate">{email}</span>
          </span>
        </div>
      )}

      {profile && (
        <div className="mt-3 rounded-xl border border-border bg-background/50 px-3 py-2.5 text-xs text-foreground">
          <div className="mb-1 flex items-center gap-1.5 font-medium">
            <ShieldCheck className="size-3.5 text-primary" /> Profil Microsoft Graph
          </div>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-muted-foreground">
            <dt>Nama</dt>
            <dd className="truncate text-foreground">{profile.displayName ?? "—"}</dd>
            <dt>Email</dt>
            <dd className="truncate text-foreground">
              {profile.mail ?? profile.userPrincipalName ?? "—"}
            </dd>
            {profile.jobTitle && (
              <>
                <dt>Jabatan</dt>
                <dd className="truncate text-foreground">{profile.jobTitle}</dd>
              </>
            )}
          </dl>
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {!connected ? (
          <Button onClick={handleConnect} disabled={connecting} className="gap-2 rounded-xl">
            {connecting ? <Loader2 className="size-4 animate-spin" /> : <Mail className="size-4" />}
            Connect Outlook
          </Button>
        ) : (
          <>
            <Button
              variant="secondary"
              onClick={handleTestProfile}
              disabled={testing}
              className="gap-2 rounded-xl"
            >
              {testing ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <ShieldCheck className="size-4" />
              )}
              Test ambil profil
            </Button>
            <Button
              variant="ghost"
              onClick={handleDisconnect}
              className="ml-auto gap-2 rounded-xl text-destructive hover:text-destructive"
            >
              <LogOut className="size-4" />
              Disconnect Outlook
            </Button>
          </>
        )}
      </div>
    </section>
  );
}