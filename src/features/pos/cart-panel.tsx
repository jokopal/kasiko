import { MinusIcon, PlusIcon, ShoppingCartIcon, Trash2Icon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatRupiah } from '@/lib/money'
import { cn } from '@/lib/utils'
import { lineTotal } from './cart'
import { useCart } from './use-cart'
import { MAX_PLATE_LENGTH } from './plate'

export function CartPanel({ onPay, className }: { onPay: () => void; className?: string }) {
  const { lines, total, quantity, plateNumber, setPlateNumber, dispatch, reset } = useCart()

  return (
    <div className={cn('flex min-h-0 flex-col', className)}>
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
  )
}
