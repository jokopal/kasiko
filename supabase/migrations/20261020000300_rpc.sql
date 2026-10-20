-- Write RPCs (decisions #14–#18, #25, #27). Every function re-validates what the device
-- already checked: the client is never trusted. Messages are Indonesian because they are
-- shown to the user as-is; JSON keys are snake_case like the table columns.

-- ---------------------------------------------------------------------------
-- Shared checks
-- ---------------------------------------------------------------------------

-- Decisions #17/#18: device clocks are trusted within these bounds only — same values as
-- CLIENT_CLOCK_TOLERANCE in the app.
create function public.assert_plausible_device_time(p_at timestamptz)
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if p_at is null then
    raise exception 'Waktu perangkat wajib dikirim' using errcode = '22023';
  end if;
  if p_at > now() + interval '5 minutes' or p_at < now() - interval '72 hours' then
    raise exception 'Waktu perangkat tidak wajar; pembatalan ditolak' using errcode = '22023';
  end if;
end;
$$;

-- Decision #11: a cashier voids same-day records only, judged by the device time of the
-- void request (decision #18) in the business timezone.
create function public.assert_cashier_can_void(
  p_business_id uuid,
  p_occurred_at timestamptz,
  p_requested_at timestamptz
)
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  perform public.assert_plausible_device_time(p_requested_at);
  if public.business_day(p_business_id, p_occurred_at)
     <> public.business_day(p_business_id, p_requested_at) then
    raise exception 'Kasir hanya bisa membatalkan data hari ini' using errcode = '42501';
  end if;
end;
$$;

create function public.transaction_json(p_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select to_jsonb(t) || jsonb_build_object(
    'items',
    coalesce(
      (
        select jsonb_agg(to_jsonb(i) - 'business_id' - 'transaction_id' order by i.position)
        from public.transaction_items i
        where i.business_id = t.business_id and i.transaction_id = t.id
      ),
      '[]'::jsonb
    )
  )
  from public.transactions t
  where t.id = p_id;
$$;

-- ---------------------------------------------------------------------------
-- Devices (decision #16)
-- ---------------------------------------------------------------------------

/** Assigns the next never-used code (A…Z, then AA…ZZ) to a new device of the business. */
create function public.register_device(p_business_id uuid)
returns public.devices
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text;
  v_row public.devices;
begin
  if not public.is_member(p_business_id) then
    raise exception 'Usaha tidak ditemukan atau nonaktif' using errcode = '42501';
  end if;
  -- Serialize allocation per business so two devices never get the same code.
  perform 1 from public.businesses where id = p_business_id for update;
  with letters as (
    select chr(65 + i) as l from generate_series(0, 25) as i
  ), codes as (
    select l as code from letters
    union all
    select a.l || b.l from letters a cross join letters b
  )
  select c.code into v_code
  from codes c
  where not exists (
    select 1 from public.devices d
    where d.business_id = p_business_id and d.device_code = c.code
  )
  order by length(c.code), c.code
  limit 1;
  if v_code is null then
    raise exception 'Kode perangkat untuk usaha ini sudah habis' using errcode = '23514';
  end if;
  insert into public.devices (business_id, device_code, registered_by)
  values (p_business_id, v_code, auth.uid())
  returning * into v_row;
  return v_row;
end;
$$;

-- ---------------------------------------------------------------------------
-- Sales (decisions #14, #15)
-- ---------------------------------------------------------------------------

/**
 * create_transaction(jsonb): header + items in one database transaction. Idempotent on
 * the client-generated id: a retried sync gets the stored row back. Snapshot prices are
 * accepted (the offline catalog may be stale); every sum is recomputed.
 */
create function public.create_transaction(p jsonb)
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
  v_existing uuid;
  v_item jsonb;
  v_qty integer;
  v_price bigint;
  v_total bigint := 0;
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
    v_total := v_total + v_price * v_qty;
  end loop;

  if v_total <= 0 then
    raise exception 'Keranjang masih kosong' using errcode = '23514';
  end if;
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

  -- Same as normalizePlate(): trimmed, single-spaced, upper case, max 12, empty → null.
  v_plate := nullif(left(upper(regexp_replace(btrim(coalesce(p ->> 'plate_number', '')),
    '\s+', ' ', 'g')), 12), '');

  begin
    insert into public.transactions (
      id, business_id, receipt_no, occurred_at, plate_number, payment_method,
      total, cash_received, change_amount, created_by, device_id
    ) values (
      v_id, v_business, v_receipt, v_occurred, v_plate, v_method,
      v_total, v_cash, v_change, auth.uid(), v_device
    )
    on conflict (id) do nothing;
  exception when unique_violation then
    raise exception 'Nomor nota % sudah dipakai', v_receipt using errcode = '23505';
  end;
  if not found then
    -- A concurrent retry of the same sale won the race.
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

  return public.transaction_json(v_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- Expenses (decisions #6, #14, #26)
-- ---------------------------------------------------------------------------

/**
 * create_expense(jsonb). Cashier: source 'drawer', from a registered device, only in a
 * category the owner allows for the drawer. Owner: source 'owner', any active category.
 * Idempotent on the client-generated id.
 */
create function public.create_expense(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid := coalesce((p ->> 'id')::uuid, gen_random_uuid());
  v_business uuid := (p ->> 'business_id')::uuid;
  v_category uuid := (p ->> 'category_id')::uuid;
  v_source public.expense_source := (p ->> 'source')::public.expense_source;
  v_device uuid := (p ->> 'device_id')::uuid;
  v_amount bigint := (p ->> 'amount')::bigint;
  v_note text := btrim(coalesce(p ->> 'note', ''));
  v_occurred timestamptz := (p ->> 'occurred_at')::timestamptz;
  v_existing public.expenses;
  v_cat public.expense_categories;
  v_row public.expenses;
begin
  if v_business is null or v_source is null then
    raise exception 'Format pengeluaran tidak valid' using errcode = '22023';
  end if;

  select * into v_existing from public.expenses e where e.id = v_id;
  if found then
    if v_existing.business_id <> v_business or not public.is_member(v_business) then
      raise exception 'Pengeluaran tidak ditemukan' using errcode = '42501';
    end if;
    return to_jsonb(v_existing);
  end if;

  if v_source = 'drawer' then
    if not public.is_cashier(v_business) then
      raise exception 'Pengeluaran laci dicatat dari layar kasir' using errcode = '42501';
    end if;
    if v_occurred is null then
      raise exception 'Format pengeluaran tidak valid' using errcode = '22023';
    end if;
    if not exists (
      select 1 from public.devices d where d.id = v_device and d.business_id = v_business
    ) then
      raise exception 'Perangkat belum terdaftar untuk usaha ini' using errcode = '23503';
    end if;
  else
    if not public.is_owner(v_business) then
      raise exception 'Kasir hanya bisa mencatat pengeluaran laci' using errcode = '42501';
    end if;
    v_device := null;
    v_occurred := coalesce(v_occurred, now());
  end if;

  if v_amount is null or v_amount <= 0 then
    raise exception 'Nominal harus lebih dari 0' using errcode = '23514';
  end if;
  if length(v_note) > 200 then
    raise exception 'Catatan maksimal 200 huruf' using errcode = '23514';
  end if;

  select * into v_cat
  from public.expense_categories c
  where c.business_id = v_business and c.id = v_category and c.is_active;
  if not found then
    raise exception 'Kategori pengeluaran tidak valid' using errcode = '23503';
  end if;
  if v_source = 'drawer' and not v_cat.allow_drawer then
    raise exception 'Kategori ini tidak boleh dicatat dari laci kasir' using errcode = '42501';
  end if;

  insert into public.expenses (
    id, business_id, category_id, amount, note, source, occurred_at, created_by, device_id
  ) values (
    v_id, v_business, v_category, v_amount, v_note, v_source, v_occurred, auth.uid(), v_device
  )
  on conflict (id) do nothing
  returning * into v_row;
  if v_row.id is null then
    select * into v_row from public.expenses e where e.id = v_id;
  end if;
  return to_jsonb(v_row);
end;
$$;

-- ---------------------------------------------------------------------------
-- Voids (decisions #11, #18, #21): no deletes, ever
-- ---------------------------------------------------------------------------

create function public.void_transaction(
  p_id uuid,
  p_reason text,
  p_voided_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.transactions;
  v_old jsonb;
  v_owner boolean;
  v_reason text := btrim(coalesce(p_reason, ''));
  v_at timestamptz;
begin
  select * into v_row from public.transactions t where t.id = p_id for update;
  if not found then
    raise exception 'Transaksi tidak ditemukan' using errcode = 'P0002';
  end if;
  v_owner := public.is_owner(v_row.business_id);
  if not v_owner and not public.is_cashier(v_row.business_id) then
    raise exception 'Transaksi tidak ditemukan' using errcode = '42501';
  end if;
  v_at := case when v_owner then coalesce(p_voided_at, now()) else p_voided_at end;

  if v_row.status = 'void' then
    -- A retried offline void carries the same device timestamp: report success. Without a
    -- device timestamp (owner, online) a second void is a mistake, not a retry.
    if p_voided_at is not null and v_row.voided_at = p_voided_at then
      return public.transaction_json(v_row.id);
    end if;
    raise exception 'Data ini sudah dibatalkan' using errcode = '23514';
  end if;
  if length(v_reason) < 3 then
    raise exception 'Alasan pembatalan wajib diisi' using errcode = '23514';
  end if;
  if not v_owner then
    perform public.assert_cashier_can_void(v_row.business_id, v_row.occurred_at, v_at);
  end if;

  v_old := to_jsonb(v_row);
  update public.transactions
  set status = 'void', void_reason = v_reason, voided_at = v_at, voided_by = auth.uid()
  where id = v_row.id
  returning * into v_row;

  if v_owner then
    insert into public.audit_log (business_id, actor_id, action, entity, entity_id, old_data, new_data)
    values (v_row.business_id, auth.uid(), 'void', 'transactions', v_row.id::text, v_old, to_jsonb(v_row));
  end if;
  return public.transaction_json(v_row.id);
end;
$$;

create function public.void_expense(
  p_id uuid,
  p_reason text,
  p_voided_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.expenses;
  v_old jsonb;
  v_owner boolean;
  v_reason text := btrim(coalesce(p_reason, ''));
  v_at timestamptz;
begin
  select * into v_row from public.expenses e where e.id = p_id for update;
  if not found then
    raise exception 'Pengeluaran tidak ditemukan' using errcode = 'P0002';
  end if;
  v_owner := public.is_owner(v_row.business_id);
  if not v_owner then
    if not public.is_cashier(v_row.business_id) then
      raise exception 'Pengeluaran tidak ditemukan' using errcode = '42501';
    end if;
    if v_row.source <> 'drawer' then
      raise exception 'Kasir hanya bisa membatalkan pengeluaran laci' using errcode = '42501';
    end if;
  end if;
  v_at := case when v_owner then coalesce(p_voided_at, now()) else p_voided_at end;

  if v_row.status = 'void' then
    if p_voided_at is not null and v_row.voided_at = p_voided_at then
      return to_jsonb(v_row);
    end if;
    raise exception 'Data ini sudah dibatalkan' using errcode = '23514';
  end if;
  if length(v_reason) < 3 then
    raise exception 'Alasan pembatalan wajib diisi' using errcode = '23514';
  end if;
  if not v_owner then
    perform public.assert_cashier_can_void(v_row.business_id, v_row.occurred_at, v_at);
  end if;

  v_old := to_jsonb(v_row);
  update public.expenses
  set status = 'void', void_reason = v_reason, voided_at = v_at, voided_by = auth.uid()
  where id = v_row.id
  returning * into v_row;

  if v_owner then
    insert into public.audit_log (business_id, actor_id, action, entity, entity_id, old_data, new_data)
    values (v_row.business_id, auth.uid(), 'void', 'expenses', v_row.id::text, v_old, to_jsonb(v_row));
  end if;
  return to_jsonb(v_row);
end;
$$;

-- ---------------------------------------------------------------------------
-- Businesses & templates (decision #25)
-- ---------------------------------------------------------------------------

/**
 * Adds the template rows a business is missing, matched by normalized name. Never
 * updates or removes anything, so applying a template twice adds nothing. The template
 * JSON is the app's BusinessTemplate: { id, catalog: [{ category, items: [{ name, price }] }],
 * expenseCategories: [{ name, kind, allowDrawer }], dashboard }.
 */
create function public.apply_template_rows(p_business_id uuid, p_template jsonb)
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
    continue when exists (
      select 1 from public.expense_categories c
      where c.business_id = p_business_id
        and public.normalize_label(c.name) = public.normalize_label(v_category ->> 'name')
    );
    insert into public.expense_categories (business_id, name, kind, allow_drawer, sort_order)
    select p_business_id,
      btrim(v_category ->> 'name'),
      (v_category ->> 'kind')::public.expense_kind,
      coalesce((v_category ->> 'allowDrawer')::boolean, true),
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

/** Owner RPC: re-apply a template to an existing business. */
create function public.apply_template(p_business_id uuid, p_template jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if not public.is_owner(p_business_id) then
    raise exception 'Usaha tidak ditemukan' using errcode = '42501';
  end if;
  v_result := public.apply_template_rows(p_business_id, p_template);
  update public.business_configs
  set template_id = coalesce(p_template ->> 'id', template_id)
  where business_id = p_business_id;
  return v_result;
end;
$$;

/**
 * Creates a business owned by the caller, with its owner membership, configuration and
 * template rows, in one transaction. Cashier accounts can never create businesses.
 */
create function public.create_business(p_business jsonb, p_template jsonb default '{}'::jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'Butuh login' using errcode = '42501';
  end if;
  if exists (
    select 1 from public.business_members m where m.user_id = v_uid and m.role = 'cashier'
  ) then
    raise exception 'Akun kasir tidak bisa membuat usaha' using errcode = '42501';
  end if;

  begin
    insert into public.businesses (
      owner_id, name, address, phone, receipt_footer, primary_color, receipt_prefix, timezone,
      opening_cash
    ) values (
      v_uid,
      btrim(p_business ->> 'name'),
      coalesce(p_business ->> 'address', ''),
      coalesce(p_business ->> 'phone', ''),
      coalesce(p_business ->> 'receipt_footer', 'Terima kasih!'),
      coalesce(p_business ->> 'primary_color', '#0e7490'),
      p_business ->> 'receipt_prefix',
      coalesce(p_business ->> 'timezone', 'Asia/Jakarta'),
      coalesce((p_business ->> 'opening_cash')::bigint, 0)
    )
    returning id into v_id;
  exception when unique_violation then
    raise exception 'Nama usaha sudah dipakai' using errcode = '23505';
  end;

  insert into public.business_members (business_id, user_id, role)
  values (v_id, v_uid, 'owner');
  insert into public.business_configs (business_id, template_id, dashboard)
  values (
    v_id,
    coalesce(p_template ->> 'id', 'umum'),
    coalesce(p_template -> 'dashboard', '{}'::jsonb)
  );
  perform public.apply_template_rows(v_id, p_template);
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Imported history (decision #27)
-- ---------------------------------------------------------------------------

/**
 * Replaces the given days of imported history. p_days: [{ day_key, income, expenses:
 * [{ category_id, amount }] }]. Days that already hold live sales or expenses are refused,
 * so nothing is ever counted twice. p_mapping (label → category id or 'skip') is merged
 * into the remembered import mapping.
 */
create function public.import_history(
  p_business_id uuid,
  p_days jsonb,
  p_mapping jsonb default '{}'::jsonb
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tz text;
  v_day jsonb;
  v_line jsonb;
  v_key date;
  v_income bigint;
  v_from timestamptz;
  v_to timestamptz;
  v_count integer := 0;
  v_value text;
begin
  if not public.is_owner(p_business_id) then
    raise exception 'Usaha tidak ditemukan' using errcode = '42501';
  end if;
  if jsonb_typeof(p_days) is distinct from 'array' then
    raise exception 'Format data impor tidak valid' using errcode = '22023';
  end if;
  v_tz := public.business_timezone(p_business_id);

  for v_value in select value from jsonb_each_text(coalesce(p_mapping, '{}'::jsonb)) loop
    if v_value <> 'skip' and not exists (
      select 1 from public.expense_categories c
      where c.business_id = p_business_id and c.id::text = v_value
    ) then
      raise exception 'Pemetaan label tidak valid' using errcode = '23503';
    end if;
  end loop;

  for v_day in select value from jsonb_array_elements(p_days) loop
    v_key := (v_day ->> 'day_key')::date;
    v_income := coalesce((v_day ->> 'income')::bigint, 0);
    if v_key is null or v_income < 0 then
      raise exception 'Data impor tidak valid' using errcode = '23514';
    end if;
    v_from := v_key::timestamp at time zone v_tz;
    v_to := (v_key + 1)::timestamp at time zone v_tz;
    if exists (
      select 1 from public.transactions t
      where t.business_id = p_business_id and t.occurred_at >= v_from and t.occurred_at < v_to
    ) or exists (
      select 1 from public.expenses e
      where e.business_id = p_business_id and e.occurred_at >= v_from and e.occurred_at < v_to
    ) then
      raise exception 'Tanggal % sudah punya data kasir', v_key using errcode = '23505';
    end if;

    delete from public.historical_days h where h.business_id = p_business_id and h.day_key = v_key;
    insert into public.historical_days (business_id, day_key, income, imported_by)
    values (p_business_id, v_key, v_income, auth.uid());
    for v_line in select value from jsonb_array_elements(coalesce(v_day -> 'expenses', '[]')) loop
      insert into public.historical_expenses (business_id, day_key, category_id, amount)
      values (p_business_id, v_key, (v_line ->> 'category_id')::uuid, (v_line ->> 'amount')::bigint)
      on conflict (business_id, day_key, category_id)
      do update set amount = public.historical_expenses.amount + excluded.amount;
    end loop;
    v_count := v_count + 1;
  end loop;

  update public.business_configs
  set import_mapping = import_mapping || coalesce(p_mapping, '{}'::jsonb)
  where business_id = p_business_id;
  return v_count;
end;
$$;

/** Removes imported history only; live sales and expenses are never touched. */
create function public.clear_history(p_business_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if not public.is_owner(p_business_id) then
    raise exception 'Usaha tidak ditemukan' using errcode = '42501';
  end if;
  delete from public.historical_days h where h.business_id = p_business_id;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- Privileges: only the RPCs are callable; internal helpers stay private.
-- ---------------------------------------------------------------------------

revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function
  public.is_owner(uuid),
  public.is_cashier(uuid),
  public.is_member(uuid),
  public.business_timezone(uuid),
  public.business_day(uuid, timestamptz),
  public.business_day_start(uuid, timestamptz),
  public.normalize_label(text),
  public.register_device(uuid),
  public.create_transaction(jsonb),
  public.create_expense(jsonb),
  public.void_transaction(uuid, text, timestamptz),
  public.void_expense(uuid, text, timestamptz),
  public.apply_template(uuid, jsonb),
  public.create_business(jsonb, jsonb),
  public.import_history(uuid, jsonb, jsonb),
  public.clear_history(uuid)
to authenticated;
