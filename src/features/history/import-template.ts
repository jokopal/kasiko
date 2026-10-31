import type { Workbook, Worksheet } from 'exceljs'
import { readableForeground } from '@/features/business/brand'
import { sheetNameFor } from '@/features/reports/monthly-export'
import { daysOfMonth } from '@/features/reports/finance'
import {
  EXPENSE_KIND_LABEL,
  EXPENSE_KINDS,
  type ExpenseCategory,
  type ExpenseKind,
} from '@/lib/types'
import {
  categoryTags,
  GUIDE_SHEET,
  TAG_INCOME,
  TAG_SKIP,
  TAGS_SHEET,
  type CategoryTag,
} from './import-tags'

// The Kasiko import template (decision #38): the workbook layout the importer already
// reads, generated from a business's own categories. Every row carries a tag, so column B
// is free text and any row may be added or renamed. `templateMonth` is pure and tested;
// `renderTemplate` writes it with ExcelJS, which SheetJS's free build cannot do (colors,
// frozen panes, dropdowns). ExcelJS loads only when the owner asks for a template.

const EXPENSE_FIRST_COLUMN = 3

export interface TemplateRow {
  tag: string | null
  label: string
  /** Day of the month → rupiah, for a pre-filled copy. */
  amounts?: Readonly<Record<number, number>>
}

export interface TemplateGroup {
  title: string
  /** Sets the band color; spare rows have none. */
  kind?: ExpenseKind
  rows: TemplateRow[]
}

export interface TemplateMonth {
  monthKey: string
  income: TemplateRow
  groups: TemplateGroup[]
}

const SPARE_ROWS = 5

export const emptyRow = (): TemplateRow => ({ tag: null, label: '' })

/** The expense rows of a blank month: one per category, by kind, plus spare rows. */
export function templateGroups(tags: readonly CategoryTag[]): TemplateGroup[] {
  const groups: TemplateGroup[] = EXPENSE_KINDS.flatMap((kind) => {
    const rows = tags.filter((t) => t.kind === kind).map((t) => ({ tag: t.tag, label: t.name }))
    return rows.length > 0 ? [{ title: EXPENSE_KIND_LABEL[kind], kind, rows }] : []
  })
  groups.push({
    title: 'Baris tambahan (tulis label, pilih tag di kolom A)',
    rows: Array.from({ length: SPARE_ROWS }, emptyRow),
  })
  return groups
}

export function templateMonth(monthKey: string, tags: readonly CategoryTag[]): TemplateMonth {
  return {
    monthKey,
    income: { tag: TAG_INCOME, label: 'Pendapatan' },
    groups: templateGroups(tags),
  }
}

