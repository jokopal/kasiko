import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { LoadingScreen } from '@/app/pages/loading-screen'
import { BlockingScreen } from '@/features/offline/blocking-screen'
import { db } from '@/features/offline/db'
import { registerDevice, useDevice } from '@/features/offline/device'
import { mergeExpenses, mergeTransactions } from '@/features/offline/local-view'
import { useOutbox } from '@/features/offline/outbox'
import { startSyncEngine } from '@/features/offline/sync-engine'
import { useOnlineStatus } from '@/features/offline/use-online-status'
import { selectBusinessData } from '@/features/preview/selectors'
import { usePreviewState } from '@/features/preview/store'
import { previewRegistrar, previewTransport } from '@/features/preview/transport'
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
  const server = usePreviewState()
  const serverData = useMemo(() => selectBusinessData(server, businessId), [server, businessId])
  const snapshot = useLiveQuery(
    async () => (await db.catalog.get(businessId)) ?? null,
    [businessId],
  )
  const device = useDevice(businessId)
  const outbox = useOutbox(businessId)
  const [registerError, setRegisterError] = useState<string | null>(null)

  // Refresh the cached catalog & branding whenever the server copy is reachable.
  const { business, catalogCategories, catalogItems, expenseCategories } = serverData
  const catalogKey = JSON.stringify([business, catalogCategories, catalogItems, expenseCategories])
  useEffect(() => {
    if (!online || !business) return
    void db.catalog.put({
      businessId,
      business,
      catalogCategories,
      catalogItems,
      expenseCategories,
      fetchedAt: new Date().toISOString(),
    })
    // catalogKey captures every field written above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online, businessId, catalogKey])

  // A device registers once, online, and keeps its code (decision #16).
  useEffect(() => {
    if (device !== null || !online) return
    registerDevice(businessId, previewRegistrar).catch((error: unknown) =>
      setRegisterError(error instanceof Error ? error.message : 'Gagal mendaftarkan perangkat'),
    )
  }, [device, online, businessId])

  useEffect(() => startSyncEngine(previewTransport), [])

  // Ask the browser not to evict the outbox under storage pressure (decision #20).
  useEffect(() => {
    void navigator.storage?.persist?.()
  }, [])

  const value = useMemo<KasirData | null>(() => {
    if (!snapshot || !device || !outbox) return null
    const today = businessDayRange(new Date(), snapshot.business.timezone)
    const inToday = (row: { occurredAt: string }) => isInRange(new Date(row.occurredAt), today)
    return {
      business: snapshot.business,
      catalogCategories: snapshot.catalogCategories,
      catalogItems: snapshot.catalogItems,
      expenseCategories: snapshot.expenseCategories,
      device,
      // Cashiers only ever see today's rows and drawer expenses (RLS mirrors this).
      transactions: mergeTransactions(serverData.transactions.filter(inToday), outbox)
        .filter((r) => inToday(r.row))
        .sort(newestFirst),
      expenses: mergeExpenses(
        serverData.expenses.filter((e) => e.source === 'drawer' && inToday(e)),
        outbox,
      )
        .filter((r) => inToday(r.row))
        .sort(newestFirst),
      outbox,
    }
  }, [snapshot, device, outbox, serverData])

  if (snapshot === undefined || device === undefined || outbox === undefined) {
    return <LoadingScreen />
  }
  if (snapshot === null) {
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
