import { useEffect, useMemo, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { brl } from "@/lib/format";
import { Search, Users, Phone, MessageCircle } from "lucide-react";

type ClienteRow = {
  id: string;
  nome: string;
  telefone: string | null;
  ultima_compra: string | null;
  total_gasto: number;
  num_compras: number;
};

const fmtData = (iso: string | null) => {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "2-digit",
  });
};

const statusCliente = (ultima: string | null) => {
  if (!ultima) return { label: "Sem compras", cls: "bg-muted text-muted-foreground" };
  const dias = (Date.now() - new Date(ultima).getTime()) / (1000 * 60 * 60 * 24);
  if (dias <= 30) return { label: "Ativo", cls: "bg-primary/10 text-primary" };
  if (dias <= 90) return { label: "Recente", cls: "bg-amber-500/10 text-amber-700 dark:text-amber-400" };
  return { label: "Inativo", cls: "bg-muted text-muted-foreground" };
};

const onlyDigits = (s: string | null) => (s ?? "").replace(/\D/g, "");

const Clientes = () => {
  const [linhas, setLinhas] = useState<ClienteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState("");

  useEffect(() => {
    void load();
  }, []);

  const load = async () => {
    setLoading(true);
    const [{ data: clientes }, { data: vendas }] = await Promise.all([
      supabase.from("clientes").select("id, nome, telefone").order("nome"),
      supabase
        .from("vendas")
        .select("cliente_id, total, created_at")
        .eq("status", "concluida")
        .not("cliente_id", "is", null),
    ]);

    const agg = new Map<string, { ultima: string | null; total: number; num: number }>();
    for (const v of (vendas as { cliente_id: string; total: number; created_at: string }[] | null) ?? []) {
      const cur = agg.get(v.cliente_id) ?? { ultima: null, total: 0, num: 0 };
      cur.total += Number(v.total ?? 0);
      cur.num += 1;
      if (!cur.ultima || v.created_at > cur.ultima) cur.ultima = v.created_at;
      agg.set(v.cliente_id, cur);
    }

    setLinhas(
      ((clientes as { id: string; nome: string; telefone: string | null }[] | null) ?? []).map((c) => {
        const a = agg.get(c.id);
        return {
          id: c.id,
          nome: c.nome,
          telefone: c.telefone,
          ultima_compra: a?.ultima ?? null,
          total_gasto: a?.total ?? 0,
          num_compras: a?.num ?? 0,
        };
      }),
    );
    setLoading(false);
  };

  const filtered = useMemo(() => {
    const s = busca.trim().toLowerCase();
    if (!s) return linhas;
    return linhas.filter(
      (c) => c.nome.toLowerCase().includes(s) || (c.telefone ?? "").toLowerCase().includes(s),
    );
  }, [busca, linhas]);

  const whatsappLink = (tel: string | null, nome: string) => {
    const digits = onlyDigits(tel);
    if (!digits) return null;
    const full = digits.length <= 11 ? `55${digits}` : digits;
    return `https://wa.me/${full}?text=${encodeURIComponent(`Olá ${nome.split(" ")[0]}, tudo bem?`)}`;
  };

  return (
    <AppLayout>
      <div className="max-w-6xl mx-auto space-y-5">
        <header>
          <span className="mono text-[10px] uppercase tracking-widest text-muted-foreground">CRM</span>
          <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight mt-1">Clientes</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {linhas.length} {linhas.length === 1 ? "cliente cadastrado" : "clientes cadastrados"}
          </p>
        </header>

        <div className="relative max-w-md">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome ou telefone…"
            className="pl-9 h-11 text-base"
          />
        </div>

        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-20 w-full rounded-xl" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <Card className="p-12 text-center">
            <div className="mx-auto h-14 w-14 rounded-2xl bg-primary-soft flex items-center justify-center text-primary">
              <Users className="h-7 w-7" />
            </div>
            <h3 className="font-display text-2xl font-bold mt-5">
              {linhas.length === 0 ? "Nenhum cliente cadastrado" : "Nada encontrado"}
            </h3>
            <p className="text-muted-foreground mt-2 max-w-sm mx-auto">
              {linhas.length === 0
                ? "Os clientes cadastrados em vendas aparecerão aqui."
                : "Tente outro termo de busca."}
            </p>
          </Card>
        ) : (
          <>
            {/* Mobile/Tablet: cards */}
            <div className="space-y-3 lg:hidden">
              {filtered.map((c) => {
                const st = statusCliente(c.ultima_compra);
                const wa = whatsappLink(c.telefone, c.nome);
                return (
                  <Card key={c.id} className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <h3 className="font-semibold truncate">{c.nome}</h3>
                        {c.telefone && (
                          <a
                            href={`tel:${onlyDigits(c.telefone)}`}
                            className="mono text-xs text-muted-foreground flex items-center gap-1 mt-1"
                          >
                            <Phone className="h-3 w-3" /> {c.telefone}
                          </a>
                        )}
                        <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                          <span>Última: {fmtData(c.ultima_compra)}</span>
                          {c.num_compras > 0 && (
                            <>
                              <span aria-hidden>·</span>
                              <span className="num font-semibold text-foreground">{brl(c.total_gasto)}</span>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-2 shrink-0">
                        <Badge className={`text-[10px] border-0 ${st.cls}`}>{st.label}</Badge>
                        {wa && (
                          <a
                            href={wa}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="h-9 w-9 rounded-full bg-[#25D366] text-white flex items-center justify-center shadow-sm hover:bg-[#1ebd5a] transition-colors"
                            aria-label={`Abrir WhatsApp de ${c.nome}`}
                          >
                            <MessageCircle className="h-4 w-4" />
                          </a>
                        )}
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>

            {/* Desktop: tabela */}
            <Card className="hidden lg:block overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Telefone</TableHead>
                    <TableHead>Última compra</TableHead>
                    <TableHead className="text-right">Compras</TableHead>
                    <TableHead className="text-right">Total gasto</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-[80px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((c) => {
                    const st = statusCliente(c.ultima_compra);
                    const wa = whatsappLink(c.telefone, c.nome);
                    return (
                      <TableRow key={c.id}>
                        <TableCell className="font-medium">{c.nome}</TableCell>
                        <TableCell className="mono text-xs text-muted-foreground">
                          {c.telefone ?? "—"}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {fmtData(c.ultima_compra)}
                        </TableCell>
                        <TableCell className="num text-right">{c.num_compras}</TableCell>
                        <TableCell className="num text-right font-semibold">{brl(c.total_gasto)}</TableCell>
                        <TableCell>
                          <Badge className={`text-[10px] border-0 ${st.cls}`}>{st.label}</Badge>
                        </TableCell>
                        <TableCell>
                          {wa && (
                            <Button
                              asChild
                              variant="outline"
                              size="sm"
                              className="h-8 px-2 text-[#25D366] border-[#25D366]/30 hover:bg-[#25D366]/10"
                            >
                              <a href={wa} target="_blank" rel="noopener noreferrer" aria-label={`WhatsApp de ${c.nome}`}>
                                <MessageCircle className="h-3.5 w-3.5" />
                              </a>
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </Card>
          </>
        )}
      </div>
    </AppLayout>
  );
};

export default Clientes;