// Edge function pública: cria um pedido no Pagar.me (PIX ou cartão de crédito).
// Requer secret PAGARME_SECRET_KEY. Não exige usuário autenticado.
const PAGARME_BASE_URL = "https://api.pagar.me/core/v5";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
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
  payment_method: "pix" | "credit_card";
  amount: number; // em centavos
  customer?: {
    name?: string;
    email?: string;
    type?: "individual" | "company";
    document?: string;
    area_code?: string;
    phone?: string;
  };
  items?: Array<{
    amount: number;
    description: string;
    quantity: number;
    code?: string;
  }>;
  card?: CardData;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const secretKey = Deno.env.get("PAGARME_SECRET_KEY");
    if (!secretKey) {
      return json({ error: "PAGARME_SECRET_KEY não configurada" }, 500);
    }

    const body = (await req.json()) as Body;
    const { payment_method, amount, customer, items, card } = body;

    if (!payment_method || (payment_method !== "pix" && payment_method !== "credit_card")) {
      return json({ error: "payment_method inválido (pix ou credit_card)" }, 400);
    }
    if (!amount || amount <= 0) {
      return json({ error: "amount obrigatório (em centavos)" }, 400);
    }

    const orderPayload: Record<string, unknown> = {
      items: items ?? [
        { amount, description: "Venda PDV", quantity: 1, code: "PDV-001" },
      ],
      customer: {
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
      },
      payments: [] as unknown[],
    };

    if (payment_method === "pix") {
      (orderPayload.payments as unknown[]).push({
        payment_method: "pix",
        pix: { expires_in: 3600 },
        amount,
      });
    } else {
      if (!card) return json({ error: "Dados do cartão obrigatórios" }, 400);
      (orderPayload.payments as unknown[]).push({
        payment_method: "credit_card",
        credit_card: {
          installments: card.installments ?? 1,
          statement_descriptor: card.statement_descriptor ?? "PDV",
          card: {
            number: card.number.replace(/\s/g, ""),
            holder_name: card.holder_name,
            exp_month: card.exp_month,
            exp_year: card.exp_year,
            cvv: card.cvv,
          },
        },
        amount,
      });
    }

    const pagarmeRes = await fetch(`${PAGARME_BASE_URL}/orders`, {
      method: "POST",
      headers: {
        "Authorization": `Basic ${btoa(secretKey + ":")}`,
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
      order_id: pagarmeData.id,
      status: pagarmeData.status,
      charge_status: charge?.status ?? null,
      amount: pagarmeData.amount,
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
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}