// Cálculos de split Pagar.me v5 (todos os valores em centavos).
//
// Taxas repassadas ao cliente (antecipação SEMPRE ligada):
//   Pix              → R$ 0,90 fixo
//   Débito           → 0,98%
//   Crédito 1× (30d) → 1,25% + 1,10% antecipação = 2,35%
//   Crédito 2×–12×   → 1,35% + 1,10% antecipação = 2,45% (flat)

export const PIX_PLATFORM_FEE_CENTS = 90;     // R$ 0,90 fixo para Pix
export const DEBIT_RATE             = 0.0098; // 0,98%
export const CREDIT_1X_BASE_RATE    = 0.0125; // 1,25% à vista 30d
export const CREDIT_N_BASE_RATE     = 0.0135; // 1,35% parcelado
export const ANTICIPATION_RATE      = 0.011;  // 1,10% antecipação (flat)

// Aliases legados (para imports antigos não quebrarem)
export const PLATFORM_RATE    = 0;
export const OPERATION_RATE   = 0;
export const INSTALLMENT_RATE = 0;

export type SplitResult = {
  totalAmount: number;
  platformAmount: number;
  sellerAmount: number;
  operationFeeAmount: number;
  installmentFeeAmount: number;
  totalRate: number;
};

export type PixSplitResult = {
  totalAmount: number;    // baseAmount + 50
  platformAmount: number; // 50
  sellerAmount: number;   // baseAmount
};

/**
 * Débito (sempre 1×).
 * Taxa total: 0,96% + 3,00% = 3,96%
 */
export function calculateDebitSplit(
  baseAmount: number,
  passToCustomer: boolean,
): SplitResult {
  const totalRate          = DEBIT_RATE;
  const feeCents           = passToCustomer ? Math.round(baseAmount * totalRate) : 0;
  const totalAmount        = baseAmount + feeCents;
  const platformAmount     = Math.round(totalAmount * totalRate);
  const sellerAmount       = totalAmount - platformAmount;
  const operationFeeAmount = feeCents;

  return {
    totalAmount,
    platformAmount,
    sellerAmount,
    operationFeeAmount,
    installmentFeeAmount: 0,
    totalRate,
  };
}

/**
 * Crédito (antecipação sempre ligada).
 *   1×  (à vista 30d) → 1,25% + 1,10% = 2,35%
 *   ≥2× (parcelado)   → 1,35% + 1,10% = 2,45% (flat)
 */
export function calculateCreditSplit(
  baseAmount: number,
  installments: number,
  passToCustomer: boolean,
): SplitResult {
  const inst                  = Math.max(1, Math.floor(installments || 1));
  const baseRate              = inst === 1 ? CREDIT_1X_BASE_RATE : CREDIT_N_BASE_RATE;
  const totalRate             = baseRate + ANTICIPATION_RATE;
  const feeCents              = passToCustomer ? Math.round(baseAmount * totalRate) : 0;
  const totalAmount           = baseAmount + feeCents;
  const platformAmount        = Math.round(totalAmount * totalRate);
  const sellerAmount          = totalAmount - platformAmount;
  const operationFeeAmount    = passToCustomer ? Math.round(baseAmount * baseRate) : 0;
  const installmentFeeAmount  = passToCustomer ? Math.round(baseAmount * ANTICIPATION_RATE) : 0;

  return {
    totalAmount,
    platformAmount,
    sellerAmount,
    operationFeeAmount,
    installmentFeeAmount,
    totalRate,
  };
}

/**
 * Pix — R$ 0,50 fixo repassado ao cliente.
 * totalAmount = baseAmount + 50
 */
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
): InstallmentRow[] {
  const rows: InstallmentRow[] = [];
  for (let n = 1; n <= maxInstallments; n++) {
    const split = calculateCreditSplit(baseAmount, n, true);
    const perInstallment = Math.round(split.totalAmount / n);
    rows.push({
      installments: n,
      label:
        n === 1
          ? `1× ${formatBRL(split.totalAmount)} (c/ taxas)`
          : `${n}× ${formatBRL(perInstallment)} (total ${formatBRL(split.totalAmount)})`,
      perInstallment,
      totalAmount:  split.totalAmount,
      feeAmount:    split.operationFeeAmount + split.installmentFeeAmount,
      totalRate:    split.totalRate,
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

// ─── Backward-compat aliases (consumidores antigos) ───────────────────────────
/** @deprecated taxa base do crédito 1× */
export const BASE_FEE_RATE = CREDIT_1X_BASE_RATE;
/** @deprecated taxa de antecipação */
export const STONE_MDR_RATE = ANTICIPATION_RATE;

/**
 * Alias retro-compatível. Antes era usado tanto para crédito quanto débito.
 * - installments > 1 → crédito parcelado
 * - installments = 1 → crédito 1× (mesmas taxas que antes)
 * Retorna o shape antigo com `baseFeeAmount`, `installmentSurcharge` e `platformRate`.
 */
export function calculateSplit(
  baseAmount: number,
  installments: number,
  passToCustomer: boolean,
) {
  const r = calculateCreditSplit(baseAmount, installments, passToCustomer);
  const inst = Math.max(1, Math.floor(installments || 1));
  const baseRate = inst === 1 ? CREDIT_1X_BASE_RATE : CREDIT_N_BASE_RATE;
  const baseFeeAmount = passToCustomer ? Math.round(baseAmount * baseRate) : 0;
  return {
    ...r,
    baseFeeAmount,
    installmentSurcharge: r.installmentFeeAmount,
    platformRate: r.totalRate,
  };
}
