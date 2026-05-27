
-- 1) Fix privilege escalation: scope admin check to target loja_id
DROP POLICY IF EXISTS loja_usuarios_admin_insert ON public.loja_usuarios;
DROP POLICY IF EXISTS loja_usuarios_admin_update ON public.loja_usuarios;
DROP POLICY IF EXISTS loja_usuarios_admin_delete ON public.loja_usuarios;

CREATE POLICY loja_usuarios_admin_insert
ON public.loja_usuarios
FOR INSERT
TO authenticated
WITH CHECK (public.has_loja_role(loja_id, 'admin'));

CREATE POLICY loja_usuarios_admin_update
ON public.loja_usuarios
FOR UPDATE
TO authenticated
USING (public.has_loja_role(loja_id, 'admin'))
WITH CHECK (public.has_loja_role(loja_id, 'admin'));

CREATE POLICY loja_usuarios_admin_delete
ON public.loja_usuarios
FOR DELETE
TO authenticated
USING (public.has_loja_role(loja_id, 'admin'));

-- 2) Restrict sensitive columns on lojas (cnpj, email, telefone) to admin/gerente
DROP POLICY IF EXISTS lojas_select ON public.lojas;

CREATE POLICY lojas_select
ON public.lojas
FOR SELECT
TO authenticated
USING (
  id = public.get_loja_id()
  AND (
    public.has_loja_role(id, 'admin')
    OR public.has_loja_role(id, 'gerente')
  )
);

-- Provide a non-sensitive view for all members (vendedores included)
CREATE OR REPLACE VIEW public.lojas_publico AS
SELECT
  id,
  nome,
  logo_url,
  cor_primaria,
  cor_secundaria,
  plano,
  onboarding_completo,
  created_at,
  updated_at
FROM public.lojas
WHERE id = public.get_loja_id();

GRANT SELECT ON public.lojas_publico TO authenticated;
