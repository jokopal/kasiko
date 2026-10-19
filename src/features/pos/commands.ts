import type { DeviceRecord } from '@/features/offline/db'
import { takeSequence } from '@/features/offline/device'
import { enqueue } from '@/features/offline/outbox'
import { formatReceiptNo } from '@/features/receipt/receipt-number'
import { businessDayKey } from '@/lib/datetime'
import { newId } from '@/lib/id'
import { fail, ok, type Result } from '@/lib/result'
import type { Business, Expense, ExpenseCategory, PaymentMethod, Transaction } from '@/lib/types'
import { cartTotal, lineTotal, type CartLine } from './cart'
import { settlePayment } from './payment'
import { normalizePlate } from './plate'
import { checkVoid } from './void-policy'

// Cashier writes. Each one validates locally, writes to the outbox and returns at once,
// so selling, receipts and voids work the same online and offline (decision #7).

export interface SaleInput {
  business: Business
  device: DeviceRecord
  lines: CartLine[]
  method: PaymentMethod
  cashReceived: number | null
  plateNumber: string
}

export async function recordSale(input: SaleInput, now = new Date()): Promise<Result<Transaction>> {
  const { business, device } = input
  if (input.lines.length === 0) return fail('Keranjang masih kosong')
  const total = cartTotal(input.lines)
  const payment = settlePayment({ method: input.method, total, cashReceived: input.cashReceived })
  if (!payment.ok) return payment

  const seq = await takeSequence(business.id, businessDayKey(now, business.timezone))
  const record: Transaction = {
    id: newId(),
    businessId: business.id,
    receiptNo: formatReceiptNo({
      prefix: business.receiptPrefix,
      occurredAt: now,
      timeZone: business.timezone,
      deviceCode: device.deviceCode,
      seq,
    }),
    occurredAt: now.toISOString(),
    plateNumber: normalizePlate(input.plateNumber),
    paymentMethod: input.method,
    total,
    cashReceived: payment.cashReceived,
    changeAmount: payment.changeAmount,
    status: 'paid',
    voidReason: null,
    voidedAt: null,
    deviceId: device.deviceId,
    receivedAt: null,
    items: input.lines.map((line) => ({
      id: newId(),
      catalogItemId: line.itemId,
      nameSnapshot: line.name,
      priceSnapshot: line.price,
      qty: line.qty,
      lineTotal: lineTotal(line),
    })),
  }
  await enqueue(business.id, { kind: 'transaction.create', record })
  return ok(record)
}

/** Categories the cashier may pay from the drawer: active and allowed by the owner. */
export const isDrawerCategory = (category: ExpenseCategory) =>
  category.isActive && category.allowDrawer

export interface DrawerExpenseInput {
  businessId: string
  categories: readonly ExpenseCategory[]
  categoryId: string
  amount: number
  note: string
}

export async function recordDrawerExpense(
  input: DrawerExpenseInput,
  now = new Date(),
): Promise<Result<Expense>> {
  if (!Number.isSafeInteger(input.amount) || input.amount <= 0) {
    return fail('Nominal harus lebih dari 0')
  }
  if (!input.categories.some((c) => c.id === input.categoryId && isDrawerCategory(c))) {
    return fail('Pilih kategori pengeluaran')
  }
  const record: Expense = {
    id: newId(),
    businessId: input.businessId,
    categoryId: input.categoryId,
    amount: input.amount,
    note: input.note.trim(),
    source: 'drawer',
    occurredAt: now.toISOString(),
    status: 'active',
    voidReason: null,
    voidedAt: null,
    receivedAt: null,
  }
  await enqueue(input.businessId, { kind: 'expense.create', record })
  return ok(record)
}

export async function requestVoid(
  target: { kind: 'transaction'; row: Transaction } | { kind: 'expense'; row: Expense },
  business: Business,
  reason: string,
  now = new Date(),
): Promise<Result> {
  if (target.kind === 'expense' && target.row.source !== 'drawer') {
    return fail('Kasir hanya bisa membatalkan pengeluaran laci')
  }
  const check = checkVoid({
    role: 'cashier',
    isAlreadyVoid: target.row.status === 'void',
    occurredAt: new Date(target.row.occurredAt),
    requestedAt: now,
    timeZone: business.timezone,
    reason,
  })
  if (!check.ok) return check
  await enqueue(business.id, {
    kind: target.kind === 'transaction' ? 'transaction.void' : 'expense.void',
    targetId: target.row.id,
    reason: check.reason,
    voidedAt: now.toISOString(),
  })
  return ok(undefined)
}
