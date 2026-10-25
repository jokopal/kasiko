import { describe, expect, it } from 'vitest'
import { dayKeyRange } from '@/lib/datetime'
import type { Expense, ReserveMovement, Transaction } from '@/lib/types'
import {
  busyHours,
  dailySeries,
  daysOfMonth,
  drawerExpected,
  expenseByCategory,
  freeCash,
  kindLookup,
  monthKeysEnding,
  monthlyMatrix,
  monthlySeries,
  percentChange,
  periodTotals,
  reserveBalance,
  topItems,
} from './finance'

const TZ = 'Asia/Jakarta'
const oct10 = dayKeyRange('2026-10-10', '2026-10-10', TZ)

function tx(
  partial: Partial<Transaction> & Pick<Transaction, 'total' | 'occurredAt'>,
): Transaction {
  return {
    id: crypto.randomUUID(),
    businessId: 'b',
    receiptNo: 'X',
    plateNumber: null,
    paymentMethod: 'cash',
    subtotal: partial.total,
    discountId: null,
    discountName: null,
    discountType: null,
    discountValue: null,
    discountAmount: 0,
    orderId: null,
    cashReceived: null,
    changeAmount: null,
    status: 'paid',
    voidReason: null,
    voidedAt: null,
    deviceId: 'd',
    receivedAt: null,
    items: [
      {
        id: crypto.randomUUID(),
        catalogItemId: null,
        nameSnapshot: 'Cuci',
        priceSnapshot: partial.total,
        qty: 1,
        lineTotal: partial.total,
      },
    ],
    ...partial,
  }
}

function ex(partial: Partial<Expense> & Pick<Expense, 'amount' | 'occurredAt'>): Expense {
  return {
    id: crypto.randomUUID(),
    businessId: 'b',
    categoryId: 'ops',
    note: '',
    source: 'drawer',
    status: 'active',
    voidReason: null,
    voidedAt: null,
    receivedAt: null,
    ...partial,
  }
}

function mv(partial: Partial<ReserveMovement> & Pick<ReserveMovement, 'type' | 'amount'>) {
  return {
    id: crypto.randomUUID(),
    businessId: 'b',
    source: null,
    reason: null,
    occurredAt: '2026-10-10T03:00:00Z',
    ...partial,
  } satisfies ReserveMovement
}

const transactions = [
  tx({ total: 35_000, occurredAt: '2026-10-10T01:00:00Z' }),
  tx({ total: 45_000, occurredAt: '2026-10-10T02:00:00Z', paymentMethod: 'qris' }),
  tx({ total: 50_000, occurredAt: '2026-10-10T03:00:00Z', status: 'void' }),
  tx({ total: 99_000, occurredAt: '2026-10-09T03:00:00Z' }), // previous day
]
const expenses = [
  ex({ amount: 10_000, occurredAt: '2026-10-10T04:00:00Z' }),
  ex({ amount: 500_000, occurredAt: '2026-10-10T05:00:00Z', source: 'owner' }),
  ex({ amount: 7_000, occurredAt: '2026-10-10T05:00:00Z', status: 'void' }),
]

describe('periodTotals', () => {
  it('counts only paid/active rows inside the range', () => {
    const totals = periodTotals(transactions, expenses, oct10)
    expect(totals.income).toBe(80_000)
    expect(totals.expense).toBe(510_000)
    expect(totals.profit).toBe(-430_000)
    expect(totals.transactionCount).toBe(2)
    expect(totals.incomeByMethod).toEqual({ cash: 35_000, qris: 45_000, transfer: 0 })
    expect(totals.drawerExpense).toBe(10_000)
    expect(totals.ownerExpense).toBe(500_000)
  })
})

describe('drawerExpected', () => {
  it('is cash sales minus drawer expenses; owner expenses do not touch the drawer', () => {
    expect(drawerExpected(transactions, expenses, oct10)).toBe(25_000)
  })
})

describe('reserve and free cash', () => {
  const movements = [
    mv({ type: 'deposit', amount: 200_000, source: 'cash' }),
    mv({ type: 'deposit', amount: 1_000_000, source: 'capital' }),
    mv({ type: 'withdraw', amount: 50_000, reason: 'Perbaikan mesin' }),
  ]

  it('computes the reserve balance', () => {
    expect(reserveBalance(movements)).toBe(1_150_000)
  })

  it('applies the kas bebas formula', () => {
    // 100k opening + 179k income − 510k expense − 200k cash deposit + 50k withdraw
    expect(
      freeCash({
        openingCash: 100_000,
        transactions,
        expenses,
        reserveMovements: movements,
      }),
    ).toBe(-381_000)
  })

  it('never lets reserve movements change profit', () => {
    const totals = periodTotals(transactions, expenses, oct10)
    expect(totals.profit).toBe(totals.income - totals.expense)
  })

  it('respects the cut-off', () => {
    expect(reserveBalance(movements, new Date('2026-10-10T00:00:00Z'))).toBe(0)
  })
})

describe('analysis helpers', () => {
  it('builds a daily series in the business timezone', () => {
    const series = dailySeries(transactions, expenses, ['2026-10-09', '2026-10-10'], TZ)
    expect(series).toEqual([
      { dayKey: '2026-10-09', income: 99_000, expense: 0 },
      { dayKey: '2026-10-10', income: 80_000, expense: 510_000 },
    ])
  })

  it('ranks items by revenue', () => {
    expect(topItems(transactions, oct10)).toEqual([{ name: 'Cuci', qty: 2, revenue: 80_000 }])
  })

  it('places transactions on the weekday × hour grid', () => {
    const grid = busyHours(transactions, oct10, TZ)
    // 2026-10-10 is a Saturday; 01:00Z = 08:00 WIB
    expect(grid[6]?.[8]).toBe(1)
    expect(grid[6]?.[9]).toBe(1)
  })

  it('computes percent change', () => {
    expect(percentChange(150, 100)).toBe(50)
    expect(percentChange(50, 0)).toBeNull()
  })
})

