import {
  ArrowDownRightIcon,
  ArrowUpRightIcon,
  MinusIcon,
  SlidersHorizontalIcon,
} from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { useMemo, useState, type ReactNode } from 'react'
import { Bar, BarChart, CartesianGrid, ComposedChart, Line, XAxis, YAxis } from 'recharts'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'
import {
  KPI_INFO,
  PANEL_INFO,
  visibleIds,
  type KpiId,
  type PanelId,
} from '@/features/business/config'
import { KindDot } from '@/features/expenses/kind'
import { KIND_COLOR } from '@/features/expenses/kind-colors'
import { PageLoading } from '@/components/page-loading'
import {
  fetchBusyHours,
  fetchDailyTotals,
  fetchExpenseByCategory,
  fetchFreeCash,
  fetchMonthlyTotals,
  fetchPeriodTotals,
  fetchReserveBalance,
  fetchTopItems,
} from '@/features/data/owner'
import { useOwnerData } from '@/features/data/owner-data'
import { keys } from '@/features/data/query-client'
import { OwnerPage } from '@/features/owner/page'
import { formatShortDate, previousRange, startOfBusinessDayKey } from '@/lib/datetime'
import { formatRupiah, formatRupiahCompact } from '@/lib/money'
import {
  EXPENSE_KIND_LABEL,
  EXPENSE_KINDS,
  PAYMENT_METHOD_LABEL,
  PAYMENT_METHODS,
  type ExpenseKind,
} from '@/lib/types'
import { cn } from '@/lib/utils'
import { DashboardCustomizer } from './dashboard-customizer'
import {
  kindLookup,
  monthKeysEnding,
  percentChange,
  type MonthPoint,
  type PeriodTotals,
} from './finance'
import { PeriodPicker } from './period-picker'
import { usePeriod } from './use-period'

// Series colors are fixed categorical slots (validated with the dataviz palette checker),
// not the brand color: a series keeps its identity whichever business is selected.
const SERIES = { income: '#2a78d6', expense: '#eb6834' } as const
// Sequential blue ramp (steps 150 → 600) for the busy-hours heatmap.
const HEAT_RAMP = ['#b7d3f6', '#86b6ef', '#5598e7', '#2a78d6', '#1c5cab', '#184f95']

const trendConfig = {
  income: { label: 'Pemasukan', color: SERIES.income },
  expense: { label: 'Pengeluaran', color: SERIES.expense },
} satisfies ChartConfig

const monthlyConfig = {
  income: { label: 'Pemasukan', color: SERIES.income },
  spend: { label: 'Pengeluaran usaha', color: SERIES.expense },
  // Derived total in text ink, so it never borrows a categorical hue.
  profit: { label: 'Profit bersih', color: 'var(--foreground)' },
} satisfies ChartConfig

const MONTHS_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'Mei',
  'Jun',
  'Jul',
  'Agu',
  'Sep',
  'Okt',
  'Nov',
  'Des',
]
const monthLabel = (monthKey: string) =>
  `${MONTHS_SHORT[Number(monthKey.slice(5, 7)) - 1] ?? ''} ${monthKey.slice(2, 4)}`

/** Panels that need more width; the grid packs the rest around them. */
const PANEL_SPAN: Partial<Record<PanelId, string>> = {
  trend: 'lg:col-span-2',
  monthly: 'lg:col-span-2',
  busyHours: 'lg:col-span-3',
}

