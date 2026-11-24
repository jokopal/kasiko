import { describe, expect, it } from 'vitest'
import {
  averageDailyIncome,
  dailyHistory,
  formatPerDay,
  todayAndYesterday,
  vehicleStats,
} from './daily-stats'

const day = (dayKey: string, income: number, expense = 0, vehicles = 0, transactions = 0) => ({
  dayKey,
  income,
  expense,
  vehicles,
  transactions,
})

describe('todayAndYesterday', () => {
  it('adds profit and fills a missing day with zeros', () => {
    const { today, yesterday } = todayAndYesterday(
      [day('2026-11-24', 1_130_000, 250_000, 23, 21)],
      '2026-11-24',
      '2026-11-23',
    )
    expect(today).toEqual({ ...day('2026-11-24', 1_130_000, 250_000, 23, 21), profit: 880_000 })
    expect(yesterday).toEqual({ ...day('2026-11-23', 0), profit: 0 })
  })

  it('keeps a negative profit', () => {
    const { today } = todayAndYesterday([day('d', 100_000, 300_000)], 'd', 'x')
    expect(today.profit).toBe(-200_000)
  })
})

describe('dailyHistory', () => {
  it('sorts newest first', () => {
    const rows = dailyHistory([day('2026-11-01', 1), day('2026-11-03', 3), day('2026-11-02', 2)])
    expect(rows.map((r) => r.dayKey)).toEqual(['2026-11-03', '2026-11-02', '2026-11-01'])
  })
})

describe('averageDailyIncome', () => {
  it('divides by open days only and finds the best and lowest day', () => {
    const result = averageDailyIncome([
      day('a', 1_000_000),
      day('b', 0),
      day('c', 2_000_001),
      day('d', 500_000),
    ])
    expect(result.openDays).toBe(3)
    expect(result.average).toBe(1_166_667) // 3,500,001 / 3 rounded
    expect(result.best).toEqual({ dayKey: 'c', income: 2_000_001 })
    expect(result.lowest).toEqual({ dayKey: 'd', income: 500_000 })
  })

  it('is empty without income', () => {
    expect(averageDailyIncome([day('a', 0)])).toEqual({
      average: 0,
      openDays: 0,
      best: null,
      lowest: null,
    })
  })
})

describe('vehicleStats', () => {
  // Same numbers as the February case in supabase/tests/06_vehicles_prices_item_sales.test.sql.
  it('averages vehicles per business day, overall and per category', () => {
    const stats = vehicleStats({
      days: 10,
      categories: [
        { categoryId: 'mobil', name: 'Cuci Mobil', vehicles: 4 },
        { categoryId: 'motor', name: 'Cuci Motor', vehicles: 2 },
      ],
    })
    expect(stats.total).toBe(6)
    expect(stats.perDay).toBe(0.6)
    expect(stats.categories.map((c) => c.perDay)).toEqual([0.4, 0.2])
  })

  it('rounds to one decimal and survives zero days', () => {
    expect(
      vehicleStats({ days: 3, categories: [{ categoryId: 'x', name: 'X', vehicles: 128 }] }).perDay,
    ).toBe(42.7)
    expect(vehicleStats({ days: 0, categories: [] })).toEqual({
      total: 0,
      days: 0,
      perDay: 0,
      categories: [],
    })
  })

  it('formats with a decimal comma', () => {
    expect(formatPerDay(42.5)).toBe('42,5')
    expect(formatPerDay(40)).toBe('40')
  })
})
