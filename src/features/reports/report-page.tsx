import { DownloadIcon, FileSpreadsheetIcon, FileTextIcon } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PageLoading } from '@/components/page-loading'
import type { Cell } from '@/features/history/cashflow-import'
import {
  BEGINNING_OF_RECORDS,
  fetchExpenses,
  fetchHistoryRange,
  fetchPeriodTotals,
  fetchTransactions,
} from '@/features/data/owner'
import { useOwnerData } from '@/features/data/owner-data'
import { keys } from '@/features/data/query-client'
import { OwnerPage } from '@/features/owner/page'
import { formatDateTime } from '@/lib/datetime'
import { formatDigits } from '@/lib/money'
import { cn } from '@/lib/utils'
import { MonthlyRecap } from './monthly-recap'
import { PeriodPicker } from './period-picker'
import { downloadReportPdf, downloadReportWorkbook, type ReportMeta } from './report-export'
import { buildReport, periodLabel, type ReportTable, type ReportTabId } from './report-tables'
import { flowSummary } from './summary'
import { SummaryCards } from './summary-cards'
import { usePeriod } from './use-period'

// Laporan (decision #41): every table of a period in tabs, exported as one workbook (a
// sheet per tab) or one PDF. The "Bulanan" tab keeps the spreadsheet layout per month.

type TabId = ReportTabId | 'bulanan'

const TABS: { id: TabId; label: string }[] = [
  { id: 'ringkasan', label: 'Ringkasan' },
  { id: 'harian', label: 'Harian' },
  { id: 'pemasukan', label: 'Pemasukan' },
  { id: 'pengeluaran', label: 'Pengeluaran' },
  { id: 'kategori', label: 'Per Kategori' },
  { id: 'bulanan', label: 'Bulanan (format Excel)' },
]

const isTab = (value: string | null): value is TabId => TABS.some((t) => t.id === value)

