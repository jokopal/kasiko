-- Pay-at-the-end orders (decision #34), owner-activated discounts (#35) and the owner
-- aggregates behind the dashboard and monthly recap.
begin;
create extension if not exists pgtap with schema extensions;
select plan(34);

insert into auth.users (id, email) values
  ('a0000000-0000-4000-8000-00000000000a', 'owner-a@kasiko.test'),
  ('a0000000-0000-4000-8000-00000000000c', 'kasir-a@kasiko.test'),
  ('b0000000-0000-4000-8000-00000000000a', 'owner-b@kasiko.test');
insert into public.businesses (id, owner_id, name, receipt_prefix) values
  ('a0000000-0000-4000-8000-0000000000b0', 'a0000000-0000-4000-8000-00000000000a', 'Usaha A', 'UA'),
  ('b0000000-0000-4000-8000-0000000000b0', 'b0000000-0000-4000-8000-00000000000a', 'Usaha B', 'UB');
insert into public.business_members (business_id, user_id, role) values
  ('a0000000-0000-4000-8000-0000000000b0', 'a0000000-0000-4000-8000-00000000000a', 'owner'),
  ('a0000000-0000-4000-8000-0000000000b0', 'a0000000-0000-4000-8000-00000000000c', 'cashier'),
  ('b0000000-0000-4000-8000-0000000000b0', 'b0000000-0000-4000-8000-00000000000a', 'owner');
insert into public.catalog_categories (id, business_id, name) values
  ('a0000000-0000-4000-8000-0000000000c1', 'a0000000-0000-4000-8000-0000000000b0', 'Cuci');
insert into public.catalog_items (id, business_id, category_id, name, price) values
  ('a0000000-0000-4000-8000-0000000000d1', 'a0000000-0000-4000-8000-0000000000b0', 'a0000000-0000-4000-8000-0000000000c1', 'Cuci Sedang', 45000),
  ('a0000000-0000-4000-8000-0000000000d2', 'a0000000-0000-4000-8000-0000000000b0', 'a0000000-0000-4000-8000-0000000000c1', 'Semir Ban', 10000);
insert into public.expense_categories (id, business_id, name, kind) values
  ('a0000000-0000-4000-8000-0000000000e1', 'a0000000-0000-4000-8000-0000000000b0', 'Makan', 'operating'),
  ('a0000000-0000-4000-8000-0000000000e2', 'a0000000-0000-4000-8000-0000000000b0', 'Cicilan', 'non_operating');
insert into public.devices (id, business_id, device_code) values
  ('a0000000-0000-4000-8000-0000000000f1', 'a0000000-0000-4000-8000-0000000000b0', 'A');
insert into public.discounts (id, business_id, name, type, value, is_active) values
  ('a0000000-0000-4000-8000-0000000000a1', 'a0000000-0000-4000-8000-0000000000b0', 'Member 10%', 'percent', 10, true),
  ('a0000000-0000-4000-8000-0000000000a2', 'a0000000-0000-4000-8000-0000000000b0', 'Promo Lama', 'amount', 5000, false),
  ('a0000000-0000-4000-8000-0000000000a3', 'a0000000-0000-4000-8000-0000000000b0', 'Gede', 'amount', 60000, true),
  ('b0000000-0000-4000-8000-0000000000a1', 'b0000000-0000-4000-8000-0000000000b0', 'Diskon B', 'percent', 50, true);

-- 10 Jan 2026 WIB: two paid sales (one discounted) and expenses; 11 Jan: an imported day.
insert into public.transactions (id, business_id, receipt_no, occurred_at, payment_method, subtotal, discount_id, discount_name, discount_type, discount_value, discount_amount, total, device_id) values
  ('a0000000-0000-4000-8000-000000000301', 'a0000000-0000-4000-8000-0000000000b0', 'UA-260110-A0001', '2026-01-10 09:15+07', 'qris', 55000, 'a0000000-0000-4000-8000-0000000000a1', 'Member 10%', 'percent', 10, 5500, 49500, 'a0000000-0000-4000-8000-0000000000f1'),
  ('a0000000-0000-4000-8000-000000000302', 'a0000000-0000-4000-8000-0000000000b0', 'UA-260110-A0002', '2026-01-10 14:40+07', 'qris', 45000, null, null, null, null, 0, 45000, 'a0000000-0000-4000-8000-0000000000f1');
insert into public.transaction_items (id, business_id, transaction_id, position, name_snapshot, price_snapshot, qty, line_total) values
  (gen_random_uuid(), 'a0000000-0000-4000-8000-0000000000b0', 'a0000000-0000-4000-8000-000000000301', 1, 'Cuci Sedang', 45000, 1, 45000),
  (gen_random_uuid(), 'a0000000-0000-4000-8000-0000000000b0', 'a0000000-0000-4000-8000-000000000301', 2, 'Semir Ban', 10000, 1, 10000),
  (gen_random_uuid(), 'a0000000-0000-4000-8000-0000000000b0', 'a0000000-0000-4000-8000-000000000302', 1, 'Cuci Sedang', 45000, 1, 45000);
insert into public.expenses (business_id, category_id, amount, source, occurred_at) values
  ('a0000000-0000-4000-8000-0000000000b0', 'a0000000-0000-4000-8000-0000000000e1', 30000, 'owner', '2026-01-10 12:00+07'),
  ('a0000000-0000-4000-8000-0000000000b0', 'a0000000-0000-4000-8000-0000000000e2', 100000, 'owner', '2026-01-10 12:00+07');
insert into public.historical_days (business_id, day_key, income) values
  ('a0000000-0000-4000-8000-0000000000b0', '2026-01-11', 2000000);
insert into public.historical_expenses (business_id, day_key, category_id, amount) values
  ('a0000000-0000-4000-8000-0000000000b0', '2026-01-11', 'a0000000-0000-4000-8000-0000000000e1', 700000);

create function pg_temp.sale(p_id text, p_receipt text, p_overrides jsonb default '{}')
returns jsonb language sql as $$
  select jsonb_build_object(
    'id', p_id,
    'business_id', 'a0000000-0000-4000-8000-0000000000b0',
    'receipt_no', p_receipt,
    'occurred_at', now(),
    'payment_method', 'cash',
    'subtotal', 55000,
    'discount_id', 'a0000000-0000-4000-8000-0000000000a1',
    'discount_name', 'Member 10%',
    'discount_type', 'percent',
    'discount_value', 10,
    'discount_amount', 5500,
    'total', 49500,
    'cash_received', 50000,
    'change_amount', 500,
    'device_id', 'a0000000-0000-4000-8000-0000000000f1',
    'items', jsonb_build_array(
      jsonb_build_object('name_snapshot', 'Cuci Sedang', 'price_snapshot', 45000, 'qty', 1, 'line_total', 45000),
      jsonb_build_object('name_snapshot', 'Semir Ban', 'price_snapshot', 10000, 'qty', 1, 'line_total', 10000)
    )
  ) || p_overrides;
$$;
create function pg_temp.order_payload(p_id text, p_edited timestamptz, p_qty integer default 1)
returns jsonb language sql as $$
  select jsonb_build_object(
    'id', p_id,
    'business_id', 'a0000000-0000-4000-8000-0000000000b0',
    'device_id', 'a0000000-0000-4000-8000-0000000000f1',
    'plate_number', ' b 77 ok ',
    'opened_at', now() - interval '30 minutes',
    'device_updated_at', p_edited,
    'items', jsonb_build_array(jsonb_build_object(
      'catalog_item_id', 'a0000000-0000-4000-8000-0000000000d1', 'name', 'Cuci Sedang',
      'price', 45000, 'qty', p_qty))
  );
$$;
grant execute on function pg_temp.sale(text, text, jsonb), pg_temp.order_payload(text, timestamptz, integer)
  to authenticated;

-- ---------------------------------------------------------------------------
-- Cashier: discounts (decision #35)
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub":"a0000000-0000-4000-8000-00000000000c","role":"authenticated"}';

select results_eq(
  'select name from public.discounts order by name',
  $$values ('Gede'::text), ('Member 10%'::text)$$,
  'the cashier sees only active discounts of their business'
);
select is(
  (public.create_transaction(pg_temp.sale('a0000000-0000-4000-8000-000000000401', 'UA-261025-A0001')) ->> 'discount_amount')::bigint,
  5500::bigint, 'a 10% discount is recomputed and stored'
);
select results_eq(
  $$select subtotal, total, change_amount, discount_name from public.transactions
    where id = 'a0000000-0000-4000-8000-000000000401'$$,
  $$values (55000::bigint, 49500::bigint, 500::bigint, 'Member 10%'::text)$$,
  'subtotal, total and change follow the discount'
);
select throws_ok(
  $$select public.create_transaction(pg_temp.sale('a0000000-0000-4000-8000-000000000402', 'UA-261025-A0002', '{"discount_amount": 9999, "total": 45001, "cash_received": 50000, "change_amount": 4999}'))$$,
  '23514', 'Diskon tidak cocok', 'a discount amount that does not match its preset is refused'
);
select throws_ok(
  $$select public.create_transaction(pg_temp.sale('a0000000-0000-4000-8000-000000000403', 'UA-261025-A0003', '{"discount_id": "b0000000-0000-4000-8000-0000000000a1"}'))$$,
  '23503', 'Diskon tidak valid', 'a discount of another business is refused'
);
select throws_ok(
  $$select public.create_transaction(pg_temp.sale('a0000000-0000-4000-8000-000000000404', 'UA-261025-A0004',
    '{"discount_id": "a0000000-0000-4000-8000-0000000000a3", "discount_type": "amount", "discount_value": 60000, "discount_amount": 60000, "total": -5000}'))$$,
  '23514', 'Diskon tidak boleh melebihi total', 'a discount can never reach the subtotal'
);
select throws_ok(
  $$select public.create_transaction(pg_temp.sale('a0000000-0000-4000-8000-000000000405', 'UA-261025-A0005',
    '{"discount_id": null, "discount_amount": 5500}'))$$,
  '23514', 'Diskon tidak cocok', 'no free-form discount without a preset'
);
select is(
  (public.create_transaction(pg_temp.sale('a0000000-0000-4000-8000-000000000406', 'UA-261025-A0006',
    '{"discount_id": "a0000000-0000-4000-8000-0000000000a2", "discount_name": "Promo Lama", "discount_type": "amount", "discount_value": 5000, "discount_amount": 5000, "total": 50000, "cash_received": 50000, "change_amount": 0}')) ->> 'total')::bigint,
  50000::bigint, 'a preset switched off while the device was offline is still honoured (snapshot)'
);

-- ---------------------------------------------------------------------------
-- Cashier: orders (decision #34)
-- ---------------------------------------------------------------------------
select results_eq(
  $$select status::text, total, plate_number from jsonb_to_record(
      public.save_order(pg_temp.order_payload('a0000000-0000-4000-8000-000000000501', now() - interval '20 minutes')))
      as o(status text, total bigint, plate_number text)$$,
  $$values ('open'::text, 45000::bigint, 'B 77 OK'::text)$$,
  'a car is checked in as an open order with its total computed'
);
select is(
  (public.save_order(pg_temp.order_payload('a0000000-0000-4000-8000-000000000501', now() - interval '25 minutes', 3)) ->> 'total')::bigint,
  45000::bigint, 'an older edit (late sync) does not overwrite a newer one'
);
select is(
  (public.save_order(pg_temp.order_payload('a0000000-0000-4000-8000-000000000501', now() - interval '10 minutes', 2)) ->> 'total')::bigint,
  90000::bigint, 'a newer edit updates the draft'
);
select is((select count(*)::int from public.orders where status = 'open'), 1, 'the cashier sees open orders');
select is(
  public.create_transaction(pg_temp.sale('a0000000-0000-4000-8000-000000000502', 'UA-261025-A0007',
    jsonb_build_object('order_id', 'a0000000-0000-4000-8000-000000000501', 'discount_id', null, 'discount_amount', 0,
      'subtotal', 90000, 'total', 90000, 'cash_received', 100000, 'change_amount', 10000,
      'items', jsonb_build_array(jsonb_build_object('name_snapshot', 'Cuci Sedang', 'price_snapshot', 45000, 'qty', 2, 'line_total', 90000))))) ->> 'order_id',
  'a0000000-0000-4000-8000-000000000501', 'paying records the sale against the order'
);
select results_eq(
  $$select status::text, transaction_id from public.orders where id = 'a0000000-0000-4000-8000-000000000501'$$,
  $$values ('paid'::text, 'a0000000-0000-4000-8000-000000000502'::uuid)$$,
  'the order is closed in the same database transaction'
);
select throws_ok(
  $$select public.create_transaction(pg_temp.sale('a0000000-0000-4000-8000-000000000503', 'UA-261025-A0008',
    '{"order_id": "a0000000-0000-4000-8000-000000000501"}'))$$,
  '23505', 'Pesanan ini sudah dibayar', 'an order is paid only once'
);
select is(
  public.save_order(pg_temp.order_payload('a0000000-0000-4000-8000-000000000501', now())) ->> 'status',
  'paid', 'a late edit of a paid order changes nothing'
);
select is(
  public.save_order(pg_temp.order_payload('a0000000-0000-4000-8000-000000000504', now())) ->> 'status',
  'open', 'a second car checked in'
);
select throws_ok(
  $$select public.cancel_order('a0000000-0000-4000-8000-000000000504', 'x')$$,
  '23514', 'Alasan pembatalan wajib diisi', 'cancelling needs a reason'
);
select is(
  public.cancel_order('a0000000-0000-4000-8000-000000000504', 'Pelanggan pergi') ->> 'status',
  'cancelled', 'an open order can be cancelled'
);
select throws_ok(
  $$select public.cancel_order('a0000000-0000-4000-8000-000000000501', 'Salah')$$,
  '23514', 'Pesanan ini sudah dibayar', 'a paid order cannot be cancelled'
);
select throws_ok(
  $$select * from public.daily_totals('a0000000-0000-4000-8000-0000000000b0', '2026-01-10', '2026-01-11')$$,
  '42501', null, 'the cashier cannot read aggregates'
);

-- ---------------------------------------------------------------------------
-- Owner: discounts are managed by the owner; aggregates
-- ---------------------------------------------------------------------------
set local request.jwt.claims to '{"sub":"a0000000-0000-4000-8000-00000000000a","role":"authenticated"}';

select throws_ok(
  $$select public.save_order(pg_temp.order_payload('a0000000-0000-4000-8000-000000000505', now()))$$,
  '42501', null, 'orders are taken by the cashier'
);
insert into public.discounts (business_id, name, type, value)
  values ('a0000000-0000-4000-8000-0000000000b0', 'Hari Raya', 'percent', 20);
select is((select count(*)::int from public.discounts), 4, 'the owner creates and sees every preset');
select throws_ok(
  $$insert into public.discounts (business_id, name, type, value) values ('a0000000-0000-4000-8000-0000000000b0', 'Salah', 'percent', 150)$$,
  '23514', null, 'a percent discount stays within 1–100'
);

select results_eq(
  $$select income, discount_total from public.period_totals('a0000000-0000-4000-8000-0000000000b0', '2026-01-10 00:00+07', '2026-01-11 00:00+07')$$,
  $$values (94500::bigint, 5500::bigint)$$,
  'period totals count income after discounts and report the discounts given'
);
select results_eq(
  $$select day_key, income, expense from public.daily_totals('a0000000-0000-4000-8000-0000000000b0', '2026-01-10', '2026-01-12')$$,
  $$values ('2026-01-10'::date, 94500::bigint, 130000::bigint),
           ('2026-01-11'::date, 2000000::bigint, 700000::bigint),
           ('2026-01-12'::date, 0::bigint, 0::bigint)$$,
  'daily totals include imported days and empty days'
);
select results_eq(
  $$select month_key, income, operating_expense, non_operating_expense, drawings
    from public.monthly_totals('a0000000-0000-4000-8000-0000000000b0', '2025-12-01', 2)$$,
  $$values ('2025-12-01'::date, 0::bigint, 0::bigint, 0::bigint, 0::bigint),
           ('2026-01-01'::date, 2094500::bigint, 730000::bigint, 100000::bigint, 0::bigint)$$,
  'monthly totals split expenses by kind'
);
select results_eq(
  $$select name, qty, revenue from public.top_items('a0000000-0000-4000-8000-0000000000b0', '2026-01-01 00:00+07', '2026-02-01 00:00+07')$$,
  $$values ('Cuci Sedang'::text, 2::bigint, 90000::bigint), ('Semir Ban'::text, 1::bigint, 10000::bigint)$$,
  'top items by revenue'
);
select results_eq(
  $$select weekday, hour, count from public.busy_hours('a0000000-0000-4000-8000-0000000000b0', '2026-01-10 00:00+07', '2026-01-11 00:00+07') order by hour$$,
  $$values (6, 9, 1::bigint), (6, 14, 1::bigint)$$,
  'busy hours in the business timezone (10 Jan 2026 is a Saturday)'
);
select results_eq(
  $$select category_id, amount from public.expense_by_category('a0000000-0000-4000-8000-0000000000b0', '2026-01-10 00:00+07', '2026-01-12 00:00+07')$$,
  $$values ('a0000000-0000-4000-8000-0000000000e1'::uuid, 730000::bigint), ('a0000000-0000-4000-8000-0000000000e2'::uuid, 100000::bigint)$$,
  'expense per category, live and imported'
);
select results_eq(
  $$select day_key, category_id, amount, imported from public.monthly_matrix('a0000000-0000-4000-8000-0000000000b0', '2026-01-15')
    order by day_key, category_id nulls first$$,
  $$values ('2026-01-10'::date, null::uuid, 94500::bigint, false),
           ('2026-01-10'::date, 'a0000000-0000-4000-8000-0000000000e1'::uuid, 30000::bigint, false),
           ('2026-01-10'::date, 'a0000000-0000-4000-8000-0000000000e2'::uuid, 100000::bigint, false),
           ('2026-01-11'::date, null::uuid, 2000000::bigint, true),
           ('2026-01-11'::date, 'a0000000-0000-4000-8000-0000000000e1'::uuid, 700000::bigint, true)$$,
  'the monthly matrix rows carry income (no category) and expenses per day'
);
select results_eq(
  $$select public.first_activity_day('a0000000-0000-4000-8000-0000000000b0'),
           (select array_agg(d order by d) from public.live_days('a0000000-0000-4000-8000-0000000000b0', '2026-01-09', '2026-01-12') d)$$,
  $$values ('2026-01-10'::date, array['2026-01-10'::date])$$,
  'first activity day and the live days an import must skip'
);

-- Logos (Storage): owners write only inside their own business folder.
select lives_ok(
  $$insert into storage.objects (bucket_id, name) values ('logos', 'a0000000-0000-4000-8000-0000000000b0/logo.png')$$,
  'the owner uploads a logo into the business folder'
);
set local request.jwt.claims to '{"sub":"b0000000-0000-4000-8000-00000000000a","role":"authenticated"}';
select throws_ok(
  $$insert into storage.objects (bucket_id, name) values ('logos', 'a0000000-0000-4000-8000-0000000000b0/lain.png')$$,
  '42501', null, 'another owner cannot write into that folder'
);

select * from finish();
rollback;
