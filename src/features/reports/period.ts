import { businessDayKey, dayKeyRange, shiftDayKey, type DateRange } from '@/lib/datetime'

export type PeriodPreset = 'today' | '7d' | 'month' | 'custom'

export const PERIOD_LABEL: Record<PeriodPreset, string> = {
  today: 'Hari ini',
  '7d': '7 hari',
  month: 'Bulan ini',
  custom: 'Rentang',
}

export interface Period {
  preset: PeriodPreset
  firstDayKey: string
  lastDayKey: string
  range: DateRange
}

const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/

/** Resolves a preset (or a custom `YYYY-MM-DD` pair) into business-day boundaries. */
export function resolvePeriod(
  preset: PeriodPreset,
  now: Date,
  timeZone: string,
  custom?: { from?: string | null; to?: string | null },
): Period {
  const today = businessDayKey(now, timeZone)
  let first = today
  let last = today
  if (preset === '7d') first = shiftDayKey(today, -6)
  if (preset === 'month') first = `${today.slice(0, 8)}01`
  if (preset === 'custom') {
    const from = custom?.from && DAY_KEY.test(custom.from) ? custom.from : today
    const to = custom?.to && DAY_KEY.test(custom.to) ? custom.to : from
    ;[first, last] = from <= to ? [from, to] : [to, from]
  }
  return { preset, firstDayKey: first, lastDayKey: last, range: dayKeyRange(first, last, timeZone) }
}

/** Every day key from `first` to `last`, inclusive. */
export function dayKeysBetween(first: string, last: string, maxDays = 366): string[] {
  const keys: string[] = []
  for (let key = first; key <= last && keys.length < maxDays; key = shiftDayKey(key, 1)) {
    keys.push(key)
  }
  return keys
}

export function isPeriodPreset(value: string | null): value is PeriodPreset {
  return value === 'today' || value === '7d' || value === 'month' || value === 'custom'
}
