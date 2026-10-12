import { RouterProvider } from 'react-router-dom'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { PwaPrompt } from '@/features/offline/pwa-prompt'
import { PrintHost } from '@/features/receipt/receipt-paper'
import { router } from './router'

export function App() {
  return (
    <TooltipProvider>
      <RouterProvider router={router} />
      <PrintHost />
      <PwaPrompt />
      <Toaster theme="light" position="top-center" richColors closeButton />
    </TooltipProvider>
  )
}
