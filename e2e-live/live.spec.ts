import { readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
import { STATE_FILE, type LiveState } from './global-setup.ts'

// Real flows against the staging project: the cashier sells (with an owner discount),
// checks a car in and takes payment at the end, records a drawer expense, keeps working
// offline; the owner sees the business. Each test opens a fresh device.

// Read lazily: the file only exists once the global setup has run.
let cached: LiveState | undefined
const live = (): LiveState => (cached ??= JSON.parse(readFileSync(STATE_FILE, 'utf8')) as LiveState)

async function signInCashier(page: Page) {
  await page.goto('/masuk')
  await page.getByLabel('Nama pengguna').fill(live().username)
  await page.getByLabel('Kata sandi').fill(live().password)
  await page.getByRole('button', { name: 'Masuk' }).click()
  // First sign-in registers the device and downloads the catalog.
  await expect(page.getByRole('button', { name: /^Cuci Motor, Rp 15\.000/ })).toBeVisible({
    timeout: 30_000,
  })
}

const payButton = (page: Page) =>
  page.getByRole('button', { name: 'Bayar', exact: true }).locator('visible=true')

/** A plate unique per device project, so parallel projects never touch each other's order. */
const plate = () => `B 1 ${test.info().project.name.toUpperCase()}`

test('a cash sale with an owner discount reaches the server', async ({ page }) => {
  await signInCashier(page)
  await page.getByRole('button', { name: /^Cuci Mobil Sedang, Rp 45\.000/ }).click()
  await page.getByRole('button', { name: /^Semir Ban, Rp 10\.000/ }).click()
  await payButton(page).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('radio', { name: /Member 10%/ }).click()
  await expect(dialog.getByText('Rp 49.500').first()).toBeVisible()
  await dialog.getByRole('button', { name: 'Uang Pas' }).click()
  await dialog.getByRole('button', { name: 'Simpan', exact: true }).click()
  await expect(dialog.getByText('Transaksi tersimpan')).toBeVisible()
  await dialog.getByRole('button', { name: 'Transaksi Baru' }).click()

  await page.getByRole('link', { name: 'Riwayat' }).click()
  await expect(page.getByText('Cuci Mobil Sedang, Semir Ban').first()).toBeVisible()
  await expect(page.getByText('Belum tersinkron', { exact: true })).toHaveCount(0, {
    timeout: 30_000,
  })
})

test('a car checked in is paid at the end (decision #34)', async ({ page }) => {
  await signInCashier(page)
  await page.getByRole('button', { name: /^Cuci Motor, Rp 15\.000/ }).click()
  const cart = page.locator('aside, [role="dialog"]').filter({ hasText: 'Keranjang' })
  if (test.info().project.name === 'phone') await page.getByLabel('Buka keranjang').click()
  await cart.getByLabel('Plat nomor (opsional)').fill(plate())
  await cart.getByRole('button', { name: 'Simpan, bayar nanti' }).click()
  await expect(page.getByText(/Pesanan disimpan/)).toBeVisible()

  await page.getByRole('link', { name: 'Pesanan' }).click()
  const card = page.getByRole('listitem').filter({ hasText: plate() })
  await expect(card).toBeVisible()
  await card.getByRole('button', { name: 'Bayar' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('button', { name: 'Uang Pas' }).click()
  await dialog.getByRole('button', { name: 'Simpan', exact: true }).click()
  await expect(dialog.getByText('Transaksi tersimpan')).toBeVisible()
  await dialog.getByRole('button', { name: 'Transaksi Baru' }).click()

  await page.getByRole('link', { name: 'Pesanan' }).click()
  await expect(page.getByRole('listitem').filter({ hasText: plate() })).toHaveCount(0)
})

test('the cashier only sees drawer categories the owner allows', async ({ page }) => {
  await signInCashier(page)
  await page.getByRole('button', { name: 'Catat pengeluaran' }).click()
  const dialog = page.getByRole('dialog', { name: 'Pengeluaran laci' })
  await expect(dialog.getByRole('radio', { name: 'Makan & Konsumsi' })).toBeVisible()
  await expect(dialog.getByRole('radio', { name: 'Cicilan & Utang' })).toHaveCount(0)
  await dialog.getByLabel('Nominal').fill('25000')
  await dialog.getByRole('radio', { name: 'Makan & Konsumsi' }).click()
  await dialog.getByRole('button', { name: 'Simpan' }).click()
  await expect(page.getByText('Pengeluaran Rp 25.000 tersimpan')).toBeVisible()
})

test('selling offline syncs once the connection is back', async ({ page, context }) => {
  await signInCashier(page)
  await context.setOffline(true)
  await page.getByRole('button', { name: /^Cuci Motor, Rp 15\.000/ }).click()
  await payButton(page).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('button', { name: 'Uang Pas' }).click()
  await dialog.getByRole('button', { name: 'Simpan', exact: true }).click()
  await expect(dialog.getByText('Transaksi tersimpan')).toBeVisible()
  await dialog.getByRole('button', { name: 'Transaksi Baru' }).click()
  await page.getByRole('link', { name: 'Riwayat' }).click()
  await expect(page.getByText('Belum tersinkron', { exact: true }).first()).toBeVisible()

  await context.setOffline(false)
  await expect(page.getByText('Belum tersinkron', { exact: true })).toHaveCount(0, {
    timeout: 60_000,
  })
})

test('the owner opens the business and its discount preset', async ({ page }) => {
  // The staging owner collects one test business per run: preselect this run's business.
  await page.addInitScript((id) => {
    localStorage.setItem('kasiko.owner.business.v1', JSON.stringify(id))
  }, live().businessId)
  await page.goto('/masuk')
  await page.getByRole('tab', { name: 'Owner' }).click()
  await page.getByLabel('Email').fill(live().ownerEmail)
  await page.getByLabel('Kata sandi').fill(live().ownerPassword)
  await page.getByRole('button', { name: 'Masuk' }).click()
  await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible({
    timeout: 30_000,
  })
  await page.goto('/owner/diskon')
  await expect(page.getByText('Member 10%')).toBeVisible()
  await page.goto('/owner/transaksi')
  await expect(page.getByRole('heading', { name: 'Transaksi', level: 1 })).toBeVisible()
  await expect(page.getByText(/gagal dimuat/i)).toHaveCount(0)
})
