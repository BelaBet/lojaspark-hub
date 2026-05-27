-- Cores personalizadas por instituição
ALTER TABLE public.lojas
  ADD COLUMN IF NOT EXISTS cor_primaria text,
  ADD COLUMN IF NOT EXISTS cor_secundaria text;

-- Enum de roles globais (super admin do sistema PayTicket)
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('super_admin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_roles_select_own ON public.user_roles;
CREATE POLICY user_roles_select_own ON public.user_roles
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.has_app_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_app_role(auth.uid(), 'super_admin');
$$;

-- Super admin enxerga e gerencia todas as instituições
DROP POLICY IF EXISTS lojas_super_admin_select ON public.lojas;
CREATE POLICY lojas_super_admin_select ON public.lojas
  FOR SELECT TO authenticated
  USING (public.is_super_admin());

DROP POLICY IF EXISTS lojas_super_admin_update ON public.lojas;
CREATE POLICY lojas_super_admin_update ON public.lojas
  FOR UPDATE TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS lojas_super_admin_delete ON public.lojas;
CREATE POLICY lojas_super_admin_delete ON public.lojas
  FOR DELETE TO authenticated
  USING (public.is_super_admin());

DROP POLICY IF EXISTS loja_usuarios_super_admin_select ON public.loja_usuarios;
CREATE POLICY loja_usuarios_super_admin_select ON public.loja_usuarios
  FOR SELECT TO authenticated
  USING (public.is_super_admin());