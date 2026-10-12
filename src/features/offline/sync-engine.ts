import { db, type KasikoDb, type OutboxEntry, type OutboxOperation } from './db'
import { onOutboxChange } from './outbox'

// Sends the outbox to the server in insertion order (AGENTS.md §9).
// - Retryable failure (offline, timeout): stop and retry later with backoff, so a void
//   can never overtake the create it depends on.
// - Permanent failure (rejected by validation/RLS): mark `failed`, keep it visible to the
//   cashier, and continue with the next entry. Nothing is ever dropped silently.

/** Thrown by a transport when retrying cannot help. */
export class PermanentSyncError extends Error {}

export interface SyncTransport {
  send(operation: OutboxOperation): Promise<void>
}

const BASE_DELAY_MS = 2_000
const MAX_DELAY_MS = 5 * 60_000

export function backoffDelay(attempts: number): number {
  return Math.min(BASE_DELAY_MS * 2 ** Math.max(attempts - 1, 0), MAX_DELAY_MS)
}

export interface SyncResult {
  sent: number
  failed: number
  /** True when processing stopped on a retryable error. */
  blocked: boolean
}

/** One pass over the queue. Pure orchestration; safe to call repeatedly. */
export async function processOutbox(
  transport: SyncTransport,
  database: KasikoDb = db,
  now: () => number = Date.now,
): Promise<SyncResult> {
  const result: SyncResult = { sent: 0, failed: 0, blocked: false }
  const pending = await database.outbox.where('status').equals('pending').sortBy('seq')
  for (const entry of pending) {
    if (entry.nextAttemptAt > now()) {
      result.blocked = true
      break
    }
    try {
      await transport.send(entry.operation)
      await database.outbox.delete(entry.id)
      result.sent++
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const attempts = entry.attempts + 1
      if (error instanceof PermanentSyncError) {
        await database.outbox.update(entry.id, { status: 'failed', attempts, lastError: message })
        result.failed++
        continue
      }
      await database.outbox.update(entry.id, {
        attempts,
        lastError: message,
        nextAttemptAt: now() + backoffDelay(attempts),
      } satisfies Partial<OutboxEntry>)
      result.blocked = true
      break
    }
  }
  return result
}

const PERIODIC_MS = 30_000

/**
 * Runs `processOutbox` on start, on the `online` event, when new work is queued, and
 * periodically. Only one tab syncs at a time (Web Locks), the others skip.
 */
export function startSyncEngine(transport: SyncTransport): () => void {
  let running = false
  let again = false
  let stopped = false

  async function pass() {
    if (running) {
      again = true
      return
    }
    running = true
    try {
      do {
        again = false
        if (!navigator.onLine) break
        await withLock(() => processOutbox(transport))
      } while (again && !stopped)
    } finally {
      running = false
    }
  }

  const trigger = () => void pass()
  window.addEventListener('online', trigger)
  const unsubscribe = onOutboxChange(trigger)
  const timer = window.setInterval(trigger, PERIODIC_MS)
  trigger()

  return () => {
    stopped = true
    window.removeEventListener('online', trigger)
    unsubscribe()
    window.clearInterval(timer)
  }
}

async function withLock(task: () => Promise<unknown>): Promise<void> {
  if (!('locks' in navigator)) {
    await task()
    return
  }
  await navigator.locks.request('kasiko-sync', { ifAvailable: true }, async (lock) => {
    if (lock) await task()
  })
}
