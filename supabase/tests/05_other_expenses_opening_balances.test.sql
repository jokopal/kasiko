-- "Lainnya" expenses with a required note and owner re-categorizing (decision #36); the
-- daily drawer float and the opening reserve, "uang dingin" (#37). The money cases match
-- src/features/reports/finance.test.ts.
begin;
create extension if not exists pgtap with schema extensions;
select plan(22);

insert into auth.users (id, email) values
  ('a0000000-0000-4000-8000-00000000000a', 'owner-a@kasiko.test'),
  ('a0000000-0000-4000-8000-00000000000c', 'kasir-a@kasiko.test'),
  ('b0000000-0000-4000-8000-00000000000a', 'owner-b@kasiko.test');
insert into public.businesses (id, owner_id, name, receipt_prefix, drawer_float) values
  ('a0000000-0000-4000-8000-0000000000b0', 'a0000000-0000-4000-8000-00000000000a', 'Usaha A', 'UA', 300000),
  ('b0000000-0000-4000-8000-0000000000b0', 'b0000000-0000-4000-8000-00000000000a', 'Usaha B', 'UB', 0);
insert into public.business_members (business_id, user_id, role) values
  ('a0000000-0000-4000-8000-0000000000b0', 'a0000000-0000-4000-8000-00000000000a', 'owner'),
  ('a0000000-0000-4000-8000-0000000000b0', 'a0000000-0000-4000-8000-00000000000c', 'cashier'),
  ('b0000000-0000-4000-8000-0000000000b0', 'b0000000-0000-4000-8000-00000000000a', 'owner');
insert into public.expense_categories (id, business_id, name, kind, requires_note) values
  ('a0000000-0000-4000-8000-0000000000e1', 'a0000000-0000-4000-8000-0000000000b0', 'Makan', 'operating', false),
  ('a0000000-0000-4000-8000-0000000000e9', 'a0000000-0000-4000-8000-0000000000b0', 'Lainnya', 'operating', true),
  ('b0000000-0000-4000-8000-0000000000e1', 'b0000000-0000-4000-8000-0000000000b0', 'Makan B', 'operating', false);
insert into public.devices (id, business_id, device_code) values
  ('a0000000-0000-4000-8000-0000000000f1', 'a0000000-0000-4000-8000-0000000000b0', 'A');
-- Today: one cash sale of 35.000; an owner expense of 20.000; one voided expense.
insert into public.transactions (id, business_id, receipt_no, occurred_at, payment_method, subtotal, total, cash_received, change_amount, device_id) values
  ('a0000000-0000-4000-8000-000000000501', 'a0000000-0000-4000-8000-0000000000b0', 'UA-261026-A0001', now(), 'cash', 35000, 35000, 35000, 0, 'a0000000-0000-4000-8000-0000000000f1');
insert into public.expenses (id, business_id, category_id, amount, source, occurred_at, status, void_reason, voided_at) values
  ('a0000000-0000-4000-8000-000000000601', 'a0000000-0000-4000-8000-0000000000b0', 'a0000000-0000-4000-8000-0000000000e1', 20000, 'owner', now(), 'active', null, null),
  ('a0000000-0000-4000-8000-000000000602', 'a0000000-0000-4000-8000-0000000000b0', 'a0000000-0000-4000-8000-0000000000e1', 5000, 'owner', now(), 'void', 'Salah input', now());

create function pg_temp.drawer_expense(p_id text, p_note text)
returns jsonb language sql as $$
  select jsonb_build_object(
    'id', p_id,
    'business_id', 'a0000000-0000-4000-8000-0000000000b0',
    'category_id', 'a0000000-0000-4000-8000-0000000000e9',
    'source', 'drawer',
    'device_id', 'a0000000-0000-4000-8000-0000000000f1',
    'amount', 10000,
    'note', p_note,
    'occurred_at', now()
  );
$$;
grant execute on function pg_temp.drawer_expense(text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Cashier: "Lainnya" needs a note; the float is part of the drawer
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub":"a0000000-0000-4000-8000-00000000000c","role":"authenticated"}';

select throws_ok(
  $$select public.create_expense(pg_temp.drawer_expense('a0000000-0000-4000-8000-000000000701', ''))$$,
  '23514', 'Keterangan wajib diisi (min. 3 huruf) untuk kategori ini',
  'a "Lainnya" expense without a note is refused'
);
select throws_ok(
  $$select public.create_expense(pg_temp.drawer_expense('a0000000-0000-4000-8000-000000000701', '  ab  '))$$,
  '23514', null, 'a note of under three letters (after trimming) is refused'
);
select is(
  public.create_expense(pg_temp.drawer_expense('a0000000-0000-4000-8000-000000000701', 'Beli lampu teras')) ->> 'note',
  'Beli lampu teras', 'a "Lainnya" expense with a note is recorded'
);
select is(
  (select drawer_float from public.business_branding),
  300000::bigint, 'the cashier sees the daily drawer float'
);
select throws_ok(
  'select opening_reserve from public.business_branding',
  '42703', null, 'the opening reserve is not in the cashier view'
);
-- 300.000 float + 35.000 cash sales − 10.000 drawer expense; owner expenses never count.
select is(
  public.drawer_expected('a0000000-0000-4000-8000-0000000000b0'),
  325000::bigint, 'uang laci seharusnya = float + cash sales − drawer expenses'
);
select throws_ok(
  $$select public.recategorize_expense('a0000000-0000-4000-8000-000000000701', 'a0000000-0000-4000-8000-0000000000e1')$$,
  '42501', null, 'the cashier cannot re-categorize'
);

-- ---------------------------------------------------------------------------
-- Owner: re-categorize (decision #36)
-- ---------------------------------------------------------------------------
set local request.jwt.claims to '{"sub":"a0000000-0000-4000-8000-00000000000a","role":"authenticated"}';

select is(
  public.recategorize_expense('a0000000-0000-4000-8000-000000000701', 'a0000000-0000-4000-8000-0000000000e1') ->> 'category_id',
  'a0000000-0000-4000-8000-0000000000e1', 'the owner moves a "Lainnya" expense to a proper category'
);
select results_eq(
  $$select amount, note, source::text from public.expenses where id = 'a0000000-0000-4000-8000-000000000701'$$,
  $$values (10000::bigint, 'Beli lampu teras'::text, 'drawer'::text)$$,
  'moving keeps amount, note and source'
);
select results_eq(
  $$select action, old_data ->> 'category_id', new_data ->> 'category_id' from public.audit_log
    where entity = 'expenses' and entity_id = 'a0000000-0000-4000-8000-000000000701'$$,
  $$values ('recategorize'::text, 'a0000000-0000-4000-8000-0000000000e9'::text, 'a0000000-0000-4000-8000-0000000000e1'::text)$$,
  'the move is in the audit log with both categories'
);
select throws_ok(
  $$select public.recategorize_expense('a0000000-0000-4000-8000-000000000601', 'a0000000-0000-4000-8000-0000000000e9')$$,
  '23514', 'Keterangan wajib diisi (min. 3 huruf) untuk kategori ini',
  'an expense without a note cannot be moved into "Lainnya"'
);
select throws_ok(
  $$select public.recategorize_expense('a0000000-0000-4000-8000-000000000601', 'b0000000-0000-4000-8000-0000000000e1')$$,
  '23503', 'Kategori pengeluaran tidak valid', 'a category of another business is refused'
);
select throws_ok(
  $$select public.recategorize_expense('a0000000-0000-4000-8000-000000000602', 'a0000000-0000-4000-8000-0000000000e9')$$,
  '23514', 'Pengeluaran yang dibatalkan tidak bisa dipindahkan', 'a voided expense stays as it was'
);

-- ---------------------------------------------------------------------------
-- Owner: opening reserve, "uang dingin" (decision #37)
-- ---------------------------------------------------------------------------
select is(
  public.free_cash('a0000000-0000-4000-8000-0000000000b0'),
  5000::bigint, 'kas bebas before the opening reserve: 35.000 − 30.000'
);
update public.businesses set opening_reserve = 5000000
  where id = 'a0000000-0000-4000-8000-0000000000b0';
select is(
  public.reserve_balance('a0000000-0000-4000-8000-0000000000b0'),
  5000000::bigint, 'the opening reserve is the starting reserve balance'
);
select is(
  public.free_cash('a0000000-0000-4000-8000-0000000000b0'),
  5000::bigint, 'uang dingin is not free cash'
);
insert into public.reserve_movements (business_id, type, amount, source) values
  ('a0000000-0000-4000-8000-0000000000b0', 'deposit', 200000, 'cash');
insert into public.reserve_movements (business_id, type, amount, reason) values
  ('a0000000-0000-4000-8000-0000000000b0', 'withdraw', 1000000, 'Renovasi atap');
select is(
  public.reserve_balance('a0000000-0000-4000-8000-0000000000b0'),
  4200000::bigint, '5.000.000 opening + 200.000 deposit − 1.000.000 withdrawal'
);
-- 35.000 income − 30.000 expenses − 200.000 cash deposit + 1.000.000 withdrawal
select is(
  public.free_cash('a0000000-0000-4000-8000-0000000000b0'),
  805000::bigint, 'withdrawing uang dingin moves it into free cash'
);
select throws_ok(
  $$insert into public.reserve_movements (business_id, type, amount, reason) values
    ('a0000000-0000-4000-8000-0000000000b0', 'withdraw', 4200001, 'Terlalu banyak')$$,
  '23514', 'Saldo cadangan tidak cukup', 'a withdrawal above the balance is refused'
);
select throws_ok(
  $$update public.businesses set opening_reserve = 500000
    where id = 'a0000000-0000-4000-8000-0000000000b0'$$,
  '23514', 'Uang dingin tidak boleh lebih kecil dari yang sudah ditarik',
  'the opening reserve cannot drop below what was already withdrawn'
);

-- ---------------------------------------------------------------------------
-- Templates: requiresNote, and never a second catch-all
-- ---------------------------------------------------------------------------
select is(
  (public.apply_template('a0000000-0000-4000-8000-0000000000b0',
    '{"expenseCategories": [{"name": "Lain-lain", "kind": "operating", "requiresNote": true}]}')
    ->> 'expenseCategories')::integer,
  0, 'a business with a note-required category gets no second catch-all'
);
set local request.jwt.claims to '{"sub":"b0000000-0000-4000-8000-00000000000a","role":"authenticated"}';
select public.apply_template('b0000000-0000-4000-8000-0000000000b0',
  '{"expenseCategories": [{"name": "Lainnya", "kind": "operating", "requiresNote": true}]}');
select is(
  (select requires_note from public.expense_categories where name = 'Lainnya'),
  true, 'a template category can require a note'
);

select * from finish();
rollback;
