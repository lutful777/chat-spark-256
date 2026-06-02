import { useEffect, useState } from "react";
import { Database, Loader2, Save } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  loadSupabaseMemoryConfig,
  saveSupabaseMemoryConfig,
  testSupabaseMemoryConnection,
} from "@/lib/memory/supabaseMemory";

export function SupabaseMemoryKey() {
  const [key, setKey] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const saved = loadSupabaseMemoryConfig();
    setKey(saved.anonKey);
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
    setLoading(true);
    try {
      await testSupabaseMemoryConnection(next);
      saveSupabaseMemoryConfig(next);
      toast.success("AI Memory Supabase aktif.");
    } catch (err) {
      saveSupabaseMemoryConfig(next);
      toast.error(err instanceof Error ? err.message : "Gagal test Supabase, tapi key tetap disimpan.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-2xl border border-border bg-muted/20 p-3">
      <div className="mb-2 flex items-center gap-2">
        <Database className="size-4 text-primary" />
        <h3 className="text-sm font-semibold">AI Memory Supabase</h3>
      </div>
      <p className="mb-3 text-xs text-muted-foreground">
        Isi publishable key saja. Memori AI dibaca dari Supabase; API key dan history chat tetap di perangkat ini.
      </p>
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
          <Button onClick={save} disabled={loading} className="shrink-0 gap-2 rounded-xl">
            {loading ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
            Simpan
          </Button>
        </div>
      </div>
    </div>
  );
}
