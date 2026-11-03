import type { Cell } from '@/features/history/cashflow-import'
import { formatTime } from '@/lib/datetime'
import { sumRupiah } from '@/lib/money'
import { EXPENSE_KIND_LABEL, PAYMENT_METHOD_LABEL, type ExpenseCategory } from '@/lib/types'
import {
  categoryRows,
  dayRows,
  EXPENSE_DOOR_LABEL,
  expenseRows,
  incomeRows,
  type ExpenseDoor,
  type FlowSummary,
  type ReportInput,
} from './summary'

// One description of every Laporan tab (decision #41). The page, the Excel workbook and
// the PDF all render these same tables, so the three can never disagree.

export type ReportTabId = 'ringkasan' | 'harian' | 'pemasukan' | 'pengeluaran' | 'kategori'

export interface ReportColumn {
  label: string
  /** Rupiah amounts: right-aligned, grouped digits on screen and in the PDF. */
  money?: boolean
  /** Narrow column, used for the PDF and the spreadsheet width. */
  width?: number
}

export interface ReportTable {
  id: ReportTabId
  /** Tab label and sheet name. */
  name: string
  title: string
  columns: ReportColumn[]
  rows: Cell[][]
  /** Bold rows marking group totals inside `rows` (by index). */
  emphasis?: number[]
  footer?: Cell[]
  note?: string
}

export interface ReportContext {
  summary: FlowSummary
  input: ReportInput
  categories: readonly Pick<ExpenseCategory, 'id' | 'name' | 'kind'>[]
}

const DOORS: ExpenseDoor[] = ['drawer', 'owner', 'imported']

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']

/** `"2026-10-02"` → `"2 Okt 2026"`. */
export function dayLabel(dayKey: string): string {
  const month = MONTHS[Number(dayKey.slice(5, 7)) - 1] ?? ''
  return `${Number(dayKey.slice(8, 10))} ${month} ${dayKey.slice(0, 4)}`
}

/** `"1 Okt 2026 – 31 Okt 2026"`, or a single day. */
export function periodLabel(firstDayKey: string, lastDayKey: string): string {
  return firstDayKey === lastDayKey
    ? dayLabel(firstDayKey)
    : `${dayLabel(firstDayKey)} – ${dayLabel(lastDayKey)}`
}

const money = (label: string, width = 16): ReportColumn => ({ label, money: true, width })

function summaryTable({ summary }: ReportContext): ReportTable {
  const row = (label: string, f: { before: number; period: number; cumulative: number }) => [
    label,
    f.before,
    f.period,
    f.cumulative,
  ]
  const { income, expense, profit } = summary
  return {
    id: 'ringkasan',
    name: 'Ringkasan',
    title: 'Ringkasan',
    columns: [
      { label: 'Keterangan', width: 26 },
      money('Sebelum periode', 20),
      money('Periode ini', 20),
      money('Kumulatif', 20),
    ],
    rows: [
      row('Pemasukan', income),
      row('Pengeluaran', expense),
      ...DOORS.map((door) => row(`   dari ${EXPENSE_DOOR_LABEL[door]}`, expense.doors[door])),
      row('Profit', profit),
    ],
    emphasis: [0, 1, 5],
    note: 'Profit = pemasukan − semua pengeluaran. Kumulatif = sejak data pertama, termasuk data impor Excel.',
  }
}

function dailyTable({ input, summary }: ReportContext): ReportTable {
  const rows = dayRows(input, summary.profit.before)
  return {
    id: 'harian',
    name: 'Harian',
    title: 'Harian',
    columns: [
      { label: 'Tanggal', width: 14 },
      money('Pemasukan'),
      money('Peng. Kasir'),
      money('Peng. Owner'),
      money('Peng. Data impor'),
      money('Total pengeluaran'),
      money('Profit'),
      money('Profit kumulatif', 18),
    ],
    rows: rows.map((r) => [
      dayLabel(r.dayKey),
      r.income,
      r.doors.drawer,
      r.doors.owner,
      r.doors.imported,
      r.expense,
      r.profit,
      r.cumulativeProfit,
    ]),
    footer: [
      'Total',
      sumRupiah(rows.map((r) => r.income)),
      ...DOORS.map((door) => sumRupiah(rows.map((r) => r.doors[door]))),
      sumRupiah(rows.map((r) => r.expense)),
      sumRupiah(rows.map((r) => r.profit)),
      summary.profit.cumulative,
    ],
    note: 'Hanya tanggal yang punya catatan. Profit kumulatif dimulai dari profit sebelum periode.',
  }
}

