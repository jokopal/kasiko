import type {
  Business,
  CatalogCategory,
  CatalogItem,
  Discount,
  DiscountType,
  Expense,
  ExpenseCategory,
  ExpenseKind,
  ExpenseSource,
  ExpenseStatus,
  HistoricalDay,
  Order,
  OrderLine,
  OrderStatus,
  PaymentMethod,
  ReserveDepositSource,
  ReserveMovement,
  ReserveMovementType,
  Transaction,
  TransactionStatus,
} from '@/lib/types'

// Database rows (snake_case, as PostgREST returns them) ⇄ app types (camelCase). Pure, so
// the mapping is unit-tested; every column name lives here and in the migrations only.
// bigint columns arrive as JSON numbers (rupiah amounts stay far below 2^53).

export interface BusinessRow {
  id: string
  name: string
  logo_path: string | null
  address: string
  phone: string
  receipt_footer: string
  primary_color: string
  receipt_prefix: string
  timezone: string
  /** Absent in the cashier's `business_branding` view (decision #19). */
  opening_cash?: number
  opening_reserve?: number
  drawer_float?: number
  is_active: boolean
}

export function toBusiness(row: BusinessRow, logoUrl: string | null = null): Business {
  return {
    id: row.id,
    name: row.name,
    logoUrl,
    address: row.address,
    phone: row.phone,
    receiptFooter: row.receipt_footer,
    primaryColor: row.primary_color,
    receiptPrefix: row.receipt_prefix,
    timezone: row.timezone,
    openingCash: row.opening_cash ?? 0,
    drawerFloat: row.drawer_float ?? 0,
    openingReserve: row.opening_reserve ?? 0,
    isActive: row.is_active,
  }
}

export interface CatalogCategoryRow {
  id: string
  business_id: string
  name: string
  sort_order: number
  is_active: boolean
}

export const toCatalogCategory = (row: CatalogCategoryRow): CatalogCategory => ({
  id: row.id,
  businessId: row.business_id,
  name: row.name,
  sortOrder: row.sort_order,
  isActive: row.is_active,
})

export interface CatalogItemRow extends CatalogCategoryRow {
  category_id: string
  price: number
}

export const toCatalogItem = (row: CatalogItemRow): CatalogItem => ({
  ...toCatalogCategory(row),
  categoryId: row.category_id,
  price: row.price,
})

export interface ExpenseCategoryRow extends CatalogCategoryRow {
  kind: ExpenseKind
  allow_drawer: boolean
  requires_note?: boolean
}

export const toExpenseCategory = (row: ExpenseCategoryRow): ExpenseCategory => ({
  ...toCatalogCategory(row),
  kind: row.kind,
  allowDrawer: row.allow_drawer,
  requiresNote: row.requires_note ?? false,
})

export interface DiscountRow extends CatalogCategoryRow {
  type: DiscountType
  value: number
}

export const toDiscount = (row: DiscountRow): Discount => ({
  ...toCatalogCategory(row),
  type: row.type,
  value: row.value,
})

export interface TransactionItemRow {
  id: string
  catalog_item_id: string | null
  name_snapshot: string
  price_snapshot: number
  qty: number
  line_total: number
  position?: number
}

export interface TransactionRow {
  id: string
  business_id: string
  receipt_no: string
  occurred_at: string
  received_at: string | null
  plate_number: string | null
  payment_method: PaymentMethod
  subtotal: number | null
  discount_id: string | null
  discount_name: string | null
  discount_type: DiscountType | null
  discount_value: number | null
  discount_amount: number | null
  total: number
  cash_received: number | null
  change_amount: number | null
  status: TransactionStatus
  void_reason: string | null
  voided_at: string | null
  device_id: string
  order_id: string | null
  /** Embedded as `transaction_items(*)` in selects, or `items` from the RPCs. */
  transaction_items?: TransactionItemRow[]
  items?: TransactionItemRow[]
}

export function toTransaction(row: TransactionRow): Transaction {
  const items = [...(row.transaction_items ?? row.items ?? [])].sort(
    (a, b) => (a.position ?? 0) - (b.position ?? 0),
  )
  return {
    id: row.id,
    businessId: row.business_id,
    receiptNo: row.receipt_no,
    occurredAt: row.occurred_at,
    plateNumber: row.plate_number,
    paymentMethod: row.payment_method,
    subtotal: row.subtotal ?? row.total + (row.discount_amount ?? 0),
    discountId: row.discount_id,
    discountName: row.discount_name,
    discountType: row.discount_type,
    discountValue: row.discount_value,
    discountAmount: row.discount_amount ?? 0,
    total: row.total,
    cashReceived: row.cash_received,
    changeAmount: row.change_amount,
    status: row.status,
    voidReason: row.void_reason,
    voidedAt: row.voided_at,
    deviceId: row.device_id,
    receivedAt: row.received_at,
    orderId: row.order_id,
    items: items.map((item) => ({
      id: item.id,
      catalogItemId: item.catalog_item_id,
      nameSnapshot: item.name_snapshot,
      priceSnapshot: item.price_snapshot,
      qty: item.qty,
      lineTotal: item.line_total,
    })),
  }
}

