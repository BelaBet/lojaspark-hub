// Edge function: cria pedido na maquininha (Pagar.me Connect / POI) com split,
// e atualiza a venda (já criada pelo PDV como pendente) com os dados de cobrança.
//
// Body esperado:
// {
//   venda_id: string,
//   amount: number,                // centavos (total com acréscimo, já calculado no client)
//   customer: { name, email, document?, area_code?, phone? },
//   device_serial: string,
//   payment_type: "credit" | "debit",
//   installments?: number,
//   seller_recipient_id?: string,  // re_xxxx — habilita split
//   print_receipt?: boolean,
//   display_name?: string,
// }

import { createClient } from "npm:@supabase/supabase-js@2";

const PAGARME_BASE_URL = "https://api.pagar.me/core/v5";
const PLATFORM_BASE_RATE = 0.0096;
const INSTALLMENT_RATE = 0.011;

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

function buildSplitRules(
  totalAmount: number,
  installments: number,
  platformRecipientId: string,
  sellerRecipientId: string,
) {
  const surchargeRate = installments > 1 ? INSTALLMENT_RATE * (installments - 1) : 0;
  const platformRate = PLATFORM_BASE_RATE + surchargeRate;
  const platformAmount = Math.round(totalAmount * platformRate);
  const sellerAmount = totalAmount - platformAmount;
  const rules = [
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
  return { rules, platformAmount, sellerAmount };
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

    if (!venda_id) return json({ error: "venda_id obrigatório" }, 400);
    if (!amount || amount <= 0) return json({ error: "amount inválido" }, 400);
    if (!device_serial) return json({ error: "device_serial obrigatório" }, 400);
    if (
      payment_type !== "credit" &&
      payment_type !== "debit" &&
      payment_type !== "pix"
    ) {
      return json({ error: "payment_type deve ser 'credit', 'debit' ou 'pix'" }, 400);
    }
    if (!customer?.name || !customer?.email) {
      return json({ error: "customer.name e customer.email obrigatórios" }, 400);
    }

    // ── Verifica que a maquininha pertence à loja do usuário (via RLS) ───────
    const { data: maq, error: maqErr } = await supabase
      .from("maquininhas")
      .select("id, serial, ativo, loja_id")
      .eq("serial", device_serial)
      .maybeSingle();
    if (maqErr || !maq) return json({ error: "Maquininha não encontrada" }, 404);
    if (!maq.ativo) return json({ error: "Maquininha inativa" }, 400);

    // ── Verifica que a venda existe e pertence à loja ────────────────────────
    const { data: venda, error: vErr } = await supabase
      .from("vendas")
      .select("id, loja_id, pagamento_status")
      .eq("id", venda_id)
      .maybeSingle();
    if (vErr || !venda) return json({ error: "Venda não encontrada" }, 404);
    if (venda.loja_id !== maq.loja_id) {
      return json({ error: "Maquininha de outra loja" }, 403);
    }

    // ── Split rules (se houver recipient) ────────────────────────────────────
    // PIX e débito sempre 1×, sem acréscimo de parcela.
    const inst = payment_type === "credit" ? installments : 1;
    let splitRules: ReturnType<typeof buildSplitRules>["rules"] | null = null;
    let platformAmount: number | null = null;
    let sellerAmount: number | null = null;
    if (platformRecipientId && seller_recipient_id) {
      const built = buildSplitRules(amount, inst, platformRecipientId, seller_recipient_id);
      splitRules = built.rules;
      platformAmount = built.platformAmount;
      sellerAmount = built.sellerAmount;
    }

    // ── Payload Pagar.me Connect (POI) ───────────────────────────────────────
    const orderPayload = {
      customer: { name: customer.name, email: customer.email },
      items: [
        {
          amount,
          description: display_name ?? "Venda PDV",
          quantity: "1",
          code: "PDV-001",
        },
      ],
      closed: false,
      poi_payment_settings: {
        visible: "true",
        print_order_receipt: print_receipt ? "true" : "false",
        devices_serial_number: [device_serial],
        payment_setup: {
          type: payment_type,
          // PIX não usa parcelas
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

    // ── Atualiza venda com dados de cobrança via service role ────────────────
    // (campos financeiros são protegidos pelo trigger vendas_protect_financial_fields;
    //  vendedores não podem alterá-los pelo JWT — apenas o backend pode)
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    await admin
      .from("vendas")
      .update({
        pagarme_order_id: data.id,
        pagamento_status: "pendente",
        payment_channel: "pos",
        device_serial,
        installments: inst,
        base_amount: amount,
        platform_amount: platformAmount,
        seller_amount: sellerAmount,
        seller_recipient_id: seller_recipient_id ?? null,
        split_rules: splitRules,
      })
      .eq("id", venda_id);

    // ── Atualiza última atividade da maquininha ──────────────────────────────
    await admin
      .from("maquininhas")
      .update({ ultima_atividade: new Date().toISOString() })
      .eq("id", maq.id);

    return json({
      order_id: data.id,
      status: data.status,
      amount,
      device_serial,
      has_split: !!splitRules,
    });
  } catch (err) {
    console.error("create-pos-order erro:", err);
    return json({ error: err instanceof Error ? err.message : "Erro desconhecido" }, 500);
  }
});