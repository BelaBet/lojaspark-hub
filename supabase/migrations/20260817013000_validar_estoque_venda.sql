-- Enforce stock availability at the venda_itens boundary.
-- The trigger updates stock in the same INSERT transaction, so if any item
-- insert fails, PostgreSQL rolls back the item rows AND the stock changes.

create or replace function public.validar_estoque_disponivel()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_loja_id uuid;
  v_disponivel numeric;
begin
  if new.quantidade <= 0 then
    raise exception 'Quantidade do item deve ser maior que zero';
  end if;

  select v.loja_id
    into v_loja_id
  from public.vendas v
  where v.id = new.venda_id;

  if v_loja_id is null then
    raise exception 'Venda não encontrada: %', new.venda_id;
  end if;

  -- Lock the exact stock row to prevent two concurrent sales from consuming
  -- the same last unit.
  select e.quantidade
    into v_disponivel
  from public.estoque e
  where e.loja_id = v_loja_id
    and e.produto_id = new.produto_id
    and e.deposito = 'principal'
  for update;

  if v_disponivel is null then
    raise exception 'Estoque não encontrado para o produto %', new.produto_id;
  end if;

  if v_disponivel < new.quantidade then
    raise exception 'Estoque insuficiente: disponível %, solicitado %', v_disponivel, new.quantidade;
  end if;

  update public.estoque
     set quantidade = quantidade - new.quantidade,
         updated_at = now()
   where loja_id = v_loja_id
     and produto_id = new.produto_id
     and deposito = 'principal';

  insert into public.movimentacoes_estoque (
    loja_id, produto_id, tipo, quantidade, motivo, ref_venda_id, deposito
  ) values (
    v_loja_id, new.produto_id, 'saida', new.quantidade,
    'Venda #' || new.venda_id, new.venda_id, 'principal'
  );

  return new;
end;
$$;

-- The old venda-level trigger ran before venda_itens existed in the current
-- PDV flow, so it could not reliably validate or deduct stock. Stock is now
-- handled at venda_itens insertion, where the item quantity is known.
drop trigger if exists on_venda_concluida_ins on public.vendas;
drop trigger if exists on_venda_concluida_upd on public.vendas;

create trigger trg_validar_estoque_disponivel
  before insert on public.venda_itens
  for each row
  execute function public.validar_estoque_disponivel();

revoke all on function public.validar_estoque_disponivel() from public;
grant execute on function public.validar_estoque_disponivel() to authenticated;
