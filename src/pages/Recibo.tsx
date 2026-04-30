import { traduzErro } from "@/lib/errors";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { brl } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Printer, Store } from "lucide-react";
import { toast } from "sonner";

type Loja = {
  nome: string;
  cnpj: string | null;
  telefone: string | null;
  email: string | null;
  logo_url: string | null;
};

type Venda = {
  id: string;
  created_at: string;
  total: number;
  desconto: number;
  forma_pagamento: string | null;
  status: string;
  observacoes: string | null;
  cliente: { nome: string; telefone: string | null; cpf_cnpj: string | null } | null;
  venda_itens: {
    id: string;
    quantidade: number;
    preco_unit: number;
    desconto: number;
    subtotal: number | null;
    produto: { nome: string; sku: string | null } | null;
  }[];
};

const PAGAMENTO_LABEL: Record<string, string> = {
  dinheiro: "Dinheiro",
  pix: "PIX",
  cartao_debito: "Cartão Débito",
  cartao_credito: "Cartão Crédito",
  misto: "Misto",
};

const Recibo = () => {
  const { id } = useParams();
  const [loja, setLoja] = useState<Loja | null>(null);
  const [venda, setVenda] = useState<Venda | null>(null);
  const [loading, setLoading] = useState(true);
  const autoPrint = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("print") === "1";

  useEffect(() => {
    if (!id) return;
    (async () => {
      const [{ data: lojaData }, { data: vendaData, error }] = await Promise.all([
        supabase.from("lojas").select("nome,cnpj,telefone,email,logo_url").maybeSingle(),
        supabase
          .from("vendas")
          .select(`
            id,created_at,total,desconto,forma_pagamento,status,observacoes,
            cliente:clientes(nome,telefone,cpf_cnpj),
            venda_itens(id,quantidade,preco_unit,desconto,subtotal, produto:produtos(nome,sku))
          `)
          .eq("id", id)
          .maybeSingle(),
      ]);
      if (error) toast.error(traduzErro(error));
      if (lojaData) setLoja(lojaData as Loja);
      if (vendaData) setVenda(vendaData as unknown as Venda);
      setLoading(false);
    })();
  }, [id]);

  useEffect(() => {
    if (!autoPrint || loading || !venda) return;
    const t = setTimeout(() => window.print(), 350);
    return () => clearTimeout(t);
  }, [autoPrint, loading, venda]);

  const subtotal = venda?.venda_itens.reduce(
    (a, i) => a + Number(i.subtotal ?? i.quantidade * i.preco_unit),
    0,
  ) ?? 0;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30">
        <div className="mono text-sm text-muted-foreground">carregando recibo…</div>
      </div>
    );
  }

  if (!venda) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30">
        <div className="text-center">
          <p className="font-display text-xl font-bold">Venda não encontrada</p>
          <Link to="/vendas/historico">
            <Button variant="outline" className="mt-4">Voltar ao histórico</Button>
          </Link>
        </div>
      </div>
    );
  }

  const dt = new Date(venda.created_at);

  return (
    <div className="min-h-screen bg-muted/40 print:bg-white">
      {/* Toolbar — escondida na impressão */}
      <div className="sticky top-0 z-10 bg-background/90 backdrop-blur border-b border-border print:hidden">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link
            to="/vendas/historico"
            className="mono text-xs text-muted-foreground hover:text-primary inline-flex items-center gap-1"
          >
            <ArrowLeft className="h-3 w-3" /> histórico
          </Link>
          <div className="flex items-center gap-2">
            <Link to="/vendas">
              <Button variant="outline" size="sm" className="h-9">Nova venda</Button>
            </Link>
            <Button onClick={() => window.print()} size="sm" className="h-9">
              <Printer className="h-3.5 w-3.5 mr-1.5" /> Imprimir / PDF
            </Button>
          </div>
        </div>
      </div>

      {/* Cupom térmico — 80mm */}
      <div className="py-8 print:py-0 flex justify-center">
        <div className="recibo bg-white shadow-soft-md print:shadow-none px-6 py-7 print:px-3 print:py-3">
          {/* Cabeçalho */}
          <header className="text-center pb-3 border-b border-dashed border-foreground/30">
            {loja?.logo_url ? (
              <img
                src={loja.logo_url}
                alt={loja.nome}
                className="h-14 w-14 object-contain mx-auto mb-2 rounded"
              />
            ) : (
              <div className="h-12 w-12 rounded-lg bg-foreground/5 mx-auto mb-2 flex items-center justify-center">
                <Store className="h-6 w-6 text-foreground/60" />
              </div>
            )}
            <h1 className="font-display text-base font-bold tracking-tight">
              {loja?.nome ?? "Minha Loja"}
            </h1>
            {loja?.cnpj && (
              <p className="mono text-[10px] text-foreground/70 mt-0.5">CNPJ {loja.cnpj}</p>
            )}
            {loja?.telefone && (
              <p className="mono text-[10px] text-foreground/70">{loja.telefone}</p>
            )}
            {loja?.email && (
              <p className="mono text-[10px] text-foreground/70">{loja.email}</p>
            )}
          </header>

          {/* Identificação */}
          <section className="py-3 space-y-0.5 text-[11px] mono">
            <div className="text-center font-bold uppercase tracking-widest text-[10px]">
              Cupom não fiscal
            </div>
            <div className="flex justify-between mt-2">
              <span className="text-foreground/60">Cupom</span>
              <span className="font-bold">#{venda.id.slice(0, 8).toUpperCase()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-foreground/60">Emitido</span>
              <span>{dt.toLocaleString("pt-BR")}</span>
            </div>
          </section>

          {/* Cliente */}
          {venda.cliente && (
            <section className="border-t border-dashed border-foreground/30 pt-3 pb-3 text-[11px] mono space-y-0.5">
              <div className="font-bold uppercase tracking-widest text-[10px] text-foreground/60 mb-1">
                Cliente
              </div>
              <div className="font-medium">{venda.cliente.nome}</div>
              {venda.cliente.cpf_cnpj && (
                <div className="text-foreground/70">CPF/CNPJ: {venda.cliente.cpf_cnpj}</div>
              )}
              {venda.cliente.telefone && (
                <div className="text-foreground/70">{venda.cliente.telefone}</div>
              )}
            </section>
          )}

          {/* Itens */}
          <section className="border-t border-dashed border-foreground/30 pt-3">
            <div className="font-bold uppercase tracking-widest text-[10px] text-foreground/60 mono mb-2">
              Itens ({venda.venda_itens.length})
            </div>
            <table className="w-full text-[11px] mono">
              <tbody>
                {venda.venda_itens.map((it) => {
                  const sub = Number(it.subtotal ?? it.quantidade * it.preco_unit);
                  return (
                    <tr key={it.id} className="align-top">
                      <td className="py-1.5 pr-2">
                        <div className="font-medium leading-tight">
                          {it.produto?.nome ?? "Produto removido"}
                        </div>
                        <div className="text-[10px] text-foreground/60">
                          {it.produto?.sku && <span>{it.produto.sku} · </span>}
                          {Number(it.quantidade)} × {brl(it.preco_unit)}
                          {it.desconto > 0 && <span> − {brl(it.desconto)}</span>}
                        </div>
                      </td>
                      <td className="py-1.5 text-right whitespace-nowrap font-medium">
                        {brl(sub)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>

          {/* Totais */}
          <section className="border-t border-dashed border-foreground/30 pt-3 mono text-[11px] space-y-0.5">
            <div className="flex justify-between">
              <span className="text-foreground/70">Subtotal</span>
              <span>{brl(subtotal)}</span>
            </div>
            {venda.desconto > 0 && (
              <div className="flex justify-between">
                <span className="text-foreground/70">Desconto</span>
                <span>− {brl(venda.desconto)}</span>
              </div>
            )}
            <div className="flex justify-between items-baseline pt-1.5 mt-1 border-t border-foreground/40">
              <span className="font-bold uppercase tracking-widest text-[10px]">Total</span>
              <span className="font-display text-lg font-bold">{brl(venda.total)}</span>
            </div>
          </section>

          {/* Pagamento */}
          <section className="border-t border-dashed border-foreground/30 pt-3 mono text-[11px]">
            <div className="flex justify-between">
              <span className="text-foreground/70">Pagamento</span>
              <span className="font-medium">
                {venda.forma_pagamento
                  ? PAGAMENTO_LABEL[venda.forma_pagamento] ?? venda.forma_pagamento
                  : "—"}
              </span>
            </div>
          </section>

          {venda.observacoes && (
            <section className="border-t border-dashed border-foreground/30 pt-3 mono text-[10px] text-foreground/70">
              <div className="font-bold uppercase tracking-widest text-foreground/60 mb-0.5">
                Obs
              </div>
              {venda.observacoes}
            </section>
          )}

          {/* Rodapé */}
          <footer className="border-t border-dashed border-foreground/30 pt-3 mt-3 text-center mono text-[10px] text-foreground/60 space-y-0.5">
            <p>Obrigado pela preferência!</p>
            <p className="text-foreground/40">documento sem valor fiscal</p>
          </footer>
        </div>
      </div>

      <style>{`
        .recibo {
          width: 80mm;
          max-width: 100%;
          color: hsl(var(--foreground));
          font-family: 'IBM Plex Mono', ui-monospace, monospace;
        }
        @media print {
          @page { size: 80mm auto; margin: 4mm; }
          html, body { background: #fff !important; }
          body * { visibility: hidden; }
          .recibo, .recibo * { visibility: visible; }
          .recibo {
            position: absolute;
            left: 0; top: 0;
            width: 80mm;
            box-shadow: none;
            padding: 0;
          }
        }
      `}</style>
    </div>
  );
};

export default Recibo;