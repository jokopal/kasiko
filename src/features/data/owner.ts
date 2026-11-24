import { savedLayout, type BusinessConfig, type DashboardLayout } from '@/features/business/config'
import { findTemplate } from '@/features/business/templates'
import {
  daysOfMonth,
  monthlyMatrix,
  type DailyPoint,
  type ItemRanking,
  type MonthPoint,
  type MonthlyMatrix,
  type PeriodTotals,
} from '@/features/reports/finance'
import type { HistoricalLine } from '@/features/reports/summary'
import { getSupabase } from '@/lib/supabase'
import type {
  Business,
  CatalogCategory,
  CatalogItem,
  Discount,
  Expense,
  ExpenseCategory,
  HistoricalDay,
  ReserveMovement,
  Transaction,
} from '@/lib/types'
import { logoUrl, rowOf, rowsOf } from './kasir'
import { callRpc } from './rpc'
import {
  toBusiness,
  toCatalogCategory,
  toCatalogItem,
  toDiscount,
  toExpense,
  toExpenseCategory,
  toHistoricalDay,
  toReserveMovement,
  toTransaction,
  type BusinessRow,
  type CatalogCategoryRow,
  type CatalogItemRow,
  type DiscountRow,
  type ExpenseCategoryRow,
  type ExpenseRow,
  type HistoricalDayRow,
  type ReserveMovementRow,
  type TransactionRow,
} from './rows'

// Owner reads (always online, decision #7). Lists are fetched page by page (PostgREST
// returns at most 1,000 rows per request); every total comes from the SQL functions.

const PAGE = 1000

/** Fetches all rows of a query, `PAGE` at a time. */
async function allPages<T>(
  page: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: unknown; error: { message: string } | null }>,
): Promise<T[]> {
  const rows: T[] = []
  for (let from = 0; ; from += PAGE) {
    const chunk = rowsOf<T>(await page(from, from + PAGE - 1))
    rows.push(...chunk)
    if (chunk.length < PAGE) return rows
  }
}

export async function fetchOwnerBusinesses(): Promise<Business[]> {
  const result = await getSupabase().from('businesses').select('*').order('created_at')
  return rowsOf<BusinessRow>(result).map((row) => toBusiness(row, logoUrl(row.logo_path)))
}

export interface OwnerMaster {
  business: Business
  config: BusinessConfig
  catalogCategories: CatalogCategory[]
  catalogItems: CatalogItem[]
  expenseCategories: ExpenseCategory[]
  discounts: Discount[]
}

interface ConfigRow {
  business_id: string
  template_id: string
  dashboard: Partial<DashboardLayout>
  import_mapping: Record<string, string>
  /** Absent before migration 0800. */
  item_mapping?: Record<string, string>
}

export async function fetchOwnerMaster(businessId: string): Promise<OwnerMaster> {
  const db = getSupabase()
  const [business, config, categories, items, expenseCategories, discounts] = await Promise.all([
    db.from('businesses').select('*').eq('id', businessId).single(),
    db.from('business_configs').select('*').eq('business_id', businessId).single(),
    db.from('catalog_categories').select('*').eq('business_id', businessId).order('sort_order'),
    db.from('catalog_items').select('*').eq('business_id', businessId).order('sort_order'),
    db.from('expense_categories').select('*').eq('business_id', businessId).order('sort_order'),
    db.from('discounts').select('*').eq('business_id', businessId).order('sort_order'),
  ])
  const businessRow = rowOf<BusinessRow>(business)
  const configRow = rowOf<ConfigRow>(config)
  return {
    business: toBusiness(businessRow, logoUrl(businessRow.logo_path)),
    config: {
      businessId,
      templateId: configRow.template_id,
      dashboard: savedLayout(configRow.dashboard, findTemplate(configRow.template_id).dashboard),
      importMapping: configRow.import_mapping,
      itemMapping: configRow.item_mapping ?? {},
    },
    catalogCategories: rowsOf<CatalogCategoryRow>(categories).map(toCatalogCategory),
    catalogItems: rowsOf<CatalogItemRow>(items).map(toCatalogItem),
    expenseCategories: rowsOf<ExpenseCategoryRow>(expenseCategories).map(toExpenseCategory),
    discounts: rowsOf<DiscountRow>(discounts).map(toDiscount),
  }
}

