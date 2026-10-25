import { useQuery } from '@tanstack/react-query'
import { BanIcon, DownloadIcon } from 'lucide-react'
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
import { PageLoading } from '@/components/page-loading'
import { fetchTransactions } from '@/features/data/owner'
import { voidTransactionAsOwner } from '@/features/data/owner-actions'
import { useOwnerData } from '@/features/data/owner-data'
import { keys } from '@/features/data/query-client'
import { OwnerPage } from '@/features/owner/page'
import { formatDateTime } from '@/lib/datetime'
import { formatRupiah, sumRupiah } from '@/lib/money'
import { PAYMENT_METHOD_LABEL, PAYMENT_METHODS, type Transaction } from '@/lib/types'
import { cn } from '@/lib/utils'
import { downloadCsv, downloadWorkbook } from './monthly-export'
import { PeriodPicker } from './period-picker'
import { transactionSheetRows } from './table-export'
import { usePeriod } from './use-period'

const PAGE_SIZE = 50

export function TransactionsPage() {
  const { business } = useOwnerData()
  const tz = business.timezone
  const period = usePeriod(tz)
  const query = useQuery({
    queryKey: keys.list(business.id, 'transactions', period.firstDayKey, period.lastDayKey),
    queryFn: () => fetchTransactions(business.id, period.range.from, period.range.to),
  })
  const transactions = query.data ?? []
  const [method, setMethod] = useState('all')
  const [status, setStatus] = useState('all')
  const [limit, setLimit] = useState(PAGE_SIZE)
  const [target, setTarget] = useState<Transaction | null>(null)

  const rows = transactions
    .filter((t) => method === 'all' || t.paymentMethod === method)
    .filter((t) => status === 'all' || t.status === status)
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
  const paidTotal = sumRupiah(rows.filter((t) => t.status === 'paid').map((t) => t.total))
  const shown = rows.slice(0, limit)
  const itemsText = (t: Transaction) =>
    t.items.map((i) => (i.qty > 1 ? `${i.nameSnapshot} ×${i.qty}` : i.nameSnapshot)).join(', ')

  return (
    <OwnerPage
      title="Transaksi"
      description={`${rows.length} transaksi · total lunas ${formatRupiah(paidTotal)}`}
      actions={
        <div className="flex gap-2">
          <Button
            variant="outline"
            disabled={rows.length === 0}
            onClick={() =>
              void downloadWorkbook(`${business.name} - Transaksi ${period.firstDayKey}.xlsx`, [
                { name: 'Transaksi', rows: transactionSheetRows(rows, tz) },
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
                `${business.name} - Transaksi ${period.firstDayKey}.csv`,
                transactionSheetRows(rows, tz),
              )
            }
          >
            CSV
          </Button>
        </div>
      }
    >
      <div className="flex flex-wrap items-center gap-2">
        <PeriodPicker period={period} />
        <Select value={method} onValueChange={setMethod}>
          <SelectTrigger className="h-9 w-36" aria-label="Metode">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua metode</SelectItem>
            {PAYMENT_METHODS.map((m) => (
              <SelectItem key={m} value={m}>
                {PAYMENT_METHOD_LABEL[m]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="h-9 w-40" aria-label="Status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua status</SelectItem>
            <SelectItem value="paid">Lunas</SelectItem>
            <SelectItem value="void">Dibatalkan</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {query.isPending && <PageLoading />}
      {query.error && (
        <p className="text-sm text-destructive">Transaksi gagal dimuat: {query.error.message}</p>
      )}

      {/* Phone: cards */}
      <ul className="grid gap-2 md:hidden">
        {shown.map((t) => (
          <li
            key={t.id}
            className={cn('rounded-xl border bg-card p-3', t.status === 'void' && 'opacity-70')}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-mono text-xs text-muted-foreground">{t.receiptNo}</p>
                <p className="text-sm">{formatDateTime(new Date(t.occurredAt), tz)}</p>
              </div>
              <p
                className={cn('font-semibold tabular-nums', t.status === 'void' && 'line-through')}
              >
                {formatRupiah(t.total)}
              </p>
            </div>
            <p className="mt-1 truncate text-sm text-muted-foreground">{itemsText(t)}</p>
            <div className="mt-2 flex items-center gap-2">
              <Badge variant="outline">{PAYMENT_METHOD_LABEL[t.paymentMethod]}</Badge>
              {t.plateNumber && <Badge variant="secondary">{t.plateNumber}</Badge>}
              {t.status === 'void' && <Badge variant="destructive">Dibatalkan</Badge>}
              {t.status === 'paid' && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="ml-auto text-destructive"
                  onClick={() => setTarget(t)}
                >
                  <BanIcon />
                  Batalkan
                </Button>
              )}
            </div>
            {t.voidReason && (
              <p className="mt-1 text-xs text-destructive">Alasan: {t.voidReason}</p>
            )}
          </li>
        ))}
      </ul>

      {/* Tablet & desktop: table */}
      <Card className="hidden py-0 md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Waktu & nota</TableHead>
              <TableHead>Layanan</TableHead>
              <TableHead className="hidden lg:table-cell">Plat</TableHead>
              <TableHead>Metode</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="w-12 xl:w-28" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {shown.map((t) => (
              <TableRow key={t.id} className={cn(t.status === 'void' && 'text-muted-foreground')}>
                <TableCell className="whitespace-nowrap">
                  {formatDateTime(new Date(t.occurredAt), tz)}
                  <span className="block font-mono text-xs text-muted-foreground">
                    {t.receiptNo}
                  </span>
                </TableCell>
                <TableCell className="max-w-48 lg:max-w-72">
                  <p className="truncate">{itemsText(t)}</p>
                  {t.voidReason && (
                    <p className="truncate text-xs text-destructive">Batal: {t.voidReason}</p>
                  )}
                </TableCell>
                <TableCell className="hidden lg:table-cell">{t.plateNumber ?? '—'}</TableCell>
                <TableCell>{PAYMENT_METHOD_LABEL[t.paymentMethod]}</TableCell>
                <TableCell
                  className={cn(
                    'text-right font-medium tabular-nums',
                    t.status === 'void' && 'line-through',
                  )}
                >
                  {formatRupiah(t.total)}
                  {t.discountAmount > 0 && (
                    <span className="block text-xs font-normal text-muted-foreground">
                      {t.discountName} −{formatRupiah(t.discountAmount)}
                    </span>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  {t.status === 'paid' ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive"
                      aria-label={`Batalkan ${t.receiptNo}`}
                      onClick={() => setTarget(t)}
                    >
                      <BanIcon />
                      <span className="hidden xl:inline">Batalkan</span>
                    </Button>
                  ) : (
                    <Badge variant="destructive">Batal</Badge>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      {rows.length === 0 && (
        <p className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
          Tidak ada transaksi untuk filter ini
        </p>
      )}
      {rows.length > limit && (
        <div className="flex justify-center">
          <Button variant="outline" onClick={() => setLimit((n) => n + PAGE_SIZE)}>
            Tampilkan lebih banyak ({rows.length - limit} lagi)
          </Button>
        </div>
      )}

      <VoidDialog
        open={target !== null}
        onOpenChange={(open) => !open && setTarget(null)}
        title="Batalkan transaksi?"
        description={target ? `${target.receiptNo} · ${formatRupiah(target.total)}` : ''}
        onConfirm={async (reason) => {
          if (!target) return { ok: false, error: 'Tidak ada transaksi dipilih' }
          const result = await voidTransactionAsOwner(business.id, target.id, reason)
          if (result.ok) toast.success('Transaksi dibatalkan')
          return result
        }}
      />
    </OwnerPage>
  )
}
