import { BanIcon, PrinterIcon } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { VoidDialog } from '@/components/void-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { SyncState } from '@/features/offline/local-view'
import { ReceiptDetail } from '@/features/receipt/receipt-detail'
import { formatLongDate, formatTime } from '@/lib/datetime'
import { formatRupiah } from '@/lib/money'
import { PAYMENT_METHOD_LABEL, type Business, type Expense, type Transaction } from '@/lib/types'
import { cn } from '@/lib/utils'
import { requestVoid } from './commands'
import { useKasirData } from './use-kasir-data'

type VoidTarget = { kind: 'transaction'; row: Transaction } | { kind: 'expense'; row: Expense }

export function HistoryPage() {
  // Today only, local + synced, newest first (see KasirDataProvider).
  const {
    business,
    transactions: todaysTransactions,
    expenses: todaysExpenses,
    expenseCategories,
  } = useKasirData()
  const [target, setTarget] = useState<VoidTarget | null>(null)
  const [reprint, setReprint] = useState<Transaction | null>(null)
  const tz = business.timezone
  const categoryName = (id: string) => expenseCategories.find((c) => c.id === id)?.name ?? '—'

  async function confirmVoid(reason: string) {
    if (!target) return { ok: false as const, error: 'Tidak ada data dipilih' }
    const result = await requestVoid(target, business, reason)
    if (result.ok) toast.success('Data dibatalkan')
    return result
  }

  return (
    <div className="mx-auto h-full max-w-3xl overflow-y-auto p-3 md:p-6">
      <div className="mb-4">
        <h1 className="text-xl font-semibold">Riwayat hari ini</h1>
        <p className="text-sm text-muted-foreground">{formatLongDate(new Date(), tz)}</p>
      </div>

      <Tabs defaultValue="transactions">
        <TabsList className="grid w-full grid-cols-2 sm:w-auto sm:inline-grid">
          <TabsTrigger value="transactions">Transaksi ({todaysTransactions.length})</TabsTrigger>
          <TabsTrigger value="expenses">Pengeluaran ({todaysExpenses.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="transactions" className="mt-3">
          <ul className="grid gap-2">
            {todaysTransactions.map(({ row: t, sync }) => (
              <li
                key={t.id}
                className={cn(
                  'rounded-xl border bg-card p-3 md:p-4',
                  t.status === 'void' && 'opacity-70',
                )}
              >
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                      <span className="font-medium tabular-nums">
                        {formatTime(new Date(t.occurredAt), tz)}
                      </span>
                      <span className="font-mono text-xs text-muted-foreground">{t.receiptNo}</span>
                      <Badge variant="outline">{PAYMENT_METHOD_LABEL[t.paymentMethod]}</Badge>
                      {t.status === 'void' && <Badge variant="destructive">Dibatalkan</Badge>}
                      <SyncBadge sync={sync} />
                    </div>
                    <p className="mt-1 truncate text-sm text-muted-foreground">
                      {t.items
                        .map((i) => (i.qty > 1 ? `${i.nameSnapshot} ×${i.qty}` : i.nameSnapshot))
                        .join(', ')}
                      {t.plateNumber && ` · ${t.plateNumber}`}
                    </p>
                    {t.voidReason && (
                      <p className="mt-1 text-xs text-destructive">Alasan: {t.voidReason}</p>
                    )}
                  </div>
                  <p
                    className={cn(
                      'font-semibold tabular-nums',
                      t.status === 'void' && 'line-through',
                    )}
                  >
                    {formatRupiah(t.total)}
                  </p>
                </div>
                <div className="mt-3 flex justify-end gap-2">
                  <Button variant="outline" size="sm" className="h-9" onClick={() => setReprint(t)}>
                    <PrinterIcon />
                    Cetak ulang
                  </Button>
                  {t.status === 'paid' && (
                    <Button
                      variant="destructive"
                      size="sm"
                      className="h-9"
                      onClick={() => setTarget({ kind: 'transaction', row: t })}
                    >
                      <BanIcon />
                      Batalkan
                    </Button>
                  )}
                </div>
              </li>
            ))}
            {todaysTransactions.length === 0 && <EmptyRow text="Belum ada transaksi hari ini" />}
          </ul>
        </TabsContent>

        <TabsContent value="expenses" className="mt-3">
          <ul className="grid gap-2">
            {todaysExpenses.map(({ row: e, sync }) => (
              <li
                key={e.id}
                className={cn(
                  'flex items-start gap-3 rounded-xl border bg-card p-3 md:p-4',
                  e.status === 'void' && 'opacity-70',
                )}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-medium tabular-nums">
                      {formatTime(new Date(e.occurredAt), tz)}
                    </span>
                    <Badge variant="outline">{categoryName(e.categoryId)}</Badge>
                    {e.status === 'void' && <Badge variant="destructive">Dibatalkan</Badge>}
                    <SyncBadge sync={sync} />
                  </div>
                  {e.note && (
                    <p className="mt-1 truncate text-sm text-muted-foreground">{e.note}</p>
                  )}
                  {e.voidReason && (
                    <p className="mt-1 text-xs text-destructive">Alasan: {e.voidReason}</p>
                  )}
                </div>
                <div className="flex flex-col items-end gap-2">
                  <p
                    className={cn(
                      'font-semibold tabular-nums',
                      e.status === 'void' && 'line-through',
                    )}
                  >
                    {formatRupiah(e.amount)}
                  </p>
                  {e.status === 'active' && (
                    <Button
                      variant="destructive"
                      size="sm"
                      className="h-9"
                      onClick={() => setTarget({ kind: 'expense', row: e })}
                    >
                      <BanIcon />
                      Batalkan
                    </Button>
                  )}
                </div>
              </li>
            ))}
            {todaysExpenses.length === 0 && <EmptyRow text="Belum ada pengeluaran laci hari ini" />}
          </ul>
        </TabsContent>
      </Tabs>

      <ReprintDialog transaction={reprint} business={business} onClose={() => setReprint(null)} />
      <VoidDialog
        open={target !== null}
        onOpenChange={(open) => !open && setTarget(null)}
        title={target?.kind === 'expense' ? 'Batalkan pengeluaran?' : 'Batalkan transaksi?'}
        description="Data tidak dihapus, hanya ditandai batal dan tidak dihitung di rekap."
        onConfirm={confirmVoid}
      />
    </div>
  )
}

function ReprintDialog({
  transaction,
  business,
  onClose,
}: {
  transaction: Transaction | null
  business: Business
  onClose: () => void
}) {
  return (
    <Dialog open={transaction !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[100dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Cetak ulang nota</DialogTitle>
          <DialogDescription className="font-mono">{transaction?.receiptNo}</DialogDescription>
        </DialogHeader>
        {transaction && <ReceiptDetail transaction={transaction} business={business} />}
      </DialogContent>
    </Dialog>
  )
}

function SyncBadge({ sync }: { sync: SyncState }) {
  if (sync === 'synced') return null
  return sync === 'failed' ? (
    <Badge variant="destructive">Gagal sinkron</Badge>
  ) : (
    <Badge variant="secondary" className="bg-amber-100 text-amber-900">
      Belum tersinkron
    </Badge>
  )
}

function EmptyRow({ text }: { text: string }) {
  return (
    <li className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
      {text}
    </li>
  )
}
