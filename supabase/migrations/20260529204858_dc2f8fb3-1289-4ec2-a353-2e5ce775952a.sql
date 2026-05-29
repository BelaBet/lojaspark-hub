-- ─── Tabela maquininhas (por loja, com RLS) ─────────────────────────────────
CREATE TABLE IF NOT EXISTS public.maquininhas (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loja_id          uuid NOT NULL,
  nome             text NOT NULL,
  serial           text NOT NULL,
  localizacao      text,
  ativo            boolean NOT NULL DEFAULT true,
  ultima_atividade timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (loja_id, serial)
);

CREATE INDEX IF NOT EXISTS idx_maquininhas_loja   ON public.maquininhas(loja_id);
CREATE INDEX IF NOT EXISTS idx_maquininhas_serial ON public.maquininhas(serial);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.maquininhas TO authenticated;
GRANT ALL ON public.maquininhas TO service_role;

ALTER TABLE public.maquininhas ENABLE ROW LEVEL SECURITY;

CREATE POLICY maquininhas_select ON public.maquininhas
  FOR SELECT TO authenticated
  USING (loja_id = public.get_loja_id());

CREATE POLICY maquininhas_admin_insert ON public.maquininhas
  FOR INSERT TO authenticated
  WITH CHECK (loja_id = public.get_loja_id() AND public.has_loja_role(loja_id, 'admin'));

CREATE POLICY maquininhas_admin_update ON public.maquininhas
  FOR UPDATE TO authenticated
  USING (loja_id = public.get_loja_id() AND public.has_loja_role(loja_id, 'admin'))
  WITH CHECK (loja_id = public.get_loja_id() AND public.has_loja_role(loja_id, 'admin'));

CREATE POLICY maquininhas_admin_delete ON public.maquininhas
  FOR DELETE TO authenticated
  USING (loja_id = public.get_loja_id() AND public.has_loja_role(loja_id, 'admin'));

CREATE TRIGGER maquininhas_set_updated_at
  BEFORE UPDATE ON public.maquininhas
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── Colunas extras em vendas (para fluxo POS / Connect) ────────────────────
ALTER TABLE public.vendas
  ADD COLUMN IF NOT EXISTS device_serial      text,
  ADD COLUMN IF NOT EXISTS payment_channel    text,        -- 'online' | 'pos'
  ADD COLUMN IF NOT EXISTS pagarme_charge_id  text,
  ADD COLUMN IF NOT EXISTS paid_at            timestamptz,
  ADD COLUMN IF NOT EXISTS split_rules        jsonb;

CREATE INDEX IF NOT EXISTS idx_vendas_device_serial    ON public.vendas(device_serial);
CREATE INDEX IF NOT EXISTS idx_vendas_pagarme_order    ON public.vendas(pagarme_order_id);
CREATE INDEX IF NOT EXISTS idx_vendas_pagarme_charge   ON public.vendas(pagarme_charge_id);