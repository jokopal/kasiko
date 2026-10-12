import { assertRupiah } from '@/lib/money'
import type { PaymentMethod } from '@/lib/types'

const CASH_DENOMINATIONS = [5_000, 10_000, 20_000, 50_000, 100_000] as const

/** Change for a cash payment, or `null` when the money received is not enough. */
export function computeChange(total: number, received: number): number | null {
  assertRupiah(total)
  assertRupiah(received)
  return received >= total ? received - total : null
}

/**
 * Common amounts a customer is likely to hand over, strictly above `total`
 * ("Uang Pas" is offered separately). `35_000` → `[40_000, 50_000, 100_000]`.
 */
export function quickCashOptions(total: number, limit = 4): number[] {
  assertRupiah(total)
  if (total <= 0) return []
  const options = new Set<number>()
  for (const denomination of CASH_DENOMINATIONS) {
    const rounded = Math.ceil(total / denomination) * denomination
    if (rounded > total) options.add(rounded)
  }
  return [...options].sort((a, b) => a - b).slice(0, limit)
}

export interface PaymentInput {
  method: PaymentMethod
  total: number
  /** Required for cash, ignored otherwise. */
  cashReceived: number | null
}

export type PaymentResult =
  | { ok: true; cashReceived: number | null; changeAmount: number | null }
  | { ok: false; error: string }

/** Validates a payment exactly as the server-side `create_transaction` must. */
export function settlePayment({ method, total, cashReceived }: PaymentInput): PaymentResult {
  assertRupiah(total)
  if (total <= 0) return { ok: false, error: 'Keranjang masih kosong' }
  if (method !== 'cash') return { ok: true, cashReceived: null, changeAmount: null }
  if (cashReceived === null) return { ok: false, error: 'Masukkan uang yang diterima' }
  const change = computeChange(total, cashReceived)
  if (change === null) return { ok: false, error: 'Uang yang diterima kurang' }
  return { ok: true, cashReceived, changeAmount: change }
}
