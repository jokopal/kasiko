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
  vehicleCumulativeTable,
  vehicleDailyTable,
  vehicleMonthlyTable,
  vehicleOverview,
  vehicleSeries,
  vehicleYearlyTable,
  type VehicleDetail,
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
  // A category heading over its services when columns carry a group (Kendaraan tab).
  const groups = table.columns.some((c) => c.group)
    ? table.columns.reduce<{ label: string; span: number }[]>((runs, c) => {
        const label = c.group ?? ''
        const last = runs.at(-1)
        if (last && last.label === label && label !== '') last.span += 1
        else runs.push({ label, span: 1 })
        return runs
      }, [])
    : null
  // The first column stays in view while a wide table scrolls sideways.
  const pin = (i: number, surface: string) => i === 0 && cn('sticky left-0 z-[1]', surface)

  return (
    <Card className="gap-0 py-0">
      <div className="relative max-h-[70vh] overflow-auto">
        <table className="w-full border-separate border-spacing-0 text-sm">
          <caption className="sr-only">{table.title}</caption>
          <thead className="sticky top-0 z-10">
            {groups && (
              <tr>
                {groups.map((g, i) => (
                  <th
                    key={i}
                    scope="colgroup"
                    colSpan={g.span}
                    className={cn(
                      'bg-muted px-3 pt-2 pb-1 text-center text-xs font-medium whitespace-nowrap text-muted-foreground',
                      g.label && 'border-x border-background',
                      pin(i, 'bg-muted'),
                    )}
                  >
                    {g.label}
                  </th>
                ))}
              </tr>
            )}
            <tr>
              {table.columns.map((c, i) => (
                <th
                  key={i}
                  scope="col"
                  className={cn(
                    'border-b bg-muted px-3 py-2 font-medium whitespace-nowrap',
                    c.money ? 'text-right' : 'text-left',
                    c.strong && 'text-foreground',
                    pin(i, 'bg-muted'),
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
                        table.columns[i]?.strong && 'bg-muted/40 font-medium',
                        pin(i, 'bg-card'),
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
                        pin(i, 'bg-card'),
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

type VehicleView = 'harian' | 'bulanan' | 'tahunan' | 'kumulatif'

const VEHICLE_VIEWS: { id: VehicleView; label: string }[] = [
  { id: 'harian', label: 'Per hari' },
  { id: 'bulanan', label: 'Per bulan' },
  { id: 'tahunan', label: 'Per tahun' },
  { id: 'kumulatif', label: 'Kumulatif' },
]

const VEHICLE_DETAILS: { id: VehicleDetail; label: string }[] = [
  { id: 'kategori', label: 'Kategori' },
  { id: 'layanan', label: 'Jenis layanan' },
]

// Categorical blue shared with the dashboard vehicle panel; never the brand color.
const VEHICLE_SERIES = '#2a78d6'

const SEGMENT = 'h-10 px-4 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground'

/**
 * Decision #43: vehicles per category or per catalog service, per day (picked period,
 * cashier sales) and per month / year / cumulative since the first Olsera report.
 */
function VehicleReport({ period }: { period: ReturnType<typeof usePeriod> }) {
  const { business, catalogCategories, catalogItems } = useOwnerData()
  const [view, setView] = useState<VehicleView>('bulanan')
  const [detail, setDetail] = useState<VehicleDetail>('kategori')
  const { range, firstDayKey, lastDayKey } = period
  const days = useQuery({
    queryKey: keys.report(business.id, 'vehicle-days', firstDayKey, lastDayKey),
    queryFn: () => fetchVehicleDays(business.id, range.from, range.to),
  })
  const months = useQuery({
    queryKey: keys.report(business.id, 'vehicle-months'),
    queryFn: () => fetchVehicleMonths(business.id),
  })

  const catalog = useMemo(() => {
    const categories = [...catalogCategories]
      .filter((c) => c.countsVehicles)
      .sort((a, b) => a.sortOrder - b.sortOrder)
    return {
      categories: categories.map((c) => ({ id: c.id, name: c.name })),
      items: [...catalogItems]
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((i) => ({ id: i.id, name: i.name, categoryId: i.categoryId })),
    }
  }, [catalogCategories, catalogItems])

  const tables = useMemo(() => {
    if (!days.data || !months.data) return null
    const monthSeries = vehicleSeries(catalog, months.data, detail)
    return {
      harian: vehicleDailyTable(days.data, vehicleSeries(catalog, days.data, detail), detail),
      bulanan: vehicleMonthlyTable(months.data, monthSeries, detail),
      tahunan: vehicleYearlyTable(months.data, monthSeries, detail),
      kumulatif: vehicleCumulativeTable(months.data, monthSeries, detail),
    }
  }, [days.data, months.data, catalog, detail])
  const overview = useMemo(
    () => (months.data ? vehicleOverview(months.data, catalog) : null),
    [months.data, catalog],
  )

  async function exportAs(format: 'xlsx' | 'pdf') {
    if (!tables) return
    const toastId = toast.loading('Menyiapkan file…')
    const by = detail === 'layanan' ? 'per jenis layanan' : 'per kategori'
    const meta: ReportMeta = {
      businessName: business.name,
      period: `Kendaraan ${by}; harian ${periodLabel(firstDayKey, lastDayKey)}, bulanan & tahunan sejak data pertama`,
      createdAt: formatDateTime(new Date(), business.timezone),
    }
    const fileName = `${business.name} - Kendaraan ${by} ${firstDayKey} sd ${lastDayKey}.${format}`
    const all = [tables.harian, tables.bulanan, tables.tahunan, tables.kumulatif]
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
  if (!tables || !overview) return <PageLoading />

  return (
    <>
      <Card className="gap-0 py-0">
        <div className="grid gap-6 p-5 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] md:p-6">
          <div className="space-y-1">
            <p className="text-sm font-medium text-muted-foreground">Total kendaraan</p>
            <p className="text-4xl font-semibold tracking-tight tabular-nums">
              {formatDigits(overview.total)}
            </p>
            <p className="text-sm text-muted-foreground">
              {overview.firstMonth
                ? `sejak ${monthLabel(overview.firstMonth)}, Olsera + Kasiko`
                : 'belum ada data'}
            </p>
            {overview.top && (
              <p className="pt-3 text-sm">
                <span className="text-muted-foreground">Terlaris: </span>
                <span className="font-medium">{overview.top.name}</span>
                <span className="text-muted-foreground tabular-nums">
                  {' '}
                  · {formatDigits(overview.top.vehicles)}
                </span>
              </p>
            )}
          </div>
          <ul className="space-y-3 self-center" aria-label="Kumulatif per kategori">
            {overview.categories.map((c) => (
              <li key={c.id} className="space-y-1.5">
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="truncate font-medium">{c.name}</span>
                  <span className="shrink-0 tabular-nums">
                    {formatDigits(c.vehicles)}
                    <span className="ml-2 inline-block w-10 text-right text-muted-foreground">
                      {Math.round(c.share * 100)}%
                    </span>
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-muted" aria-hidden>
                  <div
                    className="h-1.5 rounded-full"
                    style={{
                      width: `${Math.max(c.share * 100, 1)}%`,
                      backgroundColor: VEHICLE_SERIES,
                    }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </div>
      </Card>

      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground" id="vehicle-view-label">
              Waktu
            </p>
            <ToggleGroup
              type="single"
              variant="outline"
              value={view}
              onValueChange={(value) => value && setView(value as VehicleView)}
              aria-labelledby="vehicle-view-label"
            >
              {VEHICLE_VIEWS.map((v) => (
                <ToggleGroupItem key={v.id} value={v.id} className={SEGMENT}>
                  {v.label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground" id="vehicle-detail-label">
              Rincian
            </p>
            <ToggleGroup
              type="single"
              variant="outline"
              value={detail}
              onValueChange={(value) => value && setDetail(value as VehicleDetail)}
              aria-labelledby="vehicle-detail-label"
            >
              {VEHICLE_DETAILS.map((d) => (
                <ToggleGroupItem key={d.id} value={d.id} className={SEGMENT}>
                  {d.label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="h-10">
              <DownloadIcon />
              Ekspor
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

      <section aria-labelledby="vehicle-table-title" className="space-y-2">
        <h2 id="vehicle-table-title" className="text-sm font-semibold">
          {tables[view].title} {detail === 'layanan' ? 'per jenis layanan' : 'per kategori'}
          {view === 'harian' && (
            <span className="font-normal text-muted-foreground">
              {' '}
              · {periodLabel(firstDayKey, lastDayKey)}
            </span>
          )}
        </h2>
        <ReportTableView key={`${view}-${detail}`} table={tables[view]} />
      </section>
    </>
  )
}
