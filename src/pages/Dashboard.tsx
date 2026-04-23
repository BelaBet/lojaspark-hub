import { useEffect, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { brl, num } from "@/lib/format";
import { Package, AlertTriangle, ShoppingBag, Users, TrendingUp, ArrowUpRight } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

type Kpi = {
  revenue: number;
  orders: number;
  customers: number;
  productsActive: number;
  lowStock: number;
  outOfStock: number;
};

const Dashboard = () => {
  const [kpi, setKpi] = useState<Kpi>({
    revenue: 0, orders: 0, customers: 0,
    productsActive: 0, lowStock: 0, outOfStock: 0,
  });
  const [recentes, setRecentes] = useState<{ id: string; cliente: string | null; total: number; status: string }[]>([]);

  useEffect(() => {
    (async () => {
      const inicioMes = new Date();
      inicioMes.setDate(1); inicioMes.setHours(0, 0, 0, 0);

      const [vendasMes, clientesQ, produtosQ, estoqueQ, ultimas] = await Promise.all([
        supabase.from("vendas").select("total,status,created_at")
          .eq("status", "concluida").gte("created_at", inicioMes.toISOString()),
        supabase.from("clientes").select("id", { count: "exact", head: true }),
        supabase.from("produtos").select("id,ativo"),
        supabase.from("estoque").select("quantidade,quantidade_minima"),
        supabase.from("vendas")
          .select("id,total,status,created_at,clientes(nome)")
          .order("created_at", { ascending: false }).limit(5),
      ]);

      const revenue = (vendasMes.data ?? []).reduce((s, v: any) => s + Number(v.total || 0), 0);
      const orders = vendasMes.data?.length ?? 0;
      const customers = clientesQ.count ?? 0;
      const productsActive = (produtosQ.data ?? []).filter((p: any) => p.ativo).length;
      const lowStock = (estoqueQ.data ?? []).filter((e: any) => Number(e.quantidade) > 0 && Number(e.quantidade) <= Math.max(Number(e.quantidade_minima) || 0, 5)).length;
      const outOfStock = (estoqueQ.data ?? []).filter((e: any) => Number(e.quantidade) <= 0).length;

      setKpi({ revenue, orders, customers, productsActive, lowStock, outOfStock });
      setRecentes(
        (ultimas.data ?? []).map((v: any) => ({
          id: v.id,
          cliente: v.clientes?.nome ?? null,
          total: Number(v.total || 0),
          status: v.status,
        }))
      );
    })();
  }, []);

  const ticket = kpi.orders > 0 ? kpi.revenue / kpi.orders : 0;

  return (
    <AppLayout>
      <div className="max-w-7xl mx-auto space-y-8">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <span className="mono text-[10px] uppercase tracking-widest text-muted-foreground">Visão geral</span>
            <h1 className="font-display text-4xl font-bold tracking-tight mt-1">Dashboard</h1>
            <p className="text-muted-foreground text-sm mt-1">Acompanhe vendas, estoque e clientes em tempo real.</p>
          </div>
          <Link to="/catalogo/novo">
            <Button className="h-10">+ Novo produto</Button>
          </Link>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card className="lg:col-span-2 p-7 bg-primary text-primary-foreground border-0 shadow-soft-lg relative overflow-hidden">
            <div className="absolute -top-20 -right-20 w-64 h-64 rounded-full bg-primary-foreground/5 blur-3xl" />
            <div className="relative flex items-start justify-between">
              <div>
                <span className="mono text-[10px] uppercase tracking-widest text-primary-foreground/70">Receita do mês</span>
                <div className="num text-5xl font-bold mt-2">{brl(kpi.revenue)}</div>
                <div className="flex items-center gap-2 mt-3">
                  <Badge className="bg-primary-foreground/15 text-primary-foreground border-0 hover:bg-primary-foreground/20">
                    <TrendingUp className="h-3 w-3 mr-1" /> {num(kpi.orders)} {kpi.orders === 1 ? "venda" : "vendas"} no mês
                  </Badge>
                </div>
              </div>
              <ArrowUpRight className="h-6 w-6 text-primary-foreground/60" />
            </div>
            <div className="relative grid grid-cols-3 gap-6 mt-8 pt-6 border-t border-primary-foreground/15">
              <div>
                <div className="mono text-[10px] uppercase tracking-widest text-primary-foreground/60">Ticket médio</div>
                <div className="num text-2xl font-semibold mt-1">{brl(ticket)}</div>
              </div>
              <div>
                <div className="mono text-[10px] uppercase tracking-widest text-primary-foreground/60">Pedidos</div>
                <div className="num text-2xl font-semibold mt-1">{num(kpi.orders)}</div>
              </div>
              <div>
                <div className="mono text-[10px] uppercase tracking-widest text-primary-foreground/60">Clientes</div>
                <div className="num text-2xl font-semibold mt-1">{num(kpi.customers)}</div>
              </div>
            </div>
          </Card>

          <Card className="p-7 shadow-soft-sm">
            <div className="flex items-center justify-between">
              <span className="mono text-[10px] uppercase tracking-widest text-muted-foreground">Catálogo</span>
              <ShoppingBag className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="num text-5xl font-bold mt-2">{num(kpi.productsActive)}</div>
            <div className="mono text-[10px] uppercase tracking-widest text-muted-foreground mt-1">produtos ativos</div>
            <div className="mt-6 space-y-2">
              <Row label="Estoque baixo" value={num(kpi.lowStock)} tone="warning" />
              <Row label="Em ruptura" value={num(kpi.outOfStock)} tone="destructive" />
            </div>
          </Card>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard label="Clientes" value={num(kpi.customers)} icon={Users} />
          <KpiCard label="Pedidos do mês" value={num(kpi.orders)} icon={ShoppingBag} />
          <KpiCard label="Estoque baixo" value={num(kpi.lowStock)} icon={AlertTriangle} tone="warning" hint="≤ mínimo" />
          <KpiCard label="Em ruptura" value={num(kpi.outOfStock)} icon={Package} tone="destructive" hint="0 em estoque" />
        </div>

        <Card className="p-7 shadow-soft-sm">
          <div className="flex items-center justify-between mb-5">
            <div>
              <span className="mono text-[10px] uppercase tracking-widest text-muted-foreground">Atividade</span>
              <h2 className="font-display text-xl font-bold mt-1">Últimos pedidos</h2>
            </div>
          </div>
          {recentes.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Ainda não há vendas registradas.</p>
          ) : (
            <div className="space-y-2">
              {recentes.map((o) => (
                <div key={o.id} className="flex items-center justify-between py-3 border-b border-border last:border-0">
                  <div className="flex items-center gap-4 min-w-0">
                    <span className="mono text-xs text-muted-foreground shrink-0">#{o.id.slice(0, 6)}</span>
                    <span className="text-sm font-medium truncate">{o.cliente ?? "Cliente avulso"}</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <Badge variant="outline" className="mono text-[10px] capitalize">{o.status}</Badge>
                    <span className="num font-semibold tabular-nums w-24 text-right">{brl(o.total)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </AppLayout>
  );
};

const KpiCard = ({
  label, value, icon: Icon, tone, hint,
}: { label: string; value: string; icon: any; tone?: "warning" | "destructive"; hint?: string }) => {
  const toneClass =
    tone === "warning" ? "text-warning bg-warning/10" :
    tone === "destructive" ? "text-destructive bg-destructive/10" :
    "text-primary bg-primary-soft";
  return (
    <Card className="p-6 shadow-soft-sm hover:shadow-soft-md transition-shadow">
      <div className="flex items-center justify-between">
        <span className="mono text-[10px] uppercase tracking-widest text-muted-foreground">{label}</span>
        <div className={`h-8 w-8 rounded-lg flex items-center justify-center ${toneClass}`}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <div className="num text-4xl font-bold mt-3">{value}</div>
      {hint && <div className="mono text-[10px] text-muted-foreground mt-2 uppercase tracking-wider">{hint}</div>}
    </Card>
  );
};

const Row = ({ label, value, tone }: { label: string; value: string; tone?: "warning" | "destructive" }) => {
  const dot = tone === "warning" ? "bg-warning" : tone === "destructive" ? "bg-destructive" : "bg-muted-foreground/40";
  return (
    <div className="flex items-center justify-between text-sm">
      <div className="flex items-center gap-2 text-muted-foreground">
        <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
        {label}
      </div>
      <span className="num font-semibold">{value}</span>
    </div>
  );
};

export default Dashboard;
