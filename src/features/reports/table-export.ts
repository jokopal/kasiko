import type { Cell } from '@/features/history/cashflow-import'
import { formatDateTime } from '@/lib/datetime'
import {
  EXPENSE_KIND_LABEL,
  EXPENSE_SOURCE_LABEL,
  PAYMENT_METHOD_LABEL,
  type Expense,
  type ExpenseCategory,
  type Transaction,
} from '@/lib/types'

// Row-per-record exports for the owner's transaction and expense tables (AGENTS.md
// section 7). Amounts stay numbers so the spreadsheet can sum them.

export function transactionSheetRows(rows: readonly Transaction[], timeZone: string): Cell[][] {
  return [
    [
      'Waktu',
      'No. nota',
      'Plat',
      'Layanan',
      'Metode',
      'Subtotal',
      'Diskon',
      'Nama diskon',
      'Total',
      'Status',
      'Alasan batal',
    ],
    ...rows.map((t) => [
      formatDateTime(new Date(t.occurredAt), timeZone),
      t.receiptNo,
      t.plateNumber,
      t.items.map((i) => (i.qty > 1 ? `${i.nameSnapshot} x${i.qty}` : i.nameSnapshot)).join(', '),
      PAYMENT_METHOD_LABEL[t.paymentMethod],
      t.subtotal,
      t.discountAmount,
      t.discountName,
      t.total,
      t.status === 'paid' ? 'Lunas' : 'Dibatalkan',
      t.voidReason,
    ]),
  ]
}

export function expenseSheetRows(
  rows: readonly Expense[],
  categories: readonly ExpenseCategory[],
  timeZone: string,
): Cell[][] {
  const category = (id: string) => categories.find((c) => c.id === id)
  return [
    ['Waktu', 'Kategori', 'Jenis', 'Sumber', 'Catatan', 'Nominal', 'Status', 'Alasan batal'],
    ...rows.map((e) => {
      const c = category(e.categoryId)
      return [
        formatDateTime(new Date(e.occurredAt), timeZone),
        c?.name ?? '—',
        c ? EXPENSE_KIND_LABEL[c.kind] : null,
        EXPENSE_SOURCE_LABEL[e.source],
        e.note || null,
        e.amount,
        e.status === 'active' ? 'Aktif' : 'Dibatalkan',
        e.voidReason,
      ]
    }),
  ]
}
