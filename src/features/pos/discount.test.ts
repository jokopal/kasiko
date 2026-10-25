import { describe, expect, it } from 'vitest'
import type { Discount } from '@/lib/types'
import { applicableDiscounts, describeDiscount, discountAmount, discountProblem } from './discount'

const preset = (overrides: Partial<Discount>): Discount => ({
  id: crypto.randomUUID(),
  businessId: 'b',
  name: 'Member',
  type: 'percent',
  value: 10,
  sortOrder: 0,
  isActive: true,
  ...overrides,
})

describe('discountAmount (mirrors public.discount_amount)', () => {
  it('rounds percentages down to whole rupiah', () => {
    expect(discountAmount(55_000, 'percent', 10)).toBe(5_500)
    expect(discountAmount(35_500, 'percent', 15)).toBe(5_325)
    expect(discountAmount(33_333, 'percent', 10)).toBe(3_333)
  })

  it('takes a fixed amount as is', () => {
    expect(discountAmount(45_000, 'amount', 5_000)).toBe(5_000)
  })
})

describe('applicableDiscounts', () => {
  it('offers only active presets that stay below the subtotal', () => {
    const presets = [
      preset({ name: 'Member' }),
      preset({ name: 'Off', isActive: false }),
      preset({ name: 'Besar', type: 'amount', value: 50_000 }),
      preset({ name: 'Gratis', type: 'percent', value: 100 }),
    ]
    expect(applicableDiscounts(presets, 45_000).map((d) => d.name)).toEqual(['Member'])
    expect(applicableDiscounts(presets, 0)).toEqual([])
  })
})

describe('owner presets', () => {
  it('describes and validates', () => {
    expect(describeDiscount({ type: 'percent', value: 10 })).toBe('10%')
    expect(describeDiscount({ type: 'amount', value: 5_000 })).toBe('Rp 5.000')
    expect(discountProblem({ name: ' ', type: 'percent', value: 10 })).not.toBeNull()
    expect(discountProblem({ name: 'Raya', type: 'percent', value: 120 })).not.toBeNull()
    expect(discountProblem({ name: 'Raya', type: 'amount', value: 0 })).not.toBeNull()
    expect(discountProblem({ name: 'Raya', type: 'percent', value: 20 })).toBeNull()
  })
})
