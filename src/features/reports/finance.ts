import {
  businessDayKey,
  getZonedParts,
  isInRange,
  shiftDayKey,
  startOfBusinessDayKey,
  type DateRange,
} from '@/lib/datetime'
import { sumRupiah } from '@/lib/money'
import type {
  Expense,
  ExpenseCategory,
  ExpenseKind,
  HistoricalDay,
  PaymentMethod,
  ReserveMovement,
  Transaction,
} from '@/lib/types'

// Financial formulas from AGENTS.md section 4 and decision #24. In production these run
// as SQL functions (milestone 7/8); this module is the reference implementation the SQL
// is tested against, and powers the preview until the database exists.

const paid = (t: Transaction) => t.status === 'paid'
const active = (e: Expense) => e.status === 'active'
const at = (iso: string) => new Date(iso)

export type KindOf = (categoryId: string) => ExpenseKind

/** Category kind lookup; unknown categories count as operating (the safe default). */
export function kindLookup(categories: readonly Pick<ExpenseCategory, 'id' | 'kind'>[]): KindOf {
  const kinds = new Map(categories.map((c) => [c.id, c.kind]))
  return (categoryId) => kinds.get(categoryId) ?? 'operating'
}

const allOperating: KindOf = () => 'operating'

/** Imported spreadsheet days (decision #27): analysis only, never cash or drawer. */
export interface HistoryInput {
  days: readonly HistoricalDay[]
  timeZone: string
}

function historyIn(history: HistoryInput | undefined, range: DateRange): HistoricalDay[] {
  if (!history) return []
  return history.days.filter((d) =>
    isInRange(startOfBusinessDayKey(d.dayKey, history.timeZone), range),
  )
}

export interface PeriodOptions {
  kindOf?: KindOf
  history?: HistoryInput
}

export interface PeriodTotals {
  income: number
  /** All expenses, every kind. */
  expense: number
  operatingExpense: number
  nonOperatingExpense: number
  drawings: number
  /** Income − operating expenses. */
  operatingProfit: number
  /** Operating profit − non-operating expenses. Drawings never reduce profit. */
  profit: number
  /** Income − every expense, drawings included (the spreadsheet's "net profit"). */
  netCashFlow: number
  transactionCount: number
  incomeByMethod: Record<PaymentMethod, number>
  drawerExpense: number
  ownerExpense: number
  /** Part of `income` that comes from imported history (no payment method). */
  historicalIncome: number
  historicalDays: number
}

interface KindTotals {
  operating: number
  non_operating: number
  drawing: number
}

function addByKind(totals: KindTotals, kind: ExpenseKind, amount: number) {
  totals[kind] += amount
}

export function periodTotals(
  transactions: readonly Transaction[],
  expenses: readonly Expense[],
  range: DateRange,
  options: PeriodOptions = {},
): PeriodTotals {
  const kindOf = options.kindOf ?? allOperating
  const tx = transactions.filter((t) => paid(t) && isInRange(at(t.occurredAt), range))
  const ex = expenses.filter((e) => active(e) && isInRange(at(e.occurredAt), range))
  const history = historyIn(options.history, range)
  const byMethod = (method: PaymentMethod) =>
    sumRupiah(tx.filter((t) => t.paymentMethod === method).map((t) => t.total))

  const byKind: KindTotals = { operating: 0, non_operating: 0, drawing: 0 }
  for (const e of ex) addByKind(byKind, kindOf(e.categoryId), e.amount)
  for (const day of history) {
    for (const line of day.expenses) addByKind(byKind, kindOf(line.categoryId), line.amount)
  }

  const historicalIncome = sumRupiah(history.map((d) => d.income))
  const income = sumRupiah(tx.map((t) => t.total)) + historicalIncome
  const expense = byKind.operating + byKind.non_operating + byKind.drawing
  const operatingProfit = income - byKind.operating
  return {
    income,
    expense,
    operatingExpense: byKind.operating,
    nonOperatingExpense: byKind.non_operating,
    drawings: byKind.drawing,
    operatingProfit,
    profit: operatingProfit - byKind.non_operating,
    netCashFlow: income - expense,
    transactionCount: tx.length,
    incomeByMethod: {
      cash: byMethod('cash'),
      qris: byMethod('qris'),
      transfer: byMethod('transfer'),
    },
    drawerExpense: sumRupiah(ex.filter((e) => e.source === 'drawer').map((e) => e.amount)),
    ownerExpense: sumRupiah(ex.filter((e) => e.source === 'owner').map((e) => e.amount)),
    historicalIncome,
    historicalDays: history.length,
  }
}

