-- 1) Deterministic get_loja_id (oldest membership wins)
CREATE OR REPLACE FUNCTION public.get_loja_id()
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT loja_id
  FROM public.loja_usuarios
  WHERE user_id = auth.uid()
  ORDER BY created_at ASC, loja_id ASC
  LIMIT 1
$$;

-- 2) Add loja-scoped overload of has_loja_role; keep old signature backward-compatible
--    by making it delegate to the new one using get_loja_id().
CREATE OR REPLACE FUNCTION public.has_loja_role(_loja_id uuid, _role text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.loja_usuarios
    WHERE user_id = auth.uid()
      AND loja_id = _loja_id
      AND role = _role
  );
$$;

CREATE OR REPLACE FUNCTION public.has_loja_role(_role text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT public.has_loja_role(public.get_loja_id(), _role);
$$;

-- 3) Split fiscal credentials into an admin-only table
CREATE TABLE IF NOT EXISTS public.lojas_config_fiscal (
  loja_id uuid PRIMARY KEY,
  ambiente text NOT NULL DEFAULT 'homologacao',
  regime_tributario text NOT NULL DEFAULT 'simples_nacional',
  serie_nfe text NOT NULL DEFAULT '1',
  serie_nfce text NOT NULL DEFAULT '1',
  ultimo_numero_nfe integer NOT NULL DEFAULT 0,
  ultimo_numero_nfce integer NOT NULL DEFAULT 0,
  csc_id text,
  csc_token text,
  cert_pfx_url text,
  cert_senha text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Backfill from existing JSONB column
INSERT INTO public.lojas_config_fiscal (
  loja_id, ambiente, regime_tributario, serie_nfe, serie_nfce,
  ultimo_numero_nfe, ultimo_numero_nfce, csc_id, csc_token,
  cert_pfx_url, cert_senha
)
SELECT
  l.id,
  COALESCE(l.config_fiscal->>'ambiente', 'homologacao'),
  COALESCE(l.config_fiscal->>'regime_tributario', 'simples_nacional'),
  COALESCE(l.config_fiscal->>'serie_nfe', '1'),
  COALESCE(l.config_fiscal->>'serie_nfce', '1'),
  COALESCE((l.config_fiscal->>'ultimo_numero_nfe')::int, 0),
  COALESCE((l.config_fiscal->>'ultimo_numero_nfce')::int, 0),
  l.config_fiscal->>'csc_id',
  l.config_fiscal->>'csc_token',
  l.config_fiscal->>'cert_pfx_url',
  l.config_fiscal->>'cert_senha'
FROM public.lojas l
ON CONFLICT (loja_id) DO NOTHING;

-- Drop sensitive column from lojas now that it lives in admin-only table
ALTER TABLE public.lojas DROP COLUMN IF EXISTS config_fiscal;

ALTER TABLE public.lojas_config_fiscal ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lojas_config_fiscal_admin_select"
  ON public.lojas_config_fiscal FOR SELECT TO authenticated
  USING (loja_id = public.get_loja_id() AND public.has_loja_role(loja_id, 'admin'));

CREATE POLICY "lojas_config_fiscal_admin_insert"
  ON public.lojas_config_fiscal FOR INSERT TO authenticated
  WITH CHECK (loja_id = public.get_loja_id() AND public.has_loja_role(loja_id, 'admin'));

CREATE POLICY "lojas_config_fiscal_admin_update"
  ON public.lojas_config_fiscal FOR UPDATE TO authenticated
  USING (loja_id = public.get_loja_id() AND public.has_loja_role(loja_id, 'admin'))
  WITH CHECK (loja_id = public.get_loja_id() AND public.has_loja_role(loja_id, 'admin'));

CREATE TRIGGER trg_lojas_config_fiscal_updated_at
  BEFORE UPDATE ON public.lojas_config_fiscal
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 4) Restrict product-images bucket: drop overly broad SELECT policy.
--    Public URLs continue to work via the Storage CDN; only listing is restricted.
DROP POLICY IF EXISTS "Product images are publicly accessible" ON storage.objects;

CREATE POLICY "product_images_owner_select"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'product-images'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
