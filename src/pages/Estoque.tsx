import { useEffect, useMemo, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tabs, TabsList, TabsTrigger, TabsContent,
} from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { num } from "@/lib/format";
import {
  Search, Plus, ClipboardList, AlertTriangle, Package,
  ArrowDownToLine, ArrowUpFromLine, Sliders, ArrowLeftRight, X,
} from "lucide-react";
import { EntradaEstoqueDialog } from "@/components/estoque/EntradaEstoqueDialog";
import { AjusteInventarioDialog } from "@/components/estoque/AjusteInventarioDialog";
import { cn } from "@/lib/utils";
import { ChevronDown, Plus as PlusIcon } from "lucide-react";

type LinhaEstoque = {
  produto_id: string;
  nome: string;
  sku: string | null;
  quantidade: number;
  quantidade_minima: number;
  ultima_mov: string | null;
};

type StatusFiltro = "todos" | "ok" | "baixo" | "zerado";

type Movimentacao = {
  id: string;
  created_at: string;
  tipo: string;
  quantidade: number;
  motivo: string | null;
  produto_id: string;
  produto_nome: string;
  produto_sku: string | null;
};

type Periodo = "7" | "30" | "90" | "todos";

const statusInfo = (q: number, min: number) => {
  if (q <= 0) return { id: "zerado" as const, label: "Zerado", cls: "bg-destructive/10 text-destructive border-destructive/20" };
  if (q <= min) return { id: "baixo" as const, label: "Baixo", cls: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20" };
  return { id: "ok" as const, label: "OK", cls: "bg-primary/10 text-primary border-primary/20" };
};

const tipoInfo = (tipo: string) => {
  switch (tipo) {
    case "entrada":
      return { label: "Entrada", icon: ArrowDownToLine, cls: "text-primary" };
    case "saida":
      return { label: "Saída", icon: ArrowUpFromLine, cls: "text-destructive" };
    case "ajuste":
      return { label: "Ajuste", icon: Sliders, cls: "text-amber-600 dark:text-amber-400" };
    case "transferencia":
      return { label: "Transferência", icon: ArrowLeftRight, cls: "text-muted-foreground" };
    default:
      return { label: tipo, icon: Package, cls: "text-muted-foreground" };
  }
};

const fmtData = (iso: string | null) => {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const Estoque = () => {
  const [linhas, setLinhas] = useState<LinhaEstoque[]>([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState("");
  const [statusFiltro, setStatusFiltro] = useState<StatusFiltro>("todos");

  const [movimentacoes, setMovimentacoes] = useState<Movimentacao[]>([]);
  const [loadingMov, setLoadingMov] = useState(true);
  const [tipoFiltro, setTipoFiltro] = useState<string>("todos");
  const [periodoFiltro, setPeriodoFiltro] = useState<Periodo>("30");

  const [entradaOpen, setEntradaOpen] = useState(false);
  const [ajusteOpen, setAjusteOpen] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggleExpanded = (id: string) => {
    setExpanded((cur) => {
      const n = new Set(cur);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  const carregarEstoque = async () => {
    setLoading(true);
    try {
      const { data: produtos, error } = await supabase
        .from("produtos")
        .select("id, nome, sku, ativo, estoque(quantidade, quantidade_minima)")
        .eq("ativo", true)
        .order("nome");
      if (error) throw error;

      const ids = (produtos ?? []).map((p) => p.id);
      let movMap = new Map<string, string>();
      if (ids.length) {
        const { data: movs } = await supabase
          .from("movimentacoes_estoque")
          .select("produto_id, created_at")
          .in("produto_id", ids)
          .order("created_at", { ascending: false });
        for (const m of movs ?? []) {
          if (!movMap.has(m.produto_id)) movMap.set(m.produto_id, m.created_at);
        }
      }

      const novas: LinhaEstoque[] = (produtos ?? []).map((p) => {
        const e = (p as unknown as { estoque: { quantidade: number; quantidade_minima: number }[] }).estoque?.[0];
        return {
          produto_id: p.id,
          nome: p.nome,
          sku: p.sku,
          quantidade: Number(e?.quantidade ?? 0),
          quantidade_minima: Number(e?.quantidade_minima ?? 0),
          ultima_mov: movMap.get(p.id) ?? null,
        };
      });
      setLinhas(novas);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const carregarMovimentacoes = async () => {
    setLoadingMov(true);
    try {
      let query = supabase
        .from("movimentacoes_estoque")
        .select("id, created_at, tipo, quantidade, motivo, produto_id, produtos(nome, sku)")
        .order("created_at", { ascending: false })
        .limit(500);

      if (periodoFiltro !== "todos") {
        const dias = Number(periodoFiltro);
        const desde = new Date();
        desde.setDate(desde.getDate() - dias);
        query = query.gte("created_at", desde.toISOString());
      }
      if (tipoFiltro !== "todos") {
        query = query.eq("tipo", tipoFiltro);
      }

      const { data, error } = await query;
      if (error) throw error;
      const novas: Movimentacao[] = (data ?? []).map((m) => {
        const prod = (m as unknown as { produtos: { nome: string; sku: string | null } | null }).produtos;
        return {
          id: m.id,
          created_at: m.created_at,
          tipo: m.tipo,
          quantidade: Number(m.quantidade),
          motivo: m.motivo,
          produto_id: m.produto_id,
          produto_nome: prod?.nome ?? "Produto removido",
          produto_sku: prod?.sku ?? null,
        };
      });
      setMovimentacoes(novas);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingMov(false);
    }
  };

  useEffect(() => {
    void carregarEstoque();
  }, []);

  useEffect(() => {
    void carregarMovimentacoes();
  }, [tipoFiltro, periodoFiltro]);

  const abaixoMinimo = useMemo(
    () => linhas.filter((l) => l.quantidade <= l.quantidade_minima && l.quantidade_minima > 0).length,
    [linhas],
  );

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return linhas.filter((l) => {
      if (q) {
        const match =
          l.nome.toLowerCase().includes(q) ||
          (l.sku ?? "").toLowerCase().includes(q);
        if (!match) return false;
      }
      if (statusFiltro !== "todos") {
        const s = statusInfo(l.quantidade, l.quantidade_minima);
        if (s.id !== statusFiltro) return false;
      }
      return true;
    });
  }, [linhas, busca, statusFiltro]);

  const totais = useMemo(() => {
    const total = linhas.length;
    const zerado = linhas.filter((l) => l.quantidade <= 0).length;
    const baixo = linhas.filter((l) => l.quantidade > 0 && l.quantidade <= l.quantidade_minima && l.quantidade_minima > 0).length;
    const ok = total - zerado - baixo;
    return { total, zerado, baixo, ok };
  }, [linhas]);

  const onSuccess = () => {
    void carregarEstoque();
    void carregarMovimentacoes();
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight">Estoque</h1>
            <p className="text-sm text-muted-foreground">
              Controle suas quantidades, entradas e ajustes.
            </p>
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Button variant="outline" onClick={() => setAjusteOpen(true)} className="flex-1 sm:flex-none min-h-[44px]">
              <ClipboardList className="h-4 w-4 sm:mr-1.5" />
              <span className="hidden sm:inline">Ajuste de Inventário</span>
              <span className="sm:hidden">Ajuste</span>
            </Button>
            <Button onClick={() => setEntradaOpen(true)} className="flex-1 sm:flex-none min-h-[44px]">
              <Plus className="h-4 w-4 sm:mr-1.5" />
              <span className="hidden sm:inline">Entrada de Estoque</span>
              <span className="sm:hidden">Entrada</span>
            </Button>
          </div>
        </div>

        {/* Cards de alerta */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Card className="p-4">
            <div className="mono text-[10px] uppercase tracking-widest text-muted-foreground">
              Total de produtos
            </div>
            <div className="num text-2xl font-bold mt-1">{num(totais.total)}</div>
          </Card>
          <Card className="p-4">
            <div className="mono text-[10px] uppercase tracking-widest text-primary">
              Em estoque
            </div>
            <div className="num text-2xl font-bold mt-1 text-primary">{num(totais.ok)}</div>
          </Card>
          <button
            type="button"
            onClick={() => setStatusFiltro(statusFiltro === "baixo" ? "todos" : "baixo")}
            className={cn(
              "text-left rounded-xl border bg-card p-4 transition-all hover:shadow-md",
              statusFiltro === "baixo" ? "border-amber-500 ring-2 ring-amber-500/20" : "border-border",
            )}
          >
            <div className="mono text-[10px] uppercase tracking-widest text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
              <AlertTriangle className="h-3 w-3" /> Estoque baixo
            </div>
            <div className="num text-2xl font-bold mt-1 text-amber-600 dark:text-amber-400">
              {num(abaixoMinimo)}
            </div>
          </button>
          <button
            type="button"
            onClick={() => setStatusFiltro(statusFiltro === "zerado" ? "todos" : "zerado")}
            className={cn(
              "text-left rounded-xl border bg-card p-4 transition-all hover:shadow-md",
              statusFiltro === "zerado" ? "border-destructive ring-2 ring-destructive/20" : "border-border",
            )}
          >
            <div className="mono text-[10px] uppercase tracking-widest text-destructive">
              Zerados
            </div>
            <div className="num text-2xl font-bold mt-1 text-destructive">{num(totais.zerado)}</div>
          </button>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="estoque" className="space-y-4">
          <TabsList>
            <TabsTrigger value="estoque">Posição de estoque</TabsTrigger>
            <TabsTrigger value="movimentacoes">Movimentações</TabsTrigger>
          </TabsList>

          <TabsContent value="estoque" className="space-y-4">
            <Card className="p-4">
              <div className="flex flex-wrap items-center gap-3">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar por nome ou SKU…"
                    value={busca}
                    onChange={(e) => setBusca(e.target.value)}
                    className="pl-9"
                  />
                </div>
                <Select value={statusFiltro} onValueChange={(v) => setStatusFiltro(v as StatusFiltro)}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos os status</SelectItem>
                    <SelectItem value="ok">OK</SelectItem>
                    <SelectItem value="baixo">Baixo</SelectItem>
                    <SelectItem value="zerado">Zerado</SelectItem>
                  </SelectContent>
                </Select>
                {(busca || statusFiltro !== "todos") && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => { setBusca(""); setStatusFiltro("todos"); }}
                  >
                    <X className="h-4 w-4 mr-1" /> Limpar
                  </Button>
                )}
              </div>
            </Card>

            {/* Desktop / tablet: tabela */}
            <Card className="overflow-hidden hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Produto</TableHead>
                    <TableHead className="mono text-[10px] uppercase tracking-widest">SKU</TableHead>
                    <TableHead className="text-right">Atual</TableHead>
                    <TableHead className="text-right">Mínimo</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Última mov.</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    Array.from({ length: 6 }).map((_, i) => (
                      <TableRow key={i}>
                        <TableCell colSpan={6}>
                          <Skeleton className="h-6 w-full" />
                        </TableCell>
                      </TableRow>
                    ))
                  ) : filtradas.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                        <Package className="h-8 w-8 mx-auto mb-2 opacity-40" />
                        Nenhum produto encontrado
                      </TableCell>
                    </TableRow>
                  ) : (
                    filtradas.map((l) => {
                      const s = statusInfo(l.quantidade, l.quantidade_minima);
                      return (
                        <TableRow key={l.produto_id}>
                          <TableCell className="font-medium">{l.nome}</TableCell>
                          <TableCell className="mono text-xs text-muted-foreground">
                            {l.sku ?? "—"}
                          </TableCell>
                          <TableCell className="num text-right font-semibold">
                            {num(l.quantidade)}
                          </TableCell>
                          <TableCell className="num text-right text-muted-foreground">
                            {num(l.quantidade_minima)}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className={s.cls}>{s.label}</Badge>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {fmtData(l.ultima_mov)}
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </Card>

            {/* Mobile: cards */}
            <div className="md:hidden space-y-2">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-20 w-full rounded-xl" />
                ))
              ) : filtradas.length === 0 ? (
                <Card className="p-10 text-center text-muted-foreground">
                  <Package className="h-8 w-8 mx-auto mb-2 opacity-40" />
                  Nenhum produto encontrado
                </Card>
              ) : (
                filtradas.map((l) => {
                  const s = statusInfo(l.quantidade, l.quantidade_minima);
                  const isOpen = expanded.has(l.produto_id);
                  return (
                    <Card key={l.produto_id} className="p-3">
                      <button
                        type="button"
                        onClick={() => toggleExpanded(l.produto_id)}
                        className="w-full flex items-start gap-3 text-left"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold truncate">{l.nome}</span>
                            <Badge variant="outline" className={cn("text-[10px]", s.cls)}>{s.label}</Badge>
                          </div>
                          <div className="num text-lg font-bold mt-1">
                            {num(l.quantidade)}
                            <span className="text-xs font-normal text-muted-foreground ml-1">
                              {l.quantidade === 1 ? "unidade" : "unidades"}
                            </span>
                          </div>
                        </div>
                        <ChevronDown
                          className={cn(
                            "h-4 w-4 text-muted-foreground mt-1 transition-transform shrink-0",
                            isOpen && "rotate-180",
                          )}
                        />
                      </button>
                      {isOpen && (
                        <div className="mt-3 pt-3 border-t border-border space-y-1.5 text-xs text-muted-foreground">
                          <div className="flex justify-between">
                            <span>SKU</span>
                            <span className="mono">{l.sku ?? "—"}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Mínimo</span>
                            <span className="num">{num(l.quantidade_minima)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Última movimentação</span>
                            <span>{fmtData(l.ultima_mov)}</span>
                          </div>
                        </div>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        className="mt-3 w-full min-h-[40px]"
                        onClick={() => setEntradaOpen(true)}
                      >
                        <PlusIcon className="h-3.5 w-3.5 mr-1" /> Entrada
                      </Button>
                    </Card>
                  );
                })
              )}
            </div>
          </TabsContent>

          <TabsContent value="movimentacoes" className="space-y-4">
            <Card className="p-4">
              <div className="flex flex-wrap items-center gap-3">
                <Select value={tipoFiltro} onValueChange={setTipoFiltro}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos os tipos</SelectItem>
                    <SelectItem value="entrada">Entradas</SelectItem>
                    <SelectItem value="saida">Saídas</SelectItem>
                    <SelectItem value="ajuste">Ajustes</SelectItem>
                    <SelectItem value="transferencia">Transferências</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={periodoFiltro} onValueChange={(v) => setPeriodoFiltro(v as Periodo)}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="7">Últimos 7 dias</SelectItem>
                    <SelectItem value="30">Últimos 30 dias</SelectItem>
                    <SelectItem value="90">Últimos 90 dias</SelectItem>
                    <SelectItem value="todos">Tudo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </Card>

            {/* Desktop: tabela */}
            <Card className="overflow-hidden hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Produto</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead className="text-right">Quantidade</TableHead>
                    <TableHead>Motivo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loadingMov ? (
                    Array.from({ length: 6 }).map((_, i) => (
                      <TableRow key={i}>
                        <TableCell colSpan={5}>
                          <Skeleton className="h-6 w-full" />
                        </TableCell>
                      </TableRow>
                    ))
                  ) : movimentacoes.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-12 text-muted-foreground">
                        Nenhuma movimentação no período
                      </TableCell>
                    </TableRow>
                  ) : (
                    movimentacoes.map((m) => {
                      const t = tipoInfo(m.tipo);
                      const Icon = t.icon;
                      return (
                        <TableRow key={m.id}>
                          <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                            {fmtData(m.created_at)}
                          </TableCell>
                          <TableCell>
                            <div className="font-medium">{m.produto_nome}</div>
                            {m.produto_sku && (
                              <div className="mono text-[10px] text-muted-foreground">
                                {m.produto_sku}
                              </div>
                            )}
                          </TableCell>
                          <TableCell>
                            <span className={cn("inline-flex items-center gap-1.5 text-sm font-medium", t.cls)}>
                              <Icon className="h-3.5 w-3.5" />
                              {t.label}
                            </span>
                          </TableCell>
                          <TableCell className={cn("num text-right font-semibold", t.cls)}>
                            {m.tipo === "saida" ? "-" : m.tipo === "entrada" ? "+" : ""}
                            {num(m.quantidade)}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground max-w-xs truncate">
                            {m.motivo ?? "—"}
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </Card>

            {/* Mobile: cards de movimentação */}
            <div className="md:hidden space-y-2">
              {loadingMov ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full rounded-xl" />
                ))
              ) : movimentacoes.length === 0 ? (
                <Card className="p-10 text-center text-muted-foreground">
                  Nenhuma movimentação no período
                </Card>
              ) : (
                movimentacoes.map((m) => {
                  const t = tipoInfo(m.tipo);
                  const Icon = t.icon;
                  return (
                    <Card key={m.id} className="p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className={cn("inline-flex items-center gap-1.5 text-xs font-semibold", t.cls)}>
                            <Icon className="h-3.5 w-3.5" /> {t.label}
                          </div>
                          <div className="font-medium mt-1 truncate">{m.produto_nome}</div>
                          <div className="text-[11px] text-muted-foreground mt-0.5">
                            {fmtData(m.created_at)}
                            {m.motivo ? ` · ${m.motivo}` : ""}
                          </div>
                        </div>
                        <div className={cn("num font-bold text-lg shrink-0", t.cls)}>
                          {m.tipo === "saida" ? "-" : m.tipo === "entrada" ? "+" : ""}
                          {num(m.quantidade)}
                        </div>
                      </div>
                    </Card>
                  );
                })
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>

      <EntradaEstoqueDialog
        open={entradaOpen}
        onOpenChange={setEntradaOpen}
        onSuccess={onSuccess}
      />
      <AjusteInventarioDialog
        open={ajusteOpen}
        onOpenChange={setAjusteOpen}
        onSuccess={onSuccess}
      />
    </AppLayout>
  );
};

export default Estoque;