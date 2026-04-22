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
  productsActive: number;
  lowStock: number;
  outOfStock: number;
  newCustomers: number;
};

const Dashboard = () => {
  const [kpi, setKpi] = useState<Kpi>({
    revenue: 18420.5,
    orders: 47,
    productsActive: 0,
    lowStock: 0,
    outOfStock: 0,
    newCustomers: 12,
  });

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("products").select("stock,is_active");
      if (data) {
        const active = data.filter((p) => p.is_active).length;
        const low = data.filter((p) => p.stock > 0 && p.stock <= 5).length;
        const out = data.filter((p) => p.stock === 0).length;
        setKpi((k) => ({ ...k, productsActive: active, lowStock: low, outOfStock: out }));
      }
    })();
  }, []);

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

        {/* Receita / Pedidos — destaque */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card className="lg:col-span-2 p-7 bg-primary text-primary-foreground border-0 shadow-soft-lg relative overflow-hidden">
            <div className="absolute -top-20 -right-20 w-64 h-64 rounded-full bg-primary-foreground/5 blur-3xl" />
            <div className="relative flex items-start justify-between">
              <div>
                <span className="mono text-[10px] uppercase tracking-widest text-primary-foreground/70">Receita do mês</span>
                <div className="num text-5xl font-bold mt-2">{brl(kpi.revenue)}</div>
                <div className="flex items-center gap-2 mt-3">
                  <Badge className="bg-primary-foreground/15 text-primary-foreground border-0 hover:bg-primary-foreground/20">
                    <TrendingUp className="h-3 w-3 mr-1" /> +12.4% vs mês anterior
                  </Badge>
                </div>
              </div>
              <ArrowUpRight className="h-6 w-6 text-primary-foreground/60" />
            </div>
            <div className="relative grid grid-cols-3 gap-6 mt-8 pt-6 border-t border-primary-foreground/15">
              <div>
                <div className="mono text-[10px] uppercase tracking-widest text-primary-foreground/60">Ticket médio</div>
                <div className="num text-2xl font-semibold mt-1">{brl(kpi.revenue / Math.max(kpi.orders, 1))}</div>
              </div>
              <div>
                <div className="mono text-[10px] uppercase tracking-widest text-primary-foreground/60">Pedidos</div>
                <div className="num text-2xl font-semibold mt-1">{num(kpi.orders)}</div>
              </div>
              <div>
                <div className="mono text-[10px] uppercase tracking-widest text-primary-foreground/60">Conversão</div>
                <div className="num text-2xl font-semibold mt-1">3.8%</div>
              </div>
            </div>
          </Card>

          <Card className="p-7 shadow-soft-sm">
            <div className="flex items-center justify-between">
              <span className="mono text-[10px] uppercase tracking-widest text-muted-foreground">Pedidos hoje</span>
              <ShoppingBag className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="num text-5xl font-bold mt-2">{num(8)}</div>
            <div className="mt-6 space-y-2">
              <Row label="Pendentes" value="3" tone="warning" />
              <Row label="Em separação" value="2" />
              <Row label="Concluídos" value="3" tone="success" />
            </div>
          </Card>
        </div>

        {/* KPIs secundários */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard label="Produtos ativos" value={num(kpi.productsActive)} icon={Package} />
          <KpiCard label="Estoque baixo" value={num(kpi.lowStock)} icon={AlertTriangle} tone="warning" hint="≤ 5 unidades" />
          <KpiCard label="Em ruptura" value={num(kpi.outOfStock)} icon={AlertTriangle} tone="destructive" hint="0 em estoque" />
          <KpiCard label="Novos clientes" value={num(kpi.newCustomers)} icon={Users} hint="últimos 30 dias" />
        </div>

        {/* Atividade recente */}
        <Card className="p-7 shadow-soft-sm">
          <div className="flex items-center justify-between mb-5">
            <div>
              <span className="mono text-[10px] uppercase tracking-widest text-muted-foreground">Atividade</span>
              <h2 className="font-display text-xl font-bold mt-1">Últimos pedidos</h2>
            </div>
          </div>
          <div className="space-y-2">
            {[
              { id: "PED-1042", c: "Maria Souza", v: 248.9, s: "concluído" },
              { id: "PED-1041", c: "João Lima", v: 89.0, s: "pendente" },
              { id: "PED-1040", c: "Ana Costa", v: 412.3, s: "em separação" },
              { id: "PED-1039", c: "Pedro Alves", v: 156.7, s: "concluído" },
            ].map((o) => (
              <div key={o.id} className="flex items-center justify-between py-3 border-b border-border last:border-0">
                <div className="flex items-center gap-4">
                  <span className="mono text-xs text-muted-foreground">{o.id}</span>
                  <span className="text-sm font-medium">{o.c}</span>
                </div>
                <div className="flex items-center gap-4">
                  <Badge variant="outline" className="mono text-[10px] capitalize">{o.s}</Badge>
                  <span className="num font-semibold tabular-nums w-24 text-right">{brl(o.v)}</span>
                </div>
              </div>
            ))}
          </div>
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

const Row = ({ label, value, tone }: { label: string; value: string; tone?: "warning" | "success" }) => {
  const dot = tone === "warning" ? "bg-warning" : tone === "success" ? "bg-success" : "bg-muted-foreground/40";
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