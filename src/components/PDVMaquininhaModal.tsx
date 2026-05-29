import { useEffect, useMemo, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Loader2, CreditCard, Smartphone, Check, X, RefreshCcw, Clock,
} from "lucide-react";
import { brl } from "@/lib/format";
import { calculateSplit, getInstallmentTable } from "@/lib/pagarme-split";
import { usePOSPayment, type Maquininha } from "@/hooks/usePOSPayment";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  amount: number; // reais (base sem acréscimo)
  defaultPaymentType?: "credit" | "debit" | "pix";
  venda_id: string | null;
  customerName?: string;
  customerEmail?: string;
  sellerRecipientId?: string | null;
  onClose: () => void;
  /** Disparado quando o pagamento foi confirmado no banco. */
  onPaid: (info: { order_id: string; total_amount: number; installments: number }) => void;
};

export function PDVMaquininhaModal({
  open, amount, defaultPaymentType = "credit", venda_id, customerName, customerEmail,
  sellerRecipientId, onClose, onPaid,
}: Props) {
  const {
    step, maquininhas, selectedMachine, orderId, error,
    loadMaquininhas, setSelectedMachine, createPOSOrder, startPolling, reset,
  } = usePOSPayment();

  const [paymentType, setPaymentType] = useState<"credit" | "debit" | "pix">(defaultPaymentType);
  const [installments, setInstallments] = useState(1);

  useEffect(() => {
    if (!open) reset();
    else setPaymentType(defaultPaymentType);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, defaultPaymentType]);

  const amountCents = Math.round(amount * 100);
  const split = useMemo(
    () => calculateSplit(amountCents, paymentType === "credit" ? installments : 1, true),
    [amountCents, paymentType, installments],
  );
  const installmentTable = useMemo(() => getInstallmentTable(amountCents, 12), [amountCents]);

  const handlePickMachine = async (m: Maquininha) => {
    if (!venda_id) return;
    setSelectedMachine(m);
    const id = await createPOSOrder({
      venda_id,
      amount: split.totalAmount,
      customerName: customerName || "Cliente PDV",
      customerEmail: customerEmail || "pdv@local",
      paymentType,
      installments: paymentType === "credit" ? installments : 1,
      deviceSerial: m.serial,
      sellerRecipientId,
      displayName: "Venda PDV",
      printReceipt: true,
    });
    if (id) {
      startPolling(venda_id, {
        onPaid: () => onPaid({
          order_id: id,
          total_amount: split.totalAmount,
          installments: paymentType === "credit" ? installments : 1,
        }),
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Smartphone className="h-5 w-5" /> Cobrança na maquininha
          </DialogTitle>
          <DialogDescription>
            Total a cobrar:{" "}
            <span className="num font-bold text-foreground">{brl(split.totalAmount / 100)}</span>
            {paymentType === "credit" && installments > 1 && (
              <span className="ml-2 text-xs text-muted-foreground">
                ({installments}× {brl(split.totalAmount / 100 / installments)})
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        {/* IDLE — escolha tipo + parcelas */}
        {step === "idle" && (
          <div className="space-y-4">
            <div>
              <Label className="mono text-[10px] uppercase tracking-widest text-muted-foreground">
                Tipo de pagamento
              </Label>
              <div className="grid grid-cols-3 gap-2 mt-1.5">
                {(["credit", "debit", "pix"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => { setPaymentType(t); setInstallments(1); }}
                    className={cn(
                      "rounded-lg border-2 px-2 py-3 text-xs flex flex-col items-center justify-center gap-1 transition-all",
                      paymentType === t
                        ? "border-primary bg-primary/10 text-primary font-semibold"
                        : "border-border hover:border-muted-foreground/30",
                    )}
                  >
                    {t === "pix" ? <span className="text-base font-black">PIX</span> : <CreditCard className="h-4 w-4" />}
                    {t === "credit" && "Crédito"}
                    {t === "debit" && "Débito"}
                    {t === "pix" && <span className="text-[10px] text-muted-foreground">QR Code</span>}
                  </button>
                ))}
              </div>
            </div>

            {paymentType === "credit" && (
              <div>
                <Label className="mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  Parcelas
                </Label>
                <Select value={String(installments)} onValueChange={(v) => setInstallments(Number(v))}>
                  <SelectTrigger className="mono mt-1.5"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {installmentTable.map((row) => (
                      <SelectItem key={row.installments} value={String(row.installments)}>
                        {row.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <Button onClick={loadMaquininhas} className="w-full h-11" disabled={!venda_id}>
              Selecionar maquininha →
            </Button>
          </div>
        )}

        {/* LOADING maquininhas */}
        {step === "loading_machines" && (
          <div className="space-y-2 py-4">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
          </div>
        )}

        {/* SELECT maquininha */}
        {step === "select_machine" && (
          <div className="space-y-3">
            {error && (
              <p className="text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2">{error}</p>
            )}
            {maquininhas.length === 0 ? (
              <div className="text-center py-6 text-sm text-muted-foreground">
                Nenhuma maquininha cadastrada. Adicione em <strong>Configurações → Maquininhas</strong>.
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2 max-h-[340px] overflow-y-auto">
                {maquininhas.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => handlePickMachine(m)}
                    className="rounded-lg border-2 border-border p-3 text-left hover:border-primary/40 hover:bg-muted/40 transition-colors"
                  >
                    <div className="font-semibold text-sm">{m.nome}</div>
                    {m.localizacao && (
                      <div className="text-[11px] text-muted-foreground">{m.localizacao}</div>
                    )}
                    <div className="mono text-[10px] text-muted-foreground mt-1">#{m.serial}</div>
                    {m.ultima_atividade && (
                      <div className="flex items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-400 mt-1">
                        <Clock className="h-2.5 w-2.5" />
                        {new Date(m.ultima_atividade).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                      </div>
                    )}
                  </button>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={loadMaquininhas}>
                <RefreshCcw className="h-3.5 w-3.5 mr-1" /> Recarregar
              </Button>
              <Button variant="ghost" size="sm" onClick={reset} className="ml-auto">Voltar</Button>
            </div>
          </div>
        )}

        {/* SENDING */}
        {step === "sending" && (
          <div className="flex items-center justify-center gap-2 py-10 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            Enviando para {selectedMachine?.nome}…
          </div>
        )}

        {/* AWAITING PAYMENT */}
        {step === "awaiting_payment" && (
          <div className="space-y-4">
            <div className="rounded-lg border border-border bg-muted/30 p-4 text-center">
              <Smartphone className="h-10 w-10 mx-auto text-primary mb-2" />
              <div className="font-bold">{selectedMachine?.nome}</div>
              <div className="mono text-[10px] text-muted-foreground">#{selectedMachine?.serial}</div>
            </div>
            <div className="flex items-center gap-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 px-4 py-3 text-sm">
              <Loader2 className="h-4 w-4 animate-spin text-amber-600 dark:text-amber-400 shrink-0" />
              <div>
                <div className="font-semibold text-amber-900 dark:text-amber-200">Aguardando pagamento…</div>
                <div className="text-xs text-amber-800/80 dark:text-amber-200/70">
                  Peça ao cliente para passar/aproximar o cartão na maquininha.
                </div>
              </div>
            </div>
            <div className="flex justify-between items-center rounded-md bg-muted/40 px-3 py-2 text-sm">
              <span className="text-muted-foreground">Total a cobrar</span>
              <span className="num font-bold text-base">{brl(split.totalAmount / 100)}</span>
            </div>
            <Button variant="outline" onClick={() => { reset(); onClose(); }} className="w-full">
              <X className="h-4 w-4 mr-1" /> Cancelar cobrança
            </Button>
          </div>
        )}

        {/* PAID */}
        {step === "paid" && (
          <div className="text-center py-6 space-y-3">
            <div className="h-12 w-12 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto">
              <Check className="h-6 w-6" />
            </div>
            <div className="font-bold text-lg">Pagamento confirmado</div>
            <div className="text-sm text-muted-foreground">
              {brl(split.totalAmount / 100)} via{" "}
              {paymentType === "credit" ? `crédito ${installments}×` : "débito"} em {selectedMachine?.nome}
            </div>
            {orderId && (
              <Badge variant="outline" className="mono text-[10px]">
                #{orderId.slice(-8).toUpperCase()}
              </Badge>
            )}
          </div>
        )}

        {/* FAILED */}
        {step === "failed" && (
          <div className="text-center py-6 space-y-3">
            <div className="h-12 w-12 rounded-full bg-destructive/10 text-destructive flex items-center justify-center mx-auto">
              <X className="h-6 w-6" />
            </div>
            <div className="font-bold">Pagamento não realizado</div>
            {error && (
              <p className="text-sm text-muted-foreground">{error}</p>
            )}
            <div className="flex gap-2 justify-center pt-2">
              <Button variant="outline" onClick={reset}>Tentar de novo</Button>
              <Button variant="ghost" onClick={() => { reset(); onClose(); }}>Fechar</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}