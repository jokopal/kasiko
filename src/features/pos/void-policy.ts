import { isSameBusinessDay } from '@/lib/datetime'
import type { Role } from '@/lib/types'

// Decision #11: no hard deletes. Cashiers may void same-day records with a reason;
// owners may void at any time. The server RPC enforces the same rules.

export const MIN_VOID_REASON_LENGTH = 3

export interface VoidCheckInput {
  role: Role
  isAlreadyVoid: boolean
  occurredAt: Date
  /** When the void was requested (device time, also used for offline voids). */
  requestedAt: Date
  timeZone: string
  reason: string
}

export type VoidCheck = { ok: true; reason: string } | { ok: false; error: string }

export function checkVoid(input: VoidCheckInput): VoidCheck {
  const reason = input.reason.trim()
  if (input.isAlreadyVoid) return { ok: false, error: 'Data ini sudah dibatalkan' }
  if (reason.length < MIN_VOID_REASON_LENGTH) {
    return { ok: false, error: 'Alasan pembatalan wajib diisi' }
  }
  if (
    input.role === 'cashier' &&
    !isSameBusinessDay(input.occurredAt, input.requestedAt, input.timeZone)
  ) {
    return { ok: false, error: 'Kasir hanya bisa membatalkan data hari ini' }
  }
  return { ok: true, reason }
}
