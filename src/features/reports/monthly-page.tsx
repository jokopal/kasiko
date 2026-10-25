import { ChevronLeftIcon, ChevronRightIcon, DownloadIcon } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { Fragment, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { KindDot } from '@/features/expenses/kind'
import { PageLoading } from '@/components/page-loading'
import { fetchFirstActivityDay, fetchMonthlyMatrix } from '@/features/data/owner'
import { useOwnerData } from '@/features/data/owner-data'
import { keys } from '@/features/data/query-client'
import { OwnerPage } from '@/features/owner/page'
import { businessDayKey, getZonedParts, startOfBusinessDayKey } from '@/lib/datetime'
import { formatDigits, formatRupiah, sumRupiah } from '@/lib/money'
import { EXPENSE_KIND_LABEL, EXPENSE_KINDS } from '@/lib/types'
import { cn } from '@/lib/utils'
import { monthKeysEnding, type MonthlyMatrix } from './finance'
import { downloadCsv, downloadWorkbook, monthSheetRows, sheetNameFor } from './monthly-export'

const MONTH_LONG = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
]
const WEEKDAY_INITIAL = ['M', 'S', 'S', 'R', 'K', 'J', 'S']
const MONTH_KEY = /^\d{4}-(0[1-9]|1[0-2])$/

const monthTitle = (key: string) =>
  `${MONTH_LONG[Number(key.slice(5, 7)) - 1] ?? ''} ${key.slice(0, 4)}`
const cell = (value: number) => (value === 0 ? '' : formatDigits(value))

