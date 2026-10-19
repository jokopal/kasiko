import { describe, expect, it } from 'vitest'
import { monthlyMatrix } from '@/features/reports/finance'
import { monthSheetRows, sheetNameFor } from '@/features/reports/monthly-export'
import {
  cellAmount,
  monthKeyFromSheetName,
  parseCashflowWorkbook,
  planImport,
  SKIP_LABEL,
  type SheetRows,
} from './cashflow-import'

// Synthetic workbook in the monthly cash-flow layout. It reproduces the quirks found in
// the audit (skipped day in the header, a stray "\" cell, a non-month sheet) without
// carrying any real business figures.
const january: SheetRows = {
  name: 'JAN-25',
  rows: [
    ['JANUARI', null, 1, 2, 3, 4],
    ['Pendapatan', null, 1_000_000, 2_000_000, null, 1_500_000],
    ['Pengeluaran', 'Gaji', 350_000, 700_000, null, 525_000],
    [null, 'Makan  anggota', 90_000, null, null, '\\'],
    [null, 'GAJI', null, 10_000],
    [null, null],
    [null, 'Pendapatan Harian', '=C2-(sum(C3:C31))'],
    [null, 'Omset', 4_500_000],
    [null, null, '* Notes : catatan bebas'],
  ],
}
const august: SheetRows = {
  name: 'AGUS-26',
  rows: [
    ['AGUSTUS', null, 17, 19, null],
    ['Pendapatan', null, 800_000, 900_000, 50_000],
    ['Pengeluaran', 'Listrik', 'Rp 200.000', null],
  ],
}

describe('sheet names', () => {
  it('reads Indonesian month names and two- or four-digit years', () => {
    expect(monthKeyFromSheetName('JAN-25')).toBe('2025-01')
    expect(monthKeyFromSheetName('MARET 26')).toBe('2026-03')
    expect(monthKeyFromSheetName('AGUS-26')).toBe('2026-08')
    expect(monthKeyFromSheetName('Desember 2026')).toBe('2026-12')
    expect(monthKeyFromSheetName('Ringkasan')).toBeNull()
  })

  it('writes names the reader understands', () => {
    for (const key of ['2025-01', '2025-08', '2026-12']) {
      expect(monthKeyFromSheetName(sheetNameFor(key))).toBe(key)
    }
  })
})

describe('cellAmount', () => {
  it('accepts numbers and Indonesian-formatted text', () => {
    expect(cellAmount(150_000)).toBe(150_000)
    expect(cellAmount('150.000')).toBe(150_000)
    expect(cellAmount('Rp 1.500.000')).toBe(1_500_000)
    expect(cellAmount('\\')).toBeNull()
    expect(cellAmount(null)).toBeNull()
  })
})

describe('parseCashflowWorkbook', () => {
  const parsed = parseCashflowWorkbook([january, august, { name: 'Ringkasan', rows: [] }])

  it('reads one month per sheet, sorted', () => {
    expect(parsed.months.map((m) => m.monthKey)).toEqual(['2025-01', '2026-08'])
    expect(parsed.skippedSheets).toEqual(['Ringkasan'])
  })

  it('takes income and expense lines per day, stopping at the summary rows', () => {
    const [d1, d2, d4] = parsed.months[0]?.days ?? []
    expect(d1).toEqual({
      dayKey: '2025-01-01',
      income: 1_000_000,
      lines: [
        { label: 'Gaji', amount: 350_000 },
        { label: 'Makan anggota', amount: 90_000 },
      ],
    })
    expect(d2?.lines).toContainEqual({ label: 'GAJI', amount: 10_000 })
    expect(d4?.dayKey).toBe('2025-01-04')
  })

  it('maps columns by the day in the header, so a skipped date never shifts data', () => {
    const days = parsed.months[1]?.days.map((d) => [d.dayKey, d.income])
    expect(days).toEqual([
      ['2026-08-17', 800_000],
      ['2026-08-19', 900_000],
    ])
  })

  it('reports what it could not read instead of guessing', () => {
    expect(parsed.warnings.some((w) => w.includes('"\\" bukan angka'))).toBe(true)
    expect(parsed.warnings.some((w) => w.includes('kolom tanpa tanggal'))).toBe(true)
  })

  it('groups labels case- and space-insensitively for mapping', () => {
    const gaji = parsed.labels.find((l) => l.key === 'gaji')
    expect(gaji).toMatchObject({ display: 'Gaji', total: 1_585_000, entries: 4 })
    expect(parsed.labels.map((l) => l.key)).toContain('makan anggota')
  })
})

