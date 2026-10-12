import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { homePathFor, useSession } from '@/features/auth/session'
import type { Role } from '@/lib/types'

/** Sends signed-out users to login and users of the other role to their own area. */
export function RequireRole({ role, children }: { role: Role; children: ReactNode }) {
  const session = useSession()
  const location = useLocation()
  if (!session) return <Navigate to="/masuk" replace state={{ from: location.pathname }} />
  if (session.role !== role) return <Navigate to={homePathFor(session.role)} replace />
  return children
}

export function RootRedirect() {
  const session = useSession()
  return <Navigate to={session ? homePathFor(session.role) : '/masuk'} replace />
}
