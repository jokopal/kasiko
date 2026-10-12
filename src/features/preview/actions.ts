import { isHexColor } from '@/features/business/brand'
import { isValidReceiptPrefix } from '@/features/receipt/receipt-number'
import { reserveBalance } from '@/features/reports/finance'
import { newId } from '@/lib/id'
import { moveInOrder, nextSortOrder } from '@/lib/ordering'
import { fail, ok, type Result } from '@/lib/result'
import type {
  Business,
  CatalogItem,
  Expense,
  ReserveDepositSource,
  ReserveMovementType,
} from '@/lib/types'
import type { PreviewState } from './seed'
import { rpcCreateExpense, rpcVoidExpense, rpcVoidTransaction } from './server'
import { getPreviewState, setPreviewState } from './store'

// Owner/master-data mutations for the preview. Each one validates with the same pure
// rules the server will enforce, so the UI already behaves like production.

function findBusiness(state: PreviewState, businessId: string): Business | undefined {
  return state.businesses.find((b) => b.id === businessId)
}

const isPositiveRupiah = (value: number) => Number.isSafeInteger(value) && value > 0

// Owner actions call the server directly: the owner area is online-only (decision #7).
// Cashier writes never come through here — they go through the outbox (features/offline).

export function voidTransactionAsOwner(id: string, reason: string, now = new Date()): Result {
  return rpcVoidTransaction({ id, reason, voidedAt: now.toISOString(), role: 'owner' }, now)
}

export function voidExpenseAsOwner(id: string, reason: string, now = new Date()): Result {
  return rpcVoidExpense({ id, reason, voidedAt: now.toISOString(), role: 'owner' }, now)
}

export interface OwnerExpenseInput {
  businessId: string
  categoryId: string
  amount: number
  note: string
}

export function createOwnerExpense(input: OwnerExpenseInput, now = new Date()): Result<Expense> {
  if (!input.categoryId) return fail('Pilih kategori pengeluaran')
  return rpcCreateExpense(
    {
      id: newId(),
      businessId: input.businessId,
      categoryId: input.categoryId,
      amount: input.amount,
      note: input.note,
      source: 'owner',
      occurredAt: now.toISOString(),
      status: 'active',
      voidReason: null,
      voidedAt: null,
      receivedAt: null,
    },
    'owner',
    now,
  )
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
