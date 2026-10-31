import { sumRupiah } from '@/lib/money'
import type { HistoricalDay } from '@/lib/types'
import {
  normalizeLabel,
  suggestCategory,
  type ExpenseCategoryTemplate,
} from '@/features/business/templates'
import { daysOfMonth } from '@/features/reports/finance'
import { categoryTags, GUIDE_SHEET, TAG_INCOME, TAG_SKIP, tagOf, TAGS_SHEET } from './import-tags'

// Reader for the monthly cash-flow workbook many small businesses keep (decision #27):
// one sheet per month, day numbers across row 1, a "Pendapatan" row, then one row per
// expense label. Pure: it takes cell values, so it is tested without any spreadsheet
// library and the same rules can later run server-side. The Kasiko template uses the same
// layout with a tag in column A of each row (decision #38; see import-tags.ts).

export type Cell = string | number | boolean | null | undefined

export interface SheetRows {
  name: string
  rows: Cell[][]
}

export interface ParsedLine {
  label: string
  amount: number
  /** The row's tag in a template file. */
  tag?: string
}

export interface ParsedDay {
  dayKey: string
  income: number
  lines: ParsedLine[]
}

export interface ParsedMonth {
  sheetName: string
  monthKey: string
  days: ParsedDay[]
}

export interface LabelSummary {
  /** The mapping key: the row's tag, else its normalized label. */
  key: string
  /** First spelling seen, for display. */
  display: string
  tag: string | null
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

const STOP_LABELS = new Set([
  'pendapatan harian',
  'omset',
  'omzet',
  'total net profit',
  'total',
  'total pengeluaran',
  'arus kas bersih',
])
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

  // A template row says what it is through its tag; an old workbook through its label.
  const tagAt = (row: number) => tagOf(sheet.rows[row]?.[0])
  const isIncome = (row: Cell[], index: number) =>
    tagAt(index) === TAG_INCOME || (tagAt(index) === null && INCOME_LABELS.has(label(row)))
  const incomeRow = sheet.rows.findIndex(isIncome)
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
  // Tagged rows count wherever they sit, even above the income row.
  const firstTagged = sheet.rows.findIndex((_, r) => tagAt(r) !== null)
  const firstRow = firstTagged < 0 ? incomeRow + 1 : Math.min(firstTagged, incomeRow + 1)
  for (let r = firstRow; r < sheet.rows.length; r++) {
    if (r === incomeRow) continue
    const row = sheet.rows[r]
    const key = label(row)
    const tag = tagAt(r)
    if (tag === TAG_INCOME) {
      readRow(r, (dayKey, amount) => {
        dayFor(dayKey).income += amount
      })
      continue
    }
    if (!tag && STOP_LABELS.has(key)) break
    const display = (textOf(row?.[1]) || textOf(row?.[0])).replace(/\s+/g, ' ').trim()
    if (!tag && (key === '' || key === 'pengeluaran')) {
      // Merged "Pengeluaran" heading or a spare row: values without a label are ambiguous.
      const hasValues = (row ?? []).some((cell, col) => col >= 2 && cellAmount(cell))
      if (hasValues) warnings.push(`${sheet.name} baris ${r + 1}: angka tanpa nama kategori`)
      continue
    }
    readRow(r, (dayKey, amount) => {
      dayFor(dayKey).lines.push({ label: display, amount, ...(tag && { tag }) })
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
    if (sheet.name === GUIDE_SHEET || sheet.name === TAGS_SHEET) continue
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
    const key = lineKey(line)
    const entry = labels.get(key) ?? {
      key,
      display: line.label,
      tag: line.tag ?? null,
      total: 0,
      entries: 0,
    }
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

/** The mapping key of a line. Skipped rows keep their own label, so each stays visible. */
export function lineKey(line: Pick<ParsedLine, 'label' | 'tag'>): string {
  return line.tag && line.tag !== TAG_SKIP ? line.tag : normalizeLabel(line.label)
}

export type MappingSource = 'tag' | 'saved' | 'auto' | 'unknown' | 'manual'

export interface LabelMapping {
  categoryId: string
  source: MappingSource
}

export interface MappingContext {
  /** Active categories of the business, in display order. */
  categories: readonly { id: string; name: string; kind: ExpenseCategoryTemplate['kind'] }[]
  rules: readonly Pick<ExpenseCategoryTemplate, 'name' | 'aliases' | 'keywords'>[]
  saved: Readonly<Record<string, string>>
  overrides: Readonly<Record<string, string>>
}

/**
 * Label → category: the owner's choice here, then the row's tag, then the remembered
 * mapping, then template rules. Anything still unknown is not imported until the owner
 * picks a category (decision #29).
 */
export function resolveLabels(
  labels: readonly LabelSummary[],
  context: MappingContext,
): Record<string, LabelMapping> {
  const { categories, rules, saved, overrides } = context
  const tags = new Map(categoryTags(categories).map((t) => [t.tag, t.categoryId]))
  const byName = (name: string | null) =>
    name ? categories.find((c) => normalizeLabel(c.name) === normalizeLabel(name))?.id : undefined
  const result: Record<string, LabelMapping> = {}
  for (const label of labels) {
    const manual = overrides[label.key]
    const remembered = saved[label.key]
    const tagged = label.tag === TAG_SKIP ? SKIP_LABEL : label.tag && tags.get(label.tag)
    const auto = byName(suggestCategory(label.display, rules))
    if (manual) result[label.key] = { categoryId: manual, source: 'manual' }
    else if (tagged) result[label.key] = { categoryId: tagged, source: 'tag' }
    else if (
      remembered &&
      (remembered === SKIP_LABEL || categories.some((c) => c.id === remembered))
    ) {
      result[label.key] = { categoryId: remembered, source: 'saved' }
    } else if (auto) result[label.key] = { categoryId: auto, source: 'auto' }
    else result[label.key] = { categoryId: SKIP_LABEL, source: 'unknown' }
  }
  return result
}

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
      const categoryId = mapping[lineKey(line)]
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
