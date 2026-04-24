import { useEffect, useRef, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { brl } from "@/lib/format";
import { Check, Plus, Printer } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export type VendaConcluida = {
  venda_id: string;
  created_at: string;
  cliente: string;
  itens: { nome: string; quantidade: number; preco_unit: number; subtotal: number }[];
  subtotal: number;
  desconto: number;
  total: number;
  pagamento: string;
  recebido: number | null;
  troco: number | null;
};

type Loja = { nome: string; cnpj: string | null; telefone: string | null };

export const VendaSucessoModal = ({
  venda,
  onNovaVenda,
}: {
  venda: VendaConcluida;
  onNovaVenda: () => void;
}) => {
  const [loja, setLoja] = useState<Loja | null>(null);
  const reciboRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("lojas").select("nome,cnpj,telefone").maybeSingle();
      if (data) setLoja(data as Loja);
    })();
  }, []);

  const imprimir = () => {
    const html = reciboRef.current?.innerHTML;
    if (!html) return;
    const w = window.open("", "_blank", "width=400,height=600");
    if (!w) return;
    w.document.write(`
      <!doctype html><html><head><meta charset="utf-8"><title>Recibo · ${venda.venda_id.slice(0, 8)}</title>
      <style>
        @page { margin: 8mm; }
        body { font-family: 'Courier New', monospace; font-size: 12px; color: #111; padding: 8px; max-width: 320px; margin: 0 auto; }
        h1, h2, h3 { margin: 0; }
        .center { text-align: center; }
        .right { text-align: right; }
        .row { display: flex; justify-content: space-between; gap: 8px; }
        .sep { border-top: 1px dashed #999; margin: 8px 0; }
        table { width: 100%; border-collapse: collapse; }
        td { padding: 2px 0; vertical-align: top; }
        .total { font-size: 16px; font-weight: bold; }
        .small { font-size: 10px; color: #555; }
      </style></head><body>${html}</body></html>
    `);
    w.document.close();
    w.focus();
    setTimeout(() => {
      w.print();
      w.close();
    }, 200);
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onNovaVenda(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="mx-auto h-14 w-14 rounded-full bg-primary text-primary-foreground flex items-center justify-center mb-2">
            <Check className="h-7 w-7" strokeWidth={3} />
          </div>
          <DialogTitle className="text-center font-display text-2xl">Venda concluída!</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Cliente</span>
            <span className="font-medium">{venda.cliente}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Pagamento</span>
            <span className="font-medium">{venda.pagamento}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Itens</span>
            <span className="num font-medium">{venda.itens.reduce((a, i) => a + i.quantidade, 0)}</span>
          </div>

          <div className="border-t border-border pt-3 space-y-1">
            {venda.desconto > 0 && (
              <div className="flex justify-between text-sm text-destructive">
                <span>Desconto</span>
                <span className="num">- {brl(venda.desconto)}</span>
              </div>
            )}
            <div className="flex justify-between items-baseline">
              <span className="mono text-[10px] uppercase tracking-widest text-muted-foreground">Total</span>
              <span className="num text-2xl font-bold text-primary">{brl(venda.total)}</span>
            </div>
            {venda.recebido !== null && (
              <>
                <div className="flex justify-between text-sm pt-2">
                  <span className="text-muted-foreground">Recebido</span>
                  <span className="num font-medium">{brl(venda.recebido)}</span>
                </div>
                <div className="flex justify-between items-baseline rounded-lg bg-primary-soft px-3 py-2 mt-1">
                  <span className="mono text-[10px] uppercase tracking-widest text-primary">Troco</span>
                  <span className="num text-xl font-bold text-primary">{brl(venda.troco ?? 0)}</span>
                </div>
              </>
            )}
          </div>
        </div>

        <div className="flex gap-2 pt-2">
          <Button variant="outline" onClick={imprimir} className="flex-1 h-11">
            <Printer className="h-4 w-4 mr-1.5" /> Imprimir recibo
          </Button>
          <Button onClick={onNovaVenda} className="flex-1 h-11">
            <Plus className="h-4 w-4 mr-1.5" /> Nova venda
          </Button>
        </div>

        {/* Conteúdo invisível usado para impressão */}
        <div className="hidden">
          <div ref={reciboRef}>
            <div className="center">
              <h2>{loja?.nome ?? "Loja"}</h2>
              {loja?.cnpj && <div className="small">CNPJ: {loja.cnpj}</div>}
              {loja?.telefone && <div className="small">{loja.telefone}</div>}
            </div>
            <div className="sep" />
            <div className="small">Cupom: {venda.venda_id.slice(0, 8).toUpperCase()}</div>
            <div className="small">Data: {new Date(venda.created_at).toLocaleString("pt-BR")}</div>
            <div className="small">Cliente: {venda.cliente}</div>
            <div className="sep" />
            <table>
              <tbody>
                {venda.itens.map((i, idx) => (
                  <tr key={idx}>
                    <td>
                      {i.nome}
                      <div className="small">{i.quantidade} × {brl(i.preco_unit)}</div>
                    </td>
                    <td className="right">{brl(i.subtotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="sep" />
            <div className="row"><span>Subtotal</span><span>{brl(venda.subtotal)}</span></div>
            {venda.desconto > 0 && (
              <div className="row"><span>Desconto</span><span>- {brl(venda.desconto)}</span></div>
            )}
            <div className="row total"><span>TOTAL</span><span>{brl(venda.total)}</span></div>
            <div className="sep" />
            <div className="row"><span>Pagamento</span><span>{venda.pagamento}</span></div>
            {venda.recebido !== null && (
              <>
                <div className="row"><span>Recebido</span><span>{brl(venda.recebido)}</span></div>
                <div className="row"><span>Troco</span><span>{brl(venda.troco ?? 0)}</span></div>
              </>
            )}
            <div className="sep" />
            <div className="center small">Obrigado pela preferência!</div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};