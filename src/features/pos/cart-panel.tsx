import {
  CarFrontIcon,
  MinusIcon,
  PlusIcon,
  ShoppingCartIcon,
  Trash2Icon,
  XIcon,
} from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatTime } from '@/lib/datetime'
import { formatRupiah } from '@/lib/money'
import { cn } from '@/lib/utils'
import { lineTotal } from './cart'
import { saveOrder } from './commands'
import { useCart } from './use-cart'
import { useKasirData } from './use-kasir-data'
import { MAX_PLATE_LENGTH } from './plate'

export function CartPanel({ onPay, className }: { onPay: () => void; className?: string }) {
  const { lines, total, quantity, plateNumber, setPlateNumber, dispatch, reset, order } = useCart()
  const { business, device } = useKasirData()
  const [saving, setSaving] = useState(false)

  // Decision #34: check the car in now, take the money when it is done.
  async function payLater() {
    if (saving || lines.length === 0) return
    setSaving(true)
    try {
      const result = await saveOrder({ business, device, lines, plateNumber, existing: order })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success(
        `${order ? 'Pesanan diperbarui' : 'Pesanan disimpan'}${
          result.value.plateNumber ? ` · ${result.value.plateNumber}` : ''
        } — bayar nanti di menu Pesanan`,
      )
      reset()
    } catch {
      toast.error('Gagal menyimpan di perangkat. Coba lagi.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={cn('flex min-h-0 flex-col', className)}>
      {order && (
        <div className="mx-4 mt-4 flex items-center gap-2 rounded-lg border border-primary/40 bg-brand-soft px-3 py-2 text-sm">
          <CarFrontIcon className="size-4 shrink-0 text-brand-ink" aria-hidden />
          <span className="min-w-0 flex-1 truncate">
            Pesanan {order.plateNumber ?? 'tanpa plat'} · masuk{' '}
            {formatTime(new Date(order.openedAt), business.timezone)}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            onClick={reset}
            aria-label="Tutup pesanan dari keranjang"
          >
            <XIcon />
          </Button>
        </div>
      )}
      <div className="flex items-center justify-between gap-2 px-4 pt-4 pb-2">
        <h2 className="font-semibold">
          Keranjang{' '}
          {quantity > 0 && <span className="font-normal text-muted-foreground">({quantity})</span>}
        </h2>
        {lines.length > 0 && (
          <Button variant="ghost" size="sm" onClick={reset} className="text-muted-foreground">
            <Trash2Icon />
            Kosongkan
          </Button>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4">
        {lines.length === 0 ? (
          <div className="flex h-full min-h-32 flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground">
            <ShoppingCartIcon className="size-8 opacity-40" aria-hidden />
            Pilih layanan untuk memulai transaksi
          </div>
        ) : (
          <ul className="divide-y">
            {lines.map((line) => (
              <li key={line.itemId} className="grid gap-2 py-3">
                <div className="flex items-start justify-between gap-3">
                  <p className="min-w-0 text-sm leading-snug font-medium">{line.name}</p>
                  <p className="shrink-0 text-sm font-semibold tabular-nums">
                    {formatRupiah(lineTotal(line))}
                  </p>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs text-muted-foreground tabular-nums">
                    {formatRupiah(line.price)} / item
                  </p>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="icon"
                      className="size-9"
                      aria-label={`Kurangi ${line.name}`}
                      onClick={() => dispatch({ type: 'decrement', itemId: line.itemId })}
                    >
                      <MinusIcon />
                    </Button>
                    <span className="w-8 text-center text-sm font-semibold tabular-nums">
                      {line.qty}
                    </span>
                    <Button
                      variant="outline"
                      size="icon"
                      className="size-9"
                      aria-label={`Tambah ${line.name}`}
                      onClick={() => dispatch({ type: 'increment', itemId: line.itemId })}
                    >
                      <PlusIcon />
                    </Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="space-y-3 border-t bg-background p-4">
        <div className="grid gap-1.5">
          <Label htmlFor="plate-number" className="text-xs text-muted-foreground">
            Plat nomor (opsional)
          </Label>
          <Input
            id="plate-number"
            value={plateNumber}
            maxLength={MAX_PLATE_LENGTH + 4}
            onChange={(event) => setPlateNumber(event.target.value.toUpperCase())}
            placeholder="B 1234 XYZ"
            autoComplete="off"
            autoCapitalize="characters"
            className="h-10 uppercase"
          />
        </div>
        <div className="flex items-baseline justify-between">
          <span className="text-sm text-muted-foreground">Total</span>
          <span className="text-3xl font-bold tracking-tight tabular-nums">
            {formatRupiah(total)}
          </span>
        </div>
        <div className="grid gap-2">
          <Button
            variant="outline"
            size="lg"
            className="h-11 w-full"
            disabled={lines.length === 0 || saving}
            onClick={() => void payLater()}
          >
            <CarFrontIcon />
            {order ? 'Simpan perubahan, bayar nanti' : 'Simpan, bayar nanti'}
          </Button>
          <Button
            size="lg"
            className="h-14 w-full text-lg font-semibold"
            disabled={lines.length === 0}
            onClick={onPay}
          >
            Bayar
          </Button>
        </div>
      </div>
    </div>
  )
}
