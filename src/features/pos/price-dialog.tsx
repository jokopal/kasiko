import { CheckIcon, WifiOffIcon } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { RupiahInput } from '@/components/rupiah-input'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { setItemPriceAsCashier } from '@/features/data/kasir'
import { keys, queryClient } from '@/features/data/query-client'
import { useOnlineStatus } from '@/features/offline/use-online-status'
import { formatRupiah } from '@/lib/money'
import type { CatalogItem } from '@/lib/types'
import { useKasirData } from './use-kasir-data'

const MAX_PRICE = 100_000_000

/**
 * Decision #44: when the owner allows it, the cashier changes catalog prices here. Online
 * only (the server checks the permission and writes the audit log); the old price stays on
 * every past transaction.
 */
export function PriceDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { business, catalogCategories, catalogItems, preview } = useKasirData()
  const online = useOnlineStatus()
  const categories = catalogCategories.filter((c) => c.isActive)
  const active = catalogItems.filter((item) => item.isActive)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90dvh] flex-col gap-0 p-0 sm:max-w-lg">
        <DialogHeader className="border-b p-4">
          <DialogTitle>Ubah harga layanan</DialogTitle>
          <DialogDescription>
            Harga baru berlaku untuk transaksi berikutnya. Transaksi lama tetap memakai harga
            lamanya, dan setiap perubahan tercatat untuk owner.
          </DialogDescription>
        </DialogHeader>
        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          {preview && (
            <Alert>
              <AlertDescription>Pratinjau: perubahan harga tidak disimpan.</AlertDescription>
            </Alert>
          )}
          {!online && !preview && (
            <Alert variant="destructive">
              <WifiOffIcon />
              <AlertDescription>Mengubah harga butuh koneksi internet.</AlertDescription>
            </Alert>
          )}
          {categories.map((category) => {
            const items = active.filter((item) => item.categoryId === category.id)
            if (items.length === 0) return null
            return (
              <section key={category.id} className="space-y-2">
                <h3 className="text-sm font-semibold text-muted-foreground">{category.name}</h3>
                <ul className="divide-y rounded-lg border">
                  {items.map((item) => (
                    <PriceRow
                      key={`${item.id}:${item.price}`}
                      item={item}
                      businessId={business.id}
                      disabled={preview || !online}
                    />
                  ))}
                </ul>
              </section>
            )
          })}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function PriceRow({
  item,
  businessId,
  disabled,
}: {
  item: CatalogItem
  businessId: string
  disabled: boolean
}) {
  const [draft, setDraft] = useState<number | null>(item.price)
  const [saving, setSaving] = useState(false)
  const changed = draft !== null && draft !== item.price
  const valid = draft !== null && draft >= 0 && draft <= MAX_PRICE

  async function save() {
    if (draft === null || !changed || !valid) return
    setSaving(true)
    try {
      const old = await setItemPriceAsCashier(item.id, draft)
      toast.success(`${item.name}: ${formatRupiah(old)} → ${formatRupiah(draft)}`)
      // Refresh the device catalog; the row re-mounts with the new price.
      await queryClient.invalidateQueries({ queryKey: keys.kasir(businessId, 'snapshot') })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Harga gagal disimpan')
    } finally {
      setSaving(false)
    }
  }

  const inputId = `price-${item.id}`
  return (
    <li className="flex items-center gap-3 p-3">
      <label htmlFor={inputId} className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{item.name}</span>
        <span className="block text-xs text-muted-foreground tabular-nums">
          Sekarang {formatRupiah(item.price)}
        </span>
      </label>
      <form
        className="flex shrink-0 items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          void save()
        }}
      >
        <RupiahInput
          id={inputId}
          value={draft}
          onValueChange={setDraft}
          className="h-10 w-32"
          disabled={disabled || saving}
          aria-invalid={!valid}
        />
        <Button
          type="submit"
          size="icon"
          className="size-10"
          disabled={disabled || saving || !changed || !valid}
          aria-label={`Simpan harga ${item.name}`}
        >
          <CheckIcon />
        </Button>
      </form>
    </li>
  )
}
