import { describe, expect, it } from 'vitest'
import type { Order, Transaction } from '@/lib/types'
import type { OutboxEntry, OutboxOperation } from './db'
import { mergeOrders, mergeTransactions } from './local-view'

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

describe('mergeOrders', () => {
  const order = (id: string, extra: Partial<Order> = {}) =>
    ({
      id,
      status: 'open',
      deviceUpdatedAt: '2026-10-25T03:00:00.000Z',
      transactionId: null,
      cancelReason: null,
      cancelledAt: null,
      total: 45_000,
      ...extra,
    }) as Order

  it('shows a car checked in offline right away', () => {
    const rows = mergeOrders([], [entry(1, { kind: 'order.save', record: order('o1') })])
    expect(rows.map((r) => [r.row.id, r.row.status, r.sync])).toEqual([['o1', 'open', 'pending']])
  })

  it('keeps the newest device edit and ignores stale ones', () => {
    const newer = order('o1', { total: 90_000, deviceUpdatedAt: '2026-10-25T04:00:00.000Z' })
    const rows = mergeOrders(
      [newer],
      [entry(1, { kind: 'order.save', record: order('o1', { total: 10_000 }) })],
    )
    expect(rows[0]?.row.total).toBe(90_000)
  })

  it('closes an order when it is paid or cancelled, even before syncing', () => {
    const paid = mergeOrders(
      [order('o1')],
      [entry(1, { kind: 'transaction.create', record: tx('t1', { orderId: 'o1' }) })],
    )
    expect(paid[0]?.row).toMatchObject({ status: 'paid', transactionId: 't1' })
    const cancelled = mergeOrders(
      [order('o2')],
      [
        entry(1, {
          kind: 'order.cancel',
          targetId: 'o2',
          reason: 'Pergi',
          cancelledAt: '2026-10-25T05:00:00.000Z',
        }),
      ],
    )
    expect(cancelled[0]?.row).toMatchObject({ status: 'cancelled', cancelReason: 'Pergi' })
  })

  it('never reopens a paid order with a late edit', () => {
    const rows = mergeOrders(
      [order('o1', { status: 'paid', transactionId: 't1' })],
      [
        entry(1, {
          kind: 'order.save',
          record: order('o1', { deviceUpdatedAt: '2026-12-01T00:00:00Z' }),
        }),
      ],
    )
    expect(rows[0]?.row.status).toBe('paid')
  })
})
