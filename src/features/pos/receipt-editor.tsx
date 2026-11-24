import { CheckIcon, MinusIcon, PencilIcon, PlusIcon, Trash2Icon } from 'lucide-react'
import { useState } from 'react'
import { RupiahInput } from '@/components/rupiah-input'
import { Button } from '@/components/ui/button'
import { formatRupiah } from '@/lib/money'
import { cn } from '@/lib/utils'
import { MAX_LINE_QTY, lineTotal } from './cart'
import { useCart } from './use-cart'
import { useKasirData } from './use-kasir-data'

const MAX_PRICE = 100_000_000

/**
 * The receipt lines before saving and printing (decision #44, revised 2026-11-24). While
 * the owner allows it, the cashier can change a line's price, its quantity or drop it for
 * this receipt only; the catalog never changes. The server keeps the catalog price next to
 * each line, so the owner sees every edited price in the transaction detail.
 */
export function ReceiptEditor({ onChange }: { onChange: () => void }) {
  const { business, catalogItems } = useKasirData()
  const { lines, total, dispatch } = useCart()
  const [editing, setEditing] = useState(false)
  const canEdit = business.cashierCanEditPrices
  const catalogPrice = (itemId: string) => catalogItems.find((i) => i.id === itemId)?.price

  function act(action: Parameters<typeof dispatch>[0]) {
    dispatch(action)
    onChange()
  }

  return (
    <section aria-label="Nota" className="rounded-xl border bg-card">
      <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
        <p className="text-sm font-medium">Nota</p>
        {canEdit && (
          <Button
            variant={editing ? 'default' : 'outline'}
            size="sm"
            className="h-9"
            onClick={() => setEditing((v) => !v)}
            aria-pressed={editing}
          >
            {editing ? <CheckIcon /> : <PencilIcon />}
            {editing ? 'Selesai' : 'Edit nota'}
          </Button>
        )}
      </div>
      <ul className="divide-y">
        {lines.map((line) => {
          const listed = catalogPrice(line.itemId)
          const changed = listed !== undefined && listed !== line.price
          return (
            <li key={line.itemId} className="space-y-2 px-3 py-2 text-sm">
              <div className="flex items-baseline justify-between gap-3">
                <span className="min-w-0">
                  <span className="block truncate font-medium">{line.name}</span>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {line.qty} × {formatRupiah(line.price)}
                    {changed && (
                      <span className="ml-1.5 text-amber-700 dark:text-amber-400">
                        (katalog {formatRupiah(listed)})
                      </span>
                    )}
                  </span>
                </span>
                <span className="shrink-0 font-medium tabular-nums">
                  {formatRupiah(lineTotal(line))}
                </span>
              </div>
              {editing && (
                <div className="flex flex-wrap items-center gap-2">
                  <RupiahInput
                    aria-label={`Harga ${line.name} di nota ini`}
                    className="h-11 w-40"
                    value={line.price}
                    onValueChange={(value) =>
                      act({
                        type: 'setPrice',
                        itemId: line.itemId,
                        price: Math.min(value ?? 0, MAX_PRICE),
                      })
                    }
                  />
                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="icon"
                      className="size-11"
                      aria-label={`Kurangi ${line.name}`}
                      disabled={line.qty <= 1}
                      onClick={() => act({ type: 'decrement', itemId: line.itemId })}
                    >
                      <MinusIcon />
                    </Button>
                    <span className="w-8 text-center tabular-nums" aria-live="polite">
                      {line.qty}
                    </span>
                    <Button
                      variant="outline"
                      size="icon"
                      className="size-11"
                      aria-label={`Tambah ${line.name}`}
                      disabled={line.qty >= MAX_LINE_QTY}
                      onClick={() => act({ type: 'increment', itemId: line.itemId })}
                    >
                      <PlusIcon />
                    </Button>
                  </div>
                  {changed && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-11"
                      onClick={() => act({ type: 'setPrice', itemId: line.itemId, price: listed })}
                    >
                      Harga katalog
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="ml-auto size-11 text-destructive"
                    aria-label={`Hapus ${line.name} dari nota`}
                    disabled={lines.length <= 1}
                    onClick={() => act({ type: 'remove', itemId: line.itemId })}
                  >
                    <Trash2Icon />
                  </Button>
                </div>
              )}
            </li>
          )
        })}
      </ul>
      <div
        className={cn(
          'flex items-center justify-between border-t px-3 py-2 text-sm font-semibold',
          editing && 'bg-muted/50',
        )}
      >
        <span>Subtotal</span>
        <span className="tabular-nums">{formatRupiah(total)}</span>
      </div>
    </section>
  )
}
