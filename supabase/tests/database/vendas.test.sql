begin;

select plan(13);

-- -------------------------------------------------------------------------
-- Fixtures
-- -------------------------------------------------------------------------
insert into public.lojas (id, nome, email)
values ('00000000-0000-0000-0000-000000000001', 'Teste Venda', 'teste-venda@example.invalid')
on conflict (id) do nothing;

insert into public.produtos (id, loja_id, nome, preco_venda, ativo)
values
  ('00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000001', 'Produto Teste A', 10, true),
  ('00000000-0000-0000-0000-000000000202', '00000000-0000-0000-0000-000000000001', 'Produto Teste B', 20, true)
on conflict (id) do nothing;

insert into public.estoque (id, loja_id, produto_id, quantidade, quantidade_minima, deposito)
values
  ('00000000-0000-0000-0000-000000000301', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000201', 5, 1, 'principal'),
  ('00000000-0000-0000-0000-000000000302', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000202', 1, 0, 'principal')
on conflict (id) do nothing;

-- -------------------------------------------------------------------------
-- validar_venda
-- -------------------------------------------------------------------------
select lives_ok(
  $$insert into public.vendas (id, loja_id, total, status, forma_pagamento)
    values ('00000000-0000-0000-0000-000000000101',
            '00000000-0000-0000-0000-000000000001',
            10, 'concluida', 'pix')$$,
  'validar_venda aceita status e forma de pagamento válidos'
);

select throws_ok(
  $$insert into public.vendas (id, loja_id, total, status, forma_pagamento)
    values ('00000000-0000-0000-0000-000000000102',
            '00000000-0000-0000-0000-000000000001',
            10, 'aprovada', 'pix')$$,
  'P0001',
  'status inválido: aprovada',
  'validar_venda rejeita status inválido'
);

select throws_ok(
  $$insert into public.vendas (id, loja_id, total, status, forma_pagamento)
    values ('00000000-0000-0000-0000-000000000103',
            '00000000-0000-0000-0000-000000000001',
            10, 'concluida', 'boleto')$$,
  'P0001',
  'forma_pagamento inválida: boleto',
  'validar_venda rejeita forma de pagamento inválida'
);

-- -------------------------------------------------------------------------
-- validar_estoque_disponivel
-- -------------------------------------------------------------------------
insert into public.vendas (id, loja_id, total, status, forma_pagamento)
values ('00000000-0000-0000-0000-000000000104', '00000000-0000-0000-0000-000000000001', 40, 'concluida', 'dinheiro');

select lives_ok(
  $$insert into public.venda_itens (venda_id, produto_id, quantidade, preco_unit)
    values ('00000000-0000-0000-0000-000000000104',
            '00000000-0000-0000-0000-000000000201', 2, 10)$$,
  'validar_estoque_disponivel aceita quantidade disponível'
);

select is(
  (select quantidade from public.estoque where id = '00000000-0000-0000-0000-000000000301'),
  3::numeric,
  'estoque é baixado na mesma transação do item'
);

select is(
  (select count(*) from public.movimentacoes_estoque
    where ref_venda_id = '00000000-0000-0000-0000-000000000104'
      and produto_id = '00000000-0000-0000-0000-000000000201'),
  1::bigint,
  'baixa gera uma movimentação de estoque vinculada à venda'
);

select throws_ok(
  $$insert into public.venda_itens (venda_id, produto_id, quantidade, preco_unit)
    values ('00000000-0000-0000-0000-000000000104',
            '00000000-0000-0000-0000-000000000202', 2, 20)$$,
  'P0001',
  'Estoque insuficiente: disponível 1, solicitado 2',
  'trigger rejeita venda acima do estoque disponível'
);

select is(
  (select quantidade from public.estoque where id = '00000000-0000-0000-0000-000000000302'),
  1::numeric,
  'estoque permanece intacto depois de uma tentativa recusada'
);

-- -------------------------------------------------------------------------
-- Atomic rollback: Vendas.tsx sends all venda_itens in one INSERT.
-- If a later item fails, PostgreSQL rolls back the successful item and the
-- stock changes performed by the trigger. Vendas.tsx then deletes the parent
-- venda as its application-level cleanup.
-- -------------------------------------------------------------------------
insert into public.vendas (id, loja_id, total, status, forma_pagamento)
values ('00000000-0000-0000-0000-000000000105', '00000000-0000-0000-0000-000000000001', 40, 'concluida', 'pix');

select throws_ok(
  $$insert into public.venda_itens (venda_id, produto_id, quantidade, preco_unit)
    values
      ('00000000-0000-0000-0000-000000000105', '00000000-0000-0000-0000-000000000201', 2, 10),
      ('00000000-0000-0000-0000-000000000105', '00000000-0000-0000-0000-000000000202', 2, 20)$$,
  'P0001',
  'Estoque insuficiente: disponível 1, solicitado 2',
  'insert de itens falha e aborta a transação inteira'
);

select is(
  (select count(*) from public.venda_itens where venda_id = '00000000-0000-0000-0000-000000000105'),
  0::bigint,
  'nenhum item parcial permanece após falha do insert'
);

select is(
  (select quantidade from public.estoque where id = '00000000-0000-0000-0000-000000000301'),
  3::numeric,
  'rollback do insert restaura o estoque do primeiro item'
);

select is(
  (select count(*) from public.movimentacoes_estoque
    where ref_venda_id = '00000000-0000-0000-0000-000000000105'),
  0::bigint,
  'rollback do insert remove também as movimentações parciais'
);

-- Mirrors the cleanup already implemented in Vendas.tsx after iErr.
delete from public.vendas where id = '00000000-0000-0000-0000-000000000105';

select is(
  (select count(*) from public.vendas where id = '00000000-0000-0000-0000-000000000105'),
  0::bigint,
  'rollback de aplicação remove a venda órfã após falha dos itens'
);

select * from finish();
rollback;
