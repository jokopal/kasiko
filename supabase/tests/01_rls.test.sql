-- Access for the two roles (AGENTS.md section 5). Fixture: businesses A and B, each with
-- an owner and a cashier. Everything runs inside one transaction and is rolled back.
begin;
create extension if not exists pgtap with schema extensions;
select plan(31);

-- ---------------------------------------------------------------------------
-- Fixture (as postgres, RLS bypassed)
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('a0000000-0000-4000-8000-00000000000a', 'owner-a@kasiko.test'),
  ('a0000000-0000-4000-8000-00000000000c', 'kasir-a@kasiko.test'),
  ('b0000000-0000-4000-8000-00000000000a', 'owner-b@kasiko.test'),
  ('b0000000-0000-4000-8000-00000000000c', 'kasir-b@kasiko.test');

insert into public.businesses (id, owner_id, name, receipt_prefix, opening_cash) values
  ('a0000000-0000-4000-8000-0000000000b0', 'a0000000-0000-4000-8000-00000000000a', 'Usaha A', 'UA', 1000000),
  ('b0000000-0000-4000-8000-0000000000b0', 'b0000000-0000-4000-8000-00000000000a', 'Usaha B', 'UB', 0);
insert into public.business_members (business_id, user_id, role) values
  ('a0000000-0000-4000-8000-0000000000b0', 'a0000000-0000-4000-8000-00000000000a', 'owner'),
  ('a0000000-0000-4000-8000-0000000000b0', 'a0000000-0000-4000-8000-00000000000c', 'cashier'),
  ('b0000000-0000-4000-8000-0000000000b0', 'b0000000-0000-4000-8000-00000000000a', 'owner'),
  ('b0000000-0000-4000-8000-0000000000b0', 'b0000000-0000-4000-8000-00000000000c', 'cashier');
insert into public.business_configs (business_id) values
  ('a0000000-0000-4000-8000-0000000000b0'), ('b0000000-0000-4000-8000-0000000000b0');

insert into public.catalog_categories (id, business_id, name, is_active) values
  ('a0000000-0000-4000-8000-0000000000c1', 'a0000000-0000-4000-8000-0000000000b0', 'Cuci', true),
  ('a0000000-0000-4000-8000-0000000000c2', 'a0000000-0000-4000-8000-0000000000b0', 'Lama', false),
  ('b0000000-0000-4000-8000-0000000000c1', 'b0000000-0000-4000-8000-0000000000b0', 'Cuci', true);
insert into public.catalog_items (id, business_id, category_id, name, price, is_active) values
  ('a0000000-0000-4000-8000-0000000000d1', 'a0000000-0000-4000-8000-0000000000b0', 'a0000000-0000-4000-8000-0000000000c1', 'Cuci Kecil', 35000, true),
  ('a0000000-0000-4000-8000-0000000000d2', 'a0000000-0000-4000-8000-0000000000b0', 'a0000000-0000-4000-8000-0000000000c1', 'Cuci Lama', 30000, false),
  ('b0000000-0000-4000-8000-0000000000d1', 'b0000000-0000-4000-8000-0000000000b0', 'b0000000-0000-4000-8000-0000000000c1', 'Cuci B', 40000, true);
insert into public.expense_categories (id, business_id, name, kind, allow_drawer) values
  ('a0000000-0000-4000-8000-0000000000e1', 'a0000000-0000-4000-8000-0000000000b0', 'Makan', 'operating', true),
  ('a0000000-0000-4000-8000-0000000000e2', 'a0000000-0000-4000-8000-0000000000b0', 'Cicilan', 'non_operating', false),
  ('a0000000-0000-4000-8000-0000000000e3', 'a0000000-0000-4000-8000-0000000000b0', 'Prive', 'drawing', true),
  ('b0000000-0000-4000-8000-0000000000e1', 'b0000000-0000-4000-8000-0000000000b0', 'Makan', 'operating', true);
insert into public.devices (id, business_id, device_code) values
  ('a0000000-0000-4000-8000-0000000000f1', 'a0000000-0000-4000-8000-0000000000b0', 'A'),
  ('b0000000-0000-4000-8000-0000000000f1', 'b0000000-0000-4000-8000-0000000000b0', 'A');

