import { render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import type * as SessionModule from '@/features/auth/session'
import type { Role } from '@/lib/types'
import { RequireRole, RootRedirect } from './guards'

type State =
  { status: 'loading' } | { status: 'signedOut' } | { status: 'signedIn'; session: { role: Role } }

let state: State = { status: 'loading' }
vi.mock('@/features/auth/session', async (importOriginal) => ({
  ...(await importOriginal<typeof SessionModule>()),
  useAuthState: () => state,
}))

function renderAt(path: string) {
  const router = createMemoryRouter(
    [
      { path: '/', element: <RootRedirect /> },
      { path: '/masuk', element: <p>halaman masuk</p> },
      {
        path: '/owner',
        element: (
          <RequireRole role="owner">
            <p>area owner</p>
          </RequireRole>
        ),
      },
      {
        path: '/kasir',
        element: (
          <RequireRole role="cashier">
            <p>area kasir</p>
          </RequireRole>
        ),
      },
    ],
    { initialEntries: [path] },
  )
  render(<RouterProvider router={router} />)
  return router
}

describe('role guards', () => {
  it('waits while the session is being restored (no flash of the login page)', () => {
    state = { status: 'loading' }
    const router = renderAt('/kasir')
    expect(router.state.location.pathname).toBe('/kasir')
    expect(screen.queryByText('area kasir')).not.toBeInTheDocument()
  })

  it('sends signed-out users to login', async () => {
    state = { status: 'signedOut' }
    renderAt('/owner')
    expect(await screen.findByText('halaman masuk')).toBeInTheDocument()
  })

  it('keeps a cashier out of the owner area', async () => {
    state = { status: 'signedIn', session: { role: 'cashier' } }
    renderAt('/owner')
    expect(await screen.findByText('area kasir')).toBeInTheDocument()
  })

  it('lets each role into its own area and routes the root there', async () => {
    state = { status: 'signedIn', session: { role: 'owner' } }
    renderAt('/')
    expect(await screen.findByText('area owner')).toBeInTheDocument()
  })
})