export const monthsOfYear = (year: number) =>
  Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`)

export const templateTags = (categories: readonly ExpenseCategory[]) =>
  categoryTags(categories.filter((c) => c.isActive))

// --- Rendering --------------------------------------------------------------------------

const argb = (hex: string) => `FF${hex.replace('#', '').toUpperCase()}`
const fill = (hex: string) =>
  ({ type: 'pattern', pattern: 'solid', fgColor: { argb: argb(hex) } }) as const

const LINE = { style: 'thin', color: { argb: argb('#D9DEE3') } } as const
const GRID = { top: LINE, left: LINE, bottom: LINE, right: LINE }
const RUPIAH = '#,##0'
const KIND_TINT: Record<ExpenseKind, string> = {
  operating: '#FCE7DE',
  non_operating: '#E8E5FA',
  drawing: '#DAF3EA',
}
const INCOME_TINT = '#E3F4E8'
const TOTAL_TINT = '#EEF1F4'
const SPARE_TINT = '#F4F5F7'
const SUNDAY_TINT = '#F7F8FA'

const MONTH_TITLES = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
]
const WEEKDAY_NAMES = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab']

const columnLetter = (index: number) => {
  let name = ''
  for (let n = index; n > 0; n = Math.floor((n - 1) / 26)) {
    name = String.fromCharCode(65 + ((n - 1) % 26)) + name
  }
  return name
}

function addMonthSheet(
  workbook: Workbook,
  month: TemplateMonth,
  brandColor: string,
  tagListEnd: number,
) {
  const dayKeys = daysOfMonth(month.monthKey)
  const lastDayColumn = EXPENSE_FIRST_COLUMN + dayKeys.length - 1
  const totalColumn = lastDayColumn + 1
  const firstDay = columnLetter(EXPENSE_FIRST_COLUMN)
  const lastDay = columnLetter(lastDayColumn)
  const totalLetter = columnLetter(totalColumn)
  const sheet: Worksheet = workbook.addWorksheet(sheetNameFor(month.monthKey), {
    views: [{ state: 'frozen', xSplit: 2, ySplit: 2, activeCell: 'C3' }],
    pageSetup: {
      orientation: 'landscape',
      paperSize: 9,
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
    },
  })
  sheet.pageSetup.printTitlesRow = '1:2'
  sheet.columns = [
    { width: 26 },
    { width: 30 },
    ...dayKeys.map(() => ({ width: 11 })),
    { width: 15 },
  ]
  const sundays = dayKeys.flatMap((key, i) =>
    new Date(`${key}T00:00:00Z`).getUTCDay() === 0 ? [EXPENSE_FIRST_COLUMN + i] : [],
  )

  const brandText = argb(readableForeground(brandColor))
  const monthIndex = Number(month.monthKey.slice(5, 7)) - 1
  const header = sheet.addRow([
    'Tag',
    `${MONTH_TITLES[monthIndex] ?? ''} ${month.monthKey.slice(0, 4)}`,
    ...dayKeys.map((key) => Number(key.slice(8, 10))),
    'Total',
  ])
  header.height = 22
  header.eachCell((cell) => {
    cell.fill = fill(brandColor)
    cell.font = { bold: true, color: { argb: brandText } }
    cell.alignment = { horizontal: 'center', vertical: 'middle' }
  })
  header.getCell(2).alignment = { horizontal: 'left', vertical: 'middle' }

  const weekdays = sheet.addRow([
    null,
    'Hari',
    ...dayKeys.map((key) => WEEKDAY_NAMES[new Date(`${key}T00:00:00Z`).getUTCDay()]),
  ])
  weekdays.eachCell((cell) => {
    cell.font = { size: 9, color: { argb: argb('#5B6570') } }
    cell.alignment = { horizontal: 'center' }
  })
  weekdays.getCell(2).alignment = { horizontal: 'left' }

  const writeRow = (row: TemplateRow, tint?: string, boldLabel = false) => {
    const added = sheet.addRow([row.tag, row.label || null])
    const n = added.number
    added.getCell(1).dataValidation = {
      type: 'list',
      allowBlank: true,
      formulae: [`${TAGS_SHEET}!$A$2:$A$${tagListEnd}`],
      showErrorMessage: true,
      errorStyle: 'warning',
      errorTitle: 'Tag tidak dikenal',
      error: 'Pilih tag dari daftar di sheet Tag.',
    }
    added.getCell(1).font = { name: 'Consolas', size: 9, color: { argb: argb('#5B6570') } }
    if (boldLabel) added.getCell(2).font = { bold: true }
    dayKeys.forEach((_, i) => {
      const cell = added.getCell(EXPENSE_FIRST_COLUMN + i)
      cell.value = row.amounts?.[i + 1] ?? null
    })
    added.getCell(totalColumn).value = {
      formula: `SUM(${firstDay}${n}:${lastDay}${n})`,
      result: 0,
    }
    added.getCell(totalColumn).font = { bold: true }
    for (let col = 1; col <= totalColumn; col++) {
      const cell = added.getCell(col)
      cell.border = GRID
      if (col >= EXPENSE_FIRST_COLUMN) cell.numFmt = RUPIAH
      if (tint) cell.fill = fill(tint)
      else if (sundays.includes(col)) cell.fill = fill(SUNDAY_TINT)
    }
  }

  writeRow(month.income, INCOME_TINT, true)
  const incomeRow = sheet.lastRow?.number ?? 3

  const firstExpenseRow = incomeRow + 1
  for (const group of month.groups) {
    const band = sheet.addRow([null, group.title])
    for (let col = 1; col <= totalColumn; col++) {
      band.getCell(col).fill = fill(group.kind ? KIND_TINT[group.kind] : SPARE_TINT)
    }
    band.getCell(2).font = { bold: true, size: 10 }
    group.rows.forEach((row) => writeRow(row))
  }
  const lastExpenseRow = sheet.lastRow?.number ?? firstExpenseRow

  // Rows tagged #lewati are not imported, so the totals leave them out too and match what
  // the import shows.
  const expenseSum = (letter: string) => ({
    formula: `SUMIF($A$${firstExpenseRow}:$A$${lastExpenseRow},"<>${TAG_SKIP}",${letter}$${firstExpenseRow}:${letter}$${lastExpenseRow})`,
    result: 0,
  })
  const totalRow = sheet.addRow([null, 'Total Pengeluaran'])
  const netRow = sheet.addRow([null, 'Arus Kas Bersih'])
  for (let col = EXPENSE_FIRST_COLUMN; col <= totalColumn; col++) {
    const letter = columnLetter(col)
    totalRow.getCell(col).value = expenseSum(letter)
    netRow.getCell(col).value = {
      formula: `${letter}${incomeRow}-${letter}${totalRow.number}`,
      result: 0,
    }
  }
  for (const row of [totalRow, netRow]) {
    for (let col = 1; col <= totalColumn; col++) {
      const cell = row.getCell(col)
      cell.fill = fill(TOTAL_TINT)
      cell.font = { bold: true }
      cell.border = GRID
      if (col >= EXPENSE_FIRST_COLUMN) cell.numFmt = RUPIAH
    }
  }
  return totalLetter
}

function addGuideSheet(workbook: Workbook, input: TemplateInput) {
  const { businessName, brandColor } = input
  const sample = input.tags[0]
  const sheet = workbook.addWorksheet(GUIDE_SHEET, {
    views: [{ showGridLines: false }],
    pageSetup: { paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  })
  sheet.columns = [{ width: 3 }, { width: 104 }]
  const title = sheet.addRow([null, 'Template Impor Kasiko'])
  title.getCell(2).font = { bold: true, size: 18, color: { argb: argb(brandColor) } }
  title.height = 30
  sheet.addRow([null, businessName]).getCell(2).font = { size: 12, bold: true }
  sheet.addRow([])

  const section = (heading: string, lines: readonly string[]) => {
    sheet.addRow([null, heading]).getCell(2).font = { bold: true, size: 12 }
    for (const line of lines) {
      sheet.addRow([null, line]).getCell(2).alignment = { wrapText: true, vertical: 'top' }
    }
    sheet.addRow([])
  }
  section('Cara mengisi', [
    '1. Buka sheet bulan yang ingin diisi (mis. JAN-26). Bulan yang kosong otomatis dilewati.',
    '2. Tulis angka rupiah per tanggal, tanpa titik dan tanpa "Rp". Sel kosong berarti tidak ada.',
    '3. Di Kasiko: Manajemen → Impor Data → Pilih file Excel, periksa ringkasannya, lalu Impor.',
  ])
  section('Tag: kolom A menentukan arti baris', [
    `${TAG_INCOME} = pendapatan hari itu. Boleh lebih dari satu baris, nilainya dijumlahkan.`,
    '#nama-kategori = masuk ke kategori tersebut. Daftar lengkapnya ada di sheet Tag.',
    `${TAG_SKIP} = baris tetap di file tetapi tidak diimpor dan tidak ikut Total Pengeluaran.`,
    ...(sample
      ? [`Kolom B bebas diubah. Baris ber-tag ${sample.tag} tetap masuk ke ${sample.name}.`]
      : []),
    'Perlu baris baru? Isi Baris tambahan, atau sisipkan baris lalu pilih tagnya.',
    'Baris tanpa tag akan dicocokkan lewat namanya, dan yang tidak dikenali ditanyakan saat impor.',
  ])
  section('Jangan diubah', [
    'Nama sheet bulan (JAN-26, FEB-26, ...) dan angka tanggal di baris pertama.',
    'Baris Total Pengeluaran dan Arus Kas Bersih hanya hitungan Excel dan tidak ikut diimpor.',
  ])
  section('Yang perlu diketahui', [
    'Data impor hanya untuk analisis: tidak mengubah kas bebas, uang laci, atau daftar transaksi.',
    'Tanggal yang sudah punya data kasir dilewati, jadi tidak pernah terhitung dua kali.',
    'Impor ulang mengganti tanggal yang ada di file, tidak menggandakan. Tanggal lain tidak berubah.',
    'Kategori berubah? Unduh template baru dari halaman Impor Data agar tagnya ikut terbarui.',
  ])
}

function addTagsSheet(workbook: Workbook, tags: readonly CategoryTag[], brandColor: string) {
  const sheet = workbook.addWorksheet(TAGS_SHEET, {
    views: [{ state: 'frozen', ySplit: 1 }],
  })
  sheet.columns = [{ width: 32 }, { width: 34 }, { width: 20 }]
  const header = sheet.addRow(['Tag', 'Masuk ke', 'Jenis'])
  header.eachCell((cell) => {
    cell.fill = fill(brandColor)
    cell.font = { bold: true, color: { argb: argb(readableForeground(brandColor)) } }
  })
  const add = (tag: string, name: string, kind: string, tint?: string) => {
    const row = sheet.addRow([tag, name, kind])
    row.getCell(1).font = { name: 'Consolas', size: 10 }
    row.eachCell((cell) => {
      cell.border = GRID
      if (tint) cell.fill = fill(tint)
    })
  }
  add(TAG_INCOME, 'Pendapatan', 'Pemasukan', INCOME_TINT)
  for (const t of tags) add(t.tag, t.name, EXPENSE_KIND_LABEL[t.kind], KIND_TINT[t.kind])
  add(TAG_SKIP, 'Tidak diimpor', '—', SPARE_TINT)
  return sheet.lastRow?.number ?? 1
}

export interface TemplateInput {
  businessName: string
  brandColor: string
  tags: readonly CategoryTag[]
  months: readonly TemplateMonth[]
}

/** Builds the .xlsx: Panduan, then Tag, then one sheet per month. */
export async function renderTemplate(input: TemplateInput): Promise<ArrayBuffer> {
  const { Workbook } = (await import('exceljs')).default
  const workbook = new Workbook()
  workbook.creator = 'Kasiko'
  workbook.calcProperties = { fullCalcOnLoad: true }
  addGuideSheet(workbook, input)
  const tagListEnd = addTagsSheet(workbook, input.tags, input.brandColor)
  for (const month of input.months) {
    addMonthSheet(workbook, month, input.brandColor, tagListEnd)
  }
  return workbook.xlsx.writeBuffer()
}
