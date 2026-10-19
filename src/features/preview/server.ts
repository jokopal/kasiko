import { cartTotal } from '@/features/pos/cart'
import { settlePayment } from '@/features/pos/payment'
import { normalizePlate } from '@/features/pos/plate'
import { checkVoid, isPlausibleClientTime } from '@/features/pos/void-policy'
import { newId } from '@/lib/id'
import { fail, ok, type Result } from '@/lib/result'
import type { Expense, Role, Transaction } from '@/lib/types'
import type { PreviewState, RegisteredDevice } from './seed'
import { getPreviewState, setPreviewState } from './store'

// Stand-in for the Supabase RPCs (decisions #14–#18). Every check here is what the SQL
// functions must enforce: the client is never trusted, and every call is idempotent on
// the client-generated id so the sync engine can safely retry.

const DEVICE_CODES = (() => {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')
  return [...letters, ...letters.flatMap((a) => letters.map((b) => a + b))]
})()

/** Assigns the next unused device code for the business. Codes are never reused. */
export function rpcRegisterDevice(businessId: string, now = new Date()): Result<RegisteredDevice> {
  const state = getPreviewState()
  if (!state.businesses.some((b) => b.id === businessId && b.isActive)) {
    return fail('Usaha tidak ditemukan atau nonaktif')
  }
  const used = new Set(state.devices.filter((d) => d.businessId === businessId).map((d) => d.code))
  const code = DEVICE_CODES.find((c) => !used.has(c))
  if (!code) return fail('Kode perangkat untuk usaha ini sudah habis')
  const device: RegisteredDevice = {
    id: newId(),
    businessId,
    code,
    registeredAt: now.toISOString(),
  }
  setPreviewState((s) => ({ ...s, devices: [...s.devices, device] }))
  return ok(device)
}

function businessOf(state: PreviewState, businessId: string) {
  return state.businesses.find((b) => b.id === businessId && b.isActive)
}

/** create_transaction(jsonb): validates and recomputes, then inserts once. */
export function rpcCreateTransaction(record: Transaction, now = new Date()): Result<Transaction> {
  const state = getPreviewState()
  const existing = state.transactions.find((t) => t.id === record.id)
  if (existing) return ok(existing) // ON CONFLICT (id) DO NOTHING

  if (!businessOf(state, record.businessId)) return fail('Usaha tidak ditemukan atau nonaktif')
  if (!state.devices.some((d) => d.id === record.deviceId && d.businessId === record.businessId)) {
    return fail('Perangkat belum terdaftar untuk usaha ini')
  }
  if (
    state.transactions.some(
      (t) => t.businessId === record.businessId && t.receiptNo === record.receiptNo,
    )
  ) {
    return fail(`Nomor nota ${record.receiptNo} sudah dipakai`)
  }
  if (record.status !== 'paid') return fail('Transaksi baru harus berstatus lunas')
  if (record.items.length === 0) return fail('Transaksi tanpa item')
  for (const item of record.items) {
    if (!Number.isInteger(item.qty) || item.qty <= 0) return fail('Jumlah item tidak valid')
    if (!Number.isSafeInteger(item.priceSnapshot) || item.priceSnapshot < 0) {
      return fail('Harga item tidak valid')
    }
    // Snapshot prices are accepted (the offline catalog may be stale, decision #15),
    // but the arithmetic is always recomputed.
    if (item.lineTotal !== item.priceSnapshot * item.qty) return fail('Subtotal item tidak cocok')
  }
  const total = cartTotal(
    record.items.map((i) => ({
      itemId: i.id,
      name: i.nameSnapshot,
      price: i.priceSnapshot,
      qty: i.qty,
    })),
  )
  if (total !== record.total) return fail('Total transaksi tidak cocok')
  const payment = settlePayment({
    method: record.paymentMethod,
    total,
    cashReceived: record.cashReceived,
  })
  if (!payment.ok) return payment
  if (
    payment.changeAmount !== record.changeAmount ||
    payment.cashReceived !== record.cashReceived
  ) {
    return fail('Data pembayaran tidak cocok')
  }

  const stored: Transaction = {
    ...record,
    plateNumber: record.plateNumber === null ? null : normalizePlate(record.plateNumber),
    receivedAt: now.toISOString(),
  }
  setPreviewState((s) => ({ ...s, transactions: [...s.transactions, stored] }))
  return ok(stored)
}