function incomeTable({ input }: ReportContext): ReportTable {
  const rows = incomeRows(input)
  return {
    id: 'pemasukan',
    name: 'Pemasukan',
    title: 'Pemasukan',
    columns: [
      { label: 'Tanggal', width: 14 },
      { label: 'Jam', width: 7 },
      { label: 'No. nota', width: 20 },
      { label: 'Plat', width: 12 },
      { label: 'Layanan', width: 40 },
      { label: 'Metode', width: 10 },
      money('Total'),
    ],
    rows: rows.map((r) => [
      dayLabel(r.dayKey),
      r.occurredAt ? formatTime(new Date(r.occurredAt), input.timeZone) : null,
      r.receiptNo,
      r.plateNumber,
      r.description,
      r.method ? PAYMENT_METHOD_LABEL[r.method] : null,
      r.total,
    ]),
    footer: [
      'Total',
      null,
      `${rows.length} baris`,
      null,
      null,
      null,
      sumRupiah(rows.map((r) => r.total)),
    ],
    note: 'Transaksi lunas. Transaksi yang dibatalkan ada di halaman Transaksi.',
  }
}

function expenseTable({ input, categories }: ReportContext): ReportTable {
  const rows = expenseRows(input)
  const category = (id: string) => categories.find((c) => c.id === id)
  return {
    id: 'pengeluaran',
    name: 'Pengeluaran',
    title: 'Pengeluaran',
    columns: [
      { label: 'Tanggal', width: 14 },
      { label: 'Jam', width: 7 },
      { label: 'Kategori', width: 22 },
      { label: 'Jenis', width: 15 },
      { label: 'Pintu', width: 11 },
      { label: 'Keterangan', width: 34 },
      money('Nominal'),
    ],
    rows: rows.map((r) => {
      const c = category(r.categoryId)
      return [
        dayLabel(r.dayKey),
        r.occurredAt ? formatTime(new Date(r.occurredAt), input.timeZone) : null,
        c?.name ?? 'Kategori terhapus',
        c ? EXPENSE_KIND_LABEL[c.kind] : null,
        EXPENSE_DOOR_LABEL[r.door],
        r.note || null,
        r.amount,
      ]
    }),
    footer: [
      'Total',
      null,
      `${rows.length} baris`,
      null,
      null,
      null,
      sumRupiah(rows.map((r) => r.amount)),
    ],
    note: 'Pengeluaran aktif dari kasir, owner, dan data impor Excel.',
  }
}

function categoryTable({ input, categories }: ReportContext): ReportTable {
  const rows = categoryRows(input)
  const total = sumRupiah(rows.map((r) => r.total))
  const category = (id: string) => categories.find((c) => c.id === id)
  const share = (value: number) => (total > 0 ? `${Math.round((value / total) * 100)}%` : null)
  return {
    id: 'kategori',
    name: 'Per Kategori',
    title: 'Pengeluaran per kategori',
    columns: [
      { label: 'Kategori', width: 24 },
      { label: 'Jenis', width: 15 },
      money('Kasir'),
      money('Owner'),
      money('Data impor'),
      money('Total'),
      { label: 'Porsi', width: 8 },
    ],
    rows: rows.map((r) => {
      const c = category(r.categoryId)
      return [
        c?.name ?? 'Kategori terhapus',
        c ? EXPENSE_KIND_LABEL[c.kind] : null,
        r.doors.drawer,
        r.doors.owner,
        r.doors.imported,
        r.total,
        share(r.total),
      ]
    }),
    footer: [
      'Total',
      null,
      ...DOORS.map((door) => sumRupiah(rows.map((r) => r.doors[door]))),
      total,
      total > 0 ? '100%' : null,
    ],
  }
}

export const REPORT_TABS: { id: ReportTabId; build: (ctx: ReportContext) => ReportTable }[] = [
  { id: 'ringkasan', build: summaryTable },
  { id: 'harian', build: dailyTable },
  { id: 'pemasukan', build: incomeTable },
  { id: 'pengeluaran', build: expenseTable },
  { id: 'kategori', build: categoryTable },
]

export function buildReport(ctx: ReportContext): ReportTable[] {
  return REPORT_TABS.map((tab) => tab.build(ctx))
}