export function DashboardPage() {
  const { business, config, expenseCategories } = useOwnerData()
  const tz = business.timezone
  const period = usePeriod(tz)
  const { range } = period
  const [customizing, setCustomizing] = useState(false)

  // Every number comes from the database (AGENTS.md section 7), fetched in parallel.
  const query = useQuery({
    queryKey: keys.report(business.id, 'dashboard', period.firstDayKey, period.lastDayKey),
    queryFn: async () => {
      const id = business.id
      const before = previousRange(range)
      const [current, previous, reserve, cash, series, months, top, expenseMix, heat] =
        await Promise.all([
          fetchPeriodTotals(id, range.from, range.to),
          fetchPeriodTotals(id, before.from, before.to),
          fetchReserveBalance(id, range.to),
          fetchFreeCash(id, range.to),
          fetchDailyTotals(id, period.firstDayKey, period.lastDayKey),
          fetchMonthlyTotals(id, monthKeysEnding(period.lastDayKey, 12)),
          fetchTopItems(id, range.from, range.to, 6),
          fetchExpenseByCategory(id, range.from, range.to),
          fetchBusyHours(id, range.from, range.to),
        ])
      return { current, previous, reserve, freeCash: cash, series, months, top, expenseMix, heat }
    },
  })
  const kindOf = useMemo(() => kindLookup(expenseCategories), [expenseCategories])

  if (!query.data) {
    return (
      <OwnerPage title="Dashboard" actions={<PeriodPicker period={period} />}>
        {query.error ? (
          <p className="text-sm text-destructive">Rekap gagal dimuat: {query.error.message}</p>
        ) : (
          <PageLoading />
        )}
      </OwnerPage>
    )
  }
  const stats = { ...query.data, kindOf }
  const { current, previous } = stats
  const categoryName = (id: string) => expenseCategories.find((c) => c.id === id)?.name ?? 'Lainnya'

  const kpiValue: Record<KpiId, { value: number; previous?: number; higherIsWorse?: boolean }> = {
    income: { value: current.income, previous: previous.income },
    expense: { value: current.expense, previous: previous.expense, higherIsWorse: true },
    operatingProfit: { value: current.operatingProfit, previous: previous.operatingProfit },
    profit: { value: current.profit, previous: previous.profit },
    drawings: { value: current.drawings, previous: previous.drawings, higherIsWorse: true },
    netCashFlow: { value: current.netCashFlow, previous: previous.netCashFlow },
    reserve: { value: stats.reserve },
    freeCash: { value: stats.freeCash },
    discounts: {
      value: current.discountTotal,
      previous: previous.discountTotal,
      higherIsWorse: true,
    },
  }

  const panels: Record<PanelId, () => ReactNode> = {
    profitBreakdown: () => <ProfitBreakdown totals={current} />,
    trend: () => <DailyTrend series={stats.series} tz={tz} />,
    monthly: () => <MonthlyTrend months={stats.months} />,
    paymentMethods: () => (
      <BarList
        rows={PAYMENT_METHODS.map((m) => ({
          label: PAYMENT_METHOD_LABEL[m],
          value: current.incomeByMethod[m],
        }))}
      />
    ),
    topItems: () => (
      <BarList
        rows={stats.top.map((item) => ({
          label: item.name,
          value: item.revenue,
          detail: `${item.qty}×`,
        }))}
        empty="Belum ada penjualan di periode ini"
      />
    ),
    expenseMix: () => (
      <ExpenseMix
        totals={current}
        rows={stats.expenseMix.slice(0, 8).map((row) => ({
          label: categoryName(row.categoryId),
          value: row.amount,
          kind: stats.kindOf(row.categoryId),
        }))}
        more={Math.max(0, stats.expenseMix.length - 8)}
      />
    ),
    busyHours: () => <BusyHoursHeatmap matrix={stats.heat} />,
  }

  const panelDescription: Partial<Record<PanelId, string>> = {
    paymentMethods: `${current.transactionCount} transaksi lunas${
      current.historicalIncome > 0 ? ' · data impor tanpa metode bayar' : ''
    }`,
    expenseMix: `Laci ${formatRupiah(current.drawerExpense)} · Owner ${formatRupiah(current.ownerExpense)}`,
  }

  const kpis = visibleIds(config.dashboard.kpis)
  const visiblePanels = visibleIds(config.dashboard.panels)

  return (
    <OwnerPage
      title="Dashboard"
      description={
        <>
          {business.name} · dibandingkan dengan periode sebelumnya yang sama panjang
          {current.historicalDays > 0 && ` · termasuk ${current.historicalDays} hari data impor`}
        </>
      }
      actions={
        <>
          <PeriodPicker period={period} />
          <Button variant="outline" onClick={() => setCustomizing(true)}>
            <SlidersHorizontalIcon />
            Sesuaikan
          </Button>
        </>
      }
    >
      {kpis.length > 0 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {kpis.map((id) => {
            const kpi = kpiValue[id]
            return (
              <Kpi
                key={id}
                label={KPI_INFO[id].label}
                hint={KPI_INFO[id].hint}
                value={kpi.value}
                change={
                  kpi.previous === undefined ? undefined : percentChange(kpi.value, kpi.previous)
                }
                higherIsWorse={kpi.higherIsWorse}
                emphasis={id === 'profit'}
              />
            )
          })}
        </div>
      )}

      <div className="grid grid-flow-row-dense grid-cols-1 gap-4 lg:grid-cols-3">
        {visiblePanels.map((id) => (
          <Card key={id} className={cn('min-w-0', PANEL_SPAN[id])}>
            <CardHeader>
              <CardTitle>{PANEL_INFO[id].label}</CardTitle>
              <CardDescription>{panelDescription[id] ?? PANEL_INFO[id].hint}</CardDescription>
            </CardHeader>
            <CardContent>{panels[id]()}</CardContent>
          </Card>
        ))}
        {visiblePanels.length === 0 && (
          <p className="py-10 text-center text-sm text-muted-foreground lg:col-span-3">
            Semua panel disembunyikan. Pilih panel lewat tombol Sesuaikan.
          </p>
        )}
      </div>

      <DashboardCustomizer
        open={customizing}
        onOpenChange={setCustomizing}
        businessId={business.id}
        templateId={config.templateId}
        layout={config.dashboard}
      />
    </OwnerPage>
  )
}

