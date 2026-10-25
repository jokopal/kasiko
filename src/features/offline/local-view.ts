import type { Expense, Order, Transaction } from '@/lib/types'
import type { OutboxEntry } from './db'

// What the cashier sees = rows the server has + operations still waiting in the outbox.
// This is what keeps history, reprints and the drawer summary correct while offline.

export type SyncState = 'synced' | 'pending' | 'failed'

export interface LocalRow<T> {
  row: T
  sync: SyncState
  error: string | null
}

type Kinds =
  | { create: 'transaction.create'; void: 'transaction.void' }
  | { create: 'expense.create'; void: 'expense.void' }

function merge<T extends Transaction | Expense>(
  serverRows: readonly T[],
  outbox: readonly OutboxEntry[],
  kinds: Kinds,
): LocalRow<T>[] {
  const rows = new Map<string, LocalRow<T>>(
    serverRows.map((row) => [row.id, { row, sync: 'synced', error: null }]),
  )
  for (const entry of [...outbox].sort((a, b) => a.seq - b.seq)) {
    const { operation } = entry
    const sync: SyncState = entry.status === 'failed' ? 'failed' : 'pending'
    if (operation.kind === kinds.create && !rows.has(operation.record.id)) {
      rows.set(operation.record.id, {
        row: operation.record as T,
        sync,
        error: entry.lastError,
      })
    } else if (operation.kind === kinds.void) {
      const current = rows.get(operation.targetId)
      if (!current || current.row.status === 'void') continue
      rows.set(operation.targetId, {
        row: {
          ...current.row,
          status: 'void',
          voidReason: operation.reason,
          voidedAt: operation.voidedAt,
        },
        sync,
        error: entry.lastError,
      })
    }
  }
  return [...rows.values()]
}

export function mergeTransactions(
  serverRows: readonly Transaction[],
  outbox: readonly OutboxEntry[],
): LocalRow<Transaction>[] {
  return merge(serverRows, outbox, { create: 'transaction.create', void: 'transaction.void' })
}

export function mergeExpenses(
  serverRows: readonly Expense[],
  outbox: readonly OutboxEntry[],
): LocalRow<Expense>[] {
  return merge(serverRows, outbox, { create: 'expense.create', void: 'expense.void' })
}

/**
 * Orders as the cashier sees them: server orders + queued saves (newest device edit wins),
 * cancellations, and sales that settle an order.
 */
export function mergeOrders(
  serverOrders: readonly Order[],
  outbox: readonly OutboxEntry[],
): LocalRow<Order>[] {
  const rows = new Map<string, LocalRow<Order>>(
    serverOrders.map((row) => [row.id, { row, sync: 'synced', error: null }]),
  )
  for (const entry of [...outbox].sort((a, b) => a.seq - b.seq)) {
    const { operation } = entry
    const sync: SyncState = entry.status === 'failed' ? 'failed' : 'pending'
    if (operation.kind === 'order.save') {
      const current = rows.get(operation.record.id)
      if (current && current.row.status !== 'open') continue
      if (current && current.row.deviceUpdatedAt > operation.record.deviceUpdatedAt) continue
      rows.set(operation.record.id, { row: operation.record, sync, error: entry.lastError })
    } else if (operation.kind === 'order.cancel') {
      const current = rows.get(operation.targetId)
      if (!current || current.row.status !== 'open') continue
      rows.set(operation.targetId, {
        row: {
          ...current.row,
          status: 'cancelled',
          cancelReason: operation.reason,
          cancelledAt: operation.cancelledAt,
        },
        sync,
        error: entry.lastError,
      })
    } else if (operation.kind === 'transaction.create' && operation.record.orderId) {
      const current = rows.get(operation.record.orderId)
      if (!current || current.row.status !== 'open') continue
      rows.set(current.row.id, {
        row: { ...current.row, status: 'paid', transactionId: operation.record.id },
        sync,
        error: entry.lastError,
      })
    }
  }
  return [...rows.values()]
}
