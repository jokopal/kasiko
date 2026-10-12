import { RouterProvider } from 'react-router-dom'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { router } from './router'

export function App() {
  return (
    <TooltipProvider>
      <RouterProvider router={router} />
      <Toaster theme="light" position="top-center" richColors closeButton />
    </TooltipProvider>
  )
}