export async function fetchTransactions(
  businessId: string,
  from: Date,
  to: Date,
): Promise<Transaction[]> {
  const rows = await allPages<TransactionRow>((start, end) =>
    getSupabase()
      .from('transactions')
      .select('*, transaction_items(*)')
      .eq('business_id', businessId)
      .gte('occurred_at', from.toISOString())
      .lt('occurred_at', to.toISOString())
      .order('occurred_at', { ascending: false })
      .range(start, end),
  )
  return rows.map(toTransaction)
}

export async function fetchExpenses(businessId: string, from: Date, to: Date): Promise<Expense[]> {
  const rows = await allPages<ExpenseRow>((start, end) =>
    getSupabase()
      .from('expenses')
      .select('*')
      .eq('business_id', businessId)
      .gte('occurred_at', from.toISOString())
      .lt('occurred_at', to.toISOString())
      .order('occurred_at', { ascending: false })
      .range(start, end),
  )
  return rows.map(toExpense)
}

export async function fetchReserveMovements(businessId: string): Promise<ReserveMovement[]> {
  const rows = await allPages<ReserveMovementRow>((start, end) =>
    getSupabase()
      .from('reserve_movements')
      .select('*')
      .eq('business_id', businessId)
      .order('occurred_at', { ascending: false })
      .range(start, end),
  )
  return rows.map(toReserveMovement)
}

export async function fetchHistoricalDays(businessId: string): Promise<HistoricalDay[]> {
  const rows = await allPages<HistoricalDayRow>((start, end) =>
    getSupabase()
      .from('historical_days')
      .select('business_id, day_key, income, imported_at')
      .eq('business_id', businessId)
      .order('day_key')
      .range(start, end),
  )
  return rows.map(toHistoricalDay)
}

/** Imported income and expense lines for `[firstDayKey, lastDayKey]` (the Laporan tables). */
export async function fetchHistoryRange(
  businessId: string,
  firstDayKey: string,
  lastDayKey: string,
): Promise<{
  income: { dayKey: string; income: number }[]
  expenses: HistoricalLine[]
}> {
  const db = getSupabase()
  const [days, lines] = await Promise.all([
    allPages<{ day_key: string; income: number }>((start, end) =>
      db
        .from('historical_days')
        .select('day_key, income')
        .eq('business_id', businessId)
        .gte('day_key', firstDayKey)
        .lte('day_key', lastDayKey)
        .order('day_key')
        .range(start, end),
    ),
    allPages<{ day_key: string; category_id: string; amount: number }>((start, end) =>
      db
        .from('historical_expenses')
        .select('day_key, category_id, amount')
        .eq('business_id', businessId)
        .gte('day_key', firstDayKey)
        .lte('day_key', lastDayKey)
        .order('day_key')
        .order('category_id')
        .range(start, end),
    ),
  ])
  return {
    income: days.map((d) => ({ dayKey: d.day_key, income: d.income })),
    expenses: lines.map((l) => ({
      dayKey: l.day_key,
      categoryId: l.category_id,
      amount: l.amount,
    })),
  }
}

/** The very start of "cumulative": earlier than any record a business can hold. */
export const BEGINNING_OF_RECORDS = new Date('2000-01-01T00:00:00Z')

// --- SQL aggregates -------------------------------------------------------------------

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await callRpc(fn, args)
  if (error) throw new Error(error.message)
  return data as T
}

interface PeriodTotalsRow {
  income: number
  expense: number
  operating_expense: number
  non_operating_expense: number
  drawings: number
  operating_profit: number
  profit: number
  net_cash_flow: number
  transaction_count: number
  income_cash: number
  income_qris: number
  income_transfer: number
  drawer_expense: number
  owner_expense: number
  historical_income: number
  historical_days: number
  discount_total: number
}

