
-- Fix WARN: function search_path mutable
alter function public.validar_loja_role() set search_path = public;
alter function public.validar_venda() set search_path = public;
alter function public.validar_movimentacao() set search_path = public;

-- Fix WARN: public bucket allows listing (restringe a leitura por path/objeto, não listagem ampla)
drop policy if exists "produtos_public_read" on storage.objects;

-- Acesso direto a um objeto pelo URL público continua funcionando (CDN do Supabase),
-- mas listagem só para autenticados da própria pasta.
create policy "produtos_owner_select"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'produtos' and auth.uid()::text = (storage.foldername(name))[1]);
