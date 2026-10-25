import { expect, test, type Page } from '@playwright/test'

// Smoke tests that never write to the database: they run safely against the live project
// on every device class. Flows that record data need an isolated test business (see
// README "E2E terhadap database").

async function snap(page: Page, name: string) {
  const device = test.info().project.name
  await page.screenshot({ path: `test-results/screens/${device}-${name}.png`, fullPage: false })
}

test('the login page offers cashier and owner sign-in', async ({ page }) => {
  await page.goto('/masuk')
  await expect(page.getByRole('heading', { name: 'Kasiko' })).toBeVisible()
  await expect(page.getByLabel('Nama pengguna')).toBeVisible()
  await page.getByRole('tab', { name: 'Owner' }).click()
  await expect(page.getByLabel('Email')).toBeVisible()
  await expect(page.getByLabel('Kata sandi')).toBeVisible()
  await snap(page, 'login')
})

test('protected areas send signed-out visitors to login', async ({ page }) => {
  for (const path of ['/kasir', '/kasir/pesanan', '/owner', '/owner/rekap', '/owner/diskon']) {
    await page.goto(path)
    await expect(page).toHaveURL(/\/masuk$/)
  }
})

test('a wrong password is refused with a clear message', async ({ page }) => {
  await page.goto('/masuk')
  await page.getByLabel('Nama pengguna').fill('bukan.kasir')
  await page.getByLabel('Kata sandi').fill('salahsalah1')
  await page.getByRole('button', { name: 'Masuk' }).click()
  await expect(page.getByText(/salah/i)).toBeVisible()
})

test('unknown paths show the 404 page', async ({ page }) => {
  await page.goto('/tidak-ada')
  await expect(page.getByText(/halaman tidak ditemukan/i)).toBeVisible()
})

test('a signed-out visitor never downloads the owner bundle', async ({ page }) => {
  const ownerChunks: string[] = []
  page.on('request', (request) => {
    if (/(owner-layout|dashboard-page)-[\w-]+\.js/.test(request.url()))
      ownerChunks.push(request.url())
  })
  await page.goto('/owner')
  await expect(page).toHaveURL(/\/masuk$/)
  expect(ownerChunks).toEqual([])
})
