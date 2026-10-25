-- Pay-at-the-end orders (decision #34), owner-activated discounts (decision #35) and the
-- SQL aggregates behind the owner dashboard and monthly recap (AGENTS.md section 7: the
-- recap is computed in the database, not by pulling every row to the browser).

-- ---------------------------------------------------------------------------
-- Discounts: presets the owner creates and switches on; the cashier only picks one.
-- ---------------------------------------------------------------------------

create type public.discount_type as enum ('percent', 'amount');

create table public.discounts (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id),
  name text not null check (length(btrim(name)) between 1 and 40),
  type public.discount_type not null,
  value bigint not null check (value > 0),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, id),
  constraint discounts_percent_check check (type <> 'percent' or value between 1 and 100)
);
create unique index discounts_name_key on public.discounts (business_id, public.normalize_label(name));
create trigger set_updated_at before update on public.discounts
  for each row execute function public.set_updated_at();
create trigger audit_discounts after insert or update on public.discounts
  for each row execute function public.audit_row_change();

alter table public.discounts enable row level security;
create policy discounts_select on public.discounts
  for select to authenticated
  using (public.is_owner(business_id) or (is_active and public.is_cashier(business_id)));
create policy discounts_owner_insert on public.discounts
  for insert to authenticated with check (public.is_owner(business_id));
create policy discounts_owner_update on public.discounts
  for update to authenticated
  using (public.is_owner(business_id)) with check (public.is_owner(business_id));
grant select on public.discounts to authenticated;
grant insert (id, business_id, name, type, value, sort_order, is_active) on public.discounts
  to authenticated;
grant update (name, type, value, sort_order, is_active) on public.discounts to authenticated;

/** Same rule as applyDiscount() in the app: percent rounds down to whole rupiah. */
create function public.discount_amount(
  p_subtotal bigint,
  p_type public.discount_type,
  p_value bigint
)
returns bigint
language sql
immutable
set search_path = ''
as $$
  select case
    when p_type is null then 0
    when p_type = 'percent' then (p_subtotal * p_value) / 100
    else p_value
  end;
$$;

-- ---------------------------------------------------------------------------
-- Orders: a car checked in and not yet paid. Operational only — money is counted when
-- the order is paid, through an ordinary transaction.
-- ---------------------------------------------------------------------------

create type public.order_status as enum ('open', 'paid', 'cancelled');

create table public.orders (
  id uuid primary key,   -- generated on the device (offline, idempotent)
  business_id uuid not null references public.businesses (id),
  device_id uuid not null,
  plate_number text check (plate_number is null or length(plate_number) between 1 and 12),
  -- Draft lines [{ catalog_item_id, name, price, qty }]; the sale snapshots them on payment.
  items jsonb not null check (jsonb_typeof(items) = 'array' and jsonb_array_length(items) > 0),
  total bigint not null check (total > 0),
  status public.order_status not null default 'open',
  opened_at timestamptz not null,          -- device time
  device_updated_at timestamptz not null,  -- device time of the last edit (last write wins)
  received_at timestamptz not null default now(),
  transaction_id uuid,
  cancel_reason text,
  cancelled_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, id),
  foreign key (business_id, device_id) references public.devices (business_id, id),
  foreign key (business_id, transaction_id) references public.transactions (business_id, id),
  constraint orders_status_check check (
    (status = 'open' and transaction_id is null and cancel_reason is null)
    or (status = 'paid' and transaction_id is not null)
    or (status = 'cancelled' and coalesce(length(btrim(cancel_reason)), 0) >= 3
        and cancelled_at is not null)
  )
);
create index orders_open_idx on public.orders (business_id, status, opened_at);
create trigger set_updated_at before update on public.orders
  for each row execute function public.set_updated_at();

alter table public.orders enable row level security;
-- The cashier sees every open order (a car may stay overnight) and today's closed ones.
create policy orders_select on public.orders
  for select to authenticated
  using (
    public.is_owner(business_id)
    or (
      public.is_cashier(business_id)
      and (status = 'open' or opened_at >= public.business_day_start(business_id))
    )
  );
grant select on public.orders to authenticated;

-- ---------------------------------------------------------------------------
-- Transactions: discount snapshot and the order they settle
-- ---------------------------------------------------------------------------

alter table public.transactions
  add column subtotal bigint,
  add column discount_id uuid,
  add column discount_name text,
  add column discount_type public.discount_type,
  add column discount_value bigint,
  add column discount_amount bigint not null default 0,
  add column order_id uuid;
