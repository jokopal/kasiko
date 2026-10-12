import { BanknoteIcon, LandmarkIcon, QrCodeIcon } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { useBusinessData } from '@/features/preview/selectors'
import { drawerExpected, periodTotals } from '@/features/reports/finance'
import { businessDayRange, formatLongDate, isInRange } from '@/lib/datetime'
import { formatRupiah } from '@/lib/money'

export function SummaryPage() {
  const { business, transactions, expenses } = useBusinessData()
  const tz = business.timezone
  const today = businessDayRange(new Date(), tz)
  // The cashier only sees drawer expenses; owner expenses never touch the drawer.
  const drawerExpenses = expenses.filter((e) => e.source === 'drawer')
  const totals = periodTotals(transactions, drawerExpenses, today)
  const drawer = drawerExpected(transactions, drawerExpenses, today)
  const voidCount = transactions.filter(
    (t) => t.status === 'void' && isInRange(new Date(t.occurredAt), today),
  ).length

  const methods = [
    { label: 'Tunai', value: totals.incomeByMethod.cash, icon: BanknoteIcon },
    { label: 'QRIS', value: totals.incomeByMethod.qris, icon: QrCodeIcon },
    { label: 'Transfer', value: totals.incomeByMethod.transfer, icon: LandmarkIcon },
  ]

  return (
    <div className="mx-auto h-full max-w-3xl space-y-4 overflow-y-auto p-3 md:p-6">
      <div>
        <h1 className="text-xl font-semibold">Ringkasan hari ini</h1>
        <p className="text-sm text-muted-foreground">{formatLongDate(new Date(), tz)}</p>
      </div>

      <Card className="border-primary/30 bg-primary text-primary-foreground">
        <CardContent className="space-y-1">
          <p className="text-sm opacity-85">Uang laci seharusnya</p>
          <p className="text-4xl font-bold tracking-tight tabular-nums">{formatRupiah(drawer)}</p>
          <p className="text-xs opacity-85">
            Tunai {formatRupiah(totals.incomeByMethod.cash)} − pengeluaran laci{' '}
            {formatRupiah(totals.drawerExpense)}
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-3">
        {methods.map(({ label, value, icon: Icon }) => (
          <Card key={label} className="py-4">
            <CardContent className="flex items-center gap-3 px-4">
              <span className="flex size-10 items-center justify-center rounded-lg bg-muted">
                <Icon className="size-5" aria-hidden />
              </span>
              <div>
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="text-lg font-semibold tabular-nums">{formatRupiah(value)}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="py-4">
        <CardContent className="grid grid-cols-2 gap-4 px-4 sm:grid-cols-4">
          <Stat label="Total pemasukan" value={formatRupiah(totals.income)} />
          <Stat label="Jumlah transaksi" value={String(totals.transactionCount)} />
          <Stat label="Pengeluaran laci" value={formatRupiah(totals.drawerExpense)} />
          <Stat label="Transaksi dibatalkan" value={String(voidCount)} />
        </CardContent>
      </Card>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold tabular-nums">{value}</p>
    </div>
  )
}
