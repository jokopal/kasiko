import { ImageUpIcon, RotateCcwIcon } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { BusinessLogo } from '@/components/business-logo'
import { RupiahInput } from '@/components/rupiah-input'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { OwnerPage } from '@/features/owner/page'
import { saveBusiness } from '@/features/preview/actions'
import { useBusinessData } from '@/features/preview/selectors'
import { resetPreviewState } from '@/features/preview/store'
import { formatReceipt } from '@/features/receipt/format-receipt'
import { ReceiptPaper } from '@/features/receipt/receipt-paper'
import { isValidReceiptPrefix } from '@/features/receipt/receipt-number'
import { BUSINESS_TIMEZONES, yymmdd } from '@/lib/datetime'
import type { Business, Transaction } from '@/lib/types'
import { isHexColor, readableForeground } from './brand'

export function SettingsPage() {
  const { business } = useBusinessData()
  // Re-mount the form when the owner switches business so fields never mix.
  return <SettingsForm key={business.id} business={business} />
}

function SettingsForm({ business }: { business: Business }) {
  const [draft, setDraft] = useState(business)
  const [error, setError] = useState<string | null>(null)
  const set = <K extends keyof Business>(key: K, value: Business[K]) =>
    setDraft((current) => ({ ...current, [key]: value }))
  const previewColor = isHexColor(draft.primaryColor) ? draft.primaryColor : business.primaryColor

  function submit(event: FormEvent) {
    event.preventDefault()
    const result = saveBusiness(draft)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setError(null)
    toast.success('Pengaturan usaha disimpan')
  }

  function resetPreview() {
    if (!window.confirm('Kembalikan semua data pratinjau ke kondisi awal?')) return
    resetPreviewState()
    toast.success('Data pratinjau dikembalikan')
  }

  return (
    <OwnerPage title="Pengaturan Usaha" description="Identitas usaha di layar kasir dan nota.">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <form onSubmit={submit}>
          <Card>
            <CardHeader>
              <CardTitle>Identitas & brand</CardTitle>
            </CardHeader>
            <CardContent>
              <FieldGroup>
                <div className="flex items-center gap-4">
                  <BusinessLogo
                    business={{ ...draft, primaryColor: previewColor }}
                    className="size-16 text-xl"
                  />
                  <div className="space-y-1">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() =>
                        toast.info('Upload logo aktif setelah Supabase Storage tersambung')
                      }
                    >
                      <ImageUpIcon />
                      Upload logo
                    </Button>
                    <p className="text-xs text-muted-foreground">PNG/JPG persegi, maks. 1 MB</p>
                  </div>
                </div>
                <Field>
                  <FieldLabel htmlFor="name">Nama usaha</FieldLabel>
                  <Input
                    id="name"
                    value={draft.name}
                    onChange={(e) => set('name', e.target.value)}
                  />
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field>
                    <FieldLabel htmlFor="phone">Telepon</FieldLabel>
                    <Input
                      id="phone"
                      type="tel"
                      value={draft.phone}
                      onChange={(e) => set('phone', e.target.value)}
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="color">Warna utama</FieldLabel>
                    <div className="flex gap-2">
                      <Input
                        type="color"
                        aria-label="Pilih warna"
                        className="w-12 shrink-0 cursor-pointer p-1"
                        value={previewColor}
                        onChange={(e) => set('primaryColor', e.target.value)}
                      />
                      <Input
                        id="color"
                        value={draft.primaryColor}
                        onChange={(e) => set('primaryColor', e.target.value.trim())}
                        className="font-mono uppercase"
                        maxLength={7}
                      />
                    </div>
                  </Field>
                </div>
                <Field>
                  <FieldLabel htmlFor="address">Alamat</FieldLabel>
                  <Textarea
                    id="address"
                    value={draft.address}
                    onChange={(e) => set('address', e.target.value)}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="footer">Teks penutup nota</FieldLabel>
                  <Input
                    id="footer"
                    value={draft.receiptFooter}
                    onChange={(e) => set('receiptFooter', e.target.value)}
                  />
                </Field>
                <div className="grid gap-4 sm:grid-cols-3">
                  <Field>
                    <FieldLabel htmlFor="prefix">Prefix nota</FieldLabel>
                    <Input
                      id="prefix"
                      value={draft.receiptPrefix}
                      maxLength={6}
                      onChange={(e) => set('receiptPrefix', e.target.value.toUpperCase())}
                      className="font-mono"
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="timezone">Zona waktu</FieldLabel>
                    <Select value={draft.timezone} onValueChange={(v) => set('timezone', v)}>
                      <SelectTrigger id="timezone" className="w-full">
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
                  <Field>
                    <FieldLabel htmlFor="opening">Saldo awal kas</FieldLabel>
                    <RupiahInput
                      id="opening"
                      value={draft.openingCash}
                      onValueChange={(v) => set('openingCash', v ?? 0)}
                    />
                  </Field>
                </div>
                <FieldDescription>
                  Zona waktu menentukan batas &quot;hari ini&quot; untuk rekap dan pembatalan kasir.
                </FieldDescription>
                {error && <FieldError>{error}</FieldError>}
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => setDraft(business)}>
                    Batalkan perubahan
                  </Button>
                  <Button type="submit">Simpan</Button>
                </div>
              </FieldGroup>
            </CardContent>
          </Card>
        </form>

        <div className="space-y-4">
          <Card className="gap-3">
            <CardHeader>
              <CardTitle className="text-base">Pratinjau</CardTitle>
              <CardDescription>Header kasir dan nota</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div
                className="flex items-center gap-3 rounded-lg p-3"
                style={{ backgroundColor: previewColor, color: readableForeground(previewColor) }}
              >
                <BusinessLogo
                  business={{ ...draft, primaryColor: previewColor }}
                  className="ring-2 ring-white/25"
                />
                <div className="min-w-0">
                  <p className="truncate font-semibold">{draft.name || 'Nama usaha'}</p>
                  <p className="text-xs opacity-80">Kasir</p>
                </div>
              </div>
              <ReceiptPreview business={draft} />
            </CardContent>
          </Card>

          <Card className="gap-3">
            <CardHeader>
              <CardTitle className="text-base">Data pratinjau</CardTitle>
              <CardDescription>Kembalikan transaksi contoh ke kondisi awal.</CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="outline" onClick={resetPreview}>
                <RotateCcwIcon />
                Reset data pratinjau
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </OwnerPage>
  )
}

