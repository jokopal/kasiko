import { assertRupiah } from '@/lib/money'
import type { Discount, DiscountType } from '@/lib/types'

// Decision #35: the owner defines and switches on discount presets; the cashier only picks
// one. Same rule as public.discount_amount() in the database: a percentage rounds down to
// whole rupiah, and a discount may never reach the subtotal.

export function discountAmount(subtotal: number, type: DiscountType, value: number): number {
  assertRupiah(subtotal)
  if (type === 'percent') return Math.floor((subtotal * value) / 100)
  return value
}

/** Presets the cashier can apply to this subtotal: active and below the subtotal. */
export function applicableDiscounts(discounts: readonly Discount[], subtotal: number): Discount[] {
  return discounts.filter(
    (d) => d.isActive && subtotal > 0 && discountAmount(subtotal, d.type, d.value) < subtotal,
  )
}

export function describeDiscount(discount: Pick<Discount, 'type' | 'value'>): string {
  return discount.type === 'percent'
    ? `${discount.value}%`
    : `Rp ${new Intl.NumberFormat('id-ID').format(discount.value)}`
}

/** Problem with a preset the owner is saving, or null. */
export function discountProblem(input: { name: string; type: DiscountType; value: number }) {
  if (input.name.trim() === '') return 'Nama diskon wajib diisi'
  if (!Number.isSafeInteger(input.value) || input.value <= 0)
    return 'Nilai diskon harus lebih dari 0'
  if (input.type === 'percent' && input.value > 100) return 'Diskon persen maksimal 100%'
  return null
}
