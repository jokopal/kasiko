-- Kasiko core schema (milestone 1).
-- Money is integer rupiah (bigint), time is timestamptz, every business row carries
-- business_id. Cross-table references inside a business use composite keys
-- (business_id, id) so a row can never point at another business (decision #19).

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------

create type public.member_role as enum ('owner', 'cashier');
create type public.payment_method as enum ('cash', 'qris', 'transfer');
create type public.transaction_status as enum ('paid', 'void');
create type public.expense_source as enum ('drawer', 'owner');
create type public.expense_status as enum ('active', 'void');
create type public.expense_kind as enum ('operating', 'non_operating', 'drawing');
create type public.reserve_type as enum ('deposit', 'withdraw');
create type public.reserve_source as enum ('cash', 'capital');

-- Same rule as normalizeLabel() in the app: names compare case- and space-insensitively.
create function public.normalize_label(p_text text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select lower(regexp_replace(btrim(coalesce(p_text, '')), '\s+', ' ', 'g'));
$$;

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Businesses & membership (two roles: owner, cashier)
-- ---------------------------------------------------------------------------

create table public.businesses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete restrict,
  name text not null check (length(btrim(name)) between 1 and 80),
  logo_path text,
  address text not null default '',
  phone text not null default '',
  receipt_footer text not null default '',
  primary_color text not null default '#0e7490' check (primary_color ~ '^#[0-9a-fA-F]{6}$'),
  receipt_prefix text not null check (receipt_prefix ~ '^[A-Z0-9]{2,6}$'),
  timezone text not null default 'Asia/Jakarta'
    check (timezone in ('Asia/Jakarta', 'Asia/Makassar', 'Asia/Jayapura')),
  opening_cash bigint not null default 0 check (opening_cash >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index businesses_owner_idx on public.businesses (owner_id);
create unique index businesses_owner_name_key
  on public.businesses (owner_id, public.normalize_label(name));

create table public.business_members (
  business_id uuid not null references public.businesses (id),
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.member_role not null,
  -- Deactivating a member cuts access at once, even with a still-valid JWT (decision #22).
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (business_id, user_id)
);
create index business_members_user_idx on public.business_members (user_id);
-- Decision #4: exactly one cashier account per business, and it belongs to one business.
create unique index business_members_one_cashier_per_business
  on public.business_members (business_id) where role = 'cashier';
create unique index business_members_cashier_one_business
  on public.business_members (user_id) where role = 'cashier';

-- An account is either an owner or a cashier, never both.
create function public.business_members_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.business_members m
    where m.user_id = new.user_id and m.role <> new.role
  ) then
    raise exception 'Akun ini sudah dipakai dengan peran lain' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger business_members_guard
  before insert or update of role, user_id on public.business_members
  for each row execute function public.business_members_guard();

-- Owner-only configuration per business (decision #25).
create table public.business_configs (
  business_id uuid primary key references public.businesses (id),
  template_id text not null default 'umum',
  dashboard jsonb not null default '{}'::jsonb check (jsonb_typeof(dashboard) = 'object'),
  import_mapping jsonb not null default '{}'::jsonb
    check (jsonb_typeof(import_mapping) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Catalog & expense categories
-- ---------------------------------------------------------------------------

create table public.catalog_categories (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id),
  name text not null check (length(btrim(name)) between 1 and 60),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, id)
);
create unique index catalog_categories_name_key
  on public.catalog_categories (business_id, public.normalize_label(name));

create table public.catalog_items (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id),
  category_id uuid not null,
  name text not null check (length(btrim(name)) between 1 and 80),
  price bigint not null check (price >= 0),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, id),
  foreign key (business_id, category_id) references public.catalog_categories (business_id, id)
);
create unique index catalog_items_name_key
  on public.catalog_items (business_id, public.normalize_label(name));
create index catalog_items_category_idx on public.catalog_items (business_id, category_id);

create table public.expense_categories (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id),
  name text not null check (length(btrim(name)) between 1 and 60),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  kind public.expense_kind not null default 'operating',   -- decision #24
  allow_drawer boolean not null default true,              -- decision #26
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, id)
);
create unique index expense_categories_name_key
  on public.expense_categories (business_id, public.normalize_label(name));

-- ---------------------------------------------------------------------------
-- Devices (decision #16): server-assigned code, unique per business, never reused.
-- Rows are never deleted, so a used code stays taken forever.
-- ---------------------------------------------------------------------------

create table public.devices (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id),
  device_code text not null check (device_code ~ '^[A-Z]{1,2}$'),
  registered_by uuid references auth.users (id) on delete set null,
  registered_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, device_code),
  unique (business_id, id)
);

-- ---------------------------------------------------------------------------
-- Sales
-- ---------------------------------------------------------------------------

