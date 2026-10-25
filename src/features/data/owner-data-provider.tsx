import { useQuery } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { PageLoading } from '@/components/page-loading'
import { BlockingScreen } from '@/features/offline/blocking-screen'
import { fetchOwnerMaster } from './owner'
import { OwnerDataContext } from './owner-data'
import { keys } from './query-client'

export function OwnerDataProvider({
  businessId,
  children,
}: {
  businessId: string
  children: ReactNode
}) {
  const master = useQuery({
    queryKey: keys.master(businessId),
    queryFn: () => fetchOwnerMaster(businessId),
    enabled: businessId !== '',
  })
  if (master.error) {
    return (
      <BlockingScreen title="Data usaha belum bisa dimuat">{master.error.message}</BlockingScreen>
    )
  }
  if (!master.data) return <PageLoading />
  return <OwnerDataContext value={master.data}>{children}</OwnerDataContext>
}
