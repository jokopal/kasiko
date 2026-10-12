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
  // Multi-phase scenario; emulated phones under parallel load need more than 30s.
  test.slow()
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

test('receipt can be printed and sent to WhatsApp', async ({ page, context }) => {
  // Capture what would be printed instead of opening the OS print dialog.
  await page.addInitScript(() => {
    window.print = () => {
      const root = document.getElementById('print-root')
      document.body.dataset.printed = root?.innerText ?? ''
    }
  })
  await context.route('https://wa.me/**', (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: '<p>wa stub</p>' }),
  )

  await enterAs(page, 'Kasir')
  await page.getByRole('button', { name: /^Cuci Mobil Kecil, Rp 35\.000/ }).click()
  await page.getByRole('button', { name: 'Bayar', exact: true }).locator('visible=true').click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('button', { name: 'Rp 40.000' }).click()
  await dialog.getByRole('button', { name: 'Simpan', exact: true }).click()
  const receiptNo = (await dialog.locator('.font-mono').innerText()).trim()

  await dialog.getByRole('button', { name: 'Print' }).click()
  await expect(page.locator('body')).toHaveAttribute('data-printed', new RegExp(receiptNo))
  const printed = await page.locator('body').getAttribute('data-printed')
  expect(printed).toContain('Kembali')
  expect(printed).toContain('Rp 5.000')

  await dialog.getByRole('button', { name: 'WhatsApp' }).click()
  const wa = page.getByRole('dialog', { name: 'Kirim nota via WhatsApp' })
  await wa.getByLabel('Nomor WhatsApp pelanggan').fill('0812 3456 7890')
  await snap(page, 'kasir-whatsapp')
  const popupPromise = page.waitForEvent('popup')
  await wa.getByRole('button', { name: 'Buka WhatsApp' }).click()
  const popup = await popupPromise
  const url = new URL(popup.url())
  expect(url.pathname).toBe('/6281234567890')
  expect(url.searchParams.get('text')).toContain(receiptNo)
  await popup.close()

  await dialog.getByRole('button', { name: 'Transaksi Baru' }).click()
  await page.getByRole('link', { name: 'Riwayat' }).click()
  await page.getByRole('button', { name: 'Cetak ulang' }).first().click()
  await expect(page.getByRole('dialog', { name: 'Cetak ulang nota' })).toContainText(receiptNo)
  await snap(page, 'kasir-reprint')
})

test('cashier keeps selling offline and syncs when back online', async ({ page, context }) => {
  // Multi-phase scenario; emulated phones under parallel load need more than 30s.
  test.slow()
  await enterAs(page, 'Kasir')
  await expect(page.getByRole('button', { name: /^Cuci Motor, Rp 15\.000/ })).toBeVisible()
  // The service worker must have precached the app shell before going offline.
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true))

  await context.setOffline(true)
  await page.reload()
  await expect(page.getByRole('button', { name: /^Cuci Motor, Rp 15\.000/ })).toBeVisible()

  await page.getByRole('button', { name: /^Cuci Motor, Rp 15\.000/ }).click()
  await page.getByRole('button', { name: 'Bayar', exact: true }).locator('visible=true').click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('button', { name: 'Uang Pas' }).click()
  await dialog.getByRole('button', { name: 'Simpan', exact: true }).click()
  await expect(dialog.getByText('Transaksi tersimpan')).toBeVisible()
  const receiptNo = (await dialog.locator('.font-mono').innerText()).trim()
  await dialog.getByRole('button', { name: 'Transaksi Baru' }).click()

  await expect(page.getByTestId('outbox-count')).toHaveText('1')
  await snap(page, 'kasir-offline')
  await page.getByRole('link', { name: 'Riwayat' }).click()
  await expect(page.getByText('Belum tersinkron', { exact: true })).toBeVisible()

  // Logging out would strand the sale on this device, so it is refused.
  await page.getByRole('button', { name: 'Menu akun' }).click()
  await page.getByRole('menuitem', { name: 'Keluar' }).click()
  await expect(page.getByText(/belum tersinkron. Sambungkan internet/)).toBeVisible()
  await expect(page).toHaveURL(/\/kasir\/riwayat$/)

  await context.setOffline(false)
  await expect(page.getByTestId('outbox-count')).toHaveCount(0)
  await expect(page.getByText('Belum tersinkron', { exact: true })).toHaveCount(0)

  await page.evaluate(() => {
    localStorage.setItem(
      'kasiko.session.v1',
      JSON.stringify({ role: 'owner', businessId: 'saimara', displayName: 'Owner' }),
    )
  })
  await page.goto('/owner/transaksi?periode=today')
  await expect(page.getByText(receiptNo).locator('visible=true')).toBeVisible()
})

test('a cashier opening /owner is redirected without downloading owner code', async ({ page }) => {
  await enterAs(page, 'Kasir')
  await expect(page.getByRole('button', { name: /^Cuci Motor, Rp 15\.000/ })).toBeVisible()
  const ownerChunks: string[] = []
  page.on('request', (request) => {
    if (/(owner-layout|dashboard-page)-[\w-]+\.js/.test(request.url()))
      ownerChunks.push(request.url())
  })
  await page.goto('/owner')
  await expect(page).toHaveURL(/\/kasir$/)
  await expect(page.getByRole('button', { name: /^Cuci Motor, Rp 15\.000/ })).toBeVisible()
  expect(ownerChunks).toEqual([])
})
