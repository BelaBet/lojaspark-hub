// Lê as taxas REAIS praticadas pela Pagar.me a partir dos recebíveis (payables)
// do recebedor e das configurações de antecipação do recipient.
// Nada é inventado: tudo vem da API https://api.pagar.me/core/v5
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";

const API = "https://api.pagar.me/core/v5";

type Agg = {
  payment_method: string;
  installments: number;
  count: number;
  amount: number;
  fee: number;
  anticipation_fee: number;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const secretKey = Deno.env.get("PAGARME_SECRET_KEY");
  if (!secretKey) {
    return json({ error: "PAGARME_SECRET_KEY não configurada" }, 500);
  }
  const auth = { Authorization: `Basic ${btoa(secretKey + ":")}` };

  // valida super admin
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) return json({ error: "Não autenticado" }, 401);
  const { data: userData } = await supabase.auth.getUser(token);
  const userId = userData?.user?.id;
  if (!userId) return json({ error: "Não autenticado" }, 401);
  const { data: isSuper } = await supabase.rpc("has_app_role", { _user_id: userId, _role: "super_admin" });
  if (isSuper !== true) return json({ error: "Acesso restrito ao super admin" }, 403);

  let body: any = {};
  try { body = await req.json(); } catch { /* GET */ }
  const apply = body?.apply === true;

  // recipient da loja (para antecipação e taxas de transferência)
  const { data: loja } = await supabase
    .from("lojas")
    .select("id, nome, pagarme_recipient_id")
    .not("pagarme_recipient_id", "is", null)
    .limit(1)
    .maybeSingle();

  let recipient: any = null;
  if (loja?.pagarme_recipient_id) {
    const r = await fetch(`${API}/recipients/${loja.pagarme_recipient_id}`, { headers: auth });
    recipient = await r.json();
  }

  // recebíveis: fonte real das taxas cobradas pela Pagar.me
  const aggs = new Map<string, Agg>();
  let page = 1;
  let total = 0;
  while (page <= 10) {
    const res = await fetch(`${API}/payables?size=100&page=${page}`, { headers: auth });
    if (!res.ok) break;
    const data = await res.json();
    const items: any[] = data?.data ?? [];
    for (const p of items) {
      if (p.type !== "credit") continue;
      const method = String(p.payment_method ?? "unknown");
      const inst = Number(p.installment ?? 1) || 1;
      const key = `${method}:${inst}`;
      const a = aggs.get(key) ?? { payment_method: method, installments: inst, count: 0, amount: 0, fee: 0, anticipation_fee: 0 };
      a.count += 1;
      a.amount += Number(p.amount ?? 0);
      a.fee += Number(p.fee ?? 0);
      a.anticipation_fee += Number(p.anticipation_fee ?? 0);
      aggs.set(key, a);
      total += 1;
    }
    if (items.length < 100) break;
    page += 1;
  }

  const observed = [...aggs.values()]
    .sort((a, b) => a.payment_method.localeCompare(b.payment_method) || a.installments - b.installments)
    .map((a) => ({
      payment_method: a.payment_method,
      installments: a.installments,
      transactions: a.count,
      gross_amount_cents: a.amount,
      fee_cents: a.fee,
      anticipation_fee_cents: a.anticipation_fee,
      effective_percentage_rate: a.amount > 0 ? Number((a.fee / a.amount).toFixed(6)) : 0,
      effective_anticipation_rate: a.amount > 0 ? Number((a.anticipation_fee / a.amount).toFixed(6)) : 0,
      avg_fixed_fee_cents: a.count > 0 ? Math.round(a.fee / a.count) : 0,
    }));

  let applied: any[] = [];
  if (apply && observed.length) {
    for (const o of observed) {
      const method = o.payment_method === "credit_card" ? "credit_card"
        : o.payment_method === "debit_card" ? "debit_card"
        : o.payment_method === "pix" ? "pix"
        : o.payment_method === "boleto" ? "boleto" : null;
      if (!method) continue;
      const isFixed = method === "pix" || method === "boleto";
      const row = {
        acquirer: "pagarme",
        payment_method: method,
        card_brand: method === "credit_card" ? "generic" : null,
        installment_min: method === "credit_card" ? o.installments : 1,
        installment_max: method === "credit_card" ? o.installments : 1,
        percentage_rate: isFixed ? 0 : o.effective_percentage_rate,
        fixed_fee_cents: isFixed ? o.avg_fixed_fee_cents : 0,
        anticipation_rate: o.effective_anticipation_rate,
        pass_to_customer: true,
        active: true,
        description: `Importado da API Pagar.me (${o.transactions} recebíveis)`,
        updated_by: userId,
      };
      const { data: existing } = await supabase
        .from("payment_fee_rules")
        .select("id")
        .eq("acquirer", "pagarme")
        .eq("payment_method", method)
        .eq("installment_min", row.installment_min)
        .eq("installment_max", row.installment_max)
        .maybeSingle();
      const res = existing
        ? await supabase.from("payment_fee_rules").update(row).eq("id", existing.id)
        : await supabase.from("payment_fee_rules").insert(row);
      applied.push({ ...row, error: res.error?.message ?? null });
    }
  }

  return json({
    source: "https://api.pagar.me/core/v5",
    payables_analyzed: total,
    recipient: recipient && !recipient.errors ? {
      id: recipient.id,
      name: recipient.name,
      status: recipient.status,
      automatic_anticipation_settings: recipient.automatic_anticipation_settings ?? null,
      transfer_settings: recipient.transfer_settings ?? null,
    } : recipient?.errors ?? null,
    observed_rates: observed,
    applied,
    note: observed.length === 0
      ? "A API não retornou recebíveis ainda — a Pagar.me não expõe endpoint de tabela de preços, as taxas só aparecem depois que houver transações liquidadas."
      : "Taxas calculadas sobre os recebíveis reais (fee / amount) retornados pela API.",
  }, 200);
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload, null, 2), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
