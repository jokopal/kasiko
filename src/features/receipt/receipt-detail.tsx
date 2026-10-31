import type { Transaction } from '@/lib/types'
import { formatReceipt, type ReceiptBusiness } from './format-receipt'
import { printerSettings } from './printer-settings'
import { ReceiptActions } from './receipt-actions'
import { ReceiptPaper } from './receipt-paper'

/** The receipt as printed, with its print actions. Kasir reprint and owner detail share it. */
export function ReceiptDetail({
  transaction,
  business,
}: {
  transaction: Transaction
  business: ReceiptBusiness
}) {
  const { paperWidth } = printerSettings.useValue()
  return (
    <>
      <div className="flex justify-center rounded-lg bg-muted p-3">
        <ReceiptPaper
          lines={formatReceipt(transaction, business, paperWidth)}
          paper={paperWidth}
          className="max-w-full overflow-x-auto p-3 shadow-sm"
        />
      </div>
      <ReceiptActions transaction={transaction} business={business} />
    </>
  )
}
