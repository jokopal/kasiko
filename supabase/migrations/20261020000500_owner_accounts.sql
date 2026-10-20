-- Owner accounts & privileged account operations (decision #22).
-- Public sign-up must stay off, but the database does not rely on it: only accounts the
-- server marked as owners (app_metadata.kasiko_role, writable by the service role only)
-- or existing owners may create a business. A self-registered account gets nothing.

create function public.is_owner_account()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((auth.jwt() -> 'app_metadata' ->> 'kasiko_role') = 'owner', false)
    or exists (
      select 1 from public.business_members m
      where m.user_id = (select auth.uid()) and m.role = 'owner' and m.is_active
    );
$$;

create or replace function public.create_business(
  p_business jsonb,
  p_template jsonb default '{}'::jsonb
)
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
  if not public.is_owner_account() then
    raise exception 'Hanya akun owner yang bisa membuat usaha' using errcode = '42501';
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

/**
 * Ends every session of an account (refresh tokens go with them), used by the
 * manage-cashier Edge Function after a password reset or deactivation. Access tokens
 * still in flight expire within the JWT lifetime; membership.is_active cuts data access
 * immediately.
 */
create function public.admin_revoke_sessions(p_user_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  delete from auth.sessions s where s.user_id = p_user_id;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke execute on function
  public.is_owner_account(),
  public.create_business(jsonb, jsonb),
  public.admin_revoke_sessions(uuid)
from public, anon, authenticated;
grant execute on function public.is_owner_account(), public.create_business(jsonb, jsonb)
  to authenticated;

-- Edge Functions act as service_role: keep every function callable for it, including
-- internal helpers such as apply_template_rows and admin_revoke_sessions.
grant execute on all functions in schema public to service_role;
