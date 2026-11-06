import { createLocalStore } from '@/lib/local-store'
import type { PaperWidth } from './format-receipt'

// Per-device printer settings (decision #42): paper width, how the printer is reached,
// and which printer it is, so every later receipt prints in one tap.

/** USB cable (WebUSB), Bluetooth Low Energy (Web Bluetooth), or the RawBT app. */
export type PrintMethod = 'usb' | 'ble' | 'rawbt'

export interface UsbIdentity {
  vendorId: number
  productId: number
  serialNumber: string | null
}

export interface PrinterSettings {
  paperWidth: PaperWidth
  method: PrintMethod | null
  /** Web Bluetooth device id of the paired BLE printer. */
  deviceId: string | null
  /** What the cashier sees: the printer's name, or the app for RawBT. */
  deviceName: string | null
  usb: UsbIdentity | null
  /** The cashier confirmed a test page came out. */
  tested: boolean
}

export const PRINTER_DEFAULTS: PrinterSettings = {
  paperWidth: 58,
  method: null,
  deviceId: null,
  deviceName: null,
  usb: null,
  tested: false,
}

const KEY = 'kasiko.printer.v2'
const V1_KEY = 'kasiko.printer.v1'

const isNullableString = (v: unknown) => v === null || typeof v === 'string'

function isUsbIdentity(value: unknown): value is UsbIdentity {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return (
    typeof v.vendorId === 'number' &&
    typeof v.productId === 'number' &&
    isNullableString(v.serialNumber)
  )
}

export function isPrinterSettings(value: unknown): value is PrinterSettings {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return (
    (v.paperWidth === 58 || v.paperWidth === 80) &&
    (v.method === null || v.method === 'usb' || v.method === 'ble' || v.method === 'rawbt') &&
    isNullableString(v.deviceId) &&
    isNullableString(v.deviceName) &&
    (v.usb === null || isUsbIdentity(v.usb)) &&
    typeof v.tested === 'boolean'
  )
}

/** Settings saved by the BLE-only version: keep the paper width and the paired printer. */
export function fromV1(value: unknown): PrinterSettings | null {
  if (typeof value !== 'object' || value === null) return null
  const v = value as Record<string, unknown>
  if (v.paperWidth !== 58 && v.paperWidth !== 80) return null
  const deviceId = typeof v.deviceId === 'string' ? v.deviceId : null
  return {
    ...PRINTER_DEFAULTS,
    paperWidth: v.paperWidth,
    method: deviceId ? 'ble' : null,
    deviceId,
    deviceName: deviceId && typeof v.deviceName === 'string' ? v.deviceName : null,
  }
}

function migrate() {
  try {
    if (localStorage.getItem(KEY) !== null) return
    const old = localStorage.getItem(V1_KEY)
    const settings = old ? fromV1(JSON.parse(old)) : null
    if (settings) localStorage.setItem(KEY, JSON.stringify(settings))
  } catch {
    // Storage blocked or unreadable: start from the defaults.
  }
}
migrate()

export const printerSettings = createLocalStore<PrinterSettings>(
  KEY,
  PRINTER_DEFAULTS,
  isPrinterSettings,
)
