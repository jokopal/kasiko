import { createLocalStore } from '@/lib/local-store'
import type { PaperWidth } from './format-receipt'

// Per-device printer settings (AGENTS.md §8): paper width and the paired printer.

export interface PrinterSettings {
  paperWidth: PaperWidth
  /** Web Bluetooth device id of the paired printer, for one-tap reconnects. */
  deviceId: string | null
  deviceName: string | null
}

function isPrinterSettings(value: unknown): value is PrinterSettings {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return (
    (v.paperWidth === 58 || v.paperWidth === 80) &&
    (v.deviceId === null || typeof v.deviceId === 'string') &&
    (v.deviceName === null || typeof v.deviceName === 'string')
  )
}

export const printerSettings = createLocalStore<PrinterSettings>(
  'kasiko.printer.v1',
  { paperWidth: 58, deviceId: null, deviceName: null },
  isPrinterSettings,
)
