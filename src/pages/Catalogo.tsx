import { useEffect, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { brl } from "@/lib/format";
import { Link, useNavigate } from "react-router-dom";
import { Plus, Search, Package, MoreHorizontal, Pencil, Copy, Power, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type Product = {
  id: string;
  name: string;
  sku: string | null;
  category: string | null;
  price: number;
  stock: number;
  is_active: boolean;
  image_url: string | null;
};

const Catalogo = () => {
  const navigate = useNavigate();
  const [items, setItems] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("products")
      .select("id,name,sku,category,price,stock,is_active,image_url")
      .order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    setItems((data as Product[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleDelete = async (id: string) => {
    if (!confirm("Excluir este produto?")) return;
    const { error } = await supabase.from("products").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Produto excluído");
    setItems((it) => it.filter((p) => p.id !== id));
  };

  const handleToggleActive = async (p: Product) => {
    const next = !p.is_active;
    const { error } = await supabase.from("products").update({ is_active: next }).eq("id", p.id);
    if (error) return toast.error(error.message);
    setItems((it) => it.map((x) => (x.id === p.id ? { ...x, is_active: next } : x)));
    toast.success(next ? "Produto ativado" : "Produto desativado");
  };

  const handleDuplicate = (p: Product) => {
    navigate(`/catalogo/novo?duplicar=${p.id}`);
  };

  const filtered = items.filter((p) => {
    const s = q.toLowerCase();
    return !s || p.name.toLowerCase().includes(s) || p.sku?.toLowerCase().includes(s);
  });

  return (
    <AppLayout>
      <div className="max-w-7xl mx-auto space-y-6">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <span className="mono text-[10px] uppercase tracking-widest text-muted-foreground">Produtos</span>
            <h1 className="font-display text-4xl font-bold tracking-tight mt-1">Catálogo</h1>
            <p className="text-muted-foreground text-sm mt-1">{items.length} {items.length === 1 ? "produto" : "produtos"} cadastrados</p>
          </div>
          <Link to="/catalogo/novo">
            <Button className="h-10"><Plus className="h-4 w-4 mr-1" /> Novo produto</Button>
          </Link>
        </header>

        <div className="relative max-w-md">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nome ou SKU…" className="pl-9 h-10" />
        </div>

        {loading ? (
          <Card className="p-12 text-center mono text-sm text-muted-foreground">carregando…</Card>
        ) : filtered.length === 0 ? (
          <Card className="p-16 text-center shadow-soft-sm">
            <div className="mx-auto h-14 w-14 rounded-2xl bg-primary-soft flex items-center justify-center text-primary">
              <Package className="h-7 w-7" />
            </div>
            <h3 className="font-display text-2xl font-bold mt-5">Nenhum produto ainda</h3>
            <p className="text-muted-foreground mt-2 max-w-sm mx-auto">Comece cadastrando seu primeiro produto e construa o catálogo da sua loja.</p>
            <Link to="/catalogo/novo">
              <Button className="mt-6"><Plus className="h-4 w-4 mr-1" /> Cadastrar produto</Button>
            </Link>
          </Card>
        ) : (
          <Card className="overflow-hidden shadow-soft-sm">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-surface">
                    <th className="text-left mono text-[10px] uppercase tracking-widest text-muted-foreground px-5 py-3 font-medium">Produto</th>
                    <th className="text-left mono text-[10px] uppercase tracking-widest text-muted-foreground px-5 py-3 font-medium">SKU</th>
                    <th className="text-left mono text-[10px] uppercase tracking-widest text-muted-foreground px-5 py-3 font-medium">Categoria</th>
                    <th className="text-right mono text-[10px] uppercase tracking-widest text-muted-foreground px-5 py-3 font-medium">Preço</th>
                    <th className="text-right mono text-[10px] uppercase tracking-widest text-muted-foreground px-5 py-3 font-medium">Estoque</th>
                    <th className="text-center mono text-[10px] uppercase tracking-widest text-muted-foreground px-5 py-3 font-medium">Status</th>
                    <th className="px-5 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((p) => (
                    <tr key={p.id} className="border-b border-border last:border-0 hover:bg-surface/60 transition-colors">
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center overflow-hidden shrink-0">
                            {p.image_url ? (
                              <img src={p.image_url} alt={p.name} className="h-full w-full object-cover" />
                            ) : (
                              <Package className="h-4 w-4 text-muted-foreground" />
                            )}
                          </div>
                          <span className="font-medium">{p.name}</span>
                        </div>
                      </td>
                      <td className="px-5 py-4 mono text-xs text-muted-foreground">{p.sku || "—"}</td>
                      <td className="px-5 py-4 text-sm text-muted-foreground">{p.category || "—"}</td>
                      <td className="px-5 py-4 text-right num font-semibold tabular-nums">{brl(p.price)}</td>
                      <td className="px-5 py-4 text-right">
                        <span className={`mono text-sm font-semibold ${p.stock === 0 ? "text-destructive" : p.stock <= 5 ? "text-warning" : "text-foreground"}`}>
                          {p.stock}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-center">
                        <Badge variant={p.is_active ? "default" : "outline"} className={p.is_active ? "bg-primary-soft text-primary hover:bg-primary-soft border-0" : ""}>
                          {p.is_active ? "ativo" : "inativo"}
                        </Badge>
                      </td>
                      <td className="px-5 py-4 text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-48">
                            <DropdownMenuItem onClick={() => navigate(`/catalogo/${p.id}/editar`)}>
                              <Pencil className="h-4 w-4 mr-2" /> Editar
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleDuplicate(p)}>
                              <Copy className="h-4 w-4 mr-2" /> Duplicar
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleToggleActive(p)}>
                              <Power className="h-4 w-4 mr-2" /> {p.is_active ? "Desativar" : "Ativar"}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => handleDelete(p.id)} className="text-destructive focus:text-destructive">
                              <Trash2 className="h-4 w-4 mr-2" /> Excluir
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>
    </AppLayout>
  );
};

export default Catalogo;