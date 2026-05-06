import { traduzErro } from "@/lib/errors";
import { useEffect, useMemo, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { brl } from "@/lib/format";
import { Link, useNavigate } from "react-router-dom";
import { Plus, Search, Package, MoreHorizontal, Pencil, Copy, Power, Trash2, ShoppingCart, Eye, Share2 } from "lucide-react";
import { toast } from "sonner";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ResponsiveModal } from "@/components/ResponsiveModal";
import { SlidersHorizontal } from "lucide-react";

type Produto = {
  id: string;
  nome: string;
  sku: string | null;
  ean: string | null;
  categoria: string | null;
  preco_venda: number;
  ativo: boolean;
  fotos: string[] | null;
  descricao?: string | null;
  estoque: { quantidade: number; quantidade_minima: number }[];
};

const stockTone = (qtd: number, min: number) => {
  if (qtd <= 0) return { cls: "bg-destructive/10 text-destructive", label: "Sem estoque" };
  if (qtd <= Math.max(min, 5)) return { cls: "bg-warning/10 text-warning", label: `${qtd} un.` };
  return { cls: "bg-primary-soft text-primary", label: `${qtd} un.` };
};

const Catalogo = () => {
  const navigate = useNavigate();
  const [items, setItems] = useState<Produto[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<string>("todas");
  const [status, setStatus] = useState<string>("todos");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [preview, setPreview] = useState<Produto | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("produtos")
      .select("id,nome,sku,ean,categoria,preco_venda,ativo,fotos,descricao,estoque(quantidade,quantidade_minima)")
      .order("created_at", { ascending: false });
    if (error) toast.error(traduzErro(error));
    setItems((data as unknown as Produto[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const categorias = useMemo(() => {
    const s = new Set<string>();
    items.forEach((p) => p.categoria && s.add(p.categoria));
    return Array.from(s).sort();
  }, [items]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return items.filter((p) => {
      if (status === "ativos" && !p.ativo) return false;
      if (status === "inativos" && p.ativo) return false;
      if (cat !== "todas" && p.categoria !== cat) return false;
      if (!s) return true;
      return (
        p.nome.toLowerCase().includes(s) ||
        p.sku?.toLowerCase().includes(s) ||
        p.ean?.toLowerCase().includes(s)
      );
    });
  }, [items, q, cat, status]);

  const handleDelete = async (id: string) => {
    if (!confirm("Excluir este produto?")) return;
    const { error } = await supabase.from("produtos").delete().eq("id", id);
    if (error) return toast.error(traduzErro(error));
    toast.success("Produto excluído");
    setItems((it) => it.filter((p) => p.id !== id));
  };

  const handleToggle = async (p: Produto) => {
    const next = !p.ativo;
    const { error } = await supabase.from("produtos").update({ ativo: next }).eq("id", p.id);
    if (error) return toast.error(traduzErro(error));
    setItems((it) => it.map((x) => (x.id === p.id ? { ...x, ativo: next } : x)));
    toast.success(next ? "Produto ativado" : "Produto desativado");
  };

  const adicionarAoCarrinho = (p: Produto) => {
    if (!p.ativo) {
      toast.error("Produto inativo não pode ser vendido");
      return;
    }
    try {
      const raw = localStorage.getItem("pending_cart_items");
      const arr: string[] = raw ? JSON.parse(raw) : [];
      arr.push(p.id);
      localStorage.setItem("pending_cart_items", JSON.stringify(arr));
    } catch {
      // ignora erros de storage
    }
    toast.success(`${p.nome} adicionado ao carrinho`);
    setPreview(null);
    navigate("/vendas");
  };

  const compartilharCatalogo = async () => {
    const { data, error } = await supabase.rpc("get_loja_id");
    if (error || !data) return toast.error("Não foi possível obter o link");
    const url = `${window.location.origin}/c/${data}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: "Catálogo", url });
      } else {
        await navigator.clipboard.writeText(url);
        toast.success("Link copiado para a área de transferência");
      }
    } catch {
      // usuário cancelou compartilhamento
    }
  };

  return (
    <AppLayout>
      <div className="max-w-7xl mx-auto space-y-5 sm:space-y-6">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <span className="mono text-[10px] uppercase tracking-widest text-muted-foreground">Produtos</span>
            <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight mt-1">Catálogo</h1>
            <p className="text-muted-foreground text-sm mt-1">
              {items.length} {items.length === 1 ? "produto" : "produtos"} cadastrados
            </p>
          </div>
          <div className="flex gap-2">
          <Button variant="outline" className="h-10 min-h-[44px]" onClick={compartilharCatalogo}>
            <Share2 className="h-4 w-4 sm:mr-1" />
            <span className="hidden sm:inline">Compartilhar</span>
          </Button>
          <Link to="/catalogo/novo">
            <Button className="h-10 min-h-[44px]">
              <Plus className="h-4 w-4 sm:mr-1" />
              <span className="hidden sm:inline">Novo produto</span>
              <span className="sm:hidden">Novo</span>
            </Button>
          </Link>
          </div>
        </header>

        <div className="flex flex-wrap gap-2 sm:gap-3 items-center">
          <div className="relative flex-1 min-w-0 sm:min-w-[260px] max-w-md">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar por nome, SKU ou EAN…"
              className="pl-9 h-11 text-base"
            />
          </div>
          {/* Filtros desktop/tablet */}
          <Select value={cat} onValueChange={setCat}>
            <SelectTrigger className="w-[180px] h-10 hidden sm:flex"><SelectValue placeholder="Categoria" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas categorias</SelectItem>
              {categorias.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-[160px] h-10 hidden sm:flex"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos status</SelectItem>
              <SelectItem value="ativos">Apenas ativos</SelectItem>
              <SelectItem value="inativos">Apenas inativos</SelectItem>
            </SelectContent>
          </Select>
          {/* Botão de filtros mobile */}
          <Button
            variant="outline"
            className="h-11 sm:hidden"
            onClick={() => setFiltersOpen(true)}
          >
            <SlidersHorizontal className="h-4 w-4 mr-1" />
            Filtrar
            {(cat !== "todas" || status !== "todos") && (
              <Badge className="ml-1.5 h-4 min-w-4 px-1 bg-primary text-primary-foreground text-[10px]">
                {(cat !== "todas" ? 1 : 0) + (status !== "todos" ? 1 : 0)}
              </Badge>
            )}
          </Button>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {Array.from({ length: 6 }).map((_, i) => (
              <Card key={i} className="p-4 shadow-soft-sm">
                <Skeleton className="aspect-square w-full rounded-md" />
                <Skeleton className="h-4 w-3/4 mt-4" />
                <Skeleton className="h-3 w-1/3 mt-2" />
                <Skeleton className="h-6 w-1/2 mt-4" />
              </Card>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <Card className="p-16 text-center shadow-soft-sm">
            <div className="mx-auto h-14 w-14 rounded-2xl bg-primary-soft flex items-center justify-center text-primary">
              <Package className="h-7 w-7" />
            </div>
            <h3 className="font-display text-2xl font-bold mt-5">
              {items.length === 0 ? "Nenhum produto ainda" : "Nada encontrado"}
            </h3>
            <p className="text-muted-foreground mt-2 max-w-sm mx-auto">
              {items.length === 0
                ? "Comece cadastrando seu primeiro produto e construa o catálogo da sua loja."
                : "Tente outro termo de busca ou ajuste os filtros."}
            </p>
            {items.length === 0 && (
              <Link to="/catalogo/novo">
                <Button className="mt-6"><Plus className="h-4 w-4 mr-1" /> Cadastrar produto</Button>
              </Link>
            )}
          </Card>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4 lg:gap-5">
            {filtered.map((p) => {
              const qtd = p.estoque?.[0]?.quantidade ?? 0;
              const min = p.estoque?.[0]?.quantidade_minima ?? 0;
              const tone = stockTone(qtd, min);
              const foto = p.fotos?.[0];
              return (
                <Card key={p.id} className="p-0 overflow-hidden shadow-soft-sm hover:shadow-soft-md transition-shadow group">
                  <div className="relative aspect-square bg-muted overflow-hidden">
                    {foto ? (
                      <img src={foto} alt={p.nome} className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-500" />
                    ) : (
                      <div className="h-full w-full flex items-center justify-center text-muted-foreground">
                        <Package className="h-12 w-12 opacity-30" />
                      </div>
                    )}
                    <div className="absolute top-3 left-3 flex gap-1.5">
                      <Badge className={`${tone.cls} mono text-[10px] border-0`}>{tone.label}</Badge>
                      {!p.ativo && <Badge variant="outline" className="mono text-[10px] bg-background/90">inativo</Badge>}
                    </div>
                    <div className="absolute top-2 right-2">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="secondary" size="icon" className="h-8 w-8 bg-background/90 hover:bg-background shadow-soft-sm">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-44">
                          <DropdownMenuItem onClick={() => navigate(`/catalogo/${p.id}`)}>
                            <Pencil className="h-4 w-4 mr-2" /> Editar
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => navigate(`/catalogo/novo?duplicar=${p.id}`)}>
                            <Copy className="h-4 w-4 mr-2" /> Duplicar
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleToggle(p)}>
                            <Power className="h-4 w-4 mr-2" /> {p.ativo ? "Desativar" : "Ativar"}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => handleDelete(p.id)} className="text-destructive focus:text-destructive">
                            <Trash2 className="h-4 w-4 mr-2" /> Excluir
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setPreview(p)}
                    className="block w-full text-left p-5"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-display font-semibold leading-tight line-clamp-2">{p.nome}</h3>
                    </div>
                    <div className="mono text-[10px] uppercase tracking-widest text-muted-foreground mt-2">
                      {p.sku || "sem sku"}{p.categoria ? ` · ${p.categoria}` : ""}
                    </div>
                    <div className="num text-2xl font-bold text-primary mt-3">{brl(p.preco_venda)}</div>
                  </button>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      <ResponsiveModal
        open={filtersOpen}
        onOpenChange={setFiltersOpen}
        title="Filtros"
      >
        <div className="space-y-4 pb-2">
          <div>
            <label className="mono text-[10px] uppercase tracking-widest text-muted-foreground block mb-1.5">
              Categoria
            </label>
            <Select value={cat} onValueChange={setCat}>
              <SelectTrigger className="h-11 text-base"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas categorias</SelectItem>
                {categorias.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="mono text-[10px] uppercase tracking-widest text-muted-foreground block mb-1.5">
              Status
            </label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="h-11 text-base"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos status</SelectItem>
                <SelectItem value="ativos">Apenas ativos</SelectItem>
                <SelectItem value="inativos">Apenas inativos</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button className="w-full h-12" onClick={() => setFiltersOpen(false)}>
            Aplicar
          </Button>
        </div>
      </ResponsiveModal>

      <ResponsiveModal
        open={!!preview}
        onOpenChange={(o) => !o && setPreview(null)}
        title={preview?.nome}
        contentClassName="max-w-lg"
      >
        {preview && (() => {
          const qtd = preview.estoque?.[0]?.quantidade ?? 0;
          const min = preview.estoque?.[0]?.quantidade_minima ?? 0;
          const tone = stockTone(qtd, min);
          const foto = preview.fotos?.[0];
          return (
            <div className="space-y-4 pb-2">
              <div className="aspect-square bg-muted rounded-lg overflow-hidden flex items-center justify-center">
                {foto ? (
                  <img src={foto} alt={preview.nome} className="h-full w-full object-cover" />
                ) : (
                  <Package className="h-16 w-16 text-muted-foreground opacity-30" />
                )}
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <Badge className={`${tone.cls} mono text-[10px] border-0`}>{tone.label}</Badge>
                {!preview.ativo && (
                  <Badge variant="outline" className="mono text-[10px]">inativo</Badge>
                )}
                {preview.categoria && (
                  <Badge variant="outline" className="mono text-[10px]">{preview.categoria}</Badge>
                )}
              </div>
              <div className="num text-3xl font-bold text-primary">{brl(preview.preco_venda)}</div>
              <div className="mono text-[10px] uppercase tracking-widest text-muted-foreground space-y-1">
                {preview.sku && <div>SKU: {preview.sku}</div>}
                {preview.ean && <div>EAN: {preview.ean}</div>}
              </div>
              {preview.descricao && (
                <p className="text-sm text-muted-foreground whitespace-pre-line">
                  {preview.descricao}
                </p>
              )}
              <div className="grid grid-cols-2 gap-2 pt-2">
                <Button
                  variant="outline"
                  className="h-12"
                  onClick={() => {
                    const id = preview.id;
                    setPreview(null);
                    navigate(`/catalogo/${id}`);
                  }}
                >
                  <Pencil className="h-4 w-4 mr-1" /> Editar
                </Button>
                <Button
                  className="h-12"
                  disabled={!preview.ativo}
                  onClick={() => adicionarAoCarrinho(preview)}
                >
                  <ShoppingCart className="h-4 w-4 mr-1" /> Ao carrinho
                </Button>
              </div>
            </div>
          );
        })()}
      </ResponsiveModal>
    </AppLayout>
  );
};

export default Catalogo;