export async function fetchPeriodTotals(
  businessId: string,
  from: Date,
  to: Date,
): Promise<PeriodTotals> {
  const rows = await rpc<PeriodTotalsRow[]>('period_totals', {
    p_business_id: businessId,
    p_from: from.toISOString(),
    p_to: to.toISOString(),
  })
  const r = rows[0]
  if (!r) throw new Error('Rekap tidak tersedia')
  return {
    income: r.income,
    expense: r.expense,
    operatingExpense: r.operating_expense,
    nonOperatingExpense: r.non_operating_expense,
    drawings: r.drawings,
    operatingProfit: r.operating_profit,
    profit: r.profit,
    netCashFlow: r.net_cash_flow,
    transactionCount: r.transaction_count,
    incomeByMethod: { cash: r.income_cash, qris: r.income_qris, transfer: r.income_transfer },
    drawerExpense: r.drawer_expense,
    ownerExpense: r.owner_expense,
    historicalIncome: r.historical_income,
    historicalDays: r.historical_days,
    discountTotal: r.discount_total,
  }
}

export async function fetchDailyTotals(
  businessId: string,
  firstDayKey: string,
  lastDayKey: string,
): Promise<DailyPoint[]> {
  const rows = await rpc<{ day_key: string; income: number; expense: number }[]>('daily_totals', {
    p_business_id: businessId,
    p_first_day: firstDayKey,
    p_last_day: lastDayKey,
  })
  return rows.map((r) => ({ dayKey: r.day_key, income: r.income, expense: r.expense }))
}

export async function fetchMonthlyTotals(
  businessId: string,
  monthKeys: readonly string[],
): Promise<MonthPoint[]> {
  const first = monthKeys[0]
  if (!first) return []
  const rows = await rpc<
    {
      month_key: string
      income: number
      operating_expense: number
      non_operating_expense: number
      drawings: number
    }[]
  >('monthly_totals', {
    p_business_id: businessId,
    p_first_month: `${first}-01`,
    p_months: monthKeys.length,
  })
  return rows.map((r) => {
    const operatingProfit = r.income - r.operating_expense
    return {
      monthKey: r.month_key.slice(0, 7),
      income: r.income,
      operatingExpense: r.operating_expense,
      nonOperatingExpense: r.non_operating_expense,
      drawings: r.drawings,
      operatingProfit,
      profit: operatingProfit - r.non_operating_expense,
    }
  })
}

export function fetchTopItems(
  businessId: string,
  from: Date,
  to: Date,
  limit = 6,
): Promise<ItemRanking[]> {
  return rpc<ItemRanking[]>('top_items', {
    p_business_id: businessId,
    p_from: from.toISOString(),
    p_to: to.toISOString(),
    p_limit: limit,
  })
}

/** `[weekday 0..6][hour 0..23]` counts, like busyHours() in finance.ts. */
export async function fetchBusyHours(businessId: string, from: Date, to: Date) {
  const rows = await rpc<{ weekday: number; hour: number; count: number }[]>('busy_hours', {
    p_business_id: businessId,
    p_from: from.toISOString(),
    p_to: to.toISOString(),
  })
  const matrix = Array.from({ length: 7 }, () => Array<number>(24).fill(0))
  for (const { weekday, hour, count } of rows) {
    const row = matrix[weekday]
    if (row) row[hour] = count
  }
  return matrix
}

export async function fetchExpenseByCategory(businessId: string, from: Date, to: Date) {
  const rows = await rpc<{ category_id: string; amount: number }[]>('expense_by_category', {
    p_business_id: businessId,
    p_from: from.toISOString(),
    p_to: to.toISOString(),
  })
  return rows.map((r) => ({ categoryId: r.category_id, amount: r.amount }))
}

export function fetchReserveBalance(businessId: string, until?: Date): Promise<number> {
  return rpc<number>('reserve_balance', {
    p_business_id: businessId,
    p_until: until?.toISOString() ?? null,
  })
}

export function fetchFreeCash(businessId: string, until?: Date): Promise<number> {
  return rpc<number>('free_cash', {
    p_business_id: businessId,
    p_until: until?.toISOString() ?? null,
  })
}

