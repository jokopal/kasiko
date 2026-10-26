import { useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { recategorizeExpense } from '@/features/data/owner-actions'
import { formatDateTime } from '@/lib/datetime'
import { formatRupiah } from '@/lib/money'
import {
  EXPENSE_KIND_LABEL,
  EXPENSE_KINDS,
  EXPENSE_SOURCE_LABEL,
  type Expense,
  type ExpenseCategory,
} from '@/lib/types'
import { KindDot } from './kind'
import { noteProblem } from './rules'

/**
 * Moves an expense to another category — mostly sorting "Lainnya" into proper categories
 * (decision #36). Amount, note, source and time stay; the move is audited.
 */
export function RecategorizeDialog({
  expense,
  categories,
  timeZone,
  onClose,
}: {
  expense: Expense | null
  categories: ExpenseCategory[]
  timeZone: string
  onClose: () => void
}) {
  return (
    <Dialog open={expense !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Pindah kategori</DialogTitle>
          <DialogDescription>
            Nominal, catatan, dan sumber tidak berubah. Perpindahan tercatat di jejak audit.
          </DialogDescription>
        </DialogHeader>
        {expense && (
          <RecategorizeForm
            key={expense.id}
            expense={expense}
            categories={categories}
            timeZone={timeZone}
            onDone={onClose}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function RecategorizeForm({
  expense,
  categories,
  timeZone,
  onDone,
}: {
  expense: Expense
  categories: ExpenseCategory[]
  timeZone: string
  onDone: () => void
}) {
  const [categoryId, setCategoryId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const current = categories.find((c) => c.id === expense.categoryId)
  const targets = categories.filter((c) => c.isActive && c.id !== expense.categoryId)

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (saving) return
    const target = targets.find((c) => c.id === categoryId)
    const problem = target ? noteProblem(target, expense.note) : 'Pilih kategori tujuan'
    if (problem) {
      setError(problem)
      return
    }
    setSaving(true)
    const result = await recategorizeExpense(expense.businessId, expense.id, categoryId)
    setSaving(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    toast.success(`Dipindahkan ke ${target?.name ?? 'kategori baru'}`)
    onDone()
  }

  return (
    <form onSubmit={(event) => void submit(event)} className="grid gap-5">
      <div className="grid gap-2 rounded-lg border bg-muted/40 p-3">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-lg font-semibold tabular-nums">{formatRupiah(expense.amount)}</span>
          <span className="text-xs text-muted-foreground">
            {formatDateTime(new Date(expense.occurredAt), timeZone)} ·{' '}
            {EXPENSE_SOURCE_LABEL[expense.source]}
          </span>
        </div>
        <p className="text-sm">
          {expense.note ? (
            <q className="font-medium">{expense.note}</q>
          ) : (
            <span className="text-muted-foreground">Tanpa catatan</span>
          )}
        </p>
        {current && (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            Sekarang: <KindDot kind={current.kind} /> {current.name}
          </p>
        )}
      </div>
      <Field data-invalid={error !== null}>
        <FieldLabel htmlFor="recategorize-target">Pindahkan ke</FieldLabel>
        <Select
          value={categoryId}
          onValueChange={(value) => {
            setCategoryId(value)
            setError(null)
          }}
        >
          <SelectTrigger id="recategorize-target" className="h-11 w-full">
            <SelectValue placeholder="Pilih kategori" />
          </SelectTrigger>
          <SelectContent>
            {EXPENSE_KINDS.map((kind) => {
              const group = targets.filter((c) => c.kind === kind)
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
        <FieldDescription>
          Belum ada kategori yang pas? Buat dulu di Admin → Kategori Pengeluaran.
        </FieldDescription>
        {error && <FieldError>{error}</FieldError>}
      </Field>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Batal
        </Button>
        <Button type="submit" disabled={saving}>
          Pindahkan
        </Button>
      </DialogFooter>
    </form>
  )
}
