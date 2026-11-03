import type { Cell } from '@/features/history/cashflow-import'
import { formatDigits } from '@/lib/money'
import { downloadBlob } from './monthly-export'
import type { ReportTable } from './report-tables'

// Laporan exports (decision #41): one workbook with a sheet per tab, or one A4 landscape
// PDF with a section per tab. SheetJS and jsPDF load only when the owner exports, and
// neither is precached for the cashier.

export interface ReportMeta {
  businessName: string
  period: string
  /** e.g. "3 Nov 2026 14.05" — when the file was made. */
  createdAt: string
}

const MONEY_FORMAT = '#,##0;-#,##0'

/** The rows of one sheet: heading, header, data, total, note. Amounts stay numbers. */
export function sheetRows(table: ReportTable, meta: ReportMeta): Cell[][] {
  return [
    [`${meta.businessName} — ${table.title}`],
    [`Periode: ${meta.period}`],
    [],
    table.columns.map((c) => c.label),
    ...table.rows,
    ...(table.footer ? [table.footer] : []),
    ...(table.note ? [[], [table.note]] : []),
    [`Dibuat Kasiko, ${meta.createdAt}`],
  ]
}

/** First data row of `sheetRows` (0-based): after the heading, period, blank, header. */
const FIRST_DATA_ROW = 4

export async function downloadReportWorkbook(
  fileName: string,
  tables: readonly ReportTable[],
  meta: ReportMeta,
) {
  const XLSX = await import('xlsx')
  const workbook = XLSX.utils.book_new()
  for (const table of tables) {
    const rows = sheetRows(table, meta)
    const ws = XLSX.utils.aoa_to_sheet(rows)
    ws['!cols'] = table.columns.map((c) => ({ wch: c.width ?? 14 }))
    const lastDataRow = FIRST_DATA_ROW + table.rows.length + (table.footer ? 1 : 0)
    table.columns.forEach((column, c) => {
      if (!column.money) return
      for (let r = FIRST_DATA_ROW; r < lastDataRow; r++) {
        const cell = ws[XLSX.utils.encode_cell({ r, c })] as { t?: string; z?: string } | undefined
        if (cell?.t === 'n') cell.z = MONEY_FORMAT
      }
    })
    XLSX.utils.book_append_sheet(workbook, ws, table.name)
  }
  XLSX.writeFile(workbook, fileName, { compression: true })
}

/** Text for a PDF cell: grouped digits for amounts, plain ASCII signs for the PDF font. */
export function pdfText(value: Cell, money: boolean): string {
  if (value === null || value === undefined || value === '') return ''
  if (money && typeof value === 'number') return formatDigits(value)
  return String(value).replace(/[−–]/g, '-')
}

export async function downloadReportPdf(
  fileName: string,
  tables: readonly ReportTable[],
  meta: ReportMeta,
) {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')])
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const margin = 12

  tables.forEach((table, index) => {
    if (index > 0) doc.addPage()
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(14)
    doc.text(pdfText(`${meta.businessName} - ${table.title}`, false), margin, margin + 4)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(90)
    doc.text(pdfText(`Periode: ${meta.period}`, false), margin, margin + 10)
    doc.setTextColor(0)

    const align = table.columns.map((c): 'right' | 'left' => (c.money ? 'right' : 'left'))
    const columnStyles = Object.fromEntries(align.map((halign, i) => [i, { halign }]))
    const cells = (row: Cell[]) =>
      row.map((value, i) => pdfText(value, table.columns[i]?.money ?? false))
    const emphasis = new Set(table.emphasis ?? [])

    autoTable(doc, {
      startY: margin + 14,
      margin: { left: margin, right: margin, bottom: margin + 6 },
      head: [table.columns.map((c) => c.label)],
      body: table.rows.length > 0 ? table.rows.map(cells) : [['Tidak ada data di periode ini']],
      foot: table.footer && table.rows.length > 0 ? [cells(table.footer)] : undefined,
      showFoot: 'lastPage',
      theme: 'grid',
      styles: { font: 'helvetica', fontSize: 8, cellPadding: 1.6, lineColor: 220, lineWidth: 0.1 },
      headStyles: { fillColor: [38, 38, 38], textColor: 255, fontStyle: 'bold' },
      footStyles: { fillColor: [240, 240, 240], textColor: 0, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [250, 250, 250] },
      columnStyles,
      didParseCell: (data) => {
        if (data.section === 'head' || data.section === 'foot') {
          data.cell.styles.halign = align[data.column.index] ?? 'left'
        }
        if (data.section === 'body' && emphasis.has(data.row.index)) {
          data.cell.styles.fontStyle = 'bold'
        }
      },
    })

    if (table.note) {
      const finalY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable
        ?.finalY
      const y = (finalY ?? margin + 20) + 6
      if (y < pageHeight - margin - 6) {
        doc.setFontSize(8)
        doc.setTextColor(90)
        doc.text(pdfText(table.note, false), margin, y, { maxWidth: pageWidth - margin * 2 })
        doc.setTextColor(0)
      }
    }
  })

  const pages = doc.getNumberOfPages()
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page)
    doc.setFontSize(8)
    doc.setTextColor(120)
    doc.text(pdfText(`Dibuat Kasiko, ${meta.createdAt}`, false), margin, pageHeight - margin + 2)
    doc.text(`Halaman ${page} dari ${pages}`, pageWidth - margin, pageHeight - margin + 2, {
      align: 'right',
    })
  }
  downloadBlob(fileName, doc.output('blob'))
}
