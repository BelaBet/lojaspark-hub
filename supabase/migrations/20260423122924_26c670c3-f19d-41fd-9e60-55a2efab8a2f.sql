
-- =========================================================
-- 1) TABELAS BASE
-- =========================================================

create table public.lojas (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  cnpj text,
  telefone text,
  email text,
  logo_url text,
  plano text not null default 'basico',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.loja_usuarios (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid not null references public.lojas(id) on delete cascade,
  user_id uuid not null,
  role text not null default 'vendedor',
  created_at timestamptz not null default now(),
  unique(loja_id, user_id)
);

create index loja_usuarios_user_idx on public.loja_usuarios(user_id);

create table public.produtos (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid not null references public.lojas(id) on delete cascade,
  nome text not null,
  descricao text,
  sku text,
  ean text,
  preco_custo numeric(10,2) not null default 0,
  preco_venda numeric(10,2) not null default 0,
  preco_atacado numeric(10,2),
  fotos text[] not null default '{}',
  categoria text,
  marca text,
  fornecedor text,
  ncm text,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index produtos_loja_idx on public.produtos(loja_id);
create index produtos_ativo_idx on public.produtos(loja_id, ativo);

create table public.estoque (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid not null references public.lojas(id) on delete cascade,
  produto_id uuid not null references public.produtos(id) on delete cascade,
  quantidade numeric(10,3) not null default 0,
  quantidade_minima numeric(10,3) not null default 0,
  deposito text not null default 'principal',
  updated_at timestamptz not null default now(),
  unique(loja_id, produto_id, deposito)
);

create table public.clientes (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid not null references public.lojas(id) on delete cascade,
  nome text not null,
  cpf_cnpj text,
  telefone text,
  email text,
  endereco jsonb,
  pontos integer not null default 0,
  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.vendas (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid not null references public.lojas(id) on delete cascade,
  cliente_id uuid references public.clientes(id) on delete set null,
  vendedor_id uuid,
  total numeric(10,2) not null default 0,
  desconto numeric(10,2) not null default 0,
  forma_pagamento text,
  status text not null default 'concluida',
  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index vendas_loja_idx on public.vendas(loja_id, created_at desc);

create table public.venda_itens (
  id uuid primary key default gen_random_uuid(),
  venda_id uuid not null references public.vendas(id) on delete cascade,
  produto_id uuid references public.produtos(id) on delete set null,
  quantidade numeric(10,3) not null,
  preco_unit numeric(10,2) not null,
  desconto numeric(10,2) not null default 0,
  subtotal numeric(10,2) generated always as (quantidade * preco_unit - desconto) stored
);

create index venda_itens_venda_idx on public.venda_itens(venda_id);

create table public.movimentacoes_estoque (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid not null references public.lojas(id) on delete cascade,
  produto_id uuid not null references public.produtos(id) on delete cascade,
  tipo text not null,
  quantidade numeric(10,3) not null,
  motivo text,
  ref_venda_id uuid references public.vendas(id) on delete set null,
  deposito text not null default 'principal',
  created_at timestamptz not null default now()
);

create index movimentacoes_loja_idx on public.movimentacoes_estoque(loja_id, created_at desc);

-- =========================================================
-- 2) FUNÇÕES HELPER (SECURITY DEFINER, evita recursão RLS)
-- =========================================================

create or replace function public.get_loja_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select loja_id from public.loja_usuarios where user_id = auth.uid() limit 1;
$$;

create or replace function public.has_loja_role(_role text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.loja_usuarios
    where user_id = auth.uid() and role = _role
  );
$$;

-- timestamp updater (reaproveita ou recria)
create or replace function public.set_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_updated_at_lojas before update on public.lojas
  for each row execute function public.set_updated_at();
create trigger set_updated_at_produtos before update on public.produtos
  for each row execute function public.set_updated_at();
create trigger set_updated_at_estoque before update on public.estoque
  for each row execute function public.set_updated_at();
create trigger set_updated_at_clientes before update on public.clientes
  for each row execute function public.set_updated_at();
create trigger set_updated_at_vendas before update on public.vendas
  for each row execute function public.set_updated_at();

-- Validação de domínio (em vez de CHECK constraint imutável)
create or replace function public.validar_loja_role()
returns trigger language plpgsql as $$
begin
  if new.role not in ('admin','gerente','vendedor') then
    raise exception 'role inválido: %', new.role;
  end if;
  return new;
end;
$$;
create trigger trg_validar_loja_role
  before insert or update on public.loja_usuarios
  for each row execute function public.validar_loja_role();

create or replace function public.validar_venda()
returns trigger language plpgsql as $$
begin
  if new.status not in ('rascunho','concluida','cancelada') then
    raise exception 'status inválido: %', new.status;
  end if;
  if new.forma_pagamento is not null
     and new.forma_pagamento not in ('dinheiro','pix','cartao_debito','cartao_credito','misto') then
    raise exception 'forma_pagamento inválida: %', new.forma_pagamento;
  end if;
  return new;
end;
$$;
create trigger trg_validar_venda
  before insert or update on public.vendas
  for each row execute function public.validar_venda();

create or replace function public.validar_movimentacao()
returns trigger language plpgsql as $$
begin
  if new.tipo not in ('entrada','saida','ajuste','transferencia') then
    raise exception 'tipo inválido: %', new.tipo;
  end if;
  return new;
end;
$$;
create trigger trg_validar_movimentacao
  before insert or update on public.movimentacoes_estoque
  for each row execute function public.validar_movimentacao();

-- =========================================================
-- 3) RLS
-- =========================================================

alter table public.lojas enable row level security;
alter table public.loja_usuarios enable row level security;
alter table public.produtos enable row level security;
alter table public.estoque enable row level security;
alter table public.clientes enable row level security;
alter table public.vendas enable row level security;
alter table public.venda_itens enable row level security;
alter table public.movimentacoes_estoque enable row level security;

-- LOJAS: o usuário vê e edita só a própria loja (admin pode update)
create policy "lojas_select" on public.lojas
  for select to authenticated
  using (id = public.get_loja_id());

create policy "lojas_update" on public.lojas
  for update to authenticated
  using (id = public.get_loja_id() and public.has_loja_role('admin'))
  with check (id = public.get_loja_id() and public.has_loja_role('admin'));

-- LOJA_USUARIOS: usuário vê seu próprio vínculo + vínculos da sua loja
create policy "loja_usuarios_select_own" on public.loja_usuarios
  for select to authenticated
  using (user_id = auth.uid() or loja_id = public.get_loja_id());

create policy "loja_usuarios_admin_insert" on public.loja_usuarios
  for insert to authenticated
  with check (loja_id = public.get_loja_id() and public.has_loja_role('admin'));

create policy "loja_usuarios_admin_update" on public.loja_usuarios
  for update to authenticated
  using (loja_id = public.get_loja_id() and public.has_loja_role('admin'))
  with check (loja_id = public.get_loja_id() and public.has_loja_role('admin'));

create policy "loja_usuarios_admin_delete" on public.loja_usuarios
  for delete to authenticated
  using (loja_id = public.get_loja_id() and public.has_loja_role('admin'));

-- PRODUTOS
create policy "produtos_select" on public.produtos
  for select to authenticated using (loja_id = public.get_loja_id());
create policy "produtos_insert" on public.produtos
  for insert to authenticated with check (loja_id = public.get_loja_id());
create policy "produtos_update" on public.produtos
  for update to authenticated
  using (loja_id = public.get_loja_id())
  with check (loja_id = public.get_loja_id());
create policy "produtos_delete" on public.produtos
  for delete to authenticated using (loja_id = public.get_loja_id());

-- ESTOQUE
create policy "estoque_select" on public.estoque
  for select to authenticated using (loja_id = public.get_loja_id());
create policy "estoque_insert" on public.estoque
  for insert to authenticated with check (loja_id = public.get_loja_id());
create policy "estoque_update" on public.estoque
  for update to authenticated
  using (loja_id = public.get_loja_id())
  with check (loja_id = public.get_loja_id());
create policy "estoque_delete" on public.estoque
  for delete to authenticated using (loja_id = public.get_loja_id());

-- CLIENTES
create policy "clientes_select" on public.clientes
  for select to authenticated using (loja_id = public.get_loja_id());
create policy "clientes_insert" on public.clientes
  for insert to authenticated with check (loja_id = public.get_loja_id());
create policy "clientes_update" on public.clientes
  for update to authenticated
  using (loja_id = public.get_loja_id())
  with check (loja_id = public.get_loja_id());
create policy "clientes_delete" on public.clientes
  for delete to authenticated using (loja_id = public.get_loja_id());

-- VENDAS
create policy "vendas_select" on public.vendas
  for select to authenticated using (loja_id = public.get_loja_id());
create policy "vendas_insert" on public.vendas
  for insert to authenticated
  with check (loja_id = public.get_loja_id() and (vendedor_id is null or vendedor_id = auth.uid()));
create policy "vendas_update" on public.vendas
  for update to authenticated
  using (loja_id = public.get_loja_id())
  with check (loja_id = public.get_loja_id());
create policy "vendas_delete" on public.vendas
  for delete to authenticated
  using (loja_id = public.get_loja_id() and public.has_loja_role('admin'));

-- VENDA_ITENS (via venda)
create policy "venda_itens_select" on public.venda_itens
  for select to authenticated
  using (exists (select 1 from public.vendas v where v.id = venda_id and v.loja_id = public.get_loja_id()));
create policy "venda_itens_insert" on public.venda_itens
  for insert to authenticated
  with check (exists (select 1 from public.vendas v where v.id = venda_id and v.loja_id = public.get_loja_id()));
create policy "venda_itens_update" on public.venda_itens
  for update to authenticated
  using (exists (select 1 from public.vendas v where v.id = venda_id and v.loja_id = public.get_loja_id()))
  with check (exists (select 1 from public.vendas v where v.id = venda_id and v.loja_id = public.get_loja_id()));
create policy "venda_itens_delete" on public.venda_itens
  for delete to authenticated
  using (exists (select 1 from public.vendas v where v.id = venda_id and v.loja_id = public.get_loja_id()));

-- MOVIMENTACOES
create policy "movimentacoes_select" on public.movimentacoes_estoque
  for select to authenticated using (loja_id = public.get_loja_id());
create policy "movimentacoes_insert" on public.movimentacoes_estoque
  for insert to authenticated with check (loja_id = public.get_loja_id());

-- =========================================================
-- 4) BAIXA DE ESTOQUE AO CONCLUIR VENDA
-- =========================================================

create or replace function public.baixar_estoque_venda()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'concluida' and (tg_op = 'INSERT' or old.status is distinct from 'concluida') then
    insert into public.movimentacoes_estoque (loja_id, produto_id, tipo, quantidade, motivo, ref_venda_id)
    select new.loja_id, vi.produto_id, 'saida', vi.quantidade, 'Venda #' || new.id, new.id
    from public.venda_itens vi
    where vi.venda_id = new.id and vi.produto_id is not null;

    update public.estoque e
    set quantidade = e.quantidade - vi.quantidade, updated_at = now()
    from public.venda_itens vi
    where vi.venda_id = new.id
      and e.produto_id = vi.produto_id
      and e.loja_id = new.loja_id;
  end if;
  return new;
end;
$$;

create trigger on_venda_concluida_ins
  after insert on public.vendas
  for each row execute function public.baixar_estoque_venda();
create trigger on_venda_concluida_upd
  after update on public.vendas
  for each row execute function public.baixar_estoque_venda();

-- =========================================================
-- 5) AUTO-CRIAR LOJA NO SIGNUP
-- =========================================================

