import { useEffect, useMemo, useRef, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { supabase } from "@/integrations/supabase/client";
import { brl } from "@/lib/format";
import { Link } from "react-router-dom";
import {
  Search, Plus, Minus, Trash2, Package, User, X, ShoppingCart,
  Banknote, CreditCard, QrCode, History, Loader2, Check, ChevronsUpDown,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { VendaSucessoModal, type VendaConcluida } from "@/components/VendaSucessoModal";

type Produto = {
  id: string;
  nome: string;
  sku: string | null;
  ean: string | null;
  preco_venda: number;
  fotos: string[] | null;
  estoque: { quantidade: number }[];
};

type CartItem = {
  produto_id: string;
  nome: string;
  preco_unit: number;
  quantidade: number;
  estoque_disponivel: number;
  removing?: boolean;
};

type Cliente = { id: string; nome: string; telefone: string | null };

type Pagamento = "dinheiro" | "pix" | "cartao_debito" | "cartao_credito";
type DescontoTipo = "valor" | "percent";

const PAGAMENTOS: { id: Pagamento; label: string; icon: typeof Banknote }[] = [
  { id: "dinheiro", label: "Dinheiro", icon: Banknote },
  { id: "pix", label: "PIX", icon: QrCode },
  { id: "cartao_debito", label: "Débito", icon: CreditCard },
  { id: "cartao_credito", label: "Crédito", icon: CreditCard },
];

const Vendas = () => {
  const searchRef = useRef<HTMLInputElement>(null);
  const [busca, setBusca] = useState("");
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [frequentes, setFrequentes] = useState<Produto[]>([]);
  const [loadingProdutos, setLoadingProdutos] = useState(true);
  const [clientes, setClientes] = useState<Cliente[]>([]);

  const [cart, setCart] = useState<CartItem[]>([]);
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [clientePopoverOpen, setClientePopoverOpen] = useState(false);
  const [clienteSearch, setClienteSearch] = useState("");

  const [pagamento, setPagamento] = useState<Pagamento>("dinheiro");
  const [recebido, setRecebido] = useState("");
  const [descontoTipo, setDescontoTipo] = useState<DescontoTipo>("valor");
  const [descontoValor, setDescontoValor] = useState("");

  const [finalizando, setFinalizando] = useState(false);
  const [sucesso, setSucesso] = useState<VendaConcluida | null>(null);

  // Foco automático
  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  // Carregar produtos + frequentes + clientes
  useEffect(() => {
    (async () => {
      setLoadingProdutos(true);
      const [{ data: prods }, { data: cli }, { data: top }] = await Promise.all([
        supabase
          .from("produtos")
          .select("id,nome,sku,ean,preco_venda,fotos,estoque(quantidade)")
          .eq("ativo", true)
          .order("nome"),
        supabase.from("clientes").select("id,nome,telefone").order("nome"),
        // Mais vendidos últimos 30 dias via venda_itens
        supabase.rpc("get_loja_id").then(async ({ data: lojaId }) => {
          if (!lojaId) return { data: [] as any[] };
          const since = new Date();
          since.setDate(since.getDate() - 30);
          // Fallback: pegar venda_itens recentes e agregar no cliente
          const { data: vendasRecent } = await supabase
            .from("vendas")
            .select("id, venda_itens(produto_id, quantidade)")
            .eq("loja_id", lojaId)
            .eq("status", "concluida")
            .gte("created_at", since.toISOString());
          return { data: vendasRecent ?? [] };
        }),
      ]);
      const lista = (prods as Produto[]) ?? [];
      setProdutos(lista);
      setClientes((cli as Cliente[]) ?? []);

      // Calcular top 12 produtos
      const counter = new Map<string, number>();
      (top.data as any[])?.forEach((v) => {
        v.venda_itens?.forEach((it: any) => {
          if (!it.produto_id) return;
          counter.set(it.produto_id, (counter.get(it.produto_id) ?? 0) + Number(it.quantidade));
        });
      });
      const ranked = [...counter.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
      const topProds = ranked
        .map(([pid]) => lista.find((p) => p.id === pid))
        .filter(Boolean) as Produto[];

      // Se ainda não há vendas, usa primeiros 12 do catálogo
      setFrequentes(topProds.length > 0 ? topProds : lista.slice(0, 12));
      setLoadingProdutos(false);
    })();
  }, []);

  const filtered = useMemo(() => {
    const s = busca.trim().toLowerCase();
    if (!s) return [];
    return produtos.filter(
      (p) =>
        p.nome.toLowerCase().includes(s) ||
        p.sku?.toLowerCase().includes(s) ||
        p.ean?.toLowerCase().includes(s),
    );
  }, [busca, produtos]);

  const filteredClientes = useMemo(() => {
    const s = clienteSearch.trim().toLowerCase();
    if (!s) return clientes.slice(0, 50);
    return clientes.filter(
      (c) => c.nome.toLowerCase().includes(s) || c.telefone?.toLowerCase().includes(s),
    ).slice(0, 50);
  }, [clienteSearch, clientes]);

  const addToCart = (p: Produto) => {
    const estoqueDisp = p.estoque?.[0]?.quantidade ?? 0;
    setCart((cur) => {
      const exists = cur.find((i) => i.produto_id === p.id);
      if (exists) {
        if (exists.quantidade >= estoqueDisp) {
          toast.error(`Estoque insuficiente: ${p.nome}`);
          return cur;
        }
        return cur.map((i) =>
          i.produto_id === p.id ? { ...i, quantidade: i.quantidade + 1 } : i,
        );
      }
      if (estoqueDisp <= 0) {
        toast.error(`Sem estoque: ${p.nome}`);
        return cur;
      }
      return [
        ...cur,
        {
          produto_id: p.id,
          nome: p.nome,
          preco_unit: Number(p.preco_venda),
          quantidade: 1,
          estoque_disponivel: estoqueDisp,
        },
      ];
    });
  };

  const updateQty = (id: string, delta: number) => {
    setCart((cur) =>
      cur
        .map((i) => {
          if (i.produto_id !== id) return i;
          const next = i.quantidade + delta;
          if (next > i.estoque_disponivel) {
            toast.error("Estoque insuficiente");
            return i;
          }
          return { ...i, quantidade: next };
        })
        .filter((i) => i.quantidade > 0),
    );
  };

  const removeItem = (id: string) => {
    setCart((cur) => cur.map((i) => (i.produto_id === id ? { ...i, removing: true } : i)));
    setTimeout(() => {
      setCart((cur) => cur.filter((i) => i.produto_id !== id));
    }, 220);
  };

  const subtotal = cart.reduce((a, i) => a + i.preco_unit * i.quantidade, 0);
  const desconto = useMemo(() => {
    const v = Number(descontoValor) || 0;
    if (descontoTipo === "percent") return Math.min(subtotal, (subtotal * v) / 100);
    return Math.min(subtotal, v);
  }, [descontoValor, descontoTipo, subtotal]);
  const total = Math.max(0, subtotal - desconto);
  const troco = pagamento === "dinheiro" ? Math.max(0, Number(recebido || 0) - total) : 0;

  // Enter no input adiciona produto (scanner)
  const onSearchKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const s = busca.trim();
    if (!s) return;
    // Match exato por EAN/SKU primeiro
    const exact = produtos.find(
      (p) => p.ean?.toLowerCase() === s.toLowerCase() || p.sku?.toLowerCase() === s.toLowerCase(),
    );
    if (exact) {
      addToCart(exact);
      setBusca("");
      return;
    }
    if (filtered.length === 1) {
      addToCart(filtered[0]);
      setBusca("");
      return;
    }
    toast.error("Produto não encontrado");
  };

  const finalizar = async () => {
    if (cart.length === 0) {
      toast.error("Carrinho vazio");
      return;
    }
    if (pagamento === "dinheiro" && Number(recebido || 0) < total) {
      toast.error("Valor recebido menor que o total");
      return;
    }
    setFinalizando(true);

    const { data: lojaIdData } = await supabase.rpc("get_loja_id");
    const loja_id = lojaIdData as string | null;
    const { data: userData } = await supabase.auth.getUser();
    if (!loja_id) {
      setFinalizando(false);
      toast.error("Não foi possível identificar sua loja.");
      return;
    }

    const { data: vendaIns, error: vErr } = await supabase
      .from("vendas")
      .insert({
        loja_id,
        cliente_id: cliente?.id ?? null,
        vendedor_id: userData.user?.id ?? null,
        total,
        desconto,
        forma_pagamento: pagamento,
        status: "concluida",
      })
      .select("id, created_at")
      .single();
    if (vErr || !vendaIns) {
      setFinalizando(false);
      toast.error(vErr?.message ?? "Erro ao registrar venda");
      return;
    }

    const itens = cart.map((i) => ({
      venda_id: vendaIns.id,
      produto_id: i.produto_id,
      quantidade: i.quantidade,
      preco_unit: i.preco_unit,
      desconto: 0,
    }));
    const { error: iErr } = await supabase.from("venda_itens").insert(itens);
    if (iErr) {
      setFinalizando(false);
      toast.error(iErr.message);
      return;
    }

    setFinalizando(false);
    setSucesso({
      venda_id: vendaIns.id,
      created_at: vendaIns.created_at,
      cliente: cliente?.nome ?? "Sem cliente",
      itens: cart.map((i) => ({
        nome: i.nome,
        quantidade: i.quantidade,
        preco_unit: i.preco_unit,
        subtotal: i.preco_unit * i.quantidade,
      })),
      subtotal,
      desconto,
      total,
      pagamento: PAGAMENTOS.find((p) => p.id === pagamento)?.label ?? pagamento,
      recebido: pagamento === "dinheiro" ? Number(recebido || 0) : null,
      troco: pagamento === "dinheiro" ? troco : null,
    });
  };

  const novaVenda = () => {
    setCart([]);
    setCliente(null);
    setPagamento("dinheiro");
    setRecebido("");
    setDescontoValor("");
    setBusca("");
    setSucesso(null);
    setTimeout(() => searchRef.current?.focus(), 50);
  };

  return (
    <AppLayout>
      <div className="max-w-[1600px] mx-auto">
        <header className="flex flex-wrap items-end justify-between gap-4 mb-6">
          <div>
            <span className="mono text-[10px] uppercase tracking-widest text-muted-foreground">
              Ponto de venda
            </span>
            <h1 className="font-display text-4xl font-bold tracking-tight mt-1">Nova venda</h1>
          </div>
          <Link to="/vendas/historico">
            <Button variant="outline" className="h-10">
              <History className="h-4 w-4 mr-1" /> Histórico
            </Button>
          </Link>
        </header>

        <div className="grid lg:grid-cols-[3fr_2fr] gap-5">
          {/* COLUNA ESQUERDA — Produtos */}
          <Card className="p-5 shadow-soft-sm space-y-5">
            <div className="relative">
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                ref={searchRef}
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                onKeyDown={onSearchKey}
                placeholder="Buscar por nome, SKU, EAN ou bipar código…"
                className="pl-9 h-12 text-base mono"
                autoFocus
              />
            </div>

            {busca.trim() ? (
              <div>
                <div className="mono text-[10px] uppercase tracking-widest text-muted-foreground mb-3">
                  Resultados ({filtered.length})
                </div>
                {filtered.length === 0 ? (
                  <div className="text-center py-8 text-sm text-muted-foreground">
                    Nenhum produto encontrado
                  </div>
                ) : (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {filtered.slice(0, 24).map((p) => (
                      <ProdutoCard key={p.id} p={p} onClick={() => addToCart(p)} />
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div>
                <div className="mono text-[10px] uppercase tracking-widest text-muted-foreground mb-3">
                  Mais vendidos · 30 dias
                </div>
                {loadingProdutos ? (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {Array.from({ length: 6 }).map((_, i) => (
                      <Skeleton key={i} className="aspect-[4/3] rounded-lg" />
                    ))}
                  </div>
                ) : frequentes.length === 0 ? (
                  <div className="text-center py-12">
                    <Package className="h-10 w-10 mx-auto text-muted-foreground/40" />
                    <p className="text-sm text-muted-foreground mt-3">
                      Cadastre produtos para vender
                    </p>
                    <Link to="/catalogo/novo">
                      <Button variant="outline" size="sm" className="mt-4">
                        Ir para catálogo
                      </Button>
                    </Link>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {frequentes.map((p) => (
                      <ProdutoCard key={p.id} p={p} onClick={() => addToCart(p)} />
                    ))}
                  </div>
                )}
              </div>
            )}
          </Card>

          {/* COLUNA DIREITA — Carrinho */}
          <div className="space-y-4">
            <Card className="p-5 shadow-soft-sm">
              <div className="flex items-center gap-2 mb-4">
                <ShoppingCart className="h-4 w-4 text-primary" />
                <span className="mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  Carrinho · {cart.length} {cart.length === 1 ? "item" : "itens"}
                </span>
              </div>

              {cart.length === 0 ? (
                <div className="text-center py-10">
                  <ShoppingCart className="h-10 w-10 mx-auto text-muted-foreground/30" />
                  <p className="text-sm text-muted-foreground mt-3">
                    Adicione produtos para iniciar
                  </p>
                </div>
              ) : (
                <ul className="divide-y divide-border max-h-[40vh] overflow-y-auto -mx-1 px-1">
                  {cart.map((i) => (
                    <li
                      key={i.produto_id}
                      className={cn(
                        "py-3 flex items-start gap-3 transition-all duration-200",
                        i.removing && "opacity-0 translate-x-8",
                      )}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium leading-tight line-clamp-2">{i.nome}</p>
                        <div className="flex items-center gap-1 mt-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => updateQty(i.produto_id, -1)}
                          >
                            <Minus className="h-3 w-3" />
                          </Button>
                          <span className="num text-sm font-semibold w-8 text-center">
                            {i.quantidade}
                          </span>
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => updateQty(i.produto_id, 1)}
                          >
                            <Plus className="h-3 w-3" />
                          </Button>
                          <span className="mono text-[10px] text-muted-foreground ml-2">
                            × {brl(i.preco_unit)}
                          </span>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <span className="num font-bold text-sm">
                          {brl(i.preco_unit * i.quantidade)}
                        </span>
                        <button
                          type="button"
                          onClick={() => removeItem(i.produto_id)}
                          className="text-muted-foreground hover:text-destructive transition-colors"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card className="p-5 shadow-soft-sm space-y-4">
              {/* Cliente */}
              <div>
                <label className="mono text-[10px] uppercase tracking-widest text-muted-foreground block mb-1.5">
                  Cliente
                </label>
                <Popover open={clientePopoverOpen} onOpenChange={setClientePopoverOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      role="combobox"
                      className="w-full justify-between h-10 font-normal"
                    >
                      <span className="flex items-center gap-2 truncate">
                        <User className="h-3.5 w-3.5 shrink-0" />
                        {cliente ? cliente.nome : "Venda sem cliente"}
                      </span>
                      {cliente ? (
                        <X
                          className="h-3.5 w-3.5 opacity-60 hover:opacity-100"
                          onClick={(e) => {
                            e.stopPropagation();
                            setCliente(null);
                          }}
                        />
                      ) : (
                        <ChevronsUpDown className="h-3.5 w-3.5 opacity-50" />
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                    <div className="p-2 border-b">
                      <Input
                        autoFocus
                        value={clienteSearch}
                        onChange={(e) => setClienteSearch(e.target.value)}
                        placeholder="Buscar cliente…"
                        className="h-9"
                      />
                    </div>
                    <ul className="max-h-60 overflow-y-auto py-1">
                      <li>
                        <button
                          type="button"
                          onClick={() => {
                            setCliente(null);
                            setClientePopoverOpen(false);
                          }}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-muted flex items-center gap-2"
                        >
                          {cliente === null && <Check className="h-3.5 w-3.5 text-primary" />}
                          <span className={cn(cliente !== null && "ml-[18px]", "text-muted-foreground")}>
                            Venda sem cliente
                          </span>
                        </button>
                      </li>
                      {filteredClientes.length === 0 && clienteSearch && (
                        <li className="px-3 py-3 text-xs text-muted-foreground text-center">
                          Nenhum cliente encontrado
                        </li>
                      )}
                      {filteredClientes.map((c) => (
                        <li key={c.id}>
                          <button
                            type="button"
                            onClick={() => {
                              setCliente(c);
                              setClientePopoverOpen(false);
                            }}
                            className="w-full text-left px-3 py-2 text-sm hover:bg-muted flex items-center gap-2"
                          >
                            {cliente?.id === c.id ? (
                              <Check className="h-3.5 w-3.5 text-primary" />
                            ) : (
                              <span className="w-[14px]" />
                            )}
                            <div className="flex-1 min-w-0">
                              <div className="truncate">{c.nome}</div>
                              {c.telefone && (
                                <div className="mono text-[10px] text-muted-foreground">
                                  {c.telefone}
                                </div>
                              )}
                            </div>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </PopoverContent>
                </Popover>
              </div>

              {/* Desconto */}
              <div>
                <label className="mono text-[10px] uppercase tracking-widest text-muted-foreground block mb-1.5">
                  Desconto
                </label>
                <div className="flex gap-2">
                  <Select value={descontoTipo} onValueChange={(v: DescontoTipo) => setDescontoTipo(v)}>
                    <SelectTrigger className="w-[80px] h-10">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="valor">R$</SelectItem>
                      <SelectItem value="percent">%</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={descontoValor}
                    onChange={(e) => setDescontoValor(e.target.value)}
                    placeholder="0,00"
                    className="mono h-10"
                  />
                </div>
              </div>

              {/* Pagamento */}
              <div>
                <label className="mono text-[10px] uppercase tracking-widest text-muted-foreground block mb-1.5">
                  Forma de pagamento
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {PAGAMENTOS.map((p) => {
                    const Icon = p.icon;
                    const active = pagamento === p.id;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setPagamento(p.id)}
                        className={cn(
                          "rounded-lg border-2 px-3 py-2.5 text-sm flex items-center gap-2 transition-all",
                          active
                            ? "border-primary bg-primary-soft text-primary font-semibold"
                            : "border-border hover:border-muted-foreground/30",
                        )}
                      >
                        <Icon className="h-4 w-4" />
                        {p.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {pagamento === "dinheiro" && (
                <div>
                  <label className="mono text-[10px] uppercase tracking-widest text-muted-foreground block mb-1.5">
                    Valor recebido
                  </label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={recebido}
                    onChange={(e) => setRecebido(e.target.value)}
                    placeholder="0,00"
                    className="mono h-10 text-base"
                  />
                  {Number(recebido) > 0 && (
                    <div className="mt-2 flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Troco</span>
                      <span className="num font-bold text-primary">{brl(troco)}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Totais */}
              <div className="border-t border-border pt-4 space-y-1.5 text-sm">
                <div className="flex justify-between text-muted-foreground">
                  <span>Subtotal</span>
                  <span className="num">{brl(subtotal)}</span>
                </div>
                {desconto > 0 && (
                  <div className="flex justify-between text-destructive">
                    <span>Desconto</span>
                    <span className="num">- {brl(desconto)}</span>
                  </div>
                )}
                <div className="flex justify-between items-baseline pt-2">
                  <span className="mono text-[10px] uppercase tracking-widest text-muted-foreground">
                    Total
                  </span>
                  <span className="num text-3xl font-bold text-primary">{brl(total)}</span>
                </div>
              </div>

              <Button
                type="button"
                onClick={finalizar}
                disabled={finalizando || cart.length === 0}
                className="w-full h-12 text-base font-semibold"
              >
                {finalizando ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Finalizando…</>
                ) : (
                  <>Finalizar venda · {brl(total)}</>
                )}
              </Button>
            </Card>
          </div>
        </div>
      </div>

      {sucesso && <VendaSucessoModal venda={sucesso} onNovaVenda={novaVenda} />}
    </AppLayout>
  );
};

const ProdutoCard = ({ p, onClick }: { p: Produto; onClick: () => void }) => {
  const estoque = p.estoque?.[0]?.quantidade ?? 0;
  const sem = estoque <= 0;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group rounded-lg border bg-card text-left overflow-hidden transition-all hover:border-primary/40 hover:shadow-soft-md relative",
        sem && "opacity-60",
      )}
    >
      <div className="aspect-[4/3] bg-muted relative">
        {p.fotos?.[0] ? (
          <img
            src={p.fotos[0]}
            alt={p.nome}
            className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="h-full w-full flex items-center justify-center text-muted-foreground">
            <Package className="h-8 w-8 opacity-30" />
          </div>
        )}
        {sem && (
          <Badge className="absolute top-2 left-2 bg-destructive text-destructive-foreground border-0 mono text-[9px]">
            sem estoque
          </Badge>
        )}
      </div>
      <div className="p-2.5">
        <p className="text-xs font-medium leading-tight line-clamp-2">{p.nome}</p>
        <p className="num text-sm font-bold text-primary mt-1">{brl(p.preco_venda)}</p>
      </div>
    </button>
  );
};

export default Vendas;