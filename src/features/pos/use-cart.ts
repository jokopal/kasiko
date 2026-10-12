import { createContext, use } from 'react'
import type { CartAction, CartLine } from './cart'

export interface CartContextValue {
  lines: CartLine[]
  total: number
  quantity: number
  plateNumber: string
  setPlateNumber: (value: string) => void
  dispatch: (action: CartAction) => void
  reset: () => void
}

export const CartContext = createContext<CartContextValue | null>(null)

export function useCart(): CartContextValue {
  const context = use(CartContext)
  if (!context) throw new Error('useCart must be used inside <CartProvider>')
  return context
}
