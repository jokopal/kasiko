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
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { createExpense } from '@/features/preview/actions'
import { formatRupiah } from '@/lib/money'
import type { ExpenseCategory, ExpenseSource } from '@/lib/types'

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
              : 'Pengeluaran besar (gaji, sewa, listrik). Tidak mengurangi uang laci.'}
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
  const active = categories.filter((c) => c.isActive)
  const [amount, setAmount] = useState<number | null>(null)
  const [categoryId, setCategoryId] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)

  function submit(event: FormEvent) {
    event.preventDefault()
    const result = createExpense({ businessId, categoryId, amount: amount ?? 0, note, source })
    if (!result.ok) {
      setError(result.error)
      return
    }
    toast.success(`Pengeluaran ${formatRupiah(result.value.amount)} tersimpan`)
    onDone()
  }

  return (
    <form onSubmit={submit} className="grid gap-5">
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
        <Field>
          <FieldLabel htmlFor="expense-category">Kategori</FieldLabel>
          <Select value={categoryId} onValueChange={setCategoryId}>
            <SelectTrigger id="expense-category" className="h-11 w-full">
              <SelectValue placeholder="Pilih kategori" />
            </SelectTrigger>
            <SelectContent>
              {active.map((category) => (
                <SelectItem key={category.id} value={category.id}>
                  {category.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
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
        <Button type="submit" size="lg">
          Simpan
        </Button>
      </DialogFooter>
    </form>
  )
}
