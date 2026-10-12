import { createPortal } from 'react-dom'
import { cn } from '@/lib/utils'
import { usePrintJob } from './browser-print'
import { PAPER_CHARS, type PaperWidth, type ReceiptLine } from './format-receipt'

/** Printable area: 48mm on 58mm paper, 72mm on 80mm paper (1.5mm per character). */
const PRINTABLE_MM: Record<PaperWidth, number> = { 58: 48, 80: 72 }

/** Monospace rendering of receipt lines; used on screen and for browser printing. */
export function ReceiptPaper({
  lines,
  paper,
  className,
}: {
  lines: readonly ReceiptLine[]
  paper: PaperWidth
  className?: string
}) {
  return (
    <div
      className={cn('receipt-paper bg-white font-mono text-neutral-950', className)}
      style={{
        // content-box: padding must not eat into the exact character width.
        boxSizing: 'content-box',
        width: `${PAPER_CHARS[paper]}ch`,
        // 0.6em is the advance width of a typical monospace glyph.
        fontSize: `calc(${PRINTABLE_MM[paper]}mm / ${PAPER_CHARS[paper]} / 0.6)`,
      }}
      data-paper={paper}
    >
      {lines.map((line, index) => (
        <div
          key={index}
          className={cn(
            'leading-[1.35] whitespace-pre',
            line.align === 'center' && 'text-center',
            line.bold && 'font-bold',
            line.large && 'py-[0.2em]',
          )}
        >
          {line.text || ' '}
        </div>
      ))}
    </div>
  )
}

/** Mounted once at the app root; holds the receipt that `window.print()` prints. */
export function PrintHost() {
  const job = usePrintJob()
  if (!job) return null
  return createPortal(
    <div id="print-root" aria-hidden>
      <style>{`@page { size: ${job.paper}mm auto; margin: 3mm ${(job.paper - PRINTABLE_MM[job.paper]) / 2}mm; }`}</style>
      <ReceiptPaper lines={job.lines} paper={job.paper} />
    </div>,
    document.body,
  )
}
