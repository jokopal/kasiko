import { selectBusiness } from '@/features/auth/session'
import { isHexColor } from '@/features/business/brand'
import { normalizeLayout, type DashboardLayout } from '@/features/business/config'
import { findTemplate } from '@/features/business/templates'
import { discountProblem } from '@/features/pos/discount'
import { isValidReceiptPrefix } from '@/features/receipt/receipt-number'
import { BUSINESS_TIMEZONES } from '@/lib/datetime'
import { newId } from '@/lib/id'
import { moveInOrder, nextSortOrder, type Ordered } from '@/lib/ordering'
import { fail, ok, type Result } from '@/lib/result'
import { getSupabase } from '@/lib/supabase'
import {
  EXPENSE_KINDS,
  type Business,
  type CashierAccount,
  type DiscountType,
  type ExpenseKind,
  type HistoricalDay,
  type ReserveDepositSource,
  type ReserveMovementType,
} from '@/lib/types'
import { LOGO_BUCKET } from './kasir'
import { callRpc, invokeFunction } from './rpc'
import { invalidateBusiness } from './query-client'
import { historicalDaysPayload } from './rows'

// Owner writes (online only, decision #7). Plain table writes rely on RLS + column grants;
// anything that needs more than a row check is an RPC. Every action returns a Result with
// an Indonesian message and refreshes the business's cached data.

interface DbError {
  code?: string | null
  message: string
}

function friendly(error: DbError): string {
  if (error.code === '23505' && /duplicate key/i.test(error.message)) return 'Nama sudah dipakai'
  if (error.code === '42501' && /row-level security|permission denied/i.test(error.message)) {
    return 'Tidak diizinkan untuk usaha ini'
  }
  if (/fetch|network/i.test(error.message)) return 'Tidak ada koneksi internet'
  return error.message
}

async function run<T = undefined>(
  businessId: string,
  work: () => PromiseLike<{ data?: unknown; error: DbError | null }>,
  pick: (data: unknown) => T = () => undefined as T,
): Promise<Result<T>> {
  try {
    const { data, error } = await work()
    if (error) return fail(friendly(error))
    await invalidateBusiness(businessId)
    return ok(pick(data))
  } catch (error) {
    return fail(error instanceof Error ? friendly({ message: error.message }) : 'Gagal menyimpan')
  }
}

const db = () => getSupabase()

// --- Business settings ----------------------------------------------------------------

export function saveBusiness(business: Business, logoPath?: string | null): Promise<Result> {
  if (business.name.trim() === '') return Promise.resolve(fail('Nama usaha wajib diisi'))
  if (!isHexColor(business.primaryColor)) {
    return Promise.resolve(fail('Warna utama harus format #RRGGBB'))
  }
  if (!isValidReceiptPrefix(business.receiptPrefix)) {
    return Promise.resolve(fail('Prefix nota 2–6 huruf kapital/angka'))
  }
  if (!Number.isSafeInteger(business.openingCash) || business.openingCash < 0) {
    return Promise.resolve(fail('Saldo awal kas tidak valid'))
  }
  return run(business.id, () =>
    db()
      .from('businesses')
      .update({
        name: business.name.trim(),
        address: business.address,
        phone: business.phone,
        receipt_footer: business.receiptFooter,
        primary_color: business.primaryColor,
        receipt_prefix: business.receiptPrefix,
        timezone: business.timezone,
        opening_cash: business.openingCash,
        ...(logoPath !== undefined && { logo_path: logoPath }),
      })
      .eq('id', business.id),
  )
}

const LOGO_TYPES = ['image/png', 'image/jpeg', 'image/webp']

/** Uploads a logo into the business folder and saves its path (decision #10). */
export async function uploadLogo(business: Business, file: File): Promise<Result> {
  if (!LOGO_TYPES.includes(file.type)) return fail('Logo harus PNG, JPG, atau WebP')
  if (file.size > 1024 * 1024) return fail('Ukuran logo maksimal 1 MB')
  const extension = file.type.split('/')[1] ?? 'png'
  const path = `${business.id}/logo-${Date.now()}.${extension}`
  const { error } = await db()
    .storage.from(LOGO_BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false })
  if (error) return fail(friendly(error))
  return run(business.id, () =>
    db().from('businesses').update({ logo_path: path }).eq('id', business.id),
  )
}

