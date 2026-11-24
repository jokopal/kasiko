import type { CatalogSnapshot } from '@/features/offline/db'
import { getSupabase } from '@/lib/supabase'
import type { Expense, Order, Transaction } from '@/lib/types'
import {
  toBusiness,
  toCatalogCategory,
  toCatalogItem,
  toDiscount,
  toExpense,
  toExpenseCategory,
  toOrder,
  toTransaction,
  type BusinessRow,
  type CatalogCategoryRow,
  type CatalogItemRow,
  type DiscountRow,
  type ExpenseCategoryRow,
  type ExpenseRow,
  type OrderRow,
  type TransactionRow,
} from './rows'

// What the cashier reads from the server. RLS already limits every query to the
// cashier's business, active catalog rows, drawer categories and today's records; the
// filters below only make the intent explicit.

export const LOGO_BUCKET = 'logos'

/** Public URL of a business logo stored in Supabase Storage. */
export function logoUrl(path: string | null): string | null {
  if (!path) return null
  return getSupabase().storage.from(LOGO_BUCKET).getPublicUrl(path).data.publicUrl
}

interface QueryOutcome {
  data: unknown
  error: { message: string } | null
}

/** Rows of a list query; a failed query throws so callers never mistake it for "empty". */
export function rowsOf<T>(result: QueryOutcome): T[] {
  if (result.error) throw new Error(result.error.message)
  return (result.data ?? []) as T[]
}

export function rowOf<T>(result: QueryOutcome): T {
  if (result.error) throw new Error(result.error.message)
  if (result.data === null || result.data === undefined) throw new Error('Data tidak ditemukan')
  return result.data as T
}

export async function fetchKasirSnapshot(businessId: string): Promise<CatalogSnapshot> {
  const db = getSupabase()
  const [business, categories, items, expenseCategories, discounts] = await Promise.all([
    db.from('business_branding').select('*').eq('id', businessId).single(),
    db.from('catalog_categories').select('*').eq('business_id', businessId).order('sort_order'),
    db.from('catalog_items').select('*').eq('business_id', businessId).order('sort_order'),
    db.from('expense_categories').select('*').eq('business_id', businessId).order('sort_order'),
    db.from('discounts').select('*').eq('business_id', businessId).order('sort_order'),
  ])
  const branding = rowOf<BusinessRow>(business)
  return {
    businessId,
    business: toBusiness(branding, logoUrl(branding.logo_path)),
    catalogCategories: rowsOf<CatalogCategoryRow>(categories).map(toCatalogCategory),
    catalogItems: rowsOf<CatalogItemRow>(items).map(toCatalogItem),
    expenseCategories: rowsOf<ExpenseCategoryRow>(expenseCategories).map(toExpenseCategory),
    discounts: rowsOf<DiscountRow>(discounts).map(toDiscount),
    fetchedAt: new Date().toISOString(),
  }
}

export interface KasirToday {
  transactions: Transaction[]
  expenses: Expense[]
}

/** Today's sales and drawer expenses (business day start passed in as ISO). */
export async function fetchKasirToday(businessId: string, dayStart: string): Promise<KasirToday> {
  const db = getSupabase()
  const [transactions, expenses] = await Promise.all([
    db
      .from('transactions')
      .select('*, transaction_items(*)')
      .eq('business_id', businessId)
      .gte('occurred_at', dayStart)
      .order('occurred_at', { ascending: false }),
    db
      .from('expenses')
      .select('*')
      .eq('business_id', businessId)
      .eq('source', 'drawer')
      .gte('occurred_at', dayStart)
      .order('occurred_at', { ascending: false }),
  ])
  return {
    transactions: rowsOf<TransactionRow>(transactions).map(toTransaction),
    expenses: rowsOf<ExpenseRow>(expenses).map(toExpense),
  }
}

/** Open orders (plus today's closed ones, which RLS also returns). */
export async function fetchOrders(businessId: string): Promise<Order[]> {
  const result = await getSupabase()
    .from('orders')
    .select('*')
    .eq('business_id', businessId)
    .order('opened_at')
  return rowsOf<OrderRow>(result).map(toOrder)
}
