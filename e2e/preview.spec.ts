import { expect, test, type Page } from '@playwright/test'

// Screenshots land in test-results/screens/<device>-*.png for visual review.
async function snap(page: Page, name: string) {
  const device = test.info().project.name
  await page.screenshot({ path: `test-results/screens/${device}-${name}.png`, fullPage: false })
}

async function enterAs(page: Page, role: 'Kasir' | 'Owner') {
  await page.goto('/')
  await page.evaluate(() => localStorage.clear())
  await page.goto('/masuk')
  await snap(page, 'login')
  await page.getByRole('button', { name: `Masuk sebagai ${role}` }).click()
}

test('cashier completes a cash sale in four taps', async ({ page }) => {
  await enterAs(page, 'Kasir')
  await expect(page).toHaveURL(/\/kasir$/)
  await snap(page, 'kasir-empty')

  await page.getByRole('button', { name: /^Cuci Mobil Sedang, Rp 45\.000/ }).click()
  await page.getByRole('button', { name: /^Semir Ban, Rp 10\.000/ }).click()
  await snap(page, 'kasir-cart')

  await page.getByRole('button', { name: 'Bayar', exact: true }).locator('visible=true').click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('button', { name: 'Rp 60.000' }).click()
  await expect(dialog.getByText('Rp 5.000')).toBeVisible()
  await snap(page, 'kasir-payment')

  await dialog.getByRole('button', { name: 'Simpan', exact: true }).click()
  await expect(dialog.getByText('Transaksi tersimpan')).toBeVisible()
  await snap(page, 'kasir-done')
  await dialog.getByRole('button', { name: 'Transaksi Baru' }).click()

  await page.getByRole('link', { name: 'Riwayat' }).click()
  await expect(page.getByText('Cuci Mobil Sedang, Semir Ban').first()).toBeVisible()
  await snap(page, 'kasir-history')

  await page.getByRole('link', { name: 'Ringkasan' }).click()
  await expect(page.getByText('Uang laci seharusnya')).toBeVisible()
  await snap(page, 'kasir-summary')
})

test('owner sees the dashboard and every page loads', async ({ page }) => {
  await enterAs(page, 'Owner')
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
  await expect(page.getByText('Tren harian')).toBeVisible()
  await snap(page, 'owner-dashboard')

  const pages = [
    ['/owner/transaksi', 'Transaksi'],
    ['/owner/pengeluaran', 'Pengeluaran'],
    ['/owner/cadangan', 'Dana Cadangan'],
    ['/owner/katalog', 'Katalog'],
    ['/owner/pengaturan', 'Pengaturan Usaha'],
    ['/owner/akun-kasir', 'Akun Kasir'],
  ] as const
  for (const [path, heading] of pages) {
    await page.goto(path)
    await expect(page.getByRole('heading', { name: heading, level: 1 })).toBeVisible()
    await snap(page, `owner-${path.split('/').pop()}`)
  }
})

test('owner sidebar navigation works on every device', async ({ page }) => {
  await enterAs(page, 'Owner')
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
  await page.getByRole('button', { name: 'Toggle Sidebar' }).first().click()
  await snap(page, 'owner-sidebar')
  await page.getByRole('link', { name: 'Katalog' }).click()
  await expect(page.getByRole('heading', { name: 'Katalog', level: 1 })).toBeVisible()
})

test('a sale made at the cashier appears for the owner', async ({ page }) => {
  await enterAs(page, 'Kasir')
  await page.getByRole('button', { name: /^Poles Body, Rp 350\.000/ }).click()
  await page.getByRole('button', { name: 'Bayar', exact: true }).locator('visible=true').click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('radio', { name: 'QRIS' }).click()
  await dialog.getByRole('button', { name: 'Sudah dibayar — Simpan' }).click()
  await expect(dialog.getByText('Transaksi tersimpan')).toBeVisible()
  const receiptNo = (await dialog.locator('.font-mono').innerText()).trim()

  await page.evaluate(() => {
    localStorage.setItem(
      'kasiko.session.v1',
      JSON.stringify({ role: 'owner', businessId: 'saimara', displayName: 'Owner' }),
    )
  })
  await page.goto('/owner/transaksi?periode=today')
  await expect(page.getByText(receiptNo).locator('visible=true')).toBeVisible()
})
