import { isHexColor } from '@/features/business/brand'
import { isValidReceiptPrefix } from '@/features/receipt/receipt-number'
import { reserveBalance } from '@/features/reports/finance'
import { newId } from '@/lib/id'
import { moveInOrder, nextSortOrder } from '@/lib/ordering'
import { fail, ok, type Result } from '@/lib/result'
import { SKIP_LABEL } from '@/features/history/cashflow-import'
import { templateRows } from '@/features/business/apply-template'
import { normalizeLayout, type DashboardLayout } from '@/features/business/config'
import { findTemplate, normalizeLabel } from '@/features/business/templates'
import { BUSINESS_TIMEZONES } from '@/lib/datetime'
import {
  EXPENSE_KINDS,
  type Business,
  type CatalogCategory,
  type CatalogItem,
  type Expense,
  type ExpenseCategory,
  type ExpenseKind,
  type HistoricalDay,
  type ReserveDepositSource,
  type ReserveMovementType,
} from '@/lib/types'
import { configFromTemplate, type PreviewState } from './seed'
import { rpcCreateExpense, rpcVoidExpense, rpcVoidTransaction } from './server'
import { getPreviewState, setPreviewState } from './store'

// Owner/master-data mutations for the preview. Each one validates with the same pure
// rules the server will enforce, so the UI already behaves like production.

function findBusiness(state: PreviewState, businessId: string): Business | undefined {
  return state.businesses.find((b) => b.id === businessId)
}

const isPositiveRupiah = (value: number) => Number.isSafeInteger(value) && value > 0

// Owner actions call the server directly: the owner area is online-only (decision #7).
// Cashier writes never come through here — they go through the outbox (features/offline).

export function voidTransactionAsOwner(id: string, reason: string, now = new Date()): Result {
  return rpcVoidTransaction({ id, reason, voidedAt: now.toISOString(), role: 'owner' }, now)
}

export function voidExpenseAsOwner(id: string, reason: string, now = new Date()): Result {
  return rpcVoidExpense({ id, reason, voidedAt: now.toISOString(), role: 'owner' }, now)
}

export interface OwnerExpenseInput {
  businessId: string
  categoryId: string
  amount: number
  note: string
}

export function createOwnerExpense(input: OwnerExpenseInput, now = new Date()): Result<Expense> {
  if (!input.categoryId) return fail('Pilih kategori pengeluaran')
  return rpcCreateExpense(
    {
      id: newId(),
      businessId: input.businessId,
      categoryId: input.categoryId,
      amount: input.amount,
      note: input.note,
      source: 'owner',
      occurredAt: now.toISOString(),
      status: 'active',
      voidReason: null,
      voidedAt: null,
      receivedAt: null,
    },
    'owner',
    now,
  )
}

export interface ReserveInput {
  businessId: string
  type: ReserveMovementType
  amount: number
  source: ReserveDepositSource | null
  reason: string
}

export function addReserveMovement(input: ReserveInput, now = new Date()): Result {
  const state = getPreviewState()
  if (!findBusiness(state, input.businessId)) return fail('Usaha tidak ditemukan')
  if (!isPositiveRupiah(input.amount)) return fail('Nominal harus lebih dari 0')
  const reason = input.reason.trim()
  if (input.type === 'deposit' && !input.source) return fail('Pilih sumber setoran')
  if (input.type === 'withdraw') {
    if (reason.length < 3) return fail('Alasan penarikan wajib diisi')
    const balance = reserveBalance(
      state.reserveMovements.filter((m) => m.businessId === input.businessId),
    )
    if (input.amount > balance) return fail('Saldo cadangan tidak cukup')
  }
  setPreviewState((s) => ({
    ...s,
    reserveMovements: [
      ...s.reserveMovements,
      {
        id: newId(),
        businessId: input.businessId,
        type: input.type,
        amount: input.amount,
        source: input.type === 'deposit' ? input.source : null,
        reason: reason === '' ? null : reason,
        occurredAt: now.toISOString(),
      },
    ],
  }))
  return ok(undefined)
}

