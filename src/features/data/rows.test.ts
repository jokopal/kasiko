import { describe, expect, it } from 'vitest'
import type { Order } from '@/lib/types'
import {
  expensePayload,
  orderPayload,
  toExpense,
  toOrder,
  toTransaction,
  transactionPayload,
  type OrderRow,
  type TransactionRow,
} from './rows'

const row: TransactionRow = {
  id: 't1',
  business_id: 'b1',
  receipt_no: 'SMR-261025-A0001',
  occurred_at: '2026-10-25T02:00:00Z',
  received_at: '2026-10-25T02:00:05Z',
  plate_number: 'B 1 XY',
  payment_method: 'cash',
  subtotal: 55_000,
  discount_id: 'd1',
  discount_name: 'Member 10%',
  discount_type: 'percent',
  discount_value: 10,
  discount_amount: 5_500,
  total: 49_500,
  cash_received: 50_000,
  change_amount: 500,
  status: 'paid',
  void_reason: null,
  voided_at: null,
  device_id: 'dev',
  order_id: 'o1',
  transaction_items: [
    {
      id: 'i2',
      catalog_item_id: null,
      name_snapshot: 'Semir Ban',
      price_snapshot: 10_000,
      qty: 1,
      line_total: 10_000,
      position: 2,
    },
    {
      id: 'i1',
      catalog_item_id: 'c1',
      name_snapshot: 'Cuci Sedang',
      price_snapshot: 45_000,
      qty: 1,
      line_total: 45_000,
      position: 1,
    },
  ],
}

describe('transactions', () => {
  it('maps a row with its items in receipt order', () => {
    const t = toTransaction(row)
    expect(t.items.map((i) => i.nameSnapshot)).toEqual(['Cuci Sedang', 'Semir Ban'])
    expect(t).toMatchObject({
      subtotal: 55_000,
      discountAmount: 5_500,
      total: 49_500,
      orderId: 'o1',
    })
  })

  it('round-trips into the create_transaction payload', () => {
    const payload = transactionPayload(toTransaction(row))
    expect(payload).toMatchObject({
      id: 't1',
      business_id: 'b1',
      subtotal: 55_000,
      discount_id: 'd1',
      discount_amount: 5_500,
      total: 49_500,
      order_id: 'o1',
      status: 'paid',
    })
    expect(payload.items[0]).toEqual({
      id: 'i1',
      catalog_item_id: 'c1',
      name_snapshot: 'Cuci Sedang',
      price_snapshot: 45_000,
      qty: 1,
      line_total: 45_000,
    })
  })

  it('derives the subtotal for rows written before discounts existed', () => {
    expect(toTransaction({ ...row, subtotal: null, discount_amount: null }).subtotal).toBe(49_500)
  })
})

describe('orders and expenses', () => {
  it('round-trips an order', () => {
    const orderRow: OrderRow = {
      id: 'o1',
      business_id: 'b1',
      device_id: 'dev',
      plate_number: null,
      items: [{ catalog_item_id: 'c1', name: 'Cuci', price: 45_000, qty: 2 }],
      total: 90_000,
      status: 'open',
      opened_at: '2026-10-25T01:00:00Z',
      device_updated_at: '2026-10-25T01:10:00Z',
      transaction_id: null,
      cancel_reason: null,
      cancelled_at: null,
    }
    const order: Order = toOrder(orderRow)
    expect(order.items[0]).toEqual({ catalogItemId: 'c1', name: 'Cuci', price: 45_000, qty: 2 })
    expect(orderPayload(order)).toMatchObject({
      id: 'o1',
      device_updated_at: '2026-10-25T01:10:00Z',
      items: [{ catalog_item_id: 'c1', name: 'Cuci', price: 45_000, qty: 2 }],
    })
  })

  it('sends the device with a drawer expense', () => {
    const expense = toExpense({
      id: 'e1',
      business_id: 'b1',
      category_id: 'c1',
      amount: 20_000,
      note: 'makan',
      source: 'drawer',
      occurred_at: '2026-10-25T05:00:00Z',
      received_at: null,
      status: 'active',
      void_reason: null,
      voided_at: null,
    })
    expect(expensePayload(expense, 'dev')).toMatchObject({ source: 'drawer', device_id: 'dev' })
  })
})
