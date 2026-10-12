// Domain types mirroring the data model in AGENTS.md section 4.
// Money is always an integer number of rupiah; timestamps are ISO-8601 strings (UTC).

export type Role = 'owner' | 'cashier'
export type PaymentMethod = 'cash' | 'qris' | 'transfer'
export type TransactionStatus = 'paid' | 'void'
export type ExpenseSource = 'drawer' | 'owner'
export type ExpenseStatus = 'active' | 'void'
export type ReserveMovementType = 'deposit' | 'withdraw'
export type ReserveDepositSource = 'cash' | 'capital'

export interface Business {
  id: string
  name: string
  logoUrl: string | null
  address: string
  phone: string
  receiptFooter: string
  primaryColor: string
  receiptPrefix: string
  timezone: string
  openingCash: number
  isActive: boolean
}

export interface CatalogCategory {
  id: string
  businessId: string
  name: string
  sortOrder: number
  isActive: boolean
}

export interface CatalogItem {
  id: string
  businessId: string
  categoryId: string
  name: string
  price: number
  sortOrder: number
  isActive: boolean
}

export interface TransactionItem {
  id: string
  catalogItemId: string | null
  nameSnapshot: string
  priceSnapshot: number
  qty: number
  lineTotal: number
}

export interface Transaction {
  id: string
  businessId: string
  receiptNo: string
  occurredAt: string
  plateNumber: string | null
  paymentMethod: PaymentMethod
  total: number
  cashReceived: number | null
  changeAmount: number | null
  status: TransactionStatus
  voidReason: string | null
  voidedAt: string | null
  deviceId: string
  /** Set by the server on arrival (decision #17); null while only in the device outbox. */
  receivedAt: string | null
  items: TransactionItem[]
}

export interface ExpenseCategory {
  id: string
  businessId: string
  name: string
  sortOrder: number
  isActive: boolean
}

export interface Expense {
  id: string
  businessId: string
  categoryId: string
  amount: number
  note: string
  source: ExpenseSource
  occurredAt: string
  status: ExpenseStatus
  voidReason: string | null
  voidedAt: string | null
  /** Set by the server on arrival; null while only in the device outbox. */
  receivedAt: string | null
}

export interface ReserveMovement {
  id: string
  businessId: string
  type: ReserveMovementType
  amount: number
  /** Only set for deposits. */
  source: ReserveDepositSource | null
  /** Required for withdrawals. */
  reason: string | null
  occurredAt: string
}

export const PAYMENT_METHODS: readonly PaymentMethod[] = ['cash', 'qris', 'transfer']

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  cash: 'Tunai',
  qris: 'QRIS',
  transfer: 'Transfer',
}

export const EXPENSE_SOURCE_LABEL: Record<ExpenseSource, string> = {
  drawer: 'Laci kasir',
  owner: 'Owner',
}