function Kpi({
  label,
  hint,
  value,
  change,
  higherIsWorse = false,
  emphasis = false,
}: {
  label: string
  hint: string
  value: number
  change?: number | null
  higherIsWorse?: boolean
  emphasis?: boolean
}) {
  const direction = change === undefined || change === null ? 0 : Math.sign(Math.round(change))
  const good = higherIsWorse ? direction < 0 : direction > 0
  const Icon = direction > 0 ? ArrowUpRightIcon : direction < 0 ? ArrowDownRightIcon : MinusIcon
  return (
    <Card className={cn('gap-2 py-4', emphasis && 'ring-2 ring-primary/40')}>
      <CardContent className="space-y-1 px-4">
        <p className="text-sm text-muted-foreground" title={hint}>
          {label}
        </p>
        <p
          className={cn(
            'text-2xl font-semibold tracking-tight tabular-nums',
            value < 0 && 'text-destructive',
          )}
        >
          {formatRupiah(value)}
        </p>
        {change !== undefined ? (
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <span
              className={cn(
                'inline-flex items-center gap-0.5 font-medium',
                direction !== 0 && (good ? 'text-emerald-700' : 'text-red-700'),
              )}
            >
              <Icon className="size-3.5" aria-hidden />
              {change === null ? '—' : `${Math.abs(change).toFixed(0)}%`}
            </span>
            vs periode sebelumnya
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">{hint}</p>
        )}
      </CardContent>
    </Card>
  )
}

function DailyTrend({
  series,
  tz,
}: {
  series: { dayKey: string; income: number; expense: number }[]
  tz: string
}) {
  const label = (key: string) => formatShortDate(startOfBusinessDayKey(key, tz), tz)
  if (series.every((point) => point.income === 0 && point.expense === 0)) {
    return <p className="py-6 text-center text-sm text-muted-foreground">Belum ada data</p>
  }
  return (
    <ChartContainer config={trendConfig} className="aspect-auto h-64 w-full md:h-72">
      <BarChart data={series} barGap={2} margin={{ left: 4, right: 4 }}>
        <CartesianGrid vertical={false} strokeOpacity={0.5} />
        <XAxis
          dataKey="dayKey"
          tickLine={false}
          axisLine={false}
          minTickGap={16}
          tickFormatter={label}
        />
        <YAxis
          width={88}
          tickLine={false}
          axisLine={false}
          tickFormatter={(value: number) => formatRupiahCompact(value)}
        />
        <ChartTooltip
          cursor={{ fillOpacity: 0.4 }}
          content={
            <ChartTooltipContent
              labelFormatter={(_, payload) => {
                const key = (payload[0]?.payload as { dayKey?: string } | undefined)?.dayKey
                return key ? label(key) : ''
              }}
              formatter={(value, name) => (
                <TooltipRow
                  color={trendConfig[name as keyof typeof trendConfig].color}
                  label={trendConfig[name as keyof typeof trendConfig].label}
                  value={Number(value)}
                />
              )}
            />
          }
        />
        <ChartLegend content={<ChartLegendContent />} />
        <Bar
          dataKey="income"
          fill="var(--color-income)"
          radius={[4, 4, 0, 0]}
          maxBarSize={28}
          isAnimationActive={false}
        />
        <Bar
          dataKey="expense"
          fill="var(--color-expense)"
          radius={[4, 4, 0, 0]}
          maxBarSize={28}
          isAnimationActive={false}
        />
      </BarChart>
    </ChartContainer>
  )
}

