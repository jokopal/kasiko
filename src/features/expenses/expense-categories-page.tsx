import {
  ArrowDownIcon,
  ArrowUpIcon,
  MonitorSmartphoneIcon,
  PencilIcon,
  PlusIcon,
} from 'lucide-react'
import { useMemo, useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { ChoiceCards } from '@/components/choice-cards'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldTitle,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { OwnerPage } from '@/features/owner/page'
import {
  moveExpenseCategory,
  saveExpenseCategory,
  setCategoryActive,
} from '@/features/preview/actions'
import { useBusinessData } from '@/features/preview/selectors'
import {
  EXPENSE_KIND_HINT,
  EXPENSE_KIND_LABEL,
  EXPENSE_KINDS,
  type ExpenseCategory,
  type ExpenseKind,
} from '@/lib/types'
import { cn } from '@/lib/utils'
import { KindDot } from './kind'

type Draft = { id?: string; name: string; kind: ExpenseKind; allowDrawer: boolean }

export function ExpenseCategoriesPage() {
  const { business, expenseCategories, expenses } = useBusinessData()
  const [draft, setDraft] = useState<Draft | null>(null)
  const usage = useMemo(() => {
    const counts = new Map<string, number>()
    for (const e of expenses) counts.set(e.categoryId, (counts.get(e.categoryId) ?? 0) + 1)
    return counts
  }, [expenses])

  return (
    <OwnerPage
      title="Kategori Pengeluaran"
      description="Jenis kategori menentukan cara pengeluaran dihitung di profit. Kategori yang sudah dipakai dinonaktifkan, bukan dihapus."
      actions={
        <Button onClick={() => setDraft({ name: '', kind: 'operating', allowDrawer: true })}>
          <PlusIcon />
          Tambah kategori
        </Button>
      }
    >
      <ProfitFormula />

      <div className="grid gap-4 xl:grid-cols-3">
        {EXPENSE_KINDS.map((kind) => {
          const rows = expenseCategories.filter((c) => c.kind === kind)
          return (
            <Card key={kind} className="gap-0 py-0">
              <CardHeader className="border-b py-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <KindDot kind={kind} />
                  {EXPENSE_KIND_LABEL[kind]}
                  <span className="ml-auto text-xs font-normal text-muted-foreground">
                    {rows.length} kategori
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="px-0">
                <ul className="divide-y">
                  {rows.map((row, index) => (
                    <CategoryRow
                      key={row.id}
                      row={row}
                      used={usage.get(row.id) ?? 0}
                      isFirst={index === 0}
                      isLast={index === rows.length - 1}
                      onEdit={() =>
                        setDraft({
                          id: row.id,
                          name: row.name,
                          kind: row.kind,
                          allowDrawer: row.allowDrawer,
                        })
                      }
                    />
                  ))}
                  {rows.length === 0 && (
                    <li className="px-4 py-6 text-center text-sm text-muted-foreground">
                      Belum ada kategori
                    </li>
                  )}
                </ul>
              </CardContent>
            </Card>
          )
        })}
      </div>

      <Dialog open={draft !== null} onOpenChange={(open) => !open && setDraft(null)}>
        <DialogContent className="sm:max-w-md">
          {draft && (
            <CategoryForm draft={draft} businessId={business.id} onDone={() => setDraft(null)} />
          )}
        </DialogContent>
      </Dialog>
    </OwnerPage>
  )
}

function ProfitFormula() {
  return (
    <Card className="gap-3 py-4">
      <CardContent className="grid gap-4 px-4 md:grid-cols-3">
        {EXPENSE_KINDS.map((kind) => (
          <div key={kind} className="flex gap-2.5">
            <KindDot kind={kind} className="mt-1.5" />
            <div>
              <p className="text-sm font-medium">{EXPENSE_KIND_LABEL[kind]}</p>
              <p className="text-xs text-muted-foreground">{EXPENSE_KIND_HINT[kind]}</p>
            </div>
          </div>
        ))}
      </CardContent>
      <CardDescription className="border-t px-4 pt-3 text-xs">
        Profit operasional = Pemasukan − Operasional · Profit bersih = Profit operasional −
        Non-operasional · Arus kas bersih = Pemasukan − semua pengeluaran (termasuk prive)
      </CardDescription>
    </Card>
  )
}

function CategoryRow({
  row,
  used,
  isFirst,
  isLast,
  onEdit,
}: {
  row: ExpenseCategory
  used: number
  isFirst: boolean
  isLast: boolean
  onEdit: () => void
}) {
  return (
    <li className="grid gap-2 px-3 py-2.5 sm:px-4">
      <div className="flex min-w-0 items-center gap-2">
        <span
          className={cn(
            'min-w-0 flex-1 truncate text-sm font-medium',
            !row.isActive && 'text-muted-foreground line-through',
          )}
        >
          {row.name}
        </span>
        {row.allowDrawer && (
          <Badge variant="outline" className="gap-1">
            <MonitorSmartphoneIcon className="size-3" aria-hidden />
            Kasir
          </Badge>
        )}
      </div>
      <div className="flex items-center gap-1">
        <span className="mr-auto text-xs text-muted-foreground">
          {used > 0 ? `${used} catatan` : 'Belum dipakai'}
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="size-9"
          disabled={isFirst}
          onClick={() => moveExpenseCategory(row.id, -1)}
          aria-label={`Naikkan ${row.name}`}
        >
          <ArrowUpIcon />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-9"
          disabled={isLast}
          onClick={() => moveExpenseCategory(row.id, 1)}
          aria-label={`Turunkan ${row.name}`}
        >
          <ArrowDownIcon />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-9"
          onClick={onEdit}
          aria-label={`Ubah ${row.name}`}
        >
          <PencilIcon />
        </Button>
        <Switch
          checked={row.isActive}
          onCheckedChange={(checked) => setCategoryActive('expense', row.id, checked)}
          aria-label={`${row.name} aktif`}
        />
      </div>
    </li>
  )
}

function CategoryForm({
  draft,
  businessId,
  onDone,
}: {
  draft: Draft
  businessId: string
  onDone: () => void
}) {
  const [name, setName] = useState(draft.name)
  const [kind, setKind] = useState(draft.kind)
  const [allowDrawer, setAllowDrawer] = useState(draft.allowDrawer)
  const [error, setError] = useState<string | null>(null)

  function submit(event: FormEvent) {
    event.preventDefault()
    const result = saveExpenseCategory({ id: draft.id, businessId, name, kind, allowDrawer })
    if (!result.ok) {
      setError(result.error)
      return
    }
    toast.success(draft.id ? 'Kategori diperbarui' : 'Kategori ditambahkan')
    onDone()
  }

  return (
    <form onSubmit={submit} className="grid gap-5">
      <DialogHeader>
        <DialogTitle>{draft.id ? 'Ubah kategori' : 'Tambah kategori'}</DialogTitle>
      </DialogHeader>
      <FieldGroup>
        <Field data-invalid={error !== null}>
          <FieldLabel htmlFor="expense-category-name">Nama kategori</FieldLabel>
          <Input
            id="expense-category-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="h-10"
            autoFocus
          />
        </Field>
        <Field>
          <FieldTitle>Jenis</FieldTitle>
          <ChoiceCards
            name="expense-kind"
            legend="Jenis kategori"
            value={kind}
            onChange={setKind}
            choices={EXPENSE_KINDS.map((k) => ({
              value: k,
              title: (
                <span className="flex items-center gap-2">
                  <KindDot kind={k} />
                  {EXPENSE_KIND_LABEL[k]}
                </span>
              ),
              description: EXPENSE_KIND_HINT[k],
            }))}
          />
        </Field>
        <Field orientation="horizontal">
          <Switch id="allow-drawer" checked={allowDrawer} onCheckedChange={setAllowDrawer} />
          <FieldContent>
            <FieldLabel htmlFor="allow-drawer">Tampil di layar kasir</FieldLabel>
            <FieldDescription>Kasir boleh mencatat kategori ini dari uang laci.</FieldDescription>
          </FieldContent>
        </Field>
        {draft.id && kind !== draft.kind && (
          <p className="rounded-md bg-muted p-2 text-xs text-muted-foreground">
            Mengubah jenis ikut mengubah perhitungan profit untuk catatan lama di kategori ini.
          </p>
        )}
        {error && <FieldError>{error}</FieldError>}
      </FieldGroup>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Batal
        </Button>
        <Button type="submit">Simpan</Button>
      </DialogFooter>
    </form>
  )
}
