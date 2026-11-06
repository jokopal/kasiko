import { chunk } from './escpos'
import { PrinterError } from './printer-error'
import { setPrinterLink } from './printer-link'
import { printerSettings, type UsbIdentity } from './printer-settings'

// WebUSB transport (decision #42): Chrome on Android talks to a USB receipt printer
// through an OTG cable: no driver, no app. ESC/POS bytes go to the printer's bulk OUT
// endpoint. (On Windows the system driver owns the printer; there the Print button and
// the installed driver are the way.)

/** USB interface class of printers. */
const PRINTER_CLASS = 0x07
/** Bulk transfers are flow-controlled by the printer, so large writes are safe. */
const CHUNK_SIZE = 1024

interface UsbConnection {
  device: USBDevice
  endpointNumber: number
}

let connection: UsbConnection | null = null

export function isUsbSupported(): boolean {
  return typeof navigator !== 'undefined' && 'usb' in navigator
}

export const identityOf = (device: USBDevice): UsbIdentity => ({
  vendorId: device.vendorId,
  productId: device.productId,
  serialNumber: device.serialNumber ?? null,
})

export const sameDevice = (device: USBDevice, identity: UsbIdentity | null) =>
  identity !== null &&
  device.vendorId === identity.vendorId &&
  device.productId === identity.productId &&
  (identity.serialNumber === null || device.serialNumber === identity.serialNumber)

export function usbName(device: USBDevice): string {
  return (
    device.productName?.trim() ||
    device.manufacturerName?.trim() ||
    `Printer USB ${device.vendorId.toString(16).padStart(4, '0')}`
  )
}

interface OutTarget {
  interfaceNumber: number
  alternateSetting: number
  endpointNumber: number
}

/** The interface to print through: a printer-class one first, else any bulk OUT. */
export function findOutEndpoint(configuration: USBConfiguration | undefined): OutTarget | null {
  const targets: (OutTarget & { printer: boolean })[] = []
  for (const iface of configuration?.interfaces ?? []) {
    for (const alt of iface.alternates) {
      const out = alt.endpoints.find((e) => e.direction === 'out' && e.type === 'bulk')
      if (out) {
        targets.push({
          interfaceNumber: iface.interfaceNumber,
          alternateSetting: alt.alternateSetting,
          endpointNumber: out.endpointNumber,
          printer: alt.interfaceClass === PRINTER_CLASS,
        })
      }
    }
  }
  const best = targets.find((t) => t.printer) ?? targets[0]
  return best
    ? {
        interfaceNumber: best.interfaceNumber,
        alternateSetting: best.alternateSetting,
        endpointNumber: best.endpointNumber,
      }
    : null
}

function describe(error: unknown): PrinterError {
  if (error instanceof PrinterError) return error
  if (error instanceof DOMException) {
    if (error.name === 'NotFoundError') {
      return new PrinterError('Tidak ada printer yang dipilih')
    }
    if (error.name === 'SecurityError' || error.name === 'NotAllowedError') {
      return new PrinterError('Izin USB ditolak. Coba lagi dan tekan Hubungkan.')
    }
    if (error.name === 'NetworkError' || error.name === 'InvalidStateError') {
      return new PrinterError(
        'Printer USB tidak bisa dipakai. Pastikan kabel tercolok dan tidak ada aplikasi lain (mis. RawBT) yang sedang memakai printer.',
      )
    }
  }
  return new PrinterError('Gagal mencetak lewat USB')
}

async function connect(device: USBDevice): Promise<UsbConnection> {
  if (!device.opened) await device.open()
  if (device.configuration === null) {
    await device.selectConfiguration(device.configurations[0]?.configurationValue ?? 1)
  }
  const target = findOutEndpoint(device.configuration ?? undefined)
  if (!target) {
    throw new PrinterError('Perangkat USB ini bukan printer. Pilih printer di daftar.')
  }
  const iface = device.configuration?.interfaces.find(
    (i) => i.interfaceNumber === target.interfaceNumber,
  )
  if (!iface?.claimed) await device.claimInterface(target.interfaceNumber)
  if (target.alternateSetting !== 0) {
    await device.selectAlternateInterface(target.interfaceNumber, target.alternateSetting)
  }
  connection = { device, endpointNumber: target.endpointNumber }
  printerSettings.set({
    method: 'usb',
    usb: identityOf(device),
    deviceName: usbName(device),
    deviceId: null,
  })
  setPrinterLink({ usbPresent: true })
  return connection
}

