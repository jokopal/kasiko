import { useLiveQuery } from 'dexie-react-hooks'
import { db, type OutboxEntry, type OutboxOperation } from './db'

const listeners = new Set<() => void>()

/** Lets the sync engine react immediately to new work. */
export function onOutboxChange(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function operationId(operation: OutboxOperation): string {
  switch (operation.kind) {
    case 'transaction.create':
    case 'expense.create':
      return operation.record.id
    case 'transaction.void':
    case 'expense.void':
    case 'order.cancel':
      return `${operation.kind}:${operation.targetId}`
    case 'order.save':
      // Every edit is its own entry; the server keeps the newest by device time.
      return `${operation.kind}:${operation.record.id}:${operation.record.deviceUpdatedAt}`
  }
}

/** Writes the operation locally first (decision #7); syncing happens later. */
export async function enqueue(businessId: string, operation: OutboxOperation): Promise<void> {
  await db.transaction('rw', db.outbox, async () => {
    const last = await db.outbox.orderBy('seq').last()
    const entry: OutboxEntry = {
      id: operationId(operation),
      businessId,
      operation,
      status: 'pending',
      attempts: 0,
      lastError: null,
      seq: (last?.seq ?? 0) + 1,
      createdAt: new Date().toISOString(),
      nextAttemptAt: 0,
    }
    await db.outbox.add(entry)
  })
  for (const listener of listeners) listener()
}

/** Puts a failed entry back in the queue after the cause was fixed. */
export async function retryEntry(id: string): Promise<void> {
  await db.outbox.update(id, { status: 'pending', nextAttemptAt: 0, lastError: null })
  for (const listener of listeners) listener()
}

export function useOutbox(businessId: string): OutboxEntry[] | undefined {
  return useLiveQuery(
    () => db.outbox.where('businessId').equals(businessId).sortBy('seq'),
    [businessId],
  )
}

export async function outboxCount(businessId: string): Promise<number> {
  return db.outbox.where('businessId').equals(businessId).count()
}