function MonthlyTrend({ months }: { months: MonthPoint[] }) {
  const rows = months.map((m) => ({
    monthKey: m.monthKey,
    income: m.income,
    spend: m.operatingExpense + m.nonOperatingExpense,
    profit: m.profit,
    drawings: m.drawings,
  }))
  if (rows.every((r) => r.income === 0 && r.spend === 0)) {
    return <p className="py-6 text-center text-sm text-muted-foreground">Belum ada data</p>
  }
  return (
    <ChartContainer config={monthlyConfig} className="aspect-auto h-64 w-full md:h-72">
      <ComposedChart data={rows} barGap={2} margin={{ left: 4, right: 4 }}>
        <CartesianGrid vertical={false} strokeOpacity={0.5} />
        <XAxis dataKey="monthKey" tickLine={false} axisLine={false} tickFormatter={monthLabel} />
        <YAxis
          width={88}
          tickLine={false}
          axisLine={false}
          tickFormatter={(value: number) => formatRupiahCompact(value)}
        />
        <ChartTooltip
          cursor={{ fillOpacity: 0.4 }}
          content={
            <ChartTooltipContent
              labelFormatter={(_, payload) => {
                const row = payload[0]?.payload as (typeof rows)[number] | undefined
                return row ? monthLabel(row.monthKey) : ''
              }}
              formatter={(value, name, item) => {
                const key = name as keyof typeof monthlyConfig
                const row = item.payload as (typeof rows)[number]
                return (
                  <div className="grid w-full gap-1">
                    <TooltipRow
                      color={monthlyConfig[key].color}
                      label={monthlyConfig[key].label}
                      value={Number(value)}
                    />
                    {key === 'profit' && row.drawings > 0 && (
                      <p className="text-muted-foreground">
                        Prive {formatRupiah(row.drawings)} tidak mengurangi profit
                      </p>
                    )}
                  </div>
                )
              }}
            />
          }
        />
        <ChartLegend content={<ChartLegendContent />} />
        <Bar
          dataKey="income"
          fill="var(--color-income)"
          radius={[4, 4, 0, 0]}
          maxBarSize={22}
          isAnimationActive={false}
        />
        <Bar
          dataKey="spend"
          fill="var(--color-spend)"
          radius={[4, 4, 0, 0]}
          maxBarSize={22}
          isAnimationActive={false}
        />
        <Line
          dataKey="profit"
          type="monotone"
          stroke="var(--color-profit)"
          strokeWidth={2}
          dot={{ r: 4, strokeWidth: 2, fill: 'var(--card)' }}
          isAnimationActive={false}
        />
      </ComposedChart>
    </ChartContainer>
  )
}

function TooltipRow({ color, label, value }: { color: string; label: string; value: number }) {
  return (
    <div className="flex w-full items-center justify-between gap-4">
      <span className="flex items-center gap-1.5 text-muted-foreground">
        <span className="size-2.5 rounded-[2px]" style={{ backgroundColor: color }} />
        {label}
      </span>
      <span className="font-medium tabular-nums">{formatRupiah(value)}</span>
    </div>
  )
}

