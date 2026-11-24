import { describe, expect, it } from 'vitest'
import type { VehicleDayRow, VehicleMonthRow } from '@/features/data/owner'
import {
  categoryBreakdown,
  monthLabel,
  vehicleCategories,
  vehicleCategoryTable,
  vehicleDailyTable,
  vehicleMonthlyTable,
  vehicleYearlyTable,
} from './vehicle-report'

const CATALOG = [
  { id: 'mobil', name: 'Cuci Mobil' },
  { id: 'motor', name: 'Cuci Motor' },
  { id: 'besar', name: 'Kendaraan Besar' },
]

// Same months as supabase/tests/07_vehicle_history_receipt_prices.test.sql.
const months: VehicleMonthRow[] = [
  {
    monthKey: '2026-01-01',
    categoryId: 'mobil',
    name: 'Cuci Mobil',
    source: 'olsera',
    vehicles: 10,
  },
  { monthKey: '2026-02-01', categoryId: 'mobil', name: 'Cuci Mobil', source: 'kasir', vehicles: 1 },
  { monthKey: '2026-02-01', categoryId: 'motor', name: 'Cuci Motor', source: 'kasir', vehicles: 2 },
  {
    monthKey: '2026-02-01',
    categoryId: 'motor',
    name: 'Cuci Motor',
    source: 'olsera',
    vehicles: 3,
  },
]

describe('vehicle report', () => {
  const categories = vehicleCategories(CATALOG, months)

  it('keeps catalog order and drops categories without vehicles', () => {
    expect(categories.map((c) => c.id)).toEqual(['mobil', 'motor'])
    expect(vehicleCategories([], [{ categoryId: 'x', name: 'Lama' }])).toEqual([
      { id: 'x', name: 'Lama' },
    ])
  })

  it('adds sources per month with a running total', () => {
    const table = vehicleMonthlyTable(months, categories)
    expect(table.rows).toEqual([
      ['Januari 2026', 10, 0, 10, 10, 'Olsera'],
      ['Februari 2026', 1, 5, 6, 16, 'Olsera + Kasiko'],
    ])
    expect(table.footer).toEqual(['Total', 11, 5, 16, null, null])
  })

  it('sums years and averages per month with data', () => {
    const table = vehicleYearlyTable(
      [
        ...months,
        {
          monthKey: '2025-12-01',
          categoryId: 'mobil',
          name: 'Cuci Mobil',
          source: 'olsera',
          vehicles: 7,
        },
      ],
      categories,
    )
    expect(table.rows).toEqual([
      ['2025', 7, 0, 7, 7, 7],
      ['2026', 11, 5, 16, 23, 8],
    ])
  })

  it('shows each category since its first month', () => {
    expect(vehicleCategoryTable(months, categories).rows).toEqual([
      ['Cuci Mobil', 11, '69%', 'Januari 2026'],
      ['Cuci Motor', 5, '31%', 'Februari 2026'],
    ])
  })

  it('lists days with a running total and an average', () => {
    const days: VehicleDayRow[] = [
      { dayKey: '2026-02-11', categoryId: 'motor', name: 'Cuci Motor', vehicles: 2 },
      { dayKey: '2026-02-10', categoryId: 'mobil', name: 'Cuci Mobil', vehicles: 1 },
    ]
    const table = vehicleDailyTable(days, vehicleCategories(CATALOG, days))
    expect(table.rows).toEqual([
      ['10 Feb 2026', 1, 0, 1, 1],
      ['11 Feb 2026', 0, 2, 2, 3],
    ])
    expect(table.note).toContain('rata-rata 1,5 per hari')
    expect(categoryBreakdown(days, '2026-02-11', CATALOG)).toEqual([
      { name: 'Cuci Motor', vehicles: 2 },
    ])
  })

  it('names months in Indonesian', () => {
    expect(monthLabel('2024-08-01')).toBe('Agustus 2024')
  })
})
