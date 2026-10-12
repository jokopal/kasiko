import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import { signInPreview, signOut } from '@/features/auth/session'
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

beforeEach(() => {
  localStorage.clear()
  signOut()
  resetPreviewState()
})

describe('routing & roles', () => {
  it('sends signed-out users to the login page', async () => {
    renderAt('/')
    expect(await screen.findByRole('button', { name: /masuk sebagai kasir/i })).toBeInTheDocument()
  })

  it('keeps a cashier out of the owner area', async () => {
    signInPreview('cashier')
    const router = renderAt('/owner')
    await screen.findAllByRole('button', { name: /bayar/i })
    expect(router.state.location.pathname).toBe('/kasir')
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
    await user.click(await screen.findByRole('button', { name: /^Cuci Mobil Kecil, Rp 35\.000/ }))
    // 2. Bayar (the tablet cart and the phone bar both render in jsdom)
    const [pay] = screen.getAllByRole('button', { name: /^bayar$/i })
    await user.click(pay!)
    const dialog = await screen.findByRole('dialog')
    // 3. Uang Pas, 4. Simpan
    await user.click(within(dialog).getByRole('button', { name: /uang pas/i }))
    await user.click(within(dialog).getByRole('button', { name: /^simpan$/i }))

    expect(await screen.findByText(/transaksi tersimpan/i)).toBeInTheDocument()
    const state = getPreviewState()
    expect(state.transactions).toHaveLength(before + 1)
    const saved = state.transactions.at(-1)!
    expect(saved).toMatchObject({ total: 35_000, cashReceived: 35_000, changeAmount: 0 })
    expect(saved.receiptNo).toMatch(/^SMR-\d{6}-A\d{4}$/)
    expect(saved.items[0]).toMatchObject({
      nameSnapshot: 'Cuci Mobil Kecil',
      priceSnapshot: 35_000,
    })
  })

  it('blocks saving when the cash received is short', async () => {
    const user = userEvent.setup()
    signInPreview('cashier')
    renderAt('/kasir')
    await user.click(await screen.findByRole('button', { name: /^Cuci Mobil Kecil, Rp 35\.000/ }))
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
    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument()
    expect(screen.getByText('Kas bebas')).toBeInTheDocument()
  })
})
