// Webhook público do Pagar.me. Atualiza o status da venda em `vendas`
// quando o pagamento for confirmado/falhar.
//
// Autenticação: Basic Auth (padrão Pagar.me v5).
// Configure no painel Pagar.me um usuário/senha e replique nos secrets:
//   PAGARME_WEBHOOK_USER, PAGARME_WEBHOOK_PASS
//
// URL do webhook (registre no painel Pagar.me):
//   https://<project-ref>.supabase.co/functions/v1/pagarme-webhook
// Eventos recomendados: order.paid, order.payment_failed, charge.paid, charge.payment_failed

import { createClient } from "npm:@supabase/supabase-js@2";

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
    const orderData = payload?.data ?? {};
    const orderId: string | undefined = orderData?.id;

    console.log(`[pagarme-webhook] ${eventType} order=${orderId} status=${orderData?.status}`);

    if (!orderId) {
      return new Response(JSON.stringify({ received: true, ignored: "no order id" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── 3. Mapeia evento para status interno da venda ───────────────────────
    let novoStatus: string | null = null;
    let novoPagamentoStatus: string | null = null;
    if (eventType === "order.paid" || eventType === "charge.paid") {
      novoStatus = "concluida";
      novoPagamentoStatus = "pago";
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
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const updatePayload: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (novoStatus) updatePayload.status = novoStatus;
    if (novoPagamentoStatus) updatePayload.pagamento_status = novoPagamentoStatus;

    const { data: updated, error: dbError } = await supabase
      .from("vendas")
      .update(updatePayload)
      .eq("pagarme_order_id", orderId)
      .select("id");

    if (dbError) {
      console.error("Erro ao atualizar venda:", dbError.message);
      // Retorna 200 para evitar retry infinito; o erro está logado
    } else {
      console.log(
        `[pagarme-webhook] venda(s) atualizada(s): ${updated?.length ?? 0} → ${novoStatus}`,
      );
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