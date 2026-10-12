import Dexie, { type EntityTable } from 'dexie'
import type {
  Business,
  CatalogCategory,
  CatalogItem,
  Expense,
  ExpenseCategory,
  Transaction,
} from '@/lib/types'

// Device-local storage for the cashier (decision #7, AGENTS.md §9). Everything a cashier
// needs to keep selling offline lives here; the server stays the source of truth.

export type OutboxOperation =
  | { kind: 'transaction.create'; record: Transaction }
  | { kind: 'transaction.void'; targetId: string; reason: string; voidedAt: string }
  | { kind: 'expense.create'; record: Expense }
  | { kind: 'expense.void'; targetId: string; reason: string; voidedAt: string }

export interface OutboxEntry {
  /** Operation id; for creates it equals the record id (the idempotency key). */
  id: string
  businessId: string
  operation: OutboxOperation
  /** `failed` = permanently rejected by the server; kept and shown, never dropped. */
  status: 'pending' | 'failed'
  attempts: number
  lastError: string | null
  /** Monotonic insertion order, so voids always sync after their create. */
  seq: number
  createdAt: string
  /** Epoch ms before which the entry is not retried (backoff). */
  nextAttemptAt: number
}

export interface CatalogSnapshot {
  businessId: string
  business: Business
  catalogCategories: CatalogCategory[]
  catalogItems: CatalogItem[]
  expenseCategories: ExpenseCategory[]
  fetchedAt: string
}

export interface DeviceRecord {
  businessId: string
  deviceId: string
  deviceCode: string
  registeredAt: string
}

export interface SequenceRecord {
  businessId: string
  dayKey: string
  seq: number
}

export class KasikoDb extends Dexie {
  outbox!: EntityTable<OutboxEntry, 'id'>
  catalog!: EntityTable<CatalogSnapshot, 'businessId'>
  devices!: EntityTable<DeviceRecord, 'businessId'>
  sequences!: EntityTable<SequenceRecord, 'businessId'>

  constructor(name = 'kasiko') {
    super(name)
    this.version(1).stores({
      outbox: 'id, seq, status, businessId',
      catalog: 'businessId',
      devices: 'businessId',
      sequences: 'businessId',
    })
  }
}

export const db = new KasikoDb()