/** The monthly recap matrix, built from the SQL rows with the same code as the preview. */
export async function fetchMonthlyMatrix(
  businessId: string,
  monthKey: string,
  categories: readonly ExpenseCategory[],
  timeZone: string,
): Promise<MonthlyMatrix> {
  const rows = await rpc<
    { day_key: string; category_id: string | null; amount: number; imported: boolean }[]
  >('monthly_matrix', { p_business_id: businessId, p_month: `${monthKey}-01` })
  const days = new Map<string, HistoricalDay>()
  const imported = new Set<string>()
  for (const row of rows) {
    const day = days.get(row.day_key) ?? {
      businessId,
      dayKey: row.day_key,
      income: 0,
      expenses: [],
      importedAt: '',
    }
    if (row.category_id === null) day.income += row.amount
    else day.expenses.push({ categoryId: row.category_id, amount: row.amount })
    if (row.imported) imported.add(row.day_key)
    days.set(row.day_key, day)
  }
  const matrix = monthlyMatrix(
    { transactions: [], expenses: [], history: [...days.values()], timeZone },
    monthKey,
    categories,
  )
  return {
    ...matrix,
    imported: daysOfMonth(monthKey).map((key) => imported.has(key)),
    totals: { ...matrix.totals, historicalDays: imported.size },
  }
}

export function fetchFirstActivityDay(businessId: string): Promise<string | null> {
  return rpc<string | null>('first_activity_day', { p_business_id: businessId })
}

export async function fetchLiveDays(
  businessId: string,
  firstDayKey: string,
  lastDayKey: string,
): Promise<Set<string>> {
  const rows = await rpc<string[]>('live_days', {
    p_business_id: businessId,
    p_first_day: firstDayKey,
    p_last_day: lastDayKey,
  })
  return new Set(rows)
}

// --- Vehicles, daily summary, item sales and audit (decisions #43–#45) ------------------

export interface VehicleSummary {
  /** Days with business in the range: the divisor of "per day". */
  days: number
  categories: { categoryId: string; name: string; vehicles: number }[]
}

export async function fetchVehicleSummary(
  businessId: string,
  from: Date,
  to: Date,
): Promise<VehicleSummary> {
  const rows = await rpc<
    { category_id: string; category_name: string; vehicles: number; days: number }[]
  >('vehicle_summary', {
    p_business_id: businessId,
    p_from: from.toISOString(),
    p_to: to.toISOString(),
  })
  return {
    days: rows[0]?.days ?? 0,
    categories: rows.map((r) => ({
      categoryId: r.category_id,
      name: r.category_name,
      vehicles: r.vehicles,
    })),
  }
}

export interface VehicleDayRow {
  dayKey: string
  categoryId: string
  /** Category name. */
  name: string
  itemId: string
  itemName: string
  vehicles: number
}

/** Vehicles per day and category from live sales (decision #43). */
export async function fetchVehicleDays(
  businessId: string,
  from: Date,
  to: Date,
): Promise<VehicleDayRow[]> {
  const rows = await rpc<
    {
      day_key: string
      category_id: string
      category_name: string
      item_id: string
      item_name: string
      vehicles: number
    }[]
  >('vehicle_days', {
    p_business_id: businessId,
    p_from: from.toISOString(),
    p_to: to.toISOString(),
  })
  return rows.map((r) => ({
    dayKey: r.day_key,
    categoryId: r.category_id,
    name: r.category_name,
    itemId: r.item_id,
    itemName: r.item_name,
    vehicles: Number(r.vehicles),
  }))
}

export interface VehicleMonthRow {
  /** First day of the month, `YYYY-MM-01`. */
  monthKey: string
  categoryId: string
  /** Category name. */
  name: string
  itemId: string
  itemName: string
  source: 'kasir' | 'olsera'
  vehicles: number
}

