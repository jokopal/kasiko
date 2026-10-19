import { beforeEach, describe, expect, it } from 'vitest'
import type { Expense, Transaction } from '@/lib/types'
import {
  rpcCreateExpense,
  rpcCreateTransaction,
  rpcRegisterDevice,
  rpcVoidExpense,
  rpcVoidTransaction,
} from './server'
import { getPreviewState, resetPreviewState } from './store'

const BIZ = 'saimara'
let deviceId = ''

function sale(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: crypto.randomUUID(),
    businessId: BIZ,
    receiptNo: `SMR-261012-B${String(Math.floor(Math.random() * 9999)).padStart(4, '0')}`,
    occurredAt: new Date().toISOString(),
    plateNumber: ' b 1 x ',
    paymentMethod: 'cash',
    total: 70_000,
    cashReceived: 100_000,
    changeAmount: 30_000,
    status: 'paid',
    voidReason: null,
    voidedAt: null,
    deviceId,
    receivedAt: null,
    items: [
      {
        id: 'i1',
        catalogItemId: null,
        nameSnapshot: 'Cuci',
        priceSnapshot: 35_000,
        qty: 2,
        lineTotal: 70_000,
      },
    ],
    ...overrides,
  }
}

beforeEach(() => {
  localStorage.clear()
  resetPreviewState()
  const device = rpcRegisterDevice(BIZ)
  if (!device.ok) throw new Error(device.error)
  deviceId = device.value.id
})

describe('rpcRegisterDevice', () => {
  it('hands out unused codes and never reuses them', () => {
    const codes = getPreviewState()
      .devices.filter((d) => d.businessId === BIZ)
      .map((d) => d.code)
    expect(codes).toEqual(['A', 'B'])
    const next = rpcRegisterDevice(BIZ)
    expect(next.ok && next.value.code).toBe('C')
  })
})

describe('rpcCreateTransaction', () => {
  it('stores a valid sale with server time and normalised plate', () => {
    const result = rpcCreateTransaction(sale())
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.receivedAt).not.toBeNull()
    expect(result.value.plateNumber).toBe('B 1 X')
  })

  it('is idempotent on the client id', () => {
    const record = sale()
    rpcCreateTransaction(record)
    const before = getPreviewState().transactions.length
    expect(rpcCreateTransaction(record).ok).toBe(true)
    expect(getPreviewState().transactions).toHaveLength(before)
  })

  it.each([
    ['tampered total', { total: 1 }],
    ['wrong change', { changeAmount: 0 }],
    ['short cash', { cashReceived: 10_000, changeAmount: null }],
    ['unknown device', { deviceId: 'nope' }],
    ['created as void', { status: 'void' as const }],
    ['no items', { items: [] }],
  ])('rejects %s', (_, overrides) => {
    expect(rpcCreateTransaction(sale(overrides)).ok).toBe(false)
  })

  it('rejects a recomputed line total mismatch', () => {
    const items = [
      { id: 'i', catalogItemId: null, nameSnapshot: 'x', priceSnapshot: 10, qty: 2, lineTotal: 25 },
    ]
    expect(
      rpcCreateTransaction(sale({ items, total: 25, cashReceived: 25, changeAmount: 0 })).ok,
    ).toBe(false)
  })

  it('rejects a duplicate receipt number', () => {
    const first = sale()
    rpcCreateTransaction(first)
    expect(rpcCreateTransaction(sale({ receiptNo: first.receiptNo })).ok).toBe(false)
  })

  it('accepts a stale snapshot price (offline catalog)', () => {
    const items = [
      {
        id: 'i',
        catalogItemId: 'old',
        nameSnapshot: 'Harga lama',
        priceSnapshot: 1_000,
        qty: 1,
        lineTotal: 1_000,
      },
    ]
    expect(
      rpcCreateTransaction(sale({ items, total: 1_000, cashReceived: 1_000, changeAmount: 0 })).ok,
    ).toBe(true)
  })
})

describe('rpcVoidTransaction', () => {
  it('lets the cashier void today, idempotently', () => {
    const record = sale()
    rpcCreateTransaction(record)
    const request = {
      id: record.id,
      reason: 'Salah input',
      voidedAt: new Date().toISOString(),
      role: 'cashier' as const,
    }
    expect(rpcVoidTransaction(request).ok).toBe(true)
    expect(rpcVoidTransaction(request).ok).toBe(true) // retried by the sync engine
  })

  it('rejects a cashier void with a clock from the future', () => {
    const record = sale()
    rpcCreateTransaction(record)
    const future = new Date(Date.now() + 60 * 60_000).toISOString()
    expect(
      rpcVoidTransaction({ id: record.id, reason: 'Salah', voidedAt: future, role: 'cashier' }).ok,
    ).toBe(false)
  })

  it('blocks cashiers on old transactions but not owners', () => {
    const old = getPreviewState().transactions.find(
      (t) => t.status === 'paid' && Date.now() - Date.parse(t.occurredAt) > 3 * 86_400_000,
    )!
    const now = new Date().toISOString()
    expect(
      rpcVoidTransaction({ id: old.id, reason: 'Salah', voidedAt: now, role: 'cashier' }).ok,
    ).toBe(false)
    expect(
      rpcVoidTransaction({ id: old.id, reason: 'Salah', voidedAt: now, role: 'owner' }).ok,
    ).toBe(true)
  })
})

describe('expenses', () => {
  function expense(overrides: Partial<Expense> = {}): Expense {
    const category = getPreviewState().expenseCategories.find((c) => c.businessId === BIZ)!
    return {
      id: crypto.randomUUID(),
      businessId: BIZ,
      categoryId: category.id,
      amount: 25_000,
      note: ' sabun ',
      source: 'drawer',
      occurredAt: new Date().toISOString(),
      status: 'active',
      voidReason: null,
      voidedAt: null,
      receivedAt: null,
      ...overrides,
    }
  }

  it('lets cashiers record drawer expenses only', () => {
    expect(rpcCreateExpense(expense(), 'cashier').ok).toBe(true)
    expect(rpcCreateExpense(expense({ source: 'owner' }), 'cashier').ok).toBe(false)
    expect(rpcCreateExpense(expense({ source: 'owner' }), 'owner').ok).toBe(true)
  })

  it('rejects non-positive amounts and foreign categories', () => {
    expect(rpcCreateExpense(expense({ amount: 0 }), 'cashier').ok).toBe(false)
    const foreign = getPreviewState().expenseCategories.find((c) => c.businessId !== BIZ)!
    expect(rpcCreateExpense(expense({ categoryId: foreign.id }), 'cashier').ok).toBe(false)
  })

  it('lets cashiers use only the categories the owner allows for the drawer', () => {
    const ownerOnly = getPreviewState().expenseCategories.find(
      (c) => c.businessId === BIZ && !c.allowDrawer,
    )!
    expect(rpcCreateExpense(expense({ categoryId: ownerOnly.id }), 'cashier').ok).toBe(false)
    const asOwner = expense({ categoryId: ownerOnly.id, source: 'owner' })
    expect(rpcCreateExpense(asOwner, 'owner').ok).toBe(true)
  })

  it('keeps cashiers away from owner expenses', () => {
    const owner = expense({ source: 'owner' })
    rpcCreateExpense(owner, 'owner')
    const request = {
      id: owner.id,
      reason: 'Salah',
      voidedAt: new Date().toISOString(),
      role: 'cashier' as const,
    }
    expect(rpcVoidExpense(request).ok).toBe(false)
  })
})
