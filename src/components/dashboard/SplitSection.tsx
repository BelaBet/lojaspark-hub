import { useEffect, useMemo, useState } from "react";
import { format, startOfDay, endOfDay, subDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { supabase } from "@/integrations/supabase/client";
import { brl } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  Banknote, Wallet, Building2, UserCircle2, CalendarIcon, TrendingUp,
} from "lucide-react";

type Periodo = "hoje" | "7d" | "30d" | "90d" | "custom";
type Linha = { vendedor_id: string; total: number; base: number; plataforma: number; lojista: number; n: number };

const PRESETS: { id: Periodo; label: string }[] = [
  { id: "hoje", label: "Hoje" },
  { id: "7d", label: "7 dias" },
  { id: "30d", label: "30 dias" },
  { id: "90d", label: "90 dias" },
];

function rangeFor(p: Periodo, custom: { from?: Date; to?: Date }): { from: Date; to: Date } {
  const to = endOfDay(new Date());
  if (p === "hoje") return { from: startOfDay(new Date()), to };
  if (p === "7d") return { from: startOfDay(subDays(new Date(), 6)), to };
  if (p === "30d") return { from: startOfDay(subDays(new Date(), 29)), to };
  if (p === "90d") return { from: startOfDay(subDays(new Date(), 89)), to };
  return {
    from: custom.from ? startOfDay(custom.from) : startOfDay(subDays(new Date(), 29)),
    to: custom.to ? endOfDay(custom.to) : to,
  };
}

