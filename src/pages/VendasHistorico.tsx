import { traduzErro } from "@/lib/errors";
import { useEffect, useMemo, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { brl } from "@/lib/format";
import { ArrowLeft, ShoppingBag, Printer, RefreshCw } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Periodo = "hoje" | "semana" | "mes" | "tudo";

type Venda = {
  id: string;
  created_at: string;
  total: number;
  desconto: number;
  forma_pagamento: string | null;
  status: string;
  cliente_id: string | null;
  cliente?: { nome: string } | null;
  pagamento_status?: string | null;
  pagarme_order_id?: string | null;
};

type Detalhe = Venda & {
  venda_itens: {
    id: string;
    quantidade: number;
    preco_unit: number;
    subtotal: number | null;
    produto: { nome: string } | null;
  }[];
};

const PERIODOS: { id: Periodo; label: string }[] = [
  { id: "hoje", label: "Hoje" },
  { id: "semana", label: "7 dias" },
  { id: "mes", label: "30 dias" },
  { id: "tudo", label: "Tudo" },
];

const PAGAMENTO_LABEL: Record<string, string> = {
  dinheiro: "Dinheiro",
  pix: "PIX",
  cartao_debito: "Débito",
  cartao_credito: "Crédito",
  misto: "Misto",
};

const VendasHistorico = () => {
  const [periodo, setPeriodo] = useState<Periodo>("mes");
  const [vendas, setVendas] = useState<Venda[]>([]);
  const [loading, setLoading] = useState(true);
  const [detalhe, setDetalhe] = useState<Detalhe | null>(null);
  const [loadingDetalhe, setLoadingDetalhe] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      let query = supabase
        .from("vendas")
        .select("id,created_at,total,desconto,forma_pagamento,status,pagamento_status,pagarme_order_id,cliente_id, cliente:clientes(nome)")
        .order("created_at", { ascending: false })
        .limit(500);
      if (periodo !== "tudo") {
        const since = new Date();
        if (periodo === "hoje") since.setHours(0, 0, 0, 0);
        if (periodo === "semana") since.setDate(since.getDate() - 7);
        if (periodo === "mes") since.setDate(since.getDate() - 30);
        query = query.gte("created_at", since.toISOString());
      }
      const { data, error } = await query;
      if (error) toast.error(traduzErro(error));
      setVendas((data as unknown as Venda[]) ?? []);
      setLoading(false);
    })();
  }, [periodo]);

  const totais = useMemo(() => {
    const concluidas = vendas.filter((v) => v.status === "concluida");
    const receita = concluidas.reduce((a, v) => a + Number(v.total), 0);
    return { count: concluidas.length, receita };
  }, [vendas]);

  const abrirDetalhe = async (id: string) => {
    setLoadingDetalhe(true);
    setDetalhe({ id } as Detalhe);
    const { data, error } = await supabase
      .from("vendas")
      .select(`
        id,created_at,total,desconto,forma_pagamento,status,pagamento_status,pagarme_order_id,cliente_id,
        cliente:clientes(nome),
        venda_itens(id,quantidade,preco_unit,subtotal, produto:produtos(nome))
      `)
      .eq("id", id)
      .maybeSingle();
    if (error) {
      toast.error(traduzErro(error));
      setDetalhe(null);
    } else if (data) {
      setDetalhe(data as unknown as Detalhe);
    }
    setLoadingDetalhe(false);
  };

  const [sincronizando, setSincronizando] = useState<string | null>(null);
  const consultarPagarme = async (vendaId: string) => {
    setSincronizando(vendaId);
    try {
      const { data, error } = await supabase.functions.invoke("check-pos-order-status", {
        body: { venda_id: vendaId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const pago = data?.pagamento_status === "pago";
      toast.success(
        pago
          ? "Pagamento confirmado!"
          : `Status no Pagar.me: ${data?.charge_status ?? data?.order_status ?? "—"}`,
      );
      // Atualiza linha local
      setVendas((prev) =>
        prev.map((v) =>
          v.id === vendaId
            ? {
                ...v,
                pagamento_status: data?.pagamento_status ?? v.pagamento_status,
                status: data?.status ?? v.status,
              }
            : v,
        ),
      );
      if (detalhe?.id === vendaId) {
        setDetalhe((d) =>
          d
            ? {
                ...d,
                pagamento_status: data?.pagamento_status ?? d.pagamento_status,
                status: data?.status ?? d.status,
              }
            : d,
        );
      }
    } catch (e) {
      toast.error(traduzErro(e, "Falha ao consultar Pagar.me"));
    } finally {
      setSincronizando(null);
    }
  };

  return (
    <AppLayout>
      <div className="max-w-6xl mx-auto space-y-6">
        <div>
          <Link to="/vendas" className="mono text-xs text-muted-foreground hover:text-primary inline-flex items-center gap-1">
            <ArrowLeft className="h-3 w-3" /> voltar para o PDV
          </Link>
          <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
            <div>
              <span className="mono text-[10px] uppercase tracking-widest text-muted-foreground">Vendas</span>
              <h1 className="font-display text-4xl font-bold tracking-tight mt-1">Histórico</h1>
            </div>
            <div className="flex items-baseline gap-6">
              <div>
                <div className="mono text-[10px] uppercase tracking-widest text-muted-foreground">Vendas</div>
                <div className="num text-2xl font-bold">{totais.count}</div>
              </div>
              <div>
                <div className="mono text-[10px] uppercase tracking-widest text-muted-foreground">Receita</div>
                <div className="num text-2xl font-bold text-primary">{brl(totais.receita)}</div>
              </div>
            </div>
          </div>
        </div>

        <div className="inline-flex rounded-lg border border-border p-1 bg-card">
          {PERIODOS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setPeriodo(p.id)}
              className={cn(
                "mono text-[10px] uppercase tracking-widest px-4 py-1.5 rounded-md transition-colors",
                periodo === p.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {p.label}
            </button>
          ))}
        </div>

        <Card className="overflow-hidden shadow-soft-sm">
          {loading ? (
            <div className="p-6 space-y-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : vendas.length === 0 ? (
            <div className="p-16 text-center">
              <ShoppingBag className="h-10 w-10 mx-auto text-muted-foreground/30" />
              <p className="mt-3 font-display text-xl font-bold">Nenhuma venda no período</p>
              <p className="text-sm text-muted-foreground mt-1">
                Tente um período maior ou comece a vender no PDV.
              </p>
              <Link to="/vendas">
                <Button className="mt-5">Abrir PDV</Button>
              </Link>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40">
                  <tr className="text-left mono text-[10px] uppercase tracking-widest text-muted-foreground">
                    <th className="px-5 py-3 font-medium">Data</th>
                    <th className="px-5 py-3 font-medium">Cliente</th>
                    <th className="px-5 py-3 font-medium">Pagamento</th>
                    <th className="px-5 py-3 font-medium">Status</th>
                    <th className="px-5 py-3 font-medium">Pgto.</th>
                    <th className="px-5 py-3 font-medium text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {vendas.map((v) => {
                    const dt = new Date(v.created_at);
                    const ps = v.pagamento_status ?? "pago";
                    const podeConsultar =
                      !!v.pagarme_order_id && (ps === "pendente" || ps === "falhou");
                    return (
                      <tr
                        key={v.id}
                        onClick={() => abrirDetalhe(v.id)}
                        className="cursor-pointer hover:bg-muted/40 transition-colors"
                      >
                        <td className="px-5 py-3">
                          <div>{dt.toLocaleDateString("pt-BR")}</div>
                          <div className="mono text-[10px] text-muted-foreground">
                            {dt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                          </div>
                        </td>
                        <td className="px-5 py-3">
                          {v.cliente?.nome ?? <span className="text-muted-foreground">Sem cliente</span>}
                        </td>
                        <td className="px-5 py-3 mono text-xs">
                          {v.forma_pagamento ? PAGAMENTO_LABEL[v.forma_pagamento] ?? v.forma_pagamento : "—"}
                        </td>
                        <td className="px-5 py-3">
                          <Badge
                            variant="outline"
                            className={cn(
                              "mono text-[10px] border-0",
                              v.status === "concluida" && "bg-primary-soft text-primary",
                              v.status === "cancelada" && "bg-destructive/10 text-destructive",
                              v.status === "rascunho" && "bg-muted text-muted-foreground",
                            )}
                          >
                            {v.status}
                          </Badge>
                        </td>
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-2">
                            <Badge
                              variant="outline"
                              className={cn(
                                "mono text-[10px] border-0",
                                ps === "pago" && "bg-primary-soft text-primary",
                                ps === "pendente" && "bg-amber-500/15 text-amber-700 dark:text-amber-400",
                                ps === "falhou" && "bg-destructive/10 text-destructive",
                              )}
                            >
                              {ps}
                            </Badge>
                            {podeConsultar && (
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                className="h-7 px-2"
                                disabled={sincronizando === v.id}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  consultarPagarme(v.id);
                                }}
                                title="Consultar status no Pagar.me"
                              >
                                <RefreshCw
                                  className={cn(
                                    "h-3.5 w-3.5",
                                    sincronizando === v.id && "animate-spin",
                                  )}
                                />
                              </Button>
                            )}
                          </div>
                        </td>
                        <td className="px-5 py-3 text-right num font-bold">{brl(v.total)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      <Dialog open={!!detalhe} onOpenChange={(o) => { if (!o) setDetalhe(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl">Detalhes da venda</DialogTitle>
          </DialogHeader>
          {loadingDetalhe || !detalhe?.venda_itens ? (
            <div className="space-y-2 py-4">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          ) : (
            <div className="space-y-4 py-2">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <div className="mono text-[10px] uppercase tracking-widest text-muted-foreground">Cupom</div>
                  <div className="mono text-xs mt-0.5">{detalhe.id.slice(0, 8).toUpperCase()}</div>
                </div>
                <div>
                  <div className="mono text-[10px] uppercase tracking-widest text-muted-foreground">Data</div>
                  <div className="text-xs mt-0.5">{new Date(detalhe.created_at).toLocaleString("pt-BR")}</div>
                </div>
                <div>
                  <div className="mono text-[10px] uppercase tracking-widest text-muted-foreground">Cliente</div>
                  <div className="text-xs mt-0.5">{detalhe.cliente?.nome ?? "Sem cliente"}</div>
                </div>
                <div>
                  <div className="mono text-[10px] uppercase tracking-widest text-muted-foreground">Pagamento</div>
                  <div className="text-xs mt-0.5">
                    {detalhe.forma_pagamento ? PAGAMENTO_LABEL[detalhe.forma_pagamento] ?? detalhe.forma_pagamento : "—"}
                  </div>
                </div>
              </div>

              <div>
                <div className="mono text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Itens</div>
                <ul className="divide-y divide-border border border-border rounded-lg">
                  {detalhe.venda_itens.map((it) => (
                    <li key={it.id} className="flex items-start justify-between gap-3 px-3 py-2.5 text-sm">
                      <div className="flex-1 min-w-0">
                        <div className="font-medium leading-tight line-clamp-2">
                          {it.produto?.nome ?? "Produto removido"}
                        </div>
                        <div className="mono text-[10px] text-muted-foreground mt-0.5">
                          {it.quantidade} × {brl(it.preco_unit)}
                        </div>
                      </div>
                      <span className="num font-bold">{brl(Number(it.subtotal ?? it.quantidade * it.preco_unit))}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="border-t border-border pt-3 space-y-1">
                {detalhe.desconto > 0 && (
                  <div className="flex justify-between text-sm text-destructive">
                    <span>Desconto</span>
                    <span className="num">- {brl(detalhe.desconto)}</span>
                  </div>
                )}
                <div className="flex justify-between items-baseline">
                  <span className="mono text-[10px] uppercase tracking-widest text-muted-foreground">Total</span>
                  <span className="num text-2xl font-bold text-primary">{brl(detalhe.total)}</span>
                </div>
              </div>

              <div className="flex flex-wrap justify-end gap-2 pt-1">
                {detalhe.pagarme_order_id &&
                  (detalhe.pagamento_status === "pendente" ||
                    detalhe.pagamento_status === "falhou") && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-9"
                      disabled={sincronizando === detalhe.id}
                      onClick={() => consultarPagarme(detalhe.id)}
                    >
                      <RefreshCw
                        className={cn(
                          "h-3.5 w-3.5 mr-1.5",
                          sincronizando === detalhe.id && "animate-spin",
                        )}
                      />
                      Consultar Pagar.me
                    </Button>
                  )}
                <Link to={`/vendas/${detalhe.id}/recibo`} target="_blank" rel="noopener noreferrer">
                  <Button variant="outline" size="sm" className="h-9">
                    <Printer className="h-3.5 w-3.5 mr-1.5" /> Ver / imprimir recibo
                  </Button>
                </Link>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
};

export default VendasHistorico;