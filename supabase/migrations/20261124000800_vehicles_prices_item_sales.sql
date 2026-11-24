-- Vehicles per day, cashier price edits, Olsera item sales and the cashier password vault
-- (decisions #43–#46, AGENTS.md section 5).
--
--   * catalog_categories.counts_vehicles: one wash service = one vehicle; add-ons do not
--     count (#43). vehicle_summary / daily_summary report it.
--   * businesses.cashier_can_edit_prices + cashier_set_item_price: the owner may let the
--     cashier change catalog prices online; every change lands in audit_log (#44).
--   * historical_item_sales + import_item_sales: monthly per-service sales imported from
--     Olsera reports. Analysis only: never income, cash or drawer (#45).
--   * cashier_password_save / _read / _status: the cashier password kept encrypted in
--     Supabase Vault so the owner can look it up; service role only (#46).

-- ---------------------------------------------------------------------------
-- Vehicles (decision #43)
-- ---------------------------------------------------------------------------

alter table public.catalog_categories
  add column counts_vehicles boolean not null default true;
grant insert (counts_vehicles), update (counts_vehicles) on public.catalog_categories
  to authenticated;

-- ---------------------------------------------------------------------------
-- Cashier price edits (decision #44)
-- ---------------------------------------------------------------------------

alter table public.businesses
  add column cashier_can_edit_prices boolean not null default false;
grant update (cashier_can_edit_prices) on public.businesses to authenticated;

-- The cashier needs the switch to show its price button.
create or replace view public.business_branding
with (security_barrier = true)
as
select
  b.id,
  b.name,
  b.logo_path,
  b.address,
  b.phone,
  b.receipt_footer,
  b.primary_color,
  b.receipt_prefix,
  b.timezone,
  b.is_active,
  b.drawer_float,
  b.cashier_can_edit_prices
from public.businesses b
where public.is_member(b.id);

/**
 * The cashier changes one active catalog price, online only. Allowed only while the owner
 * keeps `cashier_can_edit_prices` on. The audit trigger records the cashier as the actor and
 * the old price; past transactions keep their own price snapshot (decision #15).
 * Returns the previous price.
 */
create function public.cashier_set_item_price(p_item_id uuid, p_price bigint)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item public.catalog_items;
begin
  if p_price is null or p_price < 0 or p_price > 100000000 then
    raise exception 'Harga tidak valid' using errcode = '22023';
  end if;
  select * into v_item from public.catalog_items i where i.id = p_item_id for update;
  if not found or not public.is_cashier(v_item.business_id) then
    raise exception 'Layanan tidak ditemukan' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.businesses b
    where b.id = v_item.business_id and b.cashier_can_edit_prices
  ) then
    raise exception 'Owner belum mengizinkan kasir mengubah harga' using errcode = '42501';
  end if;
  if not v_item.is_active then
    raise exception 'Layanan sudah tidak aktif' using errcode = '22023';
  end if;
  if v_item.price <> p_price then
    update public.catalog_items set price = p_price where id = p_item_id;
  end if;
  return v_item.price;
end;
$$;

-- ---------------------------------------------------------------------------
-- Imported item sales (decision #45): analysis only
-- ---------------------------------------------------------------------------

alter table public.business_configs
  add column item_mapping jsonb not null default '{}'::jsonb
    check (jsonb_typeof(item_mapping) = 'object');
grant update (item_mapping) on public.business_configs to authenticated;

create table public.historical_item_sales (
  business_id uuid not null references public.businesses (id),
  source text not null check (source in ('olsera')),
  first_day date not null,
  last_day date not null,
  product text not null check (length(btrim(product)) between 1 and 120),
  product_group text check (product_group is null or length(product_group) <= 120),
  catalog_item_id uuid,
  qty integer not null check (qty >= 0),
  orders integer not null default 0 check (orders >= 0),
  amount bigint not null check (amount >= 0),
  imported_at timestamptz not null default now(),
  imported_by uuid references auth.users (id) on delete set null,
  primary key (business_id, source, first_day, product),
  check (last_day >= first_day),
  foreign key (business_id, catalog_item_id) references public.catalog_items (business_id, id)
);
create index historical_item_sales_range_idx
  on public.historical_item_sales (business_id, first_day, last_day);

alter table public.historical_item_sales enable row level security;
create policy historical_item_sales_owner_select on public.historical_item_sales
  for select to authenticated using (public.is_owner(business_id));
grant select on public.historical_item_sales to authenticated;

/**
 * Replaces the imported item sales of each period (one Olsera report = one period).
 * `p_periods`: [{first_day, last_day, rows: [{product, product_group, catalog_item_id,
 * qty, orders, amount}]}]. A period that reaches a day with cashier data ends the day
 * before (the cashier took over, decision #45); a period entirely after that is refused.
 * `p_mapping` (normalized product → item id or 'skip') is remembered for the next import.
 * Returns the number of periods saved.
 */
create function public.import_item_sales(
  p_business_id uuid,
  p_source text,
  p_periods jsonb,
  p_mapping jsonb default '{}'::jsonb
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tz text;
  v_period jsonb;
  v_row jsonb;
  v_first date;
  v_last date;
  v_live date;
  v_count integer := 0;
  v_value text;
begin
  if not public.is_owner(p_business_id) then
    raise exception 'Usaha tidak ditemukan' using errcode = '42501';
  end if;
  if p_source is distinct from 'olsera' or jsonb_typeof(p_periods) is distinct from 'array' then
    raise exception 'Format data impor tidak valid' using errcode = '22023';
  end if;
  v_tz := public.business_timezone(p_business_id);

  for v_value in select value from jsonb_each_text(coalesce(p_mapping, '{}'::jsonb)) loop
    if v_value <> 'skip' and not exists (
      select 1 from public.catalog_items i
      where i.business_id = p_business_id and i.id::text = v_value
    ) then
      raise exception 'Pemetaan layanan tidak valid' using errcode = '23503';
    end if;
  end loop;

  for v_period in select value from jsonb_array_elements(p_periods) loop
    v_first := (v_period ->> 'first_day')::date;
    v_last := (v_period ->> 'last_day')::date;
    if v_first is null or v_last is null or v_last < v_first then
      raise exception 'Periode impor tidak valid' using errcode = '23514';
    end if;

    select min((t.occurred_at at time zone v_tz)::date) into v_live
    from public.transactions t
    where t.business_id = p_business_id
      and t.occurred_at >= (v_first::timestamp at time zone v_tz)
      and t.occurred_at < ((v_last + 1)::timestamp at time zone v_tz);
    if v_live is not null then
      if v_live <= v_first then
        raise exception 'Periode % sudah punya data kasir', v_first using errcode = '23505';
      end if;
      v_last := v_live - 1;
    end if;

    delete from public.historical_item_sales s
    where s.business_id = p_business_id and s.source = p_source and s.first_day = v_first;
    for v_row in select value from jsonb_array_elements(coalesce(v_period -> 'rows', '[]')) loop
      insert into public.historical_item_sales (
        business_id, source, first_day, last_day, product, product_group, catalog_item_id,
        qty, orders, amount, imported_by
      ) values (
        p_business_id, p_source, v_first, v_last,
        btrim(v_row ->> 'product'),
        nullif(btrim(coalesce(v_row ->> 'product_group', '')), ''),
        nullif(v_row ->> 'catalog_item_id', '')::uuid,
        coalesce((v_row ->> 'qty')::integer, 0),
        coalesce((v_row ->> 'orders')::integer, 0),
        coalesce((v_row ->> 'amount')::bigint, 0),
        auth.uid()
      )
      on conflict (business_id, source, first_day, product) do update set
        qty = public.historical_item_sales.qty + excluded.qty,
        orders = public.historical_item_sales.orders + excluded.orders,
        amount = public.historical_item_sales.amount + excluded.amount;
    end loop;
    v_count := v_count + 1;
  end loop;

  update public.business_configs
  set item_mapping = item_mapping || coalesce(p_mapping, '{}'::jsonb)
  where business_id = p_business_id;
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- Aggregates. Imported item sales count only when the whole report period lies inside
-- the asked range: a monthly report cannot be split by day (decision #45).
-- ---------------------------------------------------------------------------

/** Best-selling services by revenue: live sales + imported item sales, grouped per item. */
create or replace function public.top_items(
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
declare
  v_tz text;
begin
  perform public.assert_owner(p_business_id);
  v_tz := public.business_timezone(p_business_id);
  return query
  with sold as (
    select i.catalog_item_id as item_id, i.name_snapshot as label, i.qty::bigint as qty,
      i.line_total as amount
    from public.transaction_items i
    join public.transactions t on t.business_id = i.business_id and t.id = i.transaction_id
    where t.business_id = p_business_id and t.status = 'paid'
      and t.occurred_at >= p_from and t.occurred_at < p_to
    union all
    select s.catalog_item_id, s.product, s.qty::bigint, s.amount
    from public.historical_item_sales s
    where s.business_id = p_business_id
      and (s.first_day::timestamp at time zone v_tz) >= p_from
      and ((s.last_day + 1)::timestamp at time zone v_tz) <= p_to
  ), grouped as (
    select
      coalesce(sold.item_id::text, 'label:' || public.normalize_label(sold.label)) as key,
      sold.item_id,
      max(sold.label) as label,
      sum(sold.qty)::bigint as qty,
      sum(sold.amount)::bigint as revenue
    from sold
    group by 1, 2
  )
  -- The current catalog name, so a renamed service stays one row.
  select coalesce(c.name, g.label), g.qty, g.revenue
  from grouped g
  left join public.catalog_items c on c.business_id = p_business_id and c.id = g.item_id
  order by 3 desc, 1
  limit greatest(p_limit, 1);
end;
$$;

/**
 * Vehicles per catalog category in `[p_from, p_to)`: Σ qty of services whose category
 * counts vehicles (live + imported item sales). `days` is the same on every row: the days
 * that had business, i.e. days with paid sales plus, for each imported period, its days
 * with imported income (or all its days when that month has no imported income).
 */
create function public.vehicle_summary(p_business_id uuid, p_from timestamptz, p_to timestamptz)
returns table (category_id uuid, category_name text, vehicles bigint, days integer)
language plpgsql
stable
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_tz text;
  v_days integer;
begin
  perform public.assert_owner(p_business_id);
  v_tz := public.business_timezone(p_business_id);

  with periods as (
    select distinct s.first_day, s.last_day
    from public.historical_item_sales s
    where s.business_id = p_business_id
      and (s.first_day::timestamp at time zone v_tz) >= p_from
      and ((s.last_day + 1)::timestamp at time zone v_tz) <= p_to
  ), period_days as (
    select coalesce(
      nullif((
        select count(*)::integer from public.historical_days h
        where h.business_id = p_business_id and h.income > 0
          and h.day_key between p.first_day and p.last_day
      ), 0),
      (p.last_day - p.first_day + 1)
    ) as n
    from periods p
  )
  select
    coalesce((select sum(n) from period_days), 0)::integer
    + (
      select count(distinct (t.occurred_at at time zone v_tz)::date)::integer
      from public.transactions t
      where t.business_id = p_business_id and t.status = 'paid'
        and t.occurred_at >= p_from and t.occurred_at < p_to
    )
  into v_days;

  return query
  with sold as (
    select i.catalog_item_id as item_id, i.qty::bigint as qty
    from public.transaction_items i
    join public.transactions t on t.business_id = i.business_id and t.id = i.transaction_id
    where t.business_id = p_business_id and t.status = 'paid'
      and t.occurred_at >= p_from and t.occurred_at < p_to
    union all
    select s.catalog_item_id, s.qty::bigint
    from public.historical_item_sales s
    where s.business_id = p_business_id
      and (s.first_day::timestamp at time zone v_tz) >= p_from
      and ((s.last_day + 1)::timestamp at time zone v_tz) <= p_to
  )
  select c.id, c.name, sum(sold.qty)::bigint, v_days
  from sold
  join public.catalog_items i on i.business_id = p_business_id and i.id = sold.item_id
  join public.catalog_categories c on c.business_id = p_business_id and c.id = i.category_id
  where c.counts_vehicles
  group by c.id, c.name, c.sort_order
  having sum(sold.qty) > 0
  order by c.sort_order, c.name;
end;
$$;

/**
 * daily_totals plus, per day, the vehicles (live sales in vehicle categories) and the paid
 * transactions. Imported item sales are monthly, so they never show up per day.
 */
create function public.daily_summary(p_business_id uuid, p_first_day date, p_last_day date)
returns table (day_key date, income bigint, expense bigint, vehicles bigint, transactions bigint)
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
    select (t.occurred_at at time zone v_tz)::date as day_key, count(*)::bigint as n
    from public.transactions t
    where t.business_id = p_business_id and t.status = 'paid'
      and t.occurred_at >= (p_first_day::timestamp at time zone v_tz)
      and t.occurred_at < ((p_last_day + 1)::timestamp at time zone v_tz)
    group by 1
  ), veh as (
    select (t.occurred_at at time zone v_tz)::date as day_key, sum(i.qty)::bigint as n
    from public.transaction_items i
    join public.transactions t on t.business_id = i.business_id and t.id = i.transaction_id
    join public.catalog_items ci on ci.business_id = i.business_id and ci.id = i.catalog_item_id
    join public.catalog_categories c on c.business_id = ci.business_id and c.id = ci.category_id
    where t.business_id = p_business_id and t.status = 'paid' and c.counts_vehicles
      and t.occurred_at >= (p_first_day::timestamp at time zone v_tz)
      and t.occurred_at < ((p_last_day + 1)::timestamp at time zone v_tz)
    group by 1
  )
  select d.day_key, d.income, d.expense, coalesce(veh.n, 0)::bigint, coalesce(tx.n, 0)::bigint
  from public.daily_totals(p_business_id, p_first_day, p_last_day) d
  left join tx on tx.day_key = d.day_key
  left join veh on veh.day_key = d.day_key
  order by d.day_key;
end;
$$;

-- ---------------------------------------------------------------------------
-- Templates carry the vehicle flag per catalog category (decision #43)
-- ---------------------------------------------------------------------------

create or replace function public.apply_template_rows(p_business_id uuid, p_template jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group jsonb;
  v_item jsonb;
  v_category jsonb;
  v_category_id uuid;
  v_requires_note boolean;
  v_added_categories integer := 0;
  v_added_items integer := 0;
  v_added_expense_categories integer := 0;
begin
  for v_group in select value from jsonb_array_elements(coalesce(p_template -> 'catalog', '[]')) loop
    select c.id into v_category_id
    from public.catalog_categories c
    where c.business_id = p_business_id
      and public.normalize_label(c.name) = public.normalize_label(v_group ->> 'category');
    if not found then
      insert into public.catalog_categories (business_id, name, sort_order, counts_vehicles)
      select p_business_id, btrim(v_group ->> 'category'), coalesce(max(c.sort_order) + 1, 0),
        coalesce((v_group ->> 'countsVehicles')::boolean, true)
      from public.catalog_categories c
      where c.business_id = p_business_id
      returning id into v_category_id;
      v_added_categories := v_added_categories + 1;
    end if;

    for v_item in select value from jsonb_array_elements(coalesce(v_group -> 'items', '[]')) loop
      continue when exists (
        select 1 from public.catalog_items i
        where i.business_id = p_business_id
          and public.normalize_label(i.name) = public.normalize_label(v_item ->> 'name')
      );
      insert into public.catalog_items (business_id, category_id, name, price, sort_order)
      select p_business_id, v_category_id, btrim(v_item ->> 'name'), (v_item ->> 'price')::bigint,
        coalesce(max(i.sort_order) + 1, 0)
      from public.catalog_items i
      where i.business_id = p_business_id and i.category_id = v_category_id;
      v_added_items := v_added_items + 1;
    end loop;
  end loop;

  for v_category in
    select value from jsonb_array_elements(coalesce(p_template -> 'expenseCategories', '[]'))
  loop
    v_requires_note := coalesce((v_category ->> 'requiresNote')::boolean, false);
    continue when exists (
      select 1 from public.expense_categories c
      where c.business_id = p_business_id
        and (
          public.normalize_label(c.name) = public.normalize_label(v_category ->> 'name')
          or (v_requires_note and c.requires_note)
        )
    );
    insert into public.expense_categories (
      business_id, name, kind, allow_drawer, requires_note, sort_order
    )
    select p_business_id,
      btrim(v_category ->> 'name'),
      (v_category ->> 'kind')::public.expense_kind,
      coalesce((v_category ->> 'allowDrawer')::boolean, true),
      v_requires_note,
      coalesce(max(c.sort_order) + 1, 0)
    from public.expense_categories c
    where c.business_id = p_business_id;
    v_added_expense_categories := v_added_expense_categories + 1;
  end loop;

  return jsonb_build_object(
    'catalogCategories', v_added_categories,
    'catalogItems', v_added_items,
    'expenseCategories', v_added_expense_categories
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Cashier password in Supabase Vault (decision #46). Called by the manage-cashier Edge
-- Function only (service role), after it has checked that the caller owns the business.
-- ---------------------------------------------------------------------------

create function public.cashier_password_save(p_business_id uuid, p_password text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := 'kasiko_cashier_password_' || p_business_id::text;
  v_id uuid;
begin
  select s.id into v_id from vault.secrets s where s.name = v_name;
  if v_id is null then
    perform vault.create_secret(p_password, v_name, 'Kasiko: kata sandi akun kasir');
  else
    perform vault.update_secret(v_id, p_password);
  end if;
end;
$$;

/** The stored password (null when none), logged in audit_log as a reveal by `p_actor`. */
create function public.cashier_password_read(p_business_id uuid, p_actor uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_password text;
begin
  select s.decrypted_secret into v_password
  from vault.decrypted_secrets s
  where s.name = 'kasiko_cashier_password_' || p_business_id::text;
  if v_password is not null then
    insert into public.audit_log (business_id, actor_id, action, entity, entity_id)
    values (p_business_id, p_actor, 'reveal', 'cashier_password', p_business_id::text);
  end if;
  return v_password;
end;
$$;

create function public.cashier_password_status(p_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from vault.secrets s where s.name = 'kasiko_cashier_password_' || p_business_id::text
  );
$$;

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------

revoke execute on function
  public.cashier_set_item_price(uuid, bigint),
  public.import_item_sales(uuid, text, jsonb, jsonb),
  public.vehicle_summary(uuid, timestamptz, timestamptz),
  public.daily_summary(uuid, date, date),
  public.apply_template_rows(uuid, jsonb),
  public.cashier_password_save(uuid, text),
  public.cashier_password_read(uuid, uuid),
  public.cashier_password_status(uuid)
from public, anon, authenticated;
grant execute on function
  public.cashier_set_item_price(uuid, bigint),
  public.import_item_sales(uuid, text, jsonb, jsonb),
  public.vehicle_summary(uuid, timestamptz, timestamptz),
  public.daily_summary(uuid, date, date)
to authenticated;
grant execute on function
  public.cashier_password_save(uuid, text),
  public.cashier_password_read(uuid, uuid),
  public.cashier_password_status(uuid)
to service_role;
grant execute on all functions in schema public to service_role;
