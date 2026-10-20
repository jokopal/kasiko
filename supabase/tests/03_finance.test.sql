-- Financial formulas (section 4, decision #24). Same numbers as the "profit tiers" case in
-- src/features/reports/finance.test.ts, so both implementations are held to one answer.
begin;
create extension if not exists pgtap with schema extensions;
select plan(18);

insert into auth.users (id, email) values
  ('a0000000-0000-4000-8000-00000000000a', 'owner-a@kasiko.test'),
  ('a0000000-0000-4000-8000-00000000000c', 'kasir-a@kasiko.test');
insert into public.businesses (id, owner_id, name, receipt_prefix, opening_cash) values
  ('a0000000-0000-4000-8000-0000000000b0', 'a0000000-0000-4000-8000-00000000000a', 'Usaha A', 'UA', 100000);
insert into public.business_members (business_id, user_id, role) values
  ('a0000000-0000-4000-8000-0000000000b0', 'a0000000-0000-4000-8000-00000000000a', 'owner'),
  ('a0000000-0000-4000-8000-0000000000b0', 'a0000000-0000-4000-8000-00000000000c', 'cashier');
insert into public.expense_categories (id, business_id, name, kind, allow_drawer) values
  ('a0000000-0000-4000-8000-0000000000e1', 'a0000000-0000-4000-8000-0000000000b0', 'Operasional', 'operating', true),
  ('a0000000-0000-4000-8000-0000000000e2', 'a0000000-0000-4000-8000-0000000000b0', 'Cicilan', 'non_operating', false),
  ('a0000000-0000-4000-8000-0000000000e3', 'a0000000-0000-4000-8000-0000000000b0', 'Prive', 'drawing', true);
insert into public.devices (id, business_id, device_code) values
  ('a0000000-0000-4000-8000-0000000000f1', 'a0000000-0000-4000-8000-0000000000b0', 'A');

-- 10 Jan 2026 (WIB): one paid cash sale, one voided sale, three expenses of each kind and a
-- voided one. 11 Jan: an imported day.
insert into public.transactions (id, business_id, receipt_no, occurred_at, payment_method, total, cash_received, change_amount, status, void_reason, voided_at, device_id) values
  (gen_random_uuid(), 'a0000000-0000-4000-8000-0000000000b0', 'UA-260110-A0001', '2026-01-10 10:00+07', 'cash', 1000000, 1000000, 0, 'paid', null, null, 'a0000000-0000-4000-8000-0000000000f1'),
  (gen_random_uuid(), 'a0000000-0000-4000-8000-0000000000b0', 'UA-260110-A0002', '2026-01-10 11:00+07', 'qris', 50000, null, null, 'void', 'Salah input', '2026-01-10 11:05+07', 'a0000000-0000-4000-8000-0000000000f1');
insert into public.expenses (business_id, category_id, amount, source, occurred_at, device_id, status, void_reason, voided_at) values
  ('a0000000-0000-4000-8000-0000000000b0', 'a0000000-0000-4000-8000-0000000000e1', 400000, 'drawer', '2026-01-10 12:00+07', 'a0000000-0000-4000-8000-0000000000f1', 'active', null, null),
  ('a0000000-0000-4000-8000-0000000000b0', 'a0000000-0000-4000-8000-0000000000e2', 300000, 'owner', '2026-01-10 12:00+07', null, 'active', null, null),
  ('a0000000-0000-4000-8000-0000000000b0', 'a0000000-0000-4000-8000-0000000000e3', 200000, 'drawer', '2026-01-10 12:00+07', 'a0000000-0000-4000-8000-0000000000f1', 'active', null, null),
  ('a0000000-0000-4000-8000-0000000000b0', 'a0000000-0000-4000-8000-0000000000e1', 7000, 'drawer', '2026-01-10 12:00+07', 'a0000000-0000-4000-8000-0000000000f1', 'void', 'Salah input', '2026-01-10 12:01+07');
insert into public.historical_days (business_id, day_key, income) values
  ('a0000000-0000-4000-8000-0000000000b0', '2026-01-11', 2000000);
insert into public.historical_expenses (business_id, day_key, category_id, amount) values
  ('a0000000-0000-4000-8000-0000000000b0', '2026-01-11', 'a0000000-0000-4000-8000-0000000000e1', 700000);

set local role authenticated;
set local request.jwt.claims to '{"sub":"a0000000-0000-4000-8000-00000000000a","role":"authenticated"}';

-- Reserve movements go through RLS + the balance trigger.
insert into public.reserve_movements (business_id, type, amount, source) values
  ('a0000000-0000-4000-8000-0000000000b0', 'deposit', 200000, 'cash'),
  ('a0000000-0000-4000-8000-0000000000b0', 'deposit', 1000000, 'capital');
insert into public.reserve_movements (business_id, type, amount, reason) values
  ('a0000000-0000-4000-8000-0000000000b0', 'withdraw', 50000, 'Perbaikan mesin');

create temporary table totals on commit drop as
select * from public.period_totals(
  'a0000000-0000-4000-8000-0000000000b0', '2026-01-10 00:00+07', '2026-01-12 00:00+07');

select is((select income from totals), 3000000::bigint, 'income = paid sales + imported days');
select is((select operating_expense from totals), 1100000::bigint, 'operating expenses, live + imported');
select is((select non_operating_expense from totals), 300000::bigint, 'non-operating expenses');
select is((select drawings from totals), 200000::bigint, 'drawings');
select is((select operating_profit from totals), 1900000::bigint, 'operating profit = income − operating');
select is((select profit from totals), 1600000::bigint, 'profit = operating profit − non-operating; drawings excluded');
select is((select net_cash_flow from totals), 1400000::bigint, 'net cash flow = income − every expense');
select results_eq(
  'select transaction_count, income_cash, income_qris, drawer_expense, owner_expense from totals',
  $$values (1::bigint, 1000000::bigint, 0::bigint, 600000::bigint, 300000::bigint)$$,
  'voided rows never count; methods and sources are split'
);
select results_eq(
  'select historical_income, historical_days from totals',
  $$values (2000000::bigint, 1::bigint)$$,
  'imported share is reported separately'
);
select is(
  (select income from public.period_totals('a0000000-0000-4000-8000-0000000000b0', '2026-01-08 00:00+07', '2026-01-10 00:00+07')),
  0::bigint, 'the period boundary is the business-day start (WIB)'
);

select is(public.reserve_balance('a0000000-0000-4000-8000-0000000000b0'), 1150000::bigint,
  'reserve = deposits − withdrawals');
-- 100.000 opening + 1.000.000 income − 900.000 expenses − 200.000 cash deposit + 50.000 withdraw
select is(public.free_cash('a0000000-0000-4000-8000-0000000000b0'), 50000::bigint,
  'free cash counts drawings and reserve moves, never imported history');
select is(public.free_cash('a0000000-0000-4000-8000-0000000000b0', '2026-01-10 00:00+07'), 100000::bigint,
  'free cash before any activity is the opening cash');

select throws_ok(
  $$insert into public.reserve_movements (business_id, type, amount, reason)
    values ('a0000000-0000-4000-8000-0000000000b0', 'withdraw', 5000000, 'Terlalu besar')$$,
  '23514', 'Saldo cadangan tidak cukup', 'a withdrawal cannot exceed the reserve'
);
select throws_ok(
  $$insert into public.reserve_movements (business_id, type, amount)
    values ('a0000000-0000-4000-8000-0000000000b0', 'withdraw', 1000)$$,
  '23514', null, 'a withdrawal needs a reason'
);

reset role;
select throws_ok(
  $$insert into public.transactions (id, business_id, receipt_no, occurred_at, payment_method, total, status, voided_at, device_id)
    values (gen_random_uuid(), 'a0000000-0000-4000-8000-0000000000b0', 'UA-260110-A0009', now(), 'qris', 1000, 'void', now(), 'a0000000-0000-4000-8000-0000000000f1')$$,
  '23514', null, 'even a direct write cannot store a void without a reason'
);
select throws_ok(
  $$insert into public.expenses (business_id, category_id, amount, source, occurred_at, status, voided_at)
    values ('a0000000-0000-4000-8000-0000000000b0', 'a0000000-0000-4000-8000-0000000000e2', 1000, 'owner', now(), 'void', now())$$,
  '23514', null, '…for expenses too'
);

set local role authenticated;
set local request.jwt.claims to '{"sub":"a0000000-0000-4000-8000-00000000000c","role":"authenticated"}';
select throws_ok(
  $$insert into public.reserve_movements (business_id, type, amount, source)
    values ('a0000000-0000-4000-8000-0000000000b0', 'deposit', 1000, 'cash')$$,
  '42501', null, 'the cashier cannot touch the reserve'
);

select * from finish();
rollback;
