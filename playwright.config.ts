import { defineConfig, devices } from '@playwright/test'

// Every E2E spec runs on the three device classes the app must support.
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  // Bounded so emulated high-DPI phones do not starve each other of CPU.
  workers: process.env.CI ? 2 : 3,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://localhost:4391',
    locale: 'id-ID',
    timezoneId: 'Asia/Jakarta',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'phone', use: { ...devices['Pixel 7'] } },
    {
      name: 'tablet',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 820, height: 1180 },
        hasTouch: true,
        isMobile: true,
      },
    },
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
  ],
  webServer: {
    command: 'npm run build && npm run preview -- --port 4391 --strictPort',
    url: 'http://localhost:4391',
    // Never reuse: another app on the same port would silently be tested instead.
    reuseExistingServer: false,
    timeout: 180_000,
  },
})
