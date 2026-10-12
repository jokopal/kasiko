import { BluetoothIcon, LoaderCircleIcon, Unlink2Icon } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import type { Business, Transaction } from '@/lib/types'
import { forgetPrinter, isBluetoothSupported, pairPrinter, printBytes } from './bluetooth-printer'
import { encodeReceipt } from './escpos'
import { formatReceipt, type PaperWidth } from './format-receipt'
import { printerSettings } from './printer-settings'

function testTransaction(business: Business): Transaction {
  return {
    id: 'test',
    businessId: business.id,
    receiptNo: `${business.receiptPrefix}-TES-A0000`,
    occurredAt: new Date().toISOString(),
    plateNumber: null,
    paymentMethod: 'cash',
    total: 0,
    cashReceived: 0,
    changeAmount: 0,
    status: 'paid',
    voidReason: null,
    voidedAt: null,
    deviceId: 'test',
    items: [
      {
        id: 'test',
        catalogItemId: null,
        nameSnapshot: 'Tes cetak printer',
        priceSnapshot: 0,
        qty: 1,
        lineTotal: 0,
      },
    ],
  }
}

/** Per-device printer setup: paper width and the paired Bluetooth printer. */
export function PrinterSettingsDialog({
  open,
  onOpenChange,
  business,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  business: Business
}) {
  const settings = printerSettings.useValue()
  const [busy, setBusy] = useState(false)
  const supported = isBluetoothSupported()

  async function run(task: () => Promise<unknown>, success: string) {
    setBusy(true)
    try {
      await task()
      toast.success(success)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Gagal')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Pengaturan printer</DialogTitle>
          <DialogDescription>Disimpan di perangkat ini saja.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-5">
          <Field>
            <FieldLabel>Lebar kertas</FieldLabel>
            <ToggleGroup
              type="single"
              variant="outline"
              value={String(settings.paperWidth)}
              onValueChange={(value) =>
                value && printerSettings.set({ paperWidth: Number(value) as PaperWidth })
              }
              className="grid w-full grid-cols-2"
            >
              <ToggleGroupItem value="58" className="h-11">
                58 mm
              </ToggleGroupItem>
              <ToggleGroupItem value="80" className="h-11">
                80 mm
              </ToggleGroupItem>
            </ToggleGroup>
            <FieldDescription>
              {settings.paperWidth === 58 ? '32 karakter per baris' : '48 karakter per baris'}
            </FieldDescription>
          </Field>

          {supported ? (
            <Field>
              <FieldLabel>Printer Bluetooth</FieldLabel>
              <div className="flex items-center gap-3 rounded-lg border p-3">
                <BluetoothIcon className="size-5 text-muted-foreground" aria-hidden />
                <span className="min-w-0 flex-1 truncate text-sm">
                  {settings.deviceName ?? 'Belum ada printer'}
                </span>
                {settings.deviceName && (
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Lupakan printer"
                    onClick={() => {
                      forgetPrinter()
                      toast.success('Printer dilupakan')
                    }}
                  >
                    <Unlink2Icon />
                  </Button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => void run(pairPrinter, 'Printer terhubung')}
                >
                  {busy && <LoaderCircleIcon className="animate-spin" />}
                  {settings.deviceName ? 'Ganti printer' : 'Hubungkan'}
                </Button>
                <Button
                  disabled={busy || !settings.deviceName}
                  onClick={() =>
                    void run(
                      () =>
                        printBytes(
                          encodeReceipt(
                            formatReceipt(testTransaction(business), business, settings.paperWidth),
                          ),
                        ),
                      'Tes cetak terkirim',
                    )
                  }
                >
                  Tes cetak
                </Button>
              </div>
              <FieldDescription>
                Printer harus mendukung Bluetooth Low Energy (BLE). Nyalakan printer, lalu pilih
                namanya di daftar yang muncul.
              </FieldDescription>
            </Field>
          ) : (
            <Alert>
              <AlertTitle>Bluetooth tidak tersedia</AlertTitle>
              <AlertDescription>
                Browser ini tidak mendukung cetak Bluetooth langsung (misalnya iPhone/iPad). Gunakan
                tombol Print atau WhatsApp. Di Android gunakan Chrome.
              </AlertDescription>
            </Alert>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
