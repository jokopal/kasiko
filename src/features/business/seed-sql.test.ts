import { describe, expect, it } from 'vitest'
import { buildSeedSql, SEED_ACCOUNTS } from './seed-sql'
import { findTemplate } from './templates'

describe('supabase/seed.sql', () => {
  it('is generated from the current template', async () => {
    // Fails when a template changes without regenerating the seed (run with -u).
    await expect(buildSeedSql()).toMatchFileSnapshot('../../../supabase/seed.sql')
  })

  it('creates one owner and one cashier with passwords that meet the auth rule', () => {
    expect(SEED_ACCOUNTS.map((a) => a.role)).toEqual(['owner', 'cashier'])
    for (const account of SEED_ACCOUNTS) {
      expect(account.password).toMatch(/^(?=.*[a-z])(?=.*\d).{8,}$/i)
      expect(account.email).toMatch(/\.test$/) // never a real mailbox
    }
  })

  it('carries every expense category of the template with its kind and drawer flag', () => {
    const sql = buildSeedSql()
    for (const category of findTemplate('cuci-mobil').expenseCategories) {
      expect(sql).toContain(
        `"name":${JSON.stringify(category.name)},"kind":"${category.kind}","allowDrawer":${category.allowDrawer}`,
      )
    }
  })
})
