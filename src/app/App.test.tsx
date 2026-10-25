import { render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { beforeAll, describe, expect, it } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import { startAuth } from '@/features/auth/session'
import { routes } from './router'

// The test environment has no Supabase configuration: the app must still boot, show the
// login page with a clear notice, and route correctly.

function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  render(
    <TooltipProvider>
      <RouterProvider router={router} />
    </TooltipProvider>,
  )
  return router
}

beforeAll(() => startAuth())

describe('app shell without a database connection', () => {
  it('sends signed-out users to the login page', async () => {
    renderAt('/')
    expect(await screen.findByRole('heading', { name: 'Kasiko' })).toBeInTheDocument()
    expect(screen.getByText(/belum tersambung ke database/i)).toBeInTheDocument()
  })

  it('protects the owner and cashier areas', async () => {
    const router = renderAt('/owner')
    await screen.findByRole('heading', { name: 'Kasiko' })
    expect(router.state.location.pathname).toBe('/masuk')
  })

  it('shows a 404 page for unknown paths', async () => {
    renderAt('/tidak-ada')
    expect(await screen.findByText(/halaman tidak ditemukan/i)).toBeInTheDocument()
  })
})