create or replace function public.criar_loja_para_novo_usuario()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  nova_loja_id uuid;
begin
  insert into public.lojas (nome, email)
  values ('Minha Loja', new.email)
  returning id into nova_loja_id;

  insert into public.loja_usuarios (loja_id, user_id, role)
  values (nova_loja_id, new.id, 'admin');

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.criar_loja_para_novo_usuario();

-- =========================================================
-- 6) MIGRAR DADOS DA TABELA `products` ANTIGA -> `produtos` + `estoque`
-- =========================================================

do $$
declare
  uid uuid;
  loja uuid;
  prod record;
  novo_prod uuid;
begin
  if exists (select 1 from information_schema.tables
             where table_schema='public' and table_name='products') then

    -- Para cada user_id distinto da tabela antiga, garantir loja
    for uid in select distinct user_id from public.products loop
      select lu.loja_id into loja
      from public.loja_usuarios lu where lu.user_id = uid limit 1;

      if loja is null then
        insert into public.lojas (nome) values ('Minha Loja') returning id into loja;
        insert into public.loja_usuarios (loja_id, user_id, role)
        values (loja, uid, 'admin');
      end if;

      -- Copiar produtos do usuário
      for prod in select * from public.products where user_id = uid loop
        insert into public.produtos
          (loja_id, nome, descricao, sku, ean, preco_custo, preco_venda,
           categoria, ativo, fotos, created_at, updated_at)
        values
          (loja, prod.name, prod.description, prod.sku, prod.barcode,
           coalesce(prod.cost, 0), coalesce(prod.price, 0),
           prod.category, prod.is_active,
           case when prod.image_url is not null then array[prod.image_url] else '{}'::text[] end,
           prod.created_at, prod.updated_at)
        returning id into novo_prod;

        insert into public.estoque (loja_id, produto_id, quantidade, deposito)
        values (loja, novo_prod, coalesce(prod.stock, 0), 'principal');
      end loop;
    end loop;

    drop table public.products cascade;
  end if;
end $$;

-- =========================================================
-- 7) STORAGE BUCKET `produtos`
-- =========================================================

insert into storage.buckets (id, name, public)
values ('produtos', 'produtos', true)
on conflict (id) do nothing;

create policy "produtos_public_read"
  on storage.objects for select
  using (bucket_id = 'produtos');

create policy "produtos_user_insert"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'produtos' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "produtos_user_update"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'produtos' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "produtos_user_delete"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'produtos' and auth.uid()::text = (storage.foldername(name))[1]);
