// Domain types mirroring the data model in AGENTS.md section 4.
// Money is always an integer number of rupiah; timestamps are ISO-8601 strings (UTC).

export type Role = 'owner' | 'cashier'
export type PaymentMethod = 'cash' | 'qris' | 'transfer'
export type TransactionStatus = 'paid' | 'void'
export type ExpenseSource = 'drawer' | 'owner'
export type ExpenseStatus = 'active' | 'void'
export type ReserveMovementType = 'deposit' | 'withdraw'
export type ReserveDepositSource = 'cash' | 'capital'
export type DiscountType = 'percent' | 'amount'
export type OrderStatus = 'open' | 'paid' | 'cancelled'
/**
 * How an expense category counts in the profit tiers (decision #24):
 * operating → operating profit; non_operating (loan installments, assets) → net profit;
 * drawing (owner/family withdrawals) never reduces profit, only free cash.
 */
export type ExpenseKind = 'operating' | 'non_operating' | 'drawing'

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
  /** Σ line totals before the discount. */
  subtotal: number
  /** Discount preset snapshot (decision #35); all null when no discount. */
  discountId: string | null
  discountName: string | null
  discountType: DiscountType | null
  discountValue: number | null
  discountAmount: number
  /** subtotal − discountAmount */
  total: number
  cashReceived: number | null
  changeAmount: number | null
  status: TransactionStatus
  voidReason: string | null
  voidedAt: string | null
  deviceId: string
  /** Set by the server on arrival (decision #17); null while only in the device outbox. */
  receivedAt: string | null
  /** The open order this sale settles (decision #34). */
  orderId: string | null
  items: TransactionItem[]
}

/** Owner-defined discount preset the cashier may apply when active (decision #35). */
export interface Discount {
  id: string
  businessId: string
  name: string
  type: DiscountType
  value: number
  sortOrder: number
  isActive: boolean
}

export interface OrderLine {
  catalogItemId: string | null
  name: string
  price: number
  qty: number
}

/** A car checked in and not yet paid (decision #34). Operational only, never income. */
export interface Order {
  id: string
  businessId: string
  deviceId: string
  plateNumber: string | null
  items: OrderLine[]
  total: number
  status: OrderStatus
  openedAt: string
  deviceUpdatedAt: string
  transactionId: string | null
  cancelReason: string | null
  cancelledAt: string | null
}

export interface CashierAccount {
  username: string | null
  isActive: boolean
}

export interface ExpenseCategory {
  id: string
  businessId: string
  name: string
  sortOrder: number
  isActive: boolean
  kind: ExpenseKind
  /** Shown on the cashier screen, i.e. may be paid from the drawer (decision #26). */
  allowDrawer: boolean
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

/** Imported day from a spreadsheet: analysis only, never touches cash (decision #27). */
export interface HistoricalDay {
  businessId: string
  /** YYYY-MM-DD in the business timezone. */
  dayKey: string
  income: number
  expenses: { categoryId: string; amount: number }[]
  importedAt: string
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

export const EXPENSE_KINDS: readonly ExpenseKind[] = ['operating', 'non_operating', 'drawing']

export const EXPENSE_KIND_LABEL: Record<ExpenseKind, string> = {
  operating: 'Operasional',
  non_operating: 'Non-operasional',
  drawing: 'Prive',
}

export const EXPENSE_KIND_HINT: Record<ExpenseKind, string> = {
  operating: 'Biaya menjalankan usaha sehari-hari. Mengurangi profit operasional.',
  non_operating: 'Cicilan utang, pembelian aset, renovasi. Mengurangi profit bersih.',
  drawing: 'Uang diambil owner/keluarga. Tidak mengurangi profit, tetapi mengurangi kas.',
}

export const DISCOUNT_TYPE_LABEL: Record<DiscountType, string> = {
  percent: 'Persen',
  amount: 'Nominal',
}
