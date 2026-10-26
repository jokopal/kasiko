import { PencilLineIcon } from 'lucide-react'
import { useRef, useState, type FormEvent } from 'react'
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
import { createOwnerExpense } from '@/features/data/owner-actions'
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
import { NOTE_MAX, noteProblem } from './rules'

interface ExpenseDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  businessId: string
  categories: ExpenseCategory[]
  source: ExpenseSource
  /** Required for drawer expenses: the registered cashier device. */
  deviceId?: string
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
  deviceId,
  onDone,
}: ExpenseDialogProps & { onDone: () => void }) {
  // The cashier only sees what the owner allows for the drawer (decision #26).
  const active = categories.filter((c) => (source === 'drawer' ? isDrawerCategory(c) : c.isActive))
  // "Lainnya" (decision #36) sits below the grid, always in view, never scrolled away.
  const regular = active.filter((c) => !c.requiresNote)
  const others = active.filter((c) => c.requiresNote)
  const [amount, setAmount] = useState<number | null>(null)
  const [categoryId, setCategoryId] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const noteRef = useRef<HTMLInputElement>(null)
  const selected = active.find((c) => c.id === categoryId)
  const noteRequired = selected?.requiresNote ?? false

  function pick(category: ExpenseCategory) {
    setCategoryId(category.id)
    setError(null)
    if (category.requiresNote) noteRef.current?.focus()
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (saving) return
    const problem = noteProblem(selected, note)
    if (problem) {
      setError(problem)
      noteRef.current?.focus()
      return
    }
    setSaving(true)
    const input = { businessId, categoryId, amount: amount ?? 0, note }
    // Cashier: outbox, works offline. Owner: straight to the server (online-only).
    const result =
      source === 'drawer'
        ? await recordDrawerExpense({ ...input, categories, deviceId: deviceId ?? '' }).catch(() =>
            fail('Gagal menyimpan di perangkat. Coba lagi.'),
          )
        : await createOwnerExpense(input)
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
            <div role="radiogroup" aria-labelledby="expense-category-label" className="grid gap-2">
              <div className="grid max-h-52 grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3">
                {regular.map((category) => (
                  <button
                    key={category.id}
                    type="button"
                    role="radio"
                    aria-checked={categoryId === category.id}
                    onClick={() => pick(category)}
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
              {others.map((category) => (
                <button
                  key={category.id}
                  type="button"
                  role="radio"
                  aria-checked={categoryId === category.id}
                  onClick={() => pick(category)}
                  className={cn(
                    'flex min-h-12 items-center gap-3 rounded-lg border border-dashed px-3 py-2 text-left transition-colors',
                    'focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none',
                    categoryId === category.id
                      ? 'border-solid border-primary bg-primary text-primary-foreground'
                      : 'hover:bg-muted',
                  )}
                >
                  <PencilLineIcon className="size-5 shrink-0" aria-hidden />
                  <span className="grid leading-tight">
                    <span className="text-sm font-medium">{category.name}</span>
                    <span
                      className={cn(
                        'text-xs',
                        categoryId === category.id ? 'opacity-85' : 'text-muted-foreground',
                      )}
                    >
                      Tidak ada di daftar? Tulis keterangannya sendiri
                    </span>
                  </span>
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
                          {category.requiresNote && (
                            <span className="text-xs text-muted-foreground">
                              · wajib keterangan
                            </span>
                          )}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  )
                })}
              </SelectContent>
            </Select>
            {selected?.kind === 'drawing' && (
              <FieldDescription>Prive tidak mengurangi profit, hanya kas.</FieldDescription>
            )}
          </Field>
        )}
        <Field data-invalid={Boolean(error) && noteRequired}>
          <FieldLabel htmlFor="expense-note">
            {noteRequired ? 'Keterangan (wajib)' : 'Catatan (opsional)'}
          </FieldLabel>
          <Input
            ref={noteRef}
            id="expense-note"
            value={note}
            onChange={(event) => {
              setNote(event.target.value)
              setError(null)
            }}
            placeholder={noteRequired ? 'Contoh: beli lampu teras' : 'Contoh: beli sabun 5 liter'}
            maxLength={NOTE_MAX}
            aria-invalid={Boolean(error) && noteRequired}
            className="h-11"
          />
          {noteRequired && (
            <FieldDescription>
              Tulis untuk apa uangnya dipakai. Owner bisa memindahkannya ke kategori yang tepat.
            </FieldDescription>
          )}
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
