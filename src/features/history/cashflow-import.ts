import { sumRupiah } from '@/lib/money'
import type { HistoricalDay } from '@/lib/types'
import { normalizeLabel } from '@/features/business/templates'
import { daysOfMonth } from '@/features/reports/finance'

// Reader for the monthly cash-flow workbook many small businesses keep (decision #27):
// one sheet per month, day numbers across row 1, a "Pendapatan" row, then one row per
// expense label. Pure: it takes cell values, so it is tested without any spreadsheet
// library and the same rules can later run server-side.

export type Cell = string | number | boolean | null | undefined

export interface SheetRows {
  name: string
  rows: Cell[][]
}

export interface ParsedDay {
  dayKey: string
  income: number
  lines: { label: string; amount: number }[]
}

export interface ParsedMonth {
  sheetName: string
  monthKey: string
  days: ParsedDay[]
}

export interface LabelSummary {
  /** Normalized label — the mapping key. */
  key: string
  /** First spelling seen, for display. */
  display: string
  total: number
  entries: number
}

export interface ParsedWorkbook {
  months: ParsedMonth[]
  labels: LabelSummary[]
  warnings: string[]
  skippedSheets: string[]
}

const MONTH_PREFIX: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  mei: 5,
  may: 5,
  jun: 6,
  jul: 7,
  agu: 8,
  ags: 8,
  agt: 8,
  aug: 8,
  sep: 9,
  okt: 10,
  oct: 10,
  nov: 11,
  des: 12,
  dec: 12,
}

/** `"JAN-25"`, `"MARET 26"`, `"AGUS-2026"` → `"2025-01"`, `"2026-03"`, `"2026-08"`. */
export function monthKeyFromSheetName(name: string): string | null {
  const match = /^\s*([a-z]+)[\s\-_.']*(\d{2}|\d{4})\s*$/i.exec(name)
  if (!match) return null
  const month = MONTH_PREFIX[(match[1] ?? '').slice(0, 3).toLowerCase()]
  if (!month) return null
  const digits = match[2] ?? ''
  const year = digits.length === 2 ? 2000 + Number(digits) : Number(digits)
  return `${year}-${String(month).padStart(2, '0')}`
}

const STOP_LABELS = new Set(['pendapatan harian', 'omset', 'omzet', 'total net profit', 'total'])
const INCOME_LABELS = new Set(['pendapatan', 'pemasukan', 'omset harian'])
const SUMMARY_HEADERS = new Set(['total', 'jumlah', 'subtotal'])

/** Rupiah amount from a cell: numbers, or text like `"150.000"` / `"Rp 1.500.000"`. */
export function cellAmount(cell: Cell): number | null {
  if (typeof cell === 'number') return Number.isFinite(cell) ? Math.round(cell) : null
  if (typeof cell !== 'string') return null
  const text = cell.replace(/rp/i, '').replace(/\s/g, '')
  if (!/^-?[\d.,]+$/.test(text)) return null
  // Indonesian notation: dots group thousands; a trailing ",xx" is cents and is dropped.
  const whole = text.replace(/,\d{1,2}$/, '').replace(/[.,]/g, '')
  const value = Number(whole)
  return Number.isSafeInteger(value) ? value : null
}

const textOf = (cell: Cell) => (typeof cell === 'string' ? cell : '')
const label = (row: Cell[] | undefined) => normalizeLabel(textOf(row?.[1]) || textOf(row?.[0]))

function parseSheet(sheet: SheetRows, monthKey: string, warnings: string[]): ParsedMonth {
  const where = (col: number, row: number) => `${sheet.name} ${columnName(col)}${row + 1}`
  const validDays = new Set(daysOfMonth(monthKey))
  const header = sheet.rows[0] ?? []
  // Day per column comes from row 1, so a skipped or repeated date never shifts the data.
  const dayOfColumn = new Map<number, string>()
  // Total/sum columns (e.g. in a Kasiko export) are derived figures, not days.
  const summaryColumns = new Set(
    header.flatMap((cell, col) => (SUMMARY_HEADERS.has(normalizeLabel(textOf(cell))) ? [col] : [])),
  )
  header.forEach((cell, col) => {
    if (col < 2 || typeof cell !== 'number' || !Number.isInteger(cell)) return
    const dayKey = `${monthKey}-${String(cell).padStart(2, '0')}`
    if (validDays.has(dayKey)) dayOfColumn.set(col, dayKey)
  })

  const incomeRow = sheet.rows.findIndex((row) => INCOME_LABELS.has(label(row)))
  if (incomeRow < 0) {
    warnings.push(`${sheet.name}: baris "Pendapatan" tidak ditemukan`)
    return { sheetName: sheet.name, monthKey, days: [] }
  }

  const days = new Map<string, ParsedDay>()
  const dayFor = (dayKey: string) => {
    let day = days.get(dayKey)
    if (!day) {
      day = { dayKey, income: 0, lines: [] }
      days.set(dayKey, day)
    }
    return day
  }
  const readRow = (rowIndex: number, onValue: (dayKey: string, amount: number) => void) => {
    const row = sheet.rows[rowIndex] ?? []
    row.forEach((cell, col) => {
      if (col < 2 || summaryColumns.has(col)) return
      if (cell === null || cell === undefined || cell === '') return
      const amount = cellAmount(cell)
      if (amount === null) {
        warnings.push(`${where(col, rowIndex)}: "${String(cell)}" bukan angka, dilewati`)
        return
      }
      if (amount === 0) return
      if (amount < 0) {
        warnings.push(`${where(col, rowIndex)}: nilai negatif dilewati`)
        return
      }
      const dayKey = dayOfColumn.get(col)
      if (!dayKey) {
        warnings.push(`${where(col, rowIndex)}: kolom tanpa tanggal, dilewati`)
        return
      }
      onValue(dayKey, amount)
    })
  }

  readRow(incomeRow, (dayKey, amount) => {
    dayFor(dayKey).income += amount
  })
  for (let r = incomeRow + 1; r < sheet.rows.length; r++) {
    const row = sheet.rows[r]
    const key = label(row)
    if (STOP_LABELS.has(key)) break
    const display = (textOf(row?.[1]) || textOf(row?.[0])).replace(/\s+/g, ' ').trim()
    if (key === '' || key === 'pengeluaran') {
      // Merged "Pengeluaran" heading or a spare row: values without a label are ambiguous.
      const hasValues = (row ?? []).some((cell, col) => col >= 2 && cellAmount(cell))
      if (hasValues) warnings.push(`${sheet.name} baris ${r + 1}: angka tanpa nama kategori`)
      continue
    }
    readRow(r, (dayKey, amount) => {
      dayFor(dayKey).lines.push({ label: display, amount })
    })
  }
  const sorted = [...days.values()].sort((a, b) => a.dayKey.localeCompare(b.dayKey))
  return { sheetName: sheet.name, monthKey, days: sorted }
}

function columnName(index: number): string {
  let name = ''
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) {
    name = String.fromCharCode(65 + ((n - 1) % 26)) + name
  }
  return name
}

