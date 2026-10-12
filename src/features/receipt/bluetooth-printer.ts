import { chunk } from './escpos'
import { printerSettings } from './printer-settings'

// Web Bluetooth transport for BLE thermal printers (Chrome on Android, Chrome/Edge on
// desktop; not available on iOS). Bluetooth Classic (SPP) printers cannot be reached
// from a browser at all — the printer must support BLE.

/** GATT services used by common BLE receipt printers. */
const PRINTER_SERVICES: BluetoothServiceUUID[] = [
  '000018f0-0000-1000-8000-00805f9b34fb',
  'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
  '49535343-fe7d-4ae5-8fa9-9fafd205e455',
  '0000ff00-0000-1000-8000-00805f9b34fb',
  '0000fee7-0000-1000-8000-00805f9b34fb',
]

/** Default ATT MTU leaves 20 bytes per write; safe for every printer. */
const CHUNK_SIZE = 20

export class PrinterError extends Error {}

interface Connection {
  device: BluetoothDevice
  characteristic: BluetoothRemoteGATTCharacteristic
}

let connection: Connection | null = null

export function isBluetoothSupported(): boolean {
  return typeof navigator !== 'undefined' && 'bluetooth' in navigator
}

async function findWritableCharacteristic(
  server: BluetoothRemoteGATTServer,
): Promise<BluetoothRemoteGATTCharacteristic> {
  for (const service of await server.getPrimaryServices()) {
    for (const characteristic of await service.getCharacteristics()) {
      const { write, writeWithoutResponse } = characteristic.properties
      if (write || writeWithoutResponse) return characteristic
    }
  }
  throw new PrinterError('Printer tidak menyediakan jalur cetak yang dikenali')
}

async function rememberedDevice(): Promise<BluetoothDevice | null> {
  const { deviceId } = printerSettings.get()
  if (!deviceId || typeof navigator.bluetooth.getDevices !== 'function') return null
  const devices = await navigator.bluetooth.getDevices()
  return devices.find((device) => device.id === deviceId) ?? null
}

async function connect(device: BluetoothDevice): Promise<Connection> {
  if (!device.gatt) throw new PrinterError('Perangkat ini bukan printer BLE')
  const server = device.gatt.connected ? device.gatt : await device.gatt.connect()
  const characteristic = await findWritableCharacteristic(server)
  device.addEventListener('gattserverdisconnected', () => {
    if (connection?.device === device) connection = null
  })
  connection = { device, characteristic }
  printerSettings.set({ deviceId: device.id, deviceName: device.name ?? 'Printer' })
  return connection
}

function describe(error: unknown): PrinterError {
  if (error instanceof PrinterError) return error
  if (error instanceof DOMException) {
    if (error.name === 'NotFoundError') return new PrinterError('Pemilihan printer dibatalkan')
    if (error.name === 'SecurityError' || error.name === 'NotAllowedError') {
      return new PrinterError('Izin Bluetooth ditolak browser')
    }
    if (error.name === 'NetworkError') {
      return new PrinterError('Printer tidak terjangkau. Pastikan printer menyala dan dekat.')
    }
  }
  return new PrinterError('Gagal terhubung ke printer Bluetooth')
}

/** Opens the browser chooser so the cashier can pair a (new) printer. */
export async function pairPrinter(): Promise<string> {
  if (!isBluetoothSupported()) throw new PrinterError('Browser ini tidak mendukung Bluetooth')
  try {
    const device = await navigator.bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices: PRINTER_SERVICES,
    })
    const { device: connected } = await connect(device)
    return connected.name ?? 'Printer'
  } catch (error) {
    throw describe(error)
  }
}

async function ensureConnection(): Promise<Connection> {
  if (connection?.device.gatt?.connected) return connection
  if (connection) return connect(connection.device)
  const remembered = await rememberedDevice()
  if (remembered) return connect(remembered)
  await pairPrinter()
  if (!connection) throw new PrinterError('Printer belum terhubung')
  return connection
}

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export async function printBytes(bytes: Uint8Array<ArrayBuffer>): Promise<void> {
  if (!isBluetoothSupported()) throw new PrinterError('Browser ini tidak mendukung Bluetooth')
  try {
    const { characteristic } = await ensureConnection()
    const withResponse = characteristic.properties.write
    for (const part of chunk(bytes, CHUNK_SIZE)) {
      if (withResponse) await characteristic.writeValueWithResponse(part)
      else {
        await characteristic.writeValueWithoutResponse(part)
        // Give printers without flow control time to drain their buffer.
        await pause(8)
      }
    }
  } catch (error) {
    throw describe(error)
  }
}

export function forgetPrinter() {
  connection?.device.gatt?.disconnect()
  connection = null
  printerSettings.set({ deviceId: null, deviceName: null })
}