export function ReportPage() {
  const { business, expenseCategories } = useOwnerData()
  const tz = business.timezone
  const period = usePeriod(tz, 'month')
  const { range, firstDayKey, lastDayKey } = period
  const [params, setParams] = useSearchParams()
  const requested = params.get('tab')
  const tab: TabId = isTab(requested) ? requested : 'ringkasan'
  const setTab = (value: string) => {
    const next = new URLSearchParams(params)
    next.set('tab', value)
    setParams(next, { replace: true })
  }

  const query = useQuery({
    queryKey: keys.report(business.id, 'laporan', firstDayKey, lastDayKey),
    enabled: tab !== 'bulanan',
    queryFn: async () => {
      const id = business.id
      const [current, before, transactions, expenses, history] = await Promise.all([
        fetchPeriodTotals(id, range.from, range.to),
        fetchPeriodTotals(id, BEGINNING_OF_RECORDS, range.from),
        fetchTransactions(id, range.from, range.to),
        fetchExpenses(id, range.from, range.to),
        fetchHistoryRange(id, firstDayKey, lastDayKey),
      ])
      return { current, before, transactions, expenses, history }
    },
  })

  const report = useMemo(() => {
    if (!query.data) return null
    const { current, before, transactions, expenses, history } = query.data
    const summary = flowSummary(current, before)
    const tables = buildReport({
      summary,
      categories: expenseCategories,
      input: {
        transactions,
        expenses,
        historyIncome: history.income,
        historyExpenses: history.expenses,
        timeZone: tz,
      },
    })
    return { summary, tables }
  }, [query.data, expenseCategories, tz])

  const label = periodLabel(firstDayKey, lastDayKey)

  async function exportAs(format: 'xlsx' | 'pdf') {
    if (!report) return
    const toastId = toast.loading('Menyiapkan file…')
    const meta: ReportMeta = {
      businessName: business.name,
      period: label,
      createdAt: formatDateTime(new Date(), tz),
    }
    const range = firstDayKey === lastDayKey ? firstDayKey : `${firstDayKey} sd ${lastDayKey}`
    const fileName = `${business.name} - Laporan ${range}.${format}`
    try {
      if (format === 'xlsx') await downloadReportWorkbook(fileName, report.tables, meta)
      else await downloadReportPdf(fileName, report.tables, meta)
      toast.success('File siap diunduh', { id: toastId })
    } catch {
      toast.error('Ekspor gagal. Coba lagi.', { id: toastId })
    }
  }

  return (
    <OwnerPage
      title="Laporan"
      description={
        tab === 'bulanan'
          ? `${business.name} · per bulan`
          : `${business.name} · ${label} · kumulatif sejak data pertama`
      }
      actions={
        tab !== 'bulanan' && (
          <>
            <PeriodPicker period={period} />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" disabled={!report}>
                  <DownloadIcon />
                  Ekspor
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => void exportAs('xlsx')}>
                  <FileSpreadsheetIcon />
                  Excel — {TABS.length - 1} sheet
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => void exportAs('pdf')}>
                  <FileTextIcon />
                  PDF — A4 mendatar
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        )
      }
    >
      <Tabs value={tab} onValueChange={setTab} className="gap-4">
        <div className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
          <TabsList className="h-9 w-max">
            {TABS.map((t) => (
              <TabsTrigger key={t.id} value={t.id} className="px-3">
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        {TABS.filter((t) => t.id !== 'bulanan').map((t) => (
          <TabsContent key={t.id} value={t.id} className="space-y-4">
            {report ? (
              <>
                {t.id === 'ringkasan' && <SummaryCards summary={report.summary} />}
                <ReportTableView table={tableOf(report.tables, t.id)} />
              </>
            ) : query.error ? (
              <p className="text-sm text-destructive">
                Laporan gagal dimuat: {query.error.message}
              </p>
            ) : (
              <PageLoading />
            )}
          </TabsContent>
        ))}
        <TabsContent value="bulanan">
          <MonthlyRecap />
        </TabsContent>
      </Tabs>
    </OwnerPage>
  )
}

function tableOf(tables: readonly ReportTable[], id: TabId): ReportTable {
  const table = tables.find((t) => t.id === id)
  if (!table) throw new Error(`Tabel ${id} tidak ada`)
  return table
}

/** Long tables render this many rows first; the export always has every row. */
const FIRST_ROWS = 200

function ReportTableView({ table }: { table: ReportTable }) {
  const [showAll, setShowAll] = useState(false)
  const rows = showAll ? table.rows : table.rows.slice(0, FIRST_ROWS)
  const emphasis = new Set(table.emphasis ?? [])
  const text = (value: Cell, money: boolean | undefined) =>
    value === null || value === undefined
      ? ''
      : money && typeof value === 'number'
        ? formatDigits(value)
        : String(value)
  const tone = (value: Cell, money: boolean | undefined) =>
    money && typeof value === 'number' && value < 0 ? 'text-destructive' : undefined

  return (
    <Card className="gap-0 py-0">
      <div className="relative max-h-[70vh] overflow-auto">
        <table className="w-full border-separate border-spacing-0 text-sm">
          <caption className="sr-only">{table.title}</caption>
          <thead className="sticky top-0 z-10">
            <tr>
              {table.columns.map((c) => (
                <th
                  key={c.label}
                  scope="col"
                  className={cn(
                    'border-b bg-muted px-3 py-2 font-medium whitespace-nowrap',
                    c.money ? 'text-right' : 'text-left',
                  )}
                >
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, r) => (
              <tr key={r} className={cn('hover:bg-muted/30', emphasis.has(r) && 'font-semibold')}>
                {row.map((value, i) => {
                  const money = table.columns[i]?.money
                  return (
                    <td
                      key={i}
                      className={cn(
                        'border-b px-3 py-1.5',
                        money ? 'text-right whitespace-nowrap tabular-nums' : 'text-left',
                        i === 0 && 'whitespace-pre-wrap',
                        tone(value, money),
                      )}
                    >
                      {text(value, money)}
                    </td>
                  )
                })}
              </tr>
            ))}
            {table.rows.length === 0 && (
              <tr>
                <td
                  colSpan={table.columns.length}
                  className="py-10 text-center text-muted-foreground"
                >
                  Tidak ada data di periode ini
                </td>
              </tr>
            )}
          </tbody>
          {table.footer && table.rows.length > 0 && (
            <tfoot className="sticky bottom-0">
              <tr className="font-semibold">
                {table.footer.map((value, i) => {
                  const money = table.columns[i]?.money
                  return (
                    <td
                      key={i}
                      className={cn(
                        'border-t-2 bg-card px-3 py-2',
                        money ? 'text-right whitespace-nowrap tabular-nums' : 'text-left',
                        tone(value, money),
                      )}
                    >
                      {text(value, money)}
                    </td>
                  )
                })}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      {(table.rows.length > FIRST_ROWS || table.note) && (
        <div className="flex flex-wrap items-center gap-3 border-t px-3 py-2 text-xs text-muted-foreground">
          {table.note && <p className="min-w-0 flex-1">{table.note}</p>}
          {table.rows.length > FIRST_ROWS && !showAll && (
            <Button variant="outline" size="sm" onClick={() => setShowAll(true)}>
              Tampilkan semua {table.rows.length} baris
            </Button>
          )}
        </div>
      )}
    </Card>
  )
}
