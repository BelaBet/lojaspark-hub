// Roda check-pos-order-status em lote para todas as vendas POS pendentes
// (filtra por dia/loja via query params opcionais).
// Query params:
//   from=YYYY-MM-DD  (default: 2026-05-29)
//   to=YYYY-MM-DD    (default: 2026-05-29)
//   loja_id=<uuid>   (opcional)
import { createClient } from "npm:@supabase/supabase-js@2";

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const from = url.searchParams.get("from") ?? "2026-05-29";
  const to = url.searchParams.get("to") ?? from;
  const lojaId = url.searchParams.get("loja_id");

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

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

  const results: unknown[] = [];
  for (const venda of vendas) {
    try {
      const res = await fetch(
        `${Deno.env.get("SUPABASE_URL")}/functions/v1/check-pos-order-status`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
          },
          body: JSON.stringify({ venda_id: venda.id }),
        },
      );
      const data = await res.json();
      results.push({ venda_id: venda.id, http: res.status, ...data });
    } catch (err) {
      results.push({ venda_id: venda.id, error: String(err) });
    }
    await new Promise((r) => setTimeout(r, 300));
  }

  return new Response(JSON.stringify({ total: results.length, results }, null, 2), {
    headers: { "Content-Type": "application/json" },
  });
});