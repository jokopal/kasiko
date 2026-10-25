import { CheckCircle2Icon, DeleteIcon } from 'lucide-react'
import { useState, type KeyboardEvent } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { ReceiptActions } from '@/features/receipt/receipt-actions'
import { formatRupiah } from '@/lib/money'
import {
  PAYMENT_METHOD_LABEL,
  PAYMENT_METHODS,
  type Business,
  type PaymentMethod,
  type Transaction,
} from '@/lib/types'
import { cn } from '@/lib/utils'
import { recordSale } from './commands'
import { applicableDiscounts, discountAmount, describeDiscount } from './discount'
import { useCart } from './use-cart'
import { useKasirData } from './use-kasir-data'
import { computeChange, quickCashOptions } from './payment'

const MAX_CASH_DIGITS = 10

interface PaymentDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function PaymentDialog({ open, onOpenChange }: PaymentDialogProps) {
  const { business } = useKasirData()
  const [saved, setSaved] = useState<Transaction | null>(null)
  const { reset } = useCart()

  function handleOpenChange(next: boolean) {
    if (!next && saved) {
      reset()
      setSaved(null)
    }
    onOpenChange(next)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[100dvh] gap-5 overflow-y-auto sm:max-w-lg">
        {saved ? (
          <PaymentDone
            transaction={saved}
            business={business}
            onNew={() => handleOpenChange(false)}
          />
        ) : (
          open && <PaymentForm onSaved={setSaved} />
        )}
      </DialogContent>
    </Dialog>
  )
}

