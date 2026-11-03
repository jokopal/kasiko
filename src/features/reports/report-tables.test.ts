import { describe, expect, it } from 'vitest'
import type { Expense, Transaction } from '@/lib/types'
import type { PeriodTotals } from './finance'
import { pdfText, sheetRows } from './report-export'
import { buildReport, dayLabel, periodLabel, type ReportTable } from './report-tables'
import { flowSummary } from './summary'

const totals = (patch: Partial<PeriodTotals>) =>
  ({
    income: 0,
    expense: 0,
    drawerExpense: 0,
    ownerExpense: 0,
    ...patch,
  }) as PeriodTotals

const report = buildReport({
  summary: flowSummary(
    totals({ income: 400_000, expense: 480_000, drawerExpense: 30_000 }),
    totals({ income: 1_000_000, expense: 1_100_000 }),
  ),
  categories: [{ id: 'gaji', name: 'Gaji Harian', kind: 'operating' }],
  input: {
    timeZone: 'Asia/Jakarta',
    transactions: [
      {
        receiptNo: 'SMR-261002-A0001',
        occurredAt: '2026-10-02T02:00:00Z',
        plateNumber: 'B 1 AB',
        paymentMethod: 'qris',
        total: 100_000,
        status: 'paid',
        items: [{ nameSnapshot: 'Cuci', qty: 1 }],
      } as unknown as Transaction,
    ],
    expenses: [
      {
        occurredAt: '2026-10-02T05:00:00Z',
        amount: 30_000,
        source: 'drawer',
        categoryId: 'gaji',
        note: 'Upah Budi',
        status: 'active',
      } as unknown as Expense,
    ],
    historyIncome: [{ dayKey: '2026-10-01', income: 300_000 }],
    historyExpenses: [{ dayKey: '2026-10-01', categoryId: 'gaji', amount: 450_000 }],
  },
})

const table = (id: string) => report.find((t) => t.id === id) as ReportTable

describe('the Laporan tables', () => {
  it('has the five tabs, in order', () => {
    expect(report.map((t) => t.name)).toEqual([
      'Ringkasan',
      'Harian',
      'Pemasukan',
      'Pengeluaran',
      'Per Kategori',
    ])
  })

  it('summarizes before, period and cumulative, with every door', () => {
    expect(table('ringkasan').rows).toEqual([
      ['Pemasukan', 1_000_000, 400_000, 1_400_000],
      ['Pengeluaran', 1_100_000, 480_000, 1_580_000],
      ['   dari Kasir', 0, 30_000, 30_000],
      ['   dari Owner', 0, 0, 0],
      ['   dari Data impor', 1_100_000, 450_000, 1_550_000],
      ['Profit', -100_000, -80_000, -180_000],
    ])
  })

  it('ends the daily table on the cumulative profit of the summary', () => {
    const daily = table('harian')
    expect(daily.rows).toEqual([
      ['1 Okt 2026', 300_000, 0, 0, 450_000, 450_000, -150_000, -250_000],
      ['2 Okt 2026', 100_000, 30_000, 0, 0, 30_000, 70_000, -180_000],
    ])
    expect(daily.footer?.at(-1)).toBe(-180_000)
  })

  it('lists sales with time and method, imported days without', () => {
    expect(table('pemasukan').rows).toEqual([
      ['1 Okt 2026', null, null, null, 'Pendapatan harian (impor Excel)', null, 300_000],
      ['2 Okt 2026', '09.00', 'SMR-261002-A0001', 'B 1 AB', 'Cuci', 'QRIS', 100_000],
    ])
  })

  it('names the category, kind and door of every expense', () => {
    expect(table('pengeluaran').rows[1]).toEqual([
      '2 Okt 2026',
      '12.00',
      'Gaji Harian',
      'Operasional',
      'Kasir',
      'Upah Budi',
      30_000,
    ])
    expect(table('kategori').rows).toEqual([
      ['Gaji Harian', 'Operasional', 30_000, 0, 450_000, 480_000, '100%'],
    ])
  })
})

describe('exports', () => {
  const meta = { businessName: 'Saimara', period: '1 Okt 2026 – 2 Okt 2026', createdAt: 'x' }

  it('puts a heading, the header, the rows and the total on each sheet', () => {
    const rows = sheetRows(table('kategori'), meta)
    expect(rows[0]).toEqual(['Saimara — Pengeluaran per kategori'])
    expect(rows[3]?.[0]).toBe('Kategori')
    expect(rows[4]?.[5]).toBe(480_000)
    expect(rows[5]?.[0]).toBe('Total')
  })

  it('writes PDF cells in grouped digits and plain signs', () => {
    expect(pdfText(-1_250_000, true)).toBe('-1.250.000')
    expect(pdfText('Pemasukan − pengeluaran', false)).toBe('Pemasukan - pengeluaran')
    expect(pdfText(null, true)).toBe('')
  })

  it('labels days and periods in Indonesian', () => {
    expect(dayLabel('2026-10-02')).toBe('2 Okt 2026')
    expect(periodLabel('2026-10-01', '2026-10-01')).toBe('1 Okt 2026')
    expect(periodLabel('2026-10-01', '2026-10-31')).toBe('1 Okt 2026 – 31 Okt 2026')
  })
})
