import { beforeEach, describe, expect, it } from 'vitest'
import { db, type DeviceRecord } from '@/features/offline/db'
import type { Business, ExpenseCategory } from '@/lib/types'
import { recordDrawerExpense, recordSale, requestVoid } from './commands'

const business: Business = {
  id: 'biz',
  name: 'Saimara',
  logoUrl: null,
  address: '',
  phone: '',
  receiptFooter: '',
  primaryColor: '#0e7490',
  receiptPrefix: 'SMR',
  timezone: 'Asia/Jakarta',
  openingCash: 0,
  isActive: true,
}
const device: DeviceRecord = {
  businessId: 'biz',
  deviceId: 'dev-1',
  deviceCode: 'B',
  registeredAt: '',
}
const line = { itemId: 'item', name: 'Cuci', price: 35_000, qty: 1 }
const sale = {
  business,
  device,
  lines: [line],
  method: 'cash' as const,
  cashReceived: 50_000,
  plateNumber: '',
}

beforeEach(async () => {
  await Promise.all([db.outbox.clear(), db.sequences.clear()])
})

describe('recordSale', () => {
  it('writes to the outbox with a device-local receipt number', async () => {
    const at = new Date('2026-10-12T03:00:00Z')
    const first = await recordSale(sale, at)
    const second = await recordSale(sale, at)
    if (!first.ok || !second.ok) throw new Error('expected success')
    expect(first.value.receiptNo).toBe('SMR-261012-B0001')
    expect(second.value.receiptNo).toBe('SMR-261012-B0002')
    expect(first.value).toMatchObject({ total: 35_000, changeAmount: 15_000, receivedAt: null })
    const queued = await db.outbox.orderBy('seq').toArray()
    expect(queued.map((e) => e.id)).toEqual([first.value.id, second.value.id])
  })

  it('restarts the sequence on a new business day', async () => {
    await recordSale(sale, new Date('2026-10-12T16:59:00Z')) // 23:59 WIB
    const next = await recordSale(sale, new Date('2026-10-12T17:01:00Z')) // 00:01 WIB
    expect(next.ok && next.value.receiptNo).toBe('SMR-261013-B0001')
  })

  it('rejects invalid payments without touching the queue', async () => {
    expect((await recordSale({ ...sale, cashReceived: 1_000 })).ok).toBe(false)
    expect(await db.outbox.count()).toBe(0)
  })
})

describe('requestVoid', () => {
  it('queues a void after its create', async () => {
    const created = await recordSale(sale)
    if (!created.ok) throw new Error(created.error)
    const result = await requestVoid({ kind: 'transaction', row: created.value }, business, 'Salah')
    expect(result.ok).toBe(true)
    const kinds = (await db.outbox.orderBy('seq').toArray()).map((e) => e.operation.kind)
    expect(kinds).toEqual(['transaction.create', 'transaction.void'])
  })

  it('applies the same-day rule locally', async () => {
    const created = await recordSale(sale, new Date('2026-10-10T03:00:00Z'))
    if (!created.ok) throw new Error(created.error)
    const result = await requestVoid(
      { kind: 'transaction', row: created.value },
      business,
      'Salah',
      new Date('2026-10-12T03:00:00Z'),
    )
    expect(result.ok).toBe(false)
  })
})

describe('recordDrawerExpense', () => {
  const drawer = { kind: 'operating', allowDrawer: true } as const
  const categories: ExpenseCategory[] = [
    { id: 'c1', businessId: 'biz', name: 'Bahan', sortOrder: 0, isActive: true, ...drawer },
    { id: 'c2', businessId: 'biz', name: 'Lama', sortOrder: 1, isActive: false, ...drawer },
    {
      id: 'c3',
      businessId: 'biz',
      name: 'Cicilan',
      sortOrder: 2,
      isActive: true,
      kind: 'non_operating',
      allowDrawer: false,
    },
  ]

  it('queues a drawer expense', async () => {
    const result = await recordDrawerExpense({
      businessId: 'biz',
      categories,
      categoryId: 'c1',
      amount: 20_000,
      note: ' sabun ',
    })
    expect(result.ok && result.value).toMatchObject({ source: 'drawer', note: 'sabun' })
  })

  it('rejects inactive categories and zero amounts', async () => {
    const base = { businessId: 'biz', categories, note: '' }
    expect((await recordDrawerExpense({ ...base, categoryId: 'c2', amount: 1 })).ok).toBe(false)
    expect((await recordDrawerExpense({ ...base, categoryId: 'c1', amount: 0 })).ok).toBe(false)
  })

  it('rejects categories the owner keeps off the cashier screen', async () => {
    const base = { businessId: 'biz', categories, note: '', amount: 10_000 }
    expect((await recordDrawerExpense({ ...base, categoryId: 'c3' })).ok).toBe(false)
  })
})