-- A sale today and one yesterday; a drawer and an owner expense today.
insert into public.transactions (id, business_id, receipt_no, occurred_at, payment_method, total, cash_received, change_amount, device_id) values
  ('a0000000-0000-4000-8000-000000000101', 'a0000000-0000-4000-8000-0000000000b0', 'UA-261020-A0001', now(), 'cash', 35000, 35000, 0, 'a0000000-0000-4000-8000-0000000000f1'),
  ('a0000000-0000-4000-8000-000000000102', 'a0000000-0000-4000-8000-0000000000b0', 'UA-261019-A0001', now() - interval '1 day', 'qris', 35000, null, null, 'a0000000-0000-4000-8000-0000000000f1'),
  ('b0000000-0000-4000-8000-000000000101', 'b0000000-0000-4000-8000-0000000000b0', 'UB-261020-A0001', now(), 'qris', 40000, null, null, 'b0000000-0000-4000-8000-0000000000f1');
insert into public.transaction_items (id, business_id, transaction_id, position, catalog_item_id, name_snapshot, price_snapshot, qty, line_total) values
  (gen_random_uuid(), 'a0000000-0000-4000-8000-0000000000b0', 'a0000000-0000-4000-8000-000000000101', 1, 'a0000000-0000-4000-8000-0000000000d1', 'Cuci Kecil', 35000, 1, 35000),
  (gen_random_uuid(), 'a0000000-0000-4000-8000-0000000000b0', 'a0000000-0000-4000-8000-000000000102', 1, 'a0000000-0000-4000-8000-0000000000d1', 'Cuci Kecil', 35000, 1, 35000);
insert into public.expenses (id, business_id, category_id, amount, source, occurred_at, device_id) values
  ('a0000000-0000-4000-8000-000000000201', 'a0000000-0000-4000-8000-0000000000b0', 'a0000000-0000-4000-8000-0000000000e1', 20000, 'drawer', now(), 'a0000000-0000-4000-8000-0000000000f1'),
  ('a0000000-0000-4000-8000-000000000202', 'a0000000-0000-4000-8000-0000000000b0', 'a0000000-0000-4000-8000-0000000000e2', 900000, 'owner', now(), null);
insert into public.reserve_movements (business_id, type, amount, source) values
  ('a0000000-0000-4000-8000-0000000000b0', 'deposit', 500000, 'capital');
insert into public.historical_days (business_id, day_key, income) values
  ('a0000000-0000-4000-8000-0000000000b0', '2025-01-01', 2000000);

-- ---------------------------------------------------------------------------
-- Every table protected
-- ---------------------------------------------------------------------------
select is(
  (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity),
  0,
  'RLS is enabled on every public table'
);
select ok(
  not has_function_privilege('anon', 'public.create_transaction(jsonb)', 'execute'),
  'anon cannot call RPCs'
);

-- ---------------------------------------------------------------------------
-- Anonymous
-- ---------------------------------------------------------------------------
set local role anon;
select throws_ok('select count(*) from public.transactions', '42501', null, 'anon cannot read sales');
select throws_ok('select count(*) from public.business_branding', '42501', null, 'anon cannot read branding');
reset role;

-- ---------------------------------------------------------------------------
-- Cashier of A
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub":"a0000000-0000-4000-8000-00000000000c","role":"authenticated"}';

select is((select count(*)::int from public.businesses), 0, 'cashier cannot read businesses (opening cash)');
select results_eq(
  'select name from public.business_branding',
  $$values ('Usaha A'::text)$$,
  'cashier reads branding of their own business only'
);
select ok(
  not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'business_branding' and column_name = 'opening_cash'
  ),
  'branding view leaves out opening_cash'
);
select results_eq(
  'select name from public.catalog_items order by name',
  $$values ('Cuci Kecil'::text)$$,
  'cashier sees active catalog items of their business only'
);
select is((select count(*)::int from public.catalog_categories), 1, 'cashier sees active categories only');
select results_eq(
  'select name from public.expense_categories order by name',
  $$values ('Makan'::text), ('Prive'::text)$$,
  'cashier sees only categories allowed for the drawer'
);
select results_eq(
  'select id from public.transactions',
  $$values ('a0000000-0000-4000-8000-000000000101'::uuid)$$,
  'cashier sees today''s sales only — not yesterday, not business B'
);
select is((select count(*)::int from public.transaction_items), 1, 'cashier sees items of visible sales only');
select results_eq(
  'select id from public.expenses',
  $$values ('a0000000-0000-4000-8000-000000000201'::uuid)$$,
  'cashier sees today''s drawer expenses, never owner expenses'
);
select is((select count(*)::int from public.reserve_movements), 0, 'cashier cannot see the reserve');
select is((select count(*)::int from public.historical_days), 0, 'cashier cannot see imported history');
select is((select count(*)::int from public.audit_log), 0, 'cashier cannot see the audit log');
select is((select count(*)::int from public.business_configs), 0, 'cashier cannot see owner configuration');

