import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { brl } from "@/lib/format";
import { Check, Plus, Printer, Eye } from "lucide-react";
import { Link } from "react-router-dom";

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

export const VendaSucessoModal = ({
  venda,
  onNovaVenda,
}: {
  venda: VendaConcluida;
  onNovaVenda: () => void;
}) => {
  const reciboHref = `/vendas/${venda.venda_id}/recibo`;
  const imprimir = () => {
    window.open(`${reciboHref}?print=1`, "_blank", "noopener,noreferrer");
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

        <div className="grid grid-cols-2 gap-2 pt-2">
          <Button variant="outline" onClick={imprimir} className="h-11">
            <Printer className="h-4 w-4 mr-1.5" /> Imprimir
          </Button>
          <Link to={reciboHref} target="_blank" rel="noopener noreferrer">
            <Button variant="outline" className="h-11 w-full">
              <Eye className="h-4 w-4 mr-1.5" /> Ver recibo
            </Button>
          </Link>
          <Button onClick={onNovaVenda} className="h-11 col-span-2">
            <Plus className="h-4 w-4 mr-1.5" /> Nova venda
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};