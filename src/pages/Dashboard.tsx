import { useEffect, useMemo, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { brl, num } from "@/lib/format";
import {
  AlertTriangle, ShoppingBag, Users, TrendingUp, TrendingDown,
  Banknote, CalendarDays, AlertOctagon, ArrowUpRight, Package,
  CreditCard, QrCode, Clock, CheckCircle2, XCircle,
} from "lucide-react";
import { Link } from "react-router-dom";
import {
  Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { SplitSection } from "@/components/dashboard/SplitSection";

type Venda = {
  id: string;
  total: number;
  created_at: string;
  forma_pagamento: string | null;
  cliente_id: string | null;
  pagamento_status: string | null;
  clientes: { nome: string } | null;
};

type ItemTop = {
  produto_id: string;
  nome: string;
  quantidade: number;
  total: number;
};

type ChartPoint = { date: string; label: string; total: number };

const fmtPagamento = (p: string | null) => {
  switch (p) {
    case "dinheiro": return { label: "Dinheiro", icon: Banknote };
    case "pix": return { label: "PIX", icon: QrCode };
    case "cartao_debito": return { label: "Débito", icon: CreditCard };
    case "cartao_credito": return { label: "Crédito", icon: CreditCard };
    default: return { label: "—", icon: Banknote };
  }
};

const fmtHora = (iso: string) =>
  new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

const Dashboard = () => {
  const [loading, setLoading] = useState(true);

  // KPIs
  const [vendasHoje, setVendasHoje] = useState(0);
  const [vendasOntem, setVendasOntem] = useState(0);
  const [vendasMes, setVendasMes] = useState(0);
  const [vendasMesAnterior, setVendasMesAnterior] = useState(0);
  const [estoqueBaixo, setEstoqueBaixo] = useState(0);
  const [estoqueZerado, setEstoqueZerado] = useState(0);
  const [clientesNovos, setClientesNovos] = useState(0);

  // Pagar.me em tempo real
  const [pgPendentes, setPgPendentes] = useState(0);
  const [pgPagos, setPgPagos] = useState(0);
  const [pgFalhou, setPgFalhou] = useState(0);
  const [pgRecentes, setPgRecentes] = useState<Venda[]>([]);

  // Charts e listas
  const [chart, setChart] = useState<ChartPoint[]>([]);
  const [topProdutos, setTopProdutos] = useState<ItemTop[]>([]);
  const [ultimasVendas, setUltimasVendas] = useState<Venda[]>([]);

  useEffect(() => {
    void carregar();
    void carregarPagarme();

    const channel = supabase
      .channel("dashboard-vendas")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "vendas" },
        () => {
          void carregarPagarme();
          void carregar();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const carregarPagarme = async () => {
    const dias7 = new Date(); dias7.setDate(dias7.getDate() - 7);
    const [pendQ, pagoQ, falhouQ, recentesQ] = await Promise.all([
      supabase.from("vendas").select("id", { count: "exact", head: true })
        .eq("pagamento_status", "pendente").not("pagarme_order_id", "is", null),
      supabase.from("vendas").select("id", { count: "exact", head: true })
        .eq("pagamento_status", "pago").not("pagarme_order_id", "is", null)
        .gte("created_at", dias7.toISOString()),
      supabase.from("vendas").select("id", { count: "exact", head: true })
        .eq("pagamento_status", "falhou").not("pagarme_order_id", "is", null)
        .gte("created_at", dias7.toISOString()),
      supabase.from("vendas")
        .select("id, total, created_at, forma_pagamento, cliente_id, pagamento_status, clientes(nome)")
        .not("pagarme_order_id", "is", null)
        .order("created_at", { ascending: false })
        .limit(6),
    ]);
    setPgPendentes(pendQ.count ?? 0);
    setPgPagos(pagoQ.count ?? 0);
    setPgFalhou(falhouQ.count ?? 0);
    setPgRecentes((recentesQ.data ?? []) as unknown as Venda[]);
  };

  const carregar = async () => {
    setLoading(true);
    try {
      const agora = new Date();
      const hojeIni = new Date(agora); hojeIni.setHours(0, 0, 0, 0);
      const hojeFim = new Date(agora); hojeFim.setHours(23, 59, 59, 999);
      const ontemIni = new Date(hojeIni); ontemIni.setDate(ontemIni.getDate() - 1);
      const ontemFim = new Date(ontemIni); ontemFim.setHours(23, 59, 59, 999);
      const mesIni = new Date(agora.getFullYear(), agora.getMonth(), 1);
      const mesAntIni = new Date(agora.getFullYear(), agora.getMonth() - 1, 1);
      const mesAntFim = new Date(agora.getFullYear(), agora.getMonth(), 0, 23, 59, 59, 999);
      const dias30Ini = new Date(agora); dias30Ini.setDate(dias30Ini.getDate() - 29); dias30Ini.setHours(0, 0, 0, 0);

      const [
        hojeQ, ontemQ, mesQ, mesAntQ,
        estoqueQ, clientesQ,
        vendas30Q, ultimasQ, itensMesQ,
      ] = await Promise.all([
        supabase.from("vendas").select("total")
          .eq("status", "concluida")
          .gte("created_at", hojeIni.toISOString())
          .lte("created_at", hojeFim.toISOString()),
        supabase.from("vendas").select("total")
          .eq("status", "concluida")
          .gte("created_at", ontemIni.toISOString())
          .lte("created_at", ontemFim.toISOString()),
        supabase.from("vendas").select("total")
          .eq("status", "concluida")
          .gte("created_at", mesIni.toISOString()),
        supabase.from("vendas").select("total")
          .eq("status", "concluida")
          .gte("created_at", mesAntIni.toISOString())
          .lte("created_at", mesAntFim.toISOString()),
        supabase.from("estoque").select("quantidade, quantidade_minima"),
        supabase.from("clientes").select("id", { count: "exact", head: true })
          .gte("created_at", mesIni.toISOString()),
        supabase.from("vendas").select("total, created_at")
          .eq("status", "concluida")
          .gte("created_at", dias30Ini.toISOString())
          .order("created_at", { ascending: true }),
        supabase.from("vendas")
          .select("id, total, created_at, forma_pagamento, cliente_id, pagamento_status, clientes(nome)")
          .eq("status", "concluida")
          .order("created_at", { ascending: false })
          .limit(5),
        supabase.from("venda_itens")
          .select("produto_id, quantidade, subtotal, vendas!inner(created_at, status), produtos(nome)")
          .eq("vendas.status", "concluida")
          .gte("vendas.created_at", mesIni.toISOString())
          .limit(5000),
      ]);

      const sum = (rows: { total: number | string | null }[] | null) =>
        (rows ?? []).reduce((s, v) => s + Number(v.total ?? 0), 0);

      setVendasHoje(sum(hojeQ.data));
      setVendasOntem(sum(ontemQ.data));
      setVendasMes(sum(mesQ.data));
      setVendasMesAnterior(sum(mesAntQ.data));
      setClientesNovos(clientesQ.count ?? 0);

      const est = estoqueQ.data ?? [];
      setEstoqueBaixo(
        est.filter((e) =>
          Number(e.quantidade) > 0 &&
          Number(e.quantidade_minima) > 0 &&
          Number(e.quantidade) <= Number(e.quantidade_minima)
        ).length
      );
      setEstoqueZerado(est.filter((e) => Number(e.quantidade) <= 0).length);

      // Chart 30 dias
      const map = new Map<string, number>();
      for (let i = 0; i < 30; i++) {
        const d = new Date(dias30Ini); d.setDate(d.getDate() + i);
        map.set(d.toISOString().slice(0, 10), 0);
      }
      for (const v of vendas30Q.data ?? []) {
        const key = new Date(v.created_at).toISOString().slice(0, 10);
        map.set(key, (map.get(key) ?? 0) + Number(v.total ?? 0));
      }
      const points: ChartPoint[] = Array.from(map.entries()).map(([date, total]) => {
        const d = new Date(date + "T12:00:00");
        return {
          date,
          label: d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
          total,
        };
      });
      setChart(points);

      setUltimasVendas((ultimasQ.data ?? []) as unknown as Venda[]);

      // Top 5 produtos do mês
      const agg = new Map<string, ItemTop>();
      for (const it of (itensMesQ.data ?? []) as unknown as Array<{
        produto_id: string | null;
        quantidade: number | string;
        subtotal: number | string | null;
        produtos: { nome: string } | null;
      }>) {
        if (!it.produto_id) continue;
        const cur = agg.get(it.produto_id) ?? {
          produto_id: it.produto_id,
          nome: it.produtos?.nome ?? "Produto",
          quantidade: 0,
          total: 0,
        };
        cur.quantidade += Number(it.quantidade ?? 0);
        cur.total += Number(it.subtotal ?? 0);
        agg.set(it.produto_id, cur);
      }
      setTopProdutos(
        Array.from(agg.values())
          .sort((a, b) => b.quantidade - a.quantidade)
          .slice(0, 5),
      );
    } catch (e) {
      console.error("dashboard load error", e);
    } finally {
      setLoading(false);
    }
  };

  const variacaoDia = useMemo(() => calcVariacao(vendasHoje, vendasOntem), [vendasHoje, vendasOntem]);
  const variacaoMes = useMemo(() => calcVariacao(vendasMes, vendasMesAnterior), [vendasMes, vendasMesAnterior]);

  return (
    <AppLayout>
      <div className="max-w-7xl mx-auto space-y-6">
        <header>
          <span className="mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Visão geral
          </span>
          <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight mt-1">Dashboard</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Acompanhe vendas, estoque e clientes em tempo real.
          </p>
        </header>

        {/* Banner estoque zerado */}
        {!loading && estoqueZerado > 0 && (
          <Link to="/estoque">
            <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 hover:bg-amber-500/15 transition-colors">
              <AlertOctagon className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-amber-700 dark:text-amber-300">
                  {estoqueZerado} produto{estoqueZerado > 1 ? "s" : ""} em ruptura de estoque
                </div>
                <div className="text-sm text-amber-700/80 dark:text-amber-300/80">
                  Verifique e reponha o estoque para evitar perda de vendas.
                </div>
              </div>
              <ArrowUpRight className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
            </div>
          </Link>
        )}

        {/* KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <KpiCard
            label="Vendas hoje"
            value={brl(vendasHoje)}
            icon={Banknote}
            variacao={variacaoDia}
            comparativo="vs ontem"
            loading={loading}
          />
          <KpiCard
            label="Vendas no mês"
            value={brl(vendasMes)}
            icon={CalendarDays}
            variacao={variacaoMes}
            comparativo="vs mês anterior"
            loading={loading}
          />
          <KpiCard
            label="Estoque baixo"
            value={num(estoqueBaixo)}
            icon={AlertTriangle}
            tone="warning"
            hint="abaixo do mínimo"
            href="/estoque"
            loading={loading}
          />
          <KpiCard
            label="Clientes novos"
            value={num(clientesNovos)}
            icon={Users}
            hint="cadastrados no mês"
            loading={loading}
          />
        </div>

        {/* Total vendido + split por vendedor com filtro de data */}
        <SplitSection />

        {/* Gráfico */}
        <Card className="p-4 sm:p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <span className="mono text-[10px] uppercase tracking-widest text-muted-foreground">
                Faturamento
              </span>
              <h2 className="font-display text-xl font-bold mt-1">Últimos 30 dias</h2>
            </div>
          </div>
          <div className="h-[180px] sm:h-72">
            {loading ? (
              <Skeleton className="h-full w-full" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chart} margin={{ top: 10, right: 4, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="fillRevenue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.25} />
                      <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis
                    dataKey="label"
                    stroke="hsl(var(--muted-foreground))"
                    fontSize={10}
                    tickLine={false}
                    axisLine={false}
                    interval="preserveStartEnd"
                    minTickGap={32}
                  />
                  <YAxis
                    stroke="hsl(var(--muted-foreground))"
                    fontSize={10}
                    tickLine={false}
                    axisLine={false}
                    width={56}
                    tickFormatter={(v) => brl(Number(v))}
                  />
                  <Tooltip content={<ChartTooltip />} />
                  <Area
                    type="monotone"
                    dataKey="total"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    fill="url(#fillRevenue)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>

        {/* Pagamentos Pagar.me em tempo real */}
        <Card className="p-4 sm:p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <span className="mono text-[10px] uppercase tracking-widest text-muted-foreground">
                Pagar.me · em tempo real
              </span>
              <h2 className="font-display text-xl font-bold mt-1">Pagamentos online</h2>
            </div>
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
            </span>
          </div>

          <div className="grid grid-cols-3 gap-3 mb-5">
            <StatusTile icon={Clock} label="Pendentes" value={pgPendentes} tone="warning" />
            <StatusTile icon={CheckCircle2} label="Pagos (7d)" value={pgPagos} tone="success" />
            <StatusTile icon={XCircle} label="Falhas (7d)" value={pgFalhou} tone="destructive" />
          </div>

          {pgRecentes.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              Nenhum pagamento Pagar.me ainda.
            </p>
          ) : (
            <div className="space-y-1">
              {pgRecentes.map((v) => {
                const pg = fmtPagamento(v.forma_pagamento);
                const Icon = pg.icon;
                const st = v.pagamento_status ?? "pendente";
                return (
                  <div
                    key={v.id}
                    className="flex items-center justify-between gap-3 py-2.5 border-b border-border last:border-0"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="mono text-[10px] text-muted-foreground shrink-0 w-10">
                        {fmtHora(v.created_at)}
                      </span>
                      <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <span className="text-sm font-medium truncate">
                        {v.clientes?.nome ?? "Sem cliente"}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <PagamentoStatusBadge status={st} />
                      <span className="num font-semibold text-sm w-24 text-right">
                        {brl(v.total)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        {/* Tabelas lado a lado */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
          {/* Top produtos */}
          <Card className="p-4 sm:p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <span className="mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  Mais vendidos
                </span>
                <h2 className="font-display text-xl font-bold mt-1">Top 5 do mês</h2>
              </div>
              <Package className="h-4 w-4 text-muted-foreground" />
            </div>
            {loading ? (
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
              </div>
            ) : topProdutos.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">
                Sem vendas registradas neste mês.
              </p>
            ) : (
              <div className="space-y-1">
                {topProdutos.map((p, idx) => (
                  <div
                    key={p.produto_id}
                    className="flex items-center justify-between gap-3 py-2.5 border-b border-border last:border-0"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="mono text-[10px] w-5 h-5 rounded-md bg-muted text-muted-foreground flex items-center justify-center shrink-0 font-bold">
                        {idx + 1}
                      </span>
                      <span className="text-sm font-medium truncate">{p.nome}</span>
                    </div>
                    <div className="flex items-center gap-4 shrink-0">
                      <span className="num text-xs text-muted-foreground">
                        {num(p.quantidade)} un
                      </span>
                      <span className="num font-semibold text-sm w-24 text-right">
                        {brl(p.total)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Últimas vendas */}
          <Card className="p-4 sm:p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <span className="mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  Atividade
                </span>
                <h2 className="font-display text-xl font-bold mt-1">Últimas 5 vendas</h2>
              </div>
              <Link to="/vendas/historico" className="text-xs text-primary hover:underline">
                Ver tudo
              </Link>
            </div>
            {loading ? (
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
              </div>
            ) : ultimasVendas.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">
                Ainda não há vendas registradas.
              </p>
            ) : (
              <div className="space-y-1">
                {ultimasVendas.map((v) => {
                  const pg = fmtPagamento(v.forma_pagamento);
                  const Icon = pg.icon;
                  return (
                    <div
                      key={v.id}
                      className="flex items-center justify-between gap-3 py-2.5 border-b border-border last:border-0"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="mono text-[10px] text-muted-foreground shrink-0 w-10">
                          {fmtHora(v.created_at)}
                        </span>
                        <span className="text-sm font-medium truncate">
                          {v.clientes?.nome ?? "Sem cliente"}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <Badge variant="outline" className="text-[10px] gap-1">
                          <Icon className="h-3 w-3" /> {pg.label}
                        </Badge>
                        <span className="num font-semibold text-sm w-24 text-right">
                          {brl(v.total)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </div>
      </div>
    </AppLayout>
  );
};

const calcVariacao = (atual: number, anterior: number): { pct: number; positiva: boolean; tem: boolean } => {
  if (anterior <= 0 && atual <= 0) return { pct: 0, positiva: true, tem: false };
  if (anterior <= 0) return { pct: 100, positiva: true, tem: true };
  const pct = ((atual - anterior) / anterior) * 100;
  return { pct: Math.abs(pct), positiva: pct >= 0, tem: true };
};

const StatusTile = ({
  icon: Icon, label, value, tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  tone: "warning" | "success" | "destructive";
}) => {
  const toneClass =
    tone === "warning"
      ? "text-amber-600 dark:text-amber-400 bg-amber-500/10"
      : tone === "success"
      ? "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10"
      : "text-destructive bg-destructive/10";
  return (
    <div className="rounded-xl border border-border p-3 flex items-center gap-3">
      <div className={`h-9 w-9 rounded-lg flex items-center justify-center ${toneClass}`}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <div className="mono text-[10px] uppercase tracking-widest text-muted-foreground truncate">
          {label}
        </div>
        <div className="num text-xl font-bold leading-tight">{value}</div>
      </div>
    </div>
  );
};

const PagamentoStatusBadge = ({ status }: { status: string }) => {
  if (status === "pago") {
    return (
      <Badge variant="outline" className="text-[10px] gap-1 border-emerald-500/30 text-emerald-700 dark:text-emerald-400 bg-emerald-500/10">
        <CheckCircle2 className="h-3 w-3" /> Pago
      </Badge>
    );
  }
  if (status === "falhou") {
    return (
      <Badge variant="outline" className="text-[10px] gap-1 border-destructive/30 text-destructive bg-destructive/10">
        <XCircle className="h-3 w-3" /> Falhou
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-[10px] gap-1 border-amber-500/30 text-amber-700 dark:text-amber-400 bg-amber-500/10">
      <Clock className="h-3 w-3" /> Pendente
    </Badge>
  );
};

const KpiCard = ({
  label, value, icon: Icon, tone, hint, variacao, comparativo, href, loading,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  tone?: "warning" | "destructive";
  hint?: string;
  variacao?: { pct: number; positiva: boolean; tem: boolean };
  comparativo?: string;
  href?: string;
  loading?: boolean;
}) => {
  const toneClass =
    tone === "warning" ? "text-amber-600 dark:text-amber-400 bg-amber-500/10" :
    tone === "destructive" ? "text-destructive bg-destructive/10" :
    "text-primary bg-primary-soft";

  const card = (
    <Card className={`p-6 transition-all ${href ? "hover:shadow-md hover:-translate-y-0.5 cursor-pointer" : ""}`}>
      <div className="flex items-center justify-between">
        <span className="mono text-[10px] uppercase tracking-widest text-muted-foreground">
          {label}
        </span>
        <div className={`h-8 w-8 rounded-lg flex items-center justify-center ${toneClass}`}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      {loading ? (
        <Skeleton className="h-9 w-32 mt-3" />
      ) : (
        <div className="num text-3xl font-bold mt-3 tracking-tight">{value}</div>
      )}
      {variacao?.tem && !loading && (
        <div className="flex items-center gap-1.5 mt-2">
          <span className={`inline-flex items-center gap-0.5 text-xs font-semibold ${
            variacao.positiva ? "text-primary" : "text-destructive"
          }`}>
            {variacao.positiva ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            {variacao.pct.toFixed(1)}%
          </span>
          {comparativo && (
            <span className="text-[10px] text-muted-foreground">{comparativo}</span>
          )}
        </div>
      )}
      {hint && !variacao?.tem && !loading && (
        <div className="mono text-[10px] text-muted-foreground mt-2 uppercase tracking-wider">
          {hint}
        </div>
      )}
    </Card>
  );

  if (href) return <Link to={href}>{card}</Link>;
  return card;
};

const ChartTooltip = ({ active, payload }: { active?: boolean; payload?: Array<{ payload: ChartPoint; value: number }> }) => {
  if (!active || !payload?.length) return null;
  const p = payload[0];
  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 shadow-lg">
      <div className="mono text-[10px] uppercase tracking-widest text-muted-foreground">
        {p.payload.label}
      </div>
      <div className="num font-semibold text-primary mt-0.5">{brl(p.value)}</div>
    </div>
  );
};

export default Dashboard;
