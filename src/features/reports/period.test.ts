import { describe, expect, it } from 'vitest'
import { dayKeysBetween, resolvePeriod } from './period'

const TZ = 'Asia/Jakarta'
const now = new Date('2026-10-12T03:00:00Z') // 12 Oct 10:00 WIB

describe('resolvePeriod', () => {
  it('resolves today', () => {
    const p = resolvePeriod('today', now, TZ)
    expect([p.firstDayKey, p.lastDayKey]).toEqual(['2026-10-12', '2026-10-12'])
    expect(p.range.from.toISOString()).toBe('2026-10-11T17:00:00.000Z')
  })

  it('resolves the last 7 days including today', () => {
    const p = resolvePeriod('7d', now, TZ)
    expect([p.firstDayKey, p.lastDayKey]).toEqual(['2026-10-06', '2026-10-12'])
  })

  it('resolves month to date', () => {
    expect(resolvePeriod('month', now, TZ).firstDayKey).toBe('2026-10-01')
  })

  it('orders and validates a custom range', () => {
    const p = resolvePeriod('custom', now, TZ, { from: '2026-10-09', to: '2026-10-01' })
    expect([p.firstDayKey, p.lastDayKey]).toEqual(['2026-10-01', '2026-10-09'])
    const fallback = resolvePeriod('custom', now, TZ, { from: 'garbage' })
    expect([fallback.firstDayKey, fallback.lastDayKey]).toEqual(['2026-10-12', '2026-10-12'])
  })
})

describe('dayKeysBetween', () => {
  it('lists inclusive days across a month boundary', () => {
    expect(dayKeysBetween('2026-09-29', '2026-10-02')).toEqual([
      '2026-09-29',
      '2026-09-30',
      '2026-10-01',
      '2026-10-02',
    ])
  })

  it('caps the length', () => {
    expect(dayKeysBetween('2020-01-01', '2026-01-01', 10)).toHaveLength(10)
  })
})
