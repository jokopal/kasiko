import { createBrowserRouter } from 'react-router-dom'
import { KasirPlaceholder } from './pages/KasirPlaceholder'
import { OwnerPlaceholder } from './pages/OwnerPlaceholder'

export const router = createBrowserRouter([
  { path: '/', element: <KasirPlaceholder /> },
  { path: '/kasir', element: <KasirPlaceholder /> },
  { path: '/owner', element: <OwnerPlaceholder /> },
])