/** Expected cash in the drawer: cash sales minus drawer expenses within `range`. */
export function drawerExpected(
  transactions: readonly Transaction[],
  expenses: readonly Expense[],
  range: DateRange,
): number {
  const totals = periodTotals(transactions, expenses, range)
  return totals.incomeByMethod.cash - totals.drawerExpense
}

const before = (iso: string, until?: Date) => !until || at(iso).getTime() < until.getTime()

/** Σ deposit − Σ withdraw, all time (optionally only movements before `until`). */
export function reserveBalance(movements: readonly ReserveMovement[], until?: Date): number {
  const relevant = movements.filter((m) => before(m.occurredAt, until))
  return (
    sumRupiah(relevant.filter((m) => m.type === 'deposit').map((m) => m.amount)) -
    sumRupiah(relevant.filter((m) => m.type === 'withdraw').map((m) => m.amount))
  )
}

export interface FreeCashInput {
  openingCash: number
  transactions: readonly Transaction[]
  expenses: readonly Expense[]
  reserveMovements: readonly ReserveMovement[]
  until?: Date
}

/**
 * Kas bebas = opening cash + Σ income − Σ expense − Σ deposit(source cash) + Σ withdraw.
 * Every expense kind counts, so drawings reduce free cash even though they never reduce
 * profit. Capital deposits are new owner money and never reduce free cash; reserve
 * movements never change profit. Imported history is excluded: opening cash stands for
 * the cash on hand when the business started using Kasiko.
 */
export function freeCash(input: FreeCashInput): number {
  const { openingCash, transactions, expenses, reserveMovements, until } = input
  const income = sumRupiah(
    transactions.filter((t) => paid(t) && before(t.occurredAt, until)).map((t) => t.total),
  )
  const expense = sumRupiah(
    expenses.filter((e) => active(e) && before(e.occurredAt, until)).map((e) => e.amount),
  )
  const moves = reserveMovements.filter((m) => before(m.occurredAt, until))
  const cashDeposits = sumRupiah(
    moves.filter((m) => m.type === 'deposit' && m.source === 'cash').map((m) => m.amount),
  )
  const withdrawals = sumRupiah(moves.filter((m) => m.type === 'withdraw').map((m) => m.amount))
  return openingCash + income - expense - cashDeposits + withdrawals
}

/** Relative change in percent, or `null` when there is no baseline to compare with. */
export function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return null
  return ((current - previous) / Math.abs(previous)) * 100
}

export interface DailyPoint {
  dayKey: string
  income: number
  expense: number
}

export function dailySeries(
  transactions: readonly Transaction[],
  expenses: readonly Expense[],
  dayKeys: readonly string[],
  timeZone: string,
  history?: readonly HistoricalDay[],
): DailyPoint[] {
  const points = new Map(dayKeys.map((dayKey) => [dayKey, { dayKey, income: 0, expense: 0 }]))
  for (const t of transactions) {
    if (!paid(t)) continue
    const point = points.get(businessDayKey(at(t.occurredAt), timeZone))
    if (point) point.income += t.total
  }
  for (const e of expenses) {
    if (!active(e)) continue
    const point = points.get(businessDayKey(at(e.occurredAt), timeZone))
    if (point) point.expense += e.amount
  }
  for (const day of history ?? []) {
    const point = points.get(day.dayKey)
    if (!point) continue
    point.income += day.income
    point.expense += sumRupiah(day.expenses.map((line) => line.amount))
  }
  return [...points.values()]
}

export interface ItemRanking {
  name: string
  qty: number
  revenue: number
}

