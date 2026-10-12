import { useSyncExternalStore } from 'react'
import type { Role } from '@/lib/types'

// Preview session. Real Supabase Auth replaces `signInPreview`; the rest of the app
// only depends on `{ role, businessId }`, which is what the auth layer will provide.

export interface Session {
  role: Role
  /** Cashier: the one business the account belongs to. Owner: the selected business. */
  businessId: string
  displayName: string
}

const STORAGE_KEY = 'kasiko.session.v1'
const listeners = new Set<() => void>()
let cached: { raw: string | null; session: Session | null } | null = null

function readRaw(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

function parse(raw: string | null): Session | null {
  if (!raw) return null
  try {
    return JSON.parse(raw) as Session
  } catch {
    return null
  }
}

/** Returns a stable object while storage is unchanged (required by useSyncExternalStore). */
function read(): Session | null {
  const raw = readRaw()
  if (cached?.raw !== raw) cached = { raw, session: parse(raw) }
  return cached.session
}

function write(session: Session | null) {
  try {
    if (session) localStorage.setItem(STORAGE_KEY, JSON.stringify(session))
    else localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Ignore: session simply will not survive a reload.
  }
  cached = { raw: session ? JSON.stringify(session) : null, session }
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) listener()
  }
  window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(listener)
    window.removeEventListener('storage', onStorage)
  }
}

export function useSession(): Session | null {
  return useSyncExternalStore(subscribe, read, () => null)
}

export function getSession(): Session | null {
  return read()
}

export const PREVIEW_BUSINESS_ID = 'saimara'

export function signInPreview(role: Role) {
  write({
    role,
    businessId: PREVIEW_BUSINESS_ID,
    displayName: role === 'owner' ? 'Owner' : 'Kasir',
  })
}

export function selectBusiness(businessId: string) {
  const session = read()
  if (session?.role === 'owner') write({ ...session, businessId })
}

export function signOut() {
  write(null)
}

export function homePathFor(role: Role): string {
  return role === 'owner' ? '/owner' : '/kasir'
}
