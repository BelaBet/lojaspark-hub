-- Configuração fiscal da loja
ALTER TABLE public.lojas ADD COLUMN IF NOT EXISTS config_fiscal jsonb DEFAULT '{
  "ambiente": "homologacao",
  "regime_tributario": "simples_nacional",
  "csc_token": null,
  "csc_id": null,
  "cert_pfx_url": null,
  "cert_senha": null,
  "serie_nfe": "1",
  "serie_nfce": "1",
  "ultimo_numero_nfe": 0,
  "ultimo_numero_nfce": 0
}'::jsonb;

-- Notas fiscais
CREATE TABLE IF NOT EXISTS public.notas_fiscais (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loja_id uuid NOT NULL REFERENCES public.lojas(id) ON DELETE CASCADE,
  venda_id uuid REFERENCES public.vendas(id),
  tipo text NOT NULL,
  numero integer,
  serie text,
  chave_acesso text,
  status text NOT NULL DEFAULT 'pendente',
  xml_autorizado text,
  danfe_url text,
  protocolo text,
  motivo_rejeicao text,
  ref_focusnfe text,
  emitida_at timestamptz,
  cancelada_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.notas_fiscais ENABLE ROW LEVEL SECURITY;

-- Validação de tipo e status via trigger (mantém flexibilidade sem CHECK imutável)
CREATE OR REPLACE FUNCTION public.validar_nota_fiscal()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.tipo NOT IN ('nfe','nfce') THEN
    RAISE EXCEPTION 'tipo inválido: %', NEW.tipo;
  END IF;
  IF NEW.status NOT IN ('pendente','autorizada','cancelada','rejeitada','processando') THEN
    RAISE EXCEPTION 'status inválido: %', NEW.status;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validar_nota_fiscal ON public.notas_fiscais;
CREATE TRIGGER trg_validar_nota_fiscal
BEFORE INSERT OR UPDATE ON public.notas_fiscais
FOR EACH ROW EXECUTE FUNCTION public.validar_nota_fiscal();

-- RLS policies
DROP POLICY IF EXISTS notas_fiscais_select ON public.notas_fiscais;
DROP POLICY IF EXISTS notas_fiscais_insert ON public.notas_fiscais;
DROP POLICY IF EXISTS notas_fiscais_update ON public.notas_fiscais;
DROP POLICY IF EXISTS notas_fiscais_delete ON public.notas_fiscais;

CREATE POLICY notas_fiscais_select ON public.notas_fiscais
  FOR SELECT TO authenticated
  USING (loja_id = public.get_loja_id());

CREATE POLICY notas_fiscais_insert ON public.notas_fiscais
  FOR INSERT TO authenticated
  WITH CHECK (loja_id = public.get_loja_id());

CREATE POLICY notas_fiscais_update ON public.notas_fiscais
  FOR UPDATE TO authenticated
  USING (loja_id = public.get_loja_id())
  WITH CHECK (loja_id = public.get_loja_id());

CREATE POLICY notas_fiscais_delete ON public.notas_fiscais
  FOR DELETE TO authenticated
  USING (loja_id = public.get_loja_id() AND public.has_loja_role('admin'));

CREATE INDEX IF NOT EXISTS idx_notas_fiscais_loja ON public.notas_fiscais(loja_id);
CREATE INDEX IF NOT EXISTS idx_notas_fiscais_venda ON public.notas_fiscais(venda_id);
CREATE INDEX IF NOT EXISTS idx_notas_fiscais_status ON public.notas_fiscais(status);

-- Campos fiscais nos produtos
ALTER TABLE public.produtos
  ADD COLUMN IF NOT EXISTS cfop text DEFAULT '5102',
  ADD COLUMN IF NOT EXISTS cst_icms text,
  ADD COLUMN IF NOT EXISTS aliquota_icms numeric(5,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cst_pis text DEFAULT '07',
  ADD COLUMN IF NOT EXISTS cst_cofins text DEFAULT '07',
  ADD COLUMN IF NOT EXISTS unidade_medida text DEFAULT 'UN';