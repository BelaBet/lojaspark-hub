ALTER TABLE public.payment_fee_rules
  ADD COLUMN IF NOT EXISTS card_brand text;

ALTER TABLE public.payment_fee_rules
  DROP CONSTRAINT IF EXISTS payment_fee_rules_card_brand_check;

ALTER TABLE public.payment_fee_rules
  ADD CONSTRAINT payment_fee_rules_card_brand_check
  CHECK (card_brand IS NULL OR card_brand IN ('visa','mastercard','elo','amex','hipercard','generic'));

UPDATE public.payment_fee_rules
  SET card_brand = 'generic'
  WHERE payment_method = 'credit_card' AND card_brand IS NULL;