import { writeFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

// Runs once before the live E2E suite, against the STAGING project only (never
// production). Every run gets a fresh business with its own cashier account, so device
// codes — which are never reused (decision #16) — can never run out.

const TEMPLATE = {
  id: 'e2e',
  catalog: [
    {
      category: 'Cuci',
      items: [
        { name: 'Cuci Mobil Sedang', price: 45_000 },
        { name: 'Cuci Motor', price: 15_000 },
        { name: 'Semir Ban', price: 10_000 },
      ],
    },
  ],
  expenseCategories: [
    { name: 'Makan & Konsumsi', kind: 'operating', allowDrawer: true },
    { name: 'Cicilan & Utang', kind: 'non_operating', allowDrawer: false },
  ],
  dashboard: {},
}

export interface LiveState {
  businessId: string
  businessName: string
  username: string
  password: string
  ownerEmail: string
  ownerPassword: string
}

export const STATE_FILE = 'e2e-live/.state.json'

function need(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`${name} belum diisi di .env.staging`)
  return value
}

export default async function globalSetup() {
  process.loadEnvFile('.env.staging')
  const url = need('VITE_SUPABASE_URL')
  if (url.includes(need('PRODUCTION_REF_GUARD'))) {
    throw new Error('E2E live menolak berjalan terhadap proyek produksi')
  }
  const ownerEmail = need('E2E_OWNER_EMAIL')
  const ownerPassword = need('E2E_OWNER_PASSWORD')
  const owner = createClient(url, need('VITE_SUPABASE_PUBLISHABLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const signIn = await owner.auth.signInWithPassword({ email: ownerEmail, password: ownerPassword })
  if (signIn.error) throw new Error(`Owner E2E gagal masuk: ${signIn.error.message}`)

  const stamp = Date.now().toString(36)
  const businessName = `E2E ${stamp}`
  const created: { data: unknown; error: { message: string } | null } = await owner.rpc(
    'create_business',
    {
      p_business: { name: businessName, receipt_prefix: 'E2E', timezone: 'Asia/Jakarta' },
      p_template: TEMPLATE,
    },
  )
  if (created.error) throw new Error(`Usaha E2E gagal dibuat: ${created.error.message}`)
  const businessId = created.data as string

  const discount = await owner
    .from('discounts')
    .insert({ business_id: businessId, name: 'Member 10%', type: 'percent', value: 10 })
  if (discount.error) throw new Error(`Diskon E2E gagal dibuat: ${discount.error.message}`)

  const username = `e2e-${stamp}`
  const password = `Kasir${stamp}9`
  const cashier: { error: { message: string } | null } = await owner.functions.invoke(
    'manage-cashier',
    { body: { action: 'create', businessId, username, password } },
  )
  if (cashier.error) throw new Error(`Kasir E2E gagal dibuat: ${cashier.error.message}`)

  const state: LiveState = {
    businessId,
    businessName,
    username,
    password,
    ownerEmail,
    ownerPassword,
  }
  writeFileSync(STATE_FILE, JSON.stringify(state))
}