/** The saved printer, if it is plugged in and Chrome still holds the permission. */
export async function findSavedUsbPrinter(): Promise<USBDevice | null> {
  if (!isUsbSupported()) return null
  const { usb } = printerSettings.get()
  if (!usb) return null
  const devices = await navigator.usb.getDevices()
  return devices.find((device) => sameDevice(device, usb)) ?? null
}

/** Opens Chrome's USB chooser; the cashier picks the printer and taps Hubungkan. */
export async function pairUsbPrinter(): Promise<string> {
  if (!isUsbSupported()) throw new PrinterError('Browser ini tidak mendukung USB. Pakai Chrome.')
  try {
    // No filter: some printers report a vendor class instead of the printer class.
    const device = await navigator.usb.requestDevice({ filters: [] })
    await connect(device)
    return usbName(device)
  } catch (error) {
    throw describe(error)
  }
}

/** Printers Chrome already lets Kasiko use (plugged in and permitted before). */
export async function listUsbPrinters(): Promise<USBDevice[]> {
  if (!isUsbSupported()) return []
  const devices = await navigator.usb.getDevices().catch(() => [])
  return devices.filter((device) =>
    device.configurations.some((configuration) => findOutEndpoint(configuration) !== null),
  )
}

/** Uses a printer from listUsbPrinters without opening the chooser again. */
export async function connectUsbPrinter(device: USBDevice): Promise<string> {
  try {
    await connect(device)
    return usbName(device)
  } catch (error) {
    throw describe(error)
  }
}

async function ensureConnection(): Promise<UsbConnection> {
  if (connection?.device.opened) return connection
  const saved = await findSavedUsbPrinter()
  if (!saved) {
    setPrinterLink({ usbPresent: false })
    throw new PrinterError('Printer USB tidak terdeteksi. Colokkan kabel dan nyalakan printer.')
  }
  return connect(saved)
}

export async function printUsb(bytes: Uint8Array<ArrayBuffer>): Promise<void> {
  if (!isUsbSupported()) throw new PrinterError('Browser ini tidak mendukung USB. Pakai Chrome.')
  try {
    const { device, endpointNumber } = await ensureConnection()
    for (const part of chunk(bytes, CHUNK_SIZE)) {
      const result = await device.transferOut(endpointNumber, part)
      if (result.status !== 'ok') throw new PrinterError('Printer menolak data. Coba lagi.')
    }
  } catch (error) {
    connection = null
    throw describe(error)
  }
}

/** Follows plugging and unplugging of the saved printer; returns the unsubscribe. */
export function watchUsb(onChange: (present: boolean) => void): () => void {
  if (!isUsbSupported()) return () => undefined
  const handle = (present: boolean) => (event: USBConnectionEvent) => {
    if (!sameDevice(event.device, printerSettings.get().usb)) return
    if (!present && connection?.device === event.device) connection = null
    setPrinterLink({ usbPresent: present })
    onChange(present)
  }
  const onConnect = handle(true)
  const onDisconnect = handle(false)
  const { usb } = navigator
  usb.addEventListener('connect', onConnect)
  usb.addEventListener('disconnect', onDisconnect)
  void findSavedUsbPrinter()
    .then((device) => setPrinterLink({ usbPresent: device !== null }))
    .catch(() => undefined)
  return () => {
    usb.removeEventListener('connect', onConnect)
    usb.removeEventListener('disconnect', onDisconnect)
  }
}

export async function forgetUsbPrinter() {
  const device = connection?.device
  connection = null
  setPrinterLink({ usbPresent: false })
  await device?.close().catch(() => undefined)
}
