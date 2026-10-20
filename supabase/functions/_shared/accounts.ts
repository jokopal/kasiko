// Account rules shared by the account Edge Functions and the app. Pure and import-free, so
// Deno runs it as-is and Vitest tests it (accounts.test.ts).

/**
 * Cashier accounts sign in with a username; Supabase Auth needs an email, so the username
 * maps onto a reserved domain (RFC 2606 `.invalid`) that can never receive mail.
 */
export const CASHIER_EMAIL_DOMAIN = 'kasir.kasiko.invalid'

const USERNAME = /^[a-z0-9][a-z0-9._-]{1,28}[a-z0-9]$/

export function normalizeUsername(input: string): string {
  return input.trim().toLowerCase()
}

/** Problem with a cashier username, or `null` when it is valid. */
export function usernameProblem(username: string): string | null {
  if (!USERNAME.test(username)) {
    return 'Nama pengguna 3–30 huruf kecil/angka (boleh titik, minus, garis bawah)'
  }
  return null
}

export function cashierEmail(username: string): string {
  return `${normalizeUsername(username)}@${CASHIER_EMAIL_DOMAIN}`
}

export function usernameFromEmail(email: string | undefined): string | null {
  const suffix = `@${CASHIER_EMAIL_DOMAIN}`
  return email?.endsWith(suffix) ? email.slice(0, -suffix.length) : null
}

/** Decision #22: at least 8 characters with letters and digits. */
export function passwordProblem(password: string): string | null {
  if (password.length < 8) return 'Kata sandi minimal 8 karakter'
  if (!/[a-z]/i.test(password) || !/\d/.test(password)) {
    return 'Kata sandi harus berisi huruf dan angka'
  }
  return null
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type CashierRequest =
  | { action: 'get'; businessId: string }
  | { action: 'create'; businessId: string; username: string; password: string }
  | { action: 'reset_password'; businessId: string; password: string }
  | { action: 'set_active'; businessId: string; active: boolean }

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string }

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** Validates the body of a manage-cashier call. */
export function parseCashierRequest(body: unknown): Parsed<CashierRequest> {
  if (!isRecord(body)) return { ok: false, error: 'Format permintaan tidak valid' }
  const { action, businessId } = body
  if (typeof businessId !== 'string' || !UUID.test(businessId)) {
    return { ok: false, error: 'Usaha tidak valid' }
  }
  switch (action) {
    case 'get':
      return { ok: true, value: { action, businessId } }
    case 'create': {
      const username = normalizeUsername(String(body.username ?? ''))
      const password = String(body.password ?? '')
      const problem = usernameProblem(username) ?? passwordProblem(password)
      if (problem) return { ok: false, error: problem }
      return { ok: true, value: { action, businessId, username, password } }
    }
    case 'reset_password': {
      const password = String(body.password ?? '')
      const problem = passwordProblem(password)
      if (problem) return { ok: false, error: problem }
      return { ok: true, value: { action, businessId, password } }
    }
    case 'set_active':
      if (typeof body.active !== 'boolean') return { ok: false, error: 'Status tidak valid' }
      return { ok: true, value: { action, businessId, active: body.active } }
    default:
      return { ok: false, error: 'Aksi tidak dikenal' }
  }
}

export interface OwnerBootstrap {
  email: string
  password: string
  /** Optional first business, created through create_business as the new owner. */
  business?: Record<string, unknown>
  template?: Record<string, unknown>
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Validates the body of a bootstrap-owner call. */
export function parseOwnerBootstrap(body: unknown): Parsed<OwnerBootstrap> {
  if (!isRecord(body)) return { ok: false, error: 'Format permintaan tidak valid' }
  const email = String(body.email ?? '')
    .trim()
    .toLowerCase()
  const password = String(body.password ?? '')
  if (!EMAIL.test(email)) return { ok: false, error: 'Email owner tidak valid' }
  if (email.endsWith(`@${CASHIER_EMAIL_DOMAIN}`)) {
    return { ok: false, error: 'Email owner tidak boleh memakai domain kasir' }
  }
  const problem = passwordProblem(password)
  if (problem) return { ok: false, error: problem }
  if (body.business !== undefined && !isRecord(body.business)) {
    return { ok: false, error: 'Data usaha tidak valid' }
  }
  if (body.template !== undefined && !isRecord(body.template)) {
    return { ok: false, error: 'Template tidak valid' }
  }
  return {
    ok: true,
    value: {
      email,
      password,
      business: body.business as Record<string, unknown> | undefined,
      template: body.template as Record<string, unknown> | undefined,
    },
  }
}

export const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}

/** Length-independent comparison for shared secrets. */
export function safeEqual(a: string, b: string): boolean {
  let diff = a.length ^ b.length
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0)
  }
  return diff === 0
}
