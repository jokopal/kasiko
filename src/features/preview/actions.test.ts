import { beforeEach, describe, expect, it } from 'vitest'
import {
  addReserveMovement,
  createExpense,
  createTransaction,
  saveBusiness,
  voidExpense,
  voidTransaction,
} from './actions'
import { getPreviewState, resetPreviewState } from './store'

const BIZ = 'saimara'
const line = { itemId: 'x', name: 'Cuci', price: 35_000, qty: 2 }

beforeEach(() => {
  localStorage.clear()
  resetPreviewState()
})

describe('createTransaction', () => {
  it('stores snapshots, totals and an incrementing receipt number', () => {
    const now = new Date()
    const first = createTransaction(
      {
        businessId: BIZ,
        lines: [line],
        method: 'cash',
        cashReceived: 100_000,
        plateNumber: ' b 1 x ',
      },
      now,
    )
    const second = createTransaction(
      { businessId: BIZ, lines: [line], method: 'qris', cashReceived: null, plateNumber: '' },
      now,
    )
    if (!first.ok || !second.ok) throw new Error('expected success')
    expect(first.value).toMatchObject({ total: 70_000, changeAmount: 30_000, plateNumber: 'B 1 X' })
    expect(second.value).toMatchObject({
      cashReceived: null,
      changeAmount: null,
      plateNumber: null,
    })
    const seq = (no: string) => Number(no.slice(-4))
    expect(seq(second.value.receiptNo)).toBe(seq(first.value.receiptNo) + 1)
  })

  it('rejects empty carts and short cash', () => {
    const base = { businessId: BIZ, method: 'cash' as const, plateNumber: '' }
    expect(createTransaction({ ...base, lines: [], cashReceived: 0 }).ok).toBe(false)
    expect(createTransaction({ ...base, lines: [line], cashReceived: 50_000 }).ok).toBe(false)
  })
})

describe('voiding', () => {
  it('lets a cashier void today but not an older transaction', () => {
    const state = getPreviewState()
    const old = state.transactions.find(
      (t) => t.status === 'paid' && Date.now() - Date.parse(t.occurredAt) > 3 * 86_400_000,
    )!
    expect(voidTransaction({ id: old.id, reason: 'Salah input', role: 'cashier' }).ok).toBe(false)
    expect(voidTransaction({ id: old.id, reason: 'Salah input', role: 'owner' }).ok).toBe(true)
    expect(getPreviewState().transactions.find((t) => t.id === old.id)?.status).toBe('void')
    // never deleted
    expect(getPreviewState().transactions).toHaveLength(state.transactions.length)
  })

  it('keeps cashiers away from owner expenses', () => {
    const category = getPreviewState().expenseCategories.find((c) => c.businessId === BIZ)!
    const created = createExpense({
      businessId: BIZ,
      categoryId: category.id,
      amount: 1_000_000,
      note: 'Sewa',
      source: 'owner',
    })
    if (!created.ok) throw new Error(created.error)
    expect(voidExpense({ id: created.value.id, reason: 'Salah', role: 'cashier' }).ok).toBe(false)
  })
})

describe('reserve & settings validation', () => {
  it('requires a reason and enough balance to withdraw', () => {
    const base = { businessId: BIZ, type: 'withdraw' as const, source: null }
    expect(addReserveMovement({ ...base, amount: 1_000, reason: '' }).ok).toBe(false)
    expect(addReserveMovement({ ...base, amount: 10 ** 12, reason: 'Terlalu besar' }).ok).toBe(
      false,
    )
    expect(addReserveMovement({ ...base, amount: 1_000, reason: 'Servis' }).ok).toBe(true)
  })

  it('rejects invalid brand settings', () => {
    const business = getPreviewState().businesses[0]!
    expect(saveBusiness({ ...business, primaryColor: 'teal' }).ok).toBe(false)
    expect(saveBusiness({ ...business, receiptPrefix: 'x' }).ok).toBe(false)
    expect(saveBusiness({ ...business, name: 'Saimara Baru' }).ok).toBe(true)
  })
})
