-- Access control for the two roles (AGENTS.md section 5).
-- RLS is enabled on every table; nothing is exposed to `anon`. Writes that need
-- validation beyond a row check (sales, expenses, voids, devices, imports) go through
-- security-definer RPCs only — there are deliberately no insert/update policies for them.

-- ---------------------------------------------------------------------------
-- Helpers. Security definer so policies can read membership without recursion;
-- `(select auth.uid())` is evaluated once per statement.
-- ---------------------------------------------------------------------------

create function public.is_owner(p_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.business_members m
    where m.business_id = p_business_id
      and m.user_id = (select auth.uid())
      and m.role = 'owner'
      and m.is_active
  );
$$;

-- A cashier loses access when the account or the business is deactivated.
create function public.is_cashier(p_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.business_members m
    join public.businesses b on b.id = m.business_id
    where m.business_id = p_business_id
      and m.user_id = (select auth.uid())
      and m.role = 'cashier'
      and m.is_active
      and b.is_active
  );
$$;

create function public.is_member(p_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_owner(p_business_id) or public.is_cashier(p_business_id);
$$;

create function public.business_timezone(p_business_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select b.timezone from public.businesses b where b.id = p_business_id;
$$;

/** Business day (in the business timezone) that contains `p_at`. */
create function public.business_day(p_business_id uuid, p_at timestamptz)
returns date
language sql
stable
set search_path = ''
as $$
  select (p_at at time zone public.business_timezone(p_business_id))::date;
$$;

/** Start of the business day containing `p_at` (default: now). */
create function public.business_day_start(p_business_id uuid, p_at timestamptz default now())
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select (public.business_day(p_business_id, p_at))::timestamp
    at time zone public.business_timezone(p_business_id);
$$;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.businesses enable row level security;
alter table public.business_members enable row level security;
alter table public.business_configs enable row level security;
alter table public.catalog_categories enable row level security;
alter table public.catalog_items enable row level security;
alter table public.expense_categories enable row level security;
alter table public.devices enable row level security;
alter table public.transactions enable row level security;
alter table public.transaction_items enable row level security;
alter table public.expenses enable row level security;
alter table public.reserve_movements enable row level security;
alter table public.historical_days enable row level security;
alter table public.historical_expenses enable row level security;
alter table public.audit_log enable row level security;

-- Businesses: owners only. Cashiers read branding through `business_branding`, which
-- leaves out opening_cash (decision #19). New businesses come from `create_business`.
create policy businesses_owner_select on public.businesses
  for select to authenticated using (public.is_owner(id));
create policy businesses_owner_update on public.businesses
  for update to authenticated using (public.is_owner(id)) with check (public.is_owner(id));

create policy business_members_select on public.business_members
  for select to authenticated
  using (user_id = (select auth.uid()) or public.is_owner(business_id));

create policy business_configs_owner_select on public.business_configs
  for select to authenticated using (public.is_owner(business_id));
create policy business_configs_owner_update on public.business_configs
  for update to authenticated
  using (public.is_owner(business_id)) with check (public.is_owner(business_id));

-- Catalog: owners manage everything; the cashier sees active rows only.
create policy catalog_categories_select on public.catalog_categories
  for select to authenticated
  using (public.is_owner(business_id) or (is_active and public.is_cashier(business_id)));
create policy catalog_categories_owner_insert on public.catalog_categories
  for insert to authenticated with check (public.is_owner(business_id));
create policy catalog_categories_owner_update on public.catalog_categories
  for update to authenticated
  using (public.is_owner(business_id)) with check (public.is_owner(business_id));

create policy catalog_items_select on public.catalog_items
  for select to authenticated
  using (public.is_owner(business_id) or (is_active and public.is_cashier(business_id)));
create policy catalog_items_owner_insert on public.catalog_items
  for insert to authenticated with check (public.is_owner(business_id));
create policy catalog_items_owner_update on public.catalog_items
  for update to authenticated
  using (public.is_owner(business_id)) with check (public.is_owner(business_id));

-- Expense categories: the cashier sees only what the owner allows for the drawer (#26).
create policy expense_categories_select on public.expense_categories
  for select to authenticated
  using (
    public.is_owner(business_id)
    or (is_active and allow_drawer and public.is_cashier(business_id))
  );
create policy expense_categories_owner_insert on public.expense_categories
  for insert to authenticated with check (public.is_owner(business_id));
create policy expense_categories_owner_update on public.expense_categories
  for update to authenticated
  using (public.is_owner(business_id)) with check (public.is_owner(business_id));

create policy devices_select on public.devices
  for select to authenticated using (public.is_member(business_id));

-- Sales & expenses: the cashier sees today only (business timezone); owners see all.
create policy transactions_select on public.transactions
  for select to authenticated
  using (
    public.is_owner(business_id)
    or (public.is_cashier(business_id) and occurred_at >= public.business_day_start(business_id))
  );

create policy transaction_items_select on public.transaction_items
  for select to authenticated
  using (
    exists (
      select 1 from public.transactions t
      where t.business_id = transaction_items.business_id
        and t.id = transaction_items.transaction_id
    )
  );

create policy expenses_select on public.expenses
  for select to authenticated
  using (
    public.is_owner(business_id)
    or (
      source = 'drawer'
      and public.is_cashier(business_id)
      and occurred_at >= public.business_day_start(business_id)
    )
  );

-- Reserve, history and audit: owners only.
create policy reserve_movements_owner_select on public.reserve_movements
  for select to authenticated using (public.is_owner(business_id));
create policy reserve_movements_owner_insert on public.reserve_movements
  for insert to authenticated with check (public.is_owner(business_id));

create policy historical_days_owner_select on public.historical_days
  for select to authenticated using (public.is_owner(business_id));
create policy historical_expenses_owner_select on public.historical_expenses
  for select to authenticated using (public.is_owner(business_id));

create policy audit_log_owner_select on public.audit_log
  for select to authenticated using (public.is_owner(business_id));

-- Reserve withdrawals may never exceed the balance; the business row lock serializes
-- concurrent withdrawals. created_by is always the caller.
create function public.reserve_movements_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_balance bigint;
begin
  new.created_by := auth.uid();
  if new.type = 'withdraw' then
    perform 1 from public.businesses where id = new.business_id for update;
    select coalesce(sum(case when r.type = 'deposit' then r.amount else -r.amount end), 0)
      into v_balance
      from public.reserve_movements r
      where r.business_id = new.business_id;
    if new.amount > v_balance then
      raise exception 'Saldo cadangan tidak cukup' using errcode = '23514';
    end if;
    new.reason := btrim(new.reason);
  end if;
  return new;
end;
$$;

create trigger reserve_movements_before_insert
  before insert on public.reserve_movements
  for each row execute function public.reserve_movements_before_insert();

-- ---------------------------------------------------------------------------
-- Branding for the cashier (decision #19): no opening_cash, members only.
-- Runs with the view owner's rights; the membership filter is the access check.
-- ---------------------------------------------------------------------------

create view public.business_branding
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
  b.is_active
from public.businesses b
where public.is_member(b.id);

-- ---------------------------------------------------------------------------
-- Privileges: nothing for anon; authenticated gets only what the policies need,
-- with column lists so immutable columns (ids, business_id, owner) cannot change.
-- ---------------------------------------------------------------------------

revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon;

grant select on all tables in schema public to authenticated;
grant select on public.business_branding to authenticated;

grant update (
  name, logo_path, address, phone, receipt_footer, primary_color, receipt_prefix,
  timezone, opening_cash, is_active
) on public.businesses to authenticated;
grant update (template_id, dashboard, import_mapping) on public.business_configs to authenticated;
grant insert (id, business_id, name, sort_order, is_active) on public.catalog_categories
  to authenticated;
grant update (name, sort_order, is_active) on public.catalog_categories to authenticated;
grant insert (id, business_id, category_id, name, price, sort_order, is_active)
  on public.catalog_items to authenticated;
grant update (category_id, name, price, sort_order, is_active) on public.catalog_items
  to authenticated;
grant insert (id, business_id, name, sort_order, is_active, kind, allow_drawer)
  on public.expense_categories to authenticated;
grant update (name, sort_order, is_active, kind, allow_drawer) on public.expense_categories
  to authenticated;
grant insert (business_id, type, amount, source, reason) on public.reserve_movements
  to authenticated;

grant execute on function
  public.is_owner(uuid),
  public.is_cashier(uuid),
  public.is_member(uuid),
  public.business_timezone(uuid),
  public.business_day(uuid, timestamptz),
  public.business_day_start(uuid, timestamptz)
to authenticated;
