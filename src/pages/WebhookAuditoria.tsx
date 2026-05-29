import { useEffect, useState } from "react";
import { Navigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { AppLayout } from "@/components/AppLayout";
import { Shield, RefreshCw, Search, Webhook, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type WebhookLog = {
  id: string;
  source: string;
  event_type: string | null;
  pagarme_order_id: string | null;
  pagarme_charge_id: string | null;
  venda_id: string | null;
  http_status: number | null;
  auth_ok: boolean | null;
  ip: string | null;
  headers: unknown;
  payload: unknown;
  response: unknown;
  error: string | null;
  created_at: string;
};

const WebhookAuditoria = () => {
  const [authChecked, setAuthChecked] = useState(false);
  const [isSuper, setIsSuper] = useState(false);
  const [logs, setLogs] = useState<WebhookLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<WebhookLog | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("webhook_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) toast.error("Erro ao carregar logs");
    else setLogs((data ?? []) as WebhookLog[]);
    setLoading(false);
  };

  useEffect(() => {
    (async () => {
      const { data: roleData } = await supabase.rpc("is_super_admin");
      const ok = roleData === true;
      setIsSuper(ok);
      setAuthChecked(true);
      if (ok) await load();
    })();
  }, []);

  if (!authChecked) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface">
        <div className="mono text-sm text-muted-foreground">carregando…</div>
      </div>
    );
  }

  if (!isSuper) return <Navigate to="/dashboard" replace />;

  const filtered = logs.filter((l) => {
    const s = q.trim().toLowerCase();
    if (!s) return true;
    return (
      (l.event_type ?? "").toLowerCase().includes(s) ||
      (l.pagarme_order_id ?? "").toLowerCase().includes(s) ||
      (l.pagarme_charge_id ?? "").toLowerCase().includes(s) ||
      (l.venda_id ?? "").toLowerCase().includes(s) ||
      (l.ip ?? "").includes(s)
    );
  });

  const statusVariant = (s: number | null): "default" | "destructive" | "secondary" => {
    if (!s) return "secondary";
    if (s >= 200 && s < 300) return "default";
    return "destructive";
  };

  return (
    <AppLayout>
      <div className="space-y-5 max-w-7xl">
        <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-muted-foreground mono text-[10px] uppercase tracking-widest">
              <Shield className="h-3.5 w-3.5" /> Super Admin
            </div>
            <h1 className="font-display text-3xl font-bold tracking-tight mt-1 flex items-center gap-2">
              <Webhook className="h-7 w-7" /> Auditoria de Webhooks
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Histórico das últimas 200 requisições recebidas no webhook do Pagar.me.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link to="/admin"><ArrowLeft className="h-4 w-4 mr-1" /> Admin</Link>
            </Button>
            <Button variant="outline" size="sm" onClick={load} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-1 ${loading ? "animate-spin" : ""}`} /> Atualizar
            </Button>
          </div>
        </header>

        <div className="relative max-w-md">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por evento, order_id, charge_id, venda, IP…"
            className="pl-9 h-11"
          />
        </div>

        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-14" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <Card className="p-12 text-center">
            <Webhook className="h-10 w-10 mx-auto text-muted-foreground opacity-40" />
            <p className="mt-3 text-muted-foreground">Nenhum log encontrado.</p>
          </Card>
        ) : (
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40">
                  <tr className="text-left mono text-[10px] uppercase tracking-widest text-muted-foreground">
                    <th className="px-3 py-2.5">Quando</th>
                    <th className="px-3 py-2.5">Evento</th>
                    <th className="px-3 py-2.5">HTTP</th>
                    <th className="px-3 py-2.5">Auth</th>
                    <th className="px-3 py-2.5">Order</th>
                    <th className="px-3 py-2.5">Venda</th>
                    <th className="px-3 py-2.5">IP</th>
                    <th className="px-3 py-2.5"></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((l) => (
                    <tr key={l.id} className="border-t border-border hover:bg-muted/30">
                      <td className="px-3 py-2 mono text-xs whitespace-nowrap">
                        {new Date(l.created_at).toLocaleString("pt-BR")}
                      </td>
                      <td className="px-3 py-2 mono text-xs">{l.event_type ?? "—"}</td>
                      <td className="px-3 py-2">
                        <Badge variant={statusVariant(l.http_status)} className="mono text-[10px]">
                          {l.http_status ?? "—"}
                        </Badge>
                      </td>
                      <td className="px-3 py-2">
                        {l.auth_ok === true ? (
                          <Badge className="mono text-[10px]">ok</Badge>
                        ) : l.auth_ok === false ? (
                          <Badge variant="destructive" className="mono text-[10px]">falhou</Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2 mono text-[10px] truncate max-w-[140px]" title={l.pagarme_order_id ?? ""}>
                        {l.pagarme_order_id ?? "—"}
                      </td>
                      <td className="px-3 py-2 mono text-[10px] truncate max-w-[120px]" title={l.venda_id ?? ""}>
                        {l.venda_id ? l.venda_id.slice(0, 8) : "—"}
                      </td>
                      <td className="px-3 py-2 mono text-[10px] text-muted-foreground">{l.ip ?? "—"}</td>
                      <td className="px-3 py-2">
                        <Button size="sm" variant="ghost" onClick={() => setSelected(l)}>
                          ver
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Webhook className="h-5 w-5" /> {selected?.event_type ?? "webhook"}{" "}
              <Badge variant={statusVariant(selected?.http_status ?? null)} className="mono text-[10px]">
                {selected?.http_status}
              </Badge>
            </DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-3 mono text-xs">
                <div><span className="text-muted-foreground">Quando:</span> {new Date(selected.created_at).toLocaleString("pt-BR")}</div>
                <div><span className="text-muted-foreground">IP:</span> {selected.ip ?? "—"}</div>
                <div><span className="text-muted-foreground">Order:</span> {selected.pagarme_order_id ?? "—"}</div>
                <div><span className="text-muted-foreground">Charge:</span> {selected.pagarme_charge_id ?? "—"}</div>
                <div className="col-span-2"><span className="text-muted-foreground">Venda:</span> {selected.venda_id ?? "—"}</div>
              </div>
              {selected.error && (
                <div>
                  <div className="mono text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Erro</div>
                  <pre className="bg-destructive/10 text-destructive p-3 rounded text-xs whitespace-pre-wrap">{selected.error}</pre>
                </div>
              )}
              <div>
                <div className="mono text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Payload</div>
                <pre className="bg-muted/40 p-3 rounded text-xs overflow-x-auto">{JSON.stringify(selected.payload, null, 2)}</pre>
              </div>
              {selected.response != null && (
                <div>
                  <div className="mono text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Resposta interna</div>
                  <pre className="bg-muted/40 p-3 rounded text-xs overflow-x-auto">{JSON.stringify(selected.response, null, 2)}</pre>
                </div>
              )}
              <div>
                <div className="mono text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Headers</div>
                <pre className="bg-muted/40 p-3 rounded text-xs overflow-x-auto">{JSON.stringify(selected.headers, null, 2)}</pre>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
};

export default WebhookAuditoria;