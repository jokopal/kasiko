import { useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { ChoiceCards } from '@/components/choice-cards'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Field, FieldError, FieldGroup, FieldLabel, FieldTitle } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { createBusiness } from '@/features/data/owner-actions'
import { suggestPrefix } from '@/features/receipt/receipt-number'
import { BUSINESS_TIMEZONES } from '@/lib/datetime'
import { BUSINESS_TEMPLATES } from './templates'

/** Creates a business from a template; everything stays editable afterwards. */
export function AddBusinessDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Tambah usaha</DialogTitle>
          <DialogDescription>
            Template mengisi katalog, kategori pengeluaran, dan tata letak dashboard awal. Semuanya
            bisa diubah setelahnya.
          </DialogDescription>
        </DialogHeader>
        {open && <AddBusinessForm onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  )
}

function AddBusinessForm({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState('')
  const [prefix, setPrefix] = useState('')
  const [color, setColor] = useState('#0f766e')
  const [timezone, setTimezone] = useState<string>('Asia/Jakarta')
  const [templateId, setTemplateId] = useState(BUSINESS_TEMPLATES[0]?.id ?? 'umum')
  const [error, setError] = useState<string | null>(null)

  async function submit(event: FormEvent) {
    event.preventDefault()
    const result = await createBusiness({
      name,
      receiptPrefix: prefix,
      primaryColor: color,
      timezone,
      templateId,
    })
    if (!result.ok) {
      setError(result.error)
      return
    }
    toast.success(`${result.value.name} dibuat`)
    onDone()
  }

  return (
    <form onSubmit={(event) => void submit(event)} className="grid gap-5">
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="new-business-name">Nama usaha</FieldLabel>
          <Input
            id="new-business-name"
            value={name}
            onChange={(e) => {
              setName(e.target.value)
              // Suggest a prefix from the name until the owner types one.
              if (prefix === '' || prefix === suggestPrefix(name)) {
                setPrefix(suggestPrefix(e.target.value))
              }
            }}
            autoFocus
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field>
            <FieldLabel htmlFor="new-business-prefix">Prefix nota</FieldLabel>
            <Input
              id="new-business-prefix"
              value={prefix}
              maxLength={6}
              onChange={(e) => setPrefix(e.target.value.toUpperCase())}
              className="font-mono"
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="new-business-color">Warna utama</FieldLabel>
            <Input
              id="new-business-color"
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="cursor-pointer p-1"
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="new-business-tz">Zona waktu</FieldLabel>
            <Select value={timezone} onValueChange={setTimezone}>
              <SelectTrigger id="new-business-tz" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {BUSINESS_TIMEZONES.map((tz) => (
                  <SelectItem key={tz.value} value={tz.value}>
                    {tz.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>
        <Field>
          <FieldTitle>Template</FieldTitle>
          <ChoiceCards
            name="business-template"
            legend="Template usaha"
            value={templateId}
            onChange={setTemplateId}
            choices={BUSINESS_TEMPLATES.map((t) => ({
              value: t.id,
              title: t.name,
              description: `${t.description} ${t.expenseCategories.length} kategori pengeluaran.`,
            }))}
          />
        </Field>
        {error && <FieldError>{error}</FieldError>}
      </FieldGroup>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Batal
        </Button>
        <Button type="submit">Buat usaha</Button>
      </DialogFooter>
    </form>
  )
}