/**
 * Income-statement waterfall as an HTML list: each deduction floats where it bites, each
 * subtotal starts at zero. Values are always printed, so the bars are never the only cue.
 */
function ProfitBreakdown({ totals }: { totals: PeriodTotals }) {
  const scale = Math.max(totals.income, totals.expense, 1)
  type Step = { label: string; value: number; kind?: ExpenseKind; subtotal?: boolean }
  const steps: Step[] = [
    { label: 'Pemasukan', value: totals.income, subtotal: true },
    { label: 'Biaya operasional', value: totals.operatingExpense, kind: 'operating' },
    { label: 'Profit operasional', value: totals.operatingProfit, subtotal: true },
    { label: 'Cicilan & aset', value: totals.nonOperatingExpense, kind: 'non_operating' },
    { label: 'Profit bersih', value: totals.profit, subtotal: true },
    { label: 'Prive', value: totals.drawings, kind: 'drawing' },
    { label: 'Arus kas bersih', value: totals.netCashFlow, subtotal: true },
  ]
  let running = 0
  const clamp = (v: number) => Math.min(Math.max(v / scale, 0), 1) * 100
  return (
    <ul className="space-y-2.5">
      {steps.map((step) => {
        let left: number
        let width: number
        if (step.subtotal) {
          running = step.value
          left = 0
          width = clamp(step.value)
        } else {
          left = clamp(running - step.value)
          width = clamp(running) - left
          running -= step.value
        }
        const share = totals.income > 0 ? Math.round((step.value / totals.income) * 100) : null
        return (
          <li key={step.label} className="space-y-1">
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span
                className={cn('flex items-center gap-1.5 truncate', step.subtotal && 'font-medium')}
              >
                {step.kind && <KindDot kind={step.kind} />}
                {step.subtotal ? step.label : `− ${step.label}`}
              </span>
              <span
                className={cn(
                  'shrink-0 tabular-nums',
                  step.subtotal && 'font-semibold',
                  step.subtotal && step.value < 0 && 'text-destructive',
                )}
              >
                {share !== null && step.label !== 'Pemasukan' && (
                  <span className="mr-2 text-xs font-normal text-muted-foreground">{share}%</span>
                )}
                {formatRupiah(step.value)}
              </span>
            </div>
            <div className="relative h-2 rounded-full bg-muted" aria-hidden>
              <div
                className="absolute inset-y-0 rounded-full"
                style={{
                  left: `${left}%`,
                  width: `${Math.max(width, step.value === 0 ? 0 : 0.8)}%`,
                  backgroundColor: step.kind ? KIND_COLOR[step.kind] : SERIES.income,
                }}
              />
            </div>
          </li>
        )
      })}
    </ul>
  )
}

function ExpenseMix({
  totals,
  rows,
  more,
}: {
  totals: PeriodTotals
  rows: { label: string; value: number; kind: ExpenseKind }[]
  more: number
}) {
  const byKind: Record<ExpenseKind, number> = {
    operating: totals.operatingExpense,
    non_operating: totals.nonOperatingExpense,
    drawing: totals.drawings,
  }
  if (totals.expense === 0) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        Belum ada pengeluaran di periode ini
      </p>
    )
  }
  return (
    <div className="space-y-4">
      {/* 100% composition by kind; 2px surface gaps keep segments distinct. */}
      <div className="flex h-3 gap-0.5 overflow-hidden rounded-full" aria-hidden>
        {EXPENSE_KINDS.filter((k) => byKind[k] > 0).map((kind) => (
          <div
            key={kind}
            style={{ flexGrow: byKind[kind], backgroundColor: KIND_COLOR[kind] }}
            title={`${EXPENSE_KIND_LABEL[kind]} ${formatRupiah(byKind[kind])}`}
          />
        ))}
      </div>
      <ul className="grid gap-1 text-xs sm:grid-cols-3">
        {EXPENSE_KINDS.map((kind) => (
          <li key={kind} className="flex items-center gap-1.5">
            <KindDot kind={kind} />
            <span className="text-muted-foreground">{EXPENSE_KIND_LABEL[kind]}</span>
            <span className="ml-auto font-medium tabular-nums sm:ml-0">
              {Math.round((byKind[kind] / totals.expense) * 100)}%
            </span>
          </li>
        ))}
      </ul>
      <BarList rows={rows} />
      {more > 0 && (
        <p className="text-xs text-muted-foreground">+{more} kategori lain di Rekap Bulanan</p>
      )}
    </div>
  )
}

