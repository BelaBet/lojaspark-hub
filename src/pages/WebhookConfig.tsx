import { useEffect, useState } from "react";
import { Navigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Shield, Webhook, Copy, CheckCircle2, XCircle, RefreshCw } from "lucide-react";
import { toast } from "sonner";

type LogRow = {
  id: string;
  created_at: string;
  http_status: number | null;
  auth_ok: boolean | null;
  error: string | null;
  event_type: string | null;
  ip: string | null;
};

const WEBHOOK_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/pagarme-webhook`;

export default function WebhookConfig() {
  const [authChecked, setAuthChecked] = useState(false);
  const [isSuper, setIsSuper] = useState(false);
  const [user, setUser] = useState("");
  const [pass, setPass] = useState("");
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<null | {
    status: number;
    auth_ok: boolean;
    response: string;
  }>(null);
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.rpc("is_super_admin");
      setIsSuper(data === true);
      setAuthChecked(true);
      if (data === true) loadLogs();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadLogs() {
    setLoadingLogs(true);
    const { data, error } = await supabase
      .from("webhook_logs")
      .select("id, created_at, http_status, auth_ok, error, event_type, ip")
      .eq("source", "pagarme")
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) toast.error("Erro ao carregar logs");
    else setLogs((data as LogRow[]) ?? []);
    setLoadingLogs(false);
  }

  async function runTest() {
    if (!user || !pass) {
      toast.error("Preencha usuário e senha");
      return;
    }
    setTesting(true);
    setResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("test-pagarme-webhook", {
        body: { user, pass },
      });
      if (error) throw error;
      setResult({
        status: data.status,
        auth_ok: data.auth_ok,
        response: data.response,
      });
      if (data.auth_ok) toast.success("Basic Auth aceito pelo webhook");
      else toast.error(`Webhook retornou ${data.status} — credenciais não conferem`);
      await loadLogs();
    } catch (e: any) {
      toast.error(e.message || "Falha no teste");
    } finally {
      setTesting(false);
    }
  }

  function copy(s: string) {
    navigator.clipboard.writeText(s);
    toast.success("Copiado");
  }

  if (!authChecked) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface">
        <div className="mono text-sm text-muted-foreground">carregando…</div>
      </div>
    );
  }
  if (!isSuper) return <Navigate to="/dashboard" replace />;

  return (
    <AppLayout>
      <div className="space-y-5 max-w-3xl">
        <header>
          <div className="flex items-center gap-2 text-muted-foreground mono text-[10px] uppercase tracking-widest">
            <Shield className="h-3.5 w-3.5" /> Super Admin
          </div>
          <h1 className="font-display text-3xl font-bold tracking-tight mt-1">
            Configuração do Webhook Pagar.me
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Valide se as credenciais Basic Auth configuradas no painel Pagar.me batem com os
            secrets <code className="mono text-xs">PAGARME_WEBHOOK_USER</code> /{" "}
            <code className="mono text-xs">PAGARME_WEBHOOK_PASS</code>.
          </p>
        </header>

        <Card className="p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Webhook className="h-4 w-4" />
            <h2 className="font-display font-bold">URL do webhook</h2>
          </div>
          <div className="flex items-center gap-2">
            <Input readOnly value={WEBHOOK_URL} className="mono text-xs" />
            <Button variant="outline" size="sm" onClick={() => copy(WEBHOOK_URL)}>
              <Copy className="h-3.5 w-3.5" />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Cole essa URL em <strong>Pagar.me → Configurações → Webhooks</strong> e ative Basic
            Auth com o usuário/senha abaixo.
          </p>
        </Card>

        <Card className="p-5 space-y-4">
          <h2 className="font-display font-bold">Testar credenciais</h2>
          <p className="text-xs text-muted-foreground">
            Digite os mesmos valores cadastrados no Pagar.me. O servidor envia um POST sintético
            para o webhook usando essas credenciais e responde se a autenticação passou. Os
            valores digitados aqui não são salvos — para alterar os secrets, peça ao Lovable.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="wh-user">Usuário</Label>
              <Input
                id="wh-user"
                value={user}
                onChange={(e) => setUser(e.target.value)}
                autoComplete="off"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="wh-pass">Senha</Label>
              <Input
                id="wh-pass"
                type="password"
                value={pass}
                onChange={(e) => setPass(e.target.value)}
                autoComplete="off"
              />
            </div>
          </div>
          <Button onClick={runTest} disabled={testing}>
            {testing ? "Testando…" : "Testar webhook"}
          </Button>

          {result && (
            <div className="rounded-md border border-border p-3 space-y-1.5">
              <div className="flex items-center gap-2">
                {result.auth_ok ? (
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                ) : (
                  <XCircle className="h-4 w-4 text-destructive" />
                )}
                <span className="font-medium text-sm">
                  HTTP {result.status} — {result.auth_ok ? "Auth OK" : "Auth falhou"}
                </span>
              </div>
              <pre className="mono text-[11px] bg-muted/40 p-2 rounded whitespace-pre-wrap break-all">
                {result.response || "(sem corpo)"}
              </pre>
            </div>
          )}
        </Card>

        <Card className="p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-display font-bold">Últimos eventos recebidos</h2>
            <Button variant="ghost" size="sm" onClick={loadLogs} disabled={loadingLogs}>
              <RefreshCw className={`h-3.5 w-3.5 mr-1 ${loadingLogs ? "animate-spin" : ""}`} />
              Atualizar
            </Button>
          </div>
          {logs.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum evento ainda.</p>
          ) : (
            <div className="space-y-1.5">
              {logs.map((l) => (
                <div
                  key={l.id}
                  className="flex items-center gap-2 text-xs border-b border-border/40 py-1.5"
                >
                  {l.auth_ok ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-green-600 shrink-0" />
                  ) : (
                    <XCircle className="h-3.5 w-3.5 text-destructive shrink-0" />
                  )}
                  <span className="mono text-muted-foreground w-32 shrink-0">
                    {new Date(l.created_at).toLocaleString("pt-BR")}
                  </span>
                  <Badge variant="outline" className="mono text-[10px]">
                    {l.http_status ?? "—"}
                  </Badge>
                  <span className="truncate flex-1">{l.event_type ?? "(sem tipo)"}</span>
                  {l.error && (
                    <span className="text-destructive truncate max-w-[200px]">{l.error}</span>
                  )}
                </div>
              ))}
            </div>
          )}
          <div className="pt-2">
            <Button variant="link" size="sm" asChild className="px-0">
              <Link to="/admin/webhooks">Ver auditoria completa →</Link>
            </Button>
          </div>
        </Card>
      </div>
    </AppLayout>
  );
}