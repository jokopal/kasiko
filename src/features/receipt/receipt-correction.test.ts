import { describe, expect, it } from 'vitest'
import type { Transaction } from '@/lib/types'
import { formatReceipt, receiptToText } from './format-receipt'
import {
  cleanCorrection,
  correctionDraft,
  correctionError,
  printedTransaction,
  sameAsPrinted,
} from './receipt-correction'

const business = {
  name: 'Saimara',
  address: 'Jl. Merdeka 10',
  phone: '0812',
  receiptFooter: 'Terima kasih',
  timezone: 'Asia/Jakarta',
}

const sale: Transaction = {
  id: 't1',
  businessId: 'b',
  receiptNo: 'SMR-261124-A0007',
  occurredAt: '2026-11-24T02:00:00Z',
  plateNumber: 'B 1 A',
  paymentMethod: 'cash',
  subtotal: 60_000,
  discountId: 'd',
  discountName: 'Member',
  discountType: 'percent',
  discountValue: 10,
  discountAmount: 6_000,
  total: 54_000,
  cashReceived: 60_000,
  changeAmount: 6_000,
  status: 'paid',
  voidReason: null,
  voidedAt: null,
  deviceId: 'dev',
  receivedAt: null,
  orderId: null,
  items: [
    {
      id: 'i1',
      catalogItemId: 'c1',
      nameSnapshot: 'Cuci Mobil Sedang',
      priceSnapshot: 50_000,
      qty: 1,
      lineTotal: 50_000,
    },
    {
      id: 'i2',
      catalogItemId: 'c2',
      nameSnapshot: 'Cuci Mesin Mobil',
      priceSnapshot: 10_000,
      qty: 1,
      lineTotal: 10_000,
    },
  ],
}

const corrected: Transaction = {
  ...sale,
  receiptCorrection: {
    items: [{ name: 'Cuci Mobil Sedang + Mesin', qty: 1, price: 55_000 }],
    plateNumber: 'B 1 AB',
  },
}

describe('receipt corrections', () => {
  it('starts the editor from what the receipt prints now', () => {
    expect(correctionDraft(sale)).toEqual({
      items: [
        { name: 'Cuci Mobil Sedang', qty: 1, price: 50_000 },
        { name: 'Cuci Mesin Mobil', qty: 1, price: 10_000 },
      ],
      plateNumber: 'B 1 A',
    })
    expect(correctionDraft(corrected)).toEqual(corrected.receiptCorrection)
    expect(sameAsPrinted(sale, correctionDraft(sale))).toBe(true)
  })

  it('prints the corrected lines, plate and total, with change from the cash given', () => {
    const printed = printedTransaction(corrected)
    expect(printed.total).toBe(55_000)
    expect(printed.discountAmount).toBe(0)
    expect(printed.changeAmount).toBe(5_000)
    expect(printed.plateNumber).toBe('B 1 AB')
    const receipt = receiptToText(formatReceipt(corrected, business, 58), 58)
    expect(receipt).toContain('Cuci Mobil Sedang + Mesin')
    expect(receipt).toContain('55.000')
    expect(receipt).not.toContain('Cuci Mesin Mobil')
  })

  it('never touches the real sale', () => {
    expect(printedTransaction(sale)).toBe(sale)
    expect(corrected.total).toBe(54_000)
  })

  it('validates like the server and cleans names and the plate', () => {
    expect(correctionError({ items: [], plateNumber: null })).toBe('Nota minimal satu baris')
    expect(correctionError({ items: [{ name: ' ', qty: 1, price: 1 }], plateNumber: null })).toBe(
      'Baris 1: nama wajib diisi',
    )
    expect(correctionError({ items: [{ name: 'A', qty: 0, price: 1 }], plateNumber: null })).toBe(
      'Baris 1: jumlah 1–99',
    )
    expect(
      correctionError({ items: [{ name: 'A', qty: 1, price: 0 }], plateNumber: ' ' }),
    ).toBeNull()
    expect(
      cleanCorrection({ items: [{ name: ' A ', qty: 1, price: 1 }], plateNumber: ' b 1 a ' }),
    ).toEqual({
      items: [{ name: 'A', qty: 1, price: 1 }],
      plateNumber: 'B 1 A',
    })
  })
})