/** Ranked horizontal bars as an HTML list: readable labels, values in text ink. */
function BarList({
  rows,
  empty = 'Belum ada data',
}: {
  rows: { label: string; value: number; detail?: string; kind?: ExpenseKind }[]
  empty?: string
}) {
  const max = Math.max(...rows.map((r) => r.value), 0)
  if (max === 0) return <p className="py-6 text-center text-sm text-muted-foreground">{empty}</p>
  return (
    <ul className="space-y-3">
      {rows.map((row) => (
        <li key={row.label} className="space-y-1">
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="flex min-w-0 items-center gap-1.5">
              {row.kind && <KindDot kind={row.kind} />}
              <span className="truncate">{row.label}</span>
            </span>
            <span className="shrink-0 font-medium tabular-nums">
              {row.detail && (
                <span className="mr-2 font-normal text-muted-foreground">{row.detail}</span>
              )}
              {formatRupiah(row.value)}
            </span>
          </div>
          <div className="h-2 rounded-full bg-muted" aria-hidden>
            <div
              className="h-2 rounded-full"
              style={{
                width: `${Math.max((row.value / max) * 100, 1)}%`,
                backgroundColor: row.kind ? KIND_COLOR[row.kind] : SERIES.income,
              }}
            />
          </div>
        </li>
      ))}
    </ul>
  )
}

const WEEKDAY_LABELS = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab']
// Monday-first rows, matching the Indonesian work week.
const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0]

function BusyHoursHeatmap({ matrix }: { matrix: number[][] }) {
  const activeHours = Array.from({ length: 24 }, (_, h) => h).filter((h) =>
    matrix.some((row) => (row[h] ?? 0) > 0),
  )
  const max = Math.max(0, ...matrix.flat())
  if (max === 0 || activeHours.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">Belum ada transaksi</p>
  }
  const hours = Array.from(
    { length: Math.max(...activeHours) - Math.min(...activeHours) + 1 },
    (_, i) => Math.min(...activeHours) + i,
  )
  const shade = (count: number) =>
    count === 0
      ? 'var(--muted)'
      : HEAT_RAMP[Math.min(HEAT_RAMP.length - 1, Math.floor((count / max) * HEAT_RAMP.length))]

  return (
    // `relative` keeps the absolutely positioned sr-only cell labels inside the scroller;
    // without it they escape the clip and widen the whole page on phones.
    <div className="relative overflow-x-auto">
      <table className="w-full min-w-[520px] border-separate border-spacing-0.5 text-xs">
        <caption className="sr-only">Jumlah transaksi per hari dan jam</caption>
        <thead>
          <tr>
            <th className="w-10" />
            {hours.map((h) => (
              <th key={h} scope="col" className="font-normal text-muted-foreground tabular-nums">
                {String(h).padStart(2, '0')}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {WEEKDAY_ORDER.map((day) => (
            <tr key={day}>
              <th scope="row" className="pr-1 text-left font-normal text-muted-foreground">
                {WEEKDAY_LABELS[day]}
              </th>
              {hours.map((h) => {
                const count = matrix[day]?.[h] ?? 0
                return (
                  <td
                    key={h}
                    title={`${WEEKDAY_LABELS[day]} ${String(h).padStart(2, '0')}.00 — ${count} transaksi`}
                    className="h-7 rounded-[4px] transition-shadow hover:ring-2 hover:ring-foreground/40"
                    style={{ backgroundColor: shade(count) }}
                  >
                    <span className="sr-only">{count}</span>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-3 flex items-center justify-end gap-1.5 text-xs text-muted-foreground">
        Sepi
        {HEAT_RAMP.map((c) => (
          <span key={c} className="size-3 rounded-[3px]" style={{ backgroundColor: c }} />
        ))}
        Ramai
      </div>
    </div>
  )
}
