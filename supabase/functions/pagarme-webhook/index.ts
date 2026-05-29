// Webhook público do Pagar.me. Atualiza o status da venda em `vendas`
// quando o pagamento for confirmado/falhar. Para o fluxo de maquininha (POS),
// faz captura automática com split em "charge.authorized".
//
// Autenticação: Basic Auth (PAGARME_WEBHOOK_USER / PAGARME_WEBHOOK_PASS).
// Eventos: order.paid, order.payment_failed, charge.authorized, charge.paid,
//          charge.payment_failed, order.canceled, charge.refunded.

import { createClient } from "npm:@supabase/supabase-js@2";

const PAGARME_BASE_URL = "https://api.pagar.me/core/v5";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function unauthorized(msg = "Unauthorized") {
  return new Response(JSON.stringify({ error: msg }), {
    status: 401,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  try {
    // ─── 1. Basic Auth ───────────────────────────────────────────────────────
    const expectedUser = Deno.env.get("PAGARME_WEBHOOK_USER");
    const expectedPass = Deno.env.get("PAGARME_WEBHOOK_PASS");
    if (!expectedUser || !expectedPass) {
      console.error("PAGARME_WEBHOOK_USER/PASS não configurados");
      return new Response("Server not configured", { status: 500, headers: corsHeaders });
    }

    const authHeader = req.headers.get("authorization") ?? "";
    if (!authHeader.toLowerCase().startsWith("basic ")) return unauthorized();
    let decoded = "";
    try {
      decoded = atob(authHeader.slice(6).trim());
    } catch {
      return unauthorized("Invalid auth");
    }
    const sep = decoded.indexOf(":");
    const user = sep >= 0 ? decoded.slice(0, sep) : decoded;
    const pass = sep >= 0 ? decoded.slice(sep + 1) : "";
    if (user !== expectedUser || pass !== expectedPass) {
      console.warn("Credenciais Basic inválidas no webhook Pagar.me");
      return unauthorized();
    }

    // ─── 2. Parse payload ────────────────────────────────────────────────────
    const payload = await req.json();
    const eventType: string = payload?.type ?? "unknown";
    const data = payload?.data ?? {};
    console.log(`[pagarme-webhook] ${eventType} id=${data?.id} status=${data?.status}`);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const secretKey = Deno.env.get("PAGARME_SECRET_KEY");

    // ─── charge.authorized — cliente pagou na maquininha; captura automática ─
    if (eventType === "charge.authorized" && secretKey) {
      const chargeId = data?.id as string | undefined;
      const orderId = data?.order_id as string | undefined;
      const chargeAmt = data?.amount as number | undefined;
      if (!chargeId || !orderId) {
        return new Response("ok", { status: 200, headers: corsHeaders });
      }

      // Busca a venda correspondente
      const { data: venda } = await supabase
        .from("vendas")
        .select("id, split_rules, device_serial, base_amount, payment_channel")
        .eq("pagarme_order_id", orderId)
        .maybeSingle();

      // Guarda charge_id desde já
      await supabase
        .from("vendas")
        .update({ pagarme_charge_id: chargeId, updated_at: new Date().toISOString() })
        .eq("pagarme_order_id", orderId);

      // Só faz captura automática para fluxo POS (online já vem capturado)
      if (venda?.payment_channel === "pos") {
        const amount = chargeAmt ?? venda?.base_amount;
        const splitRules = venda?.split_rules as unknown[] | null;

        const captureUrl =
          splitRules && Array.isArray(splitRules) && splitRules.length > 0
            ? `${PAGARME_BASE_URL}/charges/${chargeId}/capture-with-split-rules`
            : `${PAGARME_BASE_URL}/charges/${chargeId}/capture`;
        const capturePayload =
          splitRules && Array.isArray(splitRules) && splitRules.length > 0
            ? { amount, split: splitRules }
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
        if (!captureRes.ok) {
          console.error("Erro na captura automática:", captureData);
          await supabase
            .from("vendas")
            .update({ pagamento_status: "falhou", updated_at: new Date().toISOString() })
            .eq("pagarme_order_id", orderId);
        } else {
          console.log("Captura automática OK:", captureData.id, captureData.status);
        }

        if (venda.device_serial) {
          await supabase
            .from("maquininhas")
            .update({ ultima_atividade: new Date().toISOString() })
            .eq("serial", venda.device_serial);
        }
      }

      return new Response("ok", { status: 200, headers: corsHeaders });
    }

    const orderId: string | undefined = data?.id ?? data?.order_id;
    if (!orderId) {
      return new Response(JSON.stringify({ received: true, ignored: "no order id" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── 3. Mapeia evento para status interno da venda ───────────────────────
    let novoStatus: string | null = null;
    let novoPagamentoStatus: string | null = null;
    let marcarPaidAt = false;
    if (eventType === "order.paid" || eventType === "charge.paid") {
      novoStatus = "concluida";
      novoPagamentoStatus = "pago";
      marcarPaidAt = true;
    } else if (
      eventType === "order.payment_failed" ||
      eventType === "charge.payment_failed"
    ) {
      novoPagamentoStatus = "falhou";
    } else if (
      eventType === "order.canceled" ||
      eventType === "charge.refunded"
    ) {
      novoStatus = "cancelada";
      novoPagamentoStatus = "falhou";
    }

    if (!novoStatus && !novoPagamentoStatus) {
      // Evento que não nos interessa — apenas confirma recebimento
      return new Response(JSON.stringify({ received: true, ignored: eventType }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── 4. Atualiza venda no Supabase ───────────────────────────────────────
    const updatePayload: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (novoStatus) updatePayload.status = novoStatus;
    if (novoPagamentoStatus) updatePayload.pagamento_status = novoPagamentoStatus;
    if (marcarPaidAt) updatePayload.paid_at = new Date().toISOString();

    // Para eventos de charge, o data.id é o charge_id e data.order_id o pedido
    const matchOrderId = data?.order_id ?? data?.id;
    const { data: updated, error: dbError } = await supabase
      .from("vendas")
      .update(updatePayload)
      .eq("pagarme_order_id", matchOrderId)
      .select("id, device_serial");

    if (dbError) {
      console.error("Erro ao atualizar venda:", dbError.message);
      // Retorna 200 para evitar retry infinito; o erro está logado
    } else {
      console.log(
        `[pagarme-webhook] venda(s) atualizada(s): ${updated?.length ?? 0} → ${novoPagamentoStatus ?? novoStatus}`,
      );
      // Atualiza atividade da maquininha se aplicável
      const serial = updated?.[0]?.device_serial;
      if (serial) {
        await supabase
          .from("maquininhas")
          .update({ ultima_atividade: new Date().toISOString() })
          .eq("serial", serial);
      }
    }

    return new Response(
      JSON.stringify({
        received: true,
        status: novoStatus,
        pagamento_status: novoPagamentoStatus,
        matched: updated?.length ?? 0,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("Erro no webhook:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Erro desconhecido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});