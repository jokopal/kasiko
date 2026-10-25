import { QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from 'react-router-dom'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { startAuth } from '@/features/auth/session'
import { queryClient } from '@/features/data/query-client'
import { PwaPrompt } from '@/features/offline/pwa-prompt'
import { PrintHost } from '@/features/receipt/receipt-paper'
import { router } from './router'

startAuth()

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <RouterProvider router={router} />
        <PrintHost />
        <PwaPrompt />
        <Toaster theme="light" position="top-center" richColors closeButton />
      </TooltipProvider>
    </QueryClientProvider>
  )
}
