-- "Lainnya" expenses (decision #36) and opening balances: the daily drawer float and the
-- reserve's opening balance, "uang dingin" (decision #37).

-- ---------------------------------------------------------------------------
-- Categories that require a note (decision #36)
-- ---------------------------------------------------------------------------

alter table public.expense_categories
  add column requires_note boolean not null default false;

grant insert (requires_note), update (requires_note) on public.expense_categories
  to authenticated;

-- Template businesses carry a catch-all "Lain-lain": it becomes "Lainnya" with a required
-- note, open to the drawer. Skipped where the business already has a "Lainnya".
update public.expense_categories c
set name = 'Lainnya', requires_note = true, allow_drawer = true
where public.normalize_label(c.name) = 'lain-lain'
  and not exists (
    select 1 from public.expense_categories o
    where o.business_id = c.business_id and public.normalize_label(o.name) = 'lainnya'
  );
update public.expense_categories c
set requires_note = true
where public.normalize_label(c.name) = 'lainnya';

-- Every path that writes an expense (cashier, owner, re-categorizing) goes through here.
-- Rows written before the rule existed keep their note as it was.
create function public.expenses_require_note()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.expense_categories c
    where c.business_id = new.business_id and c.id = new.category_id and c.requires_note
  ) and coalesce(length(btrim(new.note)), 0) < 3 then
    raise exception 'Keterangan wajib diisi (min. 3 huruf) untuk kategori ini'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger expenses_require_note
  before insert or update of category_id on public.expenses
  for each row execute function public.expenses_require_note();

/**
 * Owner RPC: move an active expense to another active category of the same business, so
 * "Lainnya" can be sorted into proper categories and months stay comparable. The amount,
 * source, note and time never change; the move is written to the audit log.
 */
create function public.recategorize_expense(p_id uuid, p_category_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.expenses;
  v_from uuid;
begin
  select * into v_row from public.expenses e where e.id = p_id for update;
  if not found or not public.is_owner(v_row.business_id) then
    raise exception 'Pengeluaran tidak ditemukan' using errcode = '42501';
  end if;
  if v_row.status <> 'active' then
    raise exception 'Pengeluaran yang dibatalkan tidak bisa dipindahkan' using errcode = '23514';
  end if;
  if v_row.category_id = p_category_id then
    return to_jsonb(v_row);
  end if;
  if not exists (
    select 1 from public.expense_categories c
    where c.business_id = v_row.business_id and c.id = p_category_id and c.is_active
  ) then
    raise exception 'Kategori pengeluaran tidak valid' using errcode = '23503';
  end if;

  v_from := v_row.category_id;
  update public.expenses
  set category_id = p_category_id
  where id = p_id
  returning * into v_row;
  insert into public.audit_log (business_id, actor_id, action, entity, entity_id, old_data, new_data)
  values (
    v_row.business_id, auth.uid(), 'recategorize', 'expenses', v_row.id::text,
    jsonb_build_object('category_id', v_from),
    jsonb_build_object('category_id', p_category_id)
  );
  return to_jsonb(v_row);
end;
$$;

-- ---------------------------------------------------------------------------
-- Opening balances (decision #37)
-- ---------------------------------------------------------------------------

alter table public.businesses
  add column drawer_float bigint not null default 0 check (drawer_float >= 0),
  add column opening_reserve bigint not null default 0 check (opening_reserve >= 0);

grant update (drawer_float, opening_reserve) on public.businesses to authenticated;

-- The cashier counts the float every morning, so the branding view shows it. Opening cash
-- and the reserve stay owner-only (decision #19).
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
  b.drawer_float
from public.businesses b
where public.is_member(b.id);

/** Uang laci seharusnya hari ini = drawer float + Σ cash sales − Σ drawer expenses. */
create or replace function public.drawer_expected(p_business_id uuid)
returns bigint
language plpgsql
stable
set search_path = ''
as $$
declare
  v_start timestamptz;
  v_float bigint;
  v_cash bigint;
  v_drawer bigint;
begin
  if not public.is_member(p_business_id) then
    raise exception 'Usaha tidak ditemukan' using errcode = '42501';
  end if;
  v_start := public.business_day_start(p_business_id);
  -- Through the branding view: the cashier cannot read `businesses` itself.
  select b.drawer_float into v_float from public.business_branding b where b.id = p_business_id;
  select coalesce(sum(t.total), 0) into v_cash
    from public.transactions t
    where t.business_id = p_business_id and t.status = 'paid' and t.payment_method = 'cash'
      and t.occurred_at >= v_start and t.occurred_at < v_start + interval '1 day';
  select coalesce(sum(e.amount), 0) into v_drawer
    from public.expenses e
    where e.business_id = p_business_id and e.status = 'active' and e.source = 'drawer'
      and e.occurred_at >= v_start and e.occurred_at < v_start + interval '1 day';
  return v_float + v_cash - v_drawer;
end;
$$;

/** Saldo cadangan = opening reserve ("uang dingin") + Σ deposit − Σ withdraw. */
create or replace function public.reserve_balance(
  p_business_id uuid,
  p_until timestamptz default null
)
returns bigint
language plpgsql
stable
set search_path = ''
as $$
declare
  v_opening bigint;
  v_balance bigint;
begin
  if not public.is_owner(p_business_id) then
    raise exception 'Dana cadangan hanya untuk owner' using errcode = '42501';
  end if;
  select b.opening_reserve into v_opening from public.businesses b where b.id = p_business_id;
  select coalesce(sum(case when r.type = 'deposit' then r.amount else -r.amount end), 0)
    into v_balance
    from public.reserve_movements r
    where r.business_id = p_business_id
      and (p_until is null or r.occurred_at < p_until);
  return v_opening + v_balance;
end;
$$;

-- Withdrawals may spend the opening reserve too, never more than the balance.
create or replace function public.reserve_movements_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_opening bigint;
  v_balance bigint;
begin
  new.created_by := auth.uid();
  if new.type = 'withdraw' then
    select b.opening_reserve into v_opening
      from public.businesses b where b.id = new.business_id for update;
    select coalesce(sum(case when r.type = 'deposit' then r.amount else -r.amount end), 0)
      into v_balance
      from public.reserve_movements r
      where r.business_id = new.business_id;
    if new.amount > v_opening + v_balance then
      raise exception 'Saldo cadangan tidak cukup' using errcode = '23514';
    end if;
    new.reason := btrim(new.reason);
  end if;
  return new;
end;
$$;

-- The opening reserve cannot drop below what has already been withdrawn from it.
create function public.businesses_check_opening_reserve()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_balance bigint;
begin
  select coalesce(sum(case when r.type = 'deposit' then r.amount else -r.amount end), 0)
    into v_balance
    from public.reserve_movements r
    where r.business_id = new.id;
  if new.opening_reserve + v_balance < 0 then
    raise exception 'Uang dingin tidak boleh lebih kecil dari yang sudah ditarik'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger businesses_check_opening_reserve
  before update of opening_reserve on public.businesses
  for each row execute function public.businesses_check_opening_reserve();

-- ---------------------------------------------------------------------------
-- Templates carry requiresNote; a template "Lainnya" is skipped when the business already
-- has a note-required category, so re-applying never adds a second catch-all.
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
      insert into public.catalog_categories (business_id, name, sort_order)
      select p_business_id, btrim(v_group ->> 'category'), coalesce(max(c.sort_order) + 1, 0)
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
-- Privileges
-- ---------------------------------------------------------------------------

revoke execute on function
  public.expenses_require_note(),
  public.recategorize_expense(uuid, uuid),
  public.businesses_check_opening_reserve()
from public, anon;
grant execute on function public.recategorize_expense(uuid, uuid) to authenticated;
