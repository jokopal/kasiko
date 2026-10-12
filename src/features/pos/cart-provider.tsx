import { useMemo, useReducer, useState, type ReactNode } from 'react'
import { cartQuantity, cartReducer, cartTotal } from './cart'
import { CartContext, type CartContextValue } from './use-cart'

/** Cart lives at the kasir layout level so it survives moving between kasir pages. */
export function CartProvider({ children }: { children: ReactNode }) {
  const [lines, dispatch] = useReducer(cartReducer, [])
  const [plateNumber, setPlateNumber] = useState('')

  const value = useMemo<CartContextValue>(
    () => ({
      lines,
      total: cartTotal(lines),
      quantity: cartQuantity(lines),
      plateNumber,
      setPlateNumber,
      dispatch,
      reset: () => {
        dispatch({ type: 'clear' })
        setPlateNumber('')
      },
    }),
    [lines, plateNumber],
  )

  return <CartContext value={value}>{children}</CartContext>
}
