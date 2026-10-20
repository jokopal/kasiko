// Creates an owner account — and optionally the first business from an app template —
// through the bootstrap-owner Edge Function (decision #22). Run by the project admin only.
// Secrets come from the environment, never from arguments or the repo:
//
//   node --env-file=.env.bootstrap scripts/bootstrap-owner.ts \
//     --email owner@saimara.id --business Saimara --prefix SMR --template cuci-mobil
//
// .env.bootstrap (git-ignored): SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OWNER_PASSWORD
import { parseArgs } from 'node:util'
import { normalizeLayout } from '../src/features/business/config.ts'
import { findTemplate } from '../src/features/business/templates.ts'

const { values } = parseArgs({
  options: {
    email: { type: 'string' },
    business: { type: 'string' },
    prefix: { type: 'string' },
    template: { type: 'string', default: 'cuci-mobil' },
    timezone: { type: 'string', default: 'Asia/Jakarta' },
  },
})

const url = process.env.SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const password = process.env.OWNER_PASSWORD
if (!url || !serviceKey || !password || !values.email) {
  console.error(
    'Butuh SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OWNER_PASSWORD (env) dan --email <alamat>',
  )
  process.exit(1)
}

const template = findTemplate(values.template ?? 'cuci-mobil')
const body = {
  email: values.email,
  password,
  ...(values.business && {
    business: {
      name: values.business,
      receipt_prefix: values.prefix,
      timezone: values.timezone,
    },
    template: {
      id: template.id,
      catalog: template.catalog,
      expenseCategories: template.expenseCategories,
      dashboard: normalizeLayout(template.dashboard),
    },
  }),
}

const response = await fetch(`${url}/functions/v1/bootstrap-owner`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})
const result: unknown = await response.json().catch(() => ({}))
console.log(response.status, result)
process.exitCode = response.ok ? 0 : 1
