-- Vehicle history and receipt-level price edits (2026-11-24).
--
--   * vehicle_days / vehicle_months: vehicles per category per day (live sales) and per
--     month (live sales + imported Olsera item sales) for the Laporan "Kendaraan" tab (#43).
--   * Decision #44 revised by the owner: the cashier no longer changes catalog prices.
--     cashier_set_item_price is dropped; `cashier_can_edit_prices` now means "the cashier may
--     edit prices and lines on the receipt before saving". The server already accepts the
--     device's price snapshot (#15); transaction_items.catalog_price keeps the catalog price
--     at the moment the sale arrived, so the owner can see which lines were changed.

-- ---------------------------------------------------------------------------
-- Vehicle history (decision #43)
-- ---------------------------------------------------------------------------

/** Vehicles per day and category from live paid sales, days in the business time zone. */
create function public.vehicle_days(p_business_id uuid, p_from timestamptz, p_to timestamptz)
returns table (day_key date, category_id uuid, category_name text, vehicles bigint)
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
  select (t.occurred_at at time zone v_tz)::date, c.id, c.name, sum(i.qty)::bigint
  from public.transaction_items i
  join public.transactions t on t.business_id = i.business_id and t.id = i.transaction_id
  join public.catalog_items ci on ci.business_id = i.business_id and ci.id = i.catalog_item_id
  join public.catalog_categories c on c.business_id = ci.business_id and c.id = ci.category_id
  where t.business_id = p_business_id and t.status = 'paid' and c.counts_vehicles
    and t.occurred_at >= p_from and t.occurred_at < p_to
  group by 1, c.id, c.name, c.sort_order
  order by 1, c.sort_order, c.name;
end;
$$;

/**
 * Vehicles per month and category since the first record: live paid sales (source 'kasir')
 * and imported item sales (source 'olsera', counted in the month the report starts).
 */
create function public.vehicle_months(p_business_id uuid)
returns table (month_key date, category_id uuid, category_name text, source text, vehicles bigint)
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
    select date_trunc('month', t.occurred_at at time zone v_tz)::date as month_key,
      i.catalog_item_id as item_id, 'kasir'::text as source, i.qty::bigint as qty
    from public.transaction_items i
    join public.transactions t on t.business_id = i.business_id and t.id = i.transaction_id
    where t.business_id = p_business_id and t.status = 'paid'
    union all
    select date_trunc('month', s.first_day)::date, s.catalog_item_id, s.source, s.qty::bigint
    from public.historical_item_sales s
    where s.business_id = p_business_id
  )
  select sold.month_key, c.id, c.name, sold.source, sum(sold.qty)::bigint
  from sold
  join public.catalog_items ci on ci.business_id = p_business_id and ci.id = sold.item_id
  join public.catalog_categories c on c.business_id = p_business_id and c.id = ci.category_id
  where c.counts_vehicles
  group by sold.month_key, c.id, c.name, c.sort_order, sold.source
  having sum(sold.qty) > 0
  order by sold.month_key, c.sort_order, c.name, sold.source;
end;
$$;

revoke execute on function public.vehicle_days(uuid, timestamptz, timestamptz) from public, anon;
revoke execute on function public.vehicle_months(uuid) from public, anon;
grant execute on function public.vehicle_days(uuid, timestamptz, timestamptz) to authenticated;
grant execute on function public.vehicle_months(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Receipt-level price edits (decision #44, revised)
-- ---------------------------------------------------------------------------

drop function public.cashier_set_item_price(uuid, bigint);

alter table public.transaction_items add column catalog_price bigint;
comment on column public.transaction_items.catalog_price is
  'Catalog price when the sale reached the server; differs from price_snapshot when the line price was edited on the receipt (or the device catalog was stale).';

create function public.transaction_items_catalog_price()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.catalog_item_id is not null then
    select ci.price into new.catalog_price
    from public.catalog_items ci
    where ci.business_id = new.business_id and ci.id = new.catalog_item_id;
  end if;
  return new;
end;
$$;
revoke execute on function public.transaction_items_catalog_price() from public, anon, authenticated;

create trigger transaction_items_catalog_price
before insert on public.transaction_items
for each row execute function public.transaction_items_catalog_price();
