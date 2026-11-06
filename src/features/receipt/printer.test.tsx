import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Business, Transaction } from '@/lib/types'
import { encodeReceipt } from './escpos'
import { formatReceipt } from './format-receipt'
import { printDirect, printerStatus, testTransaction } from './printer'
import { PrinterNotSetUpError } from './printer-error'
import { getPrinterLink, setPrinterLink } from './printer-link'
import { PrinterSetup } from './printer-settings-dialog'
import { fromV1, PRINTER_DEFAULTS, printerSettings } from './printer-settings'
import { closePrinterSetup, openPrinterSetup } from './printer-setup'
import { rawbtIntentUrl, RAWBT_PACKAGE, toBase64 } from './rawbt'
import { ReceiptActions } from './receipt-actions'
import {
  findOutEndpoint,
  forgetUsbPrinter,
  pairUsbPrinter,
  printUsb,
  watchUsb,
} from './usb-printer'

const business = {
  id: 'biz',
  name: 'Saimara',
  receiptPrefix: 'SMR',
  address: 'Jl. Merdeka No. 10',
  phone: '0812-0000-0000',
  receiptFooter: 'Terima kasih',
  timezone: 'Asia/Jakarta',
} as Business

type Endpoint = Pick<USBEndpoint, 'endpointNumber' | 'direction' | 'type'>

function configuration(
  alternates: { interfaceClass: number; endpoints: Endpoint[] }[],
): USBConfiguration {
  return {
    configurationValue: 1,
    interfaces: alternates.map((alt, index) => ({
      interfaceNumber: index,
      claimed: false,
      alternates: [{ alternateSetting: 0, ...alt }],
    })),
  } as unknown as USBConfiguration
}

const PRINTER_CONFIG = () =>
  configuration([
    {
      interfaceClass: 0x07,
      endpoints: [
        { endpointNumber: 1, direction: 'in', type: 'bulk' },
        { endpointNumber: 2, direction: 'out', type: 'bulk' },
      ],
    },
  ])

/** A USB receipt printer as WebUSB sees it; `received` is what reached the paper. */
function fakeUsb({ granted = false }: { granted?: boolean } = {}) {
  const received: Uint8Array[] = []
  const config = PRINTER_CONFIG()
  const device = {
    vendorId: 0x0416,
    productId: 0x5011,
    serialNumber: undefined,
    productName: 'POS58 Printer',
    manufacturerName: 'Digit',
    opened: false,
    configuration: null as USBConfiguration | null,
    configurations: [config],
    open: vi.fn(() => {
      device.opened = true
      return Promise.resolve()
    }),
    selectConfiguration: vi.fn(() => {
      device.configuration = config
      return Promise.resolve()
    }),
    claimInterface: vi.fn(() => Promise.resolve()),
    selectAlternateInterface: vi.fn(() => Promise.resolve()),
    transferOut: vi.fn((_endpoint: number, data: Uint8Array) => {
      received.push(Uint8Array.from(data))
      return Promise.resolve({ status: 'ok', bytesWritten: data.byteLength })
    }),
    close: vi.fn(() => {
      device.opened = false
      return Promise.resolve()
    }),
  }
  const listeners = new Map<string, Set<(event: { device: unknown }) => void>>()
  const state = { granted }
  const usb = {
    requestDevice: vi.fn(() => {
      state.granted = true
      return Promise.resolve(device)
    }),
    getDevices: vi.fn(() => Promise.resolve(state.granted ? [device] : [])),
    addEventListener: (type: string, listener: (event: { device: unknown }) => void) => {
      if (!listeners.has(type)) listeners.set(type, new Set())
      listeners.get(type)?.add(listener)
    },
    removeEventListener: (type: string, listener: (event: { device: unknown }) => void) =>
      listeners.get(type)?.delete(listener),
  }
  Object.defineProperty(navigator, 'usb', { configurable: true, value: usb })
  const emit = (type: 'connect' | 'disconnect') => {
    for (const listener of listeners.get(type) ?? []) listener({ device })
  }
  return { device, usb, received, emit }
}

const merged = (parts: readonly Uint8Array[]) =>
  Uint8Array.from(parts.flatMap((part) => Array.from(part)))

const receipt = () => encodeReceipt(formatReceipt(testTransaction(business), business, 58))

beforeEach(() => {
  localStorage.clear()
  setPrinterLink({ usbPresent: false, bleConnected: false })
})

afterEach(async () => {
  act(() => closePrinterSetup())
  await forgetUsbPrinter()
  Reflect.deleteProperty(navigator, 'usb')
  Reflect.deleteProperty(navigator, 'bluetooth')
})