/** Vehicles per month and category since the first record, live and imported (#43, #45). */
export async function fetchVehicleMonths(businessId: string): Promise<VehicleMonthRow[]> {
  const rows = await rpc<
    {
      month_key: string
      category_id: string
      category_name: string
      item_id: string
      item_name: string
      source: 'kasir' | 'olsera'
      vehicles: number
    }[]
  >('vehicle_months', { p_business_id: businessId })
  return rows.map((r) => ({
    monthKey: r.month_key,
    categoryId: r.category_id,
    name: r.category_name,
    itemId: r.item_id,
    itemName: r.item_name,
    source: r.source,
    vehicles: Number(r.vehicles),
  }))
}

export interface DailySummaryPoint {
  dayKey: string
  income: number
  expense: number
  vehicles: number
  transactions: number
}

export async function fetchDailySummary(
  businessId: string,
  firstDayKey: string,
  lastDayKey: string,
): Promise<DailySummaryPoint[]> {
  const rows = await rpc<
    { day_key: string; income: number; expense: number; vehicles: number; transactions: number }[]
  >('daily_summary', {
    p_business_id: businessId,
    p_first_day: firstDayKey,
    p_last_day: lastDayKey,
  })
  return rows.map((r) => ({
    dayKey: r.day_key,
    income: r.income,
    expense: r.expense,
    vehicles: r.vehicles,
    transactions: r.transactions,
  }))
}

export interface ImportedItemSale {
  firstDay: string
  lastDay: string
  product: string
  catalogItemId: string | null
  qty: number
  amount: number
}

export async function fetchItemSales(businessId: string): Promise<ImportedItemSale[]> {
  const rows = await allPages<{
    first_day: string
    last_day: string
    product: string
    catalog_item_id: string | null
    qty: number
    amount: number
  }>((start, end) =>
    getSupabase()
      .from('historical_item_sales')
      .select('first_day, last_day, product, catalog_item_id, qty, amount')
      .eq('business_id', businessId)
      .order('first_day')
      .order('product')
      .range(start, end),
  )
  return rows.map((r) => ({
    firstDay: r.first_day,
    lastDay: r.last_day,
    product: r.product,
    catalogItemId: r.catalog_item_id,
    qty: r.qty,
    amount: r.amount,
  }))
}

export interface AuditEntry {
  id: number
  actorId: string | null
  action: string
  entity: string
  entityId: string
  oldData: Record<string, unknown> | null
  newData: Record<string, unknown> | null
  createdAt: string
}

export const AUDIT_PAGE = 100

/** Newest first, `AUDIT_PAGE` at a time; `beforeId` continues an earlier page. */
export async function fetchAuditLog(
  businessId: string,
  options: { from: Date; to: Date; entities?: readonly string[]; beforeId?: number },
): Promise<AuditEntry[]> {
  let query = getSupabase()
    .from('audit_log')
    .select('id, actor_id, action, entity, entity_id, old_data, new_data, created_at')
    .eq('business_id', businessId)
    .gte('created_at', options.from.toISOString())
    .lt('created_at', options.to.toISOString())
  if (options.entities && options.entities.length > 0) {
    query = query.in('entity', [...options.entities])
  }
  if (options.beforeId !== undefined) query = query.lt('id', options.beforeId)
  const rows = rowsOf<{
    id: number
    actor_id: string | null
    action: string
    entity: string
    entity_id: string
    old_data: Record<string, unknown> | null
    new_data: Record<string, unknown> | null
    created_at: string
  }>(await query.order('id', { ascending: false }).limit(AUDIT_PAGE))
  return rows.map((r) => ({
    id: r.id,
    actorId: r.actor_id,
    action: r.action,
    entity: r.entity,
    entityId: r.entity_id,
    oldData: r.old_data,
    newData: r.new_data,
    createdAt: r.created_at,
  }))
}

/** user id → role, so the audit log can say "Owner" or "Kasir". */
export async function fetchMemberRoles(businessId: string): Promise<Map<string, string>> {
  const rows = rowsOf<{ user_id: string; role: string }>(
    await getSupabase()
      .from('business_members')
      .select('user_id, role')
      .eq('business_id', businessId),
  )
  return new Map(rows.map((r) => [r.user_id, r.role]))
}
