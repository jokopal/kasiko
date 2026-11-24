// Daily figures for the dashboard (decision #43): today vs yesterday, average daily income
// and vehicles per day. Pure, so the money and counting rules are unit-tested; the inputs
// come from the SQL functions daily_summary and vehicle_summary.

export interface DayFigures {
  dayKey: string
  income: number
  expense: number
  vehicles: number
  transactions: number
}

export interface DayStats extends DayFigures {
  /** Profit = income − every expense (decision #40). */
  profit: number
}

const withProfit = (day: DayFigures): DayStats => ({ ...day, profit: day.income - day.expense })

const emptyDay = (dayKey: string): DayStats => ({
  dayKey,
  income: 0,
  expense: 0,
  vehicles: 0,
  transactions: 0,
  profit: 0,
})

/** Today and yesterday out of a daily_summary result (missing days count as zero). */
export function todayAndYesterday(
  days: readonly DayFigures[],
  todayKey: string,
  yesterdayKey: string,
): { today: DayStats; yesterday: DayStats } {
  const find = (key: string) => {
    const day = days.find((d) => d.dayKey === key)
    return day ? withProfit(day) : emptyDay(key)
  }
  return { today: find(todayKey), yesterday: find(yesterdayKey) }
}

/** Newest first, with profit, for the daily history table. */
export function dailyHistory(days: readonly DayFigures[]): DayStats[] {
  return [...days].sort((a, b) => b.dayKey.localeCompare(a.dayKey)).map(withProfit)
}

export interface AverageIncome {
  /** Rounded to whole rupiah; 0 when no day had income. */
  average: number
  /** Days with any income: closed days do not pull the average down. */
  openDays: number
  best: { dayKey: string; income: number } | null
  lowest: { dayKey: string; income: number } | null
}

export function averageDailyIncome(
  days: readonly { dayKey: string; income: number }[],
): AverageIncome {
  const open = days.filter((d) => d.income > 0).map((d) => ({ dayKey: d.dayKey, income: d.income }))
  const [first] = open
  if (!first) return { average: 0, openDays: 0, best: null, lowest: null }
  let best = first
  let lowest = first
  let total = 0
  for (const day of open) {
    total += day.income
    if (day.income > best.income) best = day
    if (day.income < lowest.income) lowest = day
  }
  return { average: Math.round(total / open.length), openDays: open.length, best, lowest }
}

export interface VehicleStats {
  total: number
  days: number
  /** One decimal: 42.5 vehicles a day. 0 when there were no business days. */
  perDay: number
  categories: { categoryId: string; name: string; vehicles: number; perDay: number }[]
}

const oneDecimal = (value: number) => Math.round(value * 10) / 10

export function vehicleStats(summary: {
  days: number
  categories: readonly { categoryId: string; name: string; vehicles: number }[]
}): VehicleStats {
  const per = (n: number) => (summary.days > 0 ? oneDecimal(n / summary.days) : 0)
  const total = summary.categories.reduce((sum, c) => sum + c.vehicles, 0)
  return {
    total,
    days: summary.days,
    perDay: per(total),
    categories: summary.categories.map((c) => ({ ...c, perDay: per(c.vehicles) })),
  }
}

/** "42,5" with the Indonesian decimal comma. */
export function formatPerDay(value: number): string {
  return value.toLocaleString('id-ID', { maximumFractionDigits: 1 })
}
