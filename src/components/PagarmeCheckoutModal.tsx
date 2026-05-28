import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, QrCode, Copy, Check, CreditCard } from "lucide-react";
import { toast } from "sonner";
import { brl } from "@/lib/format";

export type PagarmeMethod = "pix" | "credit_card";

export type PagarmeCustomer = {
  name?: string;
  email?: string;
  document?: string;
  area_code?: string;
  phone?: string;
};

type Props = {
  open: boolean;
  method: PagarmeMethod;
  amount: number; // em reais
  customer?: PagarmeCustomer;
  onClose: () => void;
  /** Chamado quando o pagamento for confirmado (PIX: manual; cartão: status paid/authorized) */
  onConfirmed: (result: { order_id: string; status: string }) => void;
};

type PixResult = {
  order_id: string;
  status: string;
  pix_qr_code: string | null;
  pix_qr_code_url: string | null;
  pix_expires_at: string | null;
};

export function PagarmeCheckoutModal({ open, method, amount, customer, onClose, onConfirmed }: Props) {
  const [loading, setLoading] = useState(false);
  const [pix, setPix] = useState<PixResult | null>(null);
  const [copied, setCopied] = useState(false);

  // Cartão de crédito form
  const [cardNumber, setCardNumber] = useState("");
  const [holder, setHolder] = useState("");
  const [expMonth, setExpMonth] = useState("");
  const [expYear, setExpYear] = useState("");
  const [cvv, setCvv] = useState("");
  const [installments, setInstallments] = useState("1");

  // Reset ao abrir
  useEffect(() => {
    if (!open) {
      setPix(null);
      setCopied(false);
      setCardNumber("");
      setHolder("");
      setExpMonth("");
      setExpYear("");
      setCvv("");
      setInstallments("1");
      return;
    }
    // Para PIX, criamos o pedido imediatamente
    if (method === "pix") void gerarPix();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, method]);

  const amountCents = Math.round(amount * 100);

  const gerarPix = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("create-order", {
        body: {
          payment_method: "pix",
          amount: amountCents,
          customer,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setPix(data as PixResult);
    } catch (e: any) {
      toast.error(`Erro ao gerar PIX: ${e.message ?? e}`);
      onClose();
    } finally {
      setLoading(false);
    }
  };

  const cobrarCartao = async () => {
    const num = cardNumber.replace(/\s/g, "");
    if (num.length < 13 || !holder.trim() || !expMonth || !expYear || !cvv) {
      toast.error("Preencha todos os campos do cartão");
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("create-order", {
        body: {
          payment_method: "credit_card",
          amount: amountCents,
          customer,
          card: {
            number: num,
            holder_name: holder.trim(),
            exp_month: Number(expMonth),
            exp_year: Number(expYear.length === 2 ? `20${expYear}` : expYear),
            cvv,
            installments: Number(installments),
          },
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const status = data?.charge_status ?? data?.status;
      if (status === "paid" || status === "authorized" || data?.status === "paid") {
        toast.success("Pagamento aprovado");
        onConfirmed({ order_id: data.order_id, status });
      } else {
        toast.error(`Pagamento não aprovado (${status ?? "desconhecido"})`);
      }
    } catch (e: any) {
      toast.error(`Erro no cartão: ${e.message ?? e}`);
    } finally {
      setLoading(false);
    }
  };

  const copiarPix = async () => {
    if (!pix?.pix_qr_code) return;
    await navigator.clipboard.writeText(pix.pix_qr_code);
    setCopied(true);
    toast.success("Código PIX copiado");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {method === "pix" ? <QrCode className="h-5 w-5" /> : <CreditCard className="h-5 w-5" />}
            {method === "pix" ? "Pagamento via PIX" : "Pagamento no cartão"}
          </DialogTitle>
          <DialogDescription>
            Total: <span className="num font-bold text-foreground">{brl(amount)}</span>
          </DialogDescription>
        </DialogHeader>

        {method === "pix" && (
          <div className="space-y-4">
            {loading && !pix && (
              <div className="flex items-center justify-center py-10 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin mr-2" /> Gerando QR Code…
              </div>
            )}
            {pix && (
              <>
                {pix.pix_qr_code_url && (
                  <div className="flex justify-center bg-white p-4 rounded-lg border">
                    <img src={pix.pix_qr_code_url} alt="QR Code PIX" className="h-56 w-56" />
                  </div>
                )}
                <div>
                  <Label className="mono text-[10px] uppercase tracking-widest text-muted-foreground">
                    Copia e cola
                  </Label>
                  <div className="flex gap-2 mt-1.5">
                    <Input value={pix.pix_qr_code ?? ""} readOnly className="mono text-xs" />
                    <Button type="button" variant="outline" size="icon" onClick={copiarPix}>
                      {copied ? <Check className="h-4 w-4 text-primary" /> : <Copy className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
                <div className="flex flex-col gap-2 pt-2">
                  <Button
                    type="button"
                    onClick={() => onConfirmed({ order_id: pix.order_id, status: "pending" })}
                    className="w-full h-11"
                  >
                    Já recebi o PIX — finalizar venda
                  </Button>
                  <Button type="button" variant="ghost" onClick={onClose} className="w-full">
                    Cancelar
                  </Button>
                </div>
              </>
            )}
          </div>
        )}

        {method === "credit_card" && (
          <div className="space-y-3">
            <div>
              <Label>Número do cartão</Label>
              <Input
                value={cardNumber}
                onChange={(e) => setCardNumber(e.target.value)}
                placeholder="0000 0000 0000 0000"
                inputMode="numeric"
                maxLength={19}
                className="mono"
              />
            </div>
            <div>
              <Label>Nome impresso</Label>
              <Input
                value={holder}
                onChange={(e) => setHolder(e.target.value.toUpperCase())}
                placeholder="NOME COMPLETO"
              />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <Label>Mês</Label>
                <Input
                  value={expMonth}
                  onChange={(e) => setExpMonth(e.target.value)}
                  placeholder="MM"
                  maxLength={2}
                  inputMode="numeric"
                  className="mono"
                />
              </div>
              <div>
                <Label>Ano</Label>
                <Input
                  value={expYear}
                  onChange={(e) => setExpYear(e.target.value)}
                  placeholder="AA"
                  maxLength={4}
                  inputMode="numeric"
                  className="mono"
                />
              </div>
              <div>
                <Label>CVV</Label>
                <Input
                  value={cvv}
                  onChange={(e) => setCvv(e.target.value)}
                  placeholder="123"
                  maxLength={4}
                  inputMode="numeric"
                  className="mono"
                />
              </div>
            </div>
            <div>
              <Label>Parcelas</Label>
              <Input
                value={installments}
                onChange={(e) => setInstallments(e.target.value)}
                type="number"
                min="1"
                max="12"
                className="mono"
              />
            </div>
            <div className="flex flex-col gap-2 pt-2">
              <Button type="button" onClick={cobrarCartao} disabled={loading} className="w-full h-11">
                {loading ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Processando…</>
                ) : (
                  <>Cobrar {brl(amount)}</>
                )}
              </Button>
              <Button type="button" variant="ghost" onClick={onClose} disabled={loading} className="w-full">
                Cancelar
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}