import { ArrowDownIcon, ArrowUpIcon, PencilIcon, PercentIcon, PlusIcon } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { ChoiceCards } from '@/components/choice-cards'
import { RupiahInput } from '@/components/rupiah-input'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Field, FieldError, FieldGroup, FieldLabel, FieldTitle } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { notify } from '@/features/data/notify'
import { moveDiscount, saveDiscount, setActive } from '@/features/data/owner-actions'
import { useOwnerData } from '@/features/data/owner-data'
import { OwnerPage } from '@/features/owner/page'
import { describeDiscount } from '@/features/pos/discount'
import { DISCOUNT_TYPE_LABEL, type Discount, type DiscountType } from '@/lib/types'
import { cn } from '@/lib/utils'

type Draft = { id?: string; name: string; type: DiscountType; value: number | null }

/** Decision #35: the owner defines discount presets and switches them on for the cashier. */
export function DiscountsPage() {
  const { business, discounts } = useOwnerData()
  const [draft, setDraft] = useState<Draft | null>(null)

  return (
    <OwnerPage
      title="Diskon"
      description="Kasir hanya bisa memakai diskon yang aktif di sini. Potongan dihitung ulang server dan tidak pernah melebihi total."
      actions={
        <Button onClick={() => setDraft({ name: '', type: 'percent', value: null })}>
          <PlusIcon />
          Tambah diskon
        </Button>
      }
    >
      <Card className="max-w-2xl gap-0 py-0">
        <CardHeader className="border-b py-3">
          <CardTitle className="text-base">Preset diskon</CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          <ul className="divide-y">
            {discounts.map((discount, index) => (
              <DiscountRow
                key={discount.id}
                discount={discount}
                isFirst={index === 0}
                isLast={index === discounts.length - 1}
                onEdit={() =>
                  setDraft({
                    id: discount.id,
                    name: discount.name,
                    type: discount.type,
                    value: discount.value,
                  })
                }
                onMove={(direction) =>
                  notify(moveDiscount(business.id, discounts, discount.id, direction))
                }
                onToggle={(checked) =>
                  notify(
                    setActive(business.id, 'discounts', discount.id, checked),
                    checked ? `${discount.name} aktif di kasir` : `${discount.name} dimatikan`,
                  )
                }
              />
            ))}
            {discounts.length === 0 && (
              <li className="flex flex-col items-center gap-2 px-4 py-10 text-center text-sm text-muted-foreground">
                <PercentIcon className="size-8 opacity-40" aria-hidden />
                Belum ada diskon. Tanpa diskon aktif, kasir tidak melihat pilihan diskon sama
                sekali.
              </li>
            )}
          </ul>
        </CardContent>
      </Card>

      <Dialog open={draft !== null} onOpenChange={(open) => !open && setDraft(null)}>
        <DialogContent className="sm:max-w-md">
          {draft && (
            <DiscountForm
              draft={draft}
              businessId={business.id}
              siblings={discounts}
              onDone={() => setDraft(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </OwnerPage>
  )
}

function DiscountRow({
  discount,
  isFirst,
  isLast,
  onEdit,
  onMove,
  onToggle,
}: {
  discount: Discount
  isFirst: boolean
  isLast: boolean
  onEdit: () => void
  onMove: (direction: -1 | 1) => void
  onToggle: (checked: boolean) => void
}) {
  return (
    <li className="flex items-center gap-2 px-3 py-2 sm:px-4">
      <div className={cn('min-w-0 flex-1', !discount.isActive && 'text-muted-foreground')}>
        <p className="truncate text-sm font-medium">{discount.name}</p>
        <p className="text-sm tabular-nums">
          {describeDiscount(discount)} · {DISCOUNT_TYPE_LABEL[discount.type]}
        </p>
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="size-9"
        disabled={isFirst}
        onClick={() => onMove(-1)}
        aria-label={`Naikkan ${discount.name}`}
      >
        <ArrowUpIcon />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="size-9"
        disabled={isLast}
        onClick={() => onMove(1)}
        aria-label={`Turunkan ${discount.name}`}
      >
        <ArrowDownIcon />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="size-9"
        onClick={onEdit}
        aria-label={`Ubah ${discount.name}`}
      >
        <PencilIcon />
      </Button>
      <Switch
        checked={discount.isActive}
        onCheckedChange={onToggle}
        aria-label={`${discount.name} aktif`}
      />
    </li>
  )
}

function DiscountForm({
  draft,
  businessId,
  siblings,
  onDone,
}: {
  draft: Draft
  businessId: string
  siblings: Discount[]
  onDone: () => void
}) {
  const [name, setName] = useState(draft.name)
  const [type, setType] = useState<DiscountType>(draft.type)
  const [value, setValue] = useState<number | null>(draft.value)
  const [error, setError] = useState<string | null>(null)

  async function submit(event: FormEvent) {
    event.preventDefault()
    const result = await saveDiscount({
      id: draft.id,
      businessId,
      name,
      type,
      value: value ?? 0,
      siblings,
    })
    if (!result.ok) {
      setError(result.error)
      return
    }
    toast.success(draft.id ? 'Diskon diperbarui' : 'Diskon ditambahkan')
    onDone()
  }

  return (
    <form onSubmit={(event) => void submit(event)} className="grid gap-5">
      <DialogHeader>
        <DialogTitle>{draft.id ? 'Ubah diskon' : 'Tambah diskon'}</DialogTitle>
      </DialogHeader>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="discount-name">Nama</FieldLabel>
          <Input
            id="discount-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Member 10%"
            autoFocus
          />
        </Field>
        <Field>
          <FieldTitle>Jenis</FieldTitle>
          <ChoiceCards
            name="discount-type"
            legend="Jenis diskon"
            value={type}
            onChange={(next) => {
              setType(next)
              setValue(null)
            }}
            className="sm:grid-cols-2"
            choices={[
              { value: 'percent', title: 'Persen', description: 'Mis. 10% dari subtotal' },
              { value: 'amount', title: 'Nominal', description: 'Mis. potong Rp 5.000' },
            ]}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="discount-value">
            {type === 'percent' ? 'Persen (1–100)' : 'Potongan'}
          </FieldLabel>
          {type === 'percent' ? (
            <Input
              id="discount-value"
              type="number"
              inputMode="numeric"
              min={1}
              max={100}
              value={value ?? ''}
              onChange={(e) => setValue(e.target.value === '' ? null : Number(e.target.value))}
            />
          ) : (
            <RupiahInput id="discount-value" value={value} onValueChange={setValue} />
          )}
        </Field>
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
