import { useQuery } from '@tanstack/react-query'
import { createContext, use } from 'react'
import { useSession } from '@/features/auth/session'
import { fetchOwnerBusinesses, type OwnerMaster } from './owner'
import { keys } from './query-client'

// Master data of the selected business, loaded once by the owner layout and shared by
// every owner page. Lists and totals are fetched by the pages that need them.

export const OwnerDataContext = createContext<OwnerMaster | null>(null)

export function useOwnerData(): OwnerMaster {
  const data = use(OwnerDataContext)
  if (!data) throw new Error('useOwnerData must be used inside the owner layout')
  return data
}

/** Every business of the signed-in owner, for the business switcher. */
export function useOwnerBusinesses() {
  const session = useSession()
  return useQuery({
    queryKey: keys.businesses(session?.userId ?? ''),
    queryFn: fetchOwnerBusinesses,
    enabled: Boolean(session),
  })
}
