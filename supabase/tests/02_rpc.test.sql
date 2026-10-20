-- Write RPCs: the server re-validates everything and every call is safe to retry.
begin;
create extension if not exists pgtap with schema extensions;
select plan(41);

-- Fixture: business A (owner + cashier, one device) and business B (one device).
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
insert into public.business_configs (business_id) values
  ('a0000000-0000-4000-8000-0000000000b0'), ('b0000000-0000-4000-8000-0000000000b0');
insert into public.catalog_categories (id, business_id, name) values
  ('a0000000-0000-4000-8000-0000000000c1', 'a0000000-0000-4000-8000-0000000000b0', 'Cuci');
insert into public.catalog_items (id, business_id, category_id, name, price) values
  ('a0000000-0000-4000-8000-0000000000d1', 'a0000000-0000-4000-8000-0000000000b0', 'a0000000-0000-4000-8000-0000000000c1', 'Cuci Sedang', 45000),
  ('a0000000-0000-4000-8000-0000000000d2', 'a0000000-0000-4000-8000-0000000000b0', 'a0000000-0000-4000-8000-0000000000c1', 'Semir Ban', 10000);
insert into public.expense_categories (id, business_id, name, kind, allow_drawer) values
  ('a0000000-0000-4000-8000-0000000000e1', 'a0000000-0000-4000-8000-0000000000b0', 'Makan', 'operating', true),
  ('a0000000-0000-4000-8000-0000000000e2', 'a0000000-0000-4000-8000-0000000000b0', 'Cicilan', 'non_operating', false);
insert into public.devices (id, business_id, device_code) values
  ('a0000000-0000-4000-8000-0000000000f1', 'a0000000-0000-4000-8000-0000000000b0', 'A'),
  ('b0000000-0000-4000-8000-0000000000f1', 'b0000000-0000-4000-8000-0000000000b0', 'A');
-- Yesterday's sale, recorded long ago by the device.
insert into public.transactions (id, business_id, receipt_no, occurred_at, payment_method, total, device_id) values
  ('a0000000-0000-4000-8000-000000000199', 'a0000000-0000-4000-8000-0000000000b0', 'UA-261019-A0001', now() - interval '1 day', 'qris', 45000, 'a0000000-0000-4000-8000-0000000000f1');

-- A valid cash sale as the device would send it.
create function pg_temp.sale(p_id text, p_receipt text, p_overrides jsonb default '{}')
returns jsonb language sql as $$
  select jsonb_build_object(
    'id', p_id,
    'business_id', 'a0000000-0000-4000-8000-0000000000b0',
    'receipt_no', p_receipt,
    'occurred_at', now(),
    'plate_number', '  b  1234  xyz ',
    'payment_method', 'cash',
    'total', 55000,
    'cash_received', 60000,
    'change_amount', 5000,
    'status', 'paid',
    'device_id', 'a0000000-0000-4000-8000-0000000000f1',
    'items', jsonb_build_array(
      jsonb_build_object('id', gen_random_uuid(), 'catalog_item_id', 'a0000000-0000-4000-8000-0000000000d1',
        'name_snapshot', 'Cuci Sedang', 'price_snapshot', 45000, 'qty', 1, 'line_total', 45000),
      jsonb_build_object('id', gen_random_uuid(), 'catalog_item_id', 'a0000000-0000-4000-8000-0000000000d2',
        'name_snapshot', 'Semir Ban', 'price_snapshot', 10000, 'qty', 1, 'line_total', 10000)
    )
  ) || p_overrides;
