
ALTER TABLE public.vendas
  ADD COLUMN IF NOT EXISTS base_amount integer,
  ADD COLUMN IF NOT EXISTS platform_amount integer,
  ADD COLUMN IF NOT EXISTS seller_amount integer,
  ADD COLUMN IF NOT EXISTS installments integer,
  ADD COLUMN IF NOT EXISTS seller_recipient_id text;

CREATE INDEX IF NOT EXISTS vendas_seller_recipient_idx ON public.vendas (seller_recipient_id);
