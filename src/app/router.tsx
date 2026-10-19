import { lazy, Suspense, type ComponentType, type ReactNode } from 'react'
import { createBrowserRouter, type RouteObject } from 'react-router-dom'
import { KasirLayout } from '@/features/pos/kasir-layout'
import { PosPage } from '@/features/pos/pos-page'
import type { Role } from '@/lib/types'
import { RequireRole, RootRedirect } from './guards'
import { LoadingScreen } from './pages/loading-screen'
import { LoginPage } from './pages/login-page'
import { NotFoundPage } from './pages/not-found-page'
import { RouteErrorPage } from './pages/route-error-page'

// Code splitting uses React.lazy, not route `lazy`: React Router resolves route-level
// `lazy` for every matched route before rendering, which would make a cashier opening
// /owner download the owner bundle before the role guard redirects. With React.lazy a
// chunk is only fetched once its component actually renders, i.e. after the guard.
//
// The cashier screen itself is bundled eagerly: it must open instantly, also offline.

function page<K extends string>(load: () => Promise<Record<K, ComponentType>>, name: K) {
  const Component = lazy<ComponentType>(async () => ({ default: (await load())[name] }))
  return <Component />
}

function guarded(role: Role, children: ReactNode) {
  return (
    <RequireRole role={role}>
      <Suspense fallback={<LoadingScreen />}>{children}</Suspense>
    </RequireRole>
  )
}

export const routes: RouteObject[] = [
  {
    errorElement: <RouteErrorPage />,
    children: [
      { index: true, element: <RootRedirect /> },
      { path: 'masuk', element: <LoginPage /> },
      {
        path: 'kasir',
        element: guarded('cashier', <KasirLayout />),
        children: [
          { index: true, element: <PosPage /> },
          {
            path: 'riwayat',
            element: page(() => import('@/features/pos/history-page'), 'HistoryPage'),
          },
          {
            path: 'ringkasan',
            element: page(() => import('@/features/pos/summary-page'), 'SummaryPage'),
          },
        ],
      },
      {
        path: 'owner',
        element: guarded(
          'owner',
          page(() => import('@/features/owner/owner-layout'), 'OwnerLayout'),
        ),
        children: [
          {
            index: true,
            element: page(() => import('@/features/reports/dashboard-page'), 'DashboardPage'),
          },
          {
            path: 'rekap',
            element: page(() => import('@/features/reports/monthly-page'), 'MonthlyPage'),
          },
          {
            path: 'transaksi',
            element: page(() => import('@/features/reports/transactions-page'), 'TransactionsPage'),
          },
          {
            path: 'pengeluaran',
            element: page(() => import('@/features/expenses/expenses-page'), 'ExpensesPage'),
          },
          {
            path: 'cadangan',
            element: page(() => import('@/features/reserve/reserve-page'), 'ReservePage'),
          },
          {
            path: 'impor',
            element: page(() => import('@/features/history/import-page'), 'ImportPage'),
          },
          {
            path: 'katalog',
            element: page(() => import('@/features/catalog/catalog-page'), 'CatalogPage'),
          },
          {
            path: 'kategori-pengeluaran',
            element: page(
              () => import('@/features/expenses/expense-categories-page'),
              'ExpenseCategoriesPage',
            ),
          },
          {
            path: 'pengaturan',
            element: page(() => import('@/features/business/settings-page'), 'SettingsPage'),
          },
          {
            path: 'akun-kasir',
            element: page(
              () => import('@/features/auth/cashier-account-page'),
              'CashierAccountPage',
            ),
          },
        ],
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]

export const router = createBrowserRouter(routes)
