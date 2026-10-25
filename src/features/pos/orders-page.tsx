import { BanIcon, CarFrontIcon, PencilIcon, WalletIcon } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { VoidDialog } from '@/components/void-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { formatTime } from '@/lib/datetime'
import { formatRupiah } from '@/lib/money'
import type { Order } from '@/lib/types'
import { cancelOrder } from './commands'
import { useCart } from './use-cart'
import { useKasirData } from './use-kasir-data'

/** Minutes since the car was checked in, for "menunggu 25 menit". */
function waitingLabel(openedAt: string, now = Date.now()): string {
  const minutes = Math.max(0, Math.round((now - new Date(openedAt).getTime()) / 60_000))
  if (minutes < 60) return `${minutes} menit`
  const hours = Math.floor(minutes / 60)
  return `${hours} jam ${minutes % 60} menit`
}

/** Decision #34: cars checked in and not paid yet. */
export function OrdersPage() {
  const { business, openOrders } = useKasirData()
  const { loadOrder, lines, order: inCart } = useCart()
  const navigate = useNavigate()
  const [target, setTarget] = useState<Order | null>(null)

  function open(order: Order, pay: boolean) {
    if (lines.length > 0 && inCart?.id !== order.id) {
      toast.error('Keranjang masih berisi layanan lain. Simpan atau kosongkan dulu.')
      return
    }
    loadOrder(order)
    void navigate('/kasir', { state: { pay } })
  }

  return (
    <div className="mx-auto h-full max-w-3xl overflow-y-auto p-3 md:p-6">
      <div className="mb-4">
        <h1 className="text-xl font-semibold">Pesanan belum bayar</h1>
        <p className="text-sm text-muted-foreground">
          Mobil yang sudah masuk dan dibayar saat selesai.
        </p>
      </div>

      {openOrders.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center text-sm text-muted-foreground">
            <CarFrontIcon className="size-8 opacity-40" aria-hidden />
            Tidak ada pesanan terbuka. Pilih layanan di Kasir lalu tekan “Simpan, bayar nanti”.
          </CardContent>
        </Card>
      ) : (
        <ul className="grid gap-3">
          {openOrders.map(({ row: order, sync }) => (
            <li key={order.id}>
              <Card className="gap-3 py-4">
                <CardContent className="grid gap-3 px-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 font-semibold">
                        <CarFrontIcon className="size-4 shrink-0" aria-hidden />
                        {order.plateNumber ?? 'Tanpa plat'}
                        {sync !== 'synced' && (
                          <Badge variant={sync === 'failed' ? 'destructive' : 'outline'}>
                            {sync === 'failed' ? 'Gagal sinkron' : 'Belum tersinkron'}
                          </Badge>
                        )}
                      </p>
                      <p className="mt-0.5 truncate text-sm text-muted-foreground">
                        {order.items.map((line) => `${line.name} ×${line.qty}`).join(', ')}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Masuk {formatTime(new Date(order.openedAt), business.timezone)} · menunggu{' '}
                        {waitingLabel(order.openedAt)}
                      </p>
                    </div>
                    <p className="shrink-0 text-lg font-bold tabular-nums">
                      {formatRupiah(order.total)}
                    </p>
                  </div>
                  <div className="grid grid-cols-[1fr_auto_auto] gap-2">
                    <Button className="h-11" onClick={() => open(order, true)}>
                      <WalletIcon />
                      Bayar
                    </Button>
                    <Button
                      variant="outline"
                      className="h-11"
                      onClick={() => open(order, false)}
                      aria-label={`Ubah pesanan ${order.plateNumber ?? ''}`.trim()}
                    >
                      <PencilIcon />
                      <span className="hidden sm:inline">Ubah</span>
                    </Button>
                    <Button
                      variant="outline"
                      className="h-11 text-destructive"
                      onClick={() => setTarget(order)}
                      aria-label={`Batalkan pesanan ${order.plateNumber ?? ''}`.trim()}
                    >
                      <BanIcon />
                      <span className="hidden sm:inline">Batalkan</span>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <VoidDialog
        open={target !== null}
        onOpenChange={(next) => !next && setTarget(null)}
        title="Batalkan pesanan?"
        description={
          target ? `${target.plateNumber ?? 'Tanpa plat'} · ${formatRupiah(target.total)}` : ''
        }
        onConfirm={async (reason) => {
          if (!target) return { ok: false, error: 'Tidak ada pesanan dipilih' }
          const result = await cancelOrder(target, reason)
          if (result.ok) toast.success('Pesanan dibatalkan')
          return result
        }}
      />
    </div>
  )
}