export function saveBusiness(business: Business): Result {
  if (business.name.trim() === '') return fail('Nama usaha wajib diisi')
  if (!isHexColor(business.primaryColor)) return fail('Warna utama harus format #RRGGBB')
  if (!isValidReceiptPrefix(business.receiptPrefix)) {
    return fail('Prefix nota 2–6 huruf kapital/angka')
  }
  if (!Number.isSafeInteger(business.openingCash) || business.openingCash < 0) {
    return fail('Saldo awal kas tidak valid')
  }
  setPreviewState((s) => ({
    ...s,
    businesses: s.businesses.map((b) =>
      b.id === business.id ? { ...business, name: business.name.trim() } : b,
    ),
  }))
  return ok(undefined)
}

export interface SaveCatalogItemInput {
  id?: string
  businessId: string
  categoryId: string
  name: string
  price: number
}

export function saveCatalogItem(input: SaveCatalogItemInput): Result {
  const name = input.name.trim()
  if (name === '') return fail('Nama layanan wajib diisi')
  if (!Number.isSafeInteger(input.price) || input.price < 0) return fail('Harga tidak valid')
  const state = getPreviewState()
  const category = state.catalogCategories.find(
    (c) => c.id === input.categoryId && c.businessId === input.businessId,
  )
  if (!category) return fail('Pilih kategori')
  setPreviewState((s) => {
    if (input.id) {
      return {
        ...s,
        catalogItems: s.catalogItems.map((item) =>
          item.id === input.id
            ? { ...item, name, price: input.price, categoryId: category.id }
            : item,
        ),
      }
    }
    const siblings = s.catalogItems.filter((item) => item.categoryId === category.id)
    const item: CatalogItem = {
      id: newId(),
      businessId: input.businessId,
      categoryId: category.id,
      name,
      price: input.price,
      sortOrder: nextSortOrder(siblings),
      isActive: true,
    }
    return { ...s, catalogItems: [...s.catalogItems, item] }
  })
  return ok(undefined)
}

export function setCatalogItemActive(id: string, isActive: boolean) {
  setPreviewState((s) => ({
    ...s,
    catalogItems: s.catalogItems.map((item) => (item.id === id ? { ...item, isActive } : item)),
  }))
}

export function moveCatalogItem(id: string, direction: -1 | 1) {
  setPreviewState((s) => ({
    ...s,
    catalogItems: moveInOrder(
      s.catalogItems,
      id,
      direction,
      (a, b) => a.categoryId === b.categoryId,
    ),
  }))
}

export type CategoryKind = 'catalog' | 'expense'

const categoryKey = (kind: CategoryKind) =>
  kind === 'catalog' ? 'catalogCategories' : 'expenseCategories'

const sameName = (a: string, b: string) => normalizeLabel(a) === normalizeLabel(b)

export function saveCatalogCategory(input: {
  id?: string
  businessId: string
  name: string
}): Result {
  const name = input.name.trim()
  if (name === '') return fail('Nama kategori wajib diisi')
  const siblings = getPreviewState().catalogCategories.filter(
    (row) => row.businessId === input.businessId && row.id !== input.id,
  )
  if (siblings.some((row) => sameName(row.name, name))) return fail('Nama kategori sudah dipakai')
  setPreviewState((s) => {
    if (input.id) {
      return {
        ...s,
        catalogCategories: s.catalogCategories.map((row) =>
          row.id === input.id ? { ...row, name } : row,
        ),
      }
    }
    const row: CatalogCategory = {
      id: newId(),
      businessId: input.businessId,
      name,
      sortOrder: nextSortOrder(siblings),
      isActive: true,
    }
    return { ...s, catalogCategories: [...s.catalogCategories, row] }
  })
  return ok(undefined)
}

export interface ExpenseCategoryInput {
  id?: string
  businessId: string
  name: string
  kind: ExpenseKind
  allowDrawer: boolean
}

