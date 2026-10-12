import { useSyncExternalStore } from 'react'
import type { PaperWidth, ReceiptLine } from './format-receipt'

// Browser print path: the receipt is rendered into #print-root (see PrintHost) and
// `@media print` hides everything else, so any printer the OS knows can be used.

export interface PrintJob {
  lines: ReceiptLine[]
  paper: PaperWidth
}

let job: PrintJob | null = null
const listeners = new Set<() => void>()

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function usePrintJob(): PrintJob | null {
  return useSyncExternalStore(
    subscribe,
    () => job,
    () => null,
  )
}

const nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve))

export async function printInBrowser(next: PrintJob): Promise<void> {
  job = next
  for (const listener of listeners) listener()
  // Let React commit the receipt into the print root before the dialog snapshots it.
  await nextFrame()
  await nextFrame()
  window.print()
}
