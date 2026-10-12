import { BluetoothIcon, LoaderCircleIcon, MessageCircleIcon, PrinterIcon } from 'lucide-react'
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
import { isBluetoothSupported, printBytes } from './bluetooth-printer'
import { printInBrowser } from './browser-print'
import { encodeReceipt } from './escpos'
import { formatReceipt, receiptToText, type ReceiptBusiness } from './format-receipt'
import { printerSettings } from './printer-settings'
import { normalizeWhatsAppNumber, whatsAppReceiptMessage, whatsAppUrl } from './whatsapp'

/** Bluetooth / browser print / WhatsApp for one transaction. Works offline too. */
export function ReceiptActions({
  transaction,
  business,
}: {
  transaction: Transaction
  business: ReceiptBusiness
}) {
  const { paperWidth } = printerSettings.useValue()
  const [printing, setPrinting] = useState(false)
  const [whatsAppOpen, setWhatsAppOpen] = useState(false)
  const hasBluetooth = isBluetoothSupported()
  const lines = () => formatReceipt(transaction, business, paperWidth)

  async function printBluetooth() {
    setPrinting(true)
    try {
      await printBytes(encodeReceipt(lines()))
      toast.success('Nota dicetak')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Gagal mencetak')
    } finally {
      setPrinting(false)
    }
  }

  return (
    <>
      <div className={cn('grid gap-2', hasBluetooth ? 'grid-cols-3' : 'grid-cols-2')}>
        {hasBluetooth && (
          <Button
            variant="outline"
            className="h-14 flex-col gap-1 text-xs"
            disabled={printing}
            onClick={() => void printBluetooth()}
          >
            {printing ? (
              <LoaderCircleIcon className="size-5 animate-spin" />
            ) : (
              <BluetoothIcon className="size-5" />
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
