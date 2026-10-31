import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ReceiptDetail } from '@/features/receipt/receipt-detail'
import { deviceCodeOf } from '@/features/receipt/receipt-number'
import { formatDateTime } from '@/lib/datetime'
import type { Business, Transaction } from '@/lib/types'

/** One transaction for the owner: the receipt as the customer got it, plus its record. */
export function TransactionDetailDialog({
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
          <DialogTitle>Detail transaksi</DialogTitle>
          <DialogDescription className="font-mono">{transaction?.receiptNo}</DialogDescription>
        </DialogHeader>
        {transaction && (
          <>
            <TransactionRecord transaction={transaction} timeZone={business.timezone} />
            <ReceiptDetail transaction={transaction} business={business} />
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

function TransactionRecord({
  transaction,
  timeZone,
}: {
  transaction: Transaction
  timeZone: string
}) {
  const { receiptNo, receivedAt, status, orderId, voidedAt, voidReason } = transaction
  const code = deviceCodeOf(receiptNo)
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
      <dt className="text-muted-foreground">Status</dt>
      <dd className="text-right">
        {status === 'paid' ? (
          <Badge variant="secondary">Lunas</Badge>
        ) : (
          <Badge variant="destructive">Dibatalkan</Badge>
        )}
      </dd>
      <dt className="text-muted-foreground">Perangkat kasir</dt>
      <dd className="text-right">{code ?? '—'}</dd>
      <dt className="text-muted-foreground">Pembayaran</dt>
      <dd className="text-right">{orderId ? 'Bayar di akhir' : 'Langsung di kasir'}</dd>
      <dt className="text-muted-foreground">Tiba di server</dt>
      <dd className="text-right">
        {receivedAt ? formatDateTime(new Date(receivedAt), timeZone) : '—'}
      </dd>
      {voidedAt && (
        <>
          <dt className="text-muted-foreground">Dibatalkan</dt>
          <dd className="text-right">{formatDateTime(new Date(voidedAt), timeZone)}</dd>
        </>
      )}
      {voidReason && (
        <>
          <dt className="text-muted-foreground">Alasan batal</dt>
          <dd className="text-right text-destructive">{voidReason}</dd>
        </>
      )}
    </dl>
  )
}
