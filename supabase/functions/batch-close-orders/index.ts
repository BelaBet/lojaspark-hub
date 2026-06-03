// Edge Function temporária: fecha as orders POS pendentes na Pagar.me.
// Chama PATCH /orders/{order_id}/closed com status "paid" para cada order.
// Isso marca o pedido como pago na Stone e encerra o fluxo.
//
// Após rodar com sucesso, deletar essa função.

import { createClient } from "npm:@supabase/supabase-js@2";

const PAGARME_BASE_URL = "https://api.pagar.me/core/v5";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const secretKey = Deno.env.get("PAGARME_SECRET_KEY")!;
  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Busca vendas POS do dia 29/05 com pagarme_order_id
  const { data: vendas, error } = await admin
    .from("vendas")
    .select("id, pagarme_order_id")
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
      // Fecha a order na Stone com status "paid"
      const closeRes = await fetch(
        `${PAGARME_BASE_URL}/orders/${venda.pagarme_order_id}/closed`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Basic ${btoa(secretKey + ":")}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ status: "paid" }),
        },
      );
      const closeData = await closeRes.json();

      console.log(
        `[batch-close] order: ${venda.pagarme_order_id} | ok: ${closeRes.ok} | status: ${closeData?.status}`
      );

      // Atualiza venda no Supabase se fechou com sucesso
      if (closeRes.ok) {
        await admin
          .from("vendas")
          .update({
            pagamento_status: "pago",
            status:           "concluida",
            paid_at:          new Date().toISOString(),
            updated_at:       new Date().toISOString(),
          })
          .eq("id", venda.id);
      }

      results.push({
        vendaId:      venda.id,
        orderId:      venda.pagarme_order_id,
        close_ok:     closeRes.ok,
        close_status: closeData?.status ?? null,
        error:        closeRes.ok ? null : (closeData?.message ?? JSON.stringify(closeData)),
      });

    } catch (err) {
      results.push({ vendaId: venda.id, orderId: venda.pagarme_order_id, error: String(err) });
    }

    await new Promise((r) => setTimeout(r, 300));
  }

  const ok     = results.filter((r) => (r as any).close_ok).length;
  const failed = results.filter((r) => !(r as any).close_ok).length;

  return new Response(
    JSON.stringify({ total: results.length, ok, failed, results }, null, 2),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
