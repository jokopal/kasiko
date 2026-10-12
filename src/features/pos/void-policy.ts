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

/**
 * Device clocks are trusted only within these bounds (decisions #17/#18): an offline
 * record may arrive days later, but a timestamp from the future means a wrong clock.
 */
export const CLIENT_CLOCK_TOLERANCE = {
  maxFutureMs: 5 * 60_000,
  maxPastMs: 72 * 60 * 60_000,
} as const

export function isPlausibleClientTime(
  clientTime: Date,
  serverNow: Date,
  tolerance: { maxFutureMs: number; maxPastMs: number } = CLIENT_CLOCK_TOLERANCE,
): boolean {
  const delta = clientTime.getTime() - serverNow.getTime()
  return delta <= tolerance.maxFutureMs && -delta <= tolerance.maxPastMs
}
