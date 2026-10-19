import { describe, expect, it } from 'vitest'
import { formatReceiptNo, MAX_DAILY_SEQUENCE, nextSequence, suggestPrefix } from './receipt-number'

describe('formatReceiptNo', () => {
  const base = {
    prefix: 'SMR',
    occurredAt: new Date('2026-10-09T03:00:00Z'),
    timeZone: 'Asia/Jakarta',
    deviceCode: 'A',
    seq: 7,
  }

  it('matches the documented format', () => {
    expect(formatReceiptNo(base)).toBe('SMR-261009-A0007')
  })

  it('uses the business day, not the UTC day', () => {
    expect(formatReceiptNo({ ...base, occurredAt: new Date('2026-10-09T17:30:00Z') })).toBe(
      'SMR-261010-A0007',
    )
  })

  it('supports two-letter device codes', () => {
    expect(formatReceiptNo({ ...base, deviceCode: 'AB', seq: 12 })).toBe('SMR-261009-AB0012')
  })

  it.each([
    { prefix: 'smr' },
    { deviceCode: 'a' },
    { deviceCode: 'ABC' },
    { seq: 0 },
    { seq: MAX_DAILY_SEQUENCE + 1 },
  ])('rejects invalid input %j', (override) => {
    expect(() => formatReceiptNo({ ...base, ...override })).toThrow(RangeError)
  })
})

describe('nextSequence', () => {
  it('starts at 1 and increments within a day', () => {
    const first = nextSequence(null, '2026-10-09')
    expect(first).toEqual({ dayKey: '2026-10-09', seq: 1 })
    expect(nextSequence(first, '2026-10-09').seq).toBe(2)
  })

  it('resets on a new business day', () => {
    expect(nextSequence({ dayKey: '2026-10-09', seq: 41 }, '2026-10-10').seq).toBe(1)
  })

  it('refuses to overflow', () => {
    expect(() => nextSequence({ dayKey: 'd', seq: MAX_DAILY_SEQUENCE }, 'd')).toThrow(RangeError)
  })
})

describe('suggestPrefix', () => {
  it('uses initials for several words and the first letters of one', () => {
    expect(suggestPrefix('Cuci Mobil Saimara')).toBe('CMS')
    expect(suggestPrefix('Saimara')).toBe('SAI')
    expect(suggestPrefix('  ')).toBe('')
  })
})
