import { useEffect, useState } from "react";
import { Database, Loader2, LogOut, Save, UserRound } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getRoleForEmail } from "@/lib/app/roles";
import {
  loadSupabaseAuthSession,
  loadSupabaseMemoryConfig,
  saveSupabaseMemoryConfig,
  signInSupabaseAuth,
  signOutSupabaseAuth,
  signUpSupabaseAuth,
  testSupabaseMemoryConnection,
  type SupabaseAuthSession,
} from "@/lib/memory/supabaseMemory";

export function SupabaseMemoryKey() {
  const [key, setKey] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [session, setSession] = useState<SupabaseAuthSession | null>(null);
  const [loading, setLoading] = useState<string | null>(null);

  useEffect(() => {
    const saved = loadSupabaseMemoryConfig();
    setKey(saved.anonKey);
    setSession(loadSupabaseAuthSession());
  }, []);

  const save = async () => {
    const clean = key.trim();
    if (!clean) return toast.error("Isi Supabase publishable key dulu.");
    if (clean.startsWith("sb_secret_")) {
      return toast.error("Jangan pakai secret key. Pakai sb_publishable_...");
    }
    if (!clean.startsWith("sb_publishable_") && !clean.startsWith("eyJ")) {
      return toast.error("Key harus publishable/anon public key Supabase.");
    }

    const config = loadSupabaseMemoryConfig();
    const next = { ...config, anonKey: clean, enabled: true };
    setLoading("save");
    try {
      await testSupabaseMemoryConnection(next);
      saveSupabaseMemoryConfig(next);
      toast.success("Supabase Memory aktif. Lanjut login/register.");
    } catch (err) {
      saveSupabaseMemoryConfig(next);
      toast.error(err instanceof Error ? err.message : "Gagal test Supabase, tapi key tetap disimpan.");
    } finally {
      setLoading(null);
    }
  };

  const login = async () => {
    if (!email.trim() || password.length < 6) return toast.error("Isi email dan password minimal 6 karakter.");
    setLoading("login");
    try {
      const next = await signInSupabaseAuth(email, password);
      setSession(next);
      setPassword("");
      toast.success("Login memory berhasil.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Login gagal.");
    } finally {
      setLoading(null);
    }
  };

  const register = async () => {
    if (!email.trim() || password.length < 6) return toast.error("Isi email dan password minimal 6 karakter.");
    setLoading("register");
    try {
      const next = await signUpSupabaseAuth(email, password);
      if (next) {
        setSession(next);
        setPassword("");
        toast.success("Register berhasil dan sudah login.");
      } else {
        toast.success("Register berhasil. Cek email jika Supabase meminta verifikasi, lalu Login.");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Register gagal.");
    } finally {
      setLoading(null);
    }
  };

  const logout = async () => {
    setLoading("logout");
    try {
      await signOutSupabaseAuth();
      setSession(null);
      toast.success("Logout memory berhasil.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Logout gagal.");
    } finally {
      setLoading(null);
    }
  };

  const roleLabel = getRoleForEmail(session?.user.email);

  return (
    <div className="rounded-2xl border border-border bg-muted/20 p-3">
      <div className="mb-2 flex items-center gap-2">
        <Database className="size-4 text-primary" />
        <h3 className="text-sm font-semibold">Private AI Memory</h3>
      </div>
      <p className="mb-3 text-xs text-muted-foreground">
        Memory otomatis per akun Supabase. Tidak menyimpan API key, file upload, gambar, video, atau attachment besar.
      </p>

      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Supabase Publishable Key</Label>
          <div className="flex gap-2">
            <Input
              value={key}
              onChange={(e) => setKey(e.target.value)}
              type="password"
              placeholder="sb_publishable_..."
              autoComplete="off"
              className="rounded-xl"
            />
            <Button onClick={save} disabled={loading !== null} className="shrink-0 gap-2 rounded-xl">
              {loading === "save" ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
              Simpan
            </Button>
          </div>
        </div>

        {session ? (
          <div className="rounded-xl border border-primary/25 bg-primary/10 p-3 text-xs">
            <div className="mb-2 flex items-center gap-2 font-medium text-primary">
              <UserRound className="size-4" /> Memory login: {session.user.email || session.user.id}
            </div>
            <div className="mb-3 inline-flex rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
              {roleLabel}
            </div>
            <Button variant="outline" size="sm" onClick={logout} disabled={loading !== null} className="gap-2 rounded-xl">
              {loading === "logout" ? <Loader2 className="size-4 animate-spin" /> : <LogOut className="size-4" />}
              Logout Memory
            </Button>
          </div>
        ) : (
          <div className="rounded-xl border border-border bg-background/50 p-3">
            <div className="mb-2 flex items-center gap-2">
              <UserRound className="size-4 text-primary" />
              <p className="text-xs font-semibold">Login / Register Memory</p>
            </div>
            <div className="space-y-2">
              <Input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                type="email"
                placeholder="email@example.com"
                autoComplete="email"
                className="rounded-xl"
              />
              <Input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type="password"
                placeholder="Password minimal 6 karakter"
                autoComplete="current-password"
                className="rounded-xl"
              />
              <div className="flex flex-wrap gap-2">
                <Button onClick={login} disabled={loading !== null} className="gap-2 rounded-xl">
                  {loading === "login" ? <Loader2 className="size-4 animate-spin" /> : <UserRound className="size-4" />}
                  Login
                </Button>
                <Button variant="secondary" onClick={register} disabled={loading !== null} className="gap-2 rounded-xl">
                  {loading === "register" ? <Loader2 className="size-4 animate-spin" /> : <UserRound className="size-4" />}
                  Register
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Email lutfulh19@gmail.com dikenali sebagai Owner · Admin · Developer setelah login/register.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