export function topItems(
  transactions: readonly Transaction[],
  range: DateRange,
  limit = 5,
): ItemRanking[] {
  const byName = new Map<string, ItemRanking>()
  for (const t of transactions) {
    if (!paid(t) || !isInRange(at(t.occurredAt), range)) continue
    for (const item of t.items) {
      const entry = byName.get(item.nameSnapshot) ?? { name: item.nameSnapshot, qty: 0, revenue: 0 }
      entry.qty += item.qty
      entry.revenue += item.lineTotal
      byName.set(item.nameSnapshot, entry)
    }
  }
  return [...byName.values()].sort((a, b) => b.revenue - a.revenue).slice(0, limit)
}

export function expenseByCategory(
  expenses: readonly Expense[],
  range: DateRange,
  history?: HistoryInput,
): { categoryId: string; amount: number }[] {
  const totals = new Map<string, number>()
  const add = (categoryId: string, amount: number) =>
    totals.set(categoryId, (totals.get(categoryId) ?? 0) + amount)
  for (const e of expenses) {
    if (active(e) && isInRange(at(e.occurredAt), range)) add(e.categoryId, e.amount)
  }
  for (const day of historyIn(history, range)) {
    for (const line of day.expenses) add(line.categoryId, line.amount)
  }
  return [...totals.entries()]
    .map(([categoryId, amount]) => ({ categoryId, amount }))
    .sort((a, b) => b.amount - a.amount)
}

/** Transaction counts as `[weekday 0..6][hour 0..23]` in the business timezone. */
export function busyHours(
  transactions: readonly Transaction[],
  range: DateRange,
  timeZone: string,
): number[][] {
  const matrix = Array.from({ length: 7 }, () => Array<number>(24).fill(0))
  for (const t of transactions) {
    if (!paid(t) || !isInRange(at(t.occurredAt), range)) continue
    const { weekday, hour } = getZonedParts(at(t.occurredAt), timeZone)
    const row = matrix[weekday]
    if (row) row[hour] = (row[hour] ?? 0) + 1
  }
  return matrix
}

// --- Monthly views (Rekap bulanan & tren bulanan) -----------------------------------