$$;
grant execute on function pg_temp.sale(text, text, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Cashier of A
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub":"a0000000-0000-4000-8000-00000000000c","role":"authenticated"}';

-- Devices (decision #16)
select is(
  (public.register_device('a0000000-0000-4000-8000-0000000000b0')).device_code, 'B',
  'a new device gets the next unused code'
);
select is(
  (public.register_device('a0000000-0000-4000-8000-0000000000b0')).device_code, 'C',
  'codes are never handed out twice'
);
select throws_ok(
  $$select public.register_device('b0000000-0000-4000-8000-0000000000b0')$$,
  '42501', null, 'a device cannot register for another business'
);

-- Sales (decisions #14, #15)
select is(
  (public.create_transaction(pg_temp.sale('a0000000-0000-4000-8000-000000000101', 'UA-261020-A0001')) ->> 'change_amount')::bigint,
  5000::bigint,
  'a valid cash sale is stored with its change'
);
select is(
  (select plate_number from public.transactions where id = 'a0000000-0000-4000-8000-000000000101'),
  'B 1234 XYZ',
  'the plate number is normalized like normalizePlate()'
);
select results_eq(
  $$select name_snapshot, position from public.transaction_items
    where transaction_id = 'a0000000-0000-4000-8000-000000000101' order by position$$,
  $$values ('Cuci Sedang'::text, 1), ('Semir Ban'::text, 2)$$,
  'items are stored as snapshots in receipt order'
);
select is(
  (public.create_transaction(pg_temp.sale('a0000000-0000-4000-8000-000000000101', 'UA-261020-A0001')) ->> 'id'),
  'a0000000-0000-4000-8000-000000000101',
  'retrying the same sale returns the stored row'
);
select is(
  (select count(*)::int from public.transactions where id = 'a0000000-0000-4000-8000-000000000101'),
  1, '…without storing it twice'
);
select is(
  (select count(*)::int from public.transaction_items where transaction_id = 'a0000000-0000-4000-8000-000000000101'),
  2, '…or doubling its items'
);
select throws_ok(
  $$select public.create_transaction(pg_temp.sale('a0000000-0000-4000-8000-000000000102', 'UA-261020-A0001'))$$,
  '23505', 'Nomor nota UA-261020-A0001 sudah dipakai', 'a receipt number is unique per business'
);
select throws_ok(
  $$select public.create_transaction(pg_temp.sale('a0000000-0000-4000-8000-000000000103', 'UA-261020-A0003', '{"total": 1000}'))$$,
  '23514', 'Total transaksi tidak cocok', 'the server recomputes the total'
);
select throws_ok(
  $$select public.create_transaction(pg_temp.sale('a0000000-0000-4000-8000-000000000104', 'UA-261020-A0004',
    jsonb_build_object('items', jsonb_build_array(jsonb_build_object('name_snapshot','X','price_snapshot',1000,'qty',2,'line_total',1500)), 'total', 1500, 'cash_received', 1500, 'change_amount', 0)))$$,
  '23514', 'Subtotal item tidak cocok', 'line totals are recomputed'
);
select throws_ok(
  $$select public.create_transaction(pg_temp.sale('a0000000-0000-4000-8000-000000000105', 'UA-261020-A0005', '{"cash_received": 50000, "change_amount": 0}'))$$,
  '23514', 'Uang yang diterima kurang', 'cash below the total is refused'
);
select throws_ok(
  $$select public.create_transaction(pg_temp.sale('a0000000-0000-4000-8000-000000000106', 'UA-261020-A0006', '{"cash_received": 60000, "change_amount": 4000}'))$$,
  '23514', 'Data pembayaran tidak cocok', 'change is recomputed'
);
select throws_ok(
  $$select public.create_transaction(pg_temp.sale('a0000000-0000-4000-8000-000000000107', 'UA-261020-A0007', '{"payment_method": "qris"}'))$$,
  '23514', 'Data pembayaran tidak cocok', 'non-cash sales carry no cash fields'
);
select is(
  (public.create_transaction(pg_temp.sale('a0000000-0000-4000-8000-000000000108', 'UA-261020-A0008',
    '{"payment_method": "qris", "cash_received": null, "change_amount": null}')) ->> 'payment_method'),
  'qris', 'a QRIS sale is accepted'
);
select is(
  (public.create_transaction(pg_temp.sale('a0000000-0000-4000-8000-000000000109', 'UA-261020-A0009',
    jsonb_build_object('items', jsonb_build_array(jsonb_build_object('name_snapshot','Cuci Sedang','price_snapshot',40000,'qty',1,'line_total',40000)),
      'total', 40000, 'cash_received', 40000, 'change_amount', 0))) ->> 'total')::bigint,
  40000::bigint,
  'a stale snapshot price from an offline catalog is accepted (decision #15)'
);
select throws_ok(
  $$select public.create_transaction(pg_temp.sale('a0000000-0000-4000-8000-000000000110', 'UA-261020-A0010', '{"device_id": "b0000000-0000-4000-8000-0000000000f1"}'))$$,
  '23503', 'Perangkat belum terdaftar untuk usaha ini', 'a device of another business is refused'
);

-- Drawer expenses (decision #26)
select is(
  (public.create_expense(jsonb_build_object('id', 'a0000000-0000-4000-8000-000000000201',
    'business_id', 'a0000000-0000-4000-8000-0000000000b0', 'category_id', 'a0000000-0000-4000-8000-0000000000e1',
    'amount', 45000, 'note', ' makan siang ', 'source', 'drawer', 'occurred_at', now(),
    'device_id', 'a0000000-0000-4000-8000-0000000000f1')) ->> 'note'),
  'makan siang', 'a drawer expense is stored, note trimmed'
);
select is(
  (public.create_expense(jsonb_build_object('id', 'a0000000-0000-4000-8000-000000000201',
    'business_id', 'a0000000-0000-4000-8000-0000000000b0', 'category_id', 'a0000000-0000-4000-8000-0000000000e1',
    'amount', 45000, 'source', 'drawer', 'occurred_at', now(),
    'device_id', 'a0000000-0000-4000-8000-0000000000f1')) ->> 'id'),
  'a0000000-0000-4000-8000-000000000201', 'retrying an expense is safe'
);
select throws_ok(
  $$select public.create_expense(jsonb_build_object('business_id', 'a0000000-0000-4000-8000-0000000000b0',
    'category_id', 'a0000000-0000-4000-8000-0000000000e2', 'amount', 1000, 'source', 'drawer', 'occurred_at', now(),
    'device_id', 'a0000000-0000-4000-8000-0000000000f1'))$$,
  '42501', 'Kategori ini tidak boleh dicatat dari laci kasir',
  'the cashier cannot use a category the owner keeps off the drawer'
);
select throws_ok(
  $$select public.create_expense(jsonb_build_object('business_id', 'a0000000-0000-4000-8000-0000000000b0',
    'category_id', 'a0000000-0000-4000-8000-0000000000e1', 'amount', 1000, 'source', 'owner'))$$,
  '42501', null, 'the cashier cannot record owner expenses'
);
select throws_ok(
  $$select public.create_expense(jsonb_build_object('business_id', 'a0000000-0000-4000-8000-0000000000b0',
    'category_id', 'a0000000-0000-4000-8000-0000000000e1', 'amount', 0, 'source', 'drawer', 'occurred_at', now(),
    'device_id', 'a0000000-0000-4000-8000-0000000000f1'))$$,
  '23514', 'Nominal harus lebih dari 0', 'amounts must be positive'
);

-- Voids (decisions #11, #18)
select throws_ok(
  $$select public.void_transaction('a0000000-0000-4000-8000-000000000101', 'x', now())$$,
  '23514', 'Alasan pembatalan wajib diisi', 'a void needs a reason'
);
select is(
  public.void_transaction('a0000000-0000-4000-8000-000000000101', 'Salah input', '2026-10-20 10:00:00+07'::timestamptz
    + (now() - '2026-10-20 10:00:00+07'::timestamptz)) ->> 'status',
  'void', 'the cashier voids a sale of today'
);
select is(
  public.void_transaction('a0000000-0000-4000-8000-000000000101', 'Salah input', '2026-10-20 10:00:00+07'::timestamptz
    + (now() - '2026-10-20 10:00:00+07'::timestamptz)) ->> 'status',
  'void', 'a retried offline void (same device time) succeeds again'
);
select throws_ok(
  $$select public.void_transaction('a0000000-0000-4000-8000-000000000199', 'Salah input', now())$$,
  '42501', 'Kasir hanya bisa membatalkan data hari ini', 'the cashier cannot void yesterday'
);
select throws_ok(
  $$select public.void_transaction('a0000000-0000-4000-8000-000000000108', 'Salah input', now() + interval '1 hour')$$,
  '22023', 'Waktu perangkat tidak wajar; pembatalan ditolak', 'a void from a clock in the future is refused'
);

-- ---------------------------------------------------------------------------
-- Owner of A
-- ---------------------------------------------------------------------------
set local request.jwt.claims to '{"sub":"a0000000-0000-4000-8000-00000000000a","role":"authenticated"}';

select throws_ok(
  $$select public.create_transaction(pg_temp.sale('a0000000-0000-4000-8000-000000000120', 'UA-261020-A0020'))$$,
  '42501', null, 'sales are recorded by the cashier, not the owner'
);
select is(
  public.create_expense(jsonb_build_object('business_id', 'a0000000-0000-4000-8000-0000000000b0',
    'category_id', 'a0000000-0000-4000-8000-0000000000e2', 'amount', 4800000, 'source', 'owner')) ->> 'source',
  'owner', 'the owner records an owner expense in any active category'
);
select is(
  public.void_transaction('a0000000-0000-4000-8000-000000000199', 'Dobel catat') ->> 'status',
  'void', 'the owner voids any day'
);
select is(
  (select count(*)::int from public.audit_log where entity = 'transactions' and action = 'void'),
  1, 'owner voids are audited'
);
select throws_ok(
  $$select public.void_transaction('a0000000-0000-4000-8000-000000000199', 'Lagi')$$,
  '23514', 'Data ini sudah dibatalkan', 'a void cannot be repeated'
);

-- Templates & businesses (decision #25)
select is(
  public.apply_template('a0000000-0000-4000-8000-0000000000b0',
    '{"id":"umum","catalog":[{"category":"Cuci","items":[{"name":"cuci  SEDANG","price":1},{"name":"Vakum","price":15000}]}],
      "expenseCategories":[{"name":"makan","kind":"operating","allowDrawer":true},{"name":"Prive","kind":"drawing","allowDrawer":true}]}'),
  '{"catalogItems": 1, "catalogCategories": 0, "expenseCategories": 1}'::jsonb,
  'applying a template adds only what is missing (names compare like normalizeLabel)'
);
select is(
  (select kind from public.expense_categories where business_id = 'a0000000-0000-4000-8000-0000000000b0' and name = 'Prive'),
  'drawing'::public.expense_kind, 'template categories keep their kind'
);
select isnt(
  public.create_business('{"name":"Cabang Dua","receipt_prefix":"CD","timezone":"Asia/Makassar"}',
    '{"id":"umum","catalog":[{"category":"Layanan","items":[{"name":"Reguler","price":25000}]}],
      "expenseCategories":[{"name":"Bahan","kind":"operating","allowDrawer":true}]}'),
  null, 'an owner creates a new business from a template'
);
select results_eq(
  $$select (select count(*)::int from public.catalog_items i where i.business_id = b.id),
           (select count(*)::int from public.business_members m where m.business_id = b.id and m.role = 'owner')
    from public.businesses b where b.name = 'Cabang Dua'$$,
  $$values (1, 1)$$,
  'the new business has its template rows and its owner membership'
);

-- Imported history (decision #27)
select is(
  public.import_history('a0000000-0000-4000-8000-0000000000b0',
    '[{"day_key":"2025-01-01","income":2000000,"expenses":[{"category_id":"a0000000-0000-4000-8000-0000000000e1","amount":700000}]}]',
    '{"gaji":"a0000000-0000-4000-8000-0000000000e1","haga":"skip"}'),
  1, 'a past day is imported'
);
select is(
  public.import_history('a0000000-0000-4000-8000-0000000000b0', '[{"day_key":"2025-01-01","income":2500000}]'),
  1, 're-importing a day replaces it'
);
select results_eq(
  $$select income, (select count(*)::int from public.historical_expenses x where x.day_key = h.day_key)
    from public.historical_days h where h.business_id = 'a0000000-0000-4000-8000-0000000000b0'$$,
  $$values (2500000::bigint, 0)$$,
  '…without doubling income or keeping stale expense lines'
);
select throws_ok(
  format($$select public.import_history('a0000000-0000-4000-8000-0000000000b0', '[{"day_key":"%s","income":1}]')$$,
    public.business_day('a0000000-0000-4000-8000-0000000000b0', now())),
  '23505', null, 'a day with live cashier data cannot be overwritten by an import'
);

select * from finish();
rollback;
