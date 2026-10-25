import type { User } from '@supabase/supabase-js'
import { useSyncExternalStore } from 'react'
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase'
import { fail, ok, type Result } from '@/lib/result'
import type { Role } from '@/lib/types'
import { cashierEmail, usernameFromEmail } from '../../../supabase/functions/_shared/accounts'

// Supabase Auth session + the account's role and businesses (from business_members).
// The membership is cached on the device so a cashier can reopen the app offline
// (decision #7); it is refreshed whenever the server is reachable.

export interface Session {
  userId: string
  role: Role
  /** Cashier: the one business of the account. Owner: the selected business. */
  businessId: string
  /** Every active business of the account (one for a cashier). */
  businessIds: string[]
  displayName: string
}

type AuthState =
  | { status: 'loading' }
  | { status: 'signedOut'; message?: string }
  | { status: 'signedIn'; session: Session }

const MEMBERSHIP_KEY = 'kasiko.membership.v1'
const SELECTED_KEY = 'kasiko.owner.business.v1'

interface CachedMembership {
  userId: string
  role: Role
  businessIds: string[]
}

let state: AuthState = { status: 'loading' }
const listeners = new Set<() => void>()
let started = false

function setState(next: AuthState) {
  state = next
  for (const listener of listeners) listener()
}

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

function writeJson(key: string, value: unknown) {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Storage blocked: the session works for this tab only.
  }
}

/** Server memberships, or the cached copy when offline; null when the account has none. */
async function loadMembership(user: User): Promise<CachedMembership | null> {
  const { data, error } = await getSupabase()
    .from('business_members')
    .select('business_id, role, is_active')
    .eq('user_id', user.id)
  if (error) {
    const cached = readJson<CachedMembership>(MEMBERSHIP_KEY)
    return cached?.userId === user.id ? cached : null
  }
  const rows = (data as { business_id: string; role: Role; is_active: boolean }[]).filter(
    (row) => row.is_active,
  )
  const role: Role | null = rows.some((r) => r.role === 'owner')
    ? 'owner'
    : rows.some((r) => r.role === 'cashier')
      ? 'cashier'
      : null
  if (!role) {
    writeJson(MEMBERSHIP_KEY, null)
    return null
  }
  const membership: CachedMembership = {
    userId: user.id,
    role,
    businessIds: rows.filter((r) => r.role === role).map((r) => r.business_id),
  }
  writeJson(MEMBERSHIP_KEY, membership)
  return membership
}

function sessionFor(user: User, membership: CachedMembership): Session {
  const selected = readJson<string>(SELECTED_KEY)
  const businessId =
    membership.role === 'owner' && selected && membership.businessIds.includes(selected)
      ? selected
      : (membership.businessIds[0] ?? '')
  return {
    userId: user.id,
    role: membership.role,
    businessId,
    businessIds: membership.businessIds,
    displayName: usernameFromEmail(user.email) ?? user.email ?? 'Pengguna',
  }
}

async function resolve(user: User | null | undefined) {
  if (!user) {
    setState({ status: 'signedOut' })
    return
  }
  const membership = await loadMembership(user)
  if (!membership) {
    await getSupabase().auth.signOut()
    setState({
      status: 'signedOut',
      message: 'Akun ini belum terhubung ke usaha mana pun atau sudah dinonaktifkan.',
    })
    return
  }
  setState({ status: 'signedIn', session: sessionFor(user, membership) })
}

/** Starts listening to Supabase Auth once. Safe to call repeatedly. */
export function startAuth() {
  if (started) return
  started = true
  if (!isSupabaseConfigured) {
    setState({ status: 'signedOut' })
    return
  }
  const auth = getSupabase().auth
  void auth.getSession().then(({ data }) => resolve(data.session?.user))
  auth.onAuthStateChange((event, session) => {
    // Supabase calls must not run inside this callback (they would wait on its lock).
    setTimeout(() => {
      if (event === 'SIGNED_OUT') {
        writeJson(MEMBERSHIP_KEY, null)
        setState({ status: 'signedOut' })
      } else if (event === 'SIGNED_IN' || event === 'USER_UPDATED') {
        const current = state.status === 'signedIn' ? state.session.userId : null
        if (session?.user && session.user.id !== current) void resolve(session.user)
      }
    }, 0)
  })
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

const getState = () => state

export function useAuthState(): AuthState {
  return useSyncExternalStore(subscribe, getState, getState)
}

export function useSession(): Session | null {
  const current = useAuthState()
  return current.status === 'signedIn' ? current.session : null
}

export function getSession(): Session | null {
  return state.status === 'signedIn' ? state.session : null
}

function signInError(message: string): string {
  if (/invalid login credentials/i.test(message)) return 'Nama pengguna/email atau kata sandi salah'
  if (/banned/i.test(message)) return 'Akun ini dinonaktifkan owner'
  if (/fetch|network/i.test(message)) return 'Tidak ada koneksi internet'
  return message
}

async function signIn(email: string, password: string): Promise<Result> {
  if (!isSupabaseConfigured) return fail('Aplikasi belum tersambung ke database')
  const { data, error } = await getSupabase().auth.signInWithPassword({ email, password })
  if (error) return fail(signInError(error.message))
  await resolve(data.user)
  return state.status === 'signedIn'
    ? ok(undefined)
    : fail(state.status === 'signedOut' && state.message ? state.message : 'Gagal masuk')
}

export function signInOwner(email: string, password: string): Promise<Result> {
  return signIn(email.trim().toLowerCase(), password)
}

export function signInCashier(username: string, password: string): Promise<Result> {
  return signIn(cashierEmail(username), password)
}

export async function signOut(): Promise<void> {
  writeJson(MEMBERSHIP_KEY, null)
  setState({ status: 'signedOut' })
  if (isSupabaseConfigured) await getSupabase().auth.signOut()
}

/** Owner: switch the selected business (decision #1). */
export function selectBusiness(businessId: string) {
  if (state.status !== 'signedIn' || state.session.role !== 'owner') return
  writeJson(SELECTED_KEY, businessId)
  const session = state.session
  setState({
    status: 'signedIn',
    session: {
      ...session,
      businessId,
      businessIds: session.businessIds.includes(businessId)
        ? session.businessIds
        : [...session.businessIds, businessId],
    },
  })
}

export function homePathFor(role: Role): string {
  return role === 'owner' ? '/owner' : '/kasir'
}
