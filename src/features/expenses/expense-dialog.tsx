import { useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { RupiahInput } from '@/components/rupiah-input'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldTitle,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { isDrawerCategory, recordDrawerExpense } from '@/features/pos/commands'
import { createOwnerExpense } from '@/features/preview/actions'
import { formatRupiah } from '@/lib/money'
import { fail } from '@/lib/result'
import {
  EXPENSE_KIND_LABEL,
  EXPENSE_KINDS,
  type ExpenseCategory,
  type ExpenseSource,
} from '@/lib/types'
import { cn } from '@/lib/utils'
import { KindDot } from './kind'

interface ExpenseDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  businessId: string
  categories: ExpenseCategory[]
  source: ExpenseSource
}

/** Records an expense: `drawer` from the cashier screen, `owner` from the owner area. */
export function ExpenseDialog(props: ExpenseDialogProps) {
  const { open, onOpenChange, source } = props
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {source === 'drawer' ? 'Pengeluaran laci' : 'Pengeluaran owner'}
          </DialogTitle>
          <DialogDescription>
            {source === 'drawer'
              ? 'Uang yang diambil dari laci kasir hari ini.'
              : 'Pengeluaran yang dibayar owner langsung (gaji bulanan, cicilan, sewa). Tidak mengurangi uang laci.'}
          </DialogDescription>
        </DialogHeader>
        {open && <ExpenseForm {...props} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  )
}

function ExpenseForm({
  businessId,
  categories,
  source,
  onDone,
}: ExpenseDialogProps & { onDone: () => void }) {
  // The cashier only sees what the owner allows for the drawer (decision #26).
  const active = categories.filter((c) => (source === 'drawer' ? isDrawerCategory(c) : c.isActive))
  const [amount, setAmount] = useState<number | null>(null)
  const [categoryId, setCategoryId] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const selectedKind = active.find((c) => c.id === categoryId)?.kind

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (saving) return
    setSaving(true)
    const input = { businessId, categoryId, amount: amount ?? 0, note }
    // Cashier: outbox, works offline. Owner: straight to the server (online-only).
    const result =
      source === 'drawer'
        ? await recordDrawerExpense({ ...input, categories }).catch(() =>
            fail('Gagal menyimpan di perangkat. Coba lagi.'),
          )
        : createOwnerExpense(input)
    setSaving(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    toast.success(`Pengeluaran ${formatRupiah(result.value.amount)} tersimpan`)
    onDone()
  }

  return (
    <form onSubmit={(event) => void submit(event)} className="grid gap-5">
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="expense-amount">Nominal</FieldLabel>
          <RupiahInput
            id="expense-amount"
            value={amount}
            onValueChange={setAmount}
            className="h-11 text-lg"
            autoFocus
          />
        </Field>
        {source === 'drawer' ? (
          <Field>
            <FieldTitle id="expense-category-label">Kategori</FieldTitle>
            <div
              role="radiogroup"
              aria-labelledby="expense-category-label"
              className="grid max-h-56 grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3"
            >
              {active.map((category) => (
                <button
                  key={category.id}
                  type="button"
                  role="radio"
                  aria-checked={categoryId === category.id}
                  onClick={() => setCategoryId(category.id)}
                  className={cn(
                    'min-h-11 rounded-lg border px-2 py-2 text-left text-sm leading-tight font-medium transition-colors',
                    'focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none',
                    categoryId === category.id
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'hover:bg-muted',
                  )}
                >
                  {category.name}
                </button>
              ))}
            </div>
          </Field>
        ) : (
          <Field>
            <FieldLabel htmlFor="expense-category">Kategori</FieldLabel>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger id="expense-category" className="h-11 w-full">
                <SelectValue placeholder="Pilih kategori" />
              </SelectTrigger>
              <SelectContent>
                {EXPENSE_KINDS.map((kind) => {
                  const group = active.filter((c) => c.kind === kind)
                  if (group.length === 0) return null
                  return (
                    <SelectGroup key={kind}>
                      <SelectLabel className="flex items-center gap-1.5">
                        <KindDot kind={kind} />
                        {EXPENSE_KIND_LABEL[kind]}
                      </SelectLabel>
                      {group.map((category) => (
                        <SelectItem key={category.id} value={category.id}>
                          {category.name}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  )
                })}
              </SelectContent>
            </Select>
            {selectedKind === 'drawing' && (
              <FieldDescription>Prive tidak mengurangi profit, hanya kas.</FieldDescription>
            )}
          </Field>
        )}
        <Field>
          <FieldLabel htmlFor="expense-note">Catatan</FieldLabel>
          <Input
            id="expense-note"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Contoh: beli sabun 5 liter"
            className="h-11"
          />
        </Field>
        {error && <FieldError>{error}</FieldError>}
      </FieldGroup>
      <DialogFooter>
        <Button type="button" variant="outline" size="lg" onClick={onDone}>
          Batal
        </Button>
        <Button type="submit" size="lg" disabled={saving}>
          Simpan
        </Button>
      </DialogFooter>
    </form>
  )
}
