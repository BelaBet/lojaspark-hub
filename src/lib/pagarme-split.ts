// Cálculos de split Pagar.me v5 (todos os valores em centavos).
export const PLATFORM_BASE_RATE = 0.0096; // 0,96%
export const INSTALLMENT_RATE = 0.011; // 1,10% por parcela adicional (a partir da 2ª)
export const STONE_MDR_RATE = 0.0204; // 2,04% deduzido do lojista pela Stone (apenas exibição)

export type SplitResult = {
  totalAmount: number;
  platformAmount: number;
  sellerAmount: number;
  installmentSurcharge: number;
  platformRate: number;
};

export function calculateSplit(
  baseAmount: number,
  installments: number,
  passToCustomer: boolean,
): SplitResult {
  const surchargeRate =
    installments > 1 ? INSTALLMENT_RATE * (installments - 1) : 0;
  const platformRate = PLATFORM_BASE_RATE + surchargeRate;

  const installmentSurcharge =
    installments > 1 ? Math.round(baseAmount * surchargeRate) : 0;

  const totalAmount =
    passToCustomer && installments > 1
      ? baseAmount + installmentSurcharge
      : baseAmount;

  const platformAmount = Math.round(totalAmount * platformRate);
  const sellerAmount = totalAmount - platformAmount;

  return {
    totalAmount,
    platformAmount,
    sellerAmount,
    installmentSurcharge,
    platformRate,
  };
}

export type InstallmentRow = {
  installments: number;
  label: string;
  perInstallment: number;
  totalAmount: number;
  surchargeAmount: number;
};

export function getInstallmentTable(
  baseAmount: number,
  maxInstallments = 12,
): InstallmentRow[] {
  const rows: InstallmentRow[] = [];
  for (let n = 1; n <= maxInstallments; n++) {
    const split = calculateSplit(baseAmount, n, true);
    const perInstallment = Math.round(split.totalAmount / n);
    rows.push({
      installments: n,
      label:
        n === 1
          ? `1× ${formatBRL(split.totalAmount)} à vista`
          : `${n}× ${formatBRL(perInstallment)} (total ${formatBRL(split.totalAmount)})`,
      perInstallment,
      totalAmount: split.totalAmount,
      surchargeAmount: split.installmentSurcharge,
    });
  }
  return rows;
}

export function formatBRL(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}