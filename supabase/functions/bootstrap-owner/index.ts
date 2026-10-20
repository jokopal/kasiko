// bootstrap-owner: creates an owner account (decision #22 — public sign-up stays off) and,
// optionally, its first business from a template. Only callable with the service role key,
// i.e. by whoever administers the Supabase project; the app never calls it.
import { createClient } from 'npm:@supabase/supabase-js@2.117.3'
import { CORS_HEADERS, json, parseOwnerBootstrap, safeEqual } from '../_shared/accounts.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })
  if (req.method !== 'POST') return json({ error: 'Metode tidak didukung' }, 405)

  const bearer = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (SERVICE_ROLE_KEY === '' || !safeEqual(bearer, SERVICE_ROLE_KEY)) {
    return json({ error: 'Tidak diizinkan' }, 401)
  }

  const parsed = parseOwnerBootstrap(await req.json().catch(() => null))
  if (!parsed.ok) return json({ error: parsed.error }, 400)
  const { email, password, business, template } = parsed.value

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    // Only the service role can write app_metadata; create_business checks it.
    app_metadata: { kasiko_role: 'owner' },
  })
  if (createError) return json({ error: `Akun owner gagal dibuat: ${createError.message}` }, 409)

  if (!business) return json({ ownerId: created.user.id }, 201)

  // The first business goes through the same RPC the app uses, as the new owner, so every
  // rule (and the template logic) is the database's own.
  const asOwner = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { error: signInError } = await asOwner.auth.signInWithPassword({ email, password })
  if (signInError) {
    return json({ ownerId: created.user.id, error: 'Owner dibuat, tetapi login gagal' }, 500)
  }
  const { data: businessId, error: businessError } = await asOwner.rpc('create_business', {
    p_business: business,
    p_template: template ?? {},
  })
  await asOwner.auth.signOut()
  if (businessError) {
    return json(
      { ownerId: created.user.id, error: `Owner dibuat, usaha gagal: ${businessError.message}` },
      422,
    )
  }
  return json({ ownerId: created.user.id, businessId }, 201)
})
