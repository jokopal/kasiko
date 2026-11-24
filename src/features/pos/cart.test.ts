import { describe, expect, it } from 'vitest'
import { cartQuantity, cartReducer, cartTotal, MAX_LINE_QTY, type CartLine } from './cart'

const wash = { id: 'wash', name: 'Cuci Mobil Kecil', price: 35_000 }
const tire = { id: 'tire', name: 'Semir Ban', price: 10_000 }

describe('cartReducer', () => {
  it('adds new items and increments existing ones', () => {
    let lines: CartLine[] = []
    lines = cartReducer(lines, { type: 'add', item: wash })
    lines = cartReducer(lines, { type: 'add', item: tire })
    lines = cartReducer(lines, { type: 'add', item: wash })
    expect(lines).toEqual([
      { itemId: 'wash', name: 'Cuci Mobil Kecil', price: 35_000, qty: 2 },
      { itemId: 'tire', name: 'Semir Ban', price: 10_000, qty: 1 },
    ])
  })

  it('removes a line when decremented to zero', () => {
    const lines = cartReducer([], { type: 'add', item: wash })
    expect(cartReducer(lines, { type: 'decrement', itemId: 'wash' })).toEqual([])
  })

  it('caps quantity', () => {
    let lines: CartLine[] = [{ itemId: 'wash', name: 'x', price: 1, qty: MAX_LINE_QTY }]
    lines = cartReducer(lines, { type: 'increment', itemId: 'wash' })
    expect(lines[0]?.qty).toBe(MAX_LINE_QTY)
  })

  it('removes and clears', () => {
    let lines = cartReducer(cartReducer([], { type: 'add', item: wash }), {
      type: 'add',
      item: tire,
    })
    lines = cartReducer(lines, { type: 'remove', itemId: 'wash' })
    expect(lines.map((l) => l.itemId)).toEqual(['tire'])
    expect(cartReducer(lines, { type: 'clear' })).toEqual([])
  })

  it('does not mutate the previous state', () => {
    const lines = cartReducer([], { type: 'add', item: wash })
    cartReducer(lines, { type: 'increment', itemId: 'wash' })
    expect(lines[0]?.qty).toBe(1)
  })
})

describe('totals', () => {
  it('sums line totals and quantities', () => {
    const lines: CartLine[] = [
      { itemId: 'wash', name: 'a', price: 35_000, qty: 2 },
      { itemId: 'tire', name: 'b', price: 10_000, qty: 3 },
    ]
    expect(cartTotal(lines)).toBe(100_000)
    expect(cartQuantity(lines)).toBe(5)
    expect(cartTotal([])).toBe(0)
  })
})
