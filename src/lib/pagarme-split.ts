// Cálculos de split Pagar.me v5 (todos os valores em centavos).
export const PLATFORM_BASE_RATE = 0.0096; // 0,96%
export const INSTALLMENT_RATE = 0.011; // 1,10% por parcela adicional (a partir da 2ª)
export const STONE_MDR_RATE = 0.0204; // 2,04% MDR Stone
// Soma fixa repassada ao cliente em toda venda (plataforma + MDR Stone)
export const BASE_FEE_RATE = PLATFORM_BASE_RATE + STONE_MDR_RATE; // 3,00%

export type SplitResult = {
  totalAmount: number;
  platformAmount: number;
  sellerAmount: number;
  baseFeeAmount: number;
  installmentSurcharge: number;
  platformRate: number;
};

export function calculateSplit(
  baseAmount: number,
  installments: number,
  passToCustomer: boolean,
): SplitResult {
  const installmentRate =
    installments > 1 ? INSTALLMENT_RATE * (installments - 1) : 0;
  const platformRate = PLATFORM_BASE_RATE + installmentRate;

  // Taxas repassadas ao cliente (aditivo simples sobre o baseAmount):
  //   - plataforma + MDR Stone em toda venda
  //   - acréscimo de parcelamento a partir da 2ª parcela (crédito)
  const baseFeeAmount = passToCustomer ? Math.round(baseAmount * BASE_FEE_RATE) : 0;
  const installmentSurcharge = passToCustomer && installments > 1
    ? Math.round(baseAmount * installmentRate)
    : 0;

  const totalAmount = baseAmount + baseFeeAmount + installmentSurcharge;

  const platformAmount = Math.round(totalAmount * platformRate);
  const sellerAmount = totalAmount - platformAmount;

  return {
    totalAmount,
    platformAmount,
    sellerAmount,
    baseFeeAmount,
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
          ? `1× ${formatBRL(split.totalAmount)} (c/ taxas)`
          : `${n}× ${formatBRL(perInstallment)} (total ${formatBRL(split.totalAmount)})`,
      perInstallment,
      totalAmount: split.totalAmount,
      surchargeAmount: split.baseFeeAmount + split.installmentSurcharge,
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