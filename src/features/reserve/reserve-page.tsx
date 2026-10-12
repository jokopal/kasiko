import { ArrowDownToLineIcon, ArrowUpFromLineIcon } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { RupiahInput } from '@/components/rupiah-input'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Textarea } from '@/components/ui/textarea'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { OwnerPage } from '@/features/owner/page'
import { addReserveMovement } from '@/features/preview/actions'
import { useBusinessData } from '@/features/preview/selectors'
import { freeCash, reserveBalance } from '@/features/reports/finance'
import { formatDateTime } from '@/lib/datetime'
import { formatRupiah } from '@/lib/money'
import type { ReserveDepositSource, ReserveMovementType } from '@/lib/types'

export function ReservePage() {
  const { business, transactions, expenses, reserveMovements } = useBusinessData()
  const [dialog, setDialog] = useState<ReserveMovementType | null>(null)
  const balance = reserveBalance(reserveMovements)
  const free = freeCash({
    openingCash: business.openingCash,
    transactions,
    expenses,
    reserveMovements,
  })
  const history = [...reserveMovements].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))

  return (
    <OwnerPage
      title="Dana Cadangan"
      description="Dana dingin usaha. Setor dan tarik tidak mengubah profit."
      actions={
        <>
          <Button onClick={() => setDialog('deposit')}>
            <ArrowDownToLineIcon />
            Setor
          </Button>
          <Button variant="outline" onClick={() => setDialog('withdraw')}>
            <ArrowUpFromLineIcon />
            Tarik
          </Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Card className="bg-primary text-primary-foreground">
          <CardContent className="space-y-1">
            <p className="text-sm opacity-85">Saldo cadangan</p>
            <p className="text-3xl font-bold tracking-tight tabular-nums">
              {formatRupiah(balance)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-1">
            <p className="text-sm text-muted-foreground">Kas bebas</p>
            <p className="text-3xl font-bold tracking-tight tabular-nums">{formatRupiah(free)}</p>
            <p className="text-xs text-muted-foreground">
              Saldo awal + pemasukan − pengeluaran − setoran dari kas + penarikan
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Riwayat</CardTitle>
          <CardDescription>
            Setoran dari modal baru owner tidak mengurangi kas bebas.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="divide-y">
            {history.map((m) => (
              <li key={m.id} className="flex items-start gap-3 py-3">
                <span
                  className={
                    m.type === 'deposit'
                      ? 'flex size-9 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-800'
                      : 'flex size-9 shrink-0 items-center justify-center rounded-lg bg-orange-100 text-orange-800'
                  }
                  aria-hidden
                >
                  {m.type === 'deposit' ? (
                    <ArrowDownToLineIcon className="size-4" />
                  ) : (
                    <ArrowUpFromLineIcon className="size-4" />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                    {m.type === 'deposit' ? 'Setor' : 'Tarik'}
                    {m.source && (
                      <Badge variant="outline">
                        {m.source === 'cash' ? 'Dari kas usaha' : 'Modal baru'}
                      </Badge>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatDateTime(new Date(m.occurredAt), business.timezone)}
                    {m.reason && ` · ${m.reason}`}
                  </p>
                </div>
                <p className="font-semibold tabular-nums">
                  {m.type === 'deposit' ? '+' : '−'}
                  {formatRupiah(m.amount)}
                </p>
              </li>
            ))}
            {history.length === 0 && (
              <li className="py-8 text-center text-sm text-muted-foreground">Belum ada riwayat</li>
            )}
          </ul>
        </CardContent>
      </Card>

      <Dialog open={dialog !== null} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent className="sm:max-w-md">
          {dialog && (
            <MovementForm
              type={dialog}
              businessId={business.id}
              balance={balance}
              onDone={() => setDialog(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </OwnerPage>
  )
}

function MovementForm({
  type,
  businessId,
  balance,
  onDone,
}: {
  type: ReserveMovementType
  businessId: string
  balance: number
  onDone: () => void
}) {
  const [amount, setAmount] = useState<number | null>(null)
  const [source, setSource] = useState<ReserveDepositSource>('cash')
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)

  function submit(event: FormEvent) {
    event.preventDefault()
    const result = addReserveMovement({ businessId, type, amount: amount ?? 0, source, reason })
    if (!result.ok) {
      setError(result.error)
      return
    }
    toast.success(type === 'deposit' ? 'Setoran tercatat' : 'Penarikan tercatat')
    onDone()
  }

  return (
    <form onSubmit={submit} className="grid gap-5">
      <DialogHeader>
        <DialogTitle>
          {type === 'deposit' ? 'Setor ke cadangan' : 'Tarik dari cadangan'}
        </DialogTitle>
        <DialogDescription>
          {type === 'deposit'
            ? 'Pilih asal uangnya: dari kas usaha atau modal baru owner.'
            : `Saldo tersedia ${formatRupiah(balance)}. Uang kembali ke kas bebas.`}
        </DialogDescription>
      </DialogHeader>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="reserve-amount">Nominal</FieldLabel>
          <RupiahInput
            id="reserve-amount"
            value={amount}
            onValueChange={setAmount}
            className="h-11"
            autoFocus
          />
        </Field>
        {type === 'deposit' ? (
          <Field>
            <FieldLabel>Sumber</FieldLabel>
            <ToggleGroup
              type="single"
              variant="outline"
              value={source}
              onValueChange={(value) => value && setSource(value as ReserveDepositSource)}
              className="grid w-full grid-cols-2"
            >
              <ToggleGroupItem value="cash" className="h-10">
                Kas usaha
              </ToggleGroupItem>
              <ToggleGroupItem value="capital" className="h-10">
                Modal baru
              </ToggleGroupItem>
            </ToggleGroup>
          </Field>
        ) : (
          <Field>
            <FieldLabel htmlFor="reserve-reason">Alasan (wajib)</FieldLabel>
            <Textarea
              id="reserve-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Contoh: perbaikan mesin steam"
            />
          </Field>
        )}
        {error && <FieldError>{error}</FieldError>}
      </FieldGroup>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Batal
        </Button>
        <Button type="submit">Simpan</Button>
      </DialogFooter>
    </form>
  )
}
