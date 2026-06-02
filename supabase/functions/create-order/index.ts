// Edge function: cria pedido no Pagar.me (PIX, crédito ou débito) com split.
// Secrets: PAGARME_SECRET_KEY, PAGARME_PLATFORM_RECIPIENT_ID.
//
// Taxas repassadas ao cliente:
//   Pix         → R$ 0,50 fixo
//   Débito      → 3,96% (0,96% plataforma + 3,00% operação)
//   Crédito 1×  → 6,46% (0,96% + 3,00% + 2,50%)
//   Crédito N×  → 0,96% + 3,00% + (2,50% × N)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const PAGARME_BASE_URL       = "https://api.pagar.me/core/v5";
const PLATFORM_RATE          = 0.0096;
const OPERATION_RATE         = 0.03;
const INSTALLMENT_RATE       = 0.025;
const PIX_PLATFORM_FEE_CENTS = 50;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function calculateDebitSplit(baseAmount: number) {
  const totalRate      = PLATFORM_RATE + OPERATION_RATE; // 3,96%
  const totalAmount    = baseAmount + Math.round(baseAmount * totalRate);
  const platformAmount = Math.round(totalAmount * totalRate);
  const sellerAmount   = totalAmount - platformAmount;
  return { totalAmount, platformAmount, sellerAmount };
}

function calculateCreditSplit(baseAmount: number, installments: number) {
  const inst           = Math.max(1, installments);
  const totalRate      = PLATFORM_RATE + OPERATION_RATE + INSTALLMENT_RATE * inst;
  const totalAmount    = baseAmount + Math.round(baseAmount * totalRate);
  const platformAmount = Math.round(totalAmount * totalRate);
  const sellerAmount   = totalAmount - platformAmount;
  return { totalAmount, platformAmount, sellerAmount };
}

function calculatePixSplit(baseAmount: number) {
  return {
    totalAmount:    baseAmount + PIX_PLATFORM_FEE_CENTS,
    platformAmount: PIX_PLATFORM_FEE_CENTS,
    sellerAmount:   baseAmount,
  };
}

function buildSplit(
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
      options: { charge_processing_fee: false, liable: false, charge_remainder_fee: false },
    },
    {
      recipient_id: sellerRecipientId,
      amount: sellerAmount,
      type: "flat",
      options: { charge_processing_fee: true, liable: true, charge_remainder_fee: true },
    },
  ];
}

type CardData = {
  number: string;
  holder_name: string;
  exp_month: number;
  exp_year: number;
  cvv: string;
  installments?: number;
  statement_descriptor?: string;
};

