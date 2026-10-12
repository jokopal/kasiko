import { useLiveQuery } from 'dexie-react-hooks'
import { nextSequence } from '@/features/receipt/receipt-number'
import { db, type DeviceRecord } from './db'

// Device identity and the per-device daily receipt counter (decision #16). The code is
// handed out by the server once; if this storage is wiped the device registers again
// under a fresh code, so receipt numbers can never collide.

export interface DeviceRegistrar {
  register(businessId: string): Promise<{ id: string; code: string }>
}

export function useDevice(businessId: string): DeviceRecord | null | undefined {
  return useLiveQuery(async () => (await db.devices.get(businessId)) ?? null, [businessId])
}

export async function registerDevice(
  businessId: string,
  registrar: DeviceRegistrar,
): Promise<DeviceRecord> {
  const existing = await db.devices.get(businessId)
  if (existing) return existing
  const { id, code } = await registrar.register(businessId)
  const record: DeviceRecord = {
    businessId,
    deviceId: id,
    deviceCode: code,
    registeredAt: new Date().toISOString(),
  }
  await db.devices.put(record)
  return record
}

/** Atomically issues the next receipt sequence for `dayKey` on this device. */
export async function takeSequence(businessId: string, dayKey: string): Promise<number> {
  return db.transaction('rw', db.sequences, async () => {
    const current = await db.sequences.get(businessId)
    const next = nextSequence(current ?? null, dayKey)
    await db.sequences.put({ businessId, ...next })
    return next.seq
  })
}
