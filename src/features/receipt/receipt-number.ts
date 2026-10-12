import { yymmdd } from '@/lib/datetime'

// Receipt number: {prefix}-{YYMMDD}-{deviceCode}{seq}, e.g. SMR-261009-A0007.
// The device code is assigned by the server on device registration and never reused,
// so a wiped device registers again under a new code instead of repeating numbers.

export const MAX_DAILY_SEQUENCE = 9999

export interface DailySequence {
  /** Business day `YYYY-MM-DD` the counter belongs to. */
  dayKey: string
  /** Last sequence number issued on that day. */
  seq: number
}

export function isValidReceiptPrefix(prefix: string): boolean {
  return /^[A-Z0-9]{2,6}$/.test(prefix)
}

export function isValidDeviceCode(code: string): boolean {
  return /^[A-Z]{1,2}$/.test(code)
}

/** Returns the counter after issuing one number on `dayKey`; resets on a new day. */
export function nextSequence(current: DailySequence | null, dayKey: string): DailySequence {
  const seq = current && current.dayKey === dayKey ? current.seq + 1 : 1
  if (seq > MAX_DAILY_SEQUENCE) {
    throw new RangeError('Nomor urut nota hari ini sudah habis untuk perangkat ini')
  }
  return { dayKey, seq }
}

export interface ReceiptNumberInput {
  prefix: string
  occurredAt: Date
  timeZone: string
  deviceCode: string
  seq: number
}

export function formatReceiptNo(input: ReceiptNumberInput): string {
  const { prefix, occurredAt, timeZone, deviceCode, seq } = input
  if (!isValidReceiptPrefix(prefix)) throw new RangeError(`Prefix nota tidak valid: ${prefix}`)
  if (!isValidDeviceCode(deviceCode))
    throw new RangeError(`Kode perangkat tidak valid: ${deviceCode}`)
  if (!Number.isInteger(seq) || seq < 1 || seq > MAX_DAILY_SEQUENCE) {
    throw new RangeError(`Nomor urut tidak valid: ${seq}`)
  }
  return `${prefix}-${yymmdd(occurredAt, timeZone)}-${deviceCode}${String(seq).padStart(4, '0')}`
}