export function removeLogo(business: Business): Promise<Result> {
  return run(business.id, () =>
    db().from('businesses').update({ logo_path: null }).eq('id', business.id),
  )
}

export function saveDashboardLayout(businessId: string, dashboard: DashboardLayout) {
  return run(businessId, () =>
    db()
      .from('business_configs')
      .update({ dashboard: normalizeLayout(dashboard) })
      .eq('business_id', businessId),
  )
}

export function resetDashboardLayout(businessId: string, templateId: string) {
  return saveDashboardLayout(businessId, findTemplate(templateId).dashboard)
}

// --- Ordering helpers ------------------------------------------------------------------

/** Writes the sort orders `moveInOrder` changed. */
async function persistOrder<T extends Ordered>(
  businessId: string,
  table: string,
  rows: readonly T[],
  id: string,
  direction: -1 | 1,
  sameGroup?: (a: T, b: T) => boolean,
): Promise<Result> {
  const moved = moveInOrder(rows, id, direction, sameGroup)
  const changed = moved.filter(
    (row) => rows.find((r) => r.id === row.id)?.sortOrder !== row.sortOrder,
  )
  for (const row of changed) {
    const { error } = await db().from(table).update({ sort_order: row.sortOrder }).eq('id', row.id)
    if (error) return fail(friendly(error))
  }
  await invalidateBusiness(businessId)
  return ok(undefined)
}

// --- Catalog ---------------------------------------------------------------------------

export interface SaveCatalogItemInput {
  id?: string
  businessId: string
  categoryId: string
  name: string
  price: number
  siblings: readonly Ordered[]
}

export function saveCatalogItem(input: SaveCatalogItemInput): Promise<Result> {
  const name = input.name.trim()
  if (name === '') return Promise.resolve(fail('Nama layanan wajib diisi'))
  if (!Number.isSafeInteger(input.price) || input.price < 0) {
    return Promise.resolve(fail('Harga tidak valid'))
  }
  if (!input.categoryId) return Promise.resolve(fail('Pilih kategori'))
  return run(input.businessId, () =>
    input.id
      ? db()
          .from('catalog_items')
          .update({ name, price: input.price, category_id: input.categoryId })
          .eq('id', input.id)
      : db()
          .from('catalog_items')
          .insert({
            id: newId(),
            business_id: input.businessId,
            category_id: input.categoryId,
            name,
            price: input.price,
            sort_order: nextSortOrder(input.siblings),
          }),
  )
}

export function setActive(
  businessId: string,
  table: 'catalog_items' | 'catalog_categories' | 'expense_categories' | 'discounts',
  id: string,
  isActive: boolean,
) {
  return run(businessId, () => db().from(table).update({ is_active: isActive }).eq('id', id))
}

export function moveCatalogItem(
  businessId: string,
  items: readonly (Ordered & { categoryId: string })[],
  id: string,
  direction: -1 | 1,
) {
  return persistOrder(
    businessId,
    'catalog_items',
    items,
    id,
    direction,
    (a, b) => a.categoryId === b.categoryId,
  )
}

export function saveCatalogCategory(input: {
  id?: string
  businessId: string
  name: string
  siblings: readonly Ordered[]
}): Promise<Result> {
  const name = input.name.trim()
  if (name === '') return Promise.resolve(fail('Nama kategori wajib diisi'))
  return run(input.businessId, () =>
    input.id
      ? db().from('catalog_categories').update({ name }).eq('id', input.id)
      : db()
          .from('catalog_categories')
          .insert({
            id: newId(),
            business_id: input.businessId,
            name,
            sort_order: nextSortOrder(input.siblings),
          }),
  )
}

export function moveCatalogCategory(
  businessId: string,
  rows: readonly Ordered[],
  id: string,
  direction: -1 | 1,
) {
  return persistOrder(businessId, 'catalog_categories', rows, id, direction)
}