export function MonthlyPage() {
  const { business, expenseCategories } = useOwnerData()
  const tz = business.timezone
  const [params, setParams] = useSearchParams()

  const firstDay = useQuery({
    queryKey: keys.report(business.id, 'first-day'),
    queryFn: () => fetchFirstActivityDay(business.id),
  })

  // Every month from the oldest record (live or imported) up to this month.
  const months = useMemo(() => {
    const today = businessDayKey(new Date(), tz)
    const oldest = firstDay.data && firstDay.data < today ? firstDay.data : today
    const span =
      (Number(today.slice(0, 4)) - Number(oldest.slice(0, 4))) * 12 +
      Number(today.slice(5, 7)) -
      Number(oldest.slice(5, 7)) +
      1
    return monthKeysEnding(today, Math.min(Math.max(span, 1), 120)).reverse()
  }, [firstDay.data, tz])

  const requested = params.get('bulan')
  const monthKey =
    requested && MONTH_KEY.test(requested) && months.includes(requested)
      ? requested
      : (months[0] ?? businessDayKey(new Date(), tz).slice(0, 7))
  const index = months.indexOf(monthKey)
  const goTo = (key: string | undefined) => {
    if (!key) return
    const next = new URLSearchParams(params)
    next.set('bulan', key)
    setParams(next, { replace: true })
  }

  const matrixQuery = useQuery({
    queryKey: keys.report(business.id, 'matrix', monthKey),
    queryFn: () => fetchMonthlyMatrix(business.id, monthKey, expenseCategories, tz),
  })
  const matrix = matrixQuery.data
  const categoryName = (id: string) =>
    expenseCategories.find((c) => c.id === id)?.name ?? 'Kategori terhapus'

  async function exportMonths(monthKeys: string[], format: 'xlsx' | 'csv') {
    const toastId = toast.loading('Menyiapkan file…')
    try {
      const sheets = []
      for (const key of monthKeys) {
        const data = await fetchMonthlyMatrix(business.id, key, expenseCategories, tz)
        sheets.push({ name: sheetNameFor(key), rows: monthSheetRows(data, key, categoryName) })
      }
      const base = `${business.name} - Arus Kas`
      if (format === 'csv') {
        await downloadCsv(`${base} ${monthKey}.csv`, sheets[0]?.rows ?? [])
      } else {
        const suffix = monthKeys.length === 1 ? monthKey : `${monthKeys.at(-1)} sd ${monthKeys[0]}`
        await downloadWorkbook(`${base} ${suffix}.xlsx`, [...sheets].reverse())
      }
      toast.success('File siap diunduh', { id: toastId })
    } catch {
      toast.error('Ekspor gagal. Coba lagi.', { id: toastId })
    }
  }

  return (
    <OwnerPage
      title="Rekap Bulanan"
      description="Format arus kas harian per kategori — sama seperti spreadsheet, terisi otomatis dari kasir."
      actions={
        <>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              className="size-9"
              disabled={index >= months.length - 1}
              onClick={() => goTo(months[index + 1])}
              aria-label="Bulan sebelumnya"
            >
              <ChevronLeftIcon />
            </Button>
            <Select value={monthKey} onValueChange={goTo}>
              <SelectTrigger className="h-9 w-44" aria-label="Pilih bulan">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {months.map((key) => (
                  <SelectItem key={key} value={key}>
                    {monthTitle(key)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="icon"
              className="size-9"
              disabled={index <= 0}
              onClick={() => goTo(months[index - 1])}
              aria-label="Bulan berikutnya"
            >
              <ChevronRightIcon />
            </Button>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline">
                <DownloadIcon />
                Ekspor
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => void exportMonths([monthKey], 'xlsx')}>
                Excel — {monthTitle(monthKey)}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void exportMonths(months, 'xlsx')}>
                Excel — semua bulan ({months.length} sheet)
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void exportMonths([monthKey], 'csv')}>
                CSV — {monthTitle(monthKey)}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </>
      }
    >
      {matrix ? (
        <>
          <MonthSummary matrix={matrix} />
          <MatrixTable
            matrix={matrix}
            categoryName={categoryName}
            kinds={expenseCategories}
            tz={tz}
          />
        </>
      ) : matrixQuery.error ? (
        <p className="text-sm text-destructive">Rekap gagal dimuat: {matrixQuery.error.message}</p>
      ) : (
        <PageLoading />
      )}
    </OwnerPage>
  )
}

function MonthSummary({ matrix }: { matrix: MonthlyMatrix }) {
  const t = matrix.totals
  const share = (value: number) =>
    t.income > 0 ? `${Math.round((value / t.income) * 100)}% dari omset` : '—'
  const tiles = [
    {
      label: 'Omset',
      value: t.income,
      note: `${matrix.income.filter((v) => v > 0).length} hari buka`,
    },
    { label: 'Profit operasional', value: t.operatingProfit, note: share(t.operatingProfit) },
    { label: 'Profit bersih', value: t.profit, note: share(t.profit), emphasis: true },
    { label: 'Prive', value: t.drawings, note: 'Tidak mengurangi profit' },
    { label: 'Arus kas bersih', value: t.netCashFlow, note: 'Sama dengan "Net Profit" di Excel' },
  ]
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
      {tiles.map((tile) => (
        <Card
          key={tile.label}
          className={cn('gap-1 py-3', tile.emphasis && 'ring-2 ring-primary/40')}
        >
          <CardContent className="space-y-0.5 px-3">
            <p className="text-xs text-muted-foreground">{tile.label}</p>
            <p
              className={cn(
                'text-lg font-semibold tracking-tight tabular-nums md:text-xl',
                tile.value < 0 && 'text-destructive',
              )}
            >
              {formatRupiah(tile.value)}
            </p>
            <p className="truncate text-xs text-muted-foreground">{tile.note}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

function MatrixTable({
  matrix,
  categoryName,
  kinds,
  tz,
}: {
  matrix: MonthlyMatrix
  categoryName: (id: string) => string
  kinds: readonly { id: string; kind: (typeof EXPENSE_KINDS)[number] }[]
  tz: string
}) {
  const kindOf = (id: string) => kinds.find((c) => c.id === id)?.kind ?? 'operating'
  const groups = EXPENSE_KINDS.map((kind) => ({
    kind,
    rows: matrix.rows.filter((row) => row.total > 0 && kindOf(row.categoryId) === kind),
  })).filter((group) => group.rows.length > 0)
  const sticky = 'sticky left-0 z-10 bg-card'
  const num = 'px-2 py-1.5 text-right tabular-nums whitespace-nowrap'

  return (
    <Card className="gap-0 py-0">
      <div className="relative overflow-x-auto">
        <table className="w-full border-separate border-spacing-0 text-xs">
          <caption className="sr-only">
            Pendapatan dan pengeluaran per hari dan per kategori
          </caption>
          <thead>
            <tr className="bg-muted/50">
              <th
                scope="col"
                className={cn(sticky, 'min-w-44 border-b bg-muted px-3 py-2 text-left font-medium')}
              >
                Kategori
              </th>
              {matrix.dayKeys.map((key, i) => {
                const weekday = getZonedParts(startOfBusinessDayKey(key, tz), tz).weekday
                return (
                  <th
                    key={key}
                    scope="col"
                    className={cn(
                      'min-w-16 border-b px-2 py-1 text-right font-medium tabular-nums',
                      weekday === 0 && 'text-destructive',
                    )}
                    title={matrix.imported[i] ? 'Data impor' : undefined}
                  >
                    <span className="block text-[10px] font-normal text-muted-foreground">
                      {WEEKDAY_INITIAL[weekday]}
                    </span>
                    {Number(key.slice(8, 10))}
                    {matrix.imported[i] && (
                      <span className="ml-0.5 text-muted-foreground" aria-label="data impor">
                        ·
                      </span>
                    )}
                  </th>
                )
              })}
              <th scope="col" className="min-w-24 border-b px-3 py-2 text-right font-semibold">
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            <tr className="font-semibold">
              <th scope="row" className={cn(sticky, 'border-b px-3 py-2 text-left')}>
                Pendapatan
              </th>
              {matrix.income.map((value, i) => (
                <td key={i} className={cn(num, 'border-b')}>
                  {cell(value)}
                </td>
              ))}
              <td className={cn(num, 'border-b px-3')}>{formatDigits(matrix.totals.income)}</td>
            </tr>
            {groups.map((group) => {
              const subtotal = matrix.dayKeys.map((_, i) =>
                sumRupiah(group.rows.map((row) => row.values[i] ?? 0)),
              )
              return (
                <Fragment key={group.kind}>
                  <tr className="bg-muted/40 font-medium">
                    <th scope="row" className={cn(sticky, 'bg-muted px-3 py-1.5 text-left')}>
                      <span className="flex items-center gap-1.5">
                        <KindDot kind={group.kind} />
                        {EXPENSE_KIND_LABEL[group.kind]}
                      </span>
                    </th>
                    {subtotal.map((value, i) => (
                      <td key={i} className={cn(num, 'text-muted-foreground')}>
                        {cell(value)}
                      </td>
                    ))}
                    <td className={cn(num, 'px-3')}>{formatDigits(sumRupiah(subtotal))}</td>
                  </tr>
                  {group.rows.map((row) => (
                    <tr key={row.categoryId} className="hover:bg-muted/30">
                      <th
                        scope="row"
                        className={cn(sticky, 'border-b px-3 py-1.5 pl-7 text-left font-normal')}
                      >
                        {categoryName(row.categoryId)}
                      </th>
                      {row.values.map((value, i) => (
                        <td key={i} className={cn(num, 'border-b')}>
                          {cell(value)}
                        </td>
                      ))}
                      <td className={cn(num, 'border-b px-3 font-medium')}>
                        {formatDigits(row.total)}
                      </td>
                    </tr>
                  ))}
                </Fragment>
              )
            })}
            {groups.length === 0 && (
              <tr>
                <td
                  colSpan={matrix.dayKeys.length + 2}
                  className="py-8 text-center text-muted-foreground"
                >
                  Belum ada pengeluaran di bulan ini
                </td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr className="font-semibold">
              <th scope="row" className={cn(sticky, 'border-t-2 px-3 py-2 text-left')}>
                Pendapatan harian
                <span className="block text-[10px] font-normal text-muted-foreground">
                  Pendapatan − semua pengeluaran
                </span>
              </th>
              {matrix.net.map((value, i) => (
                <td key={i} className={cn(num, 'border-t-2', value < 0 && 'text-destructive')}>
                  {matrix.income[i] === 0 && value === 0 ? '' : formatDigits(value)}
                </td>
              ))}
              <td
                className={cn(
                  num,
                  'border-t-2 px-3',
                  matrix.totals.netCashFlow < 0 && 'text-destructive',
                )}
              >
                {formatDigits(matrix.totals.netCashFlow)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
      {matrix.imported.some(Boolean) && (
        <p className="border-t px-3 py-2 text-xs text-muted-foreground">
          · = tanggal berisi data impor dari spreadsheet
        </p>
      )}
    </Card>
  )
}
