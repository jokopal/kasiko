-- Vehicles per day (decision #43), the receipt price-edit switch (#44), imported Olsera item sales
-- (#45) and the cashier password vault (#46). The vehicle cases match
-- src/features/reports/daily-stats.test.ts.
begin;
create extension if not exists pgtap with schema extensions;
select plan(25);

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
  ('a0000000-0000-4000-8000-0000000000c3', 'a0000000-0000-4000-8000-0000000000b0', 'Tambahan', 2, false),
  ('b0000000-0000-4000-8000-0000000000c1', 'b0000000-0000-4000-8000-0000000000b0', 'Cuci B', 0, true);
insert into public.catalog_items (id, business_id, category_id, name, price, is_active) values
  ('a0000000-0000-4000-8000-0000000000d1', 'a0000000-0000-4000-8000-0000000000b0', 'a0000000-0000-4000-8000-0000000000c1', 'Cuci Sedang', 50000, true),
  ('a0000000-0000-4000-8000-0000000000d2', 'a0000000-0000-4000-8000-0000000000b0', 'a0000000-0000-4000-8000-0000000000c2', 'Cuci Motor', 15000, true),
  ('a0000000-0000-4000-8000-0000000000d3', 'a0000000-0000-4000-8000-0000000000b0', 'a0000000-0000-4000-8000-0000000000c3', 'Cuci Mesin', 10000, true),
  ('a0000000-0000-4000-8000-0000000000d4', 'a0000000-0000-4000-8000-0000000000b0', 'a0000000-0000-4000-8000-0000000000c1', 'Poles Lama', 90000, false),
  ('b0000000-0000-4000-8000-0000000000d1', 'b0000000-0000-4000-8000-0000000000b0', 'b0000000-0000-4000-8000-0000000000c1', 'Cuci B', 40000, true);
insert into public.devices (id, business_id, device_code) values
  ('a0000000-0000-4000-8000-0000000000f1', 'a0000000-0000-4000-8000-0000000000b0', 'A');

-- 10 Feb 2026: sale 1 = Sedang + Mesin, sale 2 = 2 × Motor, sale 3 voided.
insert into public.transactions (id, business_id, receipt_no, occurred_at, payment_method, subtotal, total, cash_received, change_amount, device_id, status, void_reason, voided_at) values
  ('a0000000-0000-4000-8000-000000000701', 'a0000000-0000-4000-8000-0000000000b0', 'UA-260210-A0001', '2026-02-10 09:00+07', 'cash', 60000, 60000, 60000, 0, 'a0000000-0000-4000-8000-0000000000f1', 'paid', null, null),
  ('a0000000-0000-4000-8000-000000000702', 'a0000000-0000-4000-8000-0000000000b0', 'UA-260210-A0002', '2026-02-10 10:00+07', 'qris', 30000, 30000, null, null, 'a0000000-0000-4000-8000-0000000000f1', 'paid', null, null),
  ('a0000000-0000-4000-8000-000000000703', 'a0000000-0000-4000-8000-0000000000b0', 'UA-260210-A0003', '2026-02-10 11:00+07', 'cash', 50000, 50000, 50000, 0, 'a0000000-0000-4000-8000-0000000000f1', 'void', 'Salah input', now());
insert into public.transaction_items (id, business_id, transaction_id, position, catalog_item_id, name_snapshot, price_snapshot, qty, line_total) values
  ('a0000000-0000-4000-8000-000000000801', 'a0000000-0000-4000-8000-0000000000b0', 'a0000000-0000-4000-8000-000000000701', 1, 'a0000000-0000-4000-8000-0000000000d1', 'Cuci Sedang', 50000, 1, 50000),
  ('a0000000-0000-4000-8000-000000000802', 'a0000000-0000-4000-8000-0000000000b0', 'a0000000-0000-4000-8000-000000000701', 2, 'a0000000-0000-4000-8000-0000000000d3', 'Cuci Mesin', 10000, 1, 10000),
  ('a0000000-0000-4000-8000-000000000803', 'a0000000-0000-4000-8000-0000000000b0', 'a0000000-0000-4000-8000-000000000702', 1, 'a0000000-0000-4000-8000-0000000000d2', 'Cuci Motor', 15000, 2, 30000),
  ('a0000000-0000-4000-8000-000000000804', 'a0000000-0000-4000-8000-0000000000b0', 'a0000000-0000-4000-8000-000000000703', 1, 'a0000000-0000-4000-8000-0000000000d1', 'Cuci Sedang', 50000, 1, 50000);
-- Imported Excel income: two business days in January 2026.
insert into public.historical_days (business_id, day_key, income) values
  ('a0000000-0000-4000-8000-0000000000b0', '2026-01-05', 300000),
  ('a0000000-0000-4000-8000-0000000000b0', '2026-01-06', 250000),
  ('a0000000-0000-4000-8000-0000000000b0', '2026-01-07', 0);

-- ---------------------------------------------------------------------------
-- Import item sales (owner)
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims to '{"sub":"a0000000-0000-4000-8000-00000000000c","role":"authenticated"}';

select throws_ok(
  $$select public.import_item_sales('a0000000-0000-4000-8000-0000000000b0', 'olsera', '[]'::jsonb)$$,
  '42501', null, 'the cashier cannot import item sales'
);
select is(
  (select count(*)::integer from public.historical_item_sales),
  0, 'the cashier cannot read imported item sales'
);

set local request.jwt.claims to '{"sub":"a0000000-0000-4000-8000-00000000000a","role":"authenticated"}';

select is(
  public.import_item_sales('a0000000-0000-4000-8000-0000000000b0', 'olsera', $$[
    {"first_day": "2026-01-01", "last_day": "2026-01-31", "rows": [
      {"product": "Mobil Sedang", "product_group": "Cuci Standart", "catalog_item_id": "a0000000-0000-4000-8000-0000000000d1", "qty": 10, "orders": 10, "amount": 500000},
      {"product": "Cuci Mesin Mobil", "catalog_item_id": "a0000000-0000-4000-8000-0000000000d3", "qty": 4, "orders": 4, "amount": 40000},
      {"product": "Custom", "product_group": "CUSTOM", "qty": 2, "orders": 2, "amount": 100000}
    ]},
    {"first_day": "2026-02-01", "last_day": "2026-02-28", "rows": [
      {"product": "Mobil Sedang", "catalog_item_id": "a0000000-0000-4000-8000-0000000000d1", "qty": 3, "orders": 3, "amount": 150000}
    ]}
  ]$$::jsonb, '{"mobil sedang": "a0000000-0000-4000-8000-0000000000d1", "custom": "skip"}'::jsonb),
  2, 'the owner imports two monthly reports'
);
select is(
  (select last_day from public.historical_item_sales where first_day = '2026-02-01' and product = 'Mobil Sedang'),
  '2026-02-09'::date, 'a report reaching cashier data ends the day before the first sale'
);
select is(
  (select item_mapping ->> 'mobil sedang' from public.business_configs where business_id = 'a0000000-0000-4000-8000-0000000000b0'),
  'a0000000-0000-4000-8000-0000000000d1', 'the product mapping is remembered'
);
select throws_ok(
  $$select public.import_item_sales('a0000000-0000-4000-8000-0000000000b0', 'olsera',
    '[{"first_day": "2026-02-10", "last_day": "2026-02-28", "rows": []}]'::jsonb)$$,
  '23505', null, 'a report starting on a cashier day is refused'
);
select throws_ok(
  $$select public.import_item_sales('a0000000-0000-4000-8000-0000000000b0', 'olsera', '[]'::jsonb,
    '{"x": "b0000000-0000-4000-8000-0000000000d1"}'::jsonb)$$,
  '23503', null, 'a mapping to another business item is refused'
);
select throws_ok(
  $$select public.import_item_sales('a0000000-0000-4000-8000-0000000000b0', 'olsera',
    '[{"first_day": "2025-12-01", "last_day": "2025-12-31", "rows": [{"product": "X", "catalog_item_id": "b0000000-0000-4000-8000-0000000000d1", "qty": 1, "amount": 1}]}]'::jsonb)$$,
  '23503', null, 'an item sale linked to another business item is refused'
);
select is(
  public.import_item_sales('a0000000-0000-4000-8000-0000000000b0', 'olsera', $$[
    {"first_day": "2026-01-01", "last_day": "2026-01-31", "rows": [
      {"product": "Mobil Sedang", "catalog_item_id": "a0000000-0000-4000-8000-0000000000d1", "qty": 10, "orders": 10, "amount": 500000},
      {"product": "Cuci Mesin Mobil", "catalog_item_id": "a0000000-0000-4000-8000-0000000000d3", "qty": 4, "orders": 4, "amount": 40000},
      {"product": "Custom", "qty": 2, "orders": 2, "amount": 100000}
    ]}
  ]$$::jsonb),
  1, 're-importing a report replaces it'
);
select is(
  (select count(*)::integer from public.historical_item_sales where first_day = '2026-01-01'),
  3, 'no duplicate rows after a re-import'
);

-- ---------------------------------------------------------------------------
-- Aggregates
-- ---------------------------------------------------------------------------

select results_eq(
  $$select name, qty, revenue from public.top_items('a0000000-0000-4000-8000-0000000000b0', '2026-01-01 00:00+07', '2026-02-01 00:00+07')$$,
  $$values ('Cuci Sedang'::text, 10::bigint, 500000::bigint), ('Custom'::text, 2::bigint, 100000::bigint), ('Cuci Mesin'::text, 4::bigint, 40000::bigint)$$,
  'top items include a whole imported month, named after the catalog item'
);
select results_eq(
  $$select name, qty, revenue from public.top_items('a0000000-0000-4000-8000-0000000000b0', '2026-01-01 00:00+07', '2026-01-20 00:00+07')$$,
  $$select null::text, null::bigint, null::bigint where false$$,
  'a monthly report does not count in a range that cuts the month'
);
select results_eq(
  $$select category_name, vehicles, days from public.vehicle_summary('a0000000-0000-4000-8000-0000000000b0', '2026-01-01 00:00+07', '2026-02-01 00:00+07')$$,
  $$values ('Cuci Mobil'::text, 10::bigint, 2)$$,
  'January: add-ons are not vehicles; days = imported days with income'
);
select results_eq(
  $$select category_name, vehicles, days from public.vehicle_summary('a0000000-0000-4000-8000-0000000000b0', '2026-02-01 00:00+07', '2026-03-01 00:00+07')$$,
  $$values ('Cuci Mobil'::text, 4::bigint, 10), ('Cuci Motor'::text, 2::bigint, 10)$$,
  'February: imported 1–9 Feb (9 days, no imported income) + one cashier day; voids ignored'
);
select results_eq(
  $$select day_key, income, vehicles, transactions from public.daily_summary('a0000000-0000-4000-8000-0000000000b0', '2026-02-09', '2026-02-10')$$,
  $$values ('2026-02-09'::date, 0::bigint, 0::bigint, 0::bigint), ('2026-02-10'::date, 90000::bigint, 3::bigint, 2::bigint)$$,
  'daily summary: vehicles and paid transactions per day'
);

update public.catalog_items set name = 'Cuci Mobil Sedang' where id = 'a0000000-0000-4000-8000-0000000000d1';
select results_eq(
  $$select name, qty from public.top_items('a0000000-0000-4000-8000-0000000000b0', '2026-02-10 00:00+07', '2026-02-11 00:00+07', 1)$$,
  $$values ('Cuci Mobil Sedang'::text, 1::bigint)$$,
  'a renamed service keeps one row under its new name'
);

set local request.jwt.claims to '{"sub":"b0000000-0000-4000-8000-00000000000a","role":"authenticated"}';
select throws_ok(
  $$select * from public.vehicle_summary('a0000000-0000-4000-8000-0000000000b0', '2026-01-01 00:00+07', '2026-02-01 00:00+07')$$,
  '42501', null, 'another owner cannot read the vehicle summary'
);
select is(
  (select count(*)::integer from public.historical_item_sales),
  0, 'another owner cannot read imported item sales'
);

-- ---------------------------------------------------------------------------
-- Receipt price-edit switch (decision #44, revised in migration 0900)
-- ---------------------------------------------------------------------------

set local request.jwt.claims to '{"sub":"a0000000-0000-4000-8000-00000000000c","role":"authenticated"}';

select is(
  (select cashier_can_edit_prices from public.business_branding where id = 'a0000000-0000-4000-8000-0000000000b0'),
  false, 'the cashier sees the price switch, off by default'
);

set local request.jwt.claims to '{"sub":"a0000000-0000-4000-8000-00000000000a","role":"authenticated"}';
update public.businesses set cashier_can_edit_prices = true where id = 'a0000000-0000-4000-8000-0000000000b0';

set local request.jwt.claims to '{"sub":"a0000000-0000-4000-8000-00000000000c","role":"authenticated"}';
select is(
  (select cashier_can_edit_prices from public.business_branding where id = 'a0000000-0000-4000-8000-0000000000b0'),
  true, 'the cashier sees the switch the owner turned on'
);

reset role;

-- ---------------------------------------------------------------------------
-- Templates and the cashier password vault
-- ---------------------------------------------------------------------------

select public.apply_template_rows('b0000000-0000-4000-8000-0000000000b0',
  '{"catalog": [{"category": "Tambahan B", "countsVehicles": false, "items": []}]}'::jsonb);
select is(
  (select counts_vehicles from public.catalog_categories where business_id = 'b0000000-0000-4000-8000-0000000000b0' and name = 'Tambahan B'),
  false, 'a template category can opt out of the vehicle count'
);

select public.cashier_password_save('a0000000-0000-4000-8000-0000000000b0', 'rahasia123');
select public.cashier_password_save('a0000000-0000-4000-8000-0000000000b0', 'rahasia456');
select is(
  public.cashier_password_read('a0000000-0000-4000-8000-0000000000b0', 'a0000000-0000-4000-8000-00000000000a'),
  'rahasia456', 'the latest cashier password is read back from the vault'
);
select is(
  (select count(*)::integer from public.audit_log where entity = 'cashier_password' and action = 'reveal'
     and actor_id = 'a0000000-0000-4000-8000-00000000000a'),
  1, 'reading the password is logged'
);
select is(
  public.cashier_password_status('b0000000-0000-4000-8000-0000000000b0'),
  false, 'no stored password for a business that never saved one'
);

set local role authenticated;
set local request.jwt.claims to '{"sub":"a0000000-0000-4000-8000-00000000000a","role":"authenticated"}';
select throws_ok(
  $$select public.cashier_password_read('a0000000-0000-4000-8000-0000000000b0', 'a0000000-0000-4000-8000-00000000000a')$$,
  '42501', null, 'the app itself can never read the password vault'
);

select * from finish();
rollback;
