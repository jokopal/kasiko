import { useSyncExternalStore } from 'react'

// Live link state of the saved printer, shared by the transports (which know when a
// link opens or drops) and the UI (header indicator, setup dialog).

export interface PrinterLink {
  /** The saved USB printer is plugged in (and permitted). */
  usbPresent: boolean
  /** The saved BLE printer has an open GATT connection. */
  bleConnected: boolean
}

let link: PrinterLink = { usbPresent: false, bleConnected: false }
const listeners = new Set<() => void>()

export function setPrinterLink(patch: Partial<PrinterLink>) {
  const next = { ...link, ...patch }
  if (next.usbPresent === link.usbPresent && next.bleConnected === link.bleConnected) return
  link = next
  for (const listener of listeners) listener()
}

export function getPrinterLink(): PrinterLink {
  return link
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function usePrinterLink(): PrinterLink {
  return useSyncExternalStore(subscribe, getPrinterLink, getPrinterLink)
}
