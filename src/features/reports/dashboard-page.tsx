import { ArrowDownRightIcon, ArrowUpRightIcon, MinusIcon } from 'lucide-react'
import { useMemo } from 'react'
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'
import { OwnerPage } from '@/features/owner/page'
import { useBusinessData } from '@/features/preview/selectors'
import { formatShortDate, previousRange, startOfBusinessDayKey } from '@/lib/datetime'
import { formatRupiah, formatRupiahCompact } from '@/lib/money'
import { PAYMENT_METHOD_LABEL, PAYMENT_METHODS } from '@/lib/types'
import { cn } from '@/lib/utils'
import {
  busyHours,
  dailySeries,
  expenseByCategory,
  freeCash,
  percentChange,
  periodTotals,
  reserveBalance,
  topItems,
} from './finance'
import { dayKeysBetween } from './period'
import { PeriodPicker } from './period-picker'
import { usePeriod } from './use-period'

// Series colors are fixed (validated categorical slots 1–2), not the brand color:
// a series keeps its identity whichever business is selected.
const SERIES = { income: '#2a78d6', expense: '#eb6834' } as const
// Sequential blue ramp (steps 150 → 600) for the busy-hours heatmap.
const HEAT_RAMP = ['#b7d3f6', '#86b6ef', '#5598e7', '#2a78d6', '#1c5cab', '#184f95']

const trendConfig = {
  income: { label: 'Pemasukan', color: SERIES.income },
  expense: { label: 'Pengeluaran', color: SERIES.expense },
} satisfies ChartConfig

export function DashboardPage() {
  const data = useBusinessData()
  const { business, transactions, expenses, reserveMovements, expenseCategories } = data
  const tz = business.timezone
  const period = usePeriod(tz)
  const { range } = period

  const stats = useMemo(() => {
    const current = periodTotals(transactions, expenses, range)
    const previous = periodTotals(transactions, expenses, previousRange(range))
    const days = dayKeysBetween(period.firstDayKey, period.lastDayKey)
    return {
      current,
      previous,
      reserve: reserveBalance(reserveMovements, range.to),
      freeCash: freeCash({
        openingCash: business.openingCash,
        transactions,
        expenses,
        reserveMovements,
        until: range.to,
      }),
      series: dailySeries(transactions, expenses, days, tz),
      top: topItems(transactions, range, 6),
      expenseMix: expenseByCategory(expenses, range),
      heat: busyHours(transactions, range, tz),
    }
  }, [transactions, expenses, reserveMovements, business.openingCash, range, period, tz])

  const { current, previous } = stats
  const categoryName = (id: string) => expenseCategories.find((c) => c.id === id)?.name ?? 'Lainnya'

  return (
    <OwnerPage
      title="Dashboard"
      description={`${business.name} · dibandingkan dengan periode sebelumnya yang sama panjang`}
      actions={<PeriodPicker period={period} />}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Kpi
          label="Pemasukan"
          value={current.income}
          change={percentChange(current.income, previous.income)}
        />
        <Kpi
          label="Pengeluaran"
          value={current.expense}
          change={percentChange(current.expense, previous.expense)}
          higherIsWorse
        />
        <Kpi
          label="Profit"
          value={current.profit}
          change={percentChange(current.profit, previous.profit)}
          emphasis
        />
        <Kpi label="Saldo cadangan" value={stats.reserve} note="Per akhir periode" />
        <Kpi label="Kas bebas" value={stats.freeCash} note="Per akhir periode" />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Tren harian</CardTitle>
            <CardDescription>Pemasukan dan pengeluaran per hari</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={trendConfig} className="aspect-auto h-64 w-full md:h-72">
              <BarChart data={stats.series} barGap={2} margin={{ left: 4, right: 4 }}>
                <CartesianGrid vertical={false} strokeOpacity={0.5} />
                <XAxis
                  dataKey="dayKey"
                  tickLine={false}
                  axisLine={false}
                  minTickGap={16}
                  tickFormatter={(key: string) =>
                    formatShortDate(startOfBusinessDayKey(key, tz), tz)
                  }
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
                        return key ? formatShortDate(startOfBusinessDayKey(key, tz), tz) : ''
                      }}
                      formatter={(value, name) => (
                        <div className="flex w-full items-center justify-between gap-4">
                          <span className="flex items-center gap-1.5 text-muted-foreground">
                            <span
                              className="size-2.5 rounded-[2px]"
                              style={{ backgroundColor: SERIES[name as keyof typeof SERIES] }}
                            />
                            {trendConfig[name as keyof typeof trendConfig].label}
                          </span>
                          <span className="font-medium tabular-nums">
                            {formatRupiah(Number(value))}
                          </span>
                        </div>
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
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Metode pembayaran</CardTitle>
            <CardDescription>{current.transactionCount} transaksi lunas</CardDescription>
          </CardHeader>
          <CardContent>
            <BarList
              rows={PAYMENT_METHODS.map((m) => ({
                label: PAYMENT_METHOD_LABEL[m],
                value: current.incomeByMethod[m],
              }))}
            />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Layanan terlaris</CardTitle>
            <CardDescription>Berdasarkan nilai penjualan</CardDescription>
          </CardHeader>
          <CardContent>
            <BarList
              rows={stats.top.map((item) => ({
                label: item.name,
                value: item.revenue,
                detail: `${item.qty}×`,
              }))}
              empty="Belum ada penjualan di periode ini"
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Komposisi pengeluaran</CardTitle>
            <CardDescription>
              Laci {formatRupiah(current.drawerExpense)} · Owner{' '}
              {formatRupiah(current.ownerExpense)}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <BarList
              rows={stats.expenseMix.map((row) => ({
                label: categoryName(row.categoryId),
                value: row.amount,
              }))}
              color={SERIES.expense}
              empty="Belum ada pengeluaran di periode ini"
            />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Jam & hari tersibuk</CardTitle>
          <CardDescription>Jumlah transaksi per jam (zona waktu usaha)</CardDescription>
        </CardHeader>
        <CardContent>
          <BusyHoursHeatmap matrix={stats.heat} />
        </CardContent>
      </Card>
    </OwnerPage>
  )
}

