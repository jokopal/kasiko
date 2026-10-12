import { useMemo } from 'react'
import { useSession } from '@/features/auth/session'
import { bySortOrder } from '@/lib/ordering'
import type { Business } from '@/lib/types'
import type { PreviewState } from './seed'
import { usePreviewState } from './store'

/** Everything belonging to one business, sorted for display. */
export function selectBusinessData(state: PreviewState, businessId: string) {
  const mine = <T extends { businessId: string }>(rows: T[]) =>
    rows.filter((row) => row.businessId === businessId)
  return {
    business: state.businesses.find((b) => b.id === businessId),
    catalogCategories: mine(state.catalogCategories).sort(bySortOrder),
    catalogItems: mine(state.catalogItems).sort(bySortOrder),
    expenseCategories: mine(state.expenseCategories).sort(bySortOrder),
    transactions: mine(state.transactions),
    expenses: mine(state.expenses),
    reserveMovements: mine(state.reserveMovements),
    cashierAccount: state.cashierAccounts.find((a) => a.businessId === businessId),
  }
}

export type BusinessData = ReturnType<typeof selectBusinessData> & { business: Business }

/** Data for the business in the current session. Only call below a role guard. */
export function useBusinessData(): BusinessData {
  const session = useSession()
  const state = usePreviewState()
  const businessId = session?.businessId ?? ''
  const data = useMemo(() => selectBusinessData(state, businessId), [state, businessId])
  if (!data.business) throw new Error(`Usaha ${businessId} tidak ditemukan`)
  return data as BusinessData
}