create table public.transactions (
  id uuid primary key,  -- generated on the device: the idempotency key for offline sync
  business_id uuid not null references public.businesses (id),
  receipt_no text not null check (receipt_no ~ '^[A-Z0-9]{2,6}-[0-9]{6}-[A-Z]{1,2}[0-9]{4}$'),
  occurred_at timestamptz not null,   -- device time
  received_at timestamptz not null default now(),   -- server time (decision #17)
  plate_number text check (plate_number is null or length(plate_number) between 1 and 12),
  payment_method public.payment_method not null,
  total bigint not null check (total > 0),
  cash_received bigint,
  change_amount bigint,
  status public.transaction_status not null default 'paid',
  void_reason text,
  voided_at timestamptz,
  voided_by uuid references auth.users (id) on delete set null,
  created_by uuid references auth.users (id) on delete set null,
  device_id uuid not null,
  -- Decision #17: a device clock more than 5 min ahead, or a record arriving more than
  -- 72 h late, is flagged for the owner to review (same bounds as the client).
  needs_review boolean generated always as (
    received_at - occurred_at < interval '-5 minutes'
    or received_at - occurred_at > interval '72 hours'
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, receipt_no),
  unique (business_id, id),
  foreign key (business_id, device_id) references public.devices (business_id, id),
  constraint transactions_payment_check check (
    (payment_method = 'cash'
      and cash_received is not null
      and cash_received >= total
      and change_amount = cash_received - total)
    or (payment_method <> 'cash' and cash_received is null and change_amount is null)
  ),
  constraint transactions_void_check check (
    (status = 'paid' and void_reason is null and voided_at is null)
    or (status = 'void' and coalesce(length(btrim(void_reason)), 0) >= 3 and voided_at is not null)
  )
);
create index transactions_business_time_idx on public.transactions (business_id, occurred_at desc);

-- Items are immutable snapshots: catalog price changes never touch past sales.
create table public.transaction_items (
  id uuid primary key,
  business_id uuid not null,
  transaction_id uuid not null,
  position integer not null check (position > 0),   -- line order on the receipt
  catalog_item_id uuid,
  name_snapshot text not null check (length(btrim(name_snapshot)) between 1 and 80),
  price_snapshot bigint not null check (price_snapshot >= 0),
  qty integer not null check (qty between 1 and 999),
  line_total bigint not null,
  created_at timestamptz not null default now(),
  constraint transaction_items_line_total_check check (line_total = price_snapshot * qty),
  unique (transaction_id, position),
  foreign key (business_id, transaction_id) references public.transactions (business_id, id),
  foreign key (business_id, catalog_item_id) references public.catalog_items (business_id, id)
);
create index transaction_items_transaction_idx
  on public.transaction_items (business_id, transaction_id);

-- ---------------------------------------------------------------------------
-- Expenses
-- ---------------------------------------------------------------------------

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id),
  category_id uuid not null,
  amount bigint not null check (amount > 0),
  note text not null default '' check (length(note) <= 200),
  source public.expense_source not null,
  occurred_at timestamptz not null,
  received_at timestamptz not null default now(),
  status public.expense_status not null default 'active',
  void_reason text,
  voided_at timestamptz,
  voided_by uuid references auth.users (id) on delete set null,
  created_by uuid references auth.users (id) on delete set null,
  device_id uuid,
  needs_review boolean generated always as (
    received_at - occurred_at < interval '-5 minutes'
    or received_at - occurred_at > interval '72 hours'
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (business_id, category_id) references public.expense_categories (business_id, id),
  foreign key (business_id, device_id) references public.devices (business_id, id),
  -- Drawer money is taken at a cashier device.
  constraint expenses_drawer_device_check check (source = 'owner' or device_id is not null),
  constraint expenses_void_check check (
    (status = 'active' and void_reason is null and voided_at is null)
    or (status = 'void' and coalesce(length(btrim(void_reason)), 0) >= 3 and voided_at is not null)
  )
);
create index expenses_business_time_idx on public.expenses (business_id, occurred_at desc);

-- ---------------------------------------------------------------------------
-- Reserve fund (decision #8): an append-only ledger
-- ---------------------------------------------------------------------------

-- Note: CHECK passes on NULL, so every "reason required" test is wrapped in coalesce().
create table public.reserve_movements (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id),
  type public.reserve_type not null,
  amount bigint not null check (amount > 0),
  source public.reserve_source,
  reason text,
  occurred_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reserve_movements_shape_check check (
    (type = 'deposit' and source is not null)
    or (type = 'withdraw' and source is null and coalesce(length(btrim(reason)), 0) >= 3)
  )
);
create index reserve_movements_business_time_idx
  on public.reserve_movements (business_id, occurred_at);

-- ---------------------------------------------------------------------------
-- Imported history (decision #27): analysis only, never cash or drawer
-- ---------------------------------------------------------------------------

create table public.historical_days (
  business_id uuid not null references public.businesses (id),
  day_key date not null,
  income bigint not null default 0 check (income >= 0),
  imported_at timestamptz not null default now(),
  imported_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (business_id, day_key)
);

create table public.historical_expenses (
  business_id uuid not null,
  day_key date not null,
  category_id uuid not null,
  amount bigint not null check (amount > 0),
  primary key (business_id, day_key, category_id),
  foreign key (business_id, day_key)
    references public.historical_days (business_id, day_key) on delete cascade,
  foreign key (business_id, category_id) references public.expense_categories (business_id, id)
);

-- ---------------------------------------------------------------------------
-- Audit log (decision #21)
-- ---------------------------------------------------------------------------

create table public.audit_log (
  id bigint generated always as identity primary key,
  business_id uuid not null references public.businesses (id),
  actor_id uuid,
  action text not null,
  entity text not null,
  entity_id text not null,
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz not null default now()
);
create index audit_log_business_time_idx on public.audit_log (business_id, created_at desc);

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array[
    'businesses', 'business_members', 'business_configs', 'catalog_categories',
    'catalog_items', 'expense_categories', 'devices', 'transactions', 'expenses',
    'reserve_movements', 'historical_days'
  ] loop
    execute format(
      'create trigger set_updated_at before update on public.%I '
      'for each row execute function public.set_updated_at()', t);
  end loop;
end;
$$;
