import {
  BluetoothIcon,
  LoaderCircleIcon,
  MessageCircleIcon,
  PrinterIcon,
  UsbIcon,
} from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import type { Transaction } from '@/lib/types'
import { cn } from '@/lib/utils'
import { printInBrowser } from './browser-print'
import { encodeReceipt } from './escpos'
import { formatReceipt, receiptToText, type ReceiptBusiness } from './format-receipt'
import { canPrintDirectly, printDirect } from './printer'
import { PrinterNotSetUpError } from './printer-error'
import { printerSettings } from './printer-settings'
import { openPrinterSetup } from './printer-setup'
import { normalizeWhatsAppNumber, whatsAppReceiptMessage, whatsAppUrl } from './whatsapp'

/** Direct print (USB/Bluetooth/RawBT) / browser print / WhatsApp. Works offline too. */
export function ReceiptActions({
  transaction,
  business,
}: {
  transaction: Transaction
  business: ReceiptBusiness
}) {
  const { paperWidth, method } = printerSettings.useValue()
  const [printing, setPrinting] = useState(false)
  const [whatsAppOpen, setWhatsAppOpen] = useState(false)
  const direct = canPrintDirectly()
  const lines = () => formatReceipt(transaction, business, paperWidth)
  const DirectIcon = method === 'usb' ? UsbIcon : BluetoothIcon

  async function printNow() {
    // No printer yet: walk the cashier through the setup instead of failing.
    if (!method) {
      openPrinterSetup()
      return
    }
    setPrinting(true)
    try {
      await printDirect(encodeReceipt(lines()))
      // RawBT prints in its own app; Kasiko cannot tell whether it worked.
      if (method !== 'rawbt') toast.success('Nota dicetak')
    } catch (error) {
      if (error instanceof PrinterNotSetUpError) openPrinterSetup()
      else {
        toast.error(error instanceof Error ? error.message : 'Gagal mencetak', {
          action: { label: 'Atur printer', onClick: openPrinterSetup },
        })
      }
    } finally {
      setPrinting(false)
    }
  }

  return (
    <>
      <div className={cn('grid gap-2', direct ? 'grid-cols-3' : 'grid-cols-2')}>
        {direct && (
          <Button
            variant="outline"
            className="h-14 flex-col gap-1 text-xs"
            disabled={printing}
            onClick={() => void printNow()}
          >
            {printing ? (
              <LoaderCircleIcon className="size-5 animate-spin" />
            ) : (
              <DirectIcon className="size-5" />
            )}
            Cetak
          </Button>
        )}
        <Button
          variant="outline"
          className="h-14 flex-col gap-1 text-xs"
          onClick={() => void printInBrowser({ lines: lines(), paper: paperWidth })}
        >
          <PrinterIcon className="size-5" />
          Print
        </Button>
        <Button
          variant="outline"
          className="h-14 flex-col gap-1 text-xs"
          onClick={() => setWhatsAppOpen(true)}
        >
          <MessageCircleIcon className="size-5" />
          WhatsApp
        </Button>
      </div>
      <WhatsAppDialog
        open={whatsAppOpen}
        onOpenChange={setWhatsAppOpen}
        message={() =>
          whatsAppReceiptMessage(receiptToText(formatReceipt(transaction, business, 58), 58))
        }
      />
    </>
  )
}

function WhatsAppDialog({
  open,
  onOpenChange,
  message,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  message: () => string
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Kirim nota via WhatsApp</DialogTitle>
          <DialogDescription>
            Nomor hanya dipakai untuk membuka WhatsApp, tidak disimpan.
          </DialogDescription>
        </DialogHeader>
        {open && <WhatsAppForm message={message} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  )
}

function WhatsAppForm({ message, onDone }: { message: () => string; onDone: () => void }) {
  const [phone, setPhone] = useState('')
  const [error, setError] = useState<string | null>(null)

  function submit(event: FormEvent) {
    event.preventDefault()
    const normalized = normalizeWhatsAppNumber(phone)
    if (!normalized) {
      setError('Nomor WhatsApp tidak valid. Contoh: 0812 3456 7890')
      return
    }
    window.open(whatsAppUrl(normalized, message()), '_blank', 'noopener,noreferrer')
    onDone()
  }

  return (
    <form onSubmit={submit} className="grid gap-5">
      <Field data-invalid={error !== null}>
        <FieldLabel htmlFor="wa-number">Nomor WhatsApp pelanggan</FieldLabel>
        <Input
          id="wa-number"
          type="tel"
          inputMode="tel"
          autoComplete="off"
          placeholder="0812 3456 7890"
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
          className="h-11 text-lg"
          autoFocus
          aria-invalid={error !== null}
        />
        {error ? (
          <FieldError>{error}</FieldError>
        ) : (
          <FieldDescription>Awalan 08 atau +62</FieldDescription>
        )}
      </Field>
      <DialogFooter>
        <Button type="button" variant="outline" size="lg" onClick={onDone}>
          Batal
        </Button>
        <Button type="submit" size="lg">
          <MessageCircleIcon />
          Buka WhatsApp
        </Button>
      </DialogFooter>
    </form>
  )
}