describe('profit tiers (decision #24)', () => {
  const kindOf = kindLookup([
    { id: 'ops', kind: 'operating' },
    { id: 'loan', kind: 'non_operating' },
    { id: 'prive', kind: 'drawing' },
  ])
  const sales = [tx({ total: 1_000_000, occurredAt: '2026-10-10T03:00:00Z' })]
  const spend = [
    ex({ amount: 400_000, occurredAt: '2026-10-10T04:00:00Z', categoryId: 'ops' }),
    ex({ amount: 300_000, occurredAt: '2026-10-10T04:00:00Z', categoryId: 'loan' }),
    ex({ amount: 200_000, occurredAt: '2026-10-10T04:00:00Z', categoryId: 'prive' }),
  ]

  it('separates operating, net profit, drawings and net cash flow', () => {
    const totals = periodTotals(sales, spend, oct10, { kindOf })
    expect(totals.operatingExpense).toBe(400_000)
    expect(totals.nonOperatingExpense).toBe(300_000)
    expect(totals.drawings).toBe(200_000)
    expect(totals.operatingProfit).toBe(600_000)
    expect(totals.profit).toBe(300_000) // drawings never reduce profit
    expect(totals.netCashFlow).toBe(100_000) // the spreadsheet's "net profit"
    expect(totals.expense).toBe(900_000)
  })

  it('still lets drawings reduce free cash', () => {
    expect(
      freeCash({ openingCash: 0, transactions: sales, expenses: spend, reserveMovements: [] }),
    ).toBe(100_000)
  })

  it('treats unknown categories as operating', () => {
    expect(kindOf('missing')).toBe('operating')
  })
})

describe('imported history (decision #27)', () => {
  const history = {
    timeZone: TZ,
    days: [
      {
        businessId: 'b',
        dayKey: '2026-10-10',
        income: 2_000_000,
        expenses: [{ categoryId: 'ops', amount: 700_000 }],
        importedAt: '2026-10-19T00:00:00Z',
      },
      {
        businessId: 'b',
        dayKey: '2026-09-30',
        income: 1_500_000,
        expenses: [],
        importedAt: '2026-10-19T00:00:00Z',
      },
    ],
  }

  it('adds imported days that fall inside the period', () => {
    const totals = periodTotals(transactions, expenses, oct10, { history })
    expect(totals.income).toBe(2_080_000)
    expect(totals.historicalIncome).toBe(2_000_000)
    expect(totals.historicalDays).toBe(1)
    expect(totals.expense).toBe(1_210_000)
    // Unknown payment method: imported income never shows up per method.
    expect(totals.incomeByMethod.cash + totals.incomeByMethod.qris).toBe(80_000)
  })

  it('feeds the daily series and expense mix', () => {
    const series = dailySeries(transactions, expenses, ['2026-10-10'], TZ, history.days)
    expect(series[0]).toEqual({ dayKey: '2026-10-10', income: 2_080_000, expense: 1_210_000 })
    expect(expenseByCategory(expenses, oct10, history)[0]).toEqual({
      categoryId: 'ops',
      amount: 1_210_000,
    })
  })
})

describe('monthly views', () => {
  it('lists month keys across a year boundary', () => {
    expect(monthKeysEnding('2026-02-15', 3)).toEqual(['2025-12', '2026-01', '2026-02'])
    expect(daysOfMonth('2028-02')).toHaveLength(29)
  })

  const ledger = {
    transactions,
    expenses,
    timeZone: TZ,
    history: [
      {
        businessId: 'b',
        dayKey: '2026-10-01',
        income: 1_000_000,
        expenses: [{ categoryId: 'prive', amount: 100_000 }],
        importedAt: '2026-10-19T00:00:00Z',
      },
    ],
  }
  const categories = [
    { id: 'ops', kind: 'operating' as const },
    { id: 'prive', kind: 'drawing' as const },
  ]

  it('builds the spreadsheet matrix with daily net and month totals', () => {
    const m = monthlyMatrix(ledger, '2026-10', categories)
    expect(m.dayKeys).toHaveLength(31)
    expect(m.income[0]).toBe(1_000_000)
    expect(m.income[8]).toBe(99_000) // 9 Oct counts in October too
    expect(m.income[9]).toBe(80_000)
    expect(m.rows.map((r) => [r.categoryId, r.total])).toEqual([
      ['ops', 510_000],
      ['prive', 100_000],
    ])
    expect(m.net[0]).toBe(900_000)
    expect(m.net[9]).toBe(-430_000)
    expect(m.imported[0]).toBe(true)
    expect(m.imported[9]).toBe(false)
    expect(m.totals.income).toBe(1_179_000)
    expect(m.totals.profit).toBe(1_179_000 - 510_000)
    expect(m.totals.netCashFlow).toBe(1_179_000 - 610_000)
  })

  it('summarizes months for the trend chart', () => {
    const [sep, oct] = monthlySeries(ledger, ['2026-09', '2026-10'], kindLookup(categories))
    expect(sep?.income).toBe(0)
    expect(oct).toMatchObject({ income: 1_179_000, drawings: 100_000, profit: 669_000 })
  })
})
