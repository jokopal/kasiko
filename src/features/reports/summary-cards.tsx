import {
  ArrowDownRightIcon,
  ArrowUpRightIcon,
  MinusIcon,
  TrendingUpIcon,
  WalletIcon,
  type LucideIcon,
  BanknoteArrowDownIcon,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { formatRupiah } from '@/lib/money'
import { cn } from '@/lib/utils'
import { percentChange } from './finance'
import { EXPENSE_DOOR_LABEL, type ExpenseDoor, type Flow, type FlowSummary } from './summary'

// The three flows of decision #40, each for the period and cumulative since the first
// record. Cash is deliberately absent: it lives on Dana Cadangan only.

const DOORS: ExpenseDoor[] = ['drawer', 'owner', 'imported']

export interface PreviousPeriod {
  income: number
  expense: number
  profit: number
}

export function SummaryCards({
  summary,
  previous,
}: {
  summary: FlowSummary
  /** Same-length period just before, for the change badge. */
  previous?: PreviousPeriod
}) {
  const { income, expense, profit } = summary
  const doors = DOORS.filter((door) => door !== 'imported' || expense.doors.imported.period !== 0)
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
      <FlowCard
        icon={BanknoteArrowDownIcon}
        label="Pemasukan"
        flow={income}
        change={previous && percentChange(income.period, previous.income)}
      />
      <FlowCard
        icon={WalletIcon}
        label="Pengeluaran"
        flow={expense}
        change={previous && percentChange(expense.period, previous.expense)}
        higherIsWorse
      >
        <dl className="space-y-0.5 text-sm">
          {doors.map((door) => (
            <div key={door} className="flex items-baseline justify-between gap-3">
              <dt className="text-muted-foreground">dari {EXPENSE_DOOR_LABEL[door]}</dt>
              <dd className="font-medium tabular-nums">
                {formatRupiah(expense.doors[door].period)}
              </dd>
            </div>
          ))}
        </dl>
      </FlowCard>
      <FlowCard
        icon={TrendingUpIcon}
        label="Profit"
        hint="Pemasukan − pengeluaran"
        flow={profit}
        change={previous && percentChange(profit.period, previous.profit)}
        emphasis
      />
    </div>
  )
}

function FlowCard({
  icon: Icon,
  label,
  hint,
  flow,
  change,
  higherIsWorse = false,
  emphasis = false,
  children,
}: {
  icon: LucideIcon
  label: string
  hint?: string
  flow: Flow
  change?: number | null
  higherIsWorse?: boolean
  emphasis?: boolean
  children?: React.ReactNode
}) {
  return (
    <Card className={cn('gap-0 py-0', emphasis && 'ring-2 ring-primary/40')}>
      <CardContent className="flex h-full flex-col gap-3 p-4">
        <div className="flex items-center gap-2">
          <span className="flex size-8 items-center justify-center rounded-lg bg-muted">
            <Icon className="size-4" aria-hidden />
          </span>
          <h2 className="font-medium">{label}</h2>
          {hint && <span className="ml-auto text-xs text-muted-foreground">{hint}</span>}
        </div>
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">Periode ini</p>
          <p
            className={cn(
              'text-2xl font-semibold tracking-tight tabular-nums',
              flow.period < 0 && 'text-destructive',
            )}
          >
            {formatRupiah(flow.period)}
          </p>
          {change !== undefined && <Change change={change} higherIsWorse={higherIsWorse} />}
        </div>
        {children}
        <div className="mt-auto space-y-0.5 border-t pt-3">
          <p className="text-xs text-muted-foreground">Kumulatif sejak data pertama</p>
          <p
            className={cn(
              'text-lg font-semibold tabular-nums',
              flow.cumulative < 0 && 'text-destructive',
            )}
          >
            {formatRupiah(flow.cumulative)}
          </p>
          <p className="text-xs text-muted-foreground tabular-nums">
            sebelum periode {formatRupiah(flow.before)}
          </p>
        </div>
      </CardContent>
    </Card>
  )
}

function Change({ change, higherIsWorse }: { change: number | null; higherIsWorse: boolean }) {
  const direction = change === null ? 0 : Math.sign(Math.round(change))
  const good = higherIsWorse ? direction < 0 : direction > 0
  const Icon = direction > 0 ? ArrowUpRightIcon : direction < 0 ? ArrowDownRightIcon : MinusIcon
  return (
    <p className="flex items-center gap-1 text-xs text-muted-foreground">
      <span
        className={cn(
          'inline-flex items-center gap-0.5 font-medium',
          direction !== 0 && (good ? 'text-emerald-700' : 'text-red-700'),
        )}
      >
        <Icon className="size-3.5" aria-hidden />
        {change === null ? '—' : `${Math.abs(change).toFixed(0)}%`}
      </span>
      vs periode sebelumnya
    </p>
  )
}