export interface VoidRequest {
  id: string
  reason: string
  /** When the void was requested on the device (decision #18). */
  voidedAt: string
  role: Role
}

function voidRow<T extends Transaction | Expense>(
  row: T,
  request: VoidRequest,
  timeZone: string,
  now: Date,
): Result<T> {
  const requestedAt = new Date(request.voidedAt)
  if (row.status === 'void' && row.voidedAt === request.voidedAt) return ok(row) // retried call
  if (request.role === 'cashier' && !isPlausibleClientTime(requestedAt, now)) {
    return fail('Waktu perangkat tidak wajar; pembatalan ditolak')
  }
  const check = checkVoid({
    role: request.role,
    isAlreadyVoid: row.status === 'void',
    occurredAt: new Date(row.occurredAt),
    requestedAt,
    timeZone,
    reason: request.reason,
  })
  if (!check.ok) return check
  return ok({ ...row, status: 'void', voidReason: check.reason, voidedAt: request.voidedAt })
}

/** void_transaction(id, reason): same-day rule for cashiers, any time for owners. */
export function rpcVoidTransaction(request: VoidRequest, now = new Date()): Result {
  const state = getPreviewState()
  const row = state.transactions.find((t) => t.id === request.id)
  if (!row) return fail('Transaksi tidak ditemukan')
  const business = businessOf(state, row.businessId)
  if (!business) return fail('Usaha tidak ditemukan atau nonaktif')
  const result = voidRow(row, request, business.timezone, now)
  if (!result.ok) return result
  setPreviewState((s) => ({
    ...s,
    transactions: s.transactions.map((t) => (t.id === row.id ? result.value : t)),
  }))
  return ok(undefined)
}

/** create_expense(jsonb) */
export function rpcCreateExpense(record: Expense, role: Role, now = new Date()): Result<Expense> {
  const state = getPreviewState()
  const existing = state.expenses.find((e) => e.id === record.id)
  if (existing) return ok(existing)

  if (!businessOf(state, record.businessId)) return fail('Usaha tidak ditemukan atau nonaktif')
  if (role === 'cashier' && record.source !== 'drawer') {
    return fail('Kasir hanya bisa mencatat pengeluaran laci')
  }
  if (!Number.isSafeInteger(record.amount) || record.amount <= 0) {
    return fail('Nominal harus lebih dari 0')
  }
  if (record.status !== 'active') return fail('Pengeluaran baru harus aktif')
  const category = state.expenseCategories.find(
    (c) => c.id === record.categoryId && c.businessId === record.businessId && c.isActive,
  )
  if (!category) return fail('Kategori pengeluaran tidak valid')
  if (role === 'cashier' && !category.allowDrawer) {
    return fail('Kategori ini tidak boleh dicatat dari laci kasir')
  }

  const stored: Expense = { ...record, note: record.note.trim(), receivedAt: now.toISOString() }
  setPreviewState((s) => ({ ...s, expenses: [...s.expenses, stored] }))
  return ok(stored)
}

/** void_expense(id, reason): cashiers may only void drawer expenses. */
export function rpcVoidExpense(request: VoidRequest, now = new Date()): Result {
  const state = getPreviewState()
  const row = state.expenses.find((e) => e.id === request.id)
  if (!row) return fail('Pengeluaran tidak ditemukan')
  if (request.role === 'cashier' && row.source !== 'drawer') {
    return fail('Kasir hanya bisa membatalkan pengeluaran laci')
  }
  const business = businessOf(state, row.businessId)
  if (!business) return fail('Usaha tidak ditemukan atau nonaktif')
  const result = voidRow(row, request, business.timezone, now)
  if (!result.ok) return result
  setPreviewState((s) => ({
    ...s,
    expenses: s.expenses.map((e) => (e.id === row.id ? result.value : e)),
  }))
  return ok(undefined)
}
