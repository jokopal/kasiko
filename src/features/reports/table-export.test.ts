import { describe, expect, it } from 'vitest'
import type { Expense, ExpenseCategory, Transaction } from '@/lib/types'
import { expenseSheetRows, transactionSheetRows } from './table-export'

const tx = {
  id: 't1',
  receiptNo: 'SMR-261025-A0001',
  occurredAt: '2026-10-25T02:30:00Z',
  plateNumber: 'B 1 XY',
  paymentMethod: 'qris',
  subtotal: 55_000,
  discountAmount: 5_500,
  discountName: 'Member 10%',
  total: 49_500,
  status: 'paid',
  voidReason: null,
  items: [
    { nameSnapshot: 'Cuci Sedang', qty: 1 },
    { nameSnapshot: 'Semir Ban', qty: 2 },
  ],
} as unknown as Transaction

describe('table exports', () => {
  it('writes one row per transaction with numeric amounts', () => {
    const [header, row] = transactionSheetRows([tx], 'Asia/Jakarta')
    expect(header?.[0]).toBe('Waktu')
    expect(row).toEqual([
      expect.stringContaining('09.30'),
      'SMR-261025-A0001',
      'B 1 XY',
      'Cuci Sedang, Semir Ban x2',
      'QRIS',
      55_000,
      5_500,
      'Member 10%',
      49_500,
      'Lunas',
      null,
    ])
  })

  it('names the category and its kind for expenses', () => {
    const categories = [{ id: 'c1', name: 'Cicilan', kind: 'non_operating' }] as ExpenseCategory[]
    const expense = {
      categoryId: 'c1',
      occurredAt: '2026-10-25T02:30:00Z',
      source: 'owner',
      note: '',
      amount: 4_800_000,
      status: 'void',
      voidReason: 'Dobel',
    } as unknown as Expense
    const [, row] = expenseSheetRows([expense], categories, 'Asia/Jakarta')
    expect(row?.slice(1)).toEqual([
      'Cicilan',
      'Non-operasional',
      'Owner',
      null,
      4_800_000,
      'Dibatalkan',
      'Dobel',
    ])
  })
})
