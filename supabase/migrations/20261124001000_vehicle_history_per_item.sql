-- Vehicle history per catalog item (decision #43, 2026-11-24): the Laporan "Kendaraan" tab
-- shows every vehicle service (Cuci Mobil Sedang, Cuci Motor Kecil, ...) next to its
-- category. vehicle_days / vehicle_months now return one row per item; the app sums them
-- per category. The return types change, so the functions are dropped and created again.

drop function public.vehicle_days(uuid, timestamptz, timestamptz);
drop function public.vehicle_months(uuid);

/** Vehicles per day and catalog item from live paid sales, days in the business time zone. */
create function public.vehicle_days(p_business_id uuid, p_from timestamptz, p_to timestamptz)
returns table (
  day_key date, category_id uuid, category_name text, item_id uuid, item_name text, vehicles bigint
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
  select (t.occurred_at at time zone v_tz)::date, c.id, c.name, ci.id, ci.name, sum(i.qty)::bigint
  from public.transaction_items i
  join public.transactions t on t.business_id = i.business_id and t.id = i.transaction_id
  join public.catalog_items ci on ci.business_id = i.business_id and ci.id = i.catalog_item_id
  join public.catalog_categories c on c.business_id = ci.business_id and c.id = ci.category_id
  where t.business_id = p_business_id and t.status = 'paid' and c.counts_vehicles
    and t.occurred_at >= p_from and t.occurred_at < p_to
  group by 1, c.id, c.name, c.sort_order, ci.id, ci.name, ci.sort_order
  order by 1, c.sort_order, ci.sort_order, ci.name;
end;
$$;

/**
 * Vehicles per month and catalog item since the first record: live paid sales (source
 * 'kasir') and imported item sales (source 'olsera', in the month the report starts).
 */
create function public.vehicle_months(p_business_id uuid)
returns table (
  month_key date, category_id uuid, category_name text, item_id uuid, item_name text,
  source text, vehicles bigint
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
  select sold.month_key, c.id, c.name, ci.id, ci.name, sold.source, sum(sold.qty)::bigint
  from sold
  join public.catalog_items ci on ci.business_id = p_business_id and ci.id = sold.item_id
  join public.catalog_categories c on c.business_id = p_business_id and c.id = ci.category_id
  where c.counts_vehicles
  group by sold.month_key, c.id, c.name, c.sort_order, ci.id, ci.name, ci.sort_order, sold.source
  having sum(sold.qty) > 0
  order by sold.month_key, c.sort_order, ci.sort_order, ci.name, sold.source;
end;
$$;

revoke execute on function public.vehicle_days(uuid, timestamptz, timestamptz) from public, anon;
revoke execute on function public.vehicle_months(uuid) from public, anon;
grant execute on function public.vehicle_days(uuid, timestamptz, timestamptz) to authenticated;
grant execute on function public.vehicle_months(uuid) to authenticated;
