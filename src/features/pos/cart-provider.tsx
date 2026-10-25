import { useMemo, useReducer, useState, type ReactNode } from 'react'
import type { Order } from '@/lib/types'
import { cartQuantity, cartReducer, cartTotal } from './cart'
import { CartContext, type CartContextValue } from './use-cart'

/** Cart lives at the kasir layout level so it survives moving between kasir pages. */
export function CartProvider({ children }: { children: ReactNode }) {
  const [lines, dispatch] = useReducer(cartReducer, [])
  const [plateNumber, setPlateNumber] = useState('')
  const [order, setOrder] = useState<Order | null>(null)

  const value = useMemo<CartContextValue>(
    () => ({
      lines,
      total: cartTotal(lines),
      quantity: cartQuantity(lines),
      plateNumber,
      setPlateNumber,
      dispatch,
      order,
      loadOrder: (next: Order) => {
        dispatch({
          type: 'load',
          lines: next.items.map((line) => ({
            itemId: line.catalogItemId ?? `order-line:${line.name}`,
            name: line.name,
            price: line.price,
            qty: line.qty,
          })),
        })
        setPlateNumber(next.plateNumber ?? '')
        setOrder(next)
      },
      reset: () => {
        dispatch({ type: 'clear' })
        setPlateNumber('')
        setOrder(null)
      },
    }),
    [lines, plateNumber, order],
  )

  return <CartContext value={value}>{children}</CartContext>
}
