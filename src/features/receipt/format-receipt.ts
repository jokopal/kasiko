import { formatDateTime } from '@/lib/datetime'
import { formatDigits, formatRupiah } from '@/lib/money'
import { PAYMENT_METHOD_LABEL, type Business, type Transaction } from '@/lib/types'

// The single source of truth for receipt content. Bluetooth (ESC/POS), browser print
// and WhatsApp all render these lines, so every channel shows exactly the same receipt.

export type PaperWidth = 58 | 80

/** Characters per line for the standard thermal font. */
export const PAPER_CHARS: Record<PaperWidth, number> = { 58: 32, 80: 48 }

export interface ReceiptLine {
  /** Already padded/wrapped to the paper width; never longer than it. */
  text: string
  align: 'left' | 'center'
  bold: boolean
  /** Double-height emphasis for the grand total. */
  large: boolean
}

export type ReceiptBusiness = Pick<
  Business,
  'name' | 'address' | 'phone' | 'receiptFooter' | 'timezone'
>

const REPLACEMENTS: [RegExp, string][] = [
  [/[\u2018\u2019\u201a\u2032]/g, "'"],
  [/[\u201c\u201d\u201e\u2033]/g, '"'],
  [/[\u2010-\u2015\u2212]/g, '-'],
  [/\u2026/g, '...'],
  [/[\u00a0\u202f\u2007]/g, ' '],
  [/\u00d7/g, 'x'],
]

/**
 * Thermal printers only reliably print ASCII. Accents are stripped, common
 * typography is mapped, anything else becomes `?` so column math stays exact.
 */
export function toPrintable(text: string): string {
  let result = text.normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
  for (const [pattern, replacement] of REPLACEMENTS) result = result.replace(pattern, replacement)
  return result.replace(/[\r\n\t]+/g, ' ').replace(/[^\x20-\x7e]/gu, '?')
}

/** Greedy word wrap; words longer than the width are hard-split. */
export function wrapText(text: string, width: number): string[] {
  const words = toPrintable(text).trim().split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let current = ''
  for (let word of words) {
    while (word.length > width) {
      if (current) {
        lines.push(current)
        current = ''
      }
      lines.push(word.slice(0, width))
      word = word.slice(width)
    }
    if (!word) continue
    if (!current) current = word
    else if (current.length + 1 + word.length <= width) current += ` ${word}`
    else {
      lines.push(current)
      current = word
    }
  }
  if (current) lines.push(current)
  return lines
}

/** `left .......... right` on one line, wrapping `left` above when it does not fit. */
export function twoColumns(left: string, right: string, width: number): string[] {
  const r = toPrintable(right)
  const indent = /^ */.exec(left)?.[0] ?? ''
  const leftLines = wrapText(left, width - indent.length).map((line) => indent + line)
  const last = leftLines.pop() ?? ''
  if (last.length + 1 + r.length <= width) {
    return [...leftLines, last + ' '.repeat(width - last.length - r.length) + r]
  }
  return [...leftLines, last, r.padStart(width)]
}

export function formatReceipt(
  transaction: Transaction,
  business: ReceiptBusiness,
  paper: PaperWidth,
): ReceiptLine[] {
  const width = PAPER_CHARS[paper]
  const lines: ReceiptLine[] = []
  const push = (text: string, options: Partial<Omit<ReceiptLine, 'text'>> = {}) =>
    lines.push({ text, align: 'left', bold: false, large: false, ...options })
  const center = (text: string, options: Partial<Omit<ReceiptLine, 'text' | 'align'>> = {}) => {
    for (const line of wrapText(text, width)) push(line, { ...options, align: 'center' })
  }
  const row = (left: string, right: string, options: Partial<Omit<ReceiptLine, 'text'>> = {}) => {
    for (const line of twoColumns(left, right, width)) push(line, options)
  }
  const divider = () => push('-'.repeat(width))

  center(business.name, { bold: true })
  if (business.address.trim()) center(business.address)
  if (business.phone.trim()) center(business.phone)
  divider()

  row('No', transaction.receiptNo)
  row('Tanggal', formatDateTime(new Date(transaction.occurredAt), business.timezone))
  if (transaction.plateNumber) row('Plat', transaction.plateNumber)
  if (transaction.status === 'void') {
    divider()
    center('*** DIBATALKAN ***', { bold: true })
    if (transaction.voidReason) center(transaction.voidReason)
  }
  divider()

  for (const item of transaction.items) {
    for (const line of wrapText(item.nameSnapshot, width)) push(line)
    row(`  ${item.qty} x ${formatDigits(item.priceSnapshot)}`, formatDigits(item.lineTotal))
  }
  divider()

  if (transaction.discountAmount > 0) {
    row('Subtotal', formatRupiah(transaction.subtotal))
    row(
      `Diskon ${transaction.discountName ?? ''}`.trim(),
      `-${formatRupiah(transaction.discountAmount)}`,
    )
  }
  row('TOTAL', formatRupiah(transaction.total), { bold: true, large: true })
  row('Bayar', PAYMENT_METHOD_LABEL[transaction.paymentMethod])
  if (transaction.paymentMethod === 'cash' && transaction.cashReceived !== null) {
    row('Diterima', formatRupiah(transaction.cashReceived))
    row('Kembali', formatRupiah(transaction.changeAmount ?? 0), { bold: true })
  }

  if (business.receiptFooter.trim()) {
    divider()
    center(business.receiptFooter)
  }
  return lines
}

/** Plain text, centered lines padded, for WhatsApp and debugging. */
export function receiptToText(lines: readonly ReceiptLine[], paper: PaperWidth): string {
  const width = PAPER_CHARS[paper]
  return lines
    .map((line) => {
      if (line.align === 'left') return line.text
      const pad = Math.floor((width - line.text.length) / 2)
      return ' '.repeat(Math.max(pad, 0)) + line.text
    })
    .map((text) => text.trimEnd())
    .join('\n')
}
