// Day boundaries always follow the business timezone, never the device timezone.

export const BUSINESS_TIMEZONES = [
  { value: 'Asia/Jakarta', label: 'WIB (Asia/Jakarta)' },
  { value: 'Asia/Makassar', label: 'WITA (Asia/Makassar)' },
  { value: 'Asia/Jayapura', label: 'WIT (Asia/Jayapura)' },
] as const

export interface ZonedParts {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
  /** 0 = Sunday … 6 = Saturday */
  weekday: number
}

export interface DateRange {
  /** Inclusive start. */
  from: Date
  /** Exclusive end. */
  to: Date
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const partsFormatterCache = new Map<string, Intl.DateTimeFormat>()

function partsFormatter(timeZone: string): Intl.DateTimeFormat {
  let formatter = partsFormatterCache.get(timeZone)
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      weekday: 'short',
      hourCycle: 'h23',
    })
    partsFormatterCache.set(timeZone, formatter)
  }
  return formatter
}

export function getZonedParts(date: Date, timeZone: string): ZonedParts {
  const parts: Partial<Record<Intl.DateTimeFormatPartTypes, string>> = {}
  for (const part of partsFormatter(timeZone).formatToParts(date)) {
    parts[part.type] = part.value
  }
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
    weekday: WEEKDAYS.indexOf(parts.weekday ?? ''),
  }
}

/** Offset of `timeZone` from UTC at `date`, in milliseconds (WIB = +7h). */
function timeZoneOffsetMs(date: Date, timeZone: string): number {
  const p = getZonedParts(date, timeZone)
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
  return asUtc - Math.floor(date.getTime() / 1000) * 1000
}

function parseDayKey(dayKey: string): [number, number, number] {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dayKey)
  if (!match) throw new RangeError(`Format tanggal tidak valid: ${dayKey}`)
  return [Number(match[1]), Number(match[2]), Number(match[3])]
}

function toDayKey(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/** `YYYY-MM-DD` of the business day that contains `date`. */
export function businessDayKey(date: Date, timeZone: string): string {
  const p = getZonedParts(date, timeZone)
  return toDayKey(p.year, p.month, p.day)
}

/** Calendar arithmetic on day keys: `shiftDayKey('2026-10-31', 1)` → `'2026-11-01'`. */
export function shiftDayKey(dayKey: string, days: number): string {
  const [year, month, day] = parseDayKey(dayKey)
  const shifted = new Date(Date.UTC(year, month - 1, day + days))
  return toDayKey(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, shifted.getUTCDate())
}

/** UTC instant at which the business day `dayKey` starts. */
export function startOfBusinessDayKey(dayKey: string, timeZone: string): Date {
  const [year, month, day] = parseDayKey(dayKey)
  const utcMidnight = Date.UTC(year, month - 1, day)
  // Second pass keeps this correct across an offset change.
  let instant = utcMidnight - timeZoneOffsetMs(new Date(utcMidnight), timeZone)
  instant = utcMidnight - timeZoneOffsetMs(new Date(instant), timeZone)
  return new Date(instant)
}

/** `[start of first day, start of the day after last day)` in the business timezone. */
export function dayKeyRange(firstDayKey: string, lastDayKey: string, timeZone: string): DateRange {
  return {
    from: startOfBusinessDayKey(firstDayKey, timeZone),
    to: startOfBusinessDayKey(shiftDayKey(lastDayKey, 1), timeZone),
  }
}

export function businessDayRange(date: Date, timeZone: string): DateRange {
  const key = businessDayKey(date, timeZone)
  return dayKeyRange(key, key, timeZone)
}

export function isSameBusinessDay(a: Date, b: Date, timeZone: string): boolean {
  return businessDayKey(a, timeZone) === businessDayKey(b, timeZone)
}

export function isInRange(date: Date, range: DateRange): boolean {
  const t = date.getTime()
  return t >= range.from.getTime() && t < range.to.getTime()
}

/** The equally long period right before `range`, used for comparisons. */
export function previousRange(range: DateRange): DateRange {
  const length = range.to.getTime() - range.from.getTime()
  return { from: new Date(range.from.getTime() - length), to: range.from }
}

/** `YYMMDD` in the business timezone, used in receipt numbers. */
export function yymmdd(date: Date, timeZone: string): string {
  const p = getZonedParts(date, timeZone)
  return [p.year % 100, p.month, p.day].map((n) => String(n).padStart(2, '0')).join('')
}

export function formatDateTime(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('id-ID', {
    timeZone,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

export function formatTime(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('id-ID', { timeZone, hour: '2-digit', minute: '2-digit' }).format(
    date,
  )
}

export function formatLongDate(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('id-ID', {
    timeZone,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date)
}

export function formatShortDate(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('id-ID', { timeZone, day: 'numeric', month: 'short' }).format(date)
}
