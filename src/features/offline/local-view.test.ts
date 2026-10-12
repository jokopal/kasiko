import { describe, expect, it } from 'vitest'
import type { Transaction } from '@/lib/types'
import type { OutboxEntry, OutboxOperation } from './db'
import { mergeTransactions } from './local-view'

const tx = (id: string, extra: Partial<Transaction> = {}) =>
  ({ id, status: 'paid', voidReason: null, voidedAt: null, ...extra }) as Transaction

const entry = (
  seq: number,
  operation: OutboxOperation,
  status: OutboxEntry['status'] = 'pending',
): OutboxEntry => ({
  id: `op-${seq}`,
  businessId: 'b',
  operation,
  status,
  attempts: 0,
  lastError: status === 'failed' ? 'ditolak' : null,
  seq,
  createdAt: '',
  nextAttemptAt: 0,
})

describe('mergeTransactions', () => {
  it('adds unsynced creates and marks their state', () => {
    const rows = mergeTransactions(
      [tx('server')],
      [entry(1, { kind: 'transaction.create', record: tx('local') })],
    )
    expect(rows.map((r) => [r.row.id, r.sync])).toEqual([
      ['server', 'synced'],
      ['local', 'pending'],
    ])
  })

  it('prefers the server copy once a create has arrived', () => {
    const rows = mergeTransactions(
      [tx('same', { receiptNo: 'server' })],
      [entry(1, { kind: 'transaction.create', record: tx('same', { receiptNo: 'local' }) })],
    )
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ sync: 'synced', row: { receiptNo: 'server' } })
  })

  it('applies pending voids on top, including to unsynced creates', () => {
    const rows = mergeTransactions(
      [tx('server')],
      [
        entry(1, { kind: 'transaction.create', record: tx('local') }),
        entry(2, { kind: 'transaction.void', targetId: 'local', reason: 'Salah', voidedAt: 't' }),
        entry(
          3,
          { kind: 'transaction.void', targetId: 'server', reason: 'Batal', voidedAt: 't' },
          'failed',
        ),
      ],
    )
    expect(rows.find((r) => r.row.id === 'local')).toMatchObject({
      sync: 'pending',
      row: { status: 'void', voidReason: 'Salah' },
    })
    expect(rows.find((r) => r.row.id === 'server')).toMatchObject({
      sync: 'failed',
      error: 'ditolak',
      row: { status: 'void' },
    })
  })
})
