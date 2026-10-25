import type { DeviceRecord } from '@/features/offline/db'
import { takeSequence } from '@/features/offline/device'
import { enqueue } from '@/features/offline/outbox'
import { formatReceiptNo } from '@/features/receipt/receipt-number'
import { businessDayKey } from '@/lib/datetime'
import { newId } from '@/lib/id'
import { fail, ok, type Result } from '@/lib/result'
import type {
  Business,
  Discount,
  Expense,
  ExpenseCategory,
  Order,
  PaymentMethod,
  Transaction,
} from '@/lib/types'
import { cartTotal, lineTotal, type CartLine } from './cart'
import { discountAmount } from './discount'
import { settlePayment } from './payment'
import { normalizePlate } from './plate'
import { checkVoid } from './void-policy'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Cart lines restored from an order may no longer point at a catalog item. */
const catalogItemIdOf = (line: CartLine) => (UUID.test(line.itemId) ? line.itemId : null)

// Cashier writes. Each one validates locally, writes to the outbox and returns at once,
// so selling, receipts and voids work the same online and offline (decision #7).

export interface SaleInput {
  business: Business
  device: DeviceRecord
  lines: CartLine[]
  method: PaymentMethod
  cashReceived: number | null
  plateNumber: string
  /** Active preset chosen by the cashier (decision #35). */
  discount?: Discount | null
  /** The open order this sale settles (decision #34). */
  orderId?: string | null
}

export async function recordSale(input: SaleInput, now = new Date()): Promise<Result<Transaction>> {
  const { business, device } = input
  if (input.lines.length === 0) return fail('Keranjang masih kosong')
  const subtotal = cartTotal(input.lines)
  const discount = input.discount ?? null
  const cut = discount ? discountAmount(subtotal, discount.type, discount.value) : 0
  if (cut >= subtotal && subtotal > 0) return fail('Diskon tidak boleh melebihi total')
  const total = subtotal - cut
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
    subtotal,
    discountId: discount?.id ?? null,
    discountName: discount?.name ?? null,
    discountType: discount?.type ?? null,
    discountValue: discount?.value ?? null,
    discountAmount: cut,
    total,
    cashReceived: payment.cashReceived,
    changeAmount: payment.changeAmount,
    status: 'paid',
    voidReason: null,
    voidedAt: null,
    deviceId: device.deviceId,
    receivedAt: null,
    orderId: input.orderId ?? null,
    items: input.lines.map((line) => ({
      id: newId(),
      catalogItemId: catalogItemIdOf(line),
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
  deviceId: string
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
  await enqueue(input.businessId, { kind: 'expense.create', record, deviceId: input.deviceId })
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

// --- Pay-at-the-end orders (decision #34) ---------------------------------------------

export interface OrderInput {
  business: Business
  device: DeviceRecord
  lines: CartLine[]
  plateNumber: string
  /** Set when editing an order that is already open. */
  existing?: Pick<Order, 'id' | 'openedAt'> | null
}

/** Checks a car in (or updates its open order). Queued, so it works offline. */
export async function saveOrder(input: OrderInput, now = new Date()): Promise<Result<Order>> {
  if (input.lines.length === 0) return fail('Pilih layanan dulu')
  const record: Order = {
    id: input.existing?.id ?? newId(),
    businessId: input.business.id,
    deviceId: input.device.deviceId,
    plateNumber: normalizePlate(input.plateNumber),
    items: input.lines.map((line) => ({
      catalogItemId: catalogItemIdOf(line),
      name: line.name,
      price: line.price,
      qty: line.qty,
    })),
    total: cartTotal(input.lines),
    status: 'open',
    openedAt: input.existing?.openedAt ?? now.toISOString(),
    deviceUpdatedAt: now.toISOString(),
    transactionId: null,
    cancelReason: null,
    cancelledAt: null,
  }
  await enqueue(input.business.id, { kind: 'order.save', record })
  return ok(record)
}

export async function cancelOrder(order: Order, reason: string, now = new Date()): Promise<Result> {
  const trimmed = reason.trim()
  if (order.status !== 'open') return fail('Pesanan ini sudah ditutup')
  if (trimmed.length < 3) return fail('Alasan pembatalan wajib diisi')
  await enqueue(order.businessId, {
    kind: 'order.cancel',
    targetId: order.id,
    reason: trimmed,
    cancelledAt: now.toISOString(),
  })
  return ok(undefined)
}
