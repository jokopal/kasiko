-- Receipt corrections (decision #44, revised 2026-11-24): the printed receipt can be
-- corrected after saving, income never changes, and every correction lands in audit_log.
begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

insert into auth.users (id, email) values
  ('a0000000-0000-4000-8000-00000000000a', 'owner-a@kasiko.test'),
  ('a0000000-0000-4000-8000-00000000000c', 'kasir-a@kasiko.test'),
  ('b0000000-0000-4000-8000-00000000000a', 'owner-b@kasiko.test');
insert into public.businesses (id, owner_id, name, receipt_prefix, timezone) values
  ('a0000000-0000-4000-8000-0000000000b0', 'a0000000-0000-4000-8000-00000000000a', 'Usaha A', 'UA', 'Asia/Jakarta'),
  ('b0000000-0000-4000-8000-0000000000b0', 'b0000000-0000-4000-8000-00000000000a', 'Usaha B', 'UB', 'Asia/Jakarta');
insert into public.business_members (business_id, user_id, role) values
  ('a0000000-0000-4000-8000-0000000000b0', 'a0000000-0000-4000-8000-00000000000a', 'owner'),
  ('a0000000-0000-4000-8000-0000000000b0', 'a0000000-0000-4000-8000-00000000000c', 'cashier'),
  ('b0000000-0000-4000-8000-0000000000b0', 'b0000000-0000-4000-8000-00000000000a', 'owner');
insert into public.catalog_categories (id, business_id, name) values
  ('a0000000-0000-4000-8000-0000000000c1', 'a0000000-0000-4000-8000-0000000000b0', 'Cuci Mobil');
insert into public.catalog_items (id, business_id, category_id, name, price) values
  ('a0000000-0000-4000-8000-0000000000d1', 'a0000000-0000-4000-8000-0000000000b0', 'a0000000-0000-4000-8000-0000000000c1', 'Cuci Sedang', 50000);
insert into public.devices (id, business_id, device_code) values
  ('a0000000-0000-4000-8000-0000000000f1', 'a0000000-0000-4000-8000-0000000000b0', 'A');
-- One sale today, one sale three days ago.
insert into public.transactions (id, business_id, receipt_no, occurred_at, payment_method, subtotal, total, cash_received, change_amount, device_id, status, plate_number) values
  ('a0000000-0000-4000-8000-000000000701', 'a0000000-0000-4000-8000-0000000000b0', 'UA-261124-A0001', now() - interval '1 minute', 'cash', 50000, 50000, 50000, 0, 'a0000000-0000-4000-8000-0000000000f1', 'paid', 'B 1 A'),
  ('a0000000-0000-4000-8000-000000000702', 'a0000000-0000-4000-8000-0000000000b0', 'UA-261121-A0002', now() - interval '3 days', 'cash', 50000, 50000, 50000, 0, 'a0000000-0000-4000-8000-0000000000f1', 'paid', null);
insert into public.transaction_items (id, business_id, transaction_id, position, catalog_item_id, name_snapshot, price_snapshot, qty, line_total) values
  ('a0000000-0000-4000-8000-000000000801', 'a0000000-0000-4000-8000-0000000000b0', 'a0000000-0000-4000-8000-000000000701', 1, 'a0000000-0000-4000-8000-0000000000d1', 'Cuci Sedang', 50000, 1, 50000),
  ('a0000000-0000-4000-8000-000000000802', 'a0000000-0000-4000-8000-0000000000b0', 'a0000000-0000-4000-8000-000000000702', 1, 'a0000000-0000-4000-8000-0000000000d1', 'Cuci Sedang', 50000, 1, 50000);

set local role authenticated;
set local request.jwt.claims to '{"sub":"a0000000-0000-4000-8000-00000000000c","role":"authenticated"}';

select throws_ok(
  $$select public.correct_receipt('a0000000-0000-4000-8000-000000000701',
    '{"items":[{"name":"Cuci Sedang + Wax","qty":1,"price":45000}],"plate_number":"B 1 A"}', now())$$,
  '42501', 'Owner belum mengizinkan kasir mengedit nota', 'no receipt edits while the owner keeps them off'
);

reset role;
update public.businesses set cashier_can_edit_prices = true where id = 'a0000000-0000-4000-8000-0000000000b0';
set local role authenticated;
set local request.jwt.claims to '{"sub":"a0000000-0000-4000-8000-00000000000c","role":"authenticated"}';

select lives_ok(
  $$select public.correct_receipt('a0000000-0000-4000-8000-000000000701',
    '{"items":[{"name":" Cuci Sedang + Wax ","qty":1,"price":45000}],"plate_number":"B 1 AB"}', now() - interval '30 seconds')$$,
  'the cashier corrects today''s receipt'
);
select lives_ok(
  $$select public.correct_receipt('a0000000-0000-4000-8000-000000000701',
    '{"items":[{"name":"Lama","qty":1,"price":1}]}', now() - interval '50 seconds')$$,
  'an older correction arriving late is ignored'
);
select throws_ok(
  $$select public.correct_receipt('a0000000-0000-4000-8000-000000000702',
    '{"items":[{"name":"X","qty":1,"price":1}]}', now())$$,
  '42501', 'Kasir hanya bisa mengedit nota hari ini', 'the cashier cannot correct an older day'
);
select throws_ok(
  $$select public.correct_receipt('a0000000-0000-4000-8000-000000000701', '{"items":[]}', now() + interval '1 second')$$,
  '23514', null, 'a correction needs at least one line'
);
select throws_ok(
  $$select public.correct_receipt('a0000000-0000-4000-8000-000000000701',
    '{"items":[{"name":"X","qty":0,"price":1}]}', now() + interval '1 second')$$,
  '23514', null, 'a zero quantity is refused'
);

reset role;
select is(
  (select receipt_correction from public.transactions where id = 'a0000000-0000-4000-8000-000000000701'),
  '{"items":[{"name":"Cuci Sedang + Wax","qty":1,"price":45000}],"plate_number":"B 1 AB"}'::jsonb,
  'the newest correction is stored, trimmed'
);
select results_eq(
  $$select total, subtotal, (select sum(line_total) from public.transaction_items where transaction_id = t.id)
    from public.transactions t where id = 'a0000000-0000-4000-8000-000000000701'$$,
  $$values (50000::bigint, 50000::bigint, 50000::numeric)$$,
  'income stays at the real price'
);
select results_eq(
  $$select actor_id, action, old_data -> 'items' -> 0 ->> 'price', new_data -> 'items' -> 0 ->> 'price', (new_data ->> 'printed_total')::bigint
    from public.audit_log where entity = 'transactions' and entity_id = 'a0000000-0000-4000-8000-000000000701'$$,
  $$values ('a0000000-0000-4000-8000-00000000000c'::uuid, 'correction', '50000', '45000', 45000::bigint)$$,
  'the audit log keeps who corrected, the original and the corrected receipt'
);

set local role authenticated;
set local request.jwt.claims to '{"sub":"a0000000-0000-4000-8000-00000000000a","role":"authenticated"}';
select lives_ok(
  $$select public.correct_receipt('a0000000-0000-4000-8000-000000000702',
    '{"items":[{"name":"Cuci Sedang","qty":1,"price":40000}]}', now())$$,
  'the owner can correct any day'
);

set local request.jwt.claims to '{"sub":"b0000000-0000-4000-8000-00000000000a","role":"authenticated"}';
select throws_ok(
  $$select public.correct_receipt('a0000000-0000-4000-8000-000000000701',
    '{"items":[{"name":"X","qty":1,"price":1}]}', now())$$,
  '42501', null, 'another owner cannot correct the receipt'
);

reset role;
set local role anon;
select throws_ok(
  $$select public.correct_receipt('a0000000-0000-4000-8000-000000000701',
    '{"items":[{"name":"X","qty":1,"price":1}]}', now())$$,
  '42501', null, 'anon has no access'
);

select * from finish();
rollback;
