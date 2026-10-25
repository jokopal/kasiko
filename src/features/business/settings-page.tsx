import { CheckIcon, ImageUpIcon, Trash2Icon, TriangleAlertIcon } from 'lucide-react'
import { useRef, useState, type FormEvent } from 'react'
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
import { removeLogo, saveBusiness, uploadLogo } from '@/features/data/owner-actions'
import { useOwnerData } from '@/features/data/owner-data'
import { formatReceipt } from '@/features/receipt/format-receipt'
import { ReceiptPaper } from '@/features/receipt/receipt-paper'
import { isValidReceiptPrefix } from '@/features/receipt/receipt-number'
import { BUSINESS_TIMEZONES, yymmdd } from '@/lib/datetime'
import type { Business, Transaction } from '@/lib/types'
import { brandContrastChecks, isHexColor, readableForeground } from './brand'
import { TemplateCard } from './template-card'

export function SettingsPage() {
  const { business, config } = useOwnerData()
  // Re-mount the form when the owner switches business so fields never mix.
  return <SettingsForm key={business.id} business={business} templateId={config.templateId} />
}

function SettingsForm({ business, templateId }: { business: Business; templateId: string }) {
  const [draft, setDraft] = useState(business)
  const [error, setError] = useState<string | null>(null)
  const set = <K extends keyof Business>(key: K, value: Business[K]) =>
    setDraft((current) => ({ ...current, [key]: value }))
  const previewColor = isHexColor(draft.primaryColor) ? draft.primaryColor : business.primaryColor

  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (saving) return
    setSaving(true)
    const result = await saveBusiness(draft)
    setSaving(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setError(null)
    toast.success('Pengaturan usaha disimpan')
  }

  async function onLogo(file: File | undefined) {
    if (!file) return
    setUploading(true)
    const result = await uploadLogo(business, file)
    setUploading(false)
    if (fileInput.current) fileInput.current.value = ''
    if (result.ok) toast.success('Logo diperbarui')
    else toast.error(result.error)
  }

  return (
    <OwnerPage title="Pengaturan Usaha" description="Identitas usaha di layar kasir dan nota.">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <form onSubmit={(event) => void submit(event)}>
          <Card>
            <CardHeader>
              <CardTitle>Identitas & brand</CardTitle>
            </CardHeader>
            <CardContent>
              <FieldGroup>
                <div className="flex items-center gap-4">
                  <BusinessLogo
                    business={{ ...draft, logoUrl: business.logoUrl, primaryColor: previewColor }}
                    className="size-16 text-xl"
                  />
                  <div className="space-y-1">
                    <input
                      ref={fileInput}
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      className="sr-only"
                      id="logo-file"
                      onChange={(event) => void onLogo(event.target.files?.[0])}
                    />
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        disabled={uploading}
                        onClick={() => fileInput.current?.click()}
                      >
                        <ImageUpIcon />
                        {uploading ? 'Mengunggah…' : 'Upload logo'}
                      </Button>
                      {business.logoUrl && (
                        <Button
                          type="button"
                          variant="ghost"
                          className="text-destructive"
                          onClick={() =>
                            void removeLogo(business).then((result) => {
                              if (!result.ok) toast.error(result.error)
                            })
                          }
                        >
                          <Trash2Icon />
                          Hapus
                        </Button>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      PNG/JPG/WebP persegi, maks. 1 MB
                    </p>
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
                <ContrastReport color={previewColor} />
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
                  <Button type="submit" disabled={saving}>
                    Simpan
                  </Button>
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

          <TemplateCard businessId={business.id} templateId={templateId} />
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
    subtotal: 45_000,
    discountId: null,
    discountName: null,
    discountType: null,
    discountValue: null,
    discountAmount: 0,
    total: 45_000,
    cashReceived: 50_000,
    changeAmount: 5_000,
    status: 'paid',
    voidReason: null,
    voidedAt: null,
    deviceId: 'preview',
    receivedAt: null,
    orderId: null,
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

/** Live WCAG 2.2 AA report for the brand color, per way the app uses it. */
function ContrastReport({ color }: { color: string }) {
  const checks = brandContrastChecks(color)
  return (
    <ul className="grid gap-1 rounded-lg border p-3 text-xs" aria-label="Kontras warna (WCAG AA)">
      {checks.map((check) => (
        <li key={check.label} className="flex items-center gap-2">
          {check.pass ? (
            <CheckIcon className="size-3.5 shrink-0 text-emerald-700" aria-hidden />
          ) : (
            <TriangleAlertIcon className="size-3.5 shrink-0 text-amber-600" aria-hidden />
          )}
          <span className="min-w-0 flex-1">
            {check.label}
            {check.note && <span className="block text-muted-foreground">{check.note}</span>}
          </span>
          <span className="tabular-nums">
            {check.ratio.toFixed(1)}:1{' '}
            <span className={check.pass ? 'text-muted-foreground' : 'font-medium text-amber-700'}>
              {check.pass ? 'lolos' : `perlu ≥ ${check.required}:1`}
            </span>
          </span>
        </li>
      ))}
    </ul>
  )
}
