-- Allow payment fees to vary by card brand.
ALTER TABLE public.payment_fee_rules
  ADD COLUMN IF NOT EXISTS card_brand text;

ALTER TABLE public.payment_fee_rules
  DROP CONSTRAINT IF EXISTS payment_fee_rules_card_brand_check;

ALTER TABLE public.payment_fee_rules
  ADD CONSTRAINT payment_fee_rules_card_brand_check
  CHECK (
    card_brand IS NULL
    OR card_brand IN ('elo', 'hipercard', 'amex', 'generic', 'mastercard', 'visa')
  );

COMMENT ON COLUMN public.payment_fee_rules.card_brand IS
  'Card brand for credit/debit card rules. NULL for PIX/Boleto and other non-brand-specific methods.';

CREATE INDEX IF NOT EXISTS payment_fee_rules_method_brand_idx
  ON public.payment_fee_rules (acquirer, payment_method, card_brand, installment_min, installment_max);
