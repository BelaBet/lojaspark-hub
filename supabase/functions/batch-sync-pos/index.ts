// Sincroniza vendas POS pendentes direto contra a Pagar.me, capturando as
// charges autorizadas e atualizando status no banco. Lógica é a mesma de
// check-pos-order-status, mas inline (sem hop HTTP) para suportar lote.
// Query params: from=YYYY-MM-DD, to=YYYY-MM-DD, loja_id=<uuid>
import { createClient } from "npm:@supabase/supabase-js@2";

const PAGARME_BASE_URL = "https://api.pagar.me/core/v5";
const PIX_PLATFORM_FEE_CENTS = 90;
const DEBIT_RATE             = 0.0098;
const CREDIT_1X_BASE_RATE    = 0.0125;
const CREDIT_N_BASE_RATE     = 0.0135;
const ANTICIPATION_RATE      = 0.011;

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
    platformAmount = Math.round(amountCents * DEBIT_RATE);
  } else {
    const inst = Math.max(1, Math.floor(installments || 1));
    const baseRate = inst === 1 ? CREDIT_1X_BASE_RATE : CREDIT_N_BASE_RATE;
    const rate = baseRate + ANTICIPATION_RATE;
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

async function syncOne(admin: ReturnType<typeof createClient>, vendaId: string, secretKey: string, platformRecipientId: string | undefined) {
  const { data: venda, error: vErr } = await admin
    .from("vendas")
    .select("id, pagarme_order_id, pagamento_status, status, device_serial, split_rules, base_amount, payment_channel, total, installments, seller_recipient_id, forma_pagamento")
    .eq("id", vendaId)
    .maybeSingle();
  if (vErr || !venda?.pagarme_order_id) return { venda_id: vendaId, error: "not_found_or_no_order" };

  const res = await fetch(`${PAGARME_BASE_URL}/orders/${venda.pagarme_order_id}`, {
    headers: { Authorization: `Basic ${btoa(secretKey + ":")}` },
  });
  const data = await res.json();
  if (!res.ok) return { venda_id: vendaId, pagarme_error: data?.message ?? "lookup_failed", http: res.status };

  const orderStatus: string = data?.status ?? "unknown";
  const charge = data?.charges?.[0];
  const chargeStatus: string | undefined = charge?.status;
  const chargeId: string | undefined = charge?.id;
  const paidAtPagarme: string | undefined = charge?.paid_at ?? charge?.last_transaction?.paid_at ?? undefined;

  let captureOk = false;
  let captureAttempted = false;
  let recomputedPlatform: number | null = null;
  let recomputedSeller: number | null = null;
  let splitForCapture: ReturnType<typeof recomputeSplit>["rules"] | null = null;
  let capturedAmount: number | null = null;
  let captureErr: unknown = null;

  if (chargeStatus === "authorized" && chargeId && venda.payment_channel === "pos") {
    captureAttempted = true;
    const totalCents = venda.total != null ? Math.round(Number(venda.total) * 100) : null;
    const amount = (totalCents ?? (charge?.amount as number | undefined) ?? venda.base_amount) as number;
    capturedAmount = amount;

    const sellerRecipientId = venda.seller_recipient_id as string | undefined;
    const hadSplit = Array.isArray(venda.split_rules) && (venda.split_rules as unknown[]).length > 0;
    if (hadSplit && platformRecipientId && sellerRecipientId) {
      const fp = (venda.forma_pagamento as string | null) ?? "";
      const paymentType: "credit" | "debit" | "pix" =
        fp === "pix" ? "pix" : fp === "cartao_debito" ? "debit" : "credit";
      const built = recomputeSplit(amount, paymentType, (venda.installments as number | null) ?? 1, platformRecipientId, sellerRecipientId);
      splitForCapture = built.rules;
      recomputedPlatform = built.platformAmount;
      recomputedSeller = built.sellerAmount;
    }

    const capturePayload = splitForCapture ? { amount, split: splitForCapture } : { amount: String(amount) };
    const captureRes = await fetch(`${PAGARME_BASE_URL}/charges/${chargeId}/capture`, {
      method: "POST",
      headers: { Authorization: `Basic ${btoa(secretKey + ":")}`, "Content-Type": "application/json" },
      body: JSON.stringify(capturePayload),
    });
    const captureData = await captureRes.json();
    captureOk = captureRes.ok;
    if (!captureRes.ok) captureErr = captureData;
  }

  let novoPagamento: string | null = null;
  let novoStatus: string | null = null;
  let setPaidAt = false;
  if (chargeStatus === "paid" || orderStatus === "paid" || (captureAttempted && captureOk)) {
    novoPagamento = "pago"; novoStatus = "concluida"; setPaidAt = true;
  } else if (chargeStatus === "failed" || chargeStatus === "not_authorized" || orderStatus === "failed") {
    novoPagamento = "falhou";
  } else if (orderStatus === "canceled" || chargeStatus === "canceled" || chargeStatus === "refunded") {
    novoPagamento = "falhou"; novoStatus = "cancelada";
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (chargeId) updates.pagarme_charge_id = chargeId;
  if (novoPagamento) updates.pagamento_status = novoPagamento;
  if (novoStatus) updates.status = novoStatus;
  if (setPaidAt) updates.paid_at = paidAtPagarme ?? new Date().toISOString();
  if (captureOk && splitForCapture && capturedAmount != null) {
    updates.base_amount = capturedAmount;
    updates.platform_amount = recomputedPlatform;
    updates.seller_amount = recomputedSeller;
    updates.split_rules = splitForCapture;
  }
  if (Object.keys(updates).length > 1) {
    await admin.from("vendas").update(updates).eq("id", vendaId);
  }

  return {
    venda_id: vendaId,
    order_status: orderStatus,
    charge_status: chargeStatus ?? null,
    capture_attempted: captureAttempted,
    capture_ok: captureOk,
    capture_err: captureErr,
    novo_pagamento: novoPagamento,
  };
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const from = url.searchParams.get("from") ?? "2026-05-29";
  const to = url.searchParams.get("to") ?? from;
  const lojaId = url.searchParams.get("loja_id");

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const secretKey = Deno.env.get("PAGARME_SECRET_KEY");
  if (!secretKey) return new Response(JSON.stringify({ error: "PAGARME_SECRET_KEY ausente" }), { status: 500 });
  const platformRecipientId = Deno.env.get("PAGARME_PLATFORM_RECIPIENT_ID");

  let q = admin
    .from("vendas")
    .select("id")
    .eq("pagamento_status", "pendente")
    .not("pagarme_order_id", "is", null)
    .eq("payment_channel", "pos")
    .gte("created_at", `${from}T00:00:00Z`)
    .lte("created_at", `${to}T23:59:59Z`);
  if (lojaId) q = q.eq("loja_id", lojaId);

  const { data: vendas, error } = await q;
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
  if (!vendas?.length) {
    return new Response(JSON.stringify({ msg: "Nenhuma venda encontrada", total: 0 }));
  }

  // Paralelismo limitado (5 concorrentes) para terminar bem antes do timeout.
  const CONCURRENCY = 5;
  const results: unknown[] = [];
  const queue = [...vendas];
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
      while (queue.length) {
        const v = queue.shift()!;
        try {
          results.push(await syncOne(admin, v.id, secretKey, platformRecipientId));
        } catch (err) {
          results.push({ venda_id: v.id, error: String(err) });
        }
      }
    }),
  );

  return new Response(JSON.stringify({ total: results.length, results }, null, 2), {
    headers: { "Content-Type": "application/json" },
  });
});