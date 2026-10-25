import { defineConfig } from '@playwright/test'
import base from './playwright.config.ts'

// E2E flows that write data (sales, orders, discounts, offline sync) run against the
// STAGING project only (open question #20). The app is built with `--mode staging`, so it
// reads VITE_* from .env.staging — never the production keys.
export default defineConfig({
  ...base,
  testDir: './e2e-live',
  globalSetup: './e2e-live/global-setup.ts',
  // One business per run is shared by the three device projects; keep the load modest.
  workers: 3,
  use: { ...base.use, baseURL: 'http://localhost:4392' },
  webServer: {
    command:
      'npx vite build --mode staging && npx vite preview --mode staging --port 4392 --strictPort',
    url: 'http://localhost:4392',
    reuseExistingServer: false,
    timeout: 240_000,
  },
})
