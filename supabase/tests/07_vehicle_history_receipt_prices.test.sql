-- Vehicle history per day and per month (decision #43) and the catalog price kept next to
-- a receipt line whose price was edited before saving (#44, revised). The monthly cases
-- match src/features/reports/vehicle-report.test.ts.
begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

insert into auth.users (id, email) values
  ('a0000000-0000-4000-8000-00000000000a', 'owner-a@kasiko.test'),
  ('a0000000-0000-4000-8000-00000000000c', 'kasir-a@kasiko.test'),
  ('b0000000-0000-4000-8000-00000000000a', 'owner-b@kasiko.test');
insert into public.businesses (id, owner_id, name, receipt_prefix, timezone) values
  ('a0000000-0000-4000-8000-0000000000b0', 'a0000000-0000-4000-8000-00000000000a', 'Usaha A', 'UA', 'Asia/Jakarta'),
  ('b0000000-0000-4000-8000-0000000000b0', 'b0000000-0000-4000-8000-00000000000a', 'Usaha B', 'UB', 'Asia/Jakarta');
insert into public.business_configs (business_id) values
  ('a0000000-0000-4000-8000-0000000000b0'), ('b0000000-0000-4000-8000-0000000000b0');
insert into public.business_members (business_id, user_id, role) values
  ('a0000000-0000-4000-8000-0000000000b0', 'a0000000-0000-4000-8000-00000000000a', 'owner'),
  ('a0000000-0000-4000-8000-0000000000b0', 'a0000000-0000-4000-8000-00000000000c', 'cashier'),
  ('b0000000-0000-4000-8000-0000000000b0', 'b0000000-0000-4000-8000-00000000000a', 'owner');
insert into public.catalog_categories (id, business_id, name, sort_order, counts_vehicles) values
  ('a0000000-0000-4000-8000-0000000000c1', 'a0000000-0000-4000-8000-0000000000b0', 'Cuci Mobil', 0, true),
  ('a0000000-0000-4000-8000-0000000000c2', 'a0000000-0000-4000-8000-0000000000b0', 'Cuci Motor', 1, true),
  ('a0000000-0000-4000-8000-0000000000c3', 'a0000000-0000-4000-8000-0000000000b0', 'Tambahan', 2, false);
insert into public.catalog_items (id, business_id, category_id, name, price, is_active) values
  ('a0000000-0000-4000-8000-0000000000d1', 'a0000000-0000-4000-8000-0000000000b0', 'a0000000-0000-4000-8000-0000000000c1', 'Cuci Sedang', 50000, true),
  ('a0000000-0000-4000-8000-0000000000d2', 'a0000000-0000-4000-8000-0000000000b0', 'a0000000-0000-4000-8000-0000000000c2', 'Cuci Motor', 15000, true),
  ('a0000000-0000-4000-8000-0000000000d3', 'a0000000-0000-4000-8000-0000000000b0', 'a0000000-0000-4000-8000-0000000000c3', 'Cuci Mesin', 10000, true);
insert into public.devices (id, business_id, device_code) values
  ('a0000000-0000-4000-8000-0000000000f1', 'a0000000-0000-4000-8000-0000000000b0', 'A');

-- 10 Feb: Sedang (price edited to 40.000) + Mesin; 11 Feb: 2 × Motor; 11 Feb: voided Sedang.
insert into public.transactions (id, business_id, receipt_no, occurred_at, payment_method, subtotal, total, cash_received, change_amount, device_id, status, void_reason, voided_at) values
  ('a0000000-0000-4000-8000-000000000701', 'a0000000-0000-4000-8000-0000000000b0', 'UA-260210-A0001', '2026-02-10 09:00+07', 'cash', 50000, 50000, 50000, 0, 'a0000000-0000-4000-8000-0000000000f1', 'paid', null, null),
  ('a0000000-0000-4000-8000-000000000702', 'a0000000-0000-4000-8000-0000000000b0', 'UA-260211-A0001', '2026-02-11 23:30+07', 'qris', 30000, 30000, null, null, 'a0000000-0000-4000-8000-0000000000f1', 'paid', null, null),
  ('a0000000-0000-4000-8000-000000000703', 'a0000000-0000-4000-8000-0000000000b0', 'UA-260211-A0002', '2026-02-11 11:00+07', 'cash', 50000, 50000, 50000, 0, 'a0000000-0000-4000-8000-0000000000f1', 'void', 'Salah input', now());
insert into public.transaction_items (id, business_id, transaction_id, position, catalog_item_id, name_snapshot, price_snapshot, qty, line_total) values
  ('a0000000-0000-4000-8000-000000000801', 'a0000000-0000-4000-8000-0000000000b0', 'a0000000-0000-4000-8000-000000000701', 1, 'a0000000-0000-4000-8000-0000000000d1', 'Cuci Sedang', 40000, 1, 40000),
  ('a0000000-0000-4000-8000-000000000802', 'a0000000-0000-4000-8000-0000000000b0', 'a0000000-0000-4000-8000-000000000701', 2, 'a0000000-0000-4000-8000-0000000000d3', 'Cuci Mesin', 10000, 1, 10000),
  ('a0000000-0000-4000-8000-000000000803', 'a0000000-0000-4000-8000-0000000000b0', 'a0000000-0000-4000-8000-000000000702', 1, 'a0000000-0000-4000-8000-0000000000d2', 'Cuci Motor', 15000, 2, 30000),
  ('a0000000-0000-4000-8000-000000000804', 'a0000000-0000-4000-8000-0000000000b0', 'a0000000-0000-4000-8000-000000000703', 1, 'a0000000-0000-4000-8000-0000000000d1', 'Cuci Sedang', 50000, 1, 50000);
-- Olsera January and February (February overlaps live sales; both are reported by source).
insert into public.historical_item_sales (business_id, source, first_day, last_day, product, catalog_item_id, qty, orders, amount) values
  ('a0000000-0000-4000-8000-0000000000b0', 'olsera', '2026-01-01', '2026-01-31', 'Mobil Sedang', 'a0000000-0000-4000-8000-0000000000d1', 10, 10, 500000),
  ('a0000000-0000-4000-8000-0000000000b0', 'olsera', '2026-01-01', '2026-01-31', 'Cuci Mesin Mobil', 'a0000000-0000-4000-8000-0000000000d3', 4, 4, 40000),
  ('a0000000-0000-4000-8000-0000000000b0', 'olsera', '2026-01-01', '2026-01-31', 'Custom', null, 2, 2, 100000),
  ('a0000000-0000-4000-8000-0000000000b0', 'olsera', '2026-02-01', '2026-02-09', 'Cuci Motor 100-145 CC', 'a0000000-0000-4000-8000-0000000000d2', 3, 3, 45000);

select results_eq(
  $$select price_snapshot, catalog_price from public.transaction_items
    where id in ('a0000000-0000-4000-8000-000000000801', 'a0000000-0000-4000-8000-000000000803') order by position, id$$,
  $$values (40000::bigint, 50000::bigint), (15000::bigint, 15000::bigint)$$,
  'every new line keeps the catalog price next to the price on the receipt'
);
select hasnt_function('public', 'cashier_set_item_price', 'the cashier can no longer change catalog prices');

set local role authenticated;
set local request.jwt.claims to '{"sub":"a0000000-0000-4000-8000-00000000000a","role":"authenticated"}';

select results_eq(
  $$select day_key, category_name, vehicles from public.vehicle_days(
    'a0000000-0000-4000-8000-0000000000b0', '2026-02-01 00:00+07', '2026-03-01 00:00+07')$$,
  $$values ('2026-02-10'::date, 'Cuci Mobil', 1::bigint), ('2026-02-11'::date, 'Cuci Motor', 2::bigint)$$,
  'vehicles per day: paid sales in vehicle categories, days in the business time zone'
);
select is(
  (select count(*)::integer from public.vehicle_days(
    'a0000000-0000-4000-8000-0000000000b0', '2026-02-11 00:00+07', '2026-02-11 12:00+07')),
  0, 'the range is half open and voided sales never count'
);
select results_eq(
  $$select month_key, category_name, source, vehicles from public.vehicle_months('a0000000-0000-4000-8000-0000000000b0')$$,
  $$values
    ('2026-01-01'::date, 'Cuci Mobil', 'olsera', 10::bigint),
    ('2026-02-01'::date, 'Cuci Mobil', 'kasir', 1::bigint),
    ('2026-02-01'::date, 'Cuci Motor', 'kasir', 2::bigint),
    ('2026-02-01'::date, 'Cuci Motor', 'olsera', 3::bigint)$$,
  'vehicles per month: live sales and Olsera reports, unlinked products and extras left out'
);
select results_eq(
  $$select month_key, item_name, source, vehicles from public.vehicle_months('a0000000-0000-4000-8000-0000000000b0')
    where category_name = 'Cuci Motor'$$,
  $$values ('2026-02-01'::date, 'Cuci Motor', 'kasir', 2::bigint), ('2026-02-01'::date, 'Cuci Motor', 'olsera', 3::bigint)$$,
  'each month row names its catalog item (migration 1000)'
);
select results_eq(
  $$select day_key, item_name, vehicles from public.vehicle_days(
    'a0000000-0000-4000-8000-0000000000b0', '2026-02-10 00:00+07', '2026-02-11 00:00+07')$$,
  $$values ('2026-02-10'::date, 'Cuci Sedang', 1::bigint)$$,
  'each day row names its catalog item'
);

set local request.jwt.claims to '{"sub":"a0000000-0000-4000-8000-00000000000c","role":"authenticated"}';
select throws_ok(
  $$select * from public.vehicle_months('a0000000-0000-4000-8000-0000000000b0')$$,
  '42501', null, 'the cashier cannot read the vehicle history'
);
select throws_ok(
  $$select * from public.vehicle_days('a0000000-0000-4000-8000-0000000000b0', '2026-02-01', '2026-03-01')$$,
  '42501', null, 'the cashier cannot read vehicles per day'
);

set local request.jwt.claims to '{"sub":"b0000000-0000-4000-8000-00000000000a","role":"authenticated"}';
select throws_ok(
  $$select * from public.vehicle_months('a0000000-0000-4000-8000-0000000000b0')$$,
  '42501', null, 'another owner cannot read the vehicle history'
);

reset role;
set local role anon;
select throws_ok(
  $$select * from public.vehicle_months('a0000000-0000-4000-8000-0000000000b0')$$,
  '42501', null, 'anon has no access'
);

select * from finish();
rollback;
