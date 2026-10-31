import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Transaction } from '@/lib/types'
import { forgetPrinter, pairPrinter, printBytes, PrinterError } from './bluetooth-printer'
import { encodeReceipt } from './escpos'
import { formatReceipt, PAPER_CHARS } from './format-receipt'
import { ReceiptActions } from './receipt-actions'

const business = {
  name: 'Saimara',
  address: 'Jl. Merdeka No. 10, Bandung',
  phone: '0812-0000-0000',
  receiptFooter: 'Terima kasih, sampai jumpa lagi!',
  timezone: 'Asia/Jakarta',
}

const transaction: Transaction = {
  id: 't1',
  businessId: 'biz',
  receiptNo: 'SMR-261012-A0007',
  occurredAt: '2026-10-12T01:30:00Z',
  plateNumber: 'B 1234 XYZ',
  paymentMethod: 'cash',
  subtotal: 100_000,
  discountId: 'd1',
  discountName: 'Promo Akhir Pekan Saimara',
  discountType: 'percent',
  discountValue: 10,
  discountAmount: 10_000,
  total: 90_000,
  cashReceived: 100_000,
  changeAmount: 10_000,
  status: 'paid',
  voidReason: null,
  voidedAt: null,
  deviceId: 'd',
  receivedAt: null,
  orderId: null,
  items: [
    {
      id: 'i1',
      catalogItemId: 'c1',
      nameSnapshot: 'Cuci Mobil Sedang + Semir Ban & Vakum Interior',
      priceSnapshot: 50_000,
      qty: 2,
      lineTotal: 100_000,
    },
  ],
}

type WriteMode = 'write' | 'writeWithoutResponse'

/** A BLE thermal printer as Web Bluetooth sees it; `received` is what reached the paper. */
function fakePrinter(options: {
  mode?: WriteMode
  services?: { characteristics: { write?: boolean; writeWithoutResponse?: boolean }[] }[]
}) {
  const received: Uint8Array[] = []
  const writes: number[] = []
  const record = (value: Uint8Array) => {
    writes.push(value.length)
    received.push(Uint8Array.from(value))
    return Promise.resolve()
  }
  const mode = options.mode ?? 'write'
  const characteristic = (properties: { write?: boolean; writeWithoutResponse?: boolean }) => ({
    properties: { write: false, writeWithoutResponse: false, ...properties },
    writeValueWithResponse: vi.fn(record),
    writeValueWithoutResponse: vi.fn(record),
  })
  const services = (options.services ?? [{ characteristics: [{ [mode]: true }] }]).map((s) => ({
    getCharacteristics: () =>
      s.characteristics.length > 0
        ? Promise.resolve(s.characteristics.map(characteristic))
        : Promise.reject(new DOMException('No characteristics', 'NotFoundError')),
  }))
  const gatt = {
    connected: false,
    connect: vi.fn(() => {
      gatt.connected = true
      return Promise.resolve(gatt)
    }),
    disconnect: vi.fn(() => {
      gatt.connected = false
    }),
    getPrimaryServices: vi.fn(() =>
      services.length > 0
        ? Promise.resolve(services)
        : Promise.reject(new DOMException('No services', 'NotFoundError')),
    ),
  }
  const device = {
    id: 'printer-1',
    name: 'DT-58D',
    gatt,
    addEventListener: vi.fn(),
  }
  const requestDevice = vi.fn(() => Promise.resolve(device))
  Object.defineProperty(navigator, 'bluetooth', {
    configurable: true,
    value: { requestDevice },
  })
  return { received, writes, gatt, requestDevice }
}

const merged = (parts: readonly Uint8Array[]) =>
  Uint8Array.from(parts.flatMap((part) => Array.from(part)))

/** What a thermal printer puts on paper: the text lines, once commands are read past. */
function paperLines(bytes: Uint8Array): string[] {
  const lines: string[] = []
  let line = ''
  for (let i = 0; i < bytes.length; i++) {
    const byte = bytes[i] ?? 0
    if (byte === 0x1b) i += bytes[i + 1] === 0x40 ? 1 : 2
    else if (byte === 0x1d) i += bytes[i + 1] === 0x56 ? 3 : 2
    else if (byte === 0x0a) {
      lines.push(line)
      line = ''
    } else line += String.fromCharCode(byte)
  }
  return lines
}

const expectedLines = () => formatReceipt(transaction, business, 58).map((l) => l.text)

afterEach(() => {
  forgetPrinter()
  Reflect.deleteProperty(navigator, 'bluetooth')
})

