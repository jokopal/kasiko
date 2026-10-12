import { isHexColor } from '@/features/business/brand'
import { cartTotal, lineTotal, type CartLine } from '@/features/pos/cart'
import { settlePayment } from '@/features/pos/payment'
import { normalizePlate } from '@/features/pos/plate'
import { checkVoid } from '@/features/pos/void-policy'
import {
  formatReceiptNo,
  isValidReceiptPrefix,
  nextSequence,
} from '@/features/receipt/receipt-number'
import { reserveBalance } from '@/features/reports/finance'
import { businessDayKey } from '@/lib/datetime'
import { newId } from '@/lib/id'
import { moveInOrder, nextSortOrder } from '@/lib/ordering'
import { fail, ok, type Result } from '@/lib/result'
import type {
  Business,
  CatalogItem,
  Expense,
  ExpenseSource,
  PaymentMethod,
  ReserveDepositSource,
  ReserveMovementType,
  Role,
  Transaction,
} from '@/lib/types'
import { PREVIEW_DEVICE, type PreviewState } from './seed'
import { getPreviewState, setPreviewState } from './store'

// Mutations for the preview. Each one validates with the same pure rules the
// server RPCs will enforce, so the UI already behaves like production.

function findBusiness(state: PreviewState, businessId: string): Business | undefined {
  return state.businesses.find((b) => b.id === businessId)
}

const isPositiveRupiah = (value: number) => Number.isSafeInteger(value) && value > 0

export interface CreateTransactionInput {
  businessId: string
  lines: CartLine[]
  method: PaymentMethod
  cashReceived: number | null
  plateNumber: string
}

