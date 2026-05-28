ALTER TABLE public.vendas ADD COLUMN IF NOT EXISTS pagarme_order_id TEXT;
CREATE INDEX IF NOT EXISTS idx_vendas_pagarme_order_id ON public.vendas(pagarme_order_id);