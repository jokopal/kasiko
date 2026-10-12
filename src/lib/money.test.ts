import { describe, expect, it } from 'vitest'
import { formatDigits, formatRupiah, parseRupiah, sumRupiah } from './money'

describe('formatRupiah', () => {
  it('formats with id-ID grouping and no decimals', () => {
    expect(formatRupiah(35_000)).toBe('Rp 35.000')
    expect(formatRupiah(0)).toBe('Rp 0')
    expect(formatRupiah(1_250_000)).toBe('Rp 1.250.000')
  })

  it('puts the sign before the currency', () => {
    expect(formatRupiah(-5_000)).toBe('-Rp 5.000')
  })

  it('rejects fractional values instead of rounding', () => {
    expect(() => formatRupiah(10.5)).toThrow(RangeError)
  })
})

describe('parseRupiah', () => {
  it.each([
    ['35.000', 35_000],
    ['Rp 35.000', 35_000],
    ['35000', 35_000],
    [' 1.000.000 ', 1_000_000],
  ])('parses %j', (input, expected) => {
    expect(parseRupiah(input)).toBe(expected)
  })

  it.each(['', '   ', 'abc', '35.000,50'])('returns null for %j', (input) => {
    expect(parseRupiah(input)).toBeNull()
  })
})

describe('sumRupiah', () => {
  it('sums integers', () => {
    expect(sumRupiah([35_000, 10_000, 0])).toBe(45_000)
    expect(sumRupiah([])).toBe(0)
  })

  it('rejects fractional members', () => {
    expect(() => sumRupiah([1, 0.5])).toThrow(RangeError)
  })
})

describe('formatDigits', () => {
  it('groups thousands without prefix', () => {
    expect(formatDigits(150_000)).toBe('150.000')
  })
})
