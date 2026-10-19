import { beforeEach, describe, expect, it } from 'vitest'
import {
  addReserveMovement,
  applyTemplate,
  clearHistory,
  createBusiness,
  importHistory,
  resetDashboardLayout,
  saveBusiness,
  saveDashboardLayout,
  saveExpenseCategory,
  voidTransactionAsOwner,
} from './actions'
import { getPreviewState, resetPreviewState } from './store'

const BIZ = 'saimara'

beforeEach(() => {
  localStorage.clear()
  resetPreviewState()
})

describe('reserve & settings validation', () => {
  it('requires a reason and enough balance to withdraw', () => {
    const base = { businessId: BIZ, type: 'withdraw' as const, source: null }
    expect(addReserveMovement({ ...base, amount: 1_000, reason: '' }).ok).toBe(false)
    expect(addReserveMovement({ ...base, amount: 10 ** 12, reason: 'Terlalu besar' }).ok).toBe(
      false,
    )
    expect(addReserveMovement({ ...base, amount: 1_000, reason: 'Servis' }).ok).toBe(true)
  })

  it('rejects invalid brand settings', () => {
    const business = getPreviewState().businesses[0]!
    expect(saveBusiness({ ...business, primaryColor: 'teal' }).ok).toBe(false)
    expect(saveBusiness({ ...business, receiptPrefix: 'x' }).ok).toBe(false)
    expect(saveBusiness({ ...business, name: 'Saimara Baru' }).ok).toBe(true)
  })
})

describe('owner voids', () => {
  it('voids any day without deleting', () => {
    const state = getPreviewState()
    const old = state.transactions.find(
      (t) => t.status === 'paid' && Date.now() - Date.parse(t.occurredAt) > 3 * 86_400_000,
    )!
    expect(voidTransactionAsOwner(old.id, 'Salah input').ok).toBe(true)
    expect(getPreviewState().transactions.find((t) => t.id === old.id)?.status).toBe('void')
    expect(getPreviewState().transactions).toHaveLength(state.transactions.length)
  })
})

describe('expense categories (decisions #24, #26)', () => {
  it('saves kind and drawer permission, and refuses duplicate names', () => {
    const created = saveExpenseCategory({
      businessId: BIZ,
      name: 'Sewa Lahan',
      kind: 'operating',
      allowDrawer: false,
    })
    expect(created.ok && created.value).toMatchObject({ kind: 'operating', allowDrawer: false })
    const duplicate = saveExpenseCategory({
      businessId: BIZ,
      name: '  sewa   lahan ',
      kind: 'operating',
      allowDrawer: false,
    })
    expect(duplicate.ok).toBe(false)
    if (!created.ok) return
    const edited = saveExpenseCategory({ ...created.value, kind: 'drawing', allowDrawer: true })
    expect(edited.ok && edited.value).toMatchObject({ kind: 'drawing', allowDrawer: true })
  })
})

describe('templates & businesses (decision #25)', () => {
  it('creates a business with its own catalog, categories and config', () => {
    const result = createBusiness({
      name: 'Cuci Cabang Dua',
      receiptPrefix: 'CC2',
      primaryColor: '#0f766e',
      timezone: 'Asia/Makassar',
      templateId: 'cuci-mobil',
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const state = getPreviewState()
    const id = result.value.id
    expect(state.businessConfigs.find((c) => c.businessId === id)?.templateId).toBe('cuci-mobil')
    expect(state.expenseCategories.filter((c) => c.businessId === id).length).toBeGreaterThan(10)
    expect(state.catalogItems.some((i) => i.businessId === id)).toBe(true)
  })

  it('rejects a duplicate business name or an unknown timezone', () => {
    const base = { receiptPrefix: 'XX', primaryColor: '#000000', templateId: 'umum' }
    expect(createBusiness({ ...base, name: 'saimara', timezone: 'Asia/Jakarta' }).ok).toBe(false)
    expect(createBusiness({ ...base, name: 'Baru', timezone: 'Europe/Paris' }).ok).toBe(false)
  })

  it('applies a template without duplicating what exists', () => {
    const general = applyTemplate(BIZ, 'umum')
    expect(general.ok && general.value.expenseCategories).toBeGreaterThan(0)
    const again = applyTemplate(BIZ, 'umum')
    expect(again.ok && again.value).toEqual({
      catalogCategories: 0,
      catalogItems: 0,
      expenseCategories: 0,
    })
  })

  it('saves and resets the dashboard layout per business', () => {
    const config = () => getPreviewState().businessConfigs.find((c) => c.businessId === BIZ)!
    const hidden = config().dashboard.kpis.map((k) => ({ ...k, visible: false }))
    saveDashboardLayout(BIZ, { ...config().dashboard, kpis: hidden })
    expect(config().dashboard.kpis.every((k) => !k.visible)).toBe(true)
    resetDashboardLayout(BIZ)
    expect(config().dashboard.kpis.some((k) => k.visible)).toBe(true)
  })
})

describe('imported history (decision #27)', () => {
  const day = (dayKey: string, income: number, categoryId: string) => ({
    businessId: BIZ,
    dayKey,
    income,
    expenses: [{ categoryId, amount: 100_000 }],
    importedAt: new Date().toISOString(),
  })

  it('replaces re-imported days instead of doubling them, and remembers the mapping', () => {
    const category = getPreviewState().expenseCategories.find((c) => c.businessId === BIZ)!
    expect(
      importHistory(BIZ, [day('2025-01-01', 1_000, category.id)], { gaji: category.id }).ok,
    ).toBe(true)
    expect(importHistory(BIZ, [day('2025-01-01', 2_000, category.id)], {}).ok).toBe(true)
    const days = getPreviewState().historicalDays.filter((d) => d.businessId === BIZ)
    expect(days).toEqual([expect.objectContaining({ dayKey: '2025-01-01', income: 2_000 })])
    const config = getPreviewState().businessConfigs.find((c) => c.businessId === BIZ)!
    expect(config.importMapping.gaji).toBe(category.id)
  })

  it('rejects categories of another business', () => {
    const foreign = getPreviewState().expenseCategories.find((c) => c.businessId !== BIZ)!
    expect(importHistory(BIZ, [day('2025-01-02', 1_000, foreign.id)], {}).ok).toBe(false)
  })

  it('clears imported history without touching live data', () => {
    const before = getPreviewState().transactions.length
    const category = getPreviewState().expenseCategories.find((c) => c.businessId === BIZ)!
    importHistory(BIZ, [day('2025-01-03', 1_000, category.id)], {})
    clearHistory(BIZ)
    expect(getPreviewState().historicalDays.filter((d) => d.businessId === BIZ)).toHaveLength(0)
    expect(getPreviewState().transactions).toHaveLength(before)
  })
})
