import { PlusIcon } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { VoidDialog } from '@/components/void-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { OwnerPage } from '@/features/owner/page'
import { voidExpense } from '@/features/preview/actions'
import { useBusinessData } from '@/features/preview/selectors'
import { PeriodPicker } from '@/features/reports/period-picker'
import { usePeriod } from '@/features/reports/use-period'
import { formatDateTime, isInRange } from '@/lib/datetime'
import { formatRupiah, sumRupiah } from '@/lib/money'
import { EXPENSE_SOURCE_LABEL, type Expense } from '@/lib/types'
import { cn } from '@/lib/utils'
import { ExpenseDialog } from './expense-dialog'

export function ExpensesPage() {
  const { business, expenses, expenseCategories } = useBusinessData()
  const tz = business.timezone
  const period = usePeriod(tz)
  const [source, setSource] = useState('all')
  const [status, setStatus] = useState('active')
  const [categoryId, setCategoryId] = useState('all')
  const [addOpen, setAddOpen] = useState(false)
  const [target, setTarget] = useState<Expense | null>(null)

  const categoryName = (id: string) => expenseCategories.find((c) => c.id === id)?.name ?? '—'
  const rows = expenses
    .filter((e) => isInRange(new Date(e.occurredAt), period.range))
    .filter((e) => source === 'all' || e.source === source)
    .filter((e) => status === 'all' || e.status === status)
    .filter((e) => categoryId === 'all' || e.categoryId === categoryId)
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
  const activeTotal = sumRupiah(rows.filter((e) => e.status === 'active').map((e) => e.amount))

  return (
    <OwnerPage
      title="Pengeluaran"
      description={`${rows.length} catatan · total aktif ${formatRupiah(activeTotal)}`}
      actions={
        <Button onClick={() => setAddOpen(true)}>
          <PlusIcon />
          Pengeluaran owner
        </Button>
      }
    >
      <div className="flex flex-wrap items-center gap-2">
        <PeriodPicker period={period} />
        <FilterSelect
          label="Sumber"
          value={source}
          onChange={setSource}
          options={[
            ['all', 'Semua sumber'],
            ['drawer', EXPENSE_SOURCE_LABEL.drawer],
            ['owner', EXPENSE_SOURCE_LABEL.owner],
          ]}
        />
        <FilterSelect
          label="Kategori"
          value={categoryId}
          onChange={setCategoryId}
          options={[
            ['all', 'Semua kategori'],
            ...expenseCategories.map((c) => [c.id, c.name] as [string, string]),
          ]}
        />
        <FilterSelect
          label="Status"
          value={status}
          onChange={setStatus}
          options={[
            ['active', 'Aktif'],
            ['void', 'Dibatalkan'],
            ['all', 'Semua status'],
          ]}
        />
      </div>

      <Card className="py-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Waktu</TableHead>
              <TableHead>Kategori</TableHead>
              <TableHead className="hidden sm:table-cell">Catatan</TableHead>
              <TableHead className="hidden md:table-cell">Sumber</TableHead>
              <TableHead className="text-right">Nominal</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((e) => (
              <TableRow key={e.id} className={cn(e.status === 'void' && 'text-muted-foreground')}>
                <TableCell className="whitespace-nowrap">
                  {formatDateTime(new Date(e.occurredAt), tz)}
                </TableCell>
                <TableCell>
                  {categoryName(e.categoryId)}
                  <span className="block text-xs text-muted-foreground md:hidden">
                    {EXPENSE_SOURCE_LABEL[e.source]}
                  </span>
                </TableCell>
                <TableCell className="hidden max-w-64 truncate sm:table-cell">
                  {e.note || '—'}
                  {e.voidReason && (
                    <span className="block text-xs text-destructive">Batal: {e.voidReason}</span>
                  )}
                </TableCell>
                <TableCell className="hidden md:table-cell">
                  <Badge variant={e.source === 'owner' ? 'secondary' : 'outline'}>
                    {EXPENSE_SOURCE_LABEL[e.source]}
                  </Badge>
                </TableCell>
                <TableCell
                  className={cn(
                    'text-right font-medium tabular-nums',
                    e.status === 'void' && 'line-through',
                  )}
                >
                  {formatRupiah(e.amount)}
                </TableCell>
                <TableCell className="text-right">
                  {e.status === 'active' ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive"
                      onClick={() => setTarget(e)}
                    >
                      Batalkan
                    </Button>
                  ) : (
                    <Badge variant="destructive">Batal</Badge>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                  Tidak ada pengeluaran untuk filter ini
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>

      <ExpenseDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        businessId={business.id}
        categories={expenseCategories}
        source="owner"
      />
      <VoidDialog
        open={target !== null}
        onOpenChange={(open) => !open && setTarget(null)}
        title="Batalkan pengeluaran?"
        description={
          target ? `${categoryName(target.categoryId)} · ${formatRupiah(target.amount)}` : ''
        }
        onConfirm={(reason) => {
          if (!target) return { ok: false, error: 'Tidak ada data dipilih' }
          const result = voidExpense({ id: target.id, reason, role: 'owner' })
          if (result.ok) toast.success('Pengeluaran dibatalkan')
          return result
        }}
      />
    </OwnerPage>
  )
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  options: [string, string][]
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-9 w-40" aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map(([optionValue, optionLabel]) => (
          <SelectItem key={optionValue} value={optionValue}>
            {optionLabel}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
