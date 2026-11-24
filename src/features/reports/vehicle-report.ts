// The Laporan "Kendaraan" tab (decision #43): vehicles per category per day, per month
// (since the first Olsera report), per year and cumulative. Pure: the page, the Excel
// workbook and the PDF all render these tables.

import type { Cell } from '@/features/history/cashflow-import'
import type { VehicleDayRow, VehicleMonthRow } from '@/features/data/owner'
import { dayLabel, type ReportColumn, type ReportTable } from './report-tables'

export interface VehicleCategory {
  id: string
  name: string
}

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

// Counts use the same grouped-digit format as amounts, without "Rp".
const count = (label: string, width = 12): ReportColumn => ({ label, money: true, width })

/** Categories in catalog order, plus any category only the data knows (renamed or removed). */
export function vehicleCategories(
  catalog: readonly VehicleCategory[],
  rows: readonly { categoryId: string; name: string }[],
): VehicleCategory[] {
  const out = [...catalog]
  for (const row of rows) {
    if (!out.some((c) => c.id === row.categoryId)) out.push({ id: row.categoryId, name: row.name })
  }
  return out.filter((c) => rows.some((r) => r.categoryId === c.id))
}

interface Bucket {
  key: string
  byCategory: Map<string, number>
  sources: Set<string>
}

function bucketsOf(
  rows: readonly { categoryId: string; vehicles: number; source?: string }[],
  keyOf: (row: never) => string,
): Bucket[] {
  const map = new Map<string, Bucket>()
  for (const row of rows) {
    const key = (keyOf as (r: typeof row) => string)(row)
    const bucket = map.get(key) ?? { key, byCategory: new Map(), sources: new Set() }
    bucket.byCategory.set(
      row.categoryId,
      (bucket.byCategory.get(row.categoryId) ?? 0) + row.vehicles,
    )
    if (row.source) bucket.sources.add(row.source)
    map.set(key, bucket)
  }
  return [...map.values()].sort((a, b) => a.key.localeCompare(b.key))
}

function countRows(buckets: readonly Bucket[], categories: readonly VehicleCategory[]) {
  let running = 0
  return buckets.map((bucket) => {
    const values = categories.map((c) => bucket.byCategory.get(c.id) ?? 0)
    const total = values.reduce((sum, v) => sum + v, 0)
    running += total
    return { bucket, values, total, cumulative: running }
  })
}

function totalsFooter(
  label: string,
  rows: ReturnType<typeof countRows>,
  categories: readonly VehicleCategory[],
): Cell[] {
  const perCategory = categories.map((_, i) => rows.reduce((sum, r) => sum + (r.values[i] ?? 0), 0))
  const total = perCategory.reduce((sum, v) => sum + v, 0)
  return [label, ...perCategory, total, null]
}

const SOURCE_LABEL: Record<string, string> = { olsera: 'Olsera', kasir: 'Kasiko' }
const sourceText = (sources: Set<string>) =>
  ['olsera', 'kasir']
    .filter((s) => sources.has(s))
    .map((s) => SOURCE_LABEL[s])
    .join(' + ')

/** Day × category for the picked period, from cashier sales. */
export function vehicleDailyTable(
  days: readonly VehicleDayRow[],
  categories: readonly VehicleCategory[],
): ReportTable {
  const rows = countRows(
    bucketsOf(days, (r: VehicleDayRow) => r.dayKey),
    categories,
  )
  const total = rows.reduce((sum, r) => sum + r.total, 0)
  return {
    id: 'kendaraan-harian',
    name: 'Kendaraan Harian',
    title: 'Kendaraan per hari per kategori',
    columns: [
      { label: 'Tanggal', width: 14 },
      ...categories.map((c) => count(c.name)),
      count('Total'),
      count('Kumulatif'),
    ],
    rows: rows.map((r) => [dayLabel(r.bucket.key), ...r.values, r.total, r.cumulative]),
    footer: rows.length > 0 ? totalsFooter('Total', rows, categories) : undefined,
    note:
      rows.length > 0
        ? `${rows.length} hari dengan kendaraan, rata-rata ${(Math.round((total / rows.length) * 10) / 10).toLocaleString('id-ID')} per hari. Data per hari hanya dari kasir Kasiko; laporan Olsera bulanan ada di tab per bulan.`
        : 'Data per hari hanya dari kasir Kasiko; laporan Olsera bulanan ada di tabel per bulan.',
  }
}

