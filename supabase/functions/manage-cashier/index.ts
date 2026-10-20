// manage-cashier: the owner creates, resets and (de)activates the single cashier account of
// a business (decision #4, AGENTS.md section 5). Called with the owner's JWT; account
// changes use the service role, which only exists here, never in the app.
import { createClient } from 'npm:@supabase/supabase-js@2.117.3'
import {
  cashierEmail,
  CORS_HEADERS,
  json,
  parseCashierRequest,
  usernameFromEmail,
} from '../_shared/accounts.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
// Banned accounts cannot sign in or refresh; "none" lifts the ban.
const BAN_FOREVER = '876000h'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })
  if (req.method !== 'POST') return json({ error: 'Metode tidak didukung' }, 405)

  const parsed = parseCashierRequest(await req.json().catch(() => null))
  if (!parsed.ok) return json({ error: parsed.error }, 400)
  const request = parsed.value

  // The caller must be an active owner of this business — checked by the database itself.
  const asCaller = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: isOwner, error: ownerError } = await asCaller.rpc('is_owner', {
    p_business_id: request.businessId,
  })
  if (ownerError || isOwner !== true) {
    return json({ error: 'Hanya owner usaha ini yang bisa mengatur akun kasir' }, 403)
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: member, error: memberError } = await admin
    .from('business_members')
    .select('user_id, is_active')
    .eq('business_id', request.businessId)
    .eq('role', 'cashier')
    .maybeSingle()
  if (memberError) return json({ error: 'Gagal membaca akun kasir' }, 500)

  const revokeSessions = async (userId: string) => {
    const { error } = await admin.rpc('admin_revoke_sessions', { p_user_id: userId })
    if (error) throw error
  }

  try {
    switch (request.action) {
      case 'get': {
        if (!member) return json({ account: null })
        const { data, error } = await admin.auth.admin.getUserById(member.user_id)
        if (error) throw error
        return json({
          account: { username: usernameFromEmail(data.user.email), isActive: member.is_active },
        })
      }

      case 'create': {
        if (member) return json({ error: 'Usaha ini sudah punya akun kasir' }, 409)
        const { data, error } = await admin.auth.admin.createUser({
          email: cashierEmail(request.username),
          password: request.password,
          email_confirm: true,
          app_metadata: { kasiko_role: 'cashier' },
        })
        if (error) return json({ error: 'Nama pengguna sudah dipakai' }, 409)
        const { error: insertError } = await admin.from('business_members').insert({
          business_id: request.businessId,
          user_id: data.user.id,
          role: 'cashier',
        })
        if (insertError) {
          // Never leave an auth account without its membership.
          await admin.auth.admin.deleteUser(data.user.id)
          throw insertError
        }
        return json({ account: { username: request.username, isActive: true } }, 201)
      }

      case 'reset_password': {
        if (!member) return json({ error: 'Akun kasir belum dibuat' }, 404)
        const { error } = await admin.auth.admin.updateUserById(member.user_id, {
          password: request.password,
        })
        if (error) throw error
        // Every cashier device signs in again with the new password (decision #22).
        await revokeSessions(member.user_id)
        return json({ ok: true })
      }

      case 'set_active': {
        if (!member) return json({ error: 'Akun kasir belum dibuat' }, 404)
        // Membership first: data access stops at once, even for tokens still in flight.
        const { error: memberUpdateError } = await admin
          .from('business_members')
          .update({ is_active: request.active })
          .eq('business_id', request.businessId)
          .eq('user_id', member.user_id)
        if (memberUpdateError) throw memberUpdateError
        const { error } = await admin.auth.admin.updateUserById(member.user_id, {
          ban_duration: request.active ? 'none' : BAN_FOREVER,
        })
        if (error) throw error
        if (!request.active) await revokeSessions(member.user_id)
        return json({ ok: true, isActive: request.active })
      }
    }
  } catch (error) {
    console.error('manage-cashier', request.action, error)
    return json({ error: 'Gagal mengubah akun kasir. Coba lagi.' }, 500)
  }
})
