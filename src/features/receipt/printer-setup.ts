import { useSyncExternalStore } from 'react'

// Opens the printer setup from anywhere (header indicator, menu, a "Cetak" tap with no
// printer saved). One dialog is mounted per area layout.

let open = false
const listeners = new Set<() => void>()

function emit(next: boolean) {
  open = next
  for (const listener of listeners) listener()
}

export const openPrinterSetup = () => emit(true)
export const closePrinterSetup = () => emit(false)

export function usePrinterSetupOpen(): boolean {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => open,
    () => false,
  )
}
