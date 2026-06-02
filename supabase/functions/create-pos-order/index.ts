// Edge function: cria pedido na maquininha (Pagar.me Connect / POI) com split.
//
// Taxas repassadas ao cliente:
//   Pix         → R$ 0,50 fixo
//   Débito      → 3,96% (0,96% plataforma + 3,00% operação)
//   Crédito 1×  → 6,46% (0,96% + 3,00% + 2,50%)
//   Crédito N×  → 0,96% + 3,00% + (2,50% × N)
//
// Body esperado:
// {
//   venda_id: string,
//   amount: number,           // centavos BASE (sem acréscimo)
//   customer: { name, email },
//   device_serial: string,
//   payment_type: "credit" | "debit" | "pix",
//   installments?: number,
//   seller_recipient_id?: string,
//   print_receipt?: boolean,
//   display_name?: string,
// }

import { createClient } from "npm:@supabase/supabase-js@2";

const PAGARME_BASE_URL       = "https://api.pagar.me/core/v5";
const PLATFORM_RATE          = 0.0096;
const OPERATION_RATE         = 0.03;
const INSTALLMENT_RATE       = 0.025;
const PIX_PLATFORM_FEE_CENTS = 50;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function calcDebit(baseAmount: number) {
  const rate           = PLATFORM_RATE + OPERATION_RATE; // 3,96%
  const totalAmount    = baseAmount + Math.round(baseAmount * rate);
  const platformAmount = Math.round(totalAmount * rate);
  const sellerAmount   = totalAmount - platformAmount;
  return { totalAmount, platformAmount, sellerAmount };
}

function calcCredit(baseAmount: number, installments: number) {
  const inst           = Math.max(1, installments);
  const rate           = PLATFORM_RATE + OPERATION_RATE + INSTALLMENT_RATE * inst;
  const totalAmount    = baseAmount + Math.round(baseAmount * rate);
  const platformAmount = Math.round(totalAmount * rate);
  const sellerAmount   = totalAmount - platformAmount;
  return { totalAmount, platformAmount, sellerAmount };
}

function calcPix(baseAmount: number) {
  return {
    totalAmount:    baseAmount + PIX_PLATFORM_FEE_CENTS,
    platformAmount: PIX_PLATFORM_FEE_CENTS,
    sellerAmount:   baseAmount,
  };
}

function buildSplitRules(
  platformAmount: number,
  sellerAmount: number,
  platformRecipientId: string,
  sellerRecipientId: string,
) {
  return [
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
  ];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const secretKey = Deno.env.get("PAGARME_SECRET_KEY");
    if (!secretKey) return json({ error: "PAGARME_SECRET_KEY não configurada" }, 500);
    const platformRecipientId = Deno.env.get("PAGARME_PLATFORM_RECIPIENT_ID");

    // ── Auth ──────────────────────────────────────────────────────────────────
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: claims, error: claimsErr } = await supabase.auth.getClaims(
      authHeader.replace("Bearer ", ""),
    );
    if (claimsErr || !claims?.claims) return json({ error: "Unauthorized" }, 401);

    // ── Body ──────────────────────────────────────────────────────────────────
    const body = await req.json();
    const {
      venda_id,
      amount,
      customer,
      device_serial,
      payment_type,
      installments = 1,
      seller_recipient_id,
      print_receipt = false,
      display_name,
    } = body ?? {};

    if (!venda_id)              return json({ error: "venda_id obrigatório" }, 400);
    if (!amount || amount <= 0) return json({ error: "amount inválido" }, 400);
    if (!device_serial)         return json({ error: "device_serial obrigatório" }, 400);
    if (!["credit", "debit", "pix"].includes(payment_type)) {
      return json({ error: "payment_type deve ser 'credit', 'debit' ou 'pix'" }, 400);
    }
    if (!customer?.name || !customer?.email) {
      return json({ error: "customer.name e customer.email obrigatórios" }, 400);
    }

    // ── Verifica maquininha ───────────────────────────────────────────────────
    const { data: maq, error: maqErr } = await supabase
      .from("maquininhas")
      .select("id, serial, ativo, loja_id")
      .eq("serial", device_serial)
      .maybeSingle();
    if (maqErr || !maq) return json({ error: "Maquininha não encontrada" }, 404);
    if (!maq.ativo)     return json({ error: "Maquininha inativa" }, 400);

    // ── Verifica venda ────────────────────────────────────────────────────────
    const { data: venda, error: vErr } = await supabase
      .from("vendas")
      .select("id, loja_id, pagamento_status")
      .eq("id", venda_id)
      .maybeSingle();
    if (vErr || !venda)              return json({ error: "Venda não encontrada" }, 404);
    if (venda.loja_id !== maq.loja_id) return json({ error: "Maquininha de outra loja" }, 403);

    // ── Cálculo do split por método ───────────────────────────────────────────
    const inst = payment_type === "credit" ? Math.max(1, installments) : 1;
    let totalAmount: number;
    let platformAmount: number;
    let sellerAmount: number;

    if (payment_type === "pix") {
      ({ totalAmount, platformAmount, sellerAmount } = calcPix(amount));
    } else if (payment_type === "debit") {
      ({ totalAmount, platformAmount, sellerAmount } = calcDebit(amount));
    } else {
      ({ totalAmount, platformAmount, sellerAmount } = calcCredit(amount, inst));
    }

    const splitRules =
      platformRecipientId && seller_recipient_id
        ? buildSplitRules(platformAmount, sellerAmount, platformRecipientId, seller_recipient_id)
        : null;

    // ── Payload Pagar.me Connect (POI) ────────────────────────────────────────
    const orderPayload: Record<string, unknown> = {
      customer: { name: customer.name, email: customer.email },
      items: [
        {
          amount:      totalAmount,
          description: display_name ?? "Venda PDV",
          quantity:    "1",
          code:        "PDV-001",
        },
      ],
      closed: false,
      poi_payment_settings: {
        visible:               "true",
        print_order_receipt:   print_receipt ? "true" : "false",
        devices_serial_number: [device_serial],
        payment_setup: {
          type: payment_type,
          ...(payment_type !== "pix" && { installments: inst }),
        },
        display_name: display_name ?? "Venda PDV",
      },
    };

    const res = await fetch(`${PAGARME_BASE_URL}/orders`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${btoa(secretKey + ":")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(orderPayload),
    });
    const data = await res.json();
    if (!res.ok) {
      console.error("Pagar.me POS error:", data);
      return json(
        { error: data?.message ?? "Erro ao enviar pedido para a maquininha", details: data },
        res.status,
      );
    }

    // ── Atualiza venda via service role ───────────────────────────────────────
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    await admin
      .from("vendas")
      .update({
        pagarme_order_id:    data.id,
        pagamento_status:    "pendente",
        payment_channel:     "pos",
        device_serial,
        installments:        inst,
        base_amount:         totalAmount,
        platform_amount:     platformAmount,
        seller_amount:       sellerAmount,
        seller_recipient_id: seller_recipient_id ?? null,
        split_rules:         splitRules,
      })
      .eq("id", venda_id);

    await admin
      .from("maquininhas")
      .update({ ultima_atividade: new Date().toISOString() })
      .eq("id", maq.id);

    return json({
      order_id:        data.id,
      status:          data.status,
      amount:          totalAmount,
      base_amount:     amount,
      platform_amount: platformAmount,
      seller_amount:   sellerAmount,
      device_serial,
      has_split:       !!splitRules,
    });
  } catch (err) {
    console.error("create-pos-order erro:", err);
    return json({ error: err instanceof Error ? err.message : "Erro desconhecido" }, 500);
  }
});
