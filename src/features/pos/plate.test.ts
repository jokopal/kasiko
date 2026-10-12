import { describe, expect, it } from 'vitest'
import { normalizePlate } from './plate'

describe('normalizePlate', () => {
  it('uppercases and collapses whitespace', () => {
    expect(normalizePlate(' b  1234 xyz ')).toBe('B 1234 XYZ')
  })

  it('returns null for empty input', () => {
    expect(normalizePlate('   ')).toBeNull()
  })

  it('caps the length', () => {
    expect(normalizePlate('AB 1234 CDEFGHIJ')).toHaveLength(12)
  })
})
