import { assertRupiah, sumRupiah } from '@/lib/money'
import type { CatalogItem } from '@/lib/types'

export const MAX_LINE_QTY = 99

export interface CartLine {
  itemId: string
  name: string
  price: number
  qty: number
}

export type CartAction =
  | { type: 'add'; item: Pick<CatalogItem, 'id' | 'name' | 'price'> }
  | { type: 'increment'; itemId: string }
  | { type: 'decrement'; itemId: string }
  | { type: 'remove'; itemId: string }
  | { type: 'clear' }
  /** Replace the cart with the lines of an open order (decision #34). */
  | { type: 'load'; lines: CartLine[] }

function changeQty(lines: CartLine[], itemId: string, delta: number): CartLine[] {
  return lines.flatMap((line) => {
    if (line.itemId !== itemId) return [line]
    const qty = Math.min(line.qty + delta, MAX_LINE_QTY)
    return qty > 0 ? [{ ...line, qty }] : []
  })
}

export function cartReducer(lines: CartLine[], action: CartAction): CartLine[] {
  switch (action.type) {
    case 'add': {
      const { item } = action
      assertRupiah(item.price)
      if (lines.some((line) => line.itemId === item.id)) return changeQty(lines, item.id, 1)
      return [...lines, { itemId: item.id, name: item.name, price: item.price, qty: 1 }]
    }
    case 'increment':
      return changeQty(lines, action.itemId, 1)
    case 'decrement':
      return changeQty(lines, action.itemId, -1)
    case 'remove':
      return lines.filter((line) => line.itemId !== action.itemId)
    case 'clear':
      return []
    case 'load':
      return action.lines.filter((line) => line.qty > 0).map((line) => ({ ...line }))
  }
}

export function lineTotal(line: CartLine): number {
  const total = line.price * line.qty
  assertRupiah(total)
  return total
}

export function cartTotal(lines: readonly CartLine[]): number {
  return sumRupiah(lines.map(lineTotal))
}

export function cartQuantity(lines: readonly CartLine[]): number {
  return lines.reduce((count, line) => count + line.qty, 0)
}
