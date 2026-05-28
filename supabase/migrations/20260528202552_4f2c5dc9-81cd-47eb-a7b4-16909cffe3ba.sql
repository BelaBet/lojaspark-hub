
-- 1) Funções usadas APENAS como triggers: revogar EXECUTE de todos
REVOKE EXECUTE ON FUNCTION public.criar_loja_para_novo_usuario() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.baixar_estoque_venda() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.validar_venda() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.validar_movimentacao() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.validar_loja_role() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.validar_nota_fiscal() FROM PUBLIC, anon, authenticated;

-- 2) Funções auxiliares chamadas por políticas RLS (precisam de execute por authenticated)
--    Removem-se anon e PUBLIC, mantém-se authenticated e service_role.
REVOKE EXECUTE ON FUNCTION public.get_loja_id() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_loja_role(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_loja_role(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_app_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_super_admin() FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_loja_id() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_loja_role(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_loja_role(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_app_role(uuid, public.app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated, service_role;
