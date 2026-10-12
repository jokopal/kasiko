import type { Expense, Transaction } from '@/lib/types'
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
