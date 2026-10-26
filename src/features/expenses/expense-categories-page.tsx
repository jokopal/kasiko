import {
  ArrowDownIcon,
  ArrowUpIcon,
  MonitorSmartphoneIcon,
  PencilLineIcon,
  PencilIcon,
  PlusIcon,
} from 'lucide-react'
import { useState, type FormEvent } from 'react'
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
import { notify } from '@/features/data/notify'
import { moveExpenseCategory, saveExpenseCategory, setActive } from '@/features/data/owner-actions'
import { useOwnerData } from '@/features/data/owner-data'
import {
  EXPENSE_KIND_HINT,
  EXPENSE_KIND_LABEL,
  EXPENSE_KINDS,
  type ExpenseCategory,
  type ExpenseKind,
} from '@/lib/types'
import { cn } from '@/lib/utils'
import { KindDot } from './kind'

type Draft = {
  id?: string
  name: string
  kind: ExpenseKind
  allowDrawer: boolean
  requiresNote: boolean
}

export function ExpenseCategoriesPage() {
  const { business, expenseCategories } = useOwnerData()
  const [draft, setDraft] = useState<Draft | null>(null)

  return (
    <OwnerPage
      title="Kategori Pengeluaran"
      description="Jenis kategori menentukan cara pengeluaran dihitung di profit. Kategori yang sudah dipakai dinonaktifkan, bukan dihapus."
      actions={
        <Button
          onClick={() =>
            setDraft({ name: '', kind: 'operating', allowDrawer: true, requiresNote: false })
          }
        >
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
                      onMove={(direction) =>
                        notify(
                          moveExpenseCategory(business.id, expenseCategories, row.id, direction),
                        )
                      }
                      onToggle={(checked) =>
                        notify(setActive(business.id, 'expense_categories', row.id, checked))
                      }
                      isFirst={index === 0}
                      isLast={index === rows.length - 1}
                      onEdit={() =>
                        setDraft({
                          id: row.id,
                          name: row.name,
                          kind: row.kind,
                          allowDrawer: row.allowDrawer,
                          requiresNote: row.requiresNote,
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
            <CategoryForm
              draft={draft}
              businessId={business.id}
              siblings={expenseCategories}
              onDone={() => setDraft(null)}
            />
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
  isFirst,
  isLast,
  onEdit,
  onMove,
  onToggle,
}: {
  row: ExpenseCategory
  isFirst: boolean
  isLast: boolean
  onEdit: () => void
  onMove: (direction: -1 | 1) => void
  onToggle: (checked: boolean) => void
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
        {row.requiresNote && (
          <Badge variant="outline" className="gap-1">
            <PencilLineIcon className="size-3" aria-hidden />
            Wajib keterangan
          </Badge>
        )}
        {row.allowDrawer && (
          <Badge variant="outline" className="gap-1">
            <MonitorSmartphoneIcon className="size-3" aria-hidden />
            Kasir
          </Badge>
        )}
      </div>
      <div className="flex items-center gap-1">
        <span className="mr-auto text-xs text-muted-foreground">
          {row.isActive ? 'Aktif' : 'Nonaktif'}
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="size-9"
          disabled={isFirst}
          onClick={() => onMove(-1)}
          aria-label={`Naikkan ${row.name}`}
        >
          <ArrowUpIcon />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-9"
          disabled={isLast}
          onClick={() => onMove(1)}
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
          onCheckedChange={onToggle}
          aria-label={`${row.name} aktif`}
        />
      </div>
    </li>
  )
}

function CategoryForm({
  draft,
  businessId,
  siblings,
  onDone,
}: {
  draft: Draft
  businessId: string
  siblings: ExpenseCategory[]
  onDone: () => void
}) {
  const [name, setName] = useState(draft.name)
  const [kind, setKind] = useState(draft.kind)
  const [allowDrawer, setAllowDrawer] = useState(draft.allowDrawer)
  const [requiresNote, setRequiresNote] = useState(draft.requiresNote)
  const [error, setError] = useState<string | null>(null)

  async function submit(event: FormEvent) {
    event.preventDefault()
    const result = await saveExpenseCategory({
      id: draft.id,
      businessId,
      name,
      kind,
      allowDrawer,
      requiresNote,
      siblings,
    })
    if (!result.ok) {
      setError(result.error)
      return
    }
    toast.success(draft.id ? 'Kategori diperbarui' : 'Kategori ditambahkan')
    onDone()
  }

  return (
    <form onSubmit={(event) => void submit(event)} className="grid gap-5">
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
        <Field orientation="horizontal">
          <Switch id="requires-note" checked={requiresNote} onCheckedChange={setRequiresNote} />
          <FieldContent>
            <FieldLabel htmlFor="requires-note">Wajib keterangan</FieldLabel>
            <FieldDescription>
              Untuk kategori serba-ada seperti &quot;Lainnya&quot;: setiap pengeluaran harus ditulis
              untuk apa, lalu bisa Anda pindahkan ke kategori yang tepat di halaman Pengeluaran.
            </FieldDescription>
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