describe('printer settings saved by the Bluetooth-only version', () => {
  it('keeps the paper width and the paired printer as a Bluetooth printer', () => {
    expect(fromV1({ paperWidth: 80, deviceId: 'abc', deviceName: 'RPP02' })).toEqual({
      ...PRINTER_DEFAULTS,
      paperWidth: 80,
      method: 'ble',
      deviceId: 'abc',
      deviceName: 'RPP02',
    })
  })

  it('leaves the method unset when no printer was paired', () => {
    expect(fromV1({ paperWidth: 58, deviceId: null, deviceName: null })).toEqual(PRINTER_DEFAULTS)
  })

  it('ignores anything unreadable', () => {
    expect(fromV1({ paperWidth: 70 })).toBeNull()
    expect(fromV1('58')).toBeNull()
  })
})

describe('printer status for the cashier', () => {
  const link = { usbPresent: false, bleConnected: false }

  it('asks for a setup when nothing is saved', () => {
    expect(printerStatus(PRINTER_DEFAULTS, link)).toMatchObject({
      state: 'unset',
      label: 'Printer belum diatur',
    })
  })

  it('follows the USB cable', () => {
    const usb = { ...PRINTER_DEFAULTS, method: 'usb' as const }
    expect(printerStatus(usb, link).state).toBe('missing')
    expect(printerStatus(usb, { ...link, usbPresent: true })).toMatchObject({
      state: 'ready',
      label: 'USB tersambung',
    })
  })

  it('treats an idle Bluetooth printer as standing by, not broken', () => {
    const ble = { ...PRINTER_DEFAULTS, method: 'ble' as const }
    expect(printerStatus(ble, link).state).toBe('standby')
    expect(printerStatus(ble, { ...link, bleConnected: true }).state).toBe('ready')
  })

  it('cannot see a RawBT printer and says it prints through the app', () => {
    const rawbt = { ...PRINTER_DEFAULTS, method: 'rawbt' as const }
    expect(printerStatus(rawbt, link).label).toBe('Lewat aplikasi RawBT')
  })
})

describe('RawBT hand-off', () => {
  it('passes the exact ESC/POS bytes to the RawBT app with a Play Store fallback', () => {
    const bytes = Uint8Array.from([0x1b, 0x40, 0x41, 0x0a, 0xff])
    const url = rawbtIntentUrl(bytes)
    expect(url.startsWith(`intent:base64,${toBase64(bytes)}#Intent;`)).toBe(true)
    expect(url).toContain(`package=${RAWBT_PACKAGE};`)
    expect(url).toContain('scheme=rawbt;')
    expect(url).toContain(`S.browser_fallback_url=${encodeURIComponent('https://play.google.com')}`)
    expect(url.endsWith(';end;')).toBe(true)
    expect(Uint8Array.from(atob(toBase64(bytes)), (c) => c.charCodeAt(0))).toEqual(bytes)
  })
})

describe('the USB endpoint to print through', () => {
  it('prefers the printer-class interface', () => {
    const config = configuration([
      { interfaceClass: 0xff, endpoints: [{ endpointNumber: 5, direction: 'out', type: 'bulk' }] },
      { interfaceClass: 0x07, endpoints: [{ endpointNumber: 3, direction: 'out', type: 'bulk' }] },
    ])
    expect(findOutEndpoint(config)).toEqual({
      interfaceNumber: 1,
      alternateSetting: 0,
      endpointNumber: 3,
    })
  })

  it('falls back to any bulk OUT endpoint, and to nothing for non-printers', () => {
    const vendor = configuration([
      { interfaceClass: 0xff, endpoints: [{ endpointNumber: 1, direction: 'out', type: 'bulk' }] },
    ])
    expect(findOutEndpoint(vendor)?.endpointNumber).toBe(1)
    const keyboard = configuration([
      {
        interfaceClass: 0x03,
        endpoints: [{ endpointNumber: 1, direction: 'in', type: 'interrupt' }],
      },
    ])
    expect(findOutEndpoint(keyboard)).toBeNull()
  })
})

