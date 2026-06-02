// Cálculos de split Pagar.me v5 (todos os valores em centavos).
//
// Taxas repassadas ao cliente:
//   Pix         → R$ 0,50 fixo
//   Débito      → 0,96% (plataforma) + 3,00% (operação) = 3,96%
//   Crédito     → 0,96% (plataforma) + 3,00% (operação) + 2,50% × parcelas
//                 1×  = 6,46%
//                 2×  = 8,96%
//                 3×  = 11,46%
//                 ...
//                 12× = 33,96%

export const PLATFORM_RATE          = 0.0096; // 0,96% — taxa da plataforma
export const OPERATION_RATE         = 0.03;   // 3,00% — taxa de operação (crédito e débito)
export const INSTALLMENT_RATE       = 0.025;  // 2,50% por parcela
export const PIX_PLATFORM_FEE_CENTS = 50;     // R$ 0,50 fixo para Pix

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
  const totalRate          = PLATFORM_RATE + OPERATION_RATE; // 3,96%
  const feeCents           = passToCustomer ? Math.round(baseAmount * totalRate) : 0;
  const totalAmount        = baseAmount + feeCents;
  const platformAmount     = Math.round(totalAmount * totalRate);
  const sellerAmount       = totalAmount - platformAmount;
  const operationFeeAmount = passToCustomer ? Math.round(baseAmount * OPERATION_RATE) : 0;

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
 * Crédito.
 * Taxa total: 0,96% + 3,00% + (2,50% × parcelas)
 *   1×  → 6,46%  |  6×  → 21,46%
 *   2×  → 8,96%  |  12× → 33,96%
 */
export function calculateCreditSplit(
  baseAmount: number,
  installments: number,
  passToCustomer: boolean,
): SplitResult {
  const inst                  = Math.max(1, Math.floor(installments || 1));
  const installmentRate       = INSTALLMENT_RATE * inst;          // 2,50% × n
  const totalRate             = PLATFORM_RATE + OPERATION_RATE + installmentRate;
  const feeCents              = passToCustomer ? Math.round(baseAmount * totalRate) : 0;
  const totalAmount           = baseAmount + feeCents;
  const platformAmount        = Math.round(totalAmount * totalRate);
  const sellerAmount          = totalAmount - platformAmount;
  const operationFeeAmount    = passToCustomer ? Math.round(baseAmount * OPERATION_RATE) : 0;
  const installmentFeeAmount  = passToCustomer ? Math.round(baseAmount * installmentRate) : 0;

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
/** @deprecated use PLATFORM_RATE */
export const BASE_FEE_RATE = PLATFORM_RATE;
/** @deprecated taxa de operação (antes "Stone MDR") */
export const STONE_MDR_RATE = OPERATION_RATE;

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
  const baseFeeAmount = passToCustomer
    ? Math.round(baseAmount * (PLATFORM_RATE + OPERATION_RATE))
    : 0;
  return {
    ...r,
    baseFeeAmount,
    installmentSurcharge: r.installmentFeeAmount,
    platformRate: r.totalRate,
  };
}
