import { RefreshCwIcon, XIcon } from 'lucide-react'
import { useEffect } from 'react'
import { toast } from 'sonner'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { Button } from '@/components/ui/button'

const UPDATE_CHECK_MS = 60 * 60_000

/**
 * "Versi baru tersedia" banner (registerType: 'prompt'). Updating reloads the page; the
 * outbox lives in IndexedDB so no unsynced sale is lost, only the open cart.
 */
export function PwaPrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      if (!registration) return
      // Long-running cashier tabs would otherwise never notice a deploy.
      setInterval(() => void registration.update(), UPDATE_CHECK_MS)
    },
  })

  useEffect(() => {
    if (!offlineReady) return
    toast.success('Aplikasi siap dipakai offline')
    setOfflineReady(false)
  }, [offlineReady, setOfflineReady])

  if (!needRefresh) return null
  return (
    <div
      role="alert"
      className="fixed inset-x-3 bottom-24 z-50 mx-auto flex max-w-md items-center gap-3 rounded-xl border bg-background p-3 shadow-lg md:bottom-6"
    >
      <RefreshCwIcon className="size-5 shrink-0 text-primary" aria-hidden />
      <div className="min-w-0 flex-1 text-sm">
        <p className="font-medium">Versi baru tersedia</p>
        <p className="text-xs text-muted-foreground">Keranjang yang terbuka akan dikosongkan.</p>
      </div>
      <Button size="sm" onClick={() => void updateServiceWorker(true)}>
        Muat ulang
      </Button>
      <Button
        size="icon"
        variant="ghost"
        aria-label="Nanti saja"
        onClick={() => setNeedRefresh(false)}
      >
        <XIcon />
      </Button>
    </div>
  )
}
