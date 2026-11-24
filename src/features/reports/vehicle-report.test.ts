import { describe, expect, it } from 'vitest'
import type { VehicleDayRow, VehicleMonthRow } from '@/features/data/owner'
import {
  categoryBreakdown,
  monthLabel,
  vehicleCumulativeTable,
  vehicleDailyTable,
  vehicleMonthlyTable,
  vehicleOverview,
  vehicleSeries,
  vehicleYearlyTable,
} from './vehicle-report'

const CATALOG = {
  categories: [
    { id: 'mobil', name: 'Cuci Mobil' },
    { id: 'motor', name: 'Cuci Motor' },
    { id: 'besar', name: 'Kendaraan Besar' },
  ],
  items: [
    { id: 'kecil', name: 'Cuci Mobil Kecil', categoryId: 'mobil' },
    { id: 'sedang', name: 'Cuci Mobil Sedang', categoryId: 'mobil' },
    { id: 'mk', name: 'Cuci Motor Kecil', categoryId: 'motor' },
    { id: 'truk', name: 'Cuci Truk', categoryId: 'besar' },
  ],
}

const month = (
  monthKey: string,
  itemId: string,
  source: 'kasir' | 'olsera',
  vehicles: number,
): VehicleMonthRow => {
  const item = CATALOG.items.find((i) => i.id === itemId)!
  const category = CATALOG.categories.find((c) => c.id === item.categoryId)!
  return {
    monthKey,
    categoryId: category.id,
    name: category.name,
    itemId,
    itemName: item.name,
    source,
    vehicles,
  }
}

// Same months as supabase/tests/07_vehicle_history_receipt_prices.test.sql.
const months = [
  month('2026-01-01', 'sedang', 'olsera', 10),
  month('2026-02-01', 'sedang', 'kasir', 1),
  month('2026-02-01', 'mk', 'kasir', 2),
  month('2026-02-01', 'mk', 'olsera', 3),
  month('2026-02-01', 'kecil', 'kasir', 4),
]

describe('vehicle columns', () => {
  it('follows catalog order and drops columns without vehicles', () => {
    expect(vehicleSeries(CATALOG, months, 'kategori').map((s) => s.id)).toEqual(['mobil', 'motor'])
    expect(vehicleSeries(CATALOG, months, 'layanan')).toEqual([
      { id: 'kecil', name: 'Cuci Mobil Kecil', group: 'Cuci Mobil' },
      { id: 'sedang', name: 'Cuci Mobil Sedang', group: 'Cuci Mobil' },
      { id: 'mk', name: 'Cuci Motor Kecil', group: 'Cuci Motor' },
    ])
  })

  it('keeps a service the catalog no longer has, under its category', () => {
    const gone = { ...month('2026-03-01', 'truk', 'kasir', 1), itemId: 'old', itemName: 'Truck' }
    expect(vehicleSeries(CATALOG, [gone], 'layanan')).toEqual([
      { id: 'old', name: 'Truck', group: 'Kendaraan Besar' },
    ])
  })
})

describe('vehicle tables', () => {
  const byCategory = vehicleSeries(CATALOG, months, 'kategori')
  const byService = vehicleSeries(CATALOG, months, 'layanan')

  it('adds sources per month with a running total, per category', () => {
    const table = vehicleMonthlyTable(months, byCategory, 'kategori')
    expect(table.rows).toEqual([
      ['Januari 2026', 10, 0, 10, 10, 'Olsera'],
      ['Februari 2026', 5, 5, 10, 20, 'Olsera + Kasiko'],
    ])
    expect(table.footer).toEqual(['Total', 15, 5, 20, null, null])
  })

  it('splits the same months per service, grouped under the category', () => {
    const table = vehicleMonthlyTable(months, byService, 'layanan')
    expect(table.columns.slice(1, 4).map((c) => [c.group, c.label])).toEqual([
      ['Cuci Mobil', 'Cuci Mobil Kecil'],
      ['Cuci Mobil', 'Cuci Mobil Sedang'],
      ['Cuci Motor', 'Cuci Motor Kecil'],
    ])
    expect(table.rows[1]).toEqual(['Februari 2026', 4, 1, 5, 10, 20, 'Olsera + Kasiko'])
  })

  it('sums years and averages per month with data', () => {
    const table = vehicleYearlyTable(
      [...months, month('2025-12-01', 'sedang', 'olsera', 7)],
      byCategory,
      'kategori',
    )
    expect(table.rows).toEqual([
      ['2025', 7, 0, 7, 7, 7],
      ['2026', 15, 5, 20, 27, 10],
    ])
  })

  it('ranks the cumulative table, with the category next to each service', () => {
    expect(vehicleCumulativeTable(months, byService, 'layanan').rows).toEqual([
      ['Cuci Mobil', 'Cuci Mobil Sedang', 11, '55%', 'Januari 2026'],
      ['Cuci Motor', 'Cuci Motor Kecil', 5, '25%', 'Februari 2026'],
      ['Cuci Mobil', 'Cuci Mobil Kecil', 4, '20%', 'Februari 2026'],
    ])
  })

  it('lists days with a running total and an average', () => {
    const days: VehicleDayRow[] = [
      {
        dayKey: '2026-02-11',
        categoryId: 'motor',
        name: 'Cuci Motor',
        itemId: 'mk',
        itemName: 'Cuci Motor Kecil',
        vehicles: 2,
      },
      {
        dayKey: '2026-02-10',
        categoryId: 'mobil',
        name: 'Cuci Mobil',
        itemId: 'sedang',
        itemName: 'Cuci Mobil Sedang',
        vehicles: 1,
      },
    ]
    const table = vehicleDailyTable(days, vehicleSeries(CATALOG, days, 'kategori'), 'kategori')
    expect(table.rows).toEqual([
      ['10 Feb 2026', 1, 0, 1, 1],
      ['11 Feb 2026', 0, 2, 2, 3],
    ])
    expect(table.note).toContain('rata-rata 1,5 kendaraan per hari')
    expect(categoryBreakdown(days, '2026-02-11', CATALOG.categories)).toEqual([
      { name: 'Cuci Motor', vehicles: 2 },
    ])
  })
})

describe('vehicle overview', () => {
  it('gives the all-time total, shares per category and the top service', () => {
    const overview = vehicleOverview(months, CATALOG)
    expect(overview.total).toBe(20)
    expect(overview.firstMonth).toBe('2026-01-01')
    expect(overview.categories.map((c) => [c.name, c.vehicles, c.share])).toEqual([
      ['Cuci Mobil', 15, 0.75],
      ['Cuci Motor', 5, 0.25],
    ])
    expect(overview.top).toEqual({ name: 'Cuci Mobil Sedang', vehicles: 11 })
  })

  it('names months in Indonesian', () => {
    expect(monthLabel('2024-08-01')).toBe('Agustus 2024')
  })
})
