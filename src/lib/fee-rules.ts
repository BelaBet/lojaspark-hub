import { supabase } from "@/integrations/supabase/client";
import { feeRatesFromRules, setFeeRates, type FeeRates } from "@/lib/pagarme-split";

/**
 * Carrega as taxas cadastradas pelo Super Admin (/admin/taxas) e aplica
 * nos cálculos de split do app. Fallback silencioso para as taxas padrão.
 */
export async function loadFeeRatesFromDb(acquirer = "pagarme"): Promise<FeeRates | null> {
  const { data, error } = await supabase
    .from("payment_fee_rules")
    .select("payment_method, installment_min, installment_max, percentage_rate, fixed_fee_cents, anticipation_rate, active")
    .eq("acquirer", acquirer)
    .eq("active", true);
  if (error || !data?.length) return null;
  const rates = feeRatesFromRules(data as never);
  setFeeRates(rates);
  return rates;
}
