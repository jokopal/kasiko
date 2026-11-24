import { describe, expect, it } from 'vitest'
import {
  importPeriods,
  mappingToSave,
  parseOlseraSheet,
  productsOf,
  suggestChoice,
  type OlseraCell,
} from './olsera-import'

// The shape of a real export, with made-up numbers (decision #27: no owner figures in code).
const HEADER: OlseraCell[] = [
  'product',
  'alternative_name',
  'variant',
  'group',
  'sku',
  'barcode',
  'brand',
  'sold qty',
  'currency',
  'subtotal sales amount',
  'discount item amount',
  'prorate discount billing',
  'prorate redeem billing',
  'total sales return',
  'total sales amount',
  'total cost price',
  'profit',
  'total sales order',
  'average qty sold',
]
const row = (
  product: string,
  group: string,
  qty: number,
  amount: number,
  returns = 0,
  orders = qty,
): OlseraCell[] => [
  product,
  null,
  null,
  group,
  null,
  null,
  null,
  qty,
  'IDR',
  amount,
  0,
  0,
  0,
  returns,
  amount,
  0,
  amount,
  orders,
  1,
]
const FILE = 'Penjualan berdasarkan SKU-2026-03-01__2026-03-31.xlsx'

describe('parseOlseraSheet', () => {
  it('reads the period from the file name and nets returns', () => {
    const result = parseOlseraSheet(FILE, [
      HEADER,
      row('Mobil Sedang', 'Cuci Standart Hidrolik', 10.0, 500_000, -50_000, 11),
      row('Custom', 'CUSTOM', 2, 120_000),
      [null],
    ])
    expect(result).toEqual({
      ok: true,
      report: {
        fileName: FILE,
        firstDay: '2026-03-01',
        lastDay: '2026-03-31',
        rows: [
          {
            product: 'Mobil Sedang',
            productGroup: 'Cuci Standart Hidrolik',
            qty: 10,
            orders: 11,
            amount: 450_000,
          },
          { product: 'Custom', productGroup: 'CUSTOM', qty: 2, orders: 2, amount: 120_000 },
        ],
      },
    })
  })

  it('refuses files without a period or the SKU columns', () => {
    expect(parseOlseraSheet('laporan.xlsx', [HEADER]).ok).toBe(false)
    expect(parseOlseraSheet(FILE, [['tanggal', 'pendapatan']]).ok).toBe(false)
  })

  it('merges a product listed twice', () => {
    const result = parseOlseraSheet(FILE, [
      HEADER,
      row('Golda', 'Minuman', 2, 10_000),
      row('golda ', 'Minuman', 1, 5_000),
    ])
    expect(result.ok && result.report.rows).toEqual([
      { product: 'Golda', productGroup: 'Minuman', qty: 3, orders: 3, amount: 15_000 },
    ])
  })
})

const items = [
  { id: 'sedang', name: 'Cuci Mobil Sedang', isActive: true },
  { id: 'mesin', name: 'Cuci Mesin Mobil', isActive: true },
]
const aliases = { 'Cuci Mobil Sedang': ['Mobil Sedang'] }

describe('matching products to catalog items', () => {
  it('prefers the remembered mapping, then an alias, then the same name', () => {
    expect(suggestChoice('mobil sedang', items, { 'mobil sedang': 'mesin' }, aliases)).toEqual({
      kind: 'item',
      itemId: 'mesin',
    })
    expect(suggestChoice('mobil sedang', items, {}, aliases)).toEqual({
      kind: 'item',
      itemId: 'sedang',
    })
    expect(suggestChoice('cuci mesin mobil', items, {}, aliases)).toEqual({
      kind: 'item',
      itemId: 'mesin',
    })
    expect(suggestChoice('custom', items, {}, aliases)).toEqual({ kind: 'none' })
    expect(suggestChoice('golda', items, { golda: 'skip' }, aliases)).toEqual({ kind: 'skip' })
  })

  it('ignores a remembered item that no longer exists', () => {
    expect(suggestChoice('custom', items, { custom: 'gone' }, aliases)).toEqual({ kind: 'none' })
  })
})

describe('building the import', () => {
  const march = parseOlseraSheet(FILE, [
    HEADER,
    row('Mobil Sedang', 'Cuci', 10, 500_000),
    row('Golda', 'Minuman', 3, 15_000),
    row('Custom', 'CUSTOM', 1, 50_000),
  ])
  const reports = march.ok ? [march.report] : []

  it('lists products by revenue', () => {
    expect(productsOf(reports).map((p) => p.key)).toEqual(['mobil sedang', 'custom', 'golda'])
  })

  it('links, keeps unlinked and skips per choice; remembers links and skips only', () => {
    const choices = {
      'mobil sedang': { kind: 'item', itemId: 'sedang' },
      golda: { kind: 'skip' },
      custom: { kind: 'none' },
    } as const
    expect(importPeriods(reports, choices)).toEqual([
      {
        firstDay: '2026-03-01',
        lastDay: '2026-03-31',
        rows: [
          {
            product: 'Mobil Sedang',
            productGroup: 'Cuci',
            qty: 10,
            orders: 10,
            amount: 500_000,
            catalogItemId: 'sedang',
          },
          {
            product: 'Custom',
            productGroup: 'CUSTOM',
            qty: 1,
            orders: 1,
            amount: 50_000,
            catalogItemId: null,
          },
        ],
      },
    ])
    expect(mappingToSave(choices)).toEqual({ 'mobil sedang': 'sedang', golda: 'skip' })
  })
})
