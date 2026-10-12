import { describe, expect, it } from 'vitest'
import {
  businessDayKey,
  businessDayRange,
  dayKeyRange,
  getZonedParts,
  isSameBusinessDay,
  previousRange,
  shiftDayKey,
  startOfBusinessDayKey,
  yymmdd,
} from './datetime'

const WIB = 'Asia/Jakarta'
const WITA = 'Asia/Makassar'

describe('business day boundaries', () => {
  it('uses the business timezone, not UTC', () => {
    // 2026-10-09 17:30 UTC is already 10 Oct 00:30 in WIB.
    const late = new Date('2026-10-09T17:30:00Z')
    expect(businessDayKey(late, WIB)).toBe('2026-10-10')
    expect(businessDayKey(late, 'UTC')).toBe('2026-10-09')
  })

  it('starts the WIB day at 17:00 UTC of the previous date', () => {
    expect(startOfBusinessDayKey('2026-10-10', WIB).toISOString()).toBe('2026-10-09T17:00:00.000Z')
    expect(startOfBusinessDayKey('2026-10-10', WITA).toISOString()).toBe('2026-10-09T16:00:00.000Z')
  })

  it('builds a half-open day range', () => {
    const range = businessDayRange(new Date('2026-10-10T05:00:00Z'), WIB)
    expect(range.from.toISOString()).toBe('2026-10-09T17:00:00.000Z')
    expect(range.to.toISOString()).toBe('2026-10-10T17:00:00.000Z')
  })

  it('spans several days', () => {
    const range = dayKeyRange('2026-10-01', '2026-10-07', WIB)
    expect(range.to.getTime() - range.from.getTime()).toBe(7 * 24 * 3600 * 1000)
  })

  it('compares days around midnight', () => {
    const beforeMidnight = new Date('2026-10-10T16:59:00Z') // 23:59 WIB
    const afterMidnight = new Date('2026-10-10T17:01:00Z') // 00:01 WIB next day
    expect(isSameBusinessDay(beforeMidnight, afterMidnight, WIB)).toBe(false)
    expect(isSameBusinessDay(beforeMidnight, new Date('2026-10-09T17:00:00Z'), WIB)).toBe(true)
  })
})

describe('shiftDayKey', () => {
  it('crosses month and year boundaries', () => {
    expect(shiftDayKey('2026-10-31', 1)).toBe('2026-11-01')
    expect(shiftDayKey('2027-01-01', -1)).toBe('2026-12-31')
    expect(shiftDayKey('2028-02-28', 1)).toBe('2028-02-29')
  })

  it('rejects malformed keys', () => {
    expect(() => shiftDayKey('10/10/2026', 1)).toThrow(RangeError)
  })
})

describe('helpers', () => {
  it('formats YYMMDD in the business timezone', () => {
    expect(yymmdd(new Date('2026-10-08T18:00:00Z'), WIB)).toBe('261009')
  })

  it('returns weekday and hour', () => {
    const parts = getZonedParts(new Date('2026-10-12T01:30:00Z'), WIB) // Monday 08:30 WIB
    expect(parts.weekday).toBe(1)
    expect(parts.hour).toBe(8)
  })

  it('computes the previous equal-length range', () => {
    const range = dayKeyRange('2026-10-08', '2026-10-14', WIB)
    const prev = previousRange(range)
    expect(prev.to).toEqual(range.from)
    expect(businessDayKey(prev.from, WIB)).toBe('2026-10-01')
  })
})
