import {
  ArrowRightIcon,
  BanknoteArrowDownIcon,
  CarFrontIcon,
  TrendingUpIcon,
  WalletIcon,
  type LucideIcon,
} from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { formatLongDate, formatShortDate, startOfBusinessDayKey } from '@/lib/datetime'
import { formatRupiah } from '@/lib/money'
import { cn } from '@/lib/utils'
import {
  formatPerDay,
  todayAndYesterday,
  type AverageIncome,
  type DayFigures,
  type DayStats,
  type VehicleStats,
} from './daily-stats'

// Dashboard pieces for decision #43: the "Hari ini" strip, the daily history and the two
// optional panels (average daily income, vehicles per day).

const VEHICLE_SERIES = '#2a78d6' // same categorical blue as Pemasukan, never the brand color

/** Today's income, expense, profit and vehicles, each next to yesterday's. */
export function TodayStrip({
  data,
  error,
  todayKey,
  yesterdayKey,
  tz,
}: {
  data: DayFigures[] | undefined
  error: Error | null
  todayKey: string
  yesterdayKey: string
  tz: string
}) {
  const heading = formatLongDate(startOfBusinessDayKey(todayKey, tz), tz)
  return (
    <section aria-labelledby="today-heading" className="space-y-2">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="today-heading" className="font-semibold">
          Hari ini
        </h2>
        <p className="truncate text-xs text-muted-foreground">{heading}</p>
      </div>
      {error ? (
        <p className="text-sm text-destructive">Ringkasan hari ini gagal dimuat: {error.message}</p>
      ) : !data ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" role="status" aria-label="Memuat">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-[104px] rounded-xl" />
          ))}
        </div>
      ) : (
        <TodayTiles {...todayAndYesterday(data, todayKey, yesterdayKey)} />
      )}
    </section>
  )
}

function TodayTiles({ today, yesterday }: { today: DayStats; yesterday: DayStats }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Tile
        icon={BanknoteArrowDownIcon}
        label="Pemasukan"
        value={formatRupiah(today.income)}
        before={`Kemarin ${formatRupiah(yesterday.income)}`}
      />
      <Tile
        icon={WalletIcon}
        label="Pengeluaran"
        value={formatRupiah(today.expense)}
        before={`Kemarin ${formatRupiah(yesterday.expense)}`}
      />
      <Tile
        icon={TrendingUpIcon}
        label="Profit"
        value={formatRupiah(today.profit)}
        negative={today.profit < 0}
        before={`Kemarin ${formatRupiah(yesterday.profit)}`}
        emphasis
      />
      <Tile
        icon={CarFrontIcon}
        label="Kendaraan"
        value={today.vehicles.toLocaleString('id-ID')}
        unit={`dari ${today.transactions} transaksi`}
        before={`Kemarin ${yesterday.vehicles.toLocaleString('id-ID')}`}
      />
    </div>
  )
}

function Tile({
  icon: Icon,
  label,
  value,
  unit,
  before,
  negative = false,
  emphasis = false,
}: {
  icon: LucideIcon
  label: string
  value: string
  unit?: string
  before: string
  negative?: boolean
  emphasis?: boolean
}) {
  return (
    <Card className={cn('gap-0 py-0', emphasis && 'ring-2 ring-primary/40')}>
      <CardContent className="space-y-1 p-3 sm:p-4">
        <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Icon className="size-3.5" aria-hidden />
          {label}
        </p>
        <p
          className={cn(
            'truncate text-lg font-semibold tracking-tight tabular-nums sm:text-xl',
            negative && 'text-destructive',
          )}
        >
          {value}
        </p>
        {unit && <p className="truncate text-xs text-muted-foreground">{unit}</p>}
        <p className="truncate text-xs text-muted-foreground tabular-nums">{before}</p>
      </CardContent>
    </Card>
  )
}

const HISTORY_PREVIEW = 14

