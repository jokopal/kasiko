-- Receipt corrections (decision #44, revised again by the owner 2026-11-24).
--
-- The sale is always saved at its real (catalog) price, so income never changes. After
-- saving, the cashier may correct what the printed receipt shows (service names, quantity,
-- price per line, plate number) on the receipt preview, while the owner keeps
-- `cashier_can_edit_prices` on. The correction is stored next to the transaction, every
-- receipt print uses it, and audit_log records each one as action 'correction'.

alter table public.transactions
  add column receipt_correction jsonb,
  add column receipt_corrected_at timestamptz;

comment on column public.transactions.receipt_correction is
  'What the printed receipt shows after a correction: {"items":[{"name","qty","price"}],"plate_number"}. Never changes income.';

/**
 * Stores a receipt correction for one transaction. Cashier: same business day as the sale
 * (same rule as a cashier void) and only while the owner allows receipt edits. Owner:
 * any time. Idempotent on the device time; an older correction never replaces a newer one.
 */
create function public.correct_receipt(
  p_id uuid,
  p_correction jsonb,
  p_corrected_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.transactions;
  v_owner boolean;
  v_items jsonb := p_correction -> 'items';
  v_item jsonb;
  v_plate text := nullif(btrim(coalesce(p_correction ->> 'plate_number', '')), '');
  v_clean jsonb := '[]'::jsonb;
  v_name text;
  v_qty integer;
  v_price bigint;
begin
  if p_corrected_at is null then
    raise exception 'Waktu koreksi wajib diisi' using errcode = '22023';
  end if;
  select * into v_row from public.transactions t where t.id = p_id for update;
  if not found then
    raise exception 'Transaksi tidak ditemukan' using errcode = 'P0002';
  end if;
  v_owner := public.is_owner(v_row.business_id);
  if not v_owner and not public.is_cashier(v_row.business_id) then
    raise exception 'Transaksi tidak ditemukan' using errcode = '42501';
  end if;
  if v_row.status = 'void' then
    raise exception 'Transaksi sudah dibatalkan' using errcode = '23514';
  end if;
  if not v_owner then
    if not exists (
      select 1 from public.businesses b
      where b.id = v_row.business_id and b.cashier_can_edit_prices
    ) then
      raise exception 'Owner belum mengizinkan kasir mengedit nota' using errcode = '42501';
    end if;
    perform public.assert_plausible_device_time(p_corrected_at);
    if public.business_day(v_row.business_id, v_row.occurred_at)
       <> public.business_day(v_row.business_id, p_corrected_at) then
      raise exception 'Kasir hanya bisa mengedit nota hari ini' using errcode = '42501';
    end if;
  end if;

  -- Retry of the same correction, or an older one arriving late: nothing to do.
  if v_row.receipt_corrected_at is not null and v_row.receipt_corrected_at >= p_corrected_at then
    return;
  end if;

  if jsonb_typeof(v_items) is distinct from 'array'
    or jsonb_array_length(v_items) = 0 or jsonb_array_length(v_items) > 50 then
    raise exception 'Nota koreksi minimal satu baris' using errcode = '23514';
  end if;
  for v_item in select value from jsonb_array_elements(v_items) loop
    v_name := btrim(coalesce(v_item ->> 'name', ''));
    v_qty := (v_item ->> 'qty')::integer;
    v_price := (v_item ->> 'price')::bigint;
    if length(v_name) = 0 or length(v_name) > 60 then
      raise exception 'Nama baris nota tidak valid' using errcode = '23514';
    end if;
    if v_qty is null or v_qty < 1 or v_qty > 99 then
      raise exception 'Jumlah baris nota tidak valid' using errcode = '23514';
    end if;
    if v_price is null or v_price < 0 or v_price > 100000000 then
      raise exception 'Harga baris nota tidak valid' using errcode = '23514';
    end if;
    v_clean := v_clean || jsonb_build_array(
      jsonb_build_object('name', v_name, 'qty', v_qty, 'price', v_price)
    );
  end loop;
  if length(coalesce(v_plate, '')) > 15 then
    raise exception 'Plat nomor terlalu panjang' using errcode = '23514';
  end if;

  insert into public.audit_log (business_id, actor_id, action, entity, entity_id, old_data, new_data)
  values (
    v_row.business_id, auth.uid(), 'correction', 'transactions', v_row.id::text,
    jsonb_build_object(
      'receipt_no', v_row.receipt_no,
      'total', v_row.total,
      'plate_number', coalesce(v_row.receipt_correction ->> 'plate_number', v_row.plate_number),
      'items', coalesce(v_row.receipt_correction -> 'items', (
        select jsonb_agg(jsonb_build_object('name', i.name_snapshot, 'qty', i.qty, 'price', i.price_snapshot)
          order by i.position)
        from public.transaction_items i
        where i.business_id = v_row.business_id and i.transaction_id = v_row.id
      ))
    ),
    jsonb_build_object(
      'receipt_no', v_row.receipt_no,
      'total', v_row.total,
      'printed_total', (select coalesce(sum((e ->> 'qty')::bigint * (e ->> 'price')::bigint), 0) from jsonb_array_elements(v_clean) e),
      'plate_number', v_plate,
      'items', v_clean
    )
  );

  update public.transactions
  set receipt_correction = jsonb_build_object('items', v_clean, 'plate_number', v_plate),
      receipt_corrected_at = p_corrected_at
  where id = v_row.id;
end;
$$;

revoke execute on function public.correct_receipt(uuid, jsonb, timestamptz) from public, anon;
grant execute on function public.correct_receipt(uuid, jsonb, timestamptz) to authenticated;
