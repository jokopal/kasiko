import { businessDayKey } from '@/lib/datetime'
import { sumRupiah } from '@/lib/money'
import type { Expense, PaymentMethod, Transaction } from '@/lib/types'
import type { PeriodTotals } from './finance'

// The owner's summary (decision #40): three flows — income, expenses (by door), profit —
// each for the period, everything before it, and cumulative since the first record.
// Profit = income − every expense. Imported spreadsheet days count (decision #27 keeps
// them out of cash, not out of income and expenses).

/** Where an expense came from: the cashier's drawer, the owner, or an imported sheet. */
export type ExpenseDoor = 'drawer' | 'owner' | 'imported'

export const EXPENSE_DOOR_LABEL: Record<ExpenseDoor, string> = {
  drawer: 'Kasir',
  owner: 'Owner',
  imported: 'Data impor',
}

export interface Flow {
  period: number
  before: number
  cumulative: number
}

export interface ExpenseFlow extends Flow {
  doors: Record<ExpenseDoor, Flow>
}

export interface FlowSummary {
  income: Flow
  expense: ExpenseFlow
  profit: Flow
}

/** Imported expenses carry no door; they are whatever the live doors do not explain. */
export const importedExpense = (
  t: Pick<PeriodTotals, 'expense' | 'drawerExpense' | 'ownerExpense'>,
) => t.expense - t.drawerExpense - t.ownerExpense

const flow = (period: number, before: number): Flow => ({
  period,
  before,
  cumulative: before + period,
})

/** `before` = totals from the first record up to the period's start. */
export function flowSummary(current: PeriodTotals, before: PeriodTotals): FlowSummary {
  return {
    income: flow(current.income, before.income),
    expense: {
      ...flow(current.expense, before.expense),
      doors: {
        drawer: flow(current.drawerExpense, before.drawerExpense),
        owner: flow(current.ownerExpense, before.ownerExpense),
        imported: flow(importedExpense(current), importedExpense(before)),
      },
    },
    profit: flow(current.income - current.expense, before.income - before.expense),
  }
}

// --- The full report (Laporan) ----------------------------------------------------------

export interface HistoricalLine {
  dayKey: string
  categoryId: string
  amount: number
}

export interface ReportInput {
  transactions: readonly Transaction[]
  expenses: readonly Expense[]
  /** Imported income per day. */
  historyIncome: readonly { dayKey: string; income: number }[]
  historyExpenses: readonly HistoricalLine[]
  timeZone: string
}

export interface IncomeRow {
  dayKey: string
  /** Null for an imported day, which has no time. */
  occurredAt: string | null
  receiptNo: string | null
  plateNumber: string | null
  description: string
  method: PaymentMethod | null
  total: number
}

export interface ExpenseRow {
  dayKey: string
  occurredAt: string | null
  categoryId: string
  door: ExpenseDoor
  note: string
  amount: number
}

export interface DayRow {
  dayKey: string
  income: number
  doors: Record<ExpenseDoor, number>
  expense: number
  profit: number
  /** Profit from the first record up to and including this day. */
  cumulativeProfit: number
}

export interface CategoryRow {
  categoryId: string
  doors: Record<ExpenseDoor, number>
  total: number
}

const byTime = (a: { dayKey: string; occurredAt: string | null }, b: typeof a) =>
  a.dayKey.localeCompare(b.dayKey) || (a.occurredAt ?? '').localeCompare(b.occurredAt ?? '')

const itemsText = (t: Transaction) =>
  t.items.map((i) => (i.qty > 1 ? `${i.nameSnapshot} x${i.qty}` : i.nameSnapshot)).join(', ')

/** Paid sales and imported daily income, oldest first. */
export function incomeRows(input: ReportInput): IncomeRow[] {
  const live: IncomeRow[] = input.transactions
    .filter((t) => t.status === 'paid')
    .map((t) => ({
      dayKey: businessDayKey(new Date(t.occurredAt), input.timeZone),
      occurredAt: t.occurredAt,
      receiptNo: t.receiptNo,
      plateNumber: t.plateNumber,
      description: itemsText(t),
      method: t.paymentMethod,
      total: t.total,
    }))
  const imported: IncomeRow[] = input.historyIncome
    .filter((d) => d.income !== 0)
    .map((d) => ({
      dayKey: d.dayKey,
      occurredAt: null,
      receiptNo: null,
      plateNumber: null,
      description: 'Pendapatan harian (impor Excel)',
      method: null,
      total: d.income,
    }))
  return [...live, ...imported].sort(byTime)
}

/** Active expenses from both doors and imported lines, oldest first. */
export function expenseRows(input: ReportInput): ExpenseRow[] {
  const live: ExpenseRow[] = input.expenses
    .filter((e) => e.status === 'active')
    .map((e) => ({
      dayKey: businessDayKey(new Date(e.occurredAt), input.timeZone),
      occurredAt: e.occurredAt,
      categoryId: e.categoryId,
      door: e.source,
      note: e.note,
      amount: e.amount,
    }))
  const imported: ExpenseRow[] = input.historyExpenses.map((line) => ({
    dayKey: line.dayKey,
    occurredAt: null,
    categoryId: line.categoryId,
    door: 'imported',
    note: '',
    amount: line.amount,
  }))
  return [...live, ...imported].sort(byTime)
}

const noDoors = (): Record<ExpenseDoor, number> => ({ drawer: 0, owner: 0, imported: 0 })

/** One row per day with any activity, oldest first, with the running profit. */
export function dayRows(input: ReportInput, profitBefore: number): DayRow[] {
  const days = new Map<string, { income: number; doors: Record<ExpenseDoor, number> }>()
  const day = (key: string) => {
    let entry = days.get(key)
    if (!entry) {
      entry = { income: 0, doors: noDoors() }
      days.set(key, entry)
    }
    return entry
  }
  for (const row of incomeRows(input)) day(row.dayKey).income += row.total
  for (const row of expenseRows(input)) day(row.dayKey).doors[row.door] += row.amount
  let running = profitBefore
  return [...days.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([dayKey, { income, doors }]) => {
      const expense = doors.drawer + doors.owner + doors.imported
      const profit = income - expense
      running += profit
      return { dayKey, income, doors, expense, profit, cumulativeProfit: running }
    })
}

/** Expense per category split by door, largest first. */
export function categoryRows(input: ReportInput): CategoryRow[] {
  const rows = new Map<string, CategoryRow>()
  for (const e of expenseRows(input)) {
    const row = rows.get(e.categoryId) ?? { categoryId: e.categoryId, doors: noDoors(), total: 0 }
    row.doors[e.door] += e.amount
    row.total += e.amount
    rows.set(e.categoryId, row)
  }
  return [...rows.values()].sort((a, b) => b.total - a.total)
}

/** Sums one numeric field of a list of rows. */
export const totalOf = <T>(rows: readonly T[], value: (row: T) => number) =>
  sumRupiah(rows.map(value))
