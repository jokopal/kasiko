import {
  normalizeLayout,
  type BusinessConfig,
  type DashboardLayout,
} from '@/features/business/config'
import {
  daysOfMonth,
  monthlyMatrix,
  type DailyPoint,
  type ItemRanking,
  type MonthPoint,
  type MonthlyMatrix,
  type PeriodTotals,
} from '@/features/reports/finance'
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
      dashboard: normalizeLayout({
        kpis: configRow.dashboard.kpis ?? [],
        panels: configRow.dashboard.panels ?? [],
      }),
      importMapping: configRow.import_mapping,
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
