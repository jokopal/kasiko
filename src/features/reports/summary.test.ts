import { describe, expect, it } from 'vitest'
import type { Expense, Transaction } from '@/lib/types'
import type { PeriodTotals } from './finance'
import {
  categoryRows,
  dayRows,
  expenseRows,
  flowSummary,
  incomeRows,
  type ReportInput,
} from './summary'

const totals = (patch: Partial<PeriodTotals>): PeriodTotals => ({
  income: 0,
  expense: 0,
  operatingExpense: 0,
  nonOperatingExpense: 0,
  drawings: 0,
  operatingProfit: 0,
  profit: 0,
  netCashFlow: 0,
  transactionCount: 0,
  incomeByMethod: { cash: 0, qris: 0, transfer: 0 },
  drawerExpense: 0,
  ownerExpense: 0,
  historicalIncome: 0,
  historicalDays: 0,
  discountTotal: 0,
  ...patch,
})

describe('flowSummary', () => {
  it('adds the period to everything before it (the owner’s example)', () => {
    const summary = flowSummary(
      totals({ income: 500_000, expense: 300_000, drawerExpense: 100_000, ownerExpense: 200_000 }),
      totals({ income: 400_000, expense: 500_000 }),
    )
    expect(summary.profit).toEqual({ period: 200_000, before: -100_000, cumulative: 100_000 })
    expect(summary.income).toEqual({ period: 500_000, before: 400_000, cumulative: 900_000 })
    expect(summary.expense.cumulative).toBe(800_000)
  })

  it('counts every expense kind, prive included, against profit', () => {
    const summary = flowSummary(
      totals({ income: 1_000_000, expense: 600_000, drawings: 400_000, profit: 800_000 }),
      totals({}),
    )
    expect(summary.profit.period).toBe(400_000)
  })

  it('splits the period’s expenses by door; imported is what the doors do not explain', () => {
    const summary = flowSummary(
      totals({ expense: 1_000, drawerExpense: 300, ownerExpense: 200 }),
      totals({ expense: 50, ownerExpense: 50 }),
    )
    expect(summary.expense.doors).toEqual({
      drawer: { period: 300, before: 0, cumulative: 300 },
      owner: { period: 200, before: 50, cumulative: 250 },
      imported: { period: 500, before: 0, cumulative: 500 },
    })
  })
})

const tz = 'Asia/Jakarta'

const sale = (id: string, occurredAt: string, total: number, status: 'paid' | 'void' = 'paid') =>
  ({
    id,
    receiptNo: `SMR-${id}`,
    occurredAt,
    plateNumber: null,
    paymentMethod: 'cash',
    total,
    status,
    items: [{ nameSnapshot: 'Cuci', qty: 2 }],
  }) as unknown as Transaction

const spend = (
  occurredAt: string,
  amount: number,
  source: 'drawer' | 'owner',
  categoryId = 'gaji',
  status: 'active' | 'void' = 'active',
) => ({ occurredAt, amount, source, categoryId, note: '', status }) as unknown as Expense

const input: ReportInput = {
  timeZone: tz,
  transactions: [
    sale('a', '2026-10-02T02:00:00Z', 100_000),
    sale('b', '2026-10-02T03:00:00Z', 50_000, 'void'),
    // 23:30 WIB on 2 Oct is still 2 Oct in the business timezone.
    sale('c', '2026-10-02T16:30:00Z', 20_000),
  ],
  expenses: [
    spend('2026-10-02T05:00:00Z', 30_000, 'drawer'),
    spend('2026-10-02T06:00:00Z', 10_000, 'owner', 'listrik'),
    spend('2026-10-02T07:00:00Z', 99_000, 'owner', 'listrik', 'void'),
  ],
  historyIncome: [{ dayKey: '2026-10-01', income: 300_000 }],
  historyExpenses: [
    { dayKey: '2026-10-01', categoryId: 'gaji', amount: 400_000 },
    { dayKey: '2026-10-01', categoryId: 'listrik', amount: 50_000 },
  ],
}

describe('report tables', () => {
  it('lists paid sales and imported days as income, oldest first', () => {
    const rows = incomeRows(input)
    expect(rows.map((r) => [r.dayKey, r.total])).toEqual([
      ['2026-10-01', 300_000],
      ['2026-10-02', 100_000],
      ['2026-10-02', 20_000],
    ])
    expect(rows[1]?.description).toBe('Cuci x2')
    expect(rows[0]?.method).toBeNull()
  })

  it('lists active expenses with their door', () => {
    expect(expenseRows(input).map((r) => [r.dayKey, r.door, r.amount])).toEqual([
      ['2026-10-01', 'imported', 400_000],
      ['2026-10-01', 'imported', 50_000],
      ['2026-10-02', 'drawer', 30_000],
      ['2026-10-02', 'owner', 10_000],
    ])
  })

  it('carries the running profit from before the period through each day', () => {
    expect(dayRows(input, -100_000)).toEqual([
      {
        dayKey: '2026-10-01',
        income: 300_000,
        doors: { drawer: 0, owner: 0, imported: 450_000 },
        expense: 450_000,
        profit: -150_000,
        cumulativeProfit: -250_000,
      },
      {
        dayKey: '2026-10-02',
        income: 120_000,
        doors: { drawer: 30_000, owner: 10_000, imported: 0 },
        expense: 40_000,
        profit: 80_000,
        cumulativeProfit: -170_000,
      },
    ])
  })

  it('totals each category by door, largest first', () => {
    expect(categoryRows(input)).toEqual([
      {
        categoryId: 'gaji',
        doors: { drawer: 30_000, owner: 0, imported: 400_000 },
        total: 430_000,
      },
      {
        categoryId: 'listrik',
        doors: { drawer: 0, owner: 10_000, imported: 50_000 },
        total: 60_000,
      },
    ])
  })
})
