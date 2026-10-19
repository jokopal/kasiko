import { EXPENSE_KIND_LABEL, type ExpenseKind } from '@/lib/types'
import { KIND_COLOR } from './kind-colors'
import { cn } from '@/lib/utils'

export function KindDot({ kind, className }: { kind: ExpenseKind; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn('inline-block size-2.5 shrink-0 rounded-full', className)}
      style={{ backgroundColor: KIND_COLOR[kind] }}
    />
  )
}

export function KindLabel({ kind, className }: { kind: ExpenseKind; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-xs', className)}>
      <KindDot kind={kind} />
      {EXPENSE_KIND_LABEL[kind]}
    </span>
  )
}