// --- Expense categories (decisions #24, #26) -------------------------------------------

export interface ExpenseCategoryInput {
  id?: string
  businessId: string
  name: string
  kind: ExpenseKind
  allowDrawer: boolean
  siblings: readonly Ordered[]
}

export function saveExpenseCategory(input: ExpenseCategoryInput): Promise<Result> {
  const name = input.name.trim()
  if (name === '') return Promise.resolve(fail('Nama kategori wajib diisi'))
  if (!EXPENSE_KINDS.includes(input.kind))
    return Promise.resolve(fail('Jenis kategori tidak valid'))
  const values = { name, kind: input.kind, allow_drawer: input.allowDrawer }
  return run(input.businessId, () =>
    input.id
      ? db().from('expense_categories').update(values).eq('id', input.id)
      : db()
          .from('expense_categories')
          .insert({
            id: newId(),
            business_id: input.businessId,
            sort_order: nextSortOrder(input.siblings),
            ...values,
          }),
  )
}

export function moveExpenseCategory(
  businessId: string,
  rows: readonly (Ordered & { kind: ExpenseKind })[],
  id: string,
  direction: -1 | 1,
) {
  return persistOrder(
    businessId,
    'expense_categories',
    rows,
    id,
    direction,
    (a, b) => a.kind === b.kind,
  )
}

// --- Discounts (decision #35) ------------------------------------------------------------

export interface DiscountInput {
  id?: string
  businessId: string
  name: string
  type: DiscountType
  value: number
  siblings: readonly Ordered[]
}

export function saveDiscount(input: DiscountInput): Promise<Result> {
  const problem = discountProblem(input)
  if (problem) return Promise.resolve(fail(problem))
  const values = { name: input.name.trim(), type: input.type, value: input.value }
  return run(input.businessId, () =>
    input.id
      ? db().from('discounts').update(values).eq('id', input.id)
      : db()
          .from('discounts')
          .insert({
            id: newId(),
            business_id: input.businessId,
            sort_order: nextSortOrder(input.siblings),
            ...values,
          }),
  )
}

export function moveDiscount(
  businessId: string,
  rows: readonly Ordered[],
  id: string,
  direction: -1 | 1,
) {
  return persistOrder(businessId, 'discounts', rows, id, direction)
}

// --- Money ---------------------------------------------------------------------------------

export function createOwnerExpense(input: {
  businessId: string
  categoryId: string
  amount: number
  note: string
}): Promise<Result<{ amount: number }>> {
  if (!input.categoryId) return Promise.resolve(fail('Pilih kategori pengeluaran'))
  if (!Number.isSafeInteger(input.amount) || input.amount <= 0) {
    return Promise.resolve(fail('Nominal harus lebih dari 0'))
  }
  return run(
    input.businessId,
    () =>
      db().rpc('create_expense', {
        p: {
          id: newId(),
          business_id: input.businessId,
          category_id: input.categoryId,
          amount: input.amount,
          note: input.note,
          source: 'owner',
          occurred_at: new Date().toISOString(),
        },
      }),
    () => ({ amount: input.amount }),
  )
}

export function voidTransactionAsOwner(businessId: string, id: string, reason: string) {
  return run(businessId, () => db().rpc('void_transaction', { p_id: id, p_reason: reason }))
}

export function voidExpenseAsOwner(businessId: string, id: string, reason: string) {
  return run(businessId, () => db().rpc('void_expense', { p_id: id, p_reason: reason }))
}

export function addReserveMovement(input: {
  businessId: string
  type: ReserveMovementType
  amount: number
  source: ReserveDepositSource | null
  reason: string
}): Promise<Result> {
  if (!Number.isSafeInteger(input.amount) || input.amount <= 0) {
    return Promise.resolve(fail('Nominal harus lebih dari 0'))
  }
  const reason = input.reason.trim()
  if (input.type === 'deposit' && !input.source)
    return Promise.resolve(fail('Pilih sumber setoran'))
  if (input.type === 'withdraw' && reason.length < 3) {
    return Promise.resolve(fail('Alasan penarikan wajib diisi'))
  }
  return run(input.businessId, () =>
    db()
      .from('reserve_movements')
      .insert({
        business_id: input.businessId,
        type: input.type,
        amount: input.amount,
        source: input.type === 'deposit' ? input.source : null,
        reason: reason === '' ? null : reason,
      }),
  )
}

