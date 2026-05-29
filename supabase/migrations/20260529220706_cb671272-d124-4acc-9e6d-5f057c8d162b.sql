ALTER TABLE public.vendas
  ADD COLUMN IF NOT EXISTS vendedor_nome text,
  ADD COLUMN IF NOT EXISTS recibo_url text;