export function parseCashflowWorkbook(sheets: readonly SheetRows[]): ParsedWorkbook {
  const warnings: string[] = []
  const skippedSheets: string[] = []
  const byMonth = new Map<string, ParsedMonth>()
  for (const sheet of sheets) {
    const monthKey = monthKeyFromSheetName(sheet.name)
    if (!monthKey) {
      skippedSheets.push(sheet.name)
      continue
    }
    if (byMonth.has(monthKey)) {
      warnings.push(`${sheet.name}: bulan ${monthKey} sudah ada di sheet lain, dilewati`)
      continue
    }
    const month = parseSheet(sheet, monthKey, warnings)
    if (month.days.length > 0) byMonth.set(monthKey, month)
  }
  const months = [...byMonth.values()].sort((a, b) => a.monthKey.localeCompare(b.monthKey))

  const labels = new Map<string, LabelSummary>()
  for (const line of months.flatMap((m) => m.days.flatMap((d) => d.lines))) {
    const key = normalizeLabel(line.label)
    const entry = labels.get(key) ?? { key, display: line.label, total: 0, entries: 0 }
    entry.total += line.amount
    entry.entries += 1
    labels.set(key, entry)
  }
  return {
    months,
    labels: [...labels.values()].sort((a, b) => b.total - a.total),
    warnings,
    skippedSheets,
  }
}

/** Mapping value for a label the owner chose not to import (decision #29). */
export const SKIP_LABEL = 'skip'

export interface ImportPlan {
  days: HistoricalDay[]
  /** Days left out because Kasiko already has live data for them. */
  skippedDayKeys: string[]
  income: number
  expense: number
  /** Expense amounts left out because their label maps to `SKIP_LABEL`. */
  skippedExpense: number
}

/**
 * Turns a parsed workbook into historical days. Every label must be mapped to a category
 * or to `SKIP_LABEL` (`mapping[normalizedLabel]`); days that already hold live
 * transactions or expenses are skipped so nothing is ever counted twice.
 */
export function planImport(
  parsed: ParsedWorkbook,
  mapping: Readonly<Record<string, string>>,
  options: { businessId: string; liveDayKeys: ReadonlySet<string>; now: Date },
): ImportPlan {
  const days: HistoricalDay[] = []
  const skippedDayKeys: string[] = []
  let skippedExpense = 0
  for (const day of parsed.months.flatMap((m) => m.days)) {
    if (options.liveDayKeys.has(day.dayKey)) {
      skippedDayKeys.push(day.dayKey)
      continue
    }
    const byCategory = new Map<string, number>()
    for (const line of day.lines) {
      const categoryId = mapping[normalizeLabel(line.label)]
      if (!categoryId) throw new Error(`Label "${line.label}" belum dipetakan ke kategori`)
      if (categoryId === SKIP_LABEL) {
        skippedExpense += line.amount
        continue
      }
      byCategory.set(categoryId, (byCategory.get(categoryId) ?? 0) + line.amount)
    }
    days.push({
      businessId: options.businessId,
      dayKey: day.dayKey,
      income: day.income,
      expenses: [...byCategory.entries()].map(([categoryId, amount]) => ({ categoryId, amount })),
      importedAt: options.now.toISOString(),
    })
  }
  return {
    days,
    skippedDayKeys,
    income: sumRupiah(days.map((d) => d.income)),
    expense: sumRupiah(days.flatMap((d) => d.expenses.map((e) => e.amount))),
    skippedExpense,
  }
}

/** Reads an .xlsx/.xls file into plain cell rows. SheetJS loads only when needed. */
export async function readWorkbookFile(file: File): Promise<SheetRows[]> {
  const XLSX = await import('xlsx')
  const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' })
  return workbook.SheetNames.map((name) => {
    const sheet = workbook.Sheets[name]
    const rows = sheet
      ? XLSX.utils.sheet_to_json<Cell[]>(sheet, { header: 1, raw: true, defval: null })
      : []
    return { name, rows }
  })
}
