import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import { signInPreview, signOut } from '@/features/auth/session'
import { db } from '@/features/offline/db'
import { getPreviewState, resetPreviewState } from '@/features/preview/store'
import { routes } from './router'

function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  render(
    <TooltipProvider>
      <RouterProvider router={router} />
    </TooltipProvider>,
  )
  return router
}

beforeEach(async () => {
  localStorage.clear()
  signOut()
  resetPreviewState()
  await Promise.all(db.tables.map((table) => table.clear()))
})

describe('routing & roles', () => {
  it('sends signed-out users to the login page', async () => {
    renderAt('/')
    expect(await screen.findByRole('button', { name: /masuk sebagai kasir/i })).toBeInTheDocument()
  })

  it('keeps a cashier out of the owner area', async () => {
    signInPreview('cashier')
    const router = renderAt('/owner')
    await waitFor(() => expect(router.state.location.pathname).toBe('/kasir'))
  })

  it('shows a 404 page for unknown paths', async () => {
    renderAt('/tidak-ada')
    expect(await screen.findByText(/halaman tidak ditemukan/i)).toBeInTheDocument()
  })
})

describe('cashier flow', () => {
  it('completes a cash sale in four taps and records it', async () => {
    const user = userEvent.setup()
    renderAt('/masuk')
    await user.click(await screen.findByRole('button', { name: /masuk sebagai kasir/i }))

    const before = getPreviewState().transactions.length
    // 1. pick an item
    await user.click(
      await screen.findByRole(
        'button',
        { name: /^Cuci Mobil Kecil, Rp 35\.000/ },
        { timeout: 5_000 },
      ),
    )
    // 2. Bayar (the tablet cart and the phone bar both render in jsdom)
    const [pay] = screen.getAllByRole('button', { name: /^bayar$/i })
    await user.click(pay!)
    const dialog = await screen.findByRole('dialog')
    // 3. Uang Pas, 4. Simpan
    await user.click(within(dialog).getByRole('button', { name: /uang pas/i }))
    await user.click(within(dialog).getByRole('button', { name: /^simpan$/i }))

    expect(await screen.findByText(/transaksi tersimpan/i)).toBeInTheDocument()
    // Saved to the device outbox first, then delivered by the sync engine.
    await waitFor(() => expect(getPreviewState().transactions).toHaveLength(before + 1))
    expect(await db.outbox.count()).toBe(0)
    const saved = getPreviewState().transactions.at(-1)!
    expect(saved).toMatchObject({ total: 35_000, cashReceived: 35_000, changeAmount: 0 })
    // 'A' belongs to the seeded history device; this device was registered as 'B'.
    expect(saved.receiptNo).toMatch(/^SMR-\d{6}-B0001$/)
    expect(saved.receivedAt).not.toBeNull()
    expect(saved.items[0]).toMatchObject({
      nameSnapshot: 'Cuci Mobil Kecil',
      priceSnapshot: 35_000,
    })
  })

  it('blocks saving when the cash received is short', async () => {
    const user = userEvent.setup()
    signInPreview('cashier')
    renderAt('/kasir')
    await user.click(
      await screen.findByRole(
        'button',
        { name: /^Cuci Mobil Kecil, Rp 35\.000/ },
        { timeout: 5_000 },
      ),
    )
    await user.click(screen.getAllByRole('button', { name: /^bayar$/i })[0]!)
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: '2' }))
    await user.click(within(dialog).getByRole('button', { name: '000' }))
    expect(within(dialog).getByText('Kurang')).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: /^simpan$/i })).toBeDisabled()
  })
})

describe('owner area', () => {
  it('renders the dashboard for the owner', async () => {
    signInPreview('owner')
    renderAt('/owner')
    // Layout and page chunks load on first render (React.lazy); recharts is heavy in jsdom.
    expect(
      await screen.findByRole('heading', { name: 'Dashboard' }, { timeout: 5_000 }),
    ).toBeInTheDocument()
    expect(screen.getByText('Kas bebas')).toBeInTheDocument()
  })
})
