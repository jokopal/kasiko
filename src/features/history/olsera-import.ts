// Olsera "Penjualan berdasarkan SKU" reports (decision #45): one file per month with one
// row per product: sold qty, orders and amounts. Imported as item sales for analysis only
// (best sellers, vehicles per day); never as income, because the cash-flow import already
// holds the same money. Pure, so parsing and matching are unit-tested.

import { normalizeLabel } from '@/features/business/templates'

export type OlseraCell = string | number | boolean | Date | null | undefined

export interface OlseraRow {
  product: string
  productGroup: string | null
  qty: number
  orders: number
  /** Total sales amount net of returns, whole rupiah. */
  amount: number
}

export interface OlseraReport {
  fileName: string
  firstDay: string
  lastDay: string
  rows: OlseraRow[]
}

export type OlseraParse =
  { ok: true; report: OlseraReport } | { ok: false; fileName: string; error: string }

const PERIOD = /(\d{4}-\d{2}-\d{2})__(\d{4}-\d{2}-\d{2})/

const COLUMNS = {
  product: 'product',
  group: 'group',
  qty: 'sold qty',
  amount: 'total sales amount',
  returns: 'total sales return',
  orders: 'total sales order',
} as const

const num = (cell: OlseraCell | undefined): number => {
  if (typeof cell === 'number') return cell
  if (typeof cell === 'string') {
    const value = Number(cell.replace(/[^\d.-]/g, ''))
    return Number.isFinite(value) ? value : 0
  }
  return 0
}

const text = (cell: OlseraCell | undefined): string =>
  typeof cell === 'string' ? cell.trim() : typeof cell === 'number' ? String(cell) : ''

/** Reads one report sheet; the period comes from the Olsera file name. */
export function parseOlseraSheet(
  fileName: string,
  rows: readonly (readonly OlseraCell[])[],
): OlseraParse {
  const period = PERIOD.exec(fileName)
  if (!period?.[1] || !period[2]) {
    return {
      ok: false,
      fileName,
      error: 'Nama file tidak memuat periode (…YYYY-MM-DD__YYYY-MM-DD)',
    }
  }
  const headerIndex = rows.findIndex((row) =>
    row.some((cell) => text(cell).toLowerCase() === COLUMNS.product),
  )
  const header = rows[headerIndex]?.map((cell) => text(cell).toLowerCase()) ?? []
  const at = (name: string) => header.indexOf(name)
  if (headerIndex < 0 || at(COLUMNS.qty) < 0 || at(COLUMNS.amount) < 0) {
    return { ok: false, fileName, error: 'Bukan laporan Olsera "Penjualan berdasarkan SKU"' }
  }

  const byProduct = new Map<string, OlseraRow>()
  for (const row of rows.slice(headerIndex + 1)) {
    const product = text(row[at(COLUMNS.product)])
    if (product === '') continue
    const returns = at(COLUMNS.returns) >= 0 ? num(row[at(COLUMNS.returns)]) : 0
    const line: OlseraRow = {
      product,
      productGroup: text(row[at(COLUMNS.group)]) || null,
      qty: Math.max(0, Math.round(num(row[at(COLUMNS.qty)]))),
      orders: at(COLUMNS.orders) >= 0 ? Math.max(0, Math.round(num(row[at(COLUMNS.orders)]))) : 0,
      // Olsera reports returns as a negative amount next to the gross total.
      amount: Math.max(0, Math.round(num(row[at(COLUMNS.amount)]) + Math.min(0, returns))),
    }
    const key = normalizeLabel(product)
    const seen = byProduct.get(key)
    byProduct.set(
      key,
      seen
        ? {
            ...seen,
            qty: seen.qty + line.qty,
            orders: seen.orders + line.orders,
            amount: seen.amount + line.amount,
          }
        : line,
    )
  }
  return {
    ok: true,
    report: { fileName, firstDay: period[1], lastDay: period[2], rows: [...byProduct.values()] },
  }
}

/** What happens to an Olsera product: linked to a catalog item, kept unlinked, or skipped. */
export type ProductChoice = { kind: 'item'; itemId: string } | { kind: 'none' } | { kind: 'skip' }

export interface ProductSummary {
  key: string
  product: string
  productGroup: string | null
  qty: number
  amount: number
}

/** Every distinct product across the reports, biggest revenue first. */
export function productsOf(reports: readonly OlseraReport[]): ProductSummary[] {
  const map = new Map<string, ProductSummary>()
  for (const report of reports) {
    for (const row of report.rows) {
      const key = normalizeLabel(row.product)
      const seen = map.get(key)
      map.set(key, {
        key,
        product: seen?.product ?? row.product,
        productGroup: seen?.productGroup ?? row.productGroup,
        qty: (seen?.qty ?? 0) + row.qty,
        amount: (seen?.amount ?? 0) + row.amount,
      })
    }
  }
  return [...map.values()].sort((a, b) => b.amount - a.amount || a.product.localeCompare(b.product))
}

/**
 * The starting choice for a product: the remembered mapping, then a template alias, then an
 * item with the same name; otherwise kept without a service (still counted in best sellers,
 * never as a vehicle).
 */
export function suggestChoice(
  key: string,
  items: readonly { id: string; name: string; isActive: boolean }[],
  saved: Readonly<Record<string, string>>,
  aliases: Readonly<Record<string, readonly string[]>>,
): ProductChoice {
  const remembered = saved[key]
  if (remembered === 'skip') return { kind: 'skip' }
  if (remembered && items.some((i) => i.id === remembered))
    return { kind: 'item', itemId: remembered }
  const byName = (name: string) =>
    items.find((i) => normalizeLabel(i.name) === normalizeLabel(name))
  for (const [itemName, names] of Object.entries(aliases)) {
    if (names.some((alias) => normalizeLabel(alias) === key)) {
      const item = byName(itemName)
      if (item) return { kind: 'item', itemId: item.id }
    }
  }
  const same = byName(key)
  return same ? { kind: 'item', itemId: same.id } : { kind: 'none' }
}

/** Periods for import_item_sales, applying each product's choice; skipped products drop out. */
export function importPeriods(
  reports: readonly OlseraReport[],
  choices: Readonly<Record<string, ProductChoice>>,
) {
  return reports.map((report) => ({
    firstDay: report.firstDay,
    lastDay: report.lastDay,
    rows: report.rows.flatMap((row) => {
      const choice = choices[normalizeLabel(row.product)] ?? { kind: 'none' }
      if (choice.kind === 'skip') return []
      return [{ ...row, catalogItemId: choice.kind === 'item' ? choice.itemId : null }]
    }),
  }))
}

/** Choices worth remembering for the next import: links and skips, not "unlinked". */
export function mappingToSave(
  choices: Readonly<Record<string, ProductChoice>>,
): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [key, choice] of Object.entries(choices)) {
    if (choice.kind === 'item') out[key] = choice.itemId
    if (choice.kind === 'skip') out[key] = 'skip'
  }
  return out
}
