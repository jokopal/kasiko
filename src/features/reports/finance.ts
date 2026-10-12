import { businessDayKey, getZonedParts, isInRange, type DateRange } from '@/lib/datetime'
import { sumRupiah } from '@/lib/money'
import type { Expense, PaymentMethod, ReserveMovement, Transaction } from '@/lib/types'

// Financial formulas from AGENTS.md section 4. In production these run as SQL
// functions (milestone 7/8); this module is the reference implementation the SQL
// is tested against, and powers the preview until the database exists.

const paid = (t: Transaction) => t.status === 'paid'
const active = (e: Expense) => e.status === 'active'
const at = (iso: string) => new Date(iso)

export interface PeriodTotals {
  income: number
  expense: number
  profit: number
  transactionCount: number
  incomeByMethod: Record<PaymentMethod, number>
  drawerExpense: number
  ownerExpense: number
}

export function periodTotals(
  transactions: readonly Transaction[],
  expenses: readonly Expense[],
  range: DateRange,
): PeriodTotals {
  const tx = transactions.filter((t) => paid(t) && isInRange(at(t.occurredAt), range))
  const ex = expenses.filter((e) => active(e) && isInRange(at(e.occurredAt), range))
  const byMethod = (method: PaymentMethod) =>
    sumRupiah(tx.filter((t) => t.paymentMethod === method).map((t) => t.total))
  const income = sumRupiah(tx.map((t) => t.total))
  const expense = sumRupiah(ex.map((e) => e.amount))
  return {
    income,
    expense,
    profit: income - expense,
    transactionCount: tx.length,
    incomeByMethod: {
      cash: byMethod('cash'),
      qris: byMethod('qris'),
      transfer: byMethod('transfer'),
    },
    drawerExpense: sumRupiah(ex.filter((e) => e.source === 'drawer').map((e) => e.amount)),
    ownerExpense: sumRupiah(ex.filter((e) => e.source === 'owner').map((e) => e.amount)),
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
 * Capital deposits are new owner money and never reduce free cash; reserve movements
 * never change profit.
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
): { categoryId: string; amount: number }[] {
  const totals = new Map<string, number>()
  for (const e of expenses) {
    if (!active(e) || !isInRange(at(e.occurredAt), range)) continue
    totals.set(e.categoryId, (totals.get(e.categoryId) ?? 0) + e.amount)
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
