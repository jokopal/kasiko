// The Laporan "Kendaraan" tab (decision #43): vehicles per category or per catalog service,
// per day (cashier sales), per month and per year (Olsera + Kasiko) and cumulative. Pure:
// the page, the Excel workbook and the PDF all render these tables.

import type { Cell } from '@/features/history/cashflow-import'
import type { VehicleDayRow, VehicleMonthRow } from '@/features/data/owner'
import { dayLabel, type ReportColumn, type ReportTable } from './report-tables'

/** Columns per category, or per catalog service grouped under its category. */
export type VehicleDetail = 'kategori' | 'layanan'

export interface VehicleSeries {
  id: string
  name: string
  /** The category above a service column; null for category columns. */
  group: string | null
}

export interface VehicleCatalog {
  categories: readonly { id: string; name: string }[]
  items: readonly { id: string; name: string; categoryId: string }[]
}

type VehicleRow = Pick<VehicleDayRow, 'categoryId' | 'name' | 'itemId' | 'itemName' | 'vehicles'>

const MONTHS = [
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

/** `"2026-02-01"` → `"Februari 2026"`. */
export const monthLabel = (monthKey: string) =>
  `${MONTHS[Number(monthKey.slice(5, 7)) - 1] ?? ''} ${monthKey.slice(0, 4)}`

const seriesKey = (row: VehicleRow, detail: VehicleDetail) =>
  detail === 'kategori' ? row.categoryId : row.itemId

// Counts use the same grouped-digit format as amounts, without "Rp".
const count = (label: string, width = 12, group?: string | null): ReportColumn => ({
  label,
  money: true,
  width,
  ...(group ? { group } : {}),
})

/**
 * The columns that have vehicles, in catalog order (categories, then services inside their
 * category); a category or service only the data knows (renamed, removed) comes last.
 */
export function vehicleSeries(
  catalog: VehicleCatalog,
  rows: readonly VehicleRow[],
  detail: VehicleDetail,
): VehicleSeries[] {
  const used = new Set(rows.filter((r) => r.vehicles > 0).map((r) => seriesKey(r, detail)))
  const categoryName = (id: string) =>
    catalog.categories.find((c) => c.id === id)?.name ??
    rows.find((r) => r.categoryId === id)?.name ??
    ''
  const out: VehicleSeries[] =
    detail === 'kategori'
      ? catalog.categories.map((c) => ({ id: c.id, name: c.name, group: null }))
      : catalog.categories.flatMap((c) =>
          catalog.items
            .filter((i) => i.categoryId === c.id)
            .map((i) => ({ id: i.id, name: i.name, group: c.name })),
        )
  for (const row of rows) {
    const id = seriesKey(row, detail)
    if (out.some((s) => s.id === id)) continue
    out.push(
      detail === 'kategori'
        ? { id, name: row.name, group: null }
        : { id, name: row.itemName, group: categoryName(row.categoryId) },
    )
  }
  return out.filter((s) => used.has(s.id))
}

interface Bucket {
  key: string
  bySeries: Map<string, number>
  sources: Set<string>
}

function bucketsOf<T extends VehicleRow & { source?: string }>(
  rows: readonly T[],
  bucketKey: (row: T) => string,
  detail: VehicleDetail,
): Bucket[] {
  const map = new Map<string, Bucket>()
  for (const row of rows) {
    const key = bucketKey(row)
    const bucket = map.get(key) ?? { key, bySeries: new Map(), sources: new Set() }
    const id = seriesKey(row, detail)
    bucket.bySeries.set(id, (bucket.bySeries.get(id) ?? 0) + row.vehicles)
    if (row.source) bucket.sources.add(row.source)
    map.set(key, bucket)
  }
  return [...map.values()].sort((a, b) => a.key.localeCompare(b.key))
}

function countRows(buckets: readonly Bucket[], series: readonly VehicleSeries[]) {
  let running = 0
  return buckets.map((bucket) => {
    const values = series.map((s) => bucket.bySeries.get(s.id) ?? 0)
    const total = values.reduce((sum, v) => sum + v, 0)
    running += total
    return { bucket, values, total, cumulative: running }
  })
}

function totals(rows: ReturnType<typeof countRows>, series: readonly VehicleSeries[]): Cell[] {
  const perSeries = series.map((_, i) => rows.reduce((sum, r) => sum + (r.values[i] ?? 0), 0))
  return ['Total', ...perSeries, perSeries.reduce((sum, v) => sum + v, 0), null]
}

const strong = (label: string): ReportColumn => ({ ...count(label), strong: true })

const seriesColumns = (series: readonly VehicleSeries[]) =>
  series.map((s) => count(s.name, s.group ? 14 : 12, s.group))

const SOURCE_LABEL: Record<string, string> = { olsera: 'Olsera', kasir: 'Kasiko' }
const sourceText = (sources: Set<string>) =>
  ['olsera', 'kasir']
    .filter((s) => sources.has(s))
    .map((s) => SOURCE_LABEL[s])
    .join(' + ')

const oneDecimal = (value: number) =>
  (Math.round(value * 10) / 10).toLocaleString('id-ID', { maximumFractionDigits: 1 })

/** Day × category (or service) for the picked period, from cashier sales. */
export function vehicleDailyTable(
  days: readonly VehicleDayRow[],
  series: readonly VehicleSeries[],
  detail: VehicleDetail,
): ReportTable {
  const rows = countRows(
    bucketsOf(days, (r) => r.dayKey, detail),
    series,
  )
  const total = rows.reduce((sum, r) => sum + r.total, 0)
  const source = 'Per hari hanya dari kasir Kasiko; laporan Olsera tercatat per bulan.'
  return {
    id: 'kendaraan-harian',
    name: 'Kendaraan Harian',
    title: 'Kendaraan per hari',
    columns: [
      { label: 'Tanggal', width: 14 },
      ...seriesColumns(series),
      strong('Total'),
      count('Kumulatif'),
    ],
    rows: rows.map((r) => [dayLabel(r.bucket.key), ...r.values, r.total, r.cumulative]),
    footer: rows.length > 0 ? totals(rows, series) : undefined,
    note:
      rows.length > 0
        ? `${rows.length} hari, rata-rata ${oneDecimal(total / rows.length)} kendaraan per hari. ${source}`
        : source,
  }
}

/** Month × category (or service) since the first record, Olsera and Kasiko together. */
export function vehicleMonthlyTable(
  months: readonly VehicleMonthRow[],
  series: readonly VehicleSeries[],
  detail: VehicleDetail,
): ReportTable {
  const rows = countRows(
    bucketsOf(months, (r) => r.monthKey, detail),
    series,
  )
  return {
    id: 'kendaraan-bulanan',
    name: 'Kendaraan Bulanan',
    title: 'Kendaraan per bulan',
    columns: [
      { label: 'Bulan', width: 16 },
      ...seriesColumns(series),
      strong('Total'),
      count('Kumulatif'),
      { label: 'Sumber', width: 16 },
    ],
    rows: rows.map((r) => [
      monthLabel(r.bucket.key),
      ...r.values,
      r.total,
      r.cumulative,
      sourceText(r.bucket.sources),
    ]),
    footer: rows.length > 0 ? [...totals(rows, series), null] : undefined,
    note: 'Bulan peralihan berisi Olsera sampai hari terakhirnya ditambah kasir Kasiko.',
  }
}

/** Year × category (or service), with the average per month that has data. */
export function vehicleYearlyTable(
  months: readonly VehicleMonthRow[],
  series: readonly VehicleSeries[],
  detail: VehicleDetail,
): ReportTable {
  const rows = countRows(
    bucketsOf(months, (r) => r.monthKey.slice(0, 4), detail),
    series,
  )
  const monthsIn = (year: string) =>
    new Set(months.filter((m) => m.monthKey.startsWith(year)).map((m) => m.monthKey)).size
  return {
    id: 'kendaraan-tahunan',
    name: 'Kendaraan Tahunan',
    title: 'Kendaraan per tahun',
    columns: [
      { label: 'Tahun', width: 10 },
      ...seriesColumns(series),
      strong('Total'),
      count('Kumulatif'),
      count('Rata-rata/bulan', 14),
    ],
    rows: rows.map((r) => {
      const n = monthsIn(r.bucket.key)
      return [
        r.bucket.key,
        ...r.values,
        r.total,
        r.cumulative,
        n > 0 ? Math.round(r.total / n) : null,
      ]
    }),
    footer: rows.length > 0 ? [...totals(rows, series), null] : undefined,
  }
}

/** Every category (or service) since the first record, with its share, biggest first. */
export function vehicleCumulativeTable(
  months: readonly VehicleMonthRow[],
  series: readonly VehicleSeries[],
  detail: VehicleDetail,
): ReportTable {
  const lines = series
    .map((s) => {
      const own = months.filter((m) => seriesKey(m, detail) === s.id)
      return {
        series: s,
        vehicles: own.reduce((sum, m) => sum + m.vehicles, 0),
        first: own.map((m) => m.monthKey).sort()[0] ?? null,
      }
    })
    .sort((a, b) => b.vehicles - a.vehicles)
  const total = lines.reduce((sum, l) => sum + l.vehicles, 0)
  const share = (v: number) => (total > 0 ? `${Math.round((v / total) * 100)}%` : null)
  const byService = detail === 'layanan'
  return {
    id: 'kendaraan-kategori',
    name: 'Kendaraan Kumulatif',
    title: byService ? 'Kumulatif per layanan' : 'Kumulatif per kategori',
    columns: [
      ...(byService ? [{ label: 'Kategori', width: 18 }] : []),
      { label: byService ? 'Layanan' : 'Kategori', width: 30 },
      count('Kendaraan'),
      { label: 'Porsi', width: 8 },
      { label: 'Sejak', width: 16 },
    ],
    rows: lines.map((l) => [
      ...(byService ? [l.series.group] : []),
      l.series.name,
      l.vehicles,
      share(l.vehicles),
      l.first ? monthLabel(l.first) : null,
    ]),
    footer: [...(byService ? [null] : []), 'Total', total, total > 0 ? '100%' : null, null],
  }
}

export interface VehicleOverview {
  total: number
  firstMonth: string | null
  categories: { id: string; name: string; vehicles: number; share: number }[]
  /** The service with the most vehicles since the first record. */
  top: { name: string; vehicles: number } | null
}

/** Headline numbers above the tables: all-time total, per category and the top service. */
export function vehicleOverview(
  months: readonly VehicleMonthRow[],
  catalog: VehicleCatalog,
): VehicleOverview {
  const total = months.reduce((sum, m) => sum + m.vehicles, 0)
  const sum = (key: (m: VehicleMonthRow) => string, id: string) =>
    months.filter((m) => key(m) === id).reduce((s, m) => s + m.vehicles, 0)
  const categories = vehicleSeries(catalog, months, 'kategori').map((c) => {
    const vehicles = sum((m) => m.categoryId, c.id)
    return { id: c.id, name: c.name, vehicles, share: total > 0 ? vehicles / total : 0 }
  })
  const top = vehicleSeries(catalog, months, 'layanan')
    .map((s) => ({ name: s.name, vehicles: sum((m) => m.itemId, s.id) }))
    .sort((a, b) => b.vehicles - a.vehicles)[0]
  return {
    total,
    firstMonth: months.map((m) => m.monthKey).sort()[0] ?? null,
    categories,
    top: top ?? null,
  }
}

/** Today's vehicles per category, for the dashboard "Hari ini" tile. */
export function categoryBreakdown(
  days: readonly VehicleDayRow[],
  dayKey: string,
  categories: readonly { id: string; name: string }[],
): { name: string; vehicles: number }[] {
  const today = days.filter((d) => d.dayKey === dayKey)
  return vehicleSeries({ categories, items: [] }, today, 'kategori').map((c) => ({
    name: c.name,
    vehicles: today.filter((d) => d.categoryId === c.id).reduce((sum, d) => sum + d.vehicles, 0),
  }))
}
