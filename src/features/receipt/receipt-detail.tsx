import { PencilIcon } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { ReceiptCorrection, Transaction } from '@/lib/types'
import { formatReceipt, type ReceiptBusiness } from './format-receipt'
import { printerSettings } from './printer-settings'
import { ReceiptActions } from './receipt-actions'
import { ReceiptPaper } from './receipt-paper'
import { ReceiptPaperEditor } from './receipt-paper-editor'

/**
 * The receipt as printed, with its print actions. Kasir (after saving, reprint) and owner
 * detail share it. With `onCorrect`, an "Edit nota" button turns the paper into the editor
 * (decision #44); the correction changes the printout only, never income.
 */
export function ReceiptDetail({
  transaction,
  business,
  onCorrect,
}: {
  transaction: Transaction
  business: ReceiptBusiness
  /** Saves a correction; resolves to the corrected transaction, or null when refused. */
  onCorrect?: (correction: ReceiptCorrection) => Promise<Transaction | null>
}) {
  const { paperWidth } = printerSettings.useValue()
  const [corrected, setCorrected] = useState<Transaction | null>(null)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const shown = corrected ?? transaction
  const canEdit = onCorrect !== undefined && shown.status === 'paid'

  async function save(correction: ReceiptCorrection) {
    if (!onCorrect) return
    setSaving(true)
    try {
      const result = await onCorrect(correction)
      if (result) {
        setCorrected(result)
        setEditing(false)
        toast.success('Koreksi nota disimpan')
      }
    } finally {
      setSaving(false)
    }
  }

  if (editing) {
    return (
      <ReceiptPaperEditor
        transaction={shown}
        business={business}
        saving={saving}
        onSave={(correction) => void save(correction)}
        onCancel={() => setEditing(false)}
      />
    )
  }

  return (
    <>
      {(shown.receiptCorrection || canEdit) && (
        <div className="flex items-center justify-between gap-2">
          {shown.receiptCorrection ? (
            <Badge
              variant="outline"
              className="border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100"
            >
              Koreksi nota
            </Badge>
          ) : (
            <span />
          )}
          {canEdit && (
            <Button variant="outline" size="sm" className="h-10" onClick={() => setEditing(true)}>
              <PencilIcon />
              Edit nota
            </Button>
          )}
        </div>
      )}
      <div className="flex justify-center rounded-lg bg-muted p-3">
        <ReceiptPaper
          lines={formatReceipt(shown, business, paperWidth)}
          paper={paperWidth}
          className="max-w-full overflow-x-auto p-3 shadow-sm"
        />
      </div>
      <ReceiptActions transaction={shown} business={business} />
    </>
  )
}