function PaymentForm({ onSaved }: { onSaved: (transaction: Transaction) => void }) {
  const { business, device, discounts } = useKasirData()
  const { lines, total: subtotal, plateNumber, order } = useCart()
  const [saving, setSaving] = useState(false)
  // Decision #35: only presets the owner switched on, and only ones below the subtotal.
  const discountOptions = applicableDiscounts(discounts, subtotal)
  const [discountId, setDiscountId] = useState<string>('none')
  const discount = discountOptions.find((d) => d.id === discountId) ?? null
  const cut = discount ? discountAmount(subtotal, discount.type, discount.value) : 0
  const total = subtotal - cut
  const [method, setMethod] = useState<PaymentMethod>('cash')
  const [cash, setCash] = useState<number | null>(null)
  const change = cash === null ? null : computeChange(total, cash)
  const canSave = method !== 'cash' || change !== null

  function pressDigit(digits: string) {
    setCash((current) => {
      const next = `${current ?? ''}${digits}`.replace(/^0+(?=\d)/, '')
      return next.length > MAX_CASH_DIGITS ? current : Number(next)
    })
  }

  function backspace() {
    setCash((current) => {
      const next = String(current ?? '').slice(0, -1)
      return next === '' ? null : Number(next)
    })
  }

  async function save() {
    // `saving` blocks a double tap from recording the sale twice.
    if (!canSave || saving) return
    setSaving(true)
    try {
      const result = await recordSale({
        business,
        device,
        lines,
        method,
        cashReceived: method === 'cash' ? cash : null,
        plateNumber,
        discount,
        orderId: order?.id ?? null,
      })
      if (result.ok) onSaved(result.value)
      else toast.error(result.error)
    } catch {
      toast.error('Gagal menyimpan di perangkat. Coba lagi.')
    } finally {
      setSaving(false)
    }
  }

  // Physical keyboard support for laptops: digits, Backspace, Enter.
  function onKeyDown(event: KeyboardEvent) {
    if (method !== 'cash' || event.target instanceof HTMLTextAreaElement) return
    if (/^\d$/.test(event.key)) pressDigit(event.key)
    else if (event.key === 'Backspace') backspace()
    else if (event.key === 'Enter') void save()
    else return
    event.preventDefault()
  }

  return (
    <div className="grid gap-5" onKeyDown={onKeyDown}>
      <DialogHeader>
        <DialogTitle>Pembayaran</DialogTitle>
        <DialogDescription>
          {cut > 0 && (
            <>
              <span className="tabular-nums line-through">{formatRupiah(subtotal)}</span>{' '}
            </>
          )}
          Total tagihan{' '}
          <span className="font-semibold text-foreground tabular-nums">{formatRupiah(total)}</span>
          {order?.plateNumber && <> · {order.plateNumber}</>}
        </DialogDescription>
      </DialogHeader>

      {discountOptions.length > 0 && (
        <div className="grid gap-2">
          <p className="text-sm font-medium">Diskon</p>
          <ToggleGroup
            type="single"
            variant="outline"
            value={discountId}
            onValueChange={(value) => {
              setDiscountId(value || 'none')
              setCash(null)
            }}
            className="flex w-full flex-wrap justify-start gap-2"
            aria-label="Diskon"
          >
            <ToggleGroupItem
              value="none"
              className="h-10 flex-none rounded-full! border! px-4 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
            >
              Tanpa diskon
            </ToggleGroupItem>
            {discountOptions.map((option) => (
              <ToggleGroupItem
                key={option.id}
                value={option.id}
                className="h-10 flex-none rounded-full! border! px-4 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
              >
                {option.name}
                <span className="text-xs opacity-80">
                  {describeDiscount(option)} · −
                  {formatRupiah(discountAmount(subtotal, option.type, option.value))}
                </span>
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
      )}

      <ToggleGroup
        type="single"
        variant="outline"
        value={method}
        onValueChange={(value) => value && setMethod(value as PaymentMethod)}
        className="grid w-full grid-cols-3"
        aria-label="Metode pembayaran"
      >
        {PAYMENT_METHODS.map((m) => (
          <ToggleGroupItem
            key={m}
            value={m}
            className="h-12 text-base data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
          >
            {PAYMENT_METHOD_LABEL[m]}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

      {method === 'cash' ? (
        <div className="grid gap-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Button variant="outline" className="h-12 font-semibold" onClick={() => setCash(total)}>
              Uang Pas
            </Button>
            {quickCashOptions(total, 3).map((amount) => (
              <Button
                key={amount}
                variant="outline"
                className="h-12 tabular-nums"
                onClick={() => setCash(amount)}
              >
                {formatRupiah(amount)}
              </Button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3 rounded-xl bg-muted p-4">
            <div>
              <p className="text-xs text-muted-foreground">Uang diterima</p>
              <p className="text-xl font-semibold tabular-nums" aria-live="polite">
                {cash === null ? '—' : formatRupiah(cash)}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground">
                {cash !== null && change === null ? 'Kurang' : 'Kembalian'}
              </p>
              <p
                aria-live="polite"
                className={cn(
                  'text-3xl font-bold tracking-tight tabular-nums',
                  cash !== null && change === null && 'text-destructive',
                )}
              >
                {cash === null
                  ? '—'
                  : change === null
                    ? formatRupiah(total - cash)
                    : formatRupiah(change)}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2" aria-label="Keypad angka">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9', '000', '0'].map((key) => (
              <Button
                key={key}
                variant="secondary"
                className="h-12 text-lg font-semibold"
                onClick={() => pressDigit(key)}
              >
                {key}
              </Button>
            ))}
            <Button
              variant="secondary"
              className="h-12"
              onClick={backspace}
              aria-label="Hapus satu angka"
            >
              <DeleteIcon className="size-5" />
            </Button>
          </div>
        </div>
      ) : (
        <div className="rounded-xl bg-muted p-4 text-sm">
          <p className="font-medium">
            Pastikan pembayaran {PAYMENT_METHOD_LABEL[method]} sudah masuk.
          </p>
          <p className="mt-1 text-muted-foreground">
            Pembayaran non-tunai dicatat manual — cek bukti di HP pelanggan atau mutasi rekening.
          </p>
        </div>
      )}

      <Button
        size="lg"
        className="h-14 text-lg font-semibold"
        disabled={!canSave || saving}
        onClick={() => void save()}
      >
        {method === 'cash' ? 'Simpan' : 'Sudah dibayar — Simpan'}
      </Button>
    </div>
  )
}

function PaymentDone({
  transaction,
  business,
  onNew,
}: {
  transaction: Transaction
  business: Business
  onNew: () => void
}) {
  return (
    <div className="grid gap-5">
      <DialogHeader className="items-center text-center">
        <CheckCircle2Icon className="size-12 text-emerald-600" aria-hidden />
        <DialogTitle className="text-xl">Transaksi tersimpan</DialogTitle>
        <DialogDescription className="font-mono">{transaction.receiptNo}</DialogDescription>
      </DialogHeader>

      <div className="grid gap-1 rounded-xl bg-muted p-4 text-center">
        <p className="text-sm text-muted-foreground">
          {PAYMENT_METHOD_LABEL[transaction.paymentMethod]} · {formatRupiah(transaction.total)}
        </p>
        {transaction.changeAmount !== null && (
          <>
            <p className="mt-2 text-xs text-muted-foreground">Kembalian</p>
            <p className="text-4xl font-bold tracking-tight tabular-nums">
              {formatRupiah(transaction.changeAmount)}
            </p>
          </>
        )}
      </div>

      <ReceiptActions transaction={transaction} business={business} />

      <Button size="lg" className="h-14 text-lg font-semibold" onClick={onNew} autoFocus>
        Transaksi Baru
      </Button>
    </div>
  )
}
