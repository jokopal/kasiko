import { InboxIcon, SnowflakeIcon, WalletIcon, type LucideIcon } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { RupiahInput } from '@/components/rupiah-input'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { saveOpeningBalances, type OpeningBalances } from '@/features/data/owner-actions'
import { formatRupiah } from '@/lib/money'
import type { Business } from '@/lib/types'
import { cn } from '@/lib/utils'

// Opening balances (decision #37): the daily drawer float, usable opening cash and
// "uang dingin" (the reserve's opening balance). None of them changes profit.

interface BalanceInfo {
  key: keyof OpeningBalances
  label: string
  short: string
  hint: string
  icon: LucideIcon
}

const BALANCES: BalanceInfo[] = [
  {
    key: 'drawerFloat',
    label: 'Modal laci (setiap hari)',
    short: 'Modal laci / hari',
    hint: 'Uang kembalian yang diisi ke laci tiap pagi. Ikut dihitung di "uang laci seharusnya" kasir; sisanya disetor ke owner.',
    icon: InboxIcon,
  },
  {
    key: 'openingCash',
    label: 'Saldo awal kas',
    short: 'Saldo awal kas',
    hint: 'Uang usaha yang siap dipakai saat mulai memakai Kasiko, termasuk modal laci. Titik awal kas bebas.',
    icon: WalletIcon,
  },
  {
    key: 'openingReserve',
    label: 'Uang dingin',
    short: 'Uang dingin',
    hint: 'Simpanan yang tidak dipakai operasional. Menjadi saldo awal Dana Cadangan dan tidak dihitung sebagai kas bebas.',
    icon: SnowflakeIcon,
  },
]

const balancesOf = (business: Business): OpeningBalances => ({
  drawerFloat: business.drawerFloat,
  openingCash: business.openingCash,
  openingReserve: business.openingReserve,
})

/** A compact strip of the three balances with an "Atur" button; a prompt when unset. */
export function OpeningBalancesCard({ business }: { business: Business }) {
  const [open, setOpen] = useState(false)
  const balances = balancesOf(business)
  const unset = BALANCES.every(({ key }) => balances[key] === 0)

  return (
    <Card className={cn('gap-0 py-0', unset && 'border-dashed')}>
      <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
        {unset ? (
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">Modal & uang dingin belum diatur</p>
            <p className="text-sm text-muted-foreground">
              Isi modal laci agar &quot;uang laci seharusnya&quot; di kasir benar, dan uang dingin
              sebagai saldo awal Dana Cadangan.
            </p>
          </div>
        ) : (
          <dl className="grid min-w-0 flex-1 grid-cols-1 gap-3 sm:grid-cols-3">
            {BALANCES.map(({ key, short, icon: Icon }) => (
              <div key={key} className="flex min-w-0 items-center gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                  <Icon className="size-4" aria-hidden />
                </span>
                <div className="min-w-0">
                  <dt className="truncate text-xs text-muted-foreground">{short}</dt>
                  <dd className="truncate font-semibold tabular-nums">
                    {formatRupiah(balances[key])}
                  </dd>
                </div>
              </div>
            ))}
          </dl>
        )}
        <Button
          variant={unset ? 'default' : 'outline'}
          className="shrink-0"
          onClick={() => setOpen(true)}
        >
          {unset ? 'Atur sekarang' : 'Atur modal'}
        </Button>
      </CardContent>
      <OpeningBalancesDialog business={business} open={open} onOpenChange={setOpen} />
    </Card>
  )
}

export function OpeningBalancesDialog({
  business,
  open,
  onOpenChange,
}: {
  business: Business
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Modal & uang dingin</DialogTitle>
          <DialogDescription>
            Uang awal usaha. Tidak mengubah profit; setiap perubahan tercatat di jejak audit.
          </DialogDescription>
        </DialogHeader>
        {open && <BalancesForm business={business} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  )
}

function BalancesForm({ business, onDone }: { business: Business; onDone: () => void }) {
  const [draft, setDraft] = useState(() => balancesOf(business))
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (saving) return
    setSaving(true)
    const result = await saveOpeningBalances(business.id, draft)
    setSaving(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    toast.success('Modal & uang dingin disimpan')
    onDone()
  }

  return (
    <form onSubmit={(event) => void submit(event)} className="grid gap-5">
      <FieldGroup>
        {BALANCES.map(({ key, label, hint, icon: Icon }, index) => (
          <Field key={key}>
            <FieldLabel htmlFor={`balance-${key}`} className="gap-2">
              <Icon className="size-4 text-muted-foreground" aria-hidden />
              {label}
            </FieldLabel>
            <RupiahInput
              id={`balance-${key}`}
              value={draft[key]}
              onValueChange={(value) => {
                setDraft((d) => ({ ...d, [key]: value ?? 0 }))
                setError(null)
              }}
              className="h-11 text-base"
              autoFocus={index === 0}
            />
            <FieldDescription>{hint}</FieldDescription>
          </Field>
        ))}
        {error && <FieldError>{error}</FieldError>}
      </FieldGroup>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Batal
        </Button>
        <Button type="submit" disabled={saving}>
          Simpan
        </Button>
      </DialogFooter>
    </form>
  )
}
