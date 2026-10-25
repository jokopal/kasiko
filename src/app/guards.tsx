import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { homePathFor, useAuthState } from '@/features/auth/session'
import type { Role } from '@/lib/types'
import { LoadingScreen } from './pages/loading-screen'

/** Sends signed-out users to login and users of the other role to their own area. */
export function RequireRole({ role, children }: { role: Role; children: ReactNode }) {
  const auth = useAuthState()
  const location = useLocation()
  if (auth.status === 'loading') return <LoadingScreen />
  if (auth.status === 'signedOut') {
    return <Navigate to="/masuk" replace state={{ from: location.pathname }} />
  }
  if (auth.session.role !== role) return <Navigate to={homePathFor(auth.session.role)} replace />
  return children
}

export function RootRedirect() {
  const auth = useAuthState()
  if (auth.status === 'loading') return <LoadingScreen />
  return (
    <Navigate to={auth.status === 'signedIn' ? homePathFor(auth.session.role) : '/masuk'} replace />
  )
}
