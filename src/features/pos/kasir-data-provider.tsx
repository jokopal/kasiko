import { useQuery } from '@tanstack/react-query'
import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { LoadingScreen } from '@/app/pages/loading-screen'
import { fetchKasirSnapshot, fetchKasirToday, fetchOrders } from '@/features/data/kasir'
import { keys, queryClient } from '@/features/data/query-client'
import { supabaseRegistrar, supabaseTransport } from '@/features/data/transport'
import { BlockingScreen } from '@/features/offline/blocking-screen'
import { db } from '@/features/offline/db'
import { registerDevice, useDevice } from '@/features/offline/device'
import { mergeExpenses, mergeOrders, mergeTransactions } from '@/features/offline/local-view'
import { useOutbox } from '@/features/offline/outbox'
import { startSyncEngine } from '@/features/offline/sync-engine'
import { useOnlineStatus } from '@/features/offline/use-online-status'
import { businessDayRange, isInRange } from '@/lib/datetime'
import { KasirDataContext, type KasirData } from './use-kasir-data'

const newestFirst = (a: { row: { occurredAt: string } }, b: { row: { occurredAt: string } }) =>
  b.row.occurredAt.localeCompare(a.row.occurredAt)

/**
 * Local-first data for the cashier: the catalog comes from the device cache (refreshed
 * whenever the server is reachable), writes go through the outbox, and the sync engine
 * runs for as long as the cashier area is open.
 */
export function KasirDataProvider({
  businessId,
  children,
}: {
  businessId: string
  children: ReactNode
}) {
  const online = useOnlineStatus()
  const cached = useLiveQuery(async () => (await db.catalog.get(businessId)) ?? null, [businessId])
  const device = useDevice(businessId)
  const outbox = useOutbox(businessId)
  const [registerError, setRegisterError] = useState<string | null>(null)
  const timeZone = cached?.business.timezone ?? 'Asia/Jakarta'

  // Catalog & branding: refreshed from the server, kept on the device for offline use.
  const snapshot = useQuery({
    queryKey: keys.kasir(businessId, 'snapshot'),
    queryFn: () => fetchKasirSnapshot(businessId),
    enabled: online,
    refetchInterval: 5 * 60_000,
  })
  useEffect(() => {
    if (snapshot.data) void db.catalog.put(snapshot.data)
  }, [snapshot.data])

  const dayStart = businessDayRange(new Date(), timeZone).from.toISOString()
  const today = useQuery({
    queryKey: [...keys.kasir(businessId, 'today'), dayStart],
    queryFn: () => fetchKasirToday(businessId, dayStart),
    enabled: online && Boolean(cached),
    refetchInterval: 60_000,
  })
  const orders = useQuery({
    queryKey: keys.kasir(businessId, 'orders'),
    queryFn: () => fetchOrders(businessId),
    enabled: online && Boolean(cached),
    refetchInterval: 30_000,
  })

  // Whenever the queue shrinks, something reached the server: show the server copy.
  const queued = outbox?.length ?? 0
  const previous = useRef(queued)
  useEffect(() => {
    if (queued < previous.current) {
      void queryClient.invalidateQueries({ queryKey: ['kasir', businessId] })
    }
    previous.current = queued
  }, [queued, businessId])

  // A device registers once, online, and keeps its code (decision #16).
  useEffect(() => {
    if (device !== null || !online) return
    registerDevice(businessId, supabaseRegistrar).catch((error: unknown) =>
      setRegisterError(error instanceof Error ? error.message : 'Gagal mendaftarkan perangkat'),
    )
  }, [device, online, businessId])

  useEffect(() => startSyncEngine(supabaseTransport), [])

  // Ask the browser not to evict the outbox under storage pressure (decision #20).
  useEffect(() => {
    void navigator.storage?.persist?.()
  }, [])

  const value = useMemo<KasirData | null>(() => {
    if (!cached || !device || !outbox) return null
    const range = businessDayRange(new Date(), cached.business.timezone)
    const inToday = (row: { occurredAt: string }) => isInRange(new Date(row.occurredAt), range)
    const server = today.data ?? { transactions: [], expenses: [] }
    return {
      business: cached.business,
      catalogCategories: cached.catalogCategories,
      catalogItems: cached.catalogItems,
      expenseCategories: cached.expenseCategories,
      discounts: (cached.discounts ?? []).filter((d) => d.isActive),
      device,
      transactions: mergeTransactions(server.transactions.filter(inToday), outbox)
        .filter((r) => inToday(r.row))
        .sort(newestFirst),
      expenses: mergeExpenses(server.expenses.filter(inToday), outbox)
        .filter((r) => inToday(r.row))
        .sort(newestFirst),
      openOrders: mergeOrders(orders.data ?? [], outbox)
        .filter((r) => r.row.status === 'open')
        .sort((a, b) => a.row.openedAt.localeCompare(b.row.openedAt)),
      outbox,
    }
  }, [cached, device, outbox, today.data, orders.data])

  if (cached === undefined || device === undefined || outbox === undefined) {
    return <LoadingScreen />
  }
  if (cached === null) {
    if (snapshot.error) {
      return (
        <BlockingScreen title="Katalog belum bisa dimuat">{snapshot.error.message}</BlockingScreen>
      )
    }
    if (online) return <LoadingScreen />
    return (
      <BlockingScreen title="Butuh koneksi internet">
        Katalog belum pernah diunduh di perangkat ini. Sambungkan internet sekali; setelah itu kasir
        tetap bisa dipakai saat offline.
      </BlockingScreen>
    )
  }
  if (device === null) {
    if (registerError) {
      return <BlockingScreen title="Perangkat belum terdaftar">{registerError}</BlockingScreen>
    }
    if (!online) {
      return (
        <BlockingScreen title="Butuh koneksi internet">
          Perangkat kasir ini perlu didaftarkan sekali secara online sebelum bisa dipakai.
        </BlockingScreen>
      )
    }
    return <LoadingScreen />
  }
  if (!value) return <LoadingScreen />
  return <KasirDataContext value={value}>{children}</KasirDataContext>
}
