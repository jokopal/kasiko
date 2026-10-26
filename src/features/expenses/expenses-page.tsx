import { useQuery } from '@tanstack/react-query'
import { DownloadIcon, PencilLineIcon, PlusIcon } from 'lucide-react'
import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { VoidDialog } from '@/components/void-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
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
import { PageLoading } from '@/components/page-loading'
import { fetchExpenses } from '@/features/data/owner'
import { voidExpenseAsOwner } from '@/features/data/owner-actions'
import { useOwnerData } from '@/features/data/owner-data'
import { keys } from '@/features/data/query-client'
import { OwnerPage } from '@/features/owner/page'
import { PeriodPicker } from '@/features/reports/period-picker'
import { usePeriod } from '@/features/reports/use-period'
import { formatDateTime } from '@/lib/datetime'
import { formatRupiah, sumRupiah } from '@/lib/money'
import { kindLookup } from '@/features/reports/finance'
import { downloadCsv, downloadWorkbook } from '@/features/reports/monthly-export'
import { expenseSheetRows } from '@/features/reports/table-export'
import {
  EXPENSE_KIND_LABEL,
  EXPENSE_KINDS,
  EXPENSE_SOURCE_LABEL,
  type Expense,
  type ExpenseKind,
} from '@/lib/types'
import { cn } from '@/lib/utils'
import { ExpenseDialog } from './expense-dialog'
import { KindDot } from './kind'
import { RecategorizeDialog } from './recategorize-dialog'

