import type { Business, Transaction } from '@/lib/types'
import { isBluetoothSupported, printBytes as printBle, forgetPrinter } from './bluetooth-printer'
import { PrinterNotSetUpError } from './printer-error'
import { usePrinterLink, type PrinterLink } from './printer-link'
import {
  PRINTER_DEFAULTS,
  printerSettings,
  type PrinterSettings,
  type PrintMethod,
} from './printer-settings'
import { isAndroid, printViaRawbt } from './rawbt'
import { forgetUsbPrinter, isUsbSupported, printUsb } from './usb-printer'

// One "Cetak" for every way a printer can be reached (decision #42). The cashier sets the
// printer up once; each receipt then goes through the saved method.

export const PRINT_METHOD_LABEL: Record<PrintMethod, string> = {
  usb: 'Kabel USB',
  ble: 'Bluetooth',
  rawbt: 'Bluetooth klasik (RawBT)',
}

export function supportedMethods(): Record<PrintMethod, boolean> {
  return { usb: isUsbSupported(), ble: isBluetoothSupported(), rawbt: isAndroid() }
}

/** Whether this browser can print directly at all (else: Print and WhatsApp only). */
export const canPrintDirectly = () => Object.values(supportedMethods()).some(Boolean)

/** Prints through the saved method; throws PrinterNotSetUpError when none is saved. */
export async function printDirect(bytes: Uint8Array<ArrayBuffer>): Promise<void> {
  const { method } = printerSettings.get()
  if (method === 'usb') return printUsb(bytes)
  if (method === 'ble') return printBle(bytes)
  if (method === 'rawbt') return printViaRawbt(bytes)
  throw new PrinterNotSetUpError()
}

export function chooseRawbt() {
  printerSettings.set({
    method: 'rawbt',
    deviceName: 'Aplikasi RawBT',
    deviceId: null,
    usb: null,
    tested: false,
  })
}

export async function forgetSavedPrinter() {
  const { method } = printerSettings.get()
  if (method === 'ble') forgetPrinter()
  if (method === 'usb') await forgetUsbPrinter()
  const { paperWidth } = printerSettings.get()
  printerSettings.set({ ...PRINTER_DEFAULTS, paperWidth })
}

export type PrinterState = 'unset' | 'ready' | 'standby' | 'missing'

export interface PrinterStatus {
  state: PrinterState
  method: PrintMethod | null
  name: string | null
  /** Short status for the header and the setup dialog. */
  label: string
}

/** Pure: what the saved printer's state means for the cashier. */
export function printerStatus(settings: PrinterSettings, link: PrinterLink): PrinterStatus {
  const { method, deviceName: name } = settings
  if (!method) return { state: 'unset', method, name, label: 'Printer belum diatur' }
  if (method === 'usb') {
    return link.usbPresent
      ? { state: 'ready', method, name, label: 'USB tersambung' }
      : { state: 'missing', method, name, label: 'Kabel USB tidak terdeteksi' }
  }
  if (method === 'ble') {
    return link.bleConnected
      ? { state: 'ready', method, name, label: 'Bluetooth tersambung' }
      : { state: 'standby', method, name, label: 'Bluetooth, tersambung saat mencetak' }
  }
  return { state: 'ready', method, name, label: 'Lewat aplikasi RawBT' }
}

/** The page printed by "Tes cetak" in the printer setup. */
export function testTransaction(business: Pick<Business, 'id' | 'receiptPrefix'>): Transaction {
  return {
    id: 'test',
    businessId: business.id,
    receiptNo: `${business.receiptPrefix}-TES-A0000`,
    occurredAt: new Date().toISOString(),
    plateNumber: null,
    paymentMethod: 'cash',
    subtotal: 0,
    discountId: null,
    discountName: null,
    discountType: null,
    discountValue: null,
    discountAmount: 0,
    total: 0,
    cashReceived: 0,
    changeAmount: 0,
    status: 'paid',
    voidReason: null,
    voidedAt: null,
    deviceId: 'test',
    receivedAt: null,
    orderId: null,
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

/** Dot colour per printer state; the label always travels with it (aria-label, text). */
export const STATE_DOT: Record<PrinterState, string> = {
  ready: 'bg-emerald-500',
  standby: 'bg-amber-400',
  missing: 'bg-red-500',
  unset: 'bg-zinc-400',
}

export function usePrinterStatus(): PrinterStatus {
  return printerStatus(printerSettings.useValue(), usePrinterLink())
}