function Kpi({
  label,
  value,
  change,
  note,
  higherIsWorse = false,
  emphasis = false,
}: {
  label: string
  value: number
  change?: number | null
  note?: string
  higherIsWorse?: boolean
  emphasis?: boolean
}) {
  const direction = change === undefined || change === null ? 0 : Math.sign(Math.round(change))
  const good = higherIsWorse ? direction < 0 : direction > 0
  const Icon = direction > 0 ? ArrowUpRightIcon : direction < 0 ? ArrowDownRightIcon : MinusIcon
  return (
    <Card className={cn('gap-2 py-4', emphasis && 'ring-2 ring-primary/40')}>
      <CardContent className="space-y-1 px-4">
        <p className="text-sm text-muted-foreground">{label}</p>
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
          <p className="text-xs text-muted-foreground">{note}</p>
        )}
      </CardContent>
    </Card>
  )
}

/** Ranked horizontal bars as an HTML list: readable labels, values in text ink. */
function BarList({
  rows,
  color = SERIES.income,
  empty = 'Belum ada data',
}: {
  rows: { label: string; value: number; detail?: string }[]
  color?: string
  empty?: string
}) {
  const max = Math.max(...rows.map((r) => r.value), 0)
  if (max === 0) return <p className="py-6 text-center text-sm text-muted-foreground">{empty}</p>
  return (
    <ul className="space-y-3">
      {rows.map((row) => (
        <li key={row.label} className="space-y-1">
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="truncate">{row.label}</span>
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
              style={{ width: `${Math.max((row.value / max) * 100, 1)}%`, backgroundColor: color }}
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
    <div className="overflow-x-auto">
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
