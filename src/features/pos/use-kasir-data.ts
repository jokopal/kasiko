import { createContext, use } from 'react'
import type { DeviceRecord, OutboxEntry } from '@/features/offline/db'
import type { LocalRow } from '@/features/offline/local-view'
import type {
  Business,
  CatalogCategory,
  CatalogItem,
  Expense,
  ExpenseCategory,
  Transaction,
} from '@/lib/types'

/** Everything the cashier screens read: cached catalog + server rows merged with the outbox. */
export interface KasirData {
  business: Business
  catalogCategories: CatalogCategory[]
  catalogItems: CatalogItem[]
  expenseCategories: ExpenseCategory[]
  device: DeviceRecord
  /** Today's transactions, newest first, including ones not yet synced. */
  transactions: LocalRow<Transaction>[]
  /** Today's drawer expenses, newest first, including ones not yet synced. */
  expenses: LocalRow<Expense>[]
  outbox: OutboxEntry[]
}

export const KasirDataContext = createContext<KasirData | null>(null)

export function useKasirData(): KasirData {
  const data = use(KasirDataContext)
  if (!data) throw new Error('useKasirData must be used inside the kasir layout')
  return data
}
