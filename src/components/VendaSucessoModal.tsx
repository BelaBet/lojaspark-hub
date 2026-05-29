import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { brl } from "@/lib/format";
import { Check, Plus, Printer, Eye, User as UserIcon, QrCode } from "lucide-react";
import { Link } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import { cn } from "@/lib/utils";

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
  vendedor?: string | null;
  status?: "pago" | "pendente" | "falhou";
  canal?: "pos" | "online" | "manual";
};

export const VendaSucessoModal = ({
  venda,
  onNovaVenda,
}: {
  venda: VendaConcluida;
  onNovaVenda: () => void;
}) => {
  const reciboHref = `/vendas/${venda.venda_id}/recibo`;
  const reciboUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}${reciboHref}`
      : reciboHref;
  const imprimir = () => {
    window.open(`${reciboHref}?print=1`, "_blank", "noopener,noreferrer");
  };
  const status = venda.status ?? "pago";
  const statusLabel =
    status === "pago" ? "Pago" : status === "pendente" ? "Pendente" : "Falhou";
  const statusClass =
    status === "pago"
      ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30"
      : status === "pendente"
        ? "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30"
        : "bg-destructive/15 text-destructive border-destructive/30";

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onNovaVenda(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div
            className={cn(
              "mx-auto h-14 w-14 rounded-full flex items-center justify-center mb-2",
              status === "pago"
                ? "bg-primary text-primary-foreground"
                : status === "pendente"
                  ? "bg-amber-500 text-white"
                  : "bg-destructive text-destructive-foreground",
            )}
          >
            <Check className="h-7 w-7" strokeWidth={3} />
          </div>
          <DialogTitle className="text-center font-display text-2xl">
            {status === "pago" ? "Venda concluída!" : status === "pendente" ? "Aguardando pagamento" : "Pagamento falhou"}
          </DialogTitle>
          <div className="flex justify-center mt-1">
            <Badge variant="outline" className={cn("mono text-[10px] uppercase tracking-widest", statusClass)}>
              {statusLabel}
            </Badge>
          </div>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Cliente</span>
            <span className="font-medium">{venda.cliente}</span>
          </div>
          {venda.vendedor && (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground flex items-center gap-1">
                <UserIcon className="h-3 w-3" /> Vendedor
              </span>
              <span className="font-medium">{venda.vendedor}</span>
            </div>
          )}
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

          {/* QR Code do recibo digital */}
          {status === "pago" && (
            <div className="border-t border-border pt-3 flex items-center gap-3">
              <div className="rounded-md bg-white p-2 border border-border shrink-0">
                <QRCodeSVG value={reciboUrl} size={88} level="M" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="mono text-[10px] uppercase tracking-widest text-muted-foreground flex items-center gap-1">
                  <QrCode className="h-3 w-3" /> Recibo digital
                </div>
                <p className="text-xs text-muted-foreground mt-1 leading-snug">
                  Cliente escaneia para acessar o comprovante completo no celular.
                </p>
                <p className="mono text-[10px] text-muted-foreground/70 mt-1 truncate">
                  #{venda.venda_id.slice(0, 8).toUpperCase()}
                </p>
              </div>
            </div>
          )}
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