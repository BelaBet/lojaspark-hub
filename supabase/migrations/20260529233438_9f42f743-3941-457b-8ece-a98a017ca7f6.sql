create or replace function public.get_loja_pagarme_recipient()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select pagarme_recipient_id from public.lojas where id = public.get_loja_id();
$$;

grant execute on function public.get_loja_pagarme_recipient() to authenticated;