select throws_ok(
  $$insert into public.transactions (id, business_id, receipt_no, occurred_at, payment_method, total, device_id)
    values (gen_random_uuid(), 'a0000000-0000-4000-8000-0000000000b0', 'UA-261020-A0009', now(), 'qris', 1000, 'a0000000-0000-4000-8000-0000000000f1')$$,
  '42501', null,
  'cashier cannot insert sales directly (only through create_transaction)'
);
select throws_ok(
  $$update public.transactions set status = 'void' where id = 'a0000000-0000-4000-8000-000000000101'$$,
  '42501', null,
  'cashier cannot update sales directly'
);
select throws_ok(
  $$delete from public.expenses where id = 'a0000000-0000-4000-8000-000000000201'$$,
  '42501', null,
  'nobody deletes expenses'
);
update public.catalog_items set price = 1 where id = 'a0000000-0000-4000-8000-0000000000d1';
select throws_ok(
  $$select * from public.period_totals('a0000000-0000-4000-8000-0000000000b0', now() - interval '7 days', now())$$,
  '42501', null,
  'cashier cannot read the recap'
);
select throws_ok(
  $$select public.free_cash('a0000000-0000-4000-8000-0000000000b0')$$,
  '42501', null,
  'cashier cannot read free cash'
);
select is(
  public.drawer_expected('a0000000-0000-4000-8000-0000000000b0'),
  15000::bigint,
  'cashier reads the expected drawer: cash 35.000 − drawer 20.000'
);
select throws_ok(
  $$select public.create_business('{"name":"Liar","receipt_prefix":"LR"}'::jsonb)$$,
  '42501', null,
  'a cashier account cannot create a business'
);

-- ---------------------------------------------------------------------------
-- Owner of B: nothing of A
-- ---------------------------------------------------------------------------
set local request.jwt.claims to '{"sub":"b0000000-0000-4000-8000-00000000000a","role":"authenticated"}';
select results_eq('select name from public.businesses', $$values ('Usaha B'::text)$$,
  'owner sees only their own businesses');
select is(
  (select count(*)::int from public.transactions where business_id = 'a0000000-0000-4000-8000-0000000000b0'),
  0,
  'owner of B cannot read sales of A'
);
update public.catalog_items set price = 2 where id = 'a0000000-0000-4000-8000-0000000000d1';
select throws_ok(
  $$insert into public.catalog_items (business_id, category_id, name, price)
    values ('a0000000-0000-4000-8000-0000000000b0', 'a0000000-0000-4000-8000-0000000000c1', 'Sisipan', 1)$$,
  '42501', null,
  'owner of B cannot add items to A'
);
select throws_ok(
  $$insert into public.catalog_items (business_id, category_id, name, price)
    values ('b0000000-0000-4000-8000-0000000000b0', 'a0000000-0000-4000-8000-0000000000c1', 'Silang', 1)$$,
  '23503', null,
  'composite keys stop an item pointing at a category of another business'
);

-- ---------------------------------------------------------------------------
-- Owner of A: everything of A, and price edits are audited
-- ---------------------------------------------------------------------------
set local request.jwt.claims to '{"sub":"a0000000-0000-4000-8000-00000000000a","role":"authenticated"}';
select is((select count(*)::int from public.transactions), 2, 'owner sees every sale of their business');
update public.catalog_items set price = 37000 where id = 'a0000000-0000-4000-8000-0000000000d1';
reset role;
select results_eq(
  $$select price from public.catalog_items where id = 'a0000000-0000-4000-8000-0000000000d1'$$,
  $$values (37000::bigint)$$,
  'only the owner''s price change went through (cashier and other owner changed nothing)'
);
select is(
  (select count(*)::int from public.audit_log
   where entity = 'catalog_items' and action = 'update'
     and actor_id = 'a0000000-0000-4000-8000-00000000000a'),
  1,
  'the price change is in the audit log with its author'
);

select * from finish();
rollback;
