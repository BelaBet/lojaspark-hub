// Edge function: cria pedido no Pagar.me usando as taxas configuradas pelo Super Admin.
// Secrets: PAGARME_SECRET_KEY, PAGARME_PLATFORM_RECIPIENT_ID.
// IMPORTANTE: nenhuma taxa financeira fica hardcoded aqui. A fonte é payment_fee_rules.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const PAGARME_BASE_URL = "https://api.pagar.me/core/v5";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type FeeRule = {
  acquirer: string;
  payment_method: "pix" | "credit_card" | "debit_card";
  installment_min: number;
  installment_max: number;
  percentage_rate: number;
  fixed_fee_cents: number;
  anticipation_rate: number;
  pass_to_customer: boolean;
  active: boolean;
};

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
  amount: number;
  customer?: {
    name?: string;
    email?: string;
    type?: "individual" | "company";
    document?: string;
    area_code?: string;
    phone?: string;
  };
  items?: Array<{ amount: number; description: string; quantity: number; code?: string | number }>;
  card?: CardData;
  seller_recipient_id?: string;
};

async function getFeeRule(supabase: ReturnType<typeof createClient>, method: Body["payment_method"], installments: number) {
  const { data, error } = await supabase
    .from("payment_fee_rules")
    .select("acquirer,payment_method,installment_min,installment_max,percentage_rate,fixed_fee_cents,anticipation_rate,pass_to_customer,active")
    .eq("acquirer", "pagarme")
    .eq("payment_method", method)
    .eq("active", true)
    .lte("installment_min", installments)
    .gte("installment_max", installments)
    .order("installment_min", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`Não foi possível carregar a taxa do Pagar.me: ${error.message}`);
  if (!data) throw new Error(`Taxa do Pagar.me não configurada para ${method} (${installments}x). Configure em Super Admin → Taxas de pagamento.`);
  return data as FeeRule;
}

function calculateAmount(baseAmount: number, rule: FeeRule) {
  const fee = Math.round(baseAmount * (Number(rule.percentage_rate) + Number(rule.anticipation_rate))) + Number(rule.fixed_fee_cents);
  const totalAmount = rule.pass_to_customer ? baseAmount + fee : baseAmount;
  const platformAmount = fee;
  const sellerAmount = totalAmount - platformAmount;
  return { totalAmount, platformAmount, sellerAmount, fee };
}

function buildSplit(platformAmount: number, sellerAmount: number, platformRecipientId: string, sellerRecipientId: string) {
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

    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(authHeader.replace("Bearer ", ""));
    if (claimsError || !claimsData?.claims) return json({ error: "Unauthorized" }, 401);

    const secretKey = Deno.env.get("PAGARME_SECRET_KEY");
    if (!secretKey) return json({ error: "PAGARME_SECRET_KEY não configurada" }, 500);
    const platformRecipientId = Deno.env.get("PAGARME_PLATFORM_RECIPIENT_ID");

    const body = (await req.json()) as Body;
    const { payment_method, amount, customer, items, card, seller_recipient_id } = body;
    if (!["pix", "credit_card", "debit_card"].includes(payment_method)) return json({ error: "payment_method inválido" }, 400);
    if (!Number.isInteger(amount) || amount <= 0) return json({ error: "amount obrigatório em centavos" }, 400);

    const installments = payment_method === "credit_card" ? Math.max(1, Math.floor(card?.installments ?? 1)) : 1;
    const feeRule = await getFeeRule(supabase, payment_method, installments);
    const { totalAmount, platformAmount, sellerAmount } = calculateAmount(amount, feeRule);

    const splitConfig = seller_recipient_id && platformRecipientId
      ? buildSplit(platformAmount, sellerAmount, platformRecipientId, seller_recipient_id)
      : null;

    const customerObj = {
      name: customer?.name ?? "Cliente",
      email: customer?.email ?? "cliente@email.com",
      type: customer?.type ?? "individual",
      document: (customer?.document ?? "00000000000").replace(/\D/g, ""),
      phones: {
        mobile_phone: {
          country_code: "55",
          area_code: customer?.area_code ?? "11",
          number: (customer?.phone ?? "999999999").replace(/\D/g, ""),
        },
      },
    };

    const payments: Record<string, unknown>[] = [];
    if (payment_method === "pix") {
      const p: Record<string, unknown> = { payment_method: "pix", pix: { expires_in: 3600 }, amount: totalAmount };
      if (splitConfig) p.split = splitConfig;
      payments.push(p);
    } else if (payment_method === "credit_card") {
      if (!card) return json({ error: "Dados do cartão obrigatórios" }, 400);
      const p: Record<string, unknown> = {
        payment_method: "credit_card",
        credit_card: {
          installments,
          statement_descriptor: card.statement_descriptor ?? "PDV",
          card: {
            number: card.number.replace(/\s/g, ""), holder_name: card.holder_name,
            exp_month: card.exp_month, exp_year: card.exp_year, cvv: card.cvv,
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
        debit_card: { card: { number: card.number.replace(/\s/g, ""), holder_name: card.holder_name, exp_month: card.exp_month, exp_year: card.exp_year, cvv: card.cvv } },
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
      headers: { Authorization: `Basic ${btoa(secretKey + ":")}`, "Content-Type": "application/json" },
      body: JSON.stringify(orderPayload),
    });
    const pagarmeData = await pagarmeRes.json();
    if (!pagarmeRes.ok) {
      console.error("Erro Pagar.me:", pagarmeData);
      return json({ error: pagarmeData?.message ?? "Erro ao criar pedido no Pagar.me", details: pagarmeData }, pagarmeRes.status);
    }

    const charge = pagarmeData.charges?.[0];
    const lastTransaction = charge?.last_transaction;
    return json({
      order_id: pagarmeData.id,
      status: pagarmeData.status,
      charge_status: charge?.status ?? null,
      amount: totalAmount,
      base_amount: amount,
      platform_amount: platformAmount,
      seller_amount: sellerAmount,
      fee_amount: totalAmount - amount,
      fee_rule: feeRule,
      split_applied: !!splitConfig,
      pix_qr_code: lastTransaction?.qr_code ?? null,
      pix_qr_code_url: lastTransaction?.qr_code_url ?? null,
      pix_expires_at: lastTransaction?.expires_at ?? null,
      card_status: lastTransaction?.status ?? null,
      card_brand: lastTransaction?.card?.brand ?? null,
    });
  } catch (err) {
    console.error("Erro interno create-order:", err);
    return json({ error: err instanceof Error ? err.message : "Erro desconhecido" }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