export function saveExpenseCategory(input: ExpenseCategoryInput): Result<ExpenseCategory> {
  const name = input.name.trim()
  if (name === '') return fail('Nama kategori wajib diisi')
  if (!EXPENSE_KINDS.includes(input.kind)) return fail('Jenis kategori tidak valid')
  const state = getPreviewState()
  const siblings = state.expenseCategories.filter(
    (row) => row.businessId === input.businessId && row.id !== input.id,
  )
  if (siblings.some((row) => sameName(row.name, name))) return fail('Nama kategori sudah dipakai')
  const existing = input.id ? state.expenseCategories.find((row) => row.id === input.id) : undefined
  if (input.id && !existing) return fail('Kategori tidak ditemukan')
  const row: ExpenseCategory = existing
    ? { ...existing, name, kind: input.kind, allowDrawer: input.allowDrawer }
    : {
        id: newId(),
        businessId: input.businessId,
        name,
        sortOrder: nextSortOrder(siblings),
        isActive: true,
        kind: input.kind,
        allowDrawer: input.allowDrawer,
      }
  setPreviewState((s) => ({
    ...s,
    expenseCategories: existing
      ? s.expenseCategories.map((c) => (c.id === row.id ? row : c))
      : [...s.expenseCategories, row],
  }))
  return ok(row)
}

export function setCategoryActive(kind: CategoryKind, id: string, isActive: boolean) {
  const key = categoryKey(kind)
  setPreviewState((s) => ({
    ...s,
    [key]: s[key].map((row) => (row.id === id ? { ...row, isActive } : row)),
  }))
}

export function moveCategory(kind: CategoryKind, id: string, direction: -1 | 1) {
  const key = categoryKey(kind)
  setPreviewState((s) => ({
    ...s,
    [key]: moveInOrder(s[key], id, direction, (a, b) => a.businessId === b.businessId),
  }))
}

export function setCashierActive(businessId: string, isActive: boolean) {
  setPreviewState((s) => ({
    ...s,
    cashierAccounts: s.cashierAccounts.map((account) =>
      account.businessId === businessId ? { ...account, isActive } : account,
    ),
  }))
}

// --- Per-business configuration & templates (decision #25) --------------------------

export function saveDashboardLayout(businessId: string, dashboard: DashboardLayout) {
  setPreviewState((s) => ({
    ...s,
    businessConfigs: s.businessConfigs.map((config) =>
      config.businessId === businessId
        ? { ...config, dashboard: normalizeLayout(dashboard) }
        : config,
    ),
  }))
}

export function resetDashboardLayout(businessId: string) {
  const config = getPreviewState().businessConfigs.find((c) => c.businessId === businessId)
  if (!config) return
  saveDashboardLayout(businessId, findTemplate(config.templateId).dashboard)
}

export interface TemplateResult {
  catalogCategories: number
  catalogItems: number
  expenseCategories: number
}

/** Adds whatever the template has that the business is missing. Never changes rows. */
export function applyTemplate(businessId: string, templateId: string): Result<TemplateResult> {
  const state = getPreviewState()
  if (!findBusiness(state, businessId)) return fail('Usaha tidak ditemukan')
  const rows = templateRows(findTemplate(templateId), businessId, state)
  setPreviewState((s) => ({
    ...s,
    catalogCategories: [...s.catalogCategories, ...rows.catalogCategories],
    catalogItems: [...s.catalogItems, ...rows.catalogItems],
    expenseCategories: [...s.expenseCategories, ...rows.expenseCategories],
    businessConfigs: s.businessConfigs.map((config) =>
      config.businessId === businessId ? { ...config, templateId } : config,
    ),
  }))
  return ok({
    catalogCategories: rows.catalogCategories.length,
    catalogItems: rows.catalogItems.length,
    expenseCategories: rows.expenseCategories.length,
  })
}

export interface NewBusinessInput {
  name: string
  receiptPrefix: string
  primaryColor: string
  timezone: string
  templateId: string
}

