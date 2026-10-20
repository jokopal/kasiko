-- Financial formulas (AGENTS.md section 4, decision #24) and the audit trail (#21).
-- The formulas mirror src/features/reports/finance.ts; both are tested against the same
-- cases. They run as the caller (security invoker), so RLS still applies underneath the
-- explicit role checks.

-- ---------------------------------------------------------------------------
-- Period totals: owners only (cashiers never see the recap)
-- ---------------------------------------------------------------------------

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
  historical_days bigint
)
language plpgsql
stable
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_tz text;
begin
  if not public.is_owner(p_business_id) then
    raise exception 'Rekap hanya untuk owner' using errcode = '42501';
  end if;
  v_tz := public.business_timezone(p_business_id);

  return query
  with tx as (
    select t.total, t.payment_method
    from public.transactions t
    where t.business_id = p_business_id
      and t.status = 'paid'
      and t.occurred_at >= p_from and t.occurred_at < p_to
  ), ex as (
    select e.amount, e.source, c.kind
    from public.expenses e
    join public.expense_categories c on c.business_id = e.business_id and c.id = e.category_id
    where e.business_id = p_business_id
      and e.status = 'active'
      and e.occurred_at >= p_from and e.occurred_at < p_to
  ), hd as (
    -- Imported days count when the day starts inside the period.
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
    select kind, amount from ex
    union all
    select kind, amount from hx
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
      (select count(*) from hd)::bigint as hist_days
  )
  select
    s.live_income + s.hist_income,
    s.op + s.non_op + s.draw,
    s.op,
    s.non_op,
    s.draw,
    s.live_income + s.hist_income - s.op,
    -- Drawings never reduce profit (decision #24).
    s.live_income + s.hist_income - s.op - s.non_op,
    s.live_income + s.hist_income - (s.op + s.non_op + s.draw),
    s.tx_count,
    s.cash,
    s.qris,
    s.transfer,
    s.drawer,
    s.owner,
    s.hist_income,
    s.hist_days
  from s;
end;
$$;

-- ---------------------------------------------------------------------------
-- Reserve balance & free cash (decision #8): owners only
-- ---------------------------------------------------------------------------

/** Σ deposit − Σ withdraw, all time (or movements before `p_until`). */
create function public.reserve_balance(p_business_id uuid, p_until timestamptz default null)
returns bigint
language plpgsql
stable
set search_path = ''
as $$
declare
  v_balance bigint;
begin
  if not public.is_owner(p_business_id) then
    raise exception 'Dana cadangan hanya untuk owner' using errcode = '42501';
  end if;
  select coalesce(sum(case when r.type = 'deposit' then r.amount else -r.amount end), 0)
    into v_balance
    from public.reserve_movements r
    where r.business_id = p_business_id
      and (p_until is null or r.occurred_at < p_until);
  return v_balance;
end;
$$;

/**
 * Kas bebas = opening cash + Σ income − Σ expense (every kind, drawings included)
 * − Σ deposit(source cash) + Σ withdraw. Imported history is excluded: opening cash is
 * the cash on hand when the business started using Kasiko.
 */
create function public.free_cash(p_business_id uuid, p_until timestamptz default null)
returns bigint
language plpgsql
stable
set search_path = ''
as $$
declare
  v_opening bigint;
  v_income bigint;
  v_expense bigint;
  v_cash_deposits bigint;
  v_withdrawals bigint;
begin
  if not public.is_owner(p_business_id) then
    raise exception 'Kas bebas hanya untuk owner' using errcode = '42501';
  end if;
  select b.opening_cash into v_opening from public.businesses b where b.id = p_business_id;
  select coalesce(sum(t.total), 0) into v_income
    from public.transactions t
    where t.business_id = p_business_id and t.status = 'paid'
      and (p_until is null or t.occurred_at < p_until);
  select coalesce(sum(e.amount), 0) into v_expense
    from public.expenses e
    where e.business_id = p_business_id and e.status = 'active'
      and (p_until is null or e.occurred_at < p_until);
  select
    coalesce(sum(r.amount) filter (where r.type = 'deposit' and r.source = 'cash'), 0),
    coalesce(sum(r.amount) filter (where r.type = 'withdraw'), 0)
    into v_cash_deposits, v_withdrawals
    from public.reserve_movements r
    where r.business_id = p_business_id
      and (p_until is null or r.occurred_at < p_until);
  return v_opening + v_income - v_expense - v_cash_deposits + v_withdrawals;
end;
$$;

-- ---------------------------------------------------------------------------
-- Drawer: cashier and owner
-- ---------------------------------------------------------------------------

/** Uang laci seharusnya hari ini = Σ cash sales − Σ drawer expenses (business day). */
create function public.drawer_expected(p_business_id uuid)
returns bigint
language plpgsql
stable
set search_path = ''
as $$
declare
  v_start timestamptz;
  v_cash bigint;
  v_drawer bigint;
begin
  if not public.is_member(p_business_id) then
    raise exception 'Usaha tidak ditemukan' using errcode = '42501';
  end if;
  v_start := public.business_day_start(p_business_id);
  select coalesce(sum(t.total), 0) into v_cash
    from public.transactions t
    where t.business_id = p_business_id and t.status = 'paid' and t.payment_method = 'cash'
      and t.occurred_at >= v_start and t.occurred_at < v_start + interval '1 day';
  select coalesce(sum(e.amount), 0) into v_drawer
    from public.expenses e
    where e.business_id = p_business_id and e.status = 'active' and e.source = 'drawer'
      and e.occurred_at >= v_start and e.occurred_at < v_start + interval '1 day';
  return v_cash - v_drawer;
end;
$$;

-- ---------------------------------------------------------------------------
-- Audit trail (decision #21): prices, catalog, settings and accounts. Owner voids are
-- logged by the void RPCs.
-- ---------------------------------------------------------------------------

create function public.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old jsonb := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
  v_new jsonb := to_jsonb(new);
  v_business uuid;
  v_entity_id text;
begin
  if tg_op = 'UPDATE' and (v_old - 'updated_at') = (v_new - 'updated_at') then
    return null;
  end if;
  if tg_table_name = 'businesses' then
    v_business := (v_new ->> 'id')::uuid;
  else
    v_business := (v_new ->> 'business_id')::uuid;
  end if;
  v_entity_id := coalesce(v_new ->> 'id', v_new ->> 'user_id');
  insert into public.audit_log (business_id, actor_id, action, entity, entity_id, old_data, new_data)
  values (v_business, auth.uid(), lower(tg_op), tg_table_name, v_entity_id, v_old, v_new);
  return null;
end;
$$;

create trigger audit_businesses
  after insert or update on public.businesses
  for each row execute function public.audit_row_change();
create trigger audit_business_members
  after insert or update on public.business_members
  for each row execute function public.audit_row_change();
create trigger audit_catalog_categories
  after insert or update on public.catalog_categories
  for each row execute function public.audit_row_change();
create trigger audit_catalog_items
  after insert or update on public.catalog_items
  for each row execute function public.audit_row_change();
create trigger audit_expense_categories
  after insert or update on public.expense_categories
  for each row execute function public.audit_row_change();

revoke execute on function
  public.period_totals(uuid, timestamptz, timestamptz),
  public.reserve_balance(uuid, timestamptz),
  public.free_cash(uuid, timestamptz),
  public.drawer_expected(uuid),
  public.audit_row_change()
from public, anon;
grant execute on function
  public.period_totals(uuid, timestamptz, timestamptz),
  public.reserve_balance(uuid, timestamptz),
  public.free_cash(uuid, timestamptz),
  public.drawer_expected(uuid)
to authenticated;
