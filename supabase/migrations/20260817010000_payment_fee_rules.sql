-- Centralized payment fee configuration controlled exclusively by Super Admin.
create table if not exists public.payment_fee_rules (
  id uuid primary key default gen_random_uuid(),
  acquirer text not null default 'pagarme',
  payment_method text not null check (payment_method in ('pix','debit_card','credit_card')),
  installment_min integer not null default 1 check (installment_min >= 1),
  installment_max integer not null default 1 check (installment_max >= installment_min),
  percentage_rate numeric(10,6) not null default 0 check (percentage_rate >= 0),
  fixed_fee_cents integer not null default 0 check (fixed_fee_cents >= 0),
  anticipation_rate numeric(10,6) not null default 0 check (anticipation_rate >= 0),
  pass_to_customer boolean not null default true,
  active boolean not null default true,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

create index if not exists payment_fee_rules_lookup_idx
  on public.payment_fee_rules(acquirer, payment_method, active, installment_min, installment_max);

create or replace function public.set_payment_fee_rules_updated_at()
returns trigger language plpgsql security invoker as $$
begin
  new.updated_at = now();
  new.updated_by = auth.uid();
  return new;
end;
$$;

drop trigger if exists payment_fee_rules_updated_at on public.payment_fee_rules;
create trigger payment_fee_rules_updated_at
before update on public.payment_fee_rules
for each row execute function public.set_payment_fee_rules_updated_at();

alter table public.payment_fee_rules enable row level security;

drop policy if exists "super admins manage payment fee rules" on public.payment_fee_rules;
create policy "super admins manage payment fee rules"
on public.payment_fee_rules
for all
using (public.is_super_admin())
with check (public.is_super_admin());

-- The payment API also needs to read the rules using the authenticated caller.
-- Do not grant public/anonymous access.
drop policy if exists "authenticated read active payment fee rules" on public.payment_fee_rules;
create policy "authenticated read active payment fee rules"
on public.payment_fee_rules
for select to authenticated
using (active = true);

-- Seed the current Pagar.me configuration once. After this migration, rates are database data,
-- not API constants, and can be changed from Super Admin without code changes.
insert into public.payment_fee_rules
  (acquirer, payment_method, installment_min, installment_max, percentage_rate, fixed_fee_cents, anticipation_rate, pass_to_customer, description)
values
  ('pagarme','pix',1,1,0,90,0,true,'PIX Pagar.me'),
  ('pagarme','debit_card',1,1,0.0098,0,0,true,'Débito Pagar.me'),
  ('pagarme','credit_card',1,1,0.0125,0,0.011,true,'Crédito Pagar.me à vista com antecipação'),
  ('pagarme','credit_card',2,12,0.0135,0,0.011,true,'Crédito Pagar.me parcelado com antecipação')
;