/** Body of `create_transaction(p jsonb)`. */
export function transactionPayload(t: Transaction) {
  return {
    id: t.id,
    business_id: t.businessId,
    receipt_no: t.receiptNo,
    occurred_at: t.occurredAt,
    plate_number: t.plateNumber,
    payment_method: t.paymentMethod,
    subtotal: t.subtotal,
    discount_id: t.discountId,
    discount_name: t.discountName,
    discount_type: t.discountType,
    discount_value: t.discountValue,
    discount_amount: t.discountAmount,
    total: t.total,
    cash_received: t.cashReceived,
    change_amount: t.changeAmount,
    status: 'paid' as const,
    device_id: t.deviceId,
    order_id: t.orderId,
    items: t.items.map((item) => ({
      id: item.id,
      catalog_item_id: item.catalogItemId,
      name_snapshot: item.nameSnapshot,
      price_snapshot: item.priceSnapshot,
      qty: item.qty,
      line_total: item.lineTotal,
    })),
  }
}

export interface ExpenseRow {
  id: string
  business_id: string
  category_id: string
  amount: number
  note: string
  source: ExpenseSource
  occurred_at: string
  received_at: string | null
  status: ExpenseStatus
  void_reason: string | null
  voided_at: string | null
}

export const toExpense = (row: ExpenseRow): Expense => ({
  id: row.id,
  businessId: row.business_id,
  categoryId: row.category_id,
  amount: row.amount,
  note: row.note,
  source: row.source,
  occurredAt: row.occurred_at,
  status: row.status,
  voidReason: row.void_reason,
  voidedAt: row.voided_at,
  receivedAt: row.received_at,
})

/** Body of `create_expense(p jsonb)`; `deviceId` is required for drawer expenses. */
export function expensePayload(e: Expense, deviceId: string | null) {
  return {
    id: e.id,
    business_id: e.businessId,
    category_id: e.categoryId,
    amount: e.amount,
    note: e.note,
    source: e.source,
    occurred_at: e.occurredAt,
    device_id: deviceId,
  }
}

interface OrderLineRow {
  catalog_item_id: string | null
  name: string
  price: number
  qty: number
}

export interface OrderRow {
  id: string
  business_id: string
  device_id: string
  plate_number: string | null
  items: OrderLineRow[]
  total: number
  status: OrderStatus
  opened_at: string
  device_updated_at: string
  transaction_id: string | null
  cancel_reason: string | null
  cancelled_at: string | null
}

const toOrderLine = (line: OrderLineRow): OrderLine => ({
  catalogItemId: line.catalog_item_id,
  name: line.name,
  price: line.price,
  qty: line.qty,
})

export const toOrder = (row: OrderRow): Order => ({
  id: row.id,
  businessId: row.business_id,
  deviceId: row.device_id,
  plateNumber: row.plate_number,
  items: row.items.map(toOrderLine),
  total: row.total,
  status: row.status,
  openedAt: row.opened_at,
  deviceUpdatedAt: row.device_updated_at,
  transactionId: row.transaction_id,
  cancelReason: row.cancel_reason,
  cancelledAt: row.cancelled_at,
})

/** Body of `save_order(p jsonb)`. */
export function orderPayload(o: Order) {
  return {
    id: o.id,
    business_id: o.businessId,
    device_id: o.deviceId,
    plate_number: o.plateNumber,
    opened_at: o.openedAt,
    device_updated_at: o.deviceUpdatedAt,
    items: o.items.map((line) => ({
      catalog_item_id: line.catalogItemId,
      name: line.name,
      price: line.price,
      qty: line.qty,
    })),
  }
}

export interface ReserveMovementRow {
  id: string
  business_id: string
  type: ReserveMovementType
  amount: number
  source: ReserveDepositSource | null
  reason: string | null
  occurred_at: string
}

export const toReserveMovement = (row: ReserveMovementRow): ReserveMovement => ({
  id: row.id,
  businessId: row.business_id,
  type: row.type,
  amount: row.amount,
  source: row.source,
  reason: row.reason,
  occurredAt: row.occurred_at,
})

export interface HistoricalDayRow {
  business_id: string
  day_key: string
  income: number
  imported_at: string
}

export const toHistoricalDay = (row: HistoricalDayRow): HistoricalDay => ({
  businessId: row.business_id,
  dayKey: row.day_key,
  income: row.income,
  expenses: [],
  importedAt: row.imported_at,
})

/** Body of `import_history(p_days)`. */
export function historicalDaysPayload(days: readonly HistoricalDay[]) {
  return days.map((d) => ({
    day_key: d.dayKey,
    income: d.income,
    expenses: d.expenses.map((e) => ({ category_id: e.categoryId, amount: e.amount })),
  }))
}
