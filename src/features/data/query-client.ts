import { QueryClient } from '@tanstack/react-query'

// Server state for the owner area and the cashier's server snapshot. The owner is always
// online (decision #7), so a short stale time keeps numbers fresh without hammering.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: true,
    },
  },
})

/** Query keys, scoped by business so switching business never mixes data. */
export const keys = {
  businesses: (userId: string) => ['businesses', userId] as const,
  business: (businessId: string) => ['business', businessId] as const,
  master: (businessId: string) => ['master', businessId] as const,
  list: (businessId: string, name: string, ...rest: unknown[]) =>
    ['list', businessId, name, ...rest] as const,
  report: (businessId: string, name: string, ...rest: unknown[]) =>
    ['report', businessId, name, ...rest] as const,
  kasir: (businessId: string, name: string) => ['kasir', businessId, name] as const,
}

/** Refreshes everything of one business after a change. */
export function invalidateBusiness(businessId: string) {
  return queryClient.invalidateQueries({
    predicate: (query) => query.queryKey[1] === businessId || query.queryKey[0] === 'businesses',
  })
}