export function SplitSection() {
  const [periodo, setPeriodo] = useState<Periodo>("30d");
  const [custom, setCustom] = useState<{ from?: Date; to?: Date }>({});
  const [loading, setLoading] = useState(true);
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [meuId, setMeuId] = useState<string | null>(null);

  const range = useMemo(() => rangeFor(periodo, custom), [periodo, custom]);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setMeuId(data.user?.id ?? null));
  }, []);

  useEffect(() => {
    let cancel = false;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("vendas")
        .select("vendedor_id, total, base_amount, platform_amount, seller_amount")
        .eq("status", "concluida")
        .gte("created_at", range.from.toISOString())
        .lte("created_at", range.to.toISOString())
        .limit(10000);
      if (cancel) return;
      if (error) { setLinhas([]); setLoading(false); return; }
      const map = new Map<string, Linha>();
      for (const v of data ?? []) {
        const key = v.vendedor_id ?? "sem-vendedor";
        const cur = map.get(key) ?? { vendedor_id: key, total: 0, base: 0, plataforma: 0, lojista: 0, n: 0 };
        cur.total += Number(v.total ?? 0);
        cur.base += Number(v.base_amount ?? 0) / 100;
        cur.plataforma += Number(v.platform_amount ?? 0) / 100;
        cur.lojista += Number(v.seller_amount ?? 0) / 100;
        cur.n += 1;
        map.set(key, cur);
      }
      setLinhas(Array.from(map.values()).sort((a, b) => b.total - a.total));
      setLoading(false);
    })();
    return () => { cancel = true; };
  }, [range.from, range.to]);

  const tot = useMemo(
    () => linhas.reduce(
      (a, l) => ({
        total: a.total + l.total,
        base: a.base + l.base,
        plataforma: a.plataforma + l.plataforma,
        lojista: a.lojista + l.lojista,
        n: a.n + l.n,
      }),
      { total: 0, base: 0, plataforma: 0, lojista: 0, n: 0 },
    ),
    [linhas],
  );

  return (
    <Card className="p-4 sm:p-6 space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <span className="mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Vendas &middot; split Pagar.me
          </span>
          <h2 className="font-display text-xl font-bold mt-1">Distribuição no período</h2>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg border border-border p-1 bg-card">
            {PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setPeriodo(p.id)}
                className={cn(
                  "mono text-[10px] uppercase tracking-widest px-3 py-1.5 rounded-md transition-colors",
                  periodo === p.id
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {p.label}
              </button>
            ))}
          </div>

          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant={periodo === "custom" ? "default" : "outline"}
                size="sm"
                className="h-9 gap-2"
                onClick={() => setPeriodo("custom")}
              >
                <CalendarIcon className="h-3.5 w-3.5" />
                {periodo === "custom" && custom.from
                  ? `${format(custom.from, "dd/MM", { locale: ptBR })}${custom.to ? " – " + format(custom.to, "dd/MM", { locale: ptBR }) : ""}`
                  : "Personalizado"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <Calendar
                mode="range"
                selected={{ from: custom.from, to: custom.to }}
                onSelect={(r) => setCustom({ from: r?.from, to: r?.to })}
                numberOfMonths={1}
                initialFocus
                className={cn("p-3 pointer-events-auto")}
              />
            </PopoverContent>
          </Popover>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiTile icon={Banknote} label="Total vendido" value={brl(tot.total)} hint={`${tot.n} venda${tot.n === 1 ? "" : "s"}`} tone="primary" />
        <KpiTile icon={TrendingUp} label="Base (sem acréscimo)" value={brl(tot.base)} tone="muted" />
        <KpiTile icon={Building2} label="Plataforma" value={brl(tot.plataforma)} tone="warning" />
        <KpiTile icon={Wallet} label="Lojista (split)" value={brl(tot.lojista)} tone="success" />
      </div>

      <div>
        <div className="mono text-[10px] uppercase tracking-widest text-muted-foreground mb-2">
          Por vendedor
        </div>
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
          </div>
        ) : linhas.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            Nenhuma venda no período selecionado.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40">
                <tr className="text-left mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Vendedor</th>
                  <th className="px-3 py-2 font-medium text-right">Vendas</th>
                  <th className="px-3 py-2 font-medium text-right">Total</th>
                  <th className="px-3 py-2 font-medium text-right hidden sm:table-cell">Plataforma</th>
                  <th className="px-3 py-2 font-medium text-right">Lojista</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {linhas.map((l) => {
                  const isMe = l.vendedor_id === meuId;
                  const isUnknown = l.vendedor_id === "sem-vendedor";
                  return (
                    <tr key={l.vendedor_id}>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <UserCircle2 className="h-4 w-4 text-muted-foreground shrink-0" />
                          <span className="mono text-xs truncate">
                            {isUnknown ? "Sem vendedor" : `#${l.vendedor_id.slice(-6)}`}
                          </span>
                          {isMe && (
                            <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 border-primary/30 text-primary">
                              você
                            </Badge>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right num text-xs text-muted-foreground">{l.n}</td>
                      <td className="px-3 py-2 text-right num font-bold">{brl(l.total)}</td>
                      <td className="px-3 py-2 text-right num text-xs hidden sm:table-cell text-amber-600 dark:text-amber-400">
                        {l.plataforma > 0 ? brl(l.plataforma) : "—"}
                      </td>
                      <td className="px-3 py-2 text-right num text-xs text-emerald-600 dark:text-emerald-400">
                        {l.lojista > 0 ? brl(l.lojista) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Card>
  );
}

const KpiTile = ({
  icon: Icon, label, value, hint, tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  hint?: string;
  tone: "primary" | "muted" | "warning" | "success";
}) => {
  const toneClass =
    tone === "primary"
      ? "text-primary bg-primary/10"
      : tone === "warning"
      ? "text-amber-600 dark:text-amber-400 bg-amber-500/10"
      : tone === "success"
      ? "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10"
      : "text-muted-foreground bg-muted";
  return (
    <div className="rounded-xl border border-border p-3">
      <div className="flex items-center gap-2">
        <div className={cn("h-7 w-7 rounded-md flex items-center justify-center", toneClass)}>
          <Icon className="h-3.5 w-3.5" />
        </div>
        <span className="mono text-[10px] uppercase tracking-widest text-muted-foreground truncate">
          {label}
        </span>
      </div>
      <div className="num text-xl sm:text-2xl font-bold mt-1.5">{value}</div>
      {hint && <div className="mono text-[10px] text-muted-foreground mt-0.5">{hint}</div>}
    </div>
  );
};