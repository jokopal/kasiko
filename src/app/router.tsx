import { createBrowserRouter, Outlet, type RouteObject } from 'react-router-dom'
import { KasirLayout } from '@/features/pos/kasir-layout'
import { PosPage } from '@/features/pos/pos-page'
import { RequireRole, RootRedirect } from './guards'
import { LoadingScreen } from './pages/loading-screen'
import { LoginPage } from './pages/login-page'
import { NotFoundPage } from './pages/not-found-page'
import { RouteErrorPage } from './pages/route-error-page'

// The cashier area is bundled eagerly (it must open instantly, also offline);
// the owner area, with charts, is lazy-loaded so the cashier bundle stays small.
export const routes: RouteObject[] = [
  {
    errorElement: <RouteErrorPage />,
    HydrateFallback: LoadingScreen,
    children: [
      { index: true, element: <RootRedirect /> },
      { path: 'masuk', element: <LoginPage /> },
      {
        path: 'kasir',
        element: (
          <RequireRole role="cashier">
            <KasirLayout />
          </RequireRole>
        ),
        children: [
          { index: true, element: <PosPage /> },
          {
            path: 'riwayat',
            lazy: async () => ({
              Component: (await import('@/features/pos/history-page')).HistoryPage,
            }),
          },
          {
            path: 'ringkasan',
            lazy: async () => ({
              Component: (await import('@/features/pos/summary-page')).SummaryPage,
            }),
          },
        ],
      },
      {
        path: 'owner',
        // Guard before the lazy layout so other roles never download owner code.
        element: (
          <RequireRole role="owner">
            <Outlet />
          </RequireRole>
        ),
        children: [
          {
            lazy: async () => ({
              Component: (await import('@/features/owner/owner-layout')).OwnerLayout,
            }),
            children: [
              {
                index: true,
                lazy: async () => ({
                  Component: (await import('@/features/reports/dashboard-page')).DashboardPage,
                }),
              },
              {
                path: 'transaksi',
                lazy: async () => ({
                  Component: (await import('@/features/reports/transactions-page'))
                    .TransactionsPage,
                }),
              },
              {
                path: 'pengeluaran',
                lazy: async () => ({
                  Component: (await import('@/features/expenses/expenses-page')).ExpensesPage,
                }),
              },
              {
                path: 'cadangan',
                lazy: async () => ({
                  Component: (await import('@/features/reserve/reserve-page')).ReservePage,
                }),
              },
              {
                path: 'katalog',
                lazy: async () => ({
                  Component: (await import('@/features/catalog/catalog-page')).CatalogPage,
                }),
              },
              {
                path: 'pengaturan',
                lazy: async () => ({
                  Component: (await import('@/features/business/settings-page')).SettingsPage,
                }),
              },
              {
                path: 'akun-kasir',
                lazy: async () => ({
                  Component: (await import('@/features/auth/cashier-account-page'))
                    .CashierAccountPage,
                }),
              },
            ],
          },
        ],
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]

export const router = createBrowserRouter(routes)