// --- Templates & businesses (decision #25) -----------------------------------------------

function templatePayload(templateId: string) {
  const template = findTemplate(templateId)
  return {
    id: template.id,
    catalog: template.catalog,
    expenseCategories: template.expenseCategories,
    dashboard: normalizeLayout(template.dashboard),
  }
}

export interface TemplateResult {
  catalogCategories: number
  catalogItems: number
  expenseCategories: number
}

export function applyTemplate(
  businessId: string,
  templateId: string,
): Promise<Result<TemplateResult>> {
  return run(
    businessId,
    () =>
      db().rpc('apply_template', {
        p_business_id: businessId,
        p_template: templatePayload(templateId),
      }),
    (data) => data as TemplateResult,
  )
}

export interface NewBusinessInput {
  name: string
  receiptPrefix: string
  primaryColor: string
  timezone: string
  templateId: string
}

export async function createBusiness(
  input: NewBusinessInput,
): Promise<Result<{ id: string; name: string }>> {
  const name = input.name.trim()
  if (name === '') return fail('Nama usaha wajib diisi')
  if (!isHexColor(input.primaryColor)) return fail('Warna utama harus format #RRGGBB')
  if (!isValidReceiptPrefix(input.receiptPrefix)) return fail('Prefix nota 2–6 huruf kapital/angka')
  if (!BUSINESS_TIMEZONES.some((tz) => tz.value === input.timezone)) {
    return fail('Zona waktu tidak dikenal')
  }
  const { data, error } = await callRpc('create_business', {
    p_business: {
      name,
      receipt_prefix: input.receiptPrefix,
      primary_color: input.primaryColor,
      timezone: input.timezone,
    },
    p_template: templatePayload(input.templateId),
  })
  if (error) return fail(friendly(error))
  const id = data as string
  selectBusiness(id)
  await invalidateBusiness(id)
  return ok({ id, name })
}

// --- Imported history (decision #27) ------------------------------------------------------

export function importHistory(
  businessId: string,
  days: readonly HistoricalDay[],
  mapping: Readonly<Record<string, string>>,
): Promise<Result<{ days: number }>> {
  return run(
    businessId,
    () =>
      db().rpc('import_history', {
        p_business_id: businessId,
        p_days: historicalDaysPayload(days),
        p_mapping: mapping,
      }),
    (data) => ({ days: data as number }),
  )
}

export function clearHistory(businessId: string) {
  return run(businessId, () => db().rpc('clear_history', { p_business_id: businessId }))
}

// --- Cashier account (manage-cashier Edge Function, decision #33) ---------------------------

async function cashierCall<T>(body: Record<string, unknown>): Promise<Result<T>> {
  const { data, error } = await invokeFunction('manage-cashier', body)
  if (error) {
    // The function answers with { error } and a 4xx status; surface that message.
    const context = error.context
    const payload = context
      ? ((await context.json().catch(() => null)) as { error?: string } | null)
      : null
    return fail(payload?.error ?? 'Gagal menghubungi server')
  }
  if (!data) return fail('Jawaban server kosong')
  return ok(data as T)
}

export async function fetchCashierAccount(businessId: string): Promise<CashierAccount | null> {
  const result = await cashierCall<{ account: CashierAccount | null }>({
    action: 'get',
    businessId,
  })
  if (!result.ok) throw new Error(result.error)
  return result.value.account
}

export async function createCashier(businessId: string, username: string, password: string) {
  const result = await cashierCall({ action: 'create', businessId, username, password })
  await invalidateBusiness(businessId)
  return result
}

export function resetCashierPassword(businessId: string, password: string) {
  return cashierCall({ action: 'reset_password', businessId, password })
}

export async function setCashierActive(businessId: string, active: boolean) {
  const result = await cashierCall({ action: 'set_active', businessId, active })
  await invalidateBusiness(businessId)
  return result
}
