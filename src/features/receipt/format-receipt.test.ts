import { describe, expect, it } from 'vitest'
import type { Transaction } from '@/lib/types'
import {
  formatReceipt,
  PAPER_CHARS,
  receiptToText,
  toPrintable,
  twoColumns,
  wrapText,
  type PaperWidth,
} from './format-receipt'

const business = {
  name: 'Saimara',
  address: 'Jl. Merdeka No. 10, Bandung',
  phone: '0812-0000-0000',
  receiptFooter: 'Terima kasih, sampai jumpa lagi!',
  timezone: 'Asia/Jakarta',
}

const tx: Transaction = {
  id: 't1',
  businessId: 'saimara',
  receiptNo: 'SMR-261012-A0007',
  occurredAt: '2026-10-12T01:30:00Z',
  plateNumber: 'B 1234 XYZ',
  paymentMethod: 'cash',
  subtotal: 55_000,
  discountId: null,
  discountName: null,
  discountType: null,
  discountValue: null,
  discountAmount: 0,
  total: 55_000,
  cashReceived: 100_000,
  changeAmount: 45_000,
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
      nameSnapshot: 'Cuci Mobil Sedang',
      priceSnapshot: 45_000,
      qty: 1,
      lineTotal: 45_000,
    },
    {
      id: 'i2',
      catalogItemId: 'c2',
      nameSnapshot: 'Semir Ban',
      priceSnapshot: 5_000,
      qty: 2,
      lineTotal: 10_000,
    },
  ],
}

const text = (t: Transaction, paper: PaperWidth = 58) =>
  receiptToText(formatReceipt(t, business, paper), paper)

describe('formatReceipt', () => {
  it.each([58, 80] as const)('never exceeds %imm paper width', (paper) => {
    const longName = {
      ...tx.items[0]!,
      nameSnapshot: 'Paket Salon Interior + Poles Body Premium Super Lengkap',
    }
    const lines = formatReceipt({ ...tx, items: [longName] }, business, paper)
    for (const line of lines) expect(line.text.length).toBeLessThanOrEqual(PAPER_CHARS[paper])
  })

  it('contains everything required by section 8', () => {
    const out = text(tx)
    for (const expected of [
      'Saimara',
      'Jl. Merdeka No. 10,',
      '0812-0000-0000',
      'SMR-261012-A0007',
      '12 Okt 2026',
      'B 1234 XYZ',
      'Cuci Mobil Sedang',
      '2 x 5.000',
      'Rp 55.000',
      'Tunai',
      'Rp 100.000',
      'Rp 45.000',
      'Terima kasih',
    ]) {
      expect(out).toContain(expected)
    }
  })

  it('right-aligns amounts to the paper edge', () => {
    const total = formatReceipt(tx, business, 58).find((l) => l.text.startsWith('TOTAL'))!
    expect(total.text).toHaveLength(32)
    expect(total.text.endsWith('Rp 55.000')).toBe(true)
    expect(total).toMatchObject({ bold: true, large: true })
  })

  it('omits cash lines for non-cash payments and the plate when absent', () => {
    const out = text({
      ...tx,
      paymentMethod: 'qris',
      subtotal: 55_000,
      discountId: null,
      discountName: null,
      discountType: null,
      discountValue: null,
      discountAmount: 0,
      cashReceived: null,
      changeAmount: null,
      plateNumber: null,
    })
    expect(out).toContain('QRIS')
    expect(out).not.toContain('Kembali')
    expect(out).not.toContain('Plat')
  })

  it('marks voided receipts', () => {
    expect(text({ ...tx, status: 'void', voidReason: 'Salah input' })).toContain(
      '*** DIBATALKAN ***',
    )
  })

  it('is plain ASCII', () => {
    const out = text({ ...tx, plateNumber: 'B 1 Ä' }, 80)
    expect(/^[\x20-\x7e\n]*$/.test(out)).toBe(true)
  })
})

describe('text helpers', () => {
  it('maps typography to ASCII', () => {
    expect(toPrintable('Cuci — “Premium” café ×2 🚗')).toBe('Cuci - "Premium" cafe x2 ?')
  })

  it('wraps words and hard-splits long ones', () => {
    expect(wrapText('aaa bbb ccc', 7)).toEqual(['aaa bbb', 'ccc'])
    expect(wrapText('abcdefghij', 4)).toEqual(['abcd', 'efgh', 'ij'])
  })

  it('puts the right column on its own line when it cannot fit', () => {
    expect(twoColumns('Total', '100', 10)).toEqual(['Total  100'])
    expect(twoColumns('Nama panjang', 'Rp 1.000', 12)).toEqual(['Nama panjang', '    Rp 1.000'])
  })

  it('keeps the left indent', () => {
    expect(twoColumns('  1 x 5.000', '5.000', 20)).toEqual(['  1 x 5.000    5.000'])
  })
})

describe('discounted receipts (decision #35)', () => {
  it('shows subtotal and the discount line above the total', () => {
    const discounted: Transaction = {
      ...tx,
      subtotal: 55_000,
      discountId: 'd1',
      discountName: 'Member 10%',
      discountType: 'percent',
      discountValue: 10,
      discountAmount: 5_500,
      total: 49_500,
      cashReceived: 50_000,
      changeAmount: 500,
    }
    const text = receiptToText(formatReceipt(discounted, business, 58), 58)
    expect(text).toMatch(/Subtotal\s+Rp 55\.000/)
    expect(text).toMatch(/Diskon Member 10%\s+-Rp 5\.500/)
    expect(text).toMatch(/TOTAL\s+Rp 49\.500/)
  })

  it('prints no discount lines without a discount', () => {
    const text = receiptToText(formatReceipt(tx, business, 58), 58)
    expect(text).not.toMatch(/Diskon|Subtotal/)
  })
})
