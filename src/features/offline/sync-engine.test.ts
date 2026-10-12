import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Transaction } from '@/lib/types'
import { KasikoDb, type OutboxEntry, type OutboxOperation } from './db'
import { backoffDelay, PermanentSyncError, processOutbox, type SyncTransport } from './sync-engine'

let database: KasikoDb

function create(id: string): OutboxOperation {
  return { kind: 'transaction.create', record: { id } as Transaction }
}

async function add(seq: number, operation: OutboxOperation, extra: Partial<OutboxEntry> = {}) {
  await database.outbox.add({
    id: `op-${seq}`,
    businessId: 'b',
    operation,
    status: 'pending',
    attempts: 0,
    lastError: null,
    seq,
    createdAt: new Date().toISOString(),
    nextAttemptAt: 0,
    ...extra,
  })
}

function recording(fail: (op: OutboxOperation) => Error | null = () => null) {
  const sent: string[] = []
  const transport: SyncTransport = {
    send(op) {
      const error = fail(op)
      if (error) return Promise.reject(error)
      sent.push(op.kind === 'transaction.create' ? op.record.id : op.kind)
      return Promise.resolve()
    },
  }
  return { sent, transport }
}

beforeEach(async () => {
  database = new KasikoDb(`test-${crypto.randomUUID()}`)
  await database.open()
})

afterEach(async () => {
  await database.delete()
})

describe('processOutbox', () => {
  it('sends in insertion order and empties the queue', async () => {
    await add(2, create('second'))
    await add(1, create('first'))
    await add(3, { kind: 'transaction.void', targetId: 'first', reason: 'x', voidedAt: '' })
    const { sent, transport } = recording()
    const result = await processOutbox(transport, database)
    expect(sent).toEqual(['first', 'second', 'transaction.void'])
    expect(result).toEqual({ sent: 3, failed: 0, blocked: false })
    expect(await database.outbox.count()).toBe(0)
  })

  it('stops on a retryable error so later entries never overtake', async () => {
    await add(1, create('a'))
    await add(2, create('b'))
    const { sent, transport } = recording((op) =>
      op.kind === 'transaction.create' && op.record.id === 'a' ? new Error('offline') : null,
    )
    const result = await processOutbox(transport, database, () => 1_000)
    expect(sent).toEqual([])
    expect(result.blocked).toBe(true)
    const head = await database.outbox.get('op-1')
    expect(head).toMatchObject({ status: 'pending', attempts: 1, lastError: 'offline' })
    expect(head?.nextAttemptAt).toBe(1_000 + backoffDelay(1))
  })

  it('respects the backoff window', async () => {
    await add(1, create('a'), { nextAttemptAt: 5_000 })
    const { sent, transport } = recording()
    expect((await processOutbox(transport, database, () => 4_999)).blocked).toBe(true)
    expect(sent).toEqual([])
    await processOutbox(transport, database, () => 5_000)
    expect(sent).toEqual(['a'])
  })

  it('keeps permanently rejected entries and continues with the next', async () => {
    await add(1, create('bad'))
    await add(2, create('good'))
    const { sent, transport } = recording((op) =>
      op.kind === 'transaction.create' && op.record.id === 'bad'
        ? new PermanentSyncError('Total tidak cocok')
        : null,
    )
    const result = await processOutbox(transport, database)
    expect(sent).toEqual(['good'])
    expect(result).toMatchObject({ sent: 1, failed: 1 })
    expect(await database.outbox.get('op-1')).toMatchObject({
      status: 'failed',
      lastError: 'Total tidak cocok',
    })
    // Failed entries are not retried automatically.
    await processOutbox(transport, database)
    expect(sent).toEqual(['good'])
  })
})

describe('backoffDelay', () => {
  it('grows exponentially up to a cap', () => {
    expect(backoffDelay(1)).toBe(2_000)
    expect(backoffDelay(2)).toBe(4_000)
    expect(backoffDelay(30)).toBe(5 * 60_000)
  })
})