export function createBusiness(input: NewBusinessInput): Result<Business> {
  const name = input.name.trim()
  if (name === '') return fail('Nama usaha wajib diisi')
  if (!isHexColor(input.primaryColor)) return fail('Warna utama harus format #RRGGBB')
  if (!isValidReceiptPrefix(input.receiptPrefix)) {
    return fail('Prefix nota 2–6 huruf kapital/angka')
  }
  if (!BUSINESS_TIMEZONES.some((tz) => tz.value === input.timezone)) {
    return fail('Zona waktu tidak dikenal')
  }
  const state = getPreviewState()
  if (state.businesses.some((b) => sameName(b.name, name))) {
    return fail('Nama usaha sudah dipakai')
  }
  const template = findTemplate(input.templateId)
  const business: Business = {
    id: newId(),
    name,
    logoUrl: null,
    address: '',
    phone: '',
    receiptFooter: 'Terima kasih!',
    primaryColor: input.primaryColor,
    receiptPrefix: input.receiptPrefix,
    timezone: input.timezone,
    openingCash: 0,
    isActive: true,
  }
  const rows = templateRows(template, business.id, state)
  setPreviewState((s) => ({
    ...s,
    businesses: [...s.businesses, business],
    businessConfigs: [...s.businessConfigs, configFromTemplate(business.id, template)],
    catalogCategories: [...s.catalogCategories, ...rows.catalogCategories],
    catalogItems: [...s.catalogItems, ...rows.catalogItems],
    expenseCategories: [...s.expenseCategories, ...rows.expenseCategories],
  }))
  return ok(business)
}

// --- Imported history (decision #27) ------------------------------------------------

export function importHistory(
  businessId: string,
  days: readonly HistoricalDay[],
  mapping: Readonly<Record<string, string>>,
): Result<{ days: number }> {
  const state = getPreviewState()
  if (!findBusiness(state, businessId)) return fail('Usaha tidak ditemukan')
  const categoryIds = new Set(
    state.expenseCategories.filter((c) => c.businessId === businessId).map((c) => c.id),
  )
  for (const day of days) {
    if (day.businessId !== businessId) return fail('Data impor untuk usaha lain')
    if (!Number.isSafeInteger(day.income) || day.income < 0) {
      return fail(`Pendapatan ${day.dayKey} tidak valid`)
    }
    for (const line of day.expenses) {
      if (!categoryIds.has(line.categoryId)) return fail('Kategori pengeluaran tidak valid')
      if (!Number.isSafeInteger(line.amount) || line.amount <= 0) {
        return fail(`Pengeluaran ${day.dayKey} tidak valid`)
      }
    }
  }
  const badMapping = Object.values(mapping).some((id) => id !== SKIP_LABEL && !categoryIds.has(id))
  if (badMapping) return fail('Pemetaan label tidak valid')
  // Re-importing a month replaces its days, so fixing the spreadsheet and importing again
  // never double counts.
  const replaced = new Set(days.map((d) => d.dayKey))
  setPreviewState((s) => ({
    ...s,
    historicalDays: [
      ...s.historicalDays.filter((d) => d.businessId !== businessId || !replaced.has(d.dayKey)),
      ...days,
    ],
    businessConfigs: s.businessConfigs.map((config) =>
      config.businessId === businessId
        ? { ...config, importMapping: { ...config.importMapping, ...mapping } }
        : config,
    ),
  }))
  return ok({ days: days.length })
}

/** Removes imported history only — live transactions and expenses are never touched. */
export function clearHistory(businessId: string) {
  setPreviewState((s) => ({
    ...s,
    historicalDays: s.historicalDays.filter((d) => d.businessId !== businessId),
  }))
}

/** Reorders an expense category among the categories of the same kind. */
export function moveExpenseCategory(id: string, direction: -1 | 1) {
  setPreviewState((s) => ({
    ...s,
    expenseCategories: moveInOrder(
      s.expenseCategories,
      id,
      direction,
      (a, b) => a.businessId === b.businessId && a.kind === b.kind,
    ),
  }))
}
