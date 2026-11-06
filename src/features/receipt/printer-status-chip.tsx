import { PrinterIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { canPrintDirectly, STATE_DOT, usePrinterStatus } from './printer'
import { openPrinterSetup } from './printer-setup'

/** Printer state in the kasir header; tap to open the printer setup. */
export function PrinterStatusChip() {
  const status = usePrinterStatus()
  if (!canPrintDirectly()) return null
  return (
    <button
      type="button"
      onClick={openPrinterSetup}
      aria-label={`Printer: ${status.label}`}
      title={status.label}
      className="relative flex size-10 shrink-0 items-center justify-center rounded-lg transition-colors hover:bg-white/15"
    >
      <PrinterIcon className="size-5" aria-hidden />
      <span
        className={cn(
          'absolute top-1.5 right-1.5 size-2.5 rounded-full ring-2 ring-primary',
          STATE_DOT[status.state],
        )}
        aria-hidden
      />
    </button>
  )
}
