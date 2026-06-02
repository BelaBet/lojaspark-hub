// Cálculos de split Pagar.me v5 (todos os valores em centavos).
//
// Taxas repassadas ao cliente:
//   Pix              → R$ 0,90 fixo
//   Débito           → 0,98%
//   Crédito 1×       → 1,25% (+ 1,10% se antecipação)
//   Crédito 2×+      → 1,35% (+ 1,10% se antecipação)

export const PLATFORM_RATE_DEBIT         = 0.0098;
export const PLATFORM_RATE_CREDIT_AVISTA = 0.0125;
export const PLATFORM_RATE_CREDIT_PARC   = 0.0135;
export const ANTICIPATION_RATE           = 0.011;
export const PIX_PLATFORM_FEE_CENTS      = 90;

export type SplitResult = {
  totalAmount: number;
  platformAmount: number;
  sellerAmount: number;
  totalRate: number;
  anticipationApplied: boolean;
};

export type PixSplitResult = {
  totalAmount: number;
  platformAmount: number;
  sellerAmount: number;
};

/** Débito (sempre 1×, sem antecipação). Taxa: 0,98% */
export function calculateDebitSplit(
  baseAmount: number,
  passToCustomer: boolean,
): SplitResult {
  const totalRate      = PLATFORM_RATE_DEBIT;
  const feeCents       = passToCustomer ? Math.round(baseAmount * totalRate) : 0;
  const totalAmount    = baseAmount + feeCents;
  const platformAmount = Math.round(totalAmount * totalRate);
  const sellerAmount   = totalAmount - platformAmount;
  return { totalAmount, platformAmount, sellerAmount, totalRate, anticipationApplied: false };
}

/** Crédito. 1× → 1,25% (+1,10% se antecipação) | 2×+ → 1,35% (+1,10% se antecipação) */
export function calculateCreditSplit(
  baseAmount: number,
  installments: number,
  passToCustomer: boolean,
  anticipation = false,
): SplitResult {
  const inst         = Math.max(1, Math.floor(installments || 1));
  const baseRate     = inst === 1 ? PLATFORM_RATE_CREDIT_AVISTA : PLATFORM_RATE_CREDIT_PARC;
  const totalRate    = baseRate + (anticipation ? ANTICIPATION_RATE : 0);
  const feeCents     = passToCustomer ? Math.round(baseAmount * totalRate) : 0;
  const totalAmount  = baseAmount + feeCents;
  const platformAmount = Math.round(totalAmount * totalRate);
  const sellerAmount   = totalAmount - platformAmount;
  return { totalAmount, platformAmount, sellerAmount, totalRate, anticipationApplied: anticipation };
}

/** Pix — R$ 0,90 fixo repassado ao cliente. */
export function calculatePixSplit(baseAmount: number): PixSplitResult {
  return {
    totalAmount:    baseAmount + PIX_PLATFORM_FEE_CENTS,
    platformAmount: PIX_PLATFORM_FEE_CENTS,
    sellerAmount:   baseAmount,
  };
}

export type InstallmentRow = {
  installments: number;
  label: string;
  perInstallment: number;
  totalAmount: number;
  feeAmount: number;
  totalRate: number;
};

export function getInstallmentTable(
  baseAmount: number,
  maxInstallments = 12,
  anticipation = false,
): InstallmentRow[] {
  const rows: InstallmentRow[] = [];
  for (let n = 1; n <= maxInstallments; n++) {
    const split = calculateCreditSplit(baseAmount, n, true, anticipation);
    const perInstallment = Math.round(split.totalAmount / n);
    rows.push({
      installments:  n,
      label:
        n === 1
          ? `1× ${formatBRL(split.totalAmount)} (c/ taxas)`
          : `${n}× ${formatBRL(perInstallment)} (total ${formatBRL(split.totalAmount)})`,
      perInstallment,
      totalAmount: split.totalAmount,
      feeAmount:   split.totalAmount - baseAmount,
      totalRate:   split.totalRate,
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

// ─── Backward-compat shims (consumidores antigos) ────────────────────────────
/** @deprecated use PLATFORM_RATE_CREDIT_AVISTA */
export const CREDIT_1X_BASE_RATE = PLATFORM_RATE_CREDIT_AVISTA;
/** @deprecated use PLATFORM_RATE_CREDIT_PARC */
export const CREDIT_N_BASE_RATE  = PLATFORM_RATE_CREDIT_PARC;
/** @deprecated antiga taxa única; agora 0 */
export const PLATFORM_RATE    = 0;
/** @deprecated antiga taxa de operação; agora 0 */
export const OPERATION_RATE   = 0;
/** @deprecated antiga taxa por parcela; agora 0 */
export const INSTALLMENT_RATE = 0;
/** @deprecated use PLATFORM_RATE_CREDIT_AVISTA */
export const BASE_FEE_RATE  = PLATFORM_RATE_CREDIT_AVISTA;
/** @deprecated use ANTICIPATION_RATE */
export const STONE_MDR_RATE = ANTICIPATION_RATE;

/**
 * @deprecated use calculateCreditSplit/calculateDebitSplit/calculatePixSplit.
 * Mantido para consumidores antigos (PDV/Checkout). Trata como crédito.
 */
export function calculateSplit(
  baseAmount: number,
  installments: number,
  passToCustomer: boolean,
  anticipation = false,
) {
  const r = calculateCreditSplit(baseAmount, installments, passToCustomer, anticipation);
  const inst = Math.max(1, Math.floor(installments || 1));
  const baseRate = inst === 1 ? PLATFORM_RATE_CREDIT_AVISTA : PLATFORM_RATE_CREDIT_PARC;
  const baseFeeAmount       = passToCustomer ? Math.round(baseAmount * baseRate) : 0;
  const installmentSurcharge = passToCustomer && anticipation
    ? Math.round(baseAmount * ANTICIPATION_RATE)
    : 0;
  return {
    ...r,
    baseFeeAmount,
    installmentSurcharge,
    platformRate: r.totalRate,
    operationFeeAmount:  baseFeeAmount,
    installmentFeeAmount: installmentSurcharge,
  };
}
