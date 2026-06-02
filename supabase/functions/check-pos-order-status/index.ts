// Consulta o status de uma order/charge no Pagar.me e sincroniza a venda local.
// Body: { venda_id: string }
// Auth: JWT do usuário (precisa pertencer à loja da venda — checagem via RLS).
import { createClient } from "npm:@supabase/supabase-js@2";

const PAGARME_BASE_URL = "https://api.pagar.me/core/v5";
const PLATFORM_RATE = 0.0096;
const OPERATION_RATE = 0.03;
const INSTALLMENT_RATE = 0.025;
const PIX_PLATFORM_FEE_CENTS = 50;

// Recalcula o split em centavos a partir do amount real capturado, garantindo
// que platform_amount + seller_amount === amount.
// Taxas: Pix → R$ 0,50 fixo · Débito → 3,96% · Crédito → 3,96% + 2,5%/parcela.
function recomputeSplit(
  amountCents: number,
  paymentType: "credit" | "debit" | "pix",
  installments: number,
  platformRecipientId: string,
  sellerRecipientId: string,
) {
  let platformAmount: number;
  if (paymentType === "pix") {
    platformAmount = Math.min(PIX_PLATFORM_FEE_CENTS, amountCents);
  } else if (paymentType === "debit") {
    const rate = PLATFORM_RATE + OPERATION_RATE;
    platformAmount = Math.round(amountCents * rate);
  } else {
    const inst = Math.max(1, Math.floor(installments || 1));
    const rate = PLATFORM_RATE + OPERATION_RATE + INSTALLMENT_RATE * inst;
    platformAmount = Math.round(amountCents * rate);
  }
  const sellerAmount = amountCents - platformAmount;
  return {
    platformAmount,
    sellerAmount,
    rules: [
      {
        recipient_id: platformRecipientId,
        amount: platformAmount,
        type: "flat",
        options: { charge_processing_fee: false, charge_remainder_fee: false, liable: false },
      },
      {
        recipient_id: sellerRecipientId,
        amount: sellerAmount,
        type: "flat",
        options: { charge_processing_fee: true, charge_remainder_fee: true, liable: true },
      },
    ],
  };
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const token = authHeader.replace("Bearer ", "");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const isServiceRole = token === serviceKey;

    const supabase = isServiceRole
      ? createClient(Deno.env.get("SUPABASE_URL")!, serviceKey)
      : createClient(
          Deno.env.get("SUPABASE_URL")!,
          Deno.env.get("SUPABASE_ANON_KEY")!,
          { global: { headers: { Authorization: authHeader } } },
        );
    if (!isServiceRole) {
      const { data: claims, error: claimsErr } = await supabase.auth.getClaims(token);
      if (claimsErr || !claims?.claims) return json({ error: "Unauthorized" }, 401);
    }

    const { venda_id } = (await req.json()) ?? {};
    if (!venda_id) return json({ error: "venda_id obrigatório" }, 400);

    // RLS já garante que o usuário só vê vendas da sua loja
    const { data: venda, error: vErr } = await supabase
      .from("vendas")
      .select("id, pagarme_order_id, pagamento_status, status, device_serial, split_rules, base_amount, payment_channel, total, installments, seller_recipient_id, forma_pagamento")
      .eq("id", venda_id)
      .maybeSingle();
    if (vErr || !venda) return json({ error: "Venda não encontrada" }, 404);
    if (!venda.pagarme_order_id) {
      return json({ error: "Venda sem pedido no Pagar.me" }, 400);
    }

    const secretKey = Deno.env.get("PAGARME_SECRET_KEY");
    if (!secretKey) return json({ error: "PAGARME_SECRET_KEY não configurada" }, 500);

    const res = await fetch(`${PAGARME_BASE_URL}/orders/${venda.pagarme_order_id}`, {
      headers: { Authorization: `Basic ${btoa(secretKey + ":")}` },
    });
    const data = await res.json();
    if (!res.ok) {
      console.error("Pagar.me order lookup error:", data);
      return json(
        { error: data?.message ?? "Erro ao consultar pedido no Pagar.me", details: data },
        res.status,
      );
    }

    const orderStatus: string = data?.status ?? "unknown";
    const charge = data?.charges?.[0];
    const chargeStatus: string | undefined = charge?.status;
    const chargeId: string | undefined = charge?.id;
    const paidAtPagarme: string | undefined =
      charge?.paid_at ?? charge?.last_transaction?.paid_at ?? undefined;

    // ── Fallback de captura quando o webhook charge.authorized não chegou ────
    // Se a charge está "authorized" (cliente pagou na maquininha mas ainda não
    // foi capturada), forçamos a captura com split aqui — assim o fluxo POS
    // funciona mesmo se o webhook estiver bloqueado/desconfigurado.
    let captureAttempted = false;
    let captureOk = false;
    let recomputedPlatform: number | null = null;
    let recomputedSeller: number | null = null;
    let splitForCapture: ReturnType<typeof recomputeSplit>["rules"] | null = null;
    let capturedAmount: number | null = null;
    if (
      chargeStatus === "authorized" &&
      chargeId &&
      venda.payment_channel === "pos"
    ) {
      captureAttempted = true;
      // Amount em centavos: prioriza o total real da venda (com centavos).
      const totalCents =
        venda.total != null ? Math.round(Number(venda.total) * 100) : null;
      const amount = (totalCents ?? (charge?.amount as number | undefined) ?? venda.base_amount) as number;
      capturedAmount = amount;

      // Recalcula o split em centavos sobre o amount real (evita divergência).
      const platformRecipientId = Deno.env.get("PAGARME_PLATFORM_RECIPIENT_ID");
      const sellerRecipientId = venda.seller_recipient_id as string | undefined;
      const hadSplit =
        Array.isArray(venda.split_rules) && (venda.split_rules as unknown[]).length > 0;
      if (hadSplit && platformRecipientId && sellerRecipientId) {
        const fp = (venda.forma_pagamento as string | null) ?? "";
        const paymentType: "credit" | "debit" | "pix" =
          fp === "pix" ? "pix" : fp === "cartao_debito" ? "debit" : "credit";
        const built = recomputeSplit(
          amount,
          paymentType,
          (venda.installments as number | null) ?? 1,
          platformRecipientId,
          sellerRecipientId,
        );
        splitForCapture = built.rules;
        recomputedPlatform = built.platformAmount;
        recomputedSeller = built.sellerAmount;
      }

      const captureUrl = `${PAGARME_BASE_URL}/charges/${chargeId}/capture`;
      const capturePayload = splitForCapture
        ? { amount, split: splitForCapture }
        : { amount: String(amount) };
      const captureRes = await fetch(captureUrl, {
        method: "POST",
        headers: {
          Authorization: `Basic ${btoa(secretKey + ":")}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(capturePayload),
      });
      const captureData = await captureRes.json();
      captureOk = captureRes.ok;
      if (captureRes.ok) {
        console.log("Captura fallback OK:", captureData?.id, captureData?.status);
      } else {
        console.error("Captura fallback erro:", captureData);
      }
    }

    // Mapeia status do Pagar.me → status interno
    let novoPagamento: string | null = null;
    let novoStatus: string | null = null;
    let setPaidAt = false;
    if (
      chargeStatus === "paid" ||
      orderStatus === "paid" ||
      (captureAttempted && captureOk)
    ) {
      novoPagamento = "pago";
      novoStatus = "concluida";
      setPaidAt = true;
    } else if (
      chargeStatus === "failed" ||
      chargeStatus === "not_authorized" ||
      orderStatus === "failed"
    ) {
      novoPagamento = "falhou";
    } else if (
      orderStatus === "canceled" ||
      chargeStatus === "canceled" ||
      chargeStatus === "refunded"
    ) {
      novoPagamento = "falhou";
      novoStatus = "cancelada";
    }

    // Atualiza via service role (campos financeiros são protegidos pelo trigger)
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (chargeId) updates.pagarme_charge_id = chargeId;
    if (novoPagamento) updates.pagamento_status = novoPagamento;
    if (novoStatus) updates.status = novoStatus;
    if (setPaidAt) updates.paid_at = paidAtPagarme ?? new Date().toISOString();
    // Persiste o split efetivamente aplicado, em centavos.
    if (captureOk && splitForCapture && capturedAmount != null) {
      updates.base_amount = capturedAmount;
      updates.platform_amount = recomputedPlatform;
      updates.seller_amount = recomputedSeller;
      updates.split_rules = splitForCapture;
    }

    if (Object.keys(updates).length > 1) {
      await admin.from("vendas").update(updates).eq("id", venda_id);
      if (venda.device_serial) {
        await admin
          .from("maquininhas")
          .update({ ultima_atividade: new Date().toISOString() })
          .eq("serial", venda.device_serial);
      }
    }

    return json({
      order_id: venda.pagarme_order_id,
      order_status: orderStatus,
      charge_status: chargeStatus ?? null,
      charge_id: chargeId ?? null,
      pagamento_status: novoPagamento ?? venda.pagamento_status,
      status: novoStatus ?? venda.status,
      capture_attempted: captureAttempted,
      capture_ok: captureOk,
      synced: Object.keys(updates).length > 1,
    });
  } catch (err) {
    console.error("check-pos-order-status erro:", err);
    return json(
      { error: err instanceof Error ? err.message : "Erro desconhecido" },
      500,
    );
  }
});