export function ExpensesPage() {
  const { business, expenseCategories } = useOwnerData()
  const tz = business.timezone
  const period = usePeriod(tz)
  const query = useQuery({
    queryKey: keys.list(business.id, 'expenses', period.firstDayKey, period.lastDayKey),
    queryFn: () => fetchExpenses(business.id, period.range.from, period.range.to),
  })
  const expenses = query.data ?? []
  const [source, setSource] = useState('all')
  const [status, setStatus] = useState('active')
  // "Lainnya" (decision #36): the dashboard links here with ?lainnya=1 to sort it out.
  const otherIds = new Set(expenseCategories.filter((c) => c.requiresNote).map((c) => c.id))
  const [params] = useSearchParams()
  const [categoryId, setCategoryId] = useState(() => {
    const other = expenseCategories.find((c) => c.requiresNote)
    return params.get('lainnya') === '1' && other ? other.id : 'all'
  })
  const [moving, setMoving] = useState<Expense | null>(null)
  const [kind, setKind] = useState('all')
  const [addOpen, setAddOpen] = useState(false)
  const [target, setTarget] = useState<Expense | null>(null)

  const categoryName = (id: string) => expenseCategories.find((c) => c.id === id)?.name ?? '—'
  const kindOf = kindLookup(expenseCategories)
  const rows = expenses
    .filter((e) => source === 'all' || e.source === source)
    .filter((e) => status === 'all' || e.status === status)
    .filter((e) => categoryId === 'all' || e.categoryId === categoryId)
    .filter((e) => kind === 'all' || kindOf(e.categoryId) === kind)
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
  const activeRows = rows.filter((e) => e.status === 'active')
  const activeTotal = sumRupiah(activeRows.map((e) => e.amount))
  const toSort = expenses.filter((e) => e.status === 'active' && otherIds.has(e.categoryId))
  const totalOf = (k: ExpenseKind) =>
    sumRupiah(activeRows.filter((e) => kindOf(e.categoryId) === k).map((e) => e.amount))

  return (
    <OwnerPage
      title="Pengeluaran"
      description={`${rows.length} catatan · total aktif ${formatRupiah(activeTotal)}`}
      actions={
        <>
          <Button
            variant="outline"
            disabled={rows.length === 0}
            onClick={() =>
              void downloadWorkbook(`${business.name} - Pengeluaran ${period.firstDayKey}.xlsx`, [
                { name: 'Pengeluaran', rows: expenseSheetRows(rows, expenseCategories, tz) },
              ])
            }
          >
            <DownloadIcon />
            Excel
          </Button>
          <Button
            variant="outline"
            disabled={rows.length === 0}
            onClick={() =>
              void downloadCsv(
                `${business.name} - Pengeluaran ${period.firstDayKey}.csv`,
                expenseSheetRows(rows, expenseCategories, tz),
              )
            }
          >
            CSV
          </Button>
          <Button onClick={() => setAddOpen(true)}>
            <PlusIcon />
            Pengeluaran owner
          </Button>
        </>
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
          label="Jenis"
          value={kind}
          onChange={setKind}
          options={[
            ['all', 'Semua jenis'],
            ...EXPENSE_KINDS.map((k) => [k, EXPENSE_KIND_LABEL[k]] as [string, string]),
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

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {EXPENSE_KINDS.map((k) => (
          <Card key={k} className="gap-1 py-3">
            <CardContent className="px-4">
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <KindDot kind={k} />
                {EXPENSE_KIND_LABEL[k]}
              </p>
              <p className="text-lg font-semibold tabular-nums">{formatRupiah(totalOf(k))}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {toSort.length > 0 && !otherIds.has(categoryId) && (
        <div className="flex flex-col gap-2 rounded-lg border bg-muted/40 p-3 text-sm sm:flex-row sm:items-center">
          <PencilLineIcon
            className="hidden size-4 shrink-0 text-muted-foreground sm:block"
            aria-hidden
          />
          <p className="min-w-0 flex-1">
            <span className="font-medium">{toSort.length} pengeluaran &quot;Lainnya&quot;</span> (
            {formatRupiah(sumRupiah(toSort.map((e) => e.amount)))}) bisa dipindahkan ke kategori
            yang tepat.
          </p>
          <Button
            variant="outline"
            size="sm"
            className="shrink-0"
            onClick={() => {
              const first = toSort[0]
              if (first) setCategoryId(first.categoryId)
              setStatus('active')
            }}
          >
            Tampilkan
          </Button>
        </div>
      )}

      {query.isPending && <PageLoading />}
      {query.error && (
        <p className="text-sm text-destructive">Pengeluaran gagal dimuat: {query.error.message}</p>
      )}

      <Card className="py-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Waktu</TableHead>
              <TableHead>Kategori</TableHead>
              <TableHead className="hidden sm:table-cell">Catatan</TableHead>
              <TableHead className="hidden md:table-cell">Sumber</TableHead>
              <TableHead className="text-right">Nominal</TableHead>
              <TableHead className="w-32" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((e) => (
              <TableRow key={e.id} className={cn(e.status === 'void' && 'text-muted-foreground')}>
                <TableCell className="whitespace-nowrap">
                  {formatDateTime(new Date(e.occurredAt), tz)}
                </TableCell>
                <TableCell>
                  <span className="flex items-center gap-1.5">
                    <KindDot kind={kindOf(e.categoryId)} />
                    {categoryName(e.categoryId)}
                  </span>
                  <span className="block text-xs text-muted-foreground md:hidden">
                    {EXPENSE_SOURCE_LABEL[e.source]}
                  </span>
                  {e.note && (
                    <span className="block max-w-48 truncate text-xs sm:hidden">{e.note}</span>
                  )}
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
                    <div className="flex flex-col items-end gap-1 lg:flex-row lg:justify-end">
                      <Button
                        variant={otherIds.has(e.categoryId) ? 'outline' : 'ghost'}
                        size="sm"
                        onClick={() => setMoving(e)}
                        aria-label={`Pindah kategori ${formatRupiah(e.amount)}`}
                      >
                        {otherIds.has(e.categoryId) ? 'Pilah' : 'Pindah'}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive"
                        onClick={() => setTarget(e)}
                      >
                        Batalkan
                      </Button>
                    </div>
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
      <RecategorizeDialog
        expense={moving}
        categories={expenseCategories}
        timeZone={tz}
        onClose={() => setMoving(null)}
      />
      <VoidDialog
        open={target !== null}
        onOpenChange={(open) => !open && setTarget(null)}
        title="Batalkan pengeluaran?"
        description={
          target ? `${categoryName(target.categoryId)} · ${formatRupiah(target.amount)}` : ''
        }
        onConfirm={async (reason) => {
          if (!target) return { ok: false, error: 'Tidak ada data dipilih' }
          const result = await voidExpenseAsOwner(business.id, target.id, reason)
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