update public.transactions set subtotal = total where subtotal is null;
alter table public.transactions
  alter column subtotal set not null,
  add constraint transactions_discount_fk
    foreign key (business_id, discount_id) references public.discounts (business_id, id),
  add constraint transactions_order_fk
    foreign key (business_id, order_id) references public.orders (business_id, id),
  add constraint transactions_discount_check check (
    discount_amount >= 0
    and subtotal = total + discount_amount
    and ((discount_id is null and discount_amount = 0 and discount_type is null)
      or (discount_id is not null and discount_type is not null and discount_value > 0))
  );
create unique index transactions_order_key on public.transactions (order_id)
  where order_id is not null;

-- Rows written without a subtotal (service role, fixtures) get total + discount.
create function public.transactions_fill_subtotal()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.subtotal := coalesce(new.subtotal, new.total + coalesce(new.discount_amount, 0));
  return new;
end;
$$;
create trigger transactions_fill_subtotal
  before insert on public.transactions
  for each row execute function public.transactions_fill_subtotal();

-- ---------------------------------------------------------------------------
-- create_transaction: same contract as before (decisions #14, #15) plus an optional
-- discount snapshot (recomputed) and the open order it settles.
-- ---------------------------------------------------------------------------

create or replace function public.create_transaction(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid := (p ->> 'id')::uuid;
  v_business uuid := (p ->> 'business_id')::uuid;
  v_device uuid := (p ->> 'device_id')::uuid;
  v_method public.payment_method := (p ->> 'payment_method')::public.payment_method;
  v_cash bigint := (p ->> 'cash_received')::bigint;
  v_receipt text := p ->> 'receipt_no';
  v_occurred timestamptz := (p ->> 'occurred_at')::timestamptz;
  v_items jsonb := p -> 'items';
  v_discount_id uuid := (p ->> 'discount_id')::uuid;
  v_discount_type public.discount_type := (p ->> 'discount_type')::public.discount_type;
  v_discount_value bigint := (p ->> 'discount_value')::bigint;
  v_discount_name text := nullif(btrim(coalesce(p ->> 'discount_name', '')), '');
  v_order uuid := (p ->> 'order_id')::uuid;
  v_existing uuid;
  v_item jsonb;
  v_qty integer;
  v_price bigint;
  v_subtotal bigint := 0;
  v_discount bigint := 0;
  v_total bigint;
  v_change bigint;
  v_position integer := 0;
  v_plate text;
begin
  if v_id is null or v_business is null or v_method is null or v_occurred is null then
    raise exception 'Format transaksi tidak valid' using errcode = '22023';
  end if;

  select t.business_id into v_existing from public.transactions t where t.id = v_id;
  if found then
    if v_existing <> v_business or not public.is_member(v_business) then
      raise exception 'Transaksi tidak ditemukan' using errcode = '42501';
    end if;
    return public.transaction_json(v_id);
  end if;

  if not public.is_cashier(v_business) then
    raise exception 'Hanya kasir usaha ini yang bisa mencatat transaksi' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.devices d where d.id = v_device and d.business_id = v_business
  ) then
    raise exception 'Perangkat belum terdaftar untuk usaha ini' using errcode = '23503';
  end if;
  if coalesce(p ->> 'status', 'paid') <> 'paid' then
    raise exception 'Transaksi baru harus berstatus lunas' using errcode = '23514';
  end if;
  if v_receipt is null or v_receipt !~ '^[A-Z0-9]{2,6}-[0-9]{6}-[A-Z]{1,2}[0-9]{4}$' then
    raise exception 'Nomor nota tidak valid' using errcode = '23514';
  end if;
  if jsonb_typeof(v_items) is distinct from 'array' or jsonb_array_length(v_items) = 0 then
    raise exception 'Transaksi tanpa item' using errcode = '23514';
  end if;

  for v_item in select value from jsonb_array_elements(v_items) loop
    v_qty := (v_item ->> 'qty')::integer;
    v_price := (v_item ->> 'price_snapshot')::bigint;
    if v_qty is null or v_qty <= 0 then
      raise exception 'Jumlah item tidak valid' using errcode = '23514';
    end if;
    if v_price is null or v_price < 0 then
      raise exception 'Harga item tidak valid' using errcode = '23514';
    end if;
    if (v_item ->> 'line_total')::bigint is distinct from v_price * v_qty then
      raise exception 'Subtotal item tidak cocok' using errcode = '23514';
    end if;
    v_subtotal := v_subtotal + v_price * v_qty;
  end loop;
  if v_subtotal <= 0 then
    raise exception 'Keranjang masih kosong' using errcode = '23514';
  end if;
  if p ? 'subtotal' and (p ->> 'subtotal')::bigint is distinct from v_subtotal then
    raise exception 'Subtotal transaksi tidak cocok' using errcode = '23514';
  end if;

  -- Decision #35: only a preset of this business; the snapshot (type, value) is accepted
  -- even if the owner changed it while the device was offline, and the amount recomputed.
  if v_discount_id is not null then
    if not exists (
      select 1 from public.discounts d where d.id = v_discount_id and d.business_id = v_business
    ) then
      raise exception 'Diskon tidak valid' using errcode = '23503';
    end if;
    if v_discount_type is null or v_discount_value is null or v_discount_value <= 0
       or (v_discount_type = 'percent' and v_discount_value > 100) then
      raise exception 'Diskon tidak valid' using errcode = '23514';
    end if;
    v_discount := public.discount_amount(v_subtotal, v_discount_type, v_discount_value);
    if v_discount >= v_subtotal then
      raise exception 'Diskon tidak boleh melebihi total' using errcode = '23514';
    end if;
    if (p ->> 'discount_amount')::bigint is distinct from v_discount then
      raise exception 'Diskon tidak cocok' using errcode = '23514';
    end if;
    v_discount_name := coalesce(
      v_discount_name,
      (select d.name from public.discounts d where d.id = v_discount_id)
    );
  elsif coalesce((p ->> 'discount_amount')::bigint, 0) <> 0 then
    raise exception 'Diskon tidak cocok' using errcode = '23514';
  else
    v_discount_type := null;
    v_discount_value := null;
    v_discount_name := null;
  end if;

  v_total := v_subtotal - v_discount;
  if (p ->> 'total')::bigint is distinct from v_total then
    raise exception 'Total transaksi tidak cocok' using errcode = '23514';
  end if;
  if v_method = 'cash' then
    if v_cash is null or v_cash < v_total then
      raise exception 'Uang yang diterima kurang' using errcode = '23514';
    end if;
    v_change := v_cash - v_total;
    if (p ->> 'change_amount')::bigint is distinct from v_change then
      raise exception 'Data pembayaran tidak cocok' using errcode = '23514';
    end if;
  elsif v_cash is not null or p ->> 'change_amount' is not null then
    raise exception 'Data pembayaran tidak cocok' using errcode = '23514';
  end if;

  if v_order is not null and not exists (
    select 1 from public.orders o where o.id = v_order and o.business_id = v_business
  ) then
    raise exception 'Pesanan tidak ditemukan' using errcode = '23503';
  end if;

  v_plate := nullif(left(upper(regexp_replace(btrim(coalesce(p ->> 'plate_number', '')),
    '\s+', ' ', 'g')), 12), '');

  begin
    insert into public.transactions (
      id, business_id, receipt_no, occurred_at, plate_number, payment_method,
      subtotal, discount_id, discount_name, discount_type, discount_value, discount_amount,
      total, cash_received, change_amount, created_by, device_id, order_id
    ) values (
      v_id, v_business, v_receipt, v_occurred, v_plate, v_method,
      v_subtotal, v_discount_id, v_discount_name, v_discount_type, v_discount_value, v_discount,
      v_total, v_cash, v_change, auth.uid(), v_device, v_order
    )
    on conflict (id) do nothing;
  exception when unique_violation then
    if v_order is not null and exists (
      select 1 from public.transactions t where t.order_id = v_order
    ) then
      raise exception 'Pesanan ini sudah dibayar' using errcode = '23505';
    end if;
    raise exception 'Nomor nota % sudah dipakai', v_receipt using errcode = '23505';
  end;
  if not found then
    return public.transaction_json(v_id);
  end if;

  for v_item in select value from jsonb_array_elements(v_items) loop
    v_position := v_position + 1;
    insert into public.transaction_items (
      id, business_id, transaction_id, position, catalog_item_id,
      name_snapshot, price_snapshot, qty, line_total
    ) values (
      coalesce((v_item ->> 'id')::uuid, gen_random_uuid()),
      v_business,
      v_id,
      v_position,
      (v_item ->> 'catalog_item_id')::uuid,
      btrim(v_item ->> 'name_snapshot'),
      (v_item ->> 'price_snapshot')::bigint,
      (v_item ->> 'qty')::integer,
      (v_item ->> 'line_total')::bigint
    );
  end loop;

  -- Settling an order closes it in the same database transaction.
  if v_order is not null then
    update public.orders
    set status = 'paid', transaction_id = v_id, cancel_reason = null, cancelled_at = null
    where id = v_order;
  end if;

  return public.transaction_json(v_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- Orders RPCs (decision #34): saved through the outbox like sales, idempotent.
-- ---------------------------------------------------------------------------

/**
 * save_order(jsonb): creates an open order or updates its draft lines/plate. Later device
 * edits win; an order that is already paid or cancelled is returned unchanged.
 */
create function public.save_order(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid := (p ->> 'id')::uuid;
  v_business uuid := (p ->> 'business_id')::uuid;
  v_device uuid := (p ->> 'device_id')::uuid;
  v_items jsonb := p -> 'items';
  v_opened timestamptz := (p ->> 'opened_at')::timestamptz;
  v_edited timestamptz := coalesce((p ->> 'device_updated_at')::timestamptz, v_opened);
  v_item jsonb;
  v_total bigint := 0;
  v_qty integer;
  v_price bigint;
  v_plate text;
  v_row public.orders;
begin
  if v_id is null or v_business is null or v_opened is null then
    raise exception 'Format pesanan tidak valid' using errcode = '22023';
  end if;
  if not public.is_cashier(v_business) then
    raise exception 'Hanya kasir usaha ini yang bisa mencatat pesanan' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.devices d where d.id = v_device and d.business_id = v_business
  ) then
    raise exception 'Perangkat belum terdaftar untuk usaha ini' using errcode = '23503';
  end if;
  if jsonb_typeof(v_items) is distinct from 'array' or jsonb_array_length(v_items) = 0 then
    raise exception 'Pesanan tanpa layanan' using errcode = '23514';
  end if;
  for v_item in select value from jsonb_array_elements(v_items) loop
    v_qty := (v_item ->> 'qty')::integer;
    v_price := (v_item ->> 'price')::bigint;
    if v_qty is null or v_qty <= 0 or v_price is null or v_price < 0
       or length(btrim(coalesce(v_item ->> 'name', ''))) = 0 then
      raise exception 'Layanan pesanan tidak valid' using errcode = '23514';
    end if;
    v_total := v_total + v_price * v_qty;
  end loop;
  if v_total <= 0 then
    raise exception 'Pesanan tanpa layanan' using errcode = '23514';
  end if;
  v_plate := nullif(left(upper(regexp_replace(btrim(coalesce(p ->> 'plate_number', '')),
    '\s+', ' ', 'g')), 12), '');

  select * into v_row from public.orders o where o.id = v_id for update;
  if not found then
    insert into public.orders (
      id, business_id, device_id, plate_number, items, total, opened_at, device_updated_at,
      created_by
    ) values (
      v_id, v_business, v_device, v_plate, v_items, v_total, v_opened, v_edited, auth.uid()
    )
    returning * into v_row;
  elsif v_row.business_id <> v_business then
    raise exception 'Pesanan tidak ditemukan' using errcode = '42501';
  elsif v_row.status = 'open' and v_edited >= v_row.device_updated_at then
    update public.orders
    set plate_number = v_plate, items = v_items, total = v_total, device_updated_at = v_edited
    where id = v_id
    returning * into v_row;
  end if;
  return to_jsonb(v_row);
end;
$$;

/** Cancels an open order (customer left). Cashier or owner; reason required. */
create function public.cancel_order(
  p_id uuid,
  p_reason text,
  p_cancelled_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.orders;
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  select * into v_row from public.orders o where o.id = p_id for update;
  if not found then
    raise exception 'Pesanan tidak ditemukan' using errcode = 'P0002';
  end if;
  if not public.is_member(v_row.business_id) then
    raise exception 'Pesanan tidak ditemukan' using errcode = '42501';
  end if;
  if v_row.status = 'cancelled' then
    return to_jsonb(v_row);   -- retried sync
  end if;
  if v_row.status = 'paid' then
    raise exception 'Pesanan ini sudah dibayar' using errcode = '23514';
  end if;
  if length(v_reason) < 3 then
    raise exception 'Alasan pembatalan wajib diisi' using errcode = '23514';
  end if;
  update public.orders
  set status = 'cancelled', cancel_reason = v_reason,
      cancelled_at = coalesce(p_cancelled_at, now())
  where id = p_id
  returning * into v_row;
  return to_jsonb(v_row);
end;
$$;

-- ---------------------------------------------------------------------------
-- Owner aggregates. Each checks the owner first and runs as the caller (RLS applies).
-- Imported history counts wherever income/expenses are summed (decision #27).
-- ---------------------------------------------------------------------------

create function public.assert_owner(p_business_id uuid)
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if not public.is_owner(p_business_id) then
    raise exception 'Rekap hanya untuk owner' using errcode = '42501';
  end if;
end;
$$;

drop function public.period_totals(uuid, timestamptz, timestamptz);
create function public.period_totals(p_business_id uuid, p_from timestamptz, p_to timestamptz)
returns table (
  income bigint,
  expense bigint,
  operating_expense bigint,
  non_operating_expense bigint,
  drawings bigint,
  operating_profit bigint,
  profit bigint,
  net_cash_flow bigint,
  transaction_count bigint,
  income_cash bigint,
  income_qris bigint,
  income_transfer bigint,
  drawer_expense bigint,
  owner_expense bigint,
  historical_income bigint,
  historical_days bigint,
  discount_total bigint
)
language plpgsql
stable
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_tz text;
begin
  perform public.assert_owner(p_business_id);
  v_tz := public.business_timezone(p_business_id);
  return query
  with tx as (
    select t.total, t.payment_method, t.discount_amount
    from public.transactions t
    where t.business_id = p_business_id and t.status = 'paid'
      and t.occurred_at >= p_from and t.occurred_at < p_to
  ), ex as (
    select e.amount, e.source, c.kind
    from public.expenses e
    join public.expense_categories c on c.business_id = e.business_id and c.id = e.category_id
    where e.business_id = p_business_id and e.status = 'active'
      and e.occurred_at >= p_from and e.occurred_at < p_to
  ), hd as (
    select h.day_key, h.income
    from public.historical_days h
    where h.business_id = p_business_id
      and (h.day_key::timestamp at time zone v_tz) >= p_from
      and (h.day_key::timestamp at time zone v_tz) < p_to
  ), hx as (
    select x.amount, c.kind
    from public.historical_expenses x
    join hd on hd.day_key = x.day_key
    join public.expense_categories c on c.business_id = x.business_id and c.id = x.category_id
    where x.business_id = p_business_id
  ), by_kind as (
    select kind, amount from ex union all select kind, amount from hx
  ), s as (
    select
      coalesce((select sum(tx.total) from tx), 0)::bigint as live_income,
      coalesce((select sum(hd.income) from hd), 0)::bigint as hist_income,
      coalesce((select sum(b.amount) from by_kind b where b.kind = 'operating'), 0)::bigint as op,
      coalesce((select sum(b.amount) from by_kind b where b.kind = 'non_operating'), 0)::bigint
        as non_op,
      coalesce((select sum(b.amount) from by_kind b where b.kind = 'drawing'), 0)::bigint as draw,
      (select count(*) from tx)::bigint as tx_count,
      coalesce((select sum(tx.total) from tx where tx.payment_method = 'cash'), 0)::bigint as cash,
      coalesce((select sum(tx.total) from tx where tx.payment_method = 'qris'), 0)::bigint as qris,
      coalesce((select sum(tx.total) from tx where tx.payment_method = 'transfer'), 0)::bigint
        as transfer,
      coalesce((select sum(ex.amount) from ex where ex.source = 'drawer'), 0)::bigint as drawer,
      coalesce((select sum(ex.amount) from ex where ex.source = 'owner'), 0)::bigint as owner,
      (select count(*) from hd)::bigint as hist_days,
      coalesce((select sum(tx.discount_amount) from tx), 0)::bigint as discounts
  )
  select
    s.live_income + s.hist_income,
    s.op + s.non_op + s.draw,
    s.op,
    s.non_op,
    s.draw,
    s.live_income + s.hist_income - s.op,
    s.live_income + s.hist_income - s.op - s.non_op,
    s.live_income + s.hist_income - (s.op + s.non_op + s.draw),
    s.tx_count, s.cash, s.qris, s.transfer, s.drawer, s.owner, s.hist_income, s.hist_days,
    s.discounts
  from s;
end;
$$;

/** Income and expense per business day, live + imported. */
create function public.daily_totals(p_business_id uuid, p_first_day date, p_last_day date)
returns table (day_key date, income bigint, expense bigint)
language plpgsql
stable
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_tz text;
begin
  perform public.assert_owner(p_business_id);
  v_tz := public.business_timezone(p_business_id);
  return query
  with days as (
    select d::date as day_key from generate_series(p_first_day, p_last_day, interval '1 day') d
  ), live_in as (
    select (t.occurred_at at time zone v_tz)::date as day_key, sum(t.total) as amount
    from public.transactions t
    where t.business_id = p_business_id and t.status = 'paid'
      and t.occurred_at >= (p_first_day::timestamp at time zone v_tz)
      and t.occurred_at < ((p_last_day + 1)::timestamp at time zone v_tz)
    group by 1
  ), live_out as (
    select (e.occurred_at at time zone v_tz)::date as day_key, sum(e.amount) as amount
    from public.expenses e
    where e.business_id = p_business_id and e.status = 'active'
      and e.occurred_at >= (p_first_day::timestamp at time zone v_tz)
      and e.occurred_at < ((p_last_day + 1)::timestamp at time zone v_tz)
    group by 1
  ), hist_out as (
    select x.day_key, sum(x.amount) as amount
    from public.historical_expenses x
    where x.business_id = p_business_id and x.day_key between p_first_day and p_last_day
    group by 1
  )
  select
    days.day_key,
    (coalesce(li.amount, 0) + coalesce(h.income, 0))::bigint,
    (coalesce(lo.amount, 0) + coalesce(ho.amount, 0))::bigint
  from days
  left join live_in li on li.day_key = days.day_key
  left join live_out lo on lo.day_key = days.day_key
  left join public.historical_days h
    on h.business_id = p_business_id and h.day_key = days.day_key
  left join hist_out ho on ho.day_key = days.day_key
  order by days.day_key;
end;
$$;

/** Income and expense per kind for each of `p_months` months starting at `p_first_month`. */
create function public.monthly_totals(p_business_id uuid, p_first_month date, p_months integer)
returns table (
  month_key date,
  income bigint,
  operating_expense bigint,
  non_operating_expense bigint,
  drawings bigint
)
language plpgsql
stable
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_tz text;
  v_first date := date_trunc('month', p_first_month)::date;
  v_end date := (date_trunc('month', p_first_month) + make_interval(months => p_months))::date;
begin
  perform public.assert_owner(p_business_id);
  v_tz := public.business_timezone(p_business_id);
  return query
  with months as (
    select (v_first + make_interval(months => i))::date as month_key
    from generate_series(0, p_months - 1) i
  ), live_in as (
    select date_trunc('month', t.occurred_at at time zone v_tz)::date as month_key,
      sum(t.total) as amount
    from public.transactions t
    where t.business_id = p_business_id and t.status = 'paid'
      and t.occurred_at >= (v_first::timestamp at time zone v_tz)
      and t.occurred_at < (v_end::timestamp at time zone v_tz)
    group by 1
  ), hist_in as (
    select date_trunc('month', h.day_key)::date as month_key, sum(h.income) as amount
    from public.historical_days h
    where h.business_id = p_business_id and h.day_key >= v_first and h.day_key < v_end
    group by 1
  ), outs as (
    select date_trunc('month', e.occurred_at at time zone v_tz)::date as month_key, c.kind,
      e.amount
    from public.expenses e
    join public.expense_categories c on c.business_id = e.business_id and c.id = e.category_id
    where e.business_id = p_business_id and e.status = 'active'
      and e.occurred_at >= (v_first::timestamp at time zone v_tz)
      and e.occurred_at < (v_end::timestamp at time zone v_tz)
    union all
    select date_trunc('month', x.day_key)::date, c.kind, x.amount
    from public.historical_expenses x
    join public.expense_categories c on c.business_id = x.business_id and c.id = x.category_id
    where x.business_id = p_business_id and x.day_key >= v_first and x.day_key < v_end
  ), out_sum as (
    select o.month_key,
      sum(o.amount) filter (where o.kind = 'operating') as op,
      sum(o.amount) filter (where o.kind = 'non_operating') as non_op,
      sum(o.amount) filter (where o.kind = 'drawing') as draw
    from outs o
    group by 1
  )
  select
    m.month_key,
    (coalesce(li.amount, 0) + coalesce(hi.amount, 0))::bigint,
    coalesce(os.op, 0)::bigint,
    coalesce(os.non_op, 0)::bigint,
    coalesce(os.draw, 0)::bigint
  from months m
  left join live_in li on li.month_key = m.month_key
  left join hist_in hi on hi.month_key = m.month_key
  left join out_sum os on os.month_key = m.month_key
  order by m.month_key;
end;
$$;

/** Best-selling items by revenue in [p_from, p_to). */
create function public.top_items(
  p_business_id uuid,
  p_from timestamptz,
  p_to timestamptz,
  p_limit integer default 6
)
returns table (name text, qty bigint, revenue bigint)
language plpgsql
stable
set search_path = ''
as $$
#variable_conflict use_column
begin
  perform public.assert_owner(p_business_id);
  return query
  select i.name_snapshot, sum(i.qty)::bigint, sum(i.line_total)::bigint
  from public.transaction_items i
  join public.transactions t on t.business_id = i.business_id and t.id = i.transaction_id
  where t.business_id = p_business_id and t.status = 'paid'
    and t.occurred_at >= p_from and t.occurred_at < p_to
  group by i.name_snapshot
  order by 3 desc, 1
  limit greatest(p_limit, 1);
end;
$$;

/** Paid transactions per weekday (0 = Sunday) and hour, in the business timezone. */
create function public.busy_hours(p_business_id uuid, p_from timestamptz, p_to timestamptz)
returns table (weekday integer, hour integer, count bigint)
language plpgsql
stable
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_tz text;
begin
  perform public.assert_owner(p_business_id);
  v_tz := public.business_timezone(p_business_id);
  return query
  select
    extract(dow from t.occurred_at at time zone v_tz)::integer,
    extract(hour from t.occurred_at at time zone v_tz)::integer,
    count(*)::bigint
  from public.transactions t
  where t.business_id = p_business_id and t.status = 'paid'
    and t.occurred_at >= p_from and t.occurred_at < p_to
  group by 1, 2;
end;
$$;

/** Expense per category in [p_from, p_to), live + imported days starting inside it. */
create function public.expense_by_category(
  p_business_id uuid,
  p_from timestamptz,
  p_to timestamptz
)
returns table (category_id uuid, amount bigint)
language plpgsql
stable
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_tz text;
begin
  perform public.assert_owner(p_business_id);
  v_tz := public.business_timezone(p_business_id);
  return query
  select u.category_id, sum(u.amount)::bigint
  from (
    select e.category_id, e.amount
    from public.expenses e
    where e.business_id = p_business_id and e.status = 'active'
      and e.occurred_at >= p_from and e.occurred_at < p_to
    union all
    select x.category_id, x.amount
    from public.historical_expenses x
    where x.business_id = p_business_id
      and (x.day_key::timestamp at time zone v_tz) >= p_from
      and (x.day_key::timestamp at time zone v_tz) < p_to
  ) u
  group by u.category_id
  order by 2 desc;
end;
$$;

/**
 * The monthly recap matrix as rows: one row per (day, category) with an amount, plus
 * income rows with category_id null. `imported` marks days that hold spreadsheet data.
 */
create function public.monthly_matrix(p_business_id uuid, p_month date)
returns table (day_key date, category_id uuid, amount bigint, imported boolean)
language plpgsql
stable
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_tz text;
  v_first date := date_trunc('month', p_month)::date;
  v_end date := (date_trunc('month', p_month) + interval '1 month')::date;
begin
  perform public.assert_owner(p_business_id);
  v_tz := public.business_timezone(p_business_id);
  return query
  with lines as (
    select (t.occurred_at at time zone v_tz)::date as day_key, null::uuid as category_id,
      t.total as amount, false as imported
    from public.transactions t
    where t.business_id = p_business_id and t.status = 'paid'
      and t.occurred_at >= (v_first::timestamp at time zone v_tz)
      and t.occurred_at < (v_end::timestamp at time zone v_tz)
    union all
    select (e.occurred_at at time zone v_tz)::date, e.category_id, e.amount, false
    from public.expenses e
    where e.business_id = p_business_id and e.status = 'active'
      and e.occurred_at >= (v_first::timestamp at time zone v_tz)
      and e.occurred_at < (v_end::timestamp at time zone v_tz)
    union all
    select h.day_key, null::uuid, h.income, true
    from public.historical_days h
    where h.business_id = p_business_id and h.day_key >= v_first and h.day_key < v_end
    union all
    select x.day_key, x.category_id, x.amount, true
    from public.historical_expenses x
    where x.business_id = p_business_id and x.day_key >= v_first and x.day_key < v_end
  )
  select r.day_key, r.category_id, sum(r.amount)::bigint, bool_or(r.imported)
  from lines r
  group by r.day_key, r.category_id
  order by r.day_key;
end;
$$;

/** First business day with any data (live or imported), or null. */
create function public.first_activity_day(p_business_id uuid)
returns date
language plpgsql
stable
set search_path = ''
as $$
declare
  v_tz text;
  v_day date;
begin
  perform public.assert_owner(p_business_id);
  v_tz := public.business_timezone(p_business_id);
  select min(d) into v_day from (
    select min((t.occurred_at at time zone v_tz)::date) as d
      from public.transactions t where t.business_id = p_business_id
    union all
    select min((e.occurred_at at time zone v_tz)::date)
      from public.expenses e where e.business_id = p_business_id
    union all
    select min(h.day_key) from public.historical_days h where h.business_id = p_business_id
  ) s;
  return v_day;
end;
$$;

/** Business days in [p_first_day, p_last_day] that hold live cashier data (import skips them). */
create function public.live_days(p_business_id uuid, p_first_day date, p_last_day date)
returns setof date
language plpgsql
stable
set search_path = ''
as $$
declare
  v_tz text;
begin
  perform public.assert_owner(p_business_id);
  v_tz := public.business_timezone(p_business_id);
  return query
  select distinct (t.occurred_at at time zone v_tz)::date
    from public.transactions t
    where t.business_id = p_business_id
      and t.occurred_at >= (p_first_day::timestamp at time zone v_tz)
      and t.occurred_at < ((p_last_day + 1)::timestamp at time zone v_tz)
  union
  select distinct (e.occurred_at at time zone v_tz)::date
    from public.expenses e
    where e.business_id = p_business_id
      and e.occurred_at >= (p_first_day::timestamp at time zone v_tz)
      and e.occurred_at < ((p_last_day + 1)::timestamp at time zone v_tz);
end;
$$;

-- ---------------------------------------------------------------------------
-- Business logos (decision #10) in Storage: public read (shown on receipts), owners write
-- only inside their business folder `<business_id>/…`.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('logos', 'logos', true, 1048576, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;

create policy logos_owner_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'logos'
    and public.is_owner(((storage.foldername(name))[1])::uuid)
  );
create policy logos_owner_update on storage.objects
  for update to authenticated
  using (bucket_id = 'logos' and public.is_owner(((storage.foldername(name))[1])::uuid))
  with check (bucket_id = 'logos' and public.is_owner(((storage.foldername(name))[1])::uuid));
create policy logos_owner_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'logos' and public.is_owner(((storage.foldername(name))[1])::uuid));

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------

revoke execute on function
  public.discount_amount(bigint, public.discount_type, bigint),
  public.save_order(jsonb),
  public.cancel_order(uuid, text, timestamptz),
  public.assert_owner(uuid),
  public.period_totals(uuid, timestamptz, timestamptz),
  public.daily_totals(uuid, date, date),
  public.monthly_totals(uuid, date, integer),
  public.top_items(uuid, timestamptz, timestamptz, integer),
  public.busy_hours(uuid, timestamptz, timestamptz),
  public.expense_by_category(uuid, timestamptz, timestamptz),
  public.monthly_matrix(uuid, date),
  public.first_activity_day(uuid),
  public.live_days(uuid, date, date)
from public, anon;
grant execute on function
  public.discount_amount(bigint, public.discount_type, bigint),
  public.save_order(jsonb),
  public.cancel_order(uuid, text, timestamptz),
  public.assert_owner(uuid),
  public.period_totals(uuid, timestamptz, timestamptz),
  public.daily_totals(uuid, date, date),
  public.monthly_totals(uuid, date, integer),
  public.top_items(uuid, timestamptz, timestamptz, integer),
  public.busy_hours(uuid, timestamptz, timestamptz),
  public.expense_by_category(uuid, timestamptz, timestamptz),
  public.monthly_matrix(uuid, date),
  public.first_activity_day(uuid),
  public.live_days(uuid, date, date)
to authenticated;
grant execute on all functions in schema public to service_role;
