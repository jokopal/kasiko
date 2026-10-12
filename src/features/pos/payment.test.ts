import { describe, expect, it } from 'vitest'
import { computeChange, quickCashOptions, settlePayment } from './payment'

describe('computeChange', () => {
  it('returns change or null when short', () => {
    expect(computeChange(35_000, 50_000)).toBe(15_000)
    expect(computeChange(35_000, 35_000)).toBe(0)
    expect(computeChange(35_000, 30_000)).toBeNull()
  })
})

describe('quickCashOptions', () => {
  it.each([
    [35_000, [40_000, 50_000, 100_000]],
    [45_000, [50_000, 60_000, 100_000]],
    [100_000, []],
    [125_000, [130_000, 140_000, 150_000, 200_000]],
    [0, []],
  ])('suggests amounts above %i', (total, expected) => {
    expect(quickCashOptions(total)).toEqual(expected)
  })
})

describe('settlePayment', () => {
  it('computes change for cash', () => {
    expect(settlePayment({ method: 'cash', total: 35_000, cashReceived: 50_000 })).toEqual({
      ok: true,
      cashReceived: 50_000,
      changeAmount: 15_000,
    })
  })

  it('rejects insufficient or missing cash', () => {
    expect(settlePayment({ method: 'cash', total: 35_000, cashReceived: 20_000 }).ok).toBe(false)
    expect(settlePayment({ method: 'cash', total: 35_000, cashReceived: null }).ok).toBe(false)
  })

  it('ignores cash fields for non-cash methods', () => {
    expect(settlePayment({ method: 'qris', total: 35_000, cashReceived: 999 })).toEqual({
      ok: true,
      cashReceived: null,
      changeAmount: null,
    })
  })

  it('rejects an empty cart', () => {
    expect(settlePayment({ method: 'transfer', total: 0, cashReceived: null }).ok).toBe(false)
  })
})