/** `YYYY-MM` keys, oldest first, ending with the month of `lastDayKey`. */
export function monthKeysEnding(lastDayKey: string, count: number): string[] {
  const year = Number(lastDayKey.slice(0, 4))
  const month = Number(lastDayKey.slice(5, 7))
  return Array.from({ length: count }, (_, i) => {
    const offset = count - 1 - i
    const total = year * 12 + (month - 1) - offset
    return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`
  })
}

/** Every day key of a `YYYY-MM` month. */
export function daysOfMonth(monthKey: string): string[] {
  const keys: string[] = []
  for (let key = `${monthKey}-01`; key.startsWith(monthKey); key = shiftDayKey(key, 1)) {
    keys.push(key)
  }
  return keys
}

export interface LedgerInput {
  transactions: readonly Transaction[]
  expenses: readonly Expense[]
  history: readonly HistoricalDay[]
  timeZone: string
}

interface DayLedger {
  income: number
  byCategory: Map<string, number>
  hasHistory: boolean
  hasLive: boolean
}

/** Per-day income and expense-per-category for the given day keys, live + imported. */
function ledgerFor(input: LedgerInput, dayKeys: readonly string[]): Map<string, DayLedger> {
  const days = new Map<string, DayLedger>(
    dayKeys.map((key) => [
      key,
      { income: 0, byCategory: new Map(), hasHistory: false, hasLive: false },
    ]),
  )
  const addExpense = (day: DayLedger, categoryId: string, amount: number) =>
    day.byCategory.set(categoryId, (day.byCategory.get(categoryId) ?? 0) + amount)
  for (const t of input.transactions) {
    if (!paid(t)) continue
    const day = days.get(businessDayKey(at(t.occurredAt), input.timeZone))
    if (!day) continue
    day.income += t.total
    day.hasLive = true
  }
  for (const e of input.expenses) {
    if (!active(e)) continue
    const day = days.get(businessDayKey(at(e.occurredAt), input.timeZone))
    if (!day) continue
    addExpense(day, e.categoryId, e.amount)
    day.hasLive = true
  }
  for (const h of input.history) {
    const day = days.get(h.dayKey)
    if (!day) continue
    day.income += h.income
    for (const line of h.expenses) addExpense(day, line.categoryId, line.amount)
    day.hasHistory = true
  }
  return days
}

export interface MonthPoint {
  monthKey: string
  income: number
  operatingExpense: number
  nonOperatingExpense: number
  drawings: number
  operatingProfit: number
  profit: number
}

export function monthlySeries(
  input: LedgerInput,
  monthKeys: readonly string[],
  kindOf: KindOf,
): MonthPoint[] {
  const dayKeys = monthKeys.flatMap(daysOfMonth)
  const ledger = ledgerFor(input, dayKeys)
  return monthKeys.map((monthKey) => {
    const totals = { income: 0, operating: 0, non_operating: 0, drawing: 0 }
    for (const key of daysOfMonth(monthKey)) {
      const day = ledger.get(key)
      if (!day) continue
      totals.income += day.income
      for (const [categoryId, amount] of day.byCategory) totals[kindOf(categoryId)] += amount
    }
    const operatingProfit = totals.income - totals.operating
    return {
      monthKey,
      income: totals.income,
      operatingExpense: totals.operating,
      nonOperatingExpense: totals.non_operating,
      drawings: totals.drawing,
      operatingProfit,
      profit: operatingProfit - totals.non_operating,
    }
  })
}

export interface MonthlyMatrixRow {
  categoryId: string
  /** One value per day of the month. */
  values: number[]
  total: number
}

export interface MonthlyMatrix {
  dayKeys: string[]
  income: number[]
  rows: MonthlyMatrixRow[]
  /** Income − every expense, per day (the spreadsheet's "pendapatan harian"). */
  net: number[]
  /** Which days hold imported (spreadsheet) data. */
  imported: boolean[]
  totals: MonthSummary
}

export type MonthSummary = Pick<
  PeriodTotals,
  | 'income'
  | 'expense'
  | 'operatingExpense'
  | 'nonOperatingExpense'
  | 'drawings'
  | 'operatingProfit'
  | 'profit'
  | 'netCashFlow'
  | 'historicalDays'
>

/**
 * The spreadsheet layout the owner is used to: one column per day, one row per expense
 * category (in the given order), income on top and the daily net at the bottom.
 */
export function monthlyMatrix(
  input: LedgerInput,
  monthKey: string,
  categories: readonly Pick<ExpenseCategory, 'id' | 'kind'>[],
): MonthlyMatrix {
  const dayKeys = daysOfMonth(monthKey)
  const ledger = ledgerFor(input, dayKeys)
  const days = dayKeys.map((key) => ledger.get(key))
  const income = days.map((d) => d?.income ?? 0)
  const known = new Set(categories.map((c) => c.id))
  const used = new Set(days.flatMap((d) => [...(d?.byCategory.keys() ?? [])]))
  const order = [...categories.map((c) => c.id), ...[...used].filter((id) => !known.has(id)).sort()]
  const rows = order
    .map((categoryId) => {
      const values = days.map((d) => d?.byCategory.get(categoryId) ?? 0)
      return { categoryId, values, total: sumRupiah(values) }
    })
    .filter((row) => row.total > 0 || known.has(row.categoryId))
  const net = income.map((value, i) => value - sumRupiah(rows.map((row) => row.values[i] ?? 0)))
  const kindOf = kindLookup(categories)
  const byKind: KindTotals = { operating: 0, non_operating: 0, drawing: 0 }
  for (const row of rows) addByKind(byKind, kindOf(row.categoryId), row.total)
  const totalIncome = sumRupiah(income)
  const expense = byKind.operating + byKind.non_operating + byKind.drawing
  const operatingProfit = totalIncome - byKind.operating
  return {
    dayKeys,
    income,
    rows,
    net,
    imported: days.map((d) => d?.hasHistory ?? false),
    totals: {
      income: totalIncome,
      expense,
      operatingExpense: byKind.operating,
      nonOperatingExpense: byKind.non_operating,
      drawings: byKind.drawing,
      operatingProfit,
      profit: operatingProfit - byKind.non_operating,
      netCashFlow: totalIncome - expense,
      historicalDays: days.filter((d) => d?.hasHistory).length,
    },
  }
}
