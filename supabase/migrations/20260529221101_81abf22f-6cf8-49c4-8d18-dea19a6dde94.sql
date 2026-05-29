
ALTER FUNCTION public.vendas_protect_financial_fields() SECURITY INVOKER;
REVOKE ALL ON FUNCTION public.vendas_protect_financial_fields() FROM PUBLIC, anon, authenticated;