describe('printing over a USB cable', () => {
  it('pairs once, then delivers the whole receipt in order', async () => {
    const printer = fakeUsb()
    await expect(pairUsbPrinter()).resolves.toBe('POS58 Printer')
    expect(printerSettings.get()).toMatchObject({
      method: 'usb',
      deviceName: 'POS58 Printer',
      usb: { vendorId: 0x0416, productId: 0x5011, serialNumber: null },
    })
    expect(getPrinterLink().usbPresent).toBe(true)

    const bytes = receipt()
    await printUsb(bytes)
    expect(merged(printer.received)).toEqual(bytes)
    expect(printer.device.transferOut).toHaveBeenCalledWith(2, expect.any(Uint8Array))
  })

  it('reopens the saved printer after a reload without asking again', async () => {
    const first = fakeUsb()
    await pairUsbPrinter()
    await forgetUsbPrinter() // drops the open connection, like a page reload
    printerSettings.set({
      method: 'usb',
      usb: { vendorId: 0x0416, productId: 0x5011, serialNumber: null },
    })
    first.device.opened = false

    await printDirect(Uint8Array.from([1, 2, 3]))
    expect(first.usb.requestDevice).toHaveBeenCalledTimes(1)
    expect(merged(first.received)).toEqual(Uint8Array.from([1, 2, 3]))
  })

  it('says to plug the cable in when the saved printer is not there', async () => {
    fakeUsb()
    printerSettings.set({ method: 'usb', usb: { vendorId: 1, productId: 2, serialNumber: null } })
    await expect(printDirect(Uint8Array.from([1]))).rejects.toThrow(/Colokkan kabel/)
    expect(getPrinterLink().usbPresent).toBe(false)
  })

  it('follows the saved printer being unplugged and plugged back in', async () => {
    const printer = fakeUsb()
    await pairUsbPrinter()
    const changes: boolean[] = []
    const stop = watchUsb((present) => changes.push(present))
    printer.emit('disconnect')
    expect(getPrinterLink().usbPresent).toBe(false)
    printer.emit('connect')
    expect(getPrinterLink().usbPresent).toBe(true)
    stop()
    printer.emit('disconnect')
    expect(changes).toEqual([false, true])
  })
})

describe('printing with no printer set up', () => {
  it('asks for the setup instead of failing', async () => {
    await expect(printDirect(Uint8Array.from([1]))).rejects.toBeInstanceOf(PrinterNotSetUpError)
  })
})

describe('the printer setup procedure', () => {
  it('connects a USB printer, prints a test page and remembers it worked', async () => {
    const printer = fakeUsb()
    render(<PrinterSetup business={business} />)
    act(() => openPrinterSetup())

    expect(await screen.findByText('Pilih cara sambung printer')).toBeVisible()
    expect(screen.getByRole('button', { name: /Bluetooth klasik/ })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: /Kabel USB/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Cari printer USB' }))

    expect(await screen.findByRole('heading', { name: 'Tes cetak' })).toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: 'Tes cetak' }))
    await userEvent.click(await screen.findByRole('button', { name: /Ya, keluar/ }))

    expect(merged(printer.received)).toEqual(receipt())
    expect(printerSettings.get()).toMatchObject({ method: 'usb', tested: true })
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('offers a printer plugged in before without the chooser', async () => {
    const printer = fakeUsb({ granted: true })
    render(<PrinterSetup business={business} />)
    act(() => openPrinterSetup())
    await userEvent.click(await screen.findByRole('button', { name: /Kabel USB/ }))
    expect(await screen.findByText('POS58 Printer')).toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: 'Pakai' }))
    expect(await screen.findByRole('heading', { name: 'Tes cetak' })).toBeVisible()
    expect(printer.usb.requestDevice).not.toHaveBeenCalled()
  })

  it('shows what to check when the test page does not come out', async () => {
    fakeUsb()
    await pairUsbPrinter()
    render(<PrinterSetup business={business} />)
    act(() => openPrinterSetup())
    expect(await screen.findByText('USB tersambung')).toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: /Uji printer/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Tes cetak' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Tidak' }))
    expect(screen.getByText(/kabel OTG/)).toBeVisible()
    expect(screen.getByRole('button', { name: 'Tes cetak lagi' })).toBeVisible()
    expect(printerSettings.get().tested).toBe(false)
  })

  it('warns when the tablet Bluetooth is off', async () => {
    Object.defineProperty(navigator, 'bluetooth', {
      configurable: true,
      value: {
        requestDevice: vi.fn(),
        getAvailability: () => Promise.resolve(false),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      },
    })
    render(<PrinterSetup business={business} />)
    act(() => openPrinterSetup())
    await userEvent.click(await screen.findByRole('button', { name: /^Bluetooth Cari/ }))
    expect(await screen.findByText('Bluetooth tablet mati')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Cari printer di sekitar' })).toBeDisabled()
  })
})

describe('the Cetak button', () => {
  const transaction: Transaction = { ...testTransaction(business), id: 't1' }

  it('opens the printer setup when no printer is saved yet', async () => {
    fakeUsb()
    render(
      <>
        <ReceiptActions transaction={transaction} business={business} />
        <PrinterSetup business={business} />
      </>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Cetak' }))
    expect(await screen.findByText('Pilih cara sambung printer')).toBeVisible()
  })

  it('prints through the saved USB printer in one tap', async () => {
    const printer = fakeUsb()
    await pairUsbPrinter()
    render(<ReceiptActions transaction={transaction} business={business} />)
    await userEvent.click(screen.getByRole('button', { name: 'Cetak' }))
    await waitFor(() => expect(printer.received.length).toBeGreaterThan(0))
    expect(merged(printer.received)).toEqual(
      encodeReceipt(formatReceipt(transaction, business, 58)),
    )
  })
})