/** Rendered by the real `formatReceipt`, so the preview matches every print channel. */
function ReceiptPreview({ business }: { business: Business }) {
  const prefix = isValidReceiptPrefix(business.receiptPrefix) ? business.receiptPrefix : 'XXX'
  const sample: Transaction = {
    id: 'preview',
    businessId: business.id,
    receiptNo: `${prefix}-${yymmdd(new Date(), business.timezone)}-A0001`,
    occurredAt: new Date().toISOString(),
    plateNumber: 'B 1234 XYZ',
    paymentMethod: 'cash',
    total: 45_000,
    cashReceived: 50_000,
    changeAmount: 5_000,
    status: 'paid',
    voidReason: null,
    voidedAt: null,
    deviceId: 'preview',
    items: [
      {
        id: '1',
        catalogItemId: null,
        nameSnapshot: 'Cuci Mobil Kecil',
        priceSnapshot: 35_000,
        qty: 1,
        lineTotal: 35_000,
      },
      {
        id: '2',
        catalogItemId: null,
        nameSnapshot: 'Semir Ban',
        priceSnapshot: 10_000,
        qty: 1,
        lineTotal: 10_000,
      },
    ],
  }
  return (
    <div className="flex justify-center rounded-lg bg-muted p-3">
      <ReceiptPaper
        lines={formatReceipt(sample, business, 58)}
        paper={58}
        className="max-w-full overflow-x-auto p-3 shadow-sm"
      />
    </div>
  )
}
