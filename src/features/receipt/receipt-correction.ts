// Receipt corrections (decision #44, revised 2026-11-24). The sale keeps its real price, so
// income never changes; a correction only changes what the printed receipt shows. Pure, so
// the printed numbers and the validation are unit-tested.

import { sumRupiah } from '@/lib/money'
import type { ReceiptCorrection, ReceiptCorrectionLine, Transaction } from '@/lib/types'

export const MAX_CORRECTION_LINES = 50
export const MAX_CORRECTION_NAME = 60
export const MAX_CORRECTION_PRICE = 100_000_000
export const MAX_CORRECTION_QTY = 99
export const MAX_PLATE = 15

export const correctionTotal = (lines: readonly ReceiptCorrectionLine[]) =>
  sumRupiah(lines.map((l) => l.qty * l.price))

/** What a receipt currently prints, as an editable draft. */
export function correctionDraft(transaction: Transaction): ReceiptCorrection {
  if (transaction.receiptCorrection) {
    return {
      items: transaction.receiptCorrection.items.map((l) => ({ ...l })),
      plateNumber: transaction.receiptCorrection.plateNumber,
    }
  }
  return {
    items: transaction.items.map((i) => ({
      name: i.nameSnapshot,
      qty: i.qty,
      price: i.priceSnapshot,
    })),
    plateNumber: transaction.plateNumber,
  }
}

/** Trims names and the plate; an empty plate becomes null. */
export function cleanCorrection(correction: ReceiptCorrection): ReceiptCorrection {
  const plate = correction.plateNumber?.trim().toUpperCase() ?? ''
  return {
    items: correction.items.map((l) => ({ ...l, name: l.name.trim() })),
    plateNumber: plate === '' ? null : plate,
  }
}

/** Same rules as the server (correct_receipt); null when the correction can be saved. */
export function correctionError(correction: ReceiptCorrection): string | null {
  const { items, plateNumber } = cleanCorrection(correction)
  if (items.length === 0) return 'Nota minimal satu baris'
  if (items.length > MAX_CORRECTION_LINES) return `Nota maksimal ${MAX_CORRECTION_LINES} baris`
  for (const [index, line] of items.entries()) {
    const at = `Baris ${index + 1}`
    if (line.name === '') return `${at}: nama wajib diisi`
    if (line.name.length > MAX_CORRECTION_NAME) return `${at}: nama terlalu panjang`
    if (!Number.isInteger(line.qty) || line.qty < 1 || line.qty > MAX_CORRECTION_QTY) {
      return `${at}: jumlah 1–${MAX_CORRECTION_QTY}`
    }
    if (!Number.isInteger(line.price) || line.price < 0 || line.price > MAX_CORRECTION_PRICE) {
      return `${at}: harga tidak valid`
    }
  }
  if ((plateNumber?.length ?? 0) > MAX_PLATE) return 'Plat nomor terlalu panjang'
  return null
}

/** True when the draft prints exactly what the receipt prints now. */
export function sameAsPrinted(transaction: Transaction, correction: ReceiptCorrection): boolean {
  return (
    JSON.stringify(cleanCorrection(correctionDraft(transaction))) ===
    JSON.stringify(cleanCorrection(correction))
  )
}

/**
 * The transaction as its receipt prints it: corrected lines, plate and total. A corrected
 * receipt prints no discount line; the change is recomputed from the cash the customer gave.
 * Only for printing: reports always use the real transaction.
 */
export function printedTransaction(transaction: Transaction): Transaction {
  const correction = transaction.receiptCorrection
  if (!correction) return transaction
  const total = correctionTotal(correction.items)
  return {
    ...transaction,
    plateNumber: correction.plateNumber,
    items: correction.items.map((line, index) => ({
      id: `${transaction.id}:koreksi:${index}`,
      catalogItemId: null,
      nameSnapshot: line.name,
      priceSnapshot: line.price,
      qty: line.qty,
      lineTotal: line.qty * line.price,
    })),
    subtotal: total,
    discountId: null,
    discountName: null,
    discountType: null,
    discountValue: null,
    discountAmount: 0,
    total,
    changeAmount:
      transaction.cashReceived === null ? null : Math.max(transaction.cashReceived - total, 0),
  }
}
