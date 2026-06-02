import { createClient } from "npm:@supabase/supabase-js@2";

const PAGARME_BASE_URL = "https://api.pagar.me/core/v5";

const PLATFORM_RECIPIENT_ID = "re_cmp709bbxe5y20l9t4pnjpa76";
const LAGOINHA_RECIPIENT_ID = "re_cmpcr534o9me40l9ti0cnqz6e";
const PLATFORM_BASE_RATE    = 0.0096;
const OPERATION_RATE        = 0.03;
const INSTALLMENT_RATE      = 0.025;

const chargeIds = [
  "ch_3kmM7peH9CNDGX1j",
  "ch_KQld24yQhvh60Dxw",
  "ch_pyeDLrEivf5EVGqO",
  "ch_Q60LZxtdotGA9WgE",
  "ch_pW90Jjbcpf9r06lM",
  "ch_LQ2lD6GUdJfZjkaO",
  "ch_bx6NoGAfxxUwbNvX",
  "ch_7ZxlBDIQyFEvLGAe",
];

function buildSplit(amount: number, installments: number) {
  const inst           = Math.max(1, installments);
  const totalRate      = PLATFORM_BASE_RATE + OPERATION_RATE + INSTALLMENT_RATE * inst;
  const platformAmount = Math.round(amount * totalRate);
  const sellerAmount   = amount - platformAmount;
  return [
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
  ];
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
      const chargeRes = await fetch(`${PAGARME_BASE_URL}/charges/${chargeId}`, {
        headers: { Authorization: `Basic ${btoa(secretKey + ":")}` },
      });
      const charge = await chargeRes.json();

      if (charge.status === "paid") {
        results.push({ chargeId, status: "ja_pago", skipped: true });
        continue;
      }
      if (charge.status !== "authorized") {
        results.push({ chargeId, status: charge.status, skipped: true });
        continue;
      }

      const { data: venda } = await admin
        .from("vendas")
        .select("id, base_amount, installments")
        .eq("pagarme_charge_id", chargeId)
        .maybeSingle();

      const amount       = (venda?.base_amount as number | undefined) ?? charge.amount;
      const installments = (venda?.installments as number | undefined) ?? 1;
      const split        = buildSplit(amount, installments);
      const platformAmt  = split[0].amount;
      const sellerAmt    = split[1].amount;

      const captureRes = await fetch(`${PAGARME_BASE_URL}/charges/${chargeId}/capture`, {
        method: "POST",
        headers: {
          Authorization: `Basic ${btoa(secretKey + ":")}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ amount, split }),
      });
      const captureData = await captureRes.json();

      if (captureRes.ok && venda?.id) {
        await admin
          .from("vendas")
          .update({
            pagamento_status:    "pago",
            status:              "concluida",
            paid_at:             new Date().toISOString(),
            updated_at:          new Date().toISOString(),
            platform_amount:     platformAmt,
            seller_amount:       sellerAmt,
            seller_recipient_id: LAGOINHA_RECIPIENT_ID,
            split_rules:         split,
          })
          .eq("id", venda.id);
      }

      results.push({
        chargeId,
        capture_ok:      captureRes.ok,
        capture_status:  captureData.status,
        amount,
        platform_amount: platformAmt,
        seller_amount:   sellerAmt,
        venda_id:        venda?.id ?? null,
        error:           captureRes.ok ? null : captureData?.message,
      });

      await new Promise((r) => setTimeout(r, 300));
    } catch (err) {
      results.push({ chargeId, error: String(err) });
    }
  }

  return new Response(JSON.stringify({ total: results.length, results }, null, 2), {
    headers: { "Content-Type": "application/json" },
  });
});