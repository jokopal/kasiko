import { describe, expect, it } from 'vitest'
import { checkVoid, isPlausibleClientTime, type VoidCheckInput } from './void-policy'

const base: VoidCheckInput = {
  role: 'cashier',
  isAlreadyVoid: false,
  occurredAt: new Date('2026-10-10T02:00:00Z'), // 09:00 WIB
  requestedAt: new Date('2026-10-10T10:00:00Z'), // 17:00 WIB same day
  timeZone: 'Asia/Jakarta',
  reason: 'Salah pilih layanan',
}

describe('checkVoid', () => {
  it('lets a cashier void a same-day record with a reason', () => {
    expect(checkVoid(base)).toEqual({ ok: true, reason: 'Salah pilih layanan' })
  })

  it('requires a reason', () => {
    expect(checkVoid({ ...base, reason: '  ' }).ok).toBe(false)
  })

  it('blocks a cashier after the business day ends', () => {
    const nextDay = new Date('2026-10-10T17:05:00Z') // 00:05 WIB next day
    expect(checkVoid({ ...base, requestedAt: nextDay }).ok).toBe(false)
  })

  it('judges an offline void by when it was requested, not when it syncs', () => {
    const requestedLateEvening = new Date('2026-10-10T16:50:00Z') // 23:50 WIB
    expect(checkVoid({ ...base, requestedAt: requestedLateEvening }).ok).toBe(true)
  })

  it('lets the owner void any day', () => {
    const muchLater = new Date('2026-11-01T00:00:00Z')
    expect(checkVoid({ ...base, role: 'owner', requestedAt: muchLater }).ok).toBe(true)
  })

  it('rejects voiding twice', () => {
    expect(checkVoid({ ...base, isAlreadyVoid: true }).ok).toBe(false)
  })
})

describe('isPlausibleClientTime', () => {
  const server = new Date('2026-10-12T10:00:00Z')
  it('accepts small skew and late offline arrivals', () => {
    expect(isPlausibleClientTime(new Date('2026-10-12T10:03:00Z'), server)).toBe(true)
    expect(isPlausibleClientTime(new Date('2026-10-10T10:00:00Z'), server)).toBe(true)
  })
  it('rejects clocks in the future or far in the past', () => {
    expect(isPlausibleClientTime(new Date('2026-10-12T10:30:00Z'), server)).toBe(false)
    expect(isPlausibleClientTime(new Date('2026-10-01T10:00:00Z'), server)).toBe(false)
  })
})