export function createTransaction(
  input: CreateTransactionInput,
  now = new Date(),
): Result<Transaction> {
  const state = getPreviewState()
  const business = findBusiness(state, input.businessId)
  if (!business) return fail('Usaha tidak ditemukan')
  if (input.lines.length === 0) return fail('Keranjang masih kosong')

  const total = cartTotal(input.lines)
  const payment = settlePayment({ method: input.method, total, cashReceived: input.cashReceived })
  if (!payment.ok) return payment

  const sequence = nextSequence(
    state.sequences[business.id] ?? null,
    businessDayKey(now, business.timezone),
  )
  const transaction: Transaction = {
    id: newId(),
    businessId: business.id,
    receiptNo: formatReceiptNo({
      prefix: business.receiptPrefix,
      occurredAt: now,
      timeZone: business.timezone,
      deviceCode: PREVIEW_DEVICE.code,
      seq: sequence.seq,
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
    deviceId: PREVIEW_DEVICE.id,
    items: input.lines.map((line) => ({
      id: newId(),
      catalogItemId: line.itemId,
      nameSnapshot: line.name,
      priceSnapshot: line.price,
      qty: line.qty,
      lineTotal: lineTotal(line),
    })),
  }
  setPreviewState((s) => ({
    ...s,
    transactions: [...s.transactions, transaction],
    sequences: { ...s.sequences, [business.id]: sequence },
  }))
  return ok(transaction)
}

export interface VoidInput {
  id: string
  reason: string
  role: Role
}

export function voidTransaction(input: VoidInput, now = new Date()): Result {
  const state = getPreviewState()
  const transaction = state.transactions.find((t) => t.id === input.id)
  if (!transaction) return fail('Transaksi tidak ditemukan')
  const business = findBusiness(state, transaction.businessId)
  if (!business) return fail('Usaha tidak ditemukan')
  const check = checkVoid({
    role: input.role,
    isAlreadyVoid: transaction.status === 'void',
    occurredAt: new Date(transaction.occurredAt),
    requestedAt: now,
    timeZone: business.timezone,
    reason: input.reason,
  })
  if (!check.ok) return check
  setPreviewState((s) => ({
    ...s,
    transactions: s.transactions.map((t) =>
      t.id === input.id
        ? { ...t, status: 'void', voidReason: check.reason, voidedAt: now.toISOString() }
        : t,
    ),
  }))
  return ok(undefined)
}

export interface CreateExpenseInput {
  businessId: string
  categoryId: string
  amount: number
  note: string
  source: ExpenseSource
}

export function createExpense(input: CreateExpenseInput, now = new Date()): Result<Expense> {
  const state = getPreviewState()
  if (!findBusiness(state, input.businessId)) return fail('Usaha tidak ditemukan')
  if (!isPositiveRupiah(input.amount)) return fail('Nominal harus lebih dari 0')
  const category = state.expenseCategories.find(
    (c) => c.id === input.categoryId && c.businessId === input.businessId && c.isActive,
  )
  if (!category) return fail('Pilih kategori pengeluaran')
  const expense: Expense = {
    id: newId(),
    businessId: input.businessId,
    categoryId: category.id,
    amount: input.amount,
    note: input.note.trim(),
    source: input.source,
    occurredAt: now.toISOString(),
    status: 'active',
    voidReason: null,
    voidedAt: null,
  }
  setPreviewState((s) => ({ ...s, expenses: [...s.expenses, expense] }))
  return ok(expense)
}

export function voidExpense(input: VoidInput, now = new Date()): Result {
  const state = getPreviewState()
  const expense = state.expenses.find((e) => e.id === input.id)
  if (!expense) return fail('Pengeluaran tidak ditemukan')
  if (input.role === 'cashier' && expense.source !== 'drawer') {
    return fail('Kasir hanya bisa membatalkan pengeluaran laci')
  }
  const business = findBusiness(state, expense.businessId)
  if (!business) return fail('Usaha tidak ditemukan')
  const check = checkVoid({
    role: input.role,
    isAlreadyVoid: expense.status === 'void',
    occurredAt: new Date(expense.occurredAt),
    requestedAt: now,
    timeZone: business.timezone,
    reason: input.reason,
  })
  if (!check.ok) return check
  setPreviewState((s) => ({
    ...s,
    expenses: s.expenses.map((e) =>
      e.id === input.id
        ? { ...e, status: 'void', voidReason: check.reason, voidedAt: now.toISOString() }
        : e,
    ),
  }))
  return ok(undefined)
}

export interface ReserveInput {
  businessId: string
  type: ReserveMovementType
  amount: number
  source: ReserveDepositSource | null
  reason: string
}

export function addReserveMovement(input: ReserveInput, now = new Date()): Result {
  const state = getPreviewState()
  if (!findBusiness(state, input.businessId)) return fail('Usaha tidak ditemukan')
  if (!isPositiveRupiah(input.amount)) return fail('Nominal harus lebih dari 0')
  const reason = input.reason.trim()
  if (input.type === 'deposit' && !input.source) return fail('Pilih sumber setoran')
  if (input.type === 'withdraw') {
    if (reason.length < 3) return fail('Alasan penarikan wajib diisi')
    const balance = reserveBalance(
      state.reserveMovements.filter((m) => m.businessId === input.businessId),
    )
    if (input.amount > balance) return fail('Saldo cadangan tidak cukup')
  }
  setPreviewState((s) => ({
    ...s,
    reserveMovements: [
      ...s.reserveMovements,
      {
        id: newId(),
        businessId: input.businessId,
        type: input.type,
        amount: input.amount,
        source: input.type === 'deposit' ? input.source : null,
        reason: reason === '' ? null : reason,
        occurredAt: now.toISOString(),
      },
    ],
  }))
  return ok(undefined)
}

export function saveBusiness(business: Business): Result {
  if (business.name.trim() === '') return fail('Nama usaha wajib diisi')
  if (!isHexColor(business.primaryColor)) return fail('Warna utama harus format #RRGGBB')
  if (!isValidReceiptPrefix(business.receiptPrefix)) {
    return fail('Prefix nota 2–6 huruf kapital/angka')
  }
  if (!Number.isSafeInteger(business.openingCash) || business.openingCash < 0) {
    return fail('Saldo awal kas tidak valid')
  }
  setPreviewState((s) => ({
    ...s,
    businesses: s.businesses.map((b) =>
      b.id === business.id ? { ...business, name: business.name.trim() } : b,
    ),
  }))
  return ok(undefined)
}

export interface SaveCatalogItemInput {
  id?: string
  businessId: string
  categoryId: string
  name: string
  price: number
}

export function saveCatalogItem(input: SaveCatalogItemInput): Result {
  const name = input.name.trim()
  if (name === '') return fail('Nama layanan wajib diisi')
  if (!Number.isSafeInteger(input.price) || input.price < 0) return fail('Harga tidak valid')
  const state = getPreviewState()
  const category = state.catalogCategories.find(
    (c) => c.id === input.categoryId && c.businessId === input.businessId,
  )
  if (!category) return fail('Pilih kategori')
  setPreviewState((s) => {
    if (input.id) {
      return {
        ...s,
        catalogItems: s.catalogItems.map((item) =>
          item.id === input.id
            ? { ...item, name, price: input.price, categoryId: category.id }
            : item,
        ),
      }
    }
    const siblings = s.catalogItems.filter((item) => item.categoryId === category.id)
    const item: CatalogItem = {
      id: newId(),
      businessId: input.businessId,
      categoryId: category.id,
      name,
      price: input.price,
      sortOrder: nextSortOrder(siblings),
      isActive: true,
    }
    return { ...s, catalogItems: [...s.catalogItems, item] }
  })
  return ok(undefined)
}

export function setCatalogItemActive(id: string, isActive: boolean) {
  setPreviewState((s) => ({
    ...s,
    catalogItems: s.catalogItems.map((item) => (item.id === id ? { ...item, isActive } : item)),
  }))
}

export function moveCatalogItem(id: string, direction: -1 | 1) {
  setPreviewState((s) => ({
    ...s,
    catalogItems: moveInOrder(
      s.catalogItems,
      id,
      direction,
      (a, b) => a.categoryId === b.categoryId,
    ),
  }))
}

export type CategoryKind = 'catalog' | 'expense'

const categoryKey = (kind: CategoryKind) =>
  kind === 'catalog' ? 'catalogCategories' : 'expenseCategories'

export function saveCategory(
  kind: CategoryKind,
  input: { id?: string; businessId: string; name: string },
): Result {
  const name = input.name.trim()
  if (name === '') return fail('Nama kategori wajib diisi')
  const key = categoryKey(kind)
  setPreviewState((s) => {
    const rows = s[key]
    if (input.id) {
      return { ...s, [key]: rows.map((row) => (row.id === input.id ? { ...row, name } : row)) }
    }
    const siblings = rows.filter((row) => row.businessId === input.businessId)
    return {
      ...s,
      [key]: [
        ...rows,
        {
          id: newId(),
          businessId: input.businessId,
          name,
          sortOrder: nextSortOrder(siblings),
          isActive: true,
        },
      ],
    }
  })
  return ok(undefined)
}

export function setCategoryActive(kind: CategoryKind, id: string, isActive: boolean) {
  const key = categoryKey(kind)
  setPreviewState((s) => ({
    ...s,
    [key]: s[key].map((row) => (row.id === id ? { ...row, isActive } : row)),
  }))
}

export function moveCategory(kind: CategoryKind, id: string, direction: -1 | 1) {
  const key = categoryKey(kind)
  setPreviewState((s) => ({
    ...s,
    [key]: moveInOrder(s[key], id, direction, (a, b) => a.businessId === b.businessId),
  }))
}

export function setCashierActive(businessId: string, isActive: boolean) {
  setPreviewState((s) => ({
    ...s,
    cashierAccounts: s.cashierAccounts.map((account) =>
      account.businessId === businessId ? { ...account, isActive } : account,
    ),
  }))
}