type Body = {
  payment_method: "pix" | "credit_card" | "debit_card";
  amount: number; // base em centavos (sem acréscimo)
  customer?: {
    name?: string;
    email?: string;
    type?: "individual" | "company";
    document?: string;
    area_code?: string;
    phone?: string;
  };
  items?: Array<{ amount: number; description: string; quantity: number; code?: string }>;
  card?: CardData;
  seller_recipient_id?: string;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(
      authHeader.replace("Bearer ", ""),
    );
    if (claimsError || !claimsData?.claims) return json({ error: "Unauthorized" }, 401);

    const secretKey = Deno.env.get("PAGARME_SECRET_KEY");
    if (!secretKey) return json({ error: "PAGARME_SECRET_KEY não configurada" }, 500);
    const platformRecipientId = Deno.env.get("PAGARME_PLATFORM_RECIPIENT_ID");

    const body = (await req.json()) as Body;
    const { payment_method, amount, customer, items, card, seller_recipient_id } = body;

    if (!["pix", "credit_card", "debit_card"].includes(payment_method)) {
      return json({ error: "payment_method inválido (pix, credit_card ou debit_card)" }, 400);
    }
    if (!amount || amount <= 0) return json({ error: "amount obrigatório (em centavos)" }, 400);

    // ── Cálculo do split por método ──────────────────────────────────────────
    let totalAmount: number;
    let platformAmount: number;
    let sellerAmount: number;

    if (payment_method === "pix") {
      ({ totalAmount, platformAmount, sellerAmount } = calculatePixSplit(amount));
    } else if (payment_method === "debit_card") {
      ({ totalAmount, platformAmount, sellerAmount } = calculateDebitSplit(amount));
    } else {
      const installments = card?.installments ?? 1;
      ({ totalAmount, platformAmount, sellerAmount } = calculateCreditSplit(amount, installments));
    }

    const splitConfig =
      seller_recipient_id && platformRecipientId
        ? buildSplit(platformAmount, sellerAmount, platformRecipientId, seller_recipient_id)
        : null;

    const customerObj = {
      name:     customer?.name     ?? "Cliente",
      email:    customer?.email    ?? "cliente@email.com",
      type:     customer?.type     ?? "individual",
      document: (customer?.document ?? "00000000000").replace(/\D/g, ""),
      phones: {
        mobile_phone: {
          country_code: "55",
          area_code:    customer?.area_code ?? "11",
          number:       (customer?.phone ?? "999999999").replace(/\D/g, ""),
        },
      },
    };

    const payments: unknown[] = [];

    if (payment_method === "pix") {
      const p: Record<string, unknown> = {
        payment_method: "pix",
        pix: { expires_in: 3600 },
        amount: totalAmount,
      };
      if (splitConfig) p.split = splitConfig;
      payments.push(p);
    } else if (payment_method === "credit_card") {
      if (!card) return json({ error: "Dados do cartão obrigatórios" }, 400);
      const p: Record<string, unknown> = {
        payment_method: "credit_card",
        credit_card: {
          installments: card.installments ?? 1,
          statement_descriptor: card.statement_descriptor ?? "PDV",
          card: {
            number:      card.number.replace(/\s/g, ""),
            holder_name: card.holder_name,
            exp_month:   card.exp_month,
            exp_year:    card.exp_year,
            cvv:         card.cvv,
          },
        },
        amount: totalAmount,
      };
      if (splitConfig) p.split = splitConfig;
      payments.push(p);
    } else {
      if (!card) return json({ error: "Dados do cartão obrigatórios" }, 400);
      const p: Record<string, unknown> = {
        payment_method: "debit_card",
        debit_card: {
          card: {
            number:      card.number.replace(/\s/g, ""),
            holder_name: card.holder_name,
            exp_month:   card.exp_month,
            exp_year:    card.exp_year,
            cvv:         card.cvv,
          },
        },
        amount: totalAmount,
      };
      if (splitConfig) p.split = splitConfig;
      payments.push(p);
    }

    const orderPayload = {
      items: items ?? [{ amount: totalAmount, description: "Venda PDV", quantity: 1, code: "PDV-001" }],
      customer: customerObj,
      payments,
    };

    const pagarmeRes = await fetch(`${PAGARME_BASE_URL}/orders`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${btoa(secretKey + ":")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(orderPayload),
    });
    const pagarmeData = await pagarmeRes.json();
    if (!pagarmeRes.ok) {
      console.error("Erro Pagar.me:", pagarmeData);
      return json(
        { error: pagarmeData?.message ?? "Erro ao criar pedido no Pagar.me", details: pagarmeData },
        pagarmeRes.status,
      );
    }

    const charge = pagarmeData.charges?.[0];
    const lastTransaction = charge?.last_transaction;

    return json({
      order_id:        pagarmeData.id,
      status:          pagarmeData.status,
      charge_status:   charge?.status ?? null,
      amount:          totalAmount,
      base_amount:     amount,
      platform_amount: platformAmount,
      seller_amount:   sellerAmount,
      split_applied:   !!splitConfig,
      pix_qr_code:     lastTransaction?.qr_code ?? null,
      pix_qr_code_url: lastTransaction?.qr_code_url ?? null,
      pix_expires_at:  lastTransaction?.expires_at ?? null,
      card_status:     lastTransaction?.status ?? null,
      card_brand:      lastTransaction?.card?.brand ?? null,
    });
  } catch (err) {
    console.error("Erro interno create-order:", err);
    return json({ error: err instanceof Error ? err.message : "Erro desconhecido" }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
