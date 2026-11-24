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
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import {
  BEGINNING_OF_RECORDS,
  fetchExpenses,
  fetchHistoryRange,
  fetchPeriodTotals,
  fetchTransactions,
  fetchVehicleDays,
  fetchVehicleMonths,
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
import {
  monthLabel,
  vehicleCategories,
  vehicleCategoryTable,
  vehicleDailyTable,
  vehicleMonthlyTable,
  vehicleYearlyTable,
} from './vehicle-report'

// Laporan (decision #41): every table of a period in tabs, exported as one workbook (a
// sheet per tab) or one PDF. The "Bulanan" tab keeps the spreadsheet layout per month.

type TabId = ReportTabId | 'kendaraan' | 'bulanan'

/** Tabs with their own data and export, outside the period workbook. */
const OWN_TABS: readonly TabId[] = ['kendaraan', 'bulanan']

const TABS: { id: TabId; label: string }[] = [
  { id: 'ringkasan', label: 'Ringkasan' },
  { id: 'harian', label: 'Harian' },
  { id: 'pemasukan', label: 'Pemasukan' },
  { id: 'pengeluaran', label: 'Pengeluaran' },
  { id: 'kategori', label: 'Per Kategori' },
  { id: 'kendaraan', label: 'Kendaraan' },
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
    enabled: !OWN_TABS.includes(tab),
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
          : tab === 'kendaraan'
            ? `${business.name} · kendaraan per kategori: harian ${label}, bulanan & tahunan sejak data pertama`
            : `${business.name} · ${label} · kumulatif sejak data pertama`
      }
      actions={
        tab !== 'bulanan' && (
          <>
            <PeriodPicker period={period} />
            {tab !== 'kendaraan' && (
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
                    Excel — {TABS.length - OWN_TABS.length} sheet
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => void exportAs('pdf')}>
                    <FileTextIcon />
                    PDF — A4 mendatar
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
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

        {TABS.filter((t) => !OWN_TABS.includes(t.id)).map((t) => (
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
        <TabsContent value="kendaraan" className="space-y-4">
          <VehicleReport period={period} />
        </TabsContent>
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

type VehicleView = 'harian' | 'bulanan' | 'tahunan' | 'kategori'

const VEHICLE_VIEWS: { id: VehicleView; label: string }[] = [
  { id: 'harian', label: 'Per hari' },
  { id: 'bulanan', label: 'Per bulan' },
  { id: 'tahunan', label: 'Per tahun' },
  { id: 'kategori', label: 'Kumulatif' },
]

/**
 * Decision #43: vehicles per category per day (picked period, cashier sales), and per
 * month / year / cumulative since the first Olsera report.
 */
function VehicleReport({ period }: { period: ReturnType<typeof usePeriod> }) {
  const { business, catalogCategories } = useOwnerData()
  const [view, setView] = useState<VehicleView>('harian')
  const { range, firstDayKey, lastDayKey } = period
  const days = useQuery({
    queryKey: keys.report(business.id, 'vehicle-days', firstDayKey, lastDayKey),
    queryFn: () => fetchVehicleDays(business.id, range.from, range.to),
  })
  const months = useQuery({
    queryKey: keys.report(business.id, 'vehicle-months'),
    queryFn: () => fetchVehicleMonths(business.id),
  })

  const catalog = useMemo(
    () =>
      catalogCategories.filter((c) => c.countsVehicles).map((c) => ({ id: c.id, name: c.name })),
    [catalogCategories],
  )
  const tables = useMemo(() => {
    if (!days.data || !months.data) return null
    const monthCats = vehicleCategories(catalog, months.data)
    return {
      harian: vehicleDailyTable(days.data, vehicleCategories(catalog, days.data)),
      bulanan: vehicleMonthlyTable(months.data, monthCats),
      tahunan: vehicleYearlyTable(months.data, monthCats),
      kategori: vehicleCategoryTable(months.data, monthCats),
    }
  }, [days.data, months.data, catalog])

  async function exportAs(format: 'xlsx' | 'pdf') {
    if (!tables) return
    const toastId = toast.loading('Menyiapkan file…')
    const meta: ReportMeta = {
      businessName: business.name,
      period: `Harian ${periodLabel(firstDayKey, lastDayKey)}; bulanan & tahunan sejak data pertama`,
      createdAt: formatDateTime(new Date(), business.timezone),
    }
    const fileName = `${business.name} - Kendaraan ${firstDayKey} sd ${lastDayKey}.${format}`
    const all = [tables.harian, tables.bulanan, tables.tahunan, tables.kategori]
    try {
      if (format === 'xlsx') await downloadReportWorkbook(fileName, all, meta)
      else await downloadReportPdf(fileName, all, meta)
      toast.success('File siap diunduh', { id: toastId })
    } catch {
      toast.error('Ekspor gagal. Coba lagi.', { id: toastId })
    }
  }

  const error = days.error ?? months.error
  if (error) {
    return <p className="text-sm text-destructive">Data kendaraan gagal dimuat: {error.message}</p>
  }
  if (!tables || !months.data) return <PageLoading />

  const cumulative = tables.kategori
  const firstMonth = months.data[0]?.monthKey
  const total = cumulative.footer?.[1]
  return (
    <>
      <section
        aria-label="Kumulatif per kategori"
        className="grid grid-cols-2 gap-3 lg:grid-cols-4"
      >
        {cumulative.rows.map((row) => (
          <Card key={String(row[0])} className="gap-1 px-4 py-3">
            <p className="truncate text-xs font-medium text-muted-foreground">{String(row[0])}</p>
            <p className="text-xl font-semibold tracking-tight tabular-nums">
              {typeof row[1] === 'number' ? formatDigits(row[1]) : '–'}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {String(row[2] ?? '')} · sejak {String(row[3] ?? '')}
            </p>
          </Card>
        ))}
        <Card className="gap-1 px-4 py-3 ring-2 ring-primary/40">
          <p className="text-xs font-medium text-muted-foreground">Total kendaraan</p>
          <p className="text-xl font-semibold tracking-tight tabular-nums">
            {typeof total === 'number' ? formatDigits(total) : '–'}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {firstMonth ? `sejak ${monthLabel(firstMonth)}` : 'belum ada data'}
          </p>
        </Card>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <ToggleGroup
          type="single"
          variant="outline"
          value={view}
          onValueChange={(value) => value && setView(value as VehicleView)}
          aria-label="Tampilan kendaraan"
          className="flex-wrap"
        >
          {VEHICLE_VIEWS.map((v) => (
            <ToggleGroupItem key={v.id} value={v.id} className="h-10 px-4">
              {v.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline">
              <DownloadIcon />
              Ekspor kendaraan
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => void exportAs('xlsx')}>
              <FileSpreadsheetIcon />
              Excel, 4 sheet
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => void exportAs('pdf')}>
              <FileTextIcon />
              PDF, A4 mendatar
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <ReportTableView key={view} table={tables[view]} />
    </>
  )
}
