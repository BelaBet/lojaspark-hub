// Orquestra cobrança em maquininha (Pagar.me Connect):
//   1. Lista maquininhas ativas da loja
//   2. create-pos-order (via edge function) envia pedido p/ a POS
//   3. Poll em vendas.pagamento_status (webhook auto-captura no charge.authorized)

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type Maquininha = {
  id: string;
  nome: string;
  serial: string;
  localizacao: string | null;
  ativo: boolean;
  ultima_atividade: string | null;
};

export type POSStep =
  | "idle"
  | "loading_machines"
  | "select_machine"
  | "sending"
  | "awaiting_payment"
  | "paid"
  | "failed";

export type POSOrderParams = {
  venda_id: string;
  amount: number; // centavos (total já com acréscimo)
  customerName: string;
  customerEmail: string;
  paymentType: "credit" | "debit" | "pix";
  installments?: number;
  deviceSerial: string;
  sellerRecipientId?: string | null;
  displayName?: string;
  printReceipt?: boolean;
};

export function usePOSPayment() {
  const [step, setStep] = useState<POSStep>("idle");
  const [maquininhas, setMaquininhas] = useState<Maquininha[]>([]);
  const [selectedMachine, setSelectedMachine] = useState<Maquininha | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadMaquininhas = async () => {
    setStep("loading_machines");
    setError(null);
    const { data, error: dbError } = await supabase
      .from("maquininhas")
      .select("id,nome,serial,localizacao,ativo,ultima_atividade")
      .eq("ativo", true)
      .order("nome");
    if (dbError) {
      setError("Erro ao carregar maquininhas.");
      setStep("idle");
      return;
    }
    setMaquininhas((data ?? []) as Maquininha[]);
    setStep("select_machine");
  };

  const createPOSOrder = async (p: POSOrderParams): Promise<string | null> => {
    setStep("sending");
    setError(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke("create-pos-order", {
        body: {
          venda_id: p.venda_id,
          amount: p.amount,
          customer: { name: p.customerName, email: p.customerEmail },
          device_serial: p.deviceSerial,
          payment_type: p.paymentType,
          installments: p.installments ?? 1,
          seller_recipient_id: p.sellerRecipientId ?? undefined,
          print_receipt: p.printReceipt ?? false,
          display_name: p.displayName,
        },
      });
      if (fnError) throw new Error(fnError.message);
      if (data?.error) throw new Error(data.error);
      setOrderId(data.order_id);
      setStep("awaiting_payment");
      return data.order_id;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro ao enviar para a maquininha.";
      setError(msg);
      setStep("select_machine");
      return null;
    }
  };

  const startPolling = (
    venda_id: string,
    options?: { intervalMs?: number; maxAttempts?: number; onPaid?: () => void; onFailed?: () => void; onTimeout?: () => void },
  ) => {
    stopPolling();
    const { intervalMs = 3000, maxAttempts = 80, onPaid, onFailed, onTimeout } = options ?? {};
    let attempts = 0;
    // A cada N polls, força um sync direto com o Pagar.me (fallback caso o
    // webhook não esteja chegando). 4 × 3s = ~12s entre syncs.
    const SYNC_EVERY = 4;
    pollingRef.current = setInterval(async () => {
      attempts++;
      if (attempts % SYNC_EVERY === 0) {
        try {
          await supabase.functions.invoke("check-pos-order-status", {
            body: { venda_id },
          });
        } catch (_err) {
          // sync é best-effort; o poll do banco continua abaixo
        }
      }
      const { data } = await supabase
        .from("vendas")
        .select("pagamento_status")
        .eq("id", venda_id)
        .maybeSingle();
      if (!data) return;
      if (data.pagamento_status === "pago") {
        stopPolling();
        setStep("paid");
        onPaid?.();
        return;
      }
      if (data.pagamento_status === "falhou") {
        stopPolling();
        setError("Pagamento recusado ou cancelado.");
        setStep("failed");
        onFailed?.();
        return;
      }
      if (attempts >= maxAttempts) {
        stopPolling();
        setError("Tempo esgotado. Verifique se o cliente concluiu o pagamento na maquininha.");
        setStep("failed");
        onTimeout?.();
      }
    }, intervalMs);
  };

  const stopPolling = () => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  };

  const reset = () => {
    stopPolling();
    setStep("idle");
    setSelectedMachine(null);
    setOrderId(null);
    setError(null);
  };

  useEffect(() => () => stopPolling(), []);

  return {
    step, maquininhas, selectedMachine, orderId, error,
    loadMaquininhas, setSelectedMachine, createPOSOrder, startPolling, stopPolling, reset,
  };
}