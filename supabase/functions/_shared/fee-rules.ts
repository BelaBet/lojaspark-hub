// Taxas de pagamento controladas pelo Super Admin (tabela public.payment_fee_rules).
// Nenhuma taxa deve ser fixada em código: os valores abaixo são apenas fallback
// caso o banco esteja indisponível ou sem regras cadastradas.
import { createClient } from "npm:@supabase/supabase-js@2";

export type FeeRates = {
  pixFixedCents: number;
  debit: number;
  credit1x: number;
  creditNx: number;
  anticipation: number;
};

export const DEFAULT_FEE_RATES: FeeRates = {
  pixFixedCents: 90,
  debit: 0.0098,
  credit1x: 0.0125,
  creditNx: 0.0135,
  anticipation: 0.011,
};

export async function loadFeeRates(acquirer = "pagarme"): Promise<FeeRates> {
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data, error } = await supabase
      .from("payment_fee_rules")
      .select("payment_method, installment_min, installment_max, percentage_rate, fixed_fee_cents, anticipation_rate, active")
      .eq("acquirer", acquirer)
      .eq("active", true);
    if (error || !data?.length) {
      if (error) console.error("[fee-rules] erro ao carregar taxas:", error.message);
      return { ...DEFAULT_FEE_RATES };
    }
    const rates = { ...DEFAULT_FEE_RATES };
    for (const r of data as any[]) {
      const pct = Number(r.percentage_rate) || 0;
      const ant = Number(r.anticipation_rate) || 0;
      if (r.payment_method === "pix") {
        rates.pixFixedCents = Number(r.fixed_fee_cents) || 0;
      } else if (r.payment_method === "debit_card") {
        rates.debit = pct;
      } else if (Number(r.installment_min) <= 1 && Number(r.installment_max) <= 1) {
        rates.credit1x = pct;
        rates.anticipation = ant;
      } else {
        rates.creditNx = pct;
        rates.anticipation = ant;
      }
    }
    console.log("[fee-rules] taxas carregadas do banco:", JSON.stringify(rates));
    return rates;
  } catch (e) {
    console.error("[fee-rules] fallback para taxas padrão:", e);
    return { ...DEFAULT_FEE_RATES };
  }
}