/** Newest first: vehicles, transactions, income, expense and profit per day. */
export function DailyHistoryPanel({
  days,
  tz,
  reportSearch,
}: {
  days: DayStats[]
  tz: string
  reportSearch: string
}) {
  const [all, setAll] = useState(false)
  const active = days.filter((d) => d.income !== 0 || d.expense !== 0 || d.transactions !== 0)
  if (active.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">Belum ada data</p>
  }
  const shown = all ? days : days.slice(0, HISTORY_PREVIEW)
  const params = new URLSearchParams(reportSearch)
  params.set('tab', 'harian')
  const label = (key: string) => formatShortDate(startOfBusinessDayKey(key, tz), tz)
  const weekday = (key: string) =>
    new Intl.DateTimeFormat('id-ID', { timeZone: tz, weekday: 'short' }).format(
      startOfBusinessDayKey(key, tz),
    )

  return (
    <div className="space-y-3">
      <div className="relative overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[560px] text-sm">
          <caption className="sr-only">Riwayat harian, terbaru di atas</caption>
          <thead className="bg-muted/50 text-xs text-muted-foreground">
            <tr>
              <th scope="col" className="px-3 py-2 text-left font-medium">
                Tanggal
              </th>
              <th scope="col" className="px-3 py-2 text-right font-medium">
                Kendaraan
              </th>
              <th scope="col" className="px-3 py-2 text-right font-medium">
                Pemasukan
              </th>
              <th scope="col" className="px-3 py-2 text-right font-medium">
                Pengeluaran
              </th>
              <th scope="col" className="px-3 py-2 text-right font-medium">
                Profit
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {shown.map((day) => {
              const empty = day.income === 0 && day.expense === 0 && day.transactions === 0
              // Imported days have money but no cashier sales, so no vehicle count.
              const imported = day.transactions === 0 && day.income > 0
              return (
                <tr key={day.dayKey} className={cn(empty && 'text-muted-foreground')}>
                  <th scope="row" className="px-3 py-2 text-left font-normal whitespace-nowrap">
                    <span className="mr-1.5 inline-block w-8 text-xs text-muted-foreground">
                      {weekday(day.dayKey)}
                    </span>
                    {label(day.dayKey)}
                  </th>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {imported ? (
                      <span title="Data impor tidak mencatat kendaraan per hari">–</span>
                    ) : (
                      day.vehicles.toLocaleString('id-ID')
                    )}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatRupiah(day.income)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatRupiah(day.expense)}</td>
                  <td
                    className={cn(
                      'px-3 py-2 text-right font-medium tabular-nums',
                      day.profit < 0 && 'text-destructive',
                    )}
                  >
                    {formatRupiah(day.profit)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        {days.length > HISTORY_PREVIEW ? (
          <Button variant="ghost" size="sm" onClick={() => setAll((v) => !v)}>
            {all ? 'Tampilkan lebih sedikit' : `Tampilkan semua (${days.length} hari)`}
          </Button>
        ) : (
          <span />
        )}
        <Button asChild variant="outline" size="sm">
          <Link to={`/owner/laporan?${params.toString()}`}>
            Laporan Harian
            <ArrowRightIcon />
          </Link>
        </Button>
      </div>
    </div>
  )
}

export function AverageIncomePanel({ stats, tz }: { stats: AverageIncome; tz: string }) {
  if (stats.openDays === 0) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        Belum ada pemasukan di periode ini
      </p>
    )
  }
  const label = (key: string) => formatShortDate(startOfBusinessDayKey(key, tz), tz)
  return (
    <div className="space-y-4">
      <div>
        <p className="text-3xl font-semibold tracking-tight tabular-nums">
          {formatRupiah(stats.average)}
        </p>
        <p className="text-sm text-muted-foreground">
          per hari, dari {stats.openDays} hari buka (hari tanpa pemasukan tidak dihitung)
        </p>
      </div>
      <dl className="grid gap-2 text-sm sm:grid-cols-2">
        {stats.best && (
          <div className="rounded-lg border p-3">
            <dt className="text-xs text-muted-foreground">
              Tertinggi · {label(stats.best.dayKey)}
            </dt>
            <dd className="font-medium tabular-nums">{formatRupiah(stats.best.income)}</dd>
          </div>
        )}
        {stats.lowest && (
          <div className="rounded-lg border p-3">
            <dt className="text-xs text-muted-foreground">
              Terendah · {label(stats.lowest.dayKey)}
            </dt>
            <dd className="font-medium tabular-nums">{formatRupiah(stats.lowest.income)}</dd>
          </div>
        )}
      </dl>
    </div>
  )
}

export function VehiclesPanel({ stats }: { stats: VehicleStats }) {
  if (stats.total === 0) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        Belum ada kendaraan di periode ini
      </p>
    )
  }
  const max = Math.max(...stats.categories.map((c) => c.perDay), 0)
  return (
    <div className="space-y-4">
      <div>
        <p className="text-3xl font-semibold tracking-tight tabular-nums">
          {formatPerDay(stats.perDay)}
          <span className="ml-1.5 text-base font-normal text-muted-foreground">kendaraan/hari</span>
        </p>
        <p className="text-sm text-muted-foreground tabular-nums">
          {stats.total.toLocaleString('id-ID')} kendaraan dalam {stats.days} hari buka
        </p>
      </div>
      <ul className="space-y-3">
        {stats.categories.map((category) => (
          <li key={category.categoryId} className="space-y-1">
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="truncate">{category.name}</span>
              <span className="shrink-0 font-medium tabular-nums">
                <span className="mr-2 font-normal text-muted-foreground">
                  {category.vehicles.toLocaleString('id-ID')}
                </span>
                {formatPerDay(category.perDay)}/hari
              </span>
            </div>
            <div className="h-2 rounded-full bg-muted" aria-hidden>
              <div
                className="h-2 rounded-full"
                style={{
                  width: `${max > 0 ? Math.max((category.perDay / max) * 100, 1) : 0}%`,
                  backgroundColor: VEHICLE_SERIES,
                }}
              />
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