describe('printing a receipt over BLE on 58 mm paper', () => {
  beforeEach(() => {
    vi.useRealTimers()
  })

  it.each<WriteMode>(['write', 'writeWithoutResponse'])(
    'delivers the whole receipt, in order, via %s',
    async (mode) => {
      const printer = fakePrinter({ mode })
      const bytes = encodeReceipt(formatReceipt(transaction, business, 58))
      await printBytes(bytes)
      expect(merged(printer.received)).toEqual(bytes)
      expect(Math.max(...printer.writes)).toBeLessThanOrEqual(20)
      expect(paperLines(merged(printer.received))).toEqual(expectedLines())
    },
  )

  it('never overflows the 32 columns of 58 mm paper', async () => {
    const printer = fakePrinter({})
    await printBytes(encodeReceipt(formatReceipt(transaction, business, 58)))
    const lines = paperLines(merged(printer.received))
    expect(Math.max(...lines.map((l) => l.length))).toBe(PAPER_CHARS[58])
    expect(lines.join('\n')).toMatch(/TOTAL +Rp 90\.000/)
    expect(lines.join('\n')).toMatch(/Kembali +Rp 10\.000/)
  })

  it('finishes by feeding past the tear bar', async () => {
    const printer = fakePrinter({})
    await printBytes(encodeReceipt(formatReceipt(transaction, business, 58)))
    const end = Array.from(merged(printer.received).slice(-7))
    expect(end).toEqual([0x1b, 0x64, 0x04, 0x1d, 0x56, 0x42, 0x00])
  })

  it('pairs once, then prints the next receipt without asking again', async () => {
    const printer = fakePrinter({})
    await printBytes(Uint8Array.from([1]))
    await printBytes(Uint8Array.from([2]))
    expect(printer.requestDevice).toHaveBeenCalledTimes(1)
    expect(printer.gatt.connect).toHaveBeenCalledTimes(1)
  })

  it('reconnects when the printer dropped the connection', async () => {
    const printer = fakePrinter({})
    await printBytes(Uint8Array.from([1]))
    printer.gatt.connected = false
    await printBytes(Uint8Array.from([2]))
    expect(printer.requestDevice).toHaveBeenCalledTimes(1)
    expect(printer.gatt.connect).toHaveBeenCalledTimes(2)
  })

  it('skips services it cannot use and finds the one that prints', async () => {
    const printer = fakePrinter({
      services: [
        { characteristics: [] },
        { characteristics: [{}] },
        { characteristics: [{ write: true }] },
      ],
    })
    await printBytes(Uint8Array.from([7]))
    expect(merged(printer.received)).toEqual(Uint8Array.from([7]))
  })
})

describe('when the printer cannot be used', () => {
  it('says so when a chosen device exposes no known print service', async () => {
    fakePrinter({ services: [] })
    await expect(pairPrinter()).rejects.toThrow(/Print atau WhatsApp/)
  })

  it('says the chooser was closed', async () => {
    const printer = fakePrinter({})
    printer.requestDevice.mockRejectedValueOnce(new DOMException('cancelled', 'NotFoundError'))
    await expect(pairPrinter()).rejects.toThrow('Pemilihan printer dibatalkan')
  })

  it('says the printer is out of reach', async () => {
    const printer = fakePrinter({})
    printer.gatt.connect.mockRejectedValueOnce(new DOMException('off', 'NetworkError'))
    await expect(pairPrinter()).rejects.toThrow(/tidak terjangkau/)
  })

  it('refuses on a browser without Web Bluetooth', async () => {
    await expect(printBytes(Uint8Array.from([1]))).rejects.toBeInstanceOf(PrinterError)
  })
})

describe('the Cetak button', () => {
  it('sends the receipt the screen shows and stays usable afterwards', async () => {
    const printer = fakePrinter({})
    render(<ReceiptActions transaction={transaction} business={business} />)
    const button = screen.getByRole('button', { name: 'Cetak' })
    await userEvent.click(button)
    await waitFor(() => expect(printer.received.length).toBeGreaterThan(0))
    await waitFor(() => expect(button).toBeEnabled())
    expect(paperLines(merged(printer.received))).toEqual(expectedLines())
  })

  it('is hidden where Web Bluetooth does not exist', () => {
    render(<ReceiptActions transaction={transaction} business={business} />)
    expect(screen.queryByRole('button', { name: 'Cetak' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Print' })).toBeVisible()
  })
})