describe('planImport', () => {
  const parsed = parseCashflowWorkbook([january])
  const mapping = { gaji: 'cat-gaji', 'makan anggota': 'cat-makan' }

  it('builds historical days with expenses summed per category', () => {
    const plan = planImport(parsed, mapping, {
      businessId: 'b',
      liveDayKeys: new Set(),
      now: new Date('2026-10-19T00:00:00Z'),
    })
    expect(plan.days).toHaveLength(3)
    expect(plan.days[1]).toMatchObject({
      dayKey: '2025-01-02',
      income: 2_000_000,
      expenses: [{ categoryId: 'cat-gaji', amount: 710_000 }],
    })
    expect(plan.income).toBe(4_500_000)
  })

  it('skips days that already have live data', () => {
    const plan = planImport(parsed, mapping, {
      businessId: 'b',
      liveDayKeys: new Set(['2025-01-01']),
      now: new Date(),
    })
    expect(plan.skippedDayKeys).toEqual(['2025-01-01'])
    expect(plan.days.map((d) => d.dayKey)).toEqual(['2025-01-02', '2025-01-04'])
  })

  it('leaves out labels the owner chose not to import', () => {
    const plan = planImport(
      parsed,
      { gaji: 'cat-gaji', 'makan anggota': SKIP_LABEL },
      { businessId: 'b', liveDayKeys: new Set(), now: new Date() },
    )
    expect(plan.skippedExpense).toBe(90_000)
    expect(plan.days[0]?.expenses).toEqual([{ categoryId: 'cat-gaji', amount: 350_000 }])
  })

  it('refuses to import an unmapped label', () => {
    expect(() =>
      planImport(
        parsed,
        { gaji: 'cat-gaji' },
        {
          businessId: 'b',
          liveDayKeys: new Set(),
          now: new Date(),
        },
      ),
    ).toThrow(/Makan/)
  })
})

describe('export → import round trip', () => {
  it('reads back exactly what the monthly export wrote', () => {
    const plan = planImport(
      parseCashflowWorkbook([january]),
      { gaji: 'cat-gaji', 'makan anggota': 'cat-makan' },
      { businessId: 'b', liveDayKeys: new Set(), now: new Date() },
    )
    const categories = [
      { id: 'cat-gaji', kind: 'operating' as const },
      { id: 'cat-makan', kind: 'operating' as const },
    ]
    const ledger = { transactions: [], expenses: [], history: plan.days, timeZone: 'Asia/Jakarta' }
    const matrix = monthlyMatrix(ledger, '2025-01', categories)
    const names: Record<string, string> = { 'cat-gaji': 'Gaji', 'cat-makan': 'Makan anggota' }
    const rows = monthSheetRows(matrix, '2025-01', (id) => names[id] ?? id)

    const again = parseCashflowWorkbook([{ name: sheetNameFor('2025-01'), rows }])
    expect(again.warnings).toEqual([])
    const replay = planImport(
      again,
      { gaji: 'cat-gaji', 'makan anggota': 'cat-makan' },
      {
        businessId: 'b',
        liveDayKeys: new Set(),
        now: new Date(),
      },
    )
    expect(replay.income).toBe(plan.income)
    expect(replay.expense).toBe(plan.expense)
    expect(replay.days.map((d) => d.dayKey)).toEqual(plan.days.map((d) => d.dayKey))
  })
})
