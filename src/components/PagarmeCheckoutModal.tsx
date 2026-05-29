import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import {
  calculateSplit,
  getInstallmentTable,
  INSTALLMENT_RATE,
  STONE_MDR_RATE,
  BASE_FEE_RATE,
} from "@/lib/pagarme-split";

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
  /** ID do recebedor da loja no Pagar.me (re_xxxxx). Quando ausente, não aplica split. */
  sellerRecipientId?: string | null;
  onClose: () => void;
  /** Chamado quando o pagamento for confirmado (PIX: manual; cartão: status paid/authorized) */
  onConfirmed: (result: {
    order_id: string;
    status: string;
    amount_charged?: number; // em reais, total efetivamente cobrado (com acréscimo)
    installments?: number;
    base_amount?: number;
    platform_amount?: number;
    seller_amount?: number;
    total_amount?: number;
  }) => void;
};

type PixResult = {
  order_id: string;
  status: string;
  pix_qr_code: string | null;
  pix_qr_code_url: string | null;
  pix_expires_at: string | null;
  base_amount?: number;
  platform_amount?: number;
  seller_amount?: number;
  amount?: number;
};

export function PagarmeCheckoutModal({
  open,
  method,
  amount,
  customer,
  sellerRecipientId,
  onClose,
  onConfirmed,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [pix, setPix] = useState<PixResult | null>(null);
  const [copied, setCopied] = useState(false);

  // Cartão de crédito form
  const [cardNumber, setCardNumber] = useState("");
  const [holder, setHolder] = useState("");
  const [expMonth, setExpMonth] = useState("");
  const [expYear, setExpYear] = useState("");
  const [cvv, setCvv] = useState("");
  const [installments, setInstallments] = useState(1);
  const [showTable, setShowTable] = useState(false);

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
      setInstallments(1);
      setShowTable(false);
      return;
    }
    // Para PIX, criamos o pedido imediatamente
    if (method === "pix") void gerarPix();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, method]);

  const amountCents = Math.round(amount * 100);

  const split = useMemo(
    () => calculateSplit(amountCents, method === "credit_card" ? installments : 1, true),
    [amountCents, method, installments],
  );
  const installmentTable = useMemo(() => getInstallmentTable(amountCents, 12), [amountCents]);
  const stoneFee = Math.round(split.sellerAmount * STONE_MDR_RATE);

  const gerarPix = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("create-order", {
        body: {
          payment_method: "pix",
          amount: amountCents,
          customer,
          seller_recipient_id: sellerRecipientId ?? undefined,
          pass_surcharge_to_customer: false,
        },
      });
      if (error) {
        let detail = error.message;
        try {
          const ctx: any = (error as any).context;
          if (ctx && typeof ctx.json === "function") {
            const body = await ctx.json();
            detail = body?.error ?? body?.details?.message ?? JSON.stringify(body);
          }
        } catch { /* ignore */ }
        throw new Error(detail);
      }
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
          seller_recipient_id: sellerRecipientId ?? undefined,
          pass_surcharge_to_customer: true,
          card: {
            number: num,
            holder_name: holder.trim(),
            exp_month: Number(expMonth),
            exp_year: Number(expYear.length === 2 ? `20${expYear}` : expYear),
            cvv,
            installments,
          },
        },
      });
      if (error) {
        let detail = error.message;
        try {
          const ctx: any = (error as any).context;
          if (ctx && typeof ctx.json === "function") {
            const body = await ctx.json();
            detail = body?.error ?? body?.details?.message ?? JSON.stringify(body);
          }
        } catch { /* ignore */ }
        throw new Error(detail);
      }
      if (data?.error) throw new Error(data.error);
      const status = data?.charge_status ?? data?.status;
      const chargedReais = (data?.amount ?? amountCents) / 100;
      if (status === "paid" || status === "authorized" || data?.status === "paid") {
        toast.success("Pagamento aprovado");
        onConfirmed({
          order_id: data.order_id,
          status,
          amount_charged: chargedReais,
          installments,
          base_amount: data?.base_amount,
          platform_amount: data?.platform_amount,
          seller_amount: data?.seller_amount,
          total_amount: data?.amount,
        });
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
            Total: <span className="num font-bold text-foreground">{brl(split.totalAmount / 100)}</span>
            {method === "credit_card" && installments > 1 && (
              <span className="ml-2 text-xs text-muted-foreground">
                ({installments}× de {brl(split.totalAmount / 100 / installments)})
              </span>
            )}
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
                    onClick={() => onConfirmed({
                      order_id: pix.order_id,
                      status: "pending",
                      base_amount: pix.base_amount,
                      platform_amount: pix.platform_amount,
                      seller_amount: pix.seller_amount,
                      total_amount: pix.amount,
                    })}
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
              <div className="flex items-center justify-between">
                <Label>Parcelas</Label>
                <button
                  type="button"
                  onClick={() => setShowTable((v) => !v)}
                  className="text-xs text-primary hover:underline"
                >
                  {showTable ? "Ocultar tabela" : "Ver tabela completa"}
                </button>
              </div>
              <Select
                value={String(installments)}
                onValueChange={(v) => setInstallments(Number(v))}
              >
                <SelectTrigger className="mono mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {installmentTable.map((row) => (
                    <SelectItem key={row.installments} value={String(row.installments)}>
                      {row.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <div className="mt-3 rounded-md bg-muted/40 p-3 space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span className="num">{brl(amountCents / 100)}</span>
                </div>
                {split.baseFeeAmount > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">
                      Taxas ({(BASE_FEE_RATE * 100).toFixed(2)}%)
                    </span>
                    <span className="num">+ {brl(split.baseFeeAmount / 100)}</span>
                  </div>
                )}
                {split.installmentSurcharge > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">
                      Parcelamento ({(INSTALLMENT_RATE * (installments - 1) * 100).toFixed(2)}%)
                    </span>
                    <span className="num">+ {brl(split.installmentSurcharge / 100)}</span>
                  </div>
                )}
                <div className="flex justify-between font-semibold border-t pt-1.5">
                  <span>Total cobrado</span>
                  <span className="num">{brl(split.totalAmount / 100)}</span>
                </div>
                {sellerRecipientId && (
                  <>
                    <div className="flex justify-between text-xs text-muted-foreground pt-1">
                      <span>Plataforma recebe</span>
                      <span className="num">
                        {brl(split.platformAmount / 100)} ({(split.platformRate * 100).toFixed(2)}%)
                      </span>
                    </div>
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Lojista recebe (antes do MDR)</span>
                      <span className="num">{brl(split.sellerAmount / 100)}</span>
                    </div>
                    <div className="flex justify-between text-[11px] text-muted-foreground/80">
                      <span>Stone deduz (2,04%)</span>
                      <span className="num">− {brl(stoneFee / 100)}</span>
                    </div>
                  </>
                )}
              </div>

              {showTable && (
                <div className="mt-3 max-h-56 overflow-y-auto rounded-md border">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/60 text-muted-foreground">
                      <tr>
                        <th className="px-2 py-1.5 text-left">Parc.</th>
                        <th className="px-2 py-1.5 text-right">Por parcela</th>
                        <th className="px-2 py-1.5 text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody className="num">
                      {installmentTable.map((row) => (
                        <tr
                          key={row.installments}
                          onClick={() => {
                            setInstallments(row.installments);
                            setShowTable(false);
                          }}
                          className={`cursor-pointer border-t hover:bg-muted/40 ${
                            row.installments === installments ? "bg-primary/10" : ""
                          }`}
                        >
                          <td className="px-2 py-1.5">{row.installments}×</td>
                          <td className="px-2 py-1.5 text-right">{brl(row.perInstallment / 100)}</td>
                          <td className="px-2 py-1.5 text-right">{brl(row.totalAmount / 100)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            <div className="flex flex-col gap-2 pt-2">
              <Button type="button" onClick={cobrarCartao} disabled={loading} className="w-full h-11">
                {loading ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Processando…</>
                ) : (
                  <>Cobrar {brl(split.totalAmount / 100)}</>
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