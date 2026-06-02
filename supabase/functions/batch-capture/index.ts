// Edge Function temporária: captura as charges POS pendentes com split correto.
// Consulta cada charge na Pagar.me para pegar amount e installments reais,
// calcula o split com as taxas vigentes e executa a captura.
//
// Após rodar com sucesso, pode deletar essa função.

import { createClient } from "npm:@supabase/supabase-js@2";

const PAGARME_BASE_URL            = "https://api.pagar.me/core/v5";
const PLATFORM_RATE_CREDIT_AVISTA = 0.0125; // 1,25% crédito 1×
const PLATFORM_RATE_CREDIT_PARC   = 0.0135; // 1,35% crédito 2×+
const ANTICIPATION_RATE           = 0.011;  // 1,10% antecipação
const PLATFORM_RECIPIENT_ID       = "re_cmp709bbxe5y20l9t4pnjpa76";
const LAGOINHA_RECIPIENT_ID       = "re_cmpcr534o9me40l9ti0cnqz6e";

// 9 charges pendentes da Lagoinha
// POST https://api.pagar.me/core/v5/charges/ch_3kmM7peH9CNDGX1j/capture
// POST https://api.pagar.me/core/v5/charges/ch_KQld24yQhvh60Dxw/capture
// POST https://api.pagar.me/core/v5/charges/ch_7ZxlBDIQyFEvLGAe/capture
// POST https://api.pagar.me/core/v5/charges/ch_qg7VD3LUJ9H5w0wl/capture
// POST https://api.pagar.me/core/v5/charges/ch_pyeDLrEivf5EVGqO/capture
// POST https://api.pagar.me/core/v5/charges/ch_bx6NoGAfxxUwbNvX/capture
// POST https://api.pagar.me/core/v5/charges/ch_LQ2lD6GUdJfZjkaO/capture
// POST https://api.pagar.me/core/v5/charges/ch_Q60LZxtdotGA9WgE/capture
// POST https://api.pagar.me/core/v5/charges/ch_pW90Jjbcpf9r06lM/capture
const chargeIds = [
  "ch_3kmM7peH9CNDGX1j",
  "ch_KQld24yQhvh60Dxw",
  "ch_7ZxlBDIQyFEvLGAe",
  "ch_qg7VD3LUJ9H5w0wl",
  "ch_pyeDLrEivf5EVGqO",
  "ch_bx6NoGAfxxUwbNvX",
  "ch_LQ2lD6GUdJfZjkaO",
  "ch_Q60LZxtdotGA9WgE",
  "ch_pW90Jjbcpf9r06lM",
];

function calcSplit(amount: number, installments: number, anticipation: boolean) {
  const inst      = Math.max(1, installments);
  const baseRate  = inst === 1 ? PLATFORM_RATE_CREDIT_AVISTA : PLATFORM_RATE_CREDIT_PARC;
  const totalRate = baseRate + (anticipation ? ANTICIPATION_RATE : 0);
  const platformAmount = Math.round(amount * totalRate);
  const sellerAmount   = amount - platformAmount;
  return {
    platformAmount,
    sellerAmount,
    rules: [
      {
        recipient_id: PLATFORM_RECIPIENT_ID,
        amount: platformAmount,
        type: "flat",
        options: { charge_processing_fee: false, charge_remainder_fee: false, liable: false },
      },
      {
        recipient_id: LAGOINHA_RECIPIENT_ID,
        amount: sellerAmount,
        type: "flat",
        options: { charge_processing_fee: true, charge_remainder_fee: true, liable: true },
      },
    ],
  };
}

Deno.serve(async () => {
  const secretKey = Deno.env.get("PAGARME_SECRET_KEY")!;
  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const results = [];

  for (const chargeId of chargeIds) {
    try {
      // 1. Consulta charge na Pagar.me — pega amount e installments reais
      const chargeRes = await fetch(`${PAGARME_BASE_URL}/charges/${chargeId}`, {
        headers: { Authorization: `Basic ${btoa(secretKey + ":")}` },
      });
      const charge = await chargeRes.json();

      if (charge.status === "paid") {
        results.push({ chargeId, skipped: true, reason: "ja_pago" });
        continue;
      }
      if (charge.status !== "authorized") {
        results.push({ chargeId, skipped: true, reason: `status_${charge.status ?? "desconhecido"}` });
        continue;
      }

      const amount       = charge.amount as number;
      const installments = (charge.last_transaction?.installments as number | undefined) ?? 1;

      // 2. Busca anticipation na venda (best-effort — default false)
      const { data: venda } = await admin
        .from("vendas")
        .select("id, anticipation")
        .eq("pagarme_charge_id", chargeId)
        .maybeSingle();
      const anticipation = (venda?.anticipation as boolean | null) ?? false;

      // 3. Calcula split com taxas vigentes
      const { platformAmount, sellerAmount, rules } = calcSplit(amount, installments, anticipation);

      console.log(`[batch-capture] chargeId: ${chargeId} | amount da Pagar.me: ${amount} | installments: ${installments} | split plataforma: ${platformAmount} | split Lagoinha: ${sellerAmount} | soma: ${platformAmount + sellerAmount}`);

      // Validação: a soma dos splits deve ser igual ao amount da Pagar.me
      if (platformAmount + sellerAmount !== amount) {
        throw new Error(
          `Divergência de split: amount=${amount}, plataforma=${platformAmount}, Lagoinha=${sellerAmount}, soma=${platformAmount + sellerAmount}`
        );
      }

      // 4. Executa captura com split
      const captureRes = await fetch(`${PAGARME_BASE_URL}/charges/${chargeId}/capture`, {
        method: "POST",
        headers: {
          Authorization: `Basic ${btoa(secretKey + ":")}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ amount, split: rules }),
      });
      const captureData = await captureRes.json();

      // 5. Atualiza venda no Supabase
      if (captureRes.ok) {
        const updatePayload: Record<string, unknown> = {
          pagamento_status:    "pago",
          status:              "concluida",
          paid_at:             new Date().toISOString(),
          updated_at:          new Date().toISOString(),
          platform_amount:     platformAmount,
          seller_amount:       sellerAmount,
          seller_recipient_id: LAGOINHA_RECIPIENT_ID,
          split_rules:         rules,
        };
        if (venda?.id) {
          await admin.from("vendas").update(updatePayload).eq("id", venda.id);
        } else {
          // Tenta pelo charge_id caso venda não tenha sido encontrada acima
          await admin.from("vendas").update(updatePayload).eq("pagarme_charge_id", chargeId);
        }
      }

      results.push({
        chargeId,
        capture_ok:      captureRes.ok,
        capture_status:  captureData?.status ?? null,
        amount,
        installments,
        anticipation,
        platform_amount: platformAmount,
        seller_amount:   sellerAmount,
        venda_id:        venda?.id ?? null,
        error:           captureRes.ok ? null : (captureData?.message ?? JSON.stringify(captureData)),
      });

    } catch (err) {
      results.push({ chargeId, error: String(err) });
    }

    // Pausa entre capturas para não sobrecarregar a Pagar.me
    await new Promise((r) => setTimeout(r, 400));
  }

  const ok      = results.filter((r) => r.capture_ok).length;
  const skipped = results.filter((r) => r.skipped).length;
  const failed  = results.filter((r) => !r.capture_ok && !r.skipped).length;

  return new Response(
    JSON.stringify({ total: results.length, ok, skipped, failed, results }, null, 2),
    { headers: { "Content-Type": "application/json" } },
  );
});
