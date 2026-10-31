import type { Cell } from '@/features/history/cashflow-import'
import type { MonthlyMatrix } from './finance'

// Export in the owner's own spreadsheet layout (one sheet per month, days across, one
// row per category), so the file opens like the workbook they already keep — and can be
// imported back without any mapping work.

const MONTH_NAMES = [
  'JANUARI',
  'FEBRUARI',
  'MARET',
  'APRIL',
  'MEI',
  'JUNI',
  'JULI',
  'AGUSTUS',
  'SEPTEMBER',
  'OKTOBER',
  'NOVEMBER',
  'DESEMBER',
]

const ABBR = ['JAN', 'FEB', 'MAR', 'APR', 'MEI', 'JUN', 'JUL', 'AGU', 'SEP', 'OKT', 'NOV', 'DES']

/** `"2026-10"` → `"OKT-26"`, the sheet name the importer reads back. */
export function sheetNameFor(monthKey: string): string {
  return `${ABBR[Number(monthKey.slice(5, 7)) - 1] ?? 'BLN'}-${monthKey.slice(2, 4)}`
}

const blankZero = (value: number): Cell => (value === 0 ? null : value)

export function monthSheetRows(
  matrix: MonthlyMatrix,
  monthKey: string,
  categoryName: (id: string) => string,
): Cell[][] {
  const days = matrix.dayKeys.map((key) => Number(key.slice(8, 10)))
  const rows: Cell[][] = [
    [MONTH_NAMES[Number(monthKey.slice(5, 7)) - 1] ?? monthKey, null, ...days, 'Total'],
    ['Pendapatan', null, ...matrix.income.map(blankZero), matrix.totals.income],
  ]
  const used = matrix.rows.filter((row) => row.total > 0)
  used.forEach((row, index) => {
    rows.push([
      index === 0 ? 'Pengeluaran' : null,
      categoryName(row.categoryId),
      ...row.values.map(blankZero),
      row.total,
    ])
  })
  const t = matrix.totals
  rows.push(
    [null, 'Pendapatan Harian', ...matrix.net, t.netCashFlow],
    [null, 'Omset', t.income],
    [null, 'Total Net Profit', t.netCashFlow],
    [null, 'Profit operasional', t.operatingProfit],
    [null, 'Profit bersih', t.profit],
    [null, 'Prive', t.drawings],
    [null, '* Dibuat oleh Kasiko. Total Net Profit = arus kas bersih (prive ikut dikurangi).'],
  )
  return rows
}

export interface ExportSheet {
  name: string
  rows: Cell[][]
}

/** Builds and downloads an .xlsx; SheetJS loads only when the owner exports. */
export async function downloadWorkbook(fileName: string, sheets: readonly ExportSheet[]) {
  const XLSX = await import('xlsx')
  const workbook = XLSX.utils.book_new()
  for (const sheet of sheets) {
    const ws = XLSX.utils.aoa_to_sheet(sheet.rows)
    ws['!cols'] = [{ wch: 12 }, { wch: 26 }]
    XLSX.utils.book_append_sheet(workbook, ws, sheet.name)
  }
  XLSX.writeFile(workbook, fileName, { compression: true })
}

// Byte-order mark so Excel opens the UTF-8 CSV with the right encoding.
const BOM = String.fromCharCode(0xfeff)

export async function downloadCsv(fileName: string, rows: Cell[][]) {
  const XLSX = await import('xlsx')
  const csv = XLSX.utils.sheet_to_csv(XLSX.utils.aoa_to_sheet(rows))
  downloadBlob(fileName, new Blob([BOM + csv], { type: 'text/csv;charset=utf-8' }))
}

export function downloadBlob(fileName: string, blob: Blob) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.click()
  URL.revokeObjectURL(url)
}
