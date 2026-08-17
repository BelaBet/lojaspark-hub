-- Document the lookup contract for brand-specific credit-card rules.
COMMENT ON TABLE public.payment_fee_rules IS
  'Central payment fee rules. For credit_card, card_brand identifies Elo, Hipercard, Amex, generic, Mastercard or Visa. PIX/Boleto/Debit use card_brand NULL.';
