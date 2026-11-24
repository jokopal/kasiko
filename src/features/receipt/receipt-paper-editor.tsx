import { PlusIcon, Trash2Icon } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { formatDateTime } from '@/lib/datetime'
import { formatDigits, formatRupiah, parseRupiah } from '@/lib/money'
import type { ReceiptCorrection, Transaction } from '@/lib/types'
import { cn } from '@/lib/utils'
import type { ReceiptBusiness } from './format-receipt'
import {
  MAX_CORRECTION_LINES,
  MAX_CORRECTION_NAME,
  MAX_CORRECTION_PRICE,
  MAX_CORRECTION_QTY,
  MAX_PLATE,
  correctionDraft,
  correctionError,
  correctionTotal,
  sameAsPrinted,
} from './receipt-correction'

// Inputs that read like receipt text: no box, a dashed underline, 40px tall for touch.
const FIELD =
  'h-10 min-w-0 rounded-none border-0 border-b border-dashed border-neutral-300 bg-transparent px-1 font-mono text-neutral-950 outline-none placeholder:text-neutral-400 focus:border-solid focus:border-neutral-900 focus-visible:ring-0'

/**
 * Decision #44: the receipt paper itself, editable element by element (plate, each line's
 * name, quantity and price, extra lines). Saving stores a correction: the printed receipt
 * changes, the recorded income stays at the real price.
 */
export function ReceiptPaperEditor({
  transaction,
  business,
  saving,
  onSave,
  onCancel,
}: {
  transaction: Transaction
  business: ReceiptBusiness
  saving: boolean
  onSave: (correction: ReceiptCorrection) => void
  onCancel: () => void
}) {
  const [draft, setDraft] = useState<ReceiptCorrection>(() => correctionDraft(transaction))
  const total = correctionTotal(draft.items)
  const error = correctionError(draft)
  const unchanged = sameAsPrinted(transaction, draft)

  const setLine = (index: number, patch: Partial<ReceiptCorrection['items'][number]>) =>
    setDraft((d) => ({
      ...d,
      items: d.items.map((line, i) => (i === index ? { ...line, ...patch } : line)),
    }))

  return (
    <div className="space-y-3">
      <div className="flex justify-center rounded-lg bg-muted p-3">
        <div
          className="w-full max-w-[22rem] space-y-3 bg-white p-4 font-mono text-[13px] text-neutral-950 shadow-sm"
          aria-label="Nota yang sedang diedit"
          role="group"
        >
          <div className="space-y-0.5 text-center">
            <p className="font-bold">{business.name}</p>
            <p className="text-neutral-500">{transaction.receiptNo}</p>
            <p className="text-neutral-500">
              {formatDateTime(new Date(transaction.occurredAt), business.timezone)}
            </p>
          </div>

          <label className="flex items-center gap-2">
            <span className="w-12 shrink-0 text-neutral-500">Plat</span>
            <input
              className={cn(FIELD, 'flex-1 uppercase')}
              value={draft.plateNumber ?? ''}
              maxLength={MAX_PLATE}
              placeholder="tanpa plat"
              onChange={(e) => setDraft((d) => ({ ...d, plateNumber: e.target.value }))}
            />
          </label>

          <div className="border-t border-dashed border-neutral-400" />

          <ol className="space-y-3">
            {draft.items.map((line, index) => (
              <li key={index} className="space-y-1">
                <div className="flex items-center gap-1">
                  <input
                    className={cn(FIELD, 'flex-1 font-semibold')}
                    value={line.name}
                    maxLength={MAX_CORRECTION_NAME}
                    aria-label={`Nama baris ${index + 1}`}
                    placeholder="Nama layanan"
                    onChange={(e) => setLine(index, { name: e.target.value })}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-10 shrink-0 text-neutral-500 hover:text-destructive"
                    aria-label={`Hapus baris ${index + 1}`}
                    disabled={draft.items.length <= 1}
                    onClick={() =>
                      setDraft((d) => ({ ...d, items: d.items.filter((_, i) => i !== index) }))
                    }
                  >
                    <Trash2Icon />
                  </Button>
                </div>
                <div className="flex items-center gap-1.5 tabular-nums">
                  <input
                    className={cn(FIELD, 'w-12 text-center')}
                    inputMode="numeric"
                    aria-label={`Jumlah baris ${index + 1}`}
                    value={line.qty === 0 ? '' : String(line.qty)}
                    onChange={(e) => {
                      const qty = Number(e.target.value.replace(/\D/g, '').slice(0, 2))
                      setLine(index, { qty: Math.min(qty, MAX_CORRECTION_QTY) })
                    }}
                  />
                  <span className="text-neutral-500">×</span>
                  <input
                    className={cn(FIELD, 'w-28 text-right')}
                    inputMode="numeric"
                    aria-label={`Harga baris ${index + 1}`}
                    value={formatDigits(line.price)}
                    onChange={(e) =>
                      setLine(index, {
                        price: Math.min(parseRupiah(e.target.value) ?? 0, MAX_CORRECTION_PRICE),
                      })
                    }
                  />
                  <span className="ml-auto pl-2 font-semibold">
                    {formatDigits(line.qty * line.price)}
                  </span>
                </div>
              </li>
            ))}
          </ol>

          <button
            type="button"
            className="flex h-10 w-full items-center justify-center gap-1.5 border border-dashed border-neutral-400 text-neutral-600 hover:bg-neutral-50 disabled:opacity-50"
            disabled={draft.items.length >= MAX_CORRECTION_LINES}
            onClick={() =>
              setDraft((d) => ({ ...d, items: [...d.items, { name: '', qty: 1, price: 0 }] }))
            }
          >
            <PlusIcon className="size-4" aria-hidden />
            Tambah baris
          </button>

          <div className="border-t border-dashed border-neutral-400" />
          <div className="flex items-baseline justify-between text-base font-bold tabular-nums">
            <span>TOTAL</span>
            <span>{formatDigits(total)}</span>
          </div>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Hanya mengubah isi nota yang dicetak. Pemasukan tetap tercatat{' '}
        <span className="font-medium text-foreground tabular-nums">
          {formatRupiah(transaction.total)}
        </span>{' '}
        (harga asli), dan koreksi ini tercatat di Log Audit owner.
      </p>
      {error && !unchanged && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" className="h-12" onClick={onCancel} disabled={saving}>
          Batal
        </Button>
        <Button
          className="h-12"
          disabled={saving || unchanged || error !== null}
          onClick={() => onSave(draft)}
        >
          {saving ? 'Menyimpan…' : 'Simpan koreksi'}
        </Button>
      </div>
    </div>
  )
}
