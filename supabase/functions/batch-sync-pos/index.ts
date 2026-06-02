// Edge Function temporária: sincroniza as 23 vendas POS pendentes de 29/05/2026.
// Para cada venda com pagarme_order_id:
//   1. Consulta a order na Pagar.me
//   2. Pega o charge_id e verifica se está authorized_pending_capture
//   3. Captura com split correto por método (débito/crédito/pix)
//   4. Fecha o pedido (PATCH /orders/{order_id}/closed)
//   5. Atualiza a venda no Supabase
//
// Após rodar com sucesso, deletar essa função.

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const PAGARME_BASE_URL            = "https://api.pagar.me/core/v5";
const PLATFORM_RATE_DEBIT         = 0.0098;
const PLATFORM_RATE_CREDIT_AVISTA = 0.0125;
const PLATFORM_RATE_CREDIT_PARC   = 0.0135;
const ANTICIPATION_RATE           = 0.011;
const PIX_PLATFORM_FEE_CENTS      = 90;
const PLATFORM_RECIPIENT_ID       = "re_cmp709bbxe5y20l9t4pnjpa76";
const LAGOINHA_RECIPIENT_ID       = "re_cmpcr534o9me40l9ti0cnqz6e";

function calcSplit(
  amount: number,
  paymentMethod: string,
  installments: number,
  anticipation: boolean,
) {
  let platformAmount: number;
  let sellerAmount: number;

  if (paymentMethod === "pix") {
    platformAmount = PIX_PLATFORM_FEE_CENTS;
    sellerAmount   = amount - platformAmount;
  } else if (paymentMethod === "debit_card") {
    platformAmount = Math.round(amount * PLATFORM_RATE_DEBIT);
    sellerAmount   = amount - platformAmount;
  } else {
    const inst      = Math.max(1, installments);
    const baseRate  = inst === 1 ? PLATFORM_RATE_CREDIT_AVISTA : PLATFORM_RATE_CREDIT_PARC;
    const totalRate = baseRate + (anticipation ? ANTICIPATION_RATE : 0);
    platformAmount  = Math.round(amount * totalRate);
    sellerAmount    = amount - platformAmount;
  }

  return {
    platformAmount,
    sellerAmount,
    rules: [
      {
        recipient_id: PLATFORM_RECIPIENT_ID,
        amount: platformAmount,
        type: "flat",
        options: { charge_processing_fee: false, charge_remainder_fee: false, liable: false },
      },
      {
        recipient_id: LAGOINHA_RECIPIENT_ID,
        amount: sellerAmount,
        type: "flat",
        options: { charge_processing_fee: true, charge_remainder_fee: true, liable: true },
      },
    ],
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  const secretKey = Deno.env.get("PAGARME_SECRET_KEY")!;
  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Busca as 23 vendas pendentes com pagarme_order_id
  const { data: vendas, error } = await admin
    .from("vendas")
    .select("id, pagarme_order_id, anticipation, base_amount")
    .eq("pagamento_status", "pendente")
    .eq("payment_channel", "pos")
    .gte("created_at", "2026-05-29T00:00:00Z")
    .lte("created_at", "2026-05-29T23:59:59Z")
    .not("pagarme_order_id", "is", null);

  if (error || !vendas?.length) {
    return new Response(
      JSON.stringify({ error: error?.message ?? "Nenhuma venda encontrada" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const results = [];

  for (const venda of vendas) {
    try {
      // 1. Consulta a order na Pagar.me
      const orderRes = await fetch(`${PAGARME_BASE_URL}/orders/${venda.pagarme_order_id}`, {
        headers: { Authorization: `Basic ${btoa(secretKey + ":")}` },
      });
      const order = await orderRes.json();

      const charge        = order?.charges?.[0];
      const chargeId      = charge?.id as string | undefined;
      const lastTxStatus  = charge?.last_transaction?.status as string | undefined;
      const paymentMethod = charge?.payment_method as string ?? "credit_card";
      const amount        = charge?.amount as number ?? venda.base_amount;
      const installments  = (charge?.last_transaction?.installments as number | undefined) ?? 1;
      const orderStatus   = order?.status as string;

      console.log(
        `[batch-sync] venda: ${venda.id} | order: ${venda.pagarme_order_id} | ` +
        `charge: ${chargeId} | last_tx_status: ${lastTxStatus} | order_status: ${orderStatus}`
      );

      // Já pago — apenas fecha e atualiza
      if (orderStatus === "paid" || charge?.status === "paid") {
        await admin.from("vendas").update({
          pagamento_status:    "pago",
          status:              "concluida",
          pagarme_charge_id:   chargeId ?? null,
          paid_at:             new Date().toISOString(),
          updated_at:          new Date().toISOString(),
        }).eq("id", venda.id);
        results.push({ vendaId: venda.id, orderId: venda.pagarme_order_id, result: "ja_pago_atualizado" });
        continue;
      }

      // Sem charge ou não está pronta para captura
      if (!chargeId || lastTxStatus !== "authorized_pending_capture") {
        results.push({
          vendaId:  venda.id,
          orderId:  venda.pagarme_order_id,
          result:   "skipped",
          reason:   `last_tx_status_${lastTxStatus ?? "sem_charge"}`,
        });
        continue;
      }

      const anticipation = (venda.anticipation as boolean | null) ?? false;
      const { platformAmount, sellerAmount, rules } = calcSplit(
        amount, paymentMethod, installments, anticipation,
      );

      console.log(
        `[batch-sync] split → plataforma: ${platformAmount} | Lagoinha: ${sellerAmount} | soma: ${platformAmount + sellerAmount}`
      );

      // 2. Captura com split
      const captureRes = await fetch(`${PAGARME_BASE_URL}/charges/${chargeId}/capture`, {
        method: "POST",
        headers: {
          Authorization: `Basic ${btoa(secretKey + ":")}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ amount, split: rules }),
      });
      const captureData = await captureRes.json();

      if (!captureRes.ok) {
        results.push({
          vendaId:  venda.id,
          orderId:  venda.pagarme_order_id,
          chargeId,
          result:   "capture_failed",
          error:    captureData?.message ?? JSON.stringify(captureData),
        });
        continue;
      }

      // 3. Fecha o pedido
      const closeRes = await fetch(`${PAGARME_BASE_URL}/orders/${venda.pagarme_order_id}/closed`, {
        method: "PATCH",
        headers: {
          Authorization: `Basic ${btoa(secretKey + ":")}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status: "closed" }),
      });
      const closeData = await closeRes.json();
      console.log(`[batch-sync] order fechada: ${venda.pagarme_order_id} | ok: ${closeRes.ok}`);

      // 4. Atualiza venda no Supabase
      await admin.from("vendas").update({
        pagamento_status:    "pago",
        status:              "concluida",
        pagarme_charge_id:   chargeId,
        paid_at:             new Date().toISOString(),
        updated_at:          new Date().toISOString(),
        platform_amount:     platformAmount,
        seller_amount:       sellerAmount,
        seller_recipient_id: LAGOINHA_RECIPIENT_ID,
        split_rules:         rules,
      }).eq("id", venda.id);

      results.push({
        vendaId:         venda.id,
        orderId:         venda.pagarme_order_id,
        chargeId,
        result:          "captured",
        payment_method:  paymentMethod,
        amount,
        platform_amount: platformAmount,
        seller_amount:   sellerAmount,
        order_closed:    closeRes.ok,
        close_status:    closeData?.status ?? null,
      });

    } catch (err) {
      results.push({ vendaId: venda.id, orderId: venda.pagarme_order_id, error: String(err) });
    }

    await new Promise((r) => setTimeout(r, 400));
  }

  const captured = results.filter((r) => (r as any).result === "captured").length;
  const skipped  = results.filter((r) => (r as any).result === "skipped").length;
  const failed   = results.filter((r) => (r as any).result === "capture_failed").length;
  const updated  = results.filter((r) => (r as any).result === "ja_pago_atualizado").length;

  return new Response(
    JSON.stringify({ total: results.length, captured, skipped, failed, updated, results }, null, 2),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