/** Month × category since the first record, Olsera and Kasiko together. */
export function vehicleMonthlyTable(
  months: readonly VehicleMonthRow[],
  categories: readonly VehicleCategory[],
): ReportTable {
  const rows = countRows(
    bucketsOf(months, (r: VehicleMonthRow) => r.monthKey),
    categories,
  )
  return {
    id: 'kendaraan-bulanan',
    name: 'Kendaraan Bulanan',
    title: 'Kendaraan per bulan per kategori',
    columns: [
      { label: 'Bulan', width: 16 },
      ...categories.map((c) => count(c.name)),
      count('Total'),
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
    footer: rows.length > 0 ? [...totalsFooter('Total', rows, categories), null] : undefined,
    note: 'Olsera dihitung per laporan bulanan; bulan peralihan berisi Olsera sampai hari terakhirnya ditambah kasir Kasiko.',
  }
}

/** Year × category. */
export function vehicleYearlyTable(
  months: readonly VehicleMonthRow[],
  categories: readonly VehicleCategory[],
): ReportTable {
  const rows = countRows(
    bucketsOf(months, (r: VehicleMonthRow) => r.monthKey.slice(0, 4)),
    categories,
  )
  const monthsIn = (year: string) =>
    new Set(months.filter((m) => m.monthKey.startsWith(year)).map((m) => m.monthKey)).size
  return {
    id: 'kendaraan-tahunan',
    name: 'Kendaraan Tahunan',
    title: 'Kendaraan per tahun per kategori',
    columns: [
      { label: 'Tahun', width: 10 },
      ...categories.map((c) => count(c.name)),
      count('Total'),
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
    footer: rows.length > 0 ? [...totalsFooter('Total', rows, categories), null] : undefined,
  }
}

/** Every category since the first record, with its share. */
export function vehicleCategoryTable(
  months: readonly VehicleMonthRow[],
  categories: readonly VehicleCategory[],
): ReportTable {
  const totals = categories.map((c) => ({
    name: c.name,
    vehicles: months.filter((m) => m.categoryId === c.id).reduce((sum, m) => sum + m.vehicles, 0),
    first:
      months
        .filter((m) => m.categoryId === c.id)
        .map((m) => m.monthKey)
        .sort()[0] ?? null,
  }))
  const total = totals.reduce((sum, t) => sum + t.vehicles, 0)
  const share = (v: number) => (total > 0 ? `${Math.round((v / total) * 100)}%` : null)
  return {
    id: 'kendaraan-kategori',
    name: 'Kendaraan Kumulatif',
    title: 'Kumulatif per kategori sejak data pertama',
    columns: [
      { label: 'Kategori', width: 22 },
      count('Kendaraan'),
      { label: 'Porsi', width: 8 },
      { label: 'Sejak', width: 16 },
    ],
    rows: totals.map((t) => [
      t.name,
      t.vehicles,
      share(t.vehicles),
      t.first ? monthLabel(t.first) : null,
    ]),
    footer: [`Total`, total, total > 0 ? '100%' : null, null],
  }
}

/** Today's vehicles per category, for the dashboard "Hari ini" tile. */
export function categoryBreakdown(
  days: readonly VehicleDayRow[],
  dayKey: string,
  categories: readonly VehicleCategory[],
): { name: string; vehicles: number }[] {
  const today = days.filter((d) => d.dayKey === dayKey)
  return vehicleCategories(categories, today).map((c) => ({
    name: c.name,
    vehicles: today.filter((d) => d.categoryId === c.id).reduce((sum, d) => sum + d.vehicles, 0),
  }))
}
