import {
  CarFrontIcon,
  DownloadIcon,
  HistoryIcon,
  LogOutIcon,
  MoreVerticalIcon,
  PrinterIcon,
  ShoppingCartIcon,
  WalletIcon,
} from 'lucide-react'
import { Suspense, useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { BusinessLogo } from '@/components/business-logo'
import { PageLoading } from '@/components/page-loading'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { signOut, useSession } from '@/features/auth/session'
import { useBrandTheme } from '@/features/business/use-brand-theme'
import { promptInstall, useCanInstall } from '@/features/offline/install-prompt'
import { SyncStatus } from '@/features/offline/sync-status'
import { PrinterSettingsDialog } from '@/features/receipt/printer-settings-dialog'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { CartProvider } from './cart-provider'
import { KasirDataProvider } from './kasir-data-provider'
import { useKasirData } from './use-kasir-data'

const NAV = [
  { to: '/kasir', label: 'Kasir', icon: ShoppingCartIcon, end: true },
  { to: '/kasir/pesanan', label: 'Pesanan', icon: CarFrontIcon, end: false },
  { to: '/kasir/riwayat', label: 'Riwayat', icon: HistoryIcon, end: false },
  { to: '/kasir/ringkasan', label: 'Ringkasan', icon: WalletIcon, end: false },
] as const

export function KasirLayout() {
  const session = useSession()
  if (!session) return null // RequireRole redirects before this renders
  return (
    <KasirDataProvider businessId={session.businessId}>
      <KasirShell />
    </KasirDataProvider>
  )
}

function KasirShell() {
  const { business, device, outbox, openOrders } = useKasirData()
  const navigate = useNavigate()
  const [printerOpen, setPrinterOpen] = useState(false)
  const canInstall = useCanInstall()
  useBrandTheme(business.primaryColor)

  function logout() {
    // Decision #20: never strand unsynced sales on a signed-out device.
    if (outbox.length > 0) {
      toast.error(
        `Masih ada ${outbox.length} data belum tersinkron. Sambungkan internet dan tunggu sampai selesai sebelum keluar.`,
      )
      return
    }
    void signOut().then(() => navigate('/masuk', { replace: true }))
  }

  return (
    <CartProvider key={business.id}>
      <div className="flex h-dvh flex-col bg-muted/40">
        <header className="bg-primary text-primary-foreground shadow-sm">
          <div className="flex h-14 items-center gap-2 px-3 md:h-16 md:gap-3 md:px-5">
            <BusinessLogo business={business} className="ring-2 ring-white/25 md:size-10" />
            <div className="min-w-0 flex-1">
              <p className="truncate leading-tight font-semibold md:text-lg">{business.name}</p>
              <p className="truncate text-xs opacity-80">Kasir</p>
            </div>
            <SyncStatus entries={outbox} />
            <nav aria-label="Menu kasir" className="flex items-center gap-1">
              {NAV.map(({ to, label, icon: Icon, end }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={end}
                  aria-label={label}
                  className={({ isActive }) =>
                    cn(
                      'flex h-10 min-w-10 items-center justify-center gap-2 rounded-lg px-2.5 text-sm font-medium transition-colors hover:bg-white/15 lg:px-3',
                      isActive && 'bg-white/20',
                    )
                  }
                >
                  <span className="relative">
                    <Icon className="size-5" aria-hidden />
                    {to === '/kasir/pesanan' && openOrders.length > 0 && (
                      <span className="absolute -top-2 -right-2.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-white px-1 text-[10px] font-bold text-primary tabular-nums">
                        {openOrders.length}
                      </span>
                    )}
                  </span>
                  <span className="hidden lg:inline">{label}</span>
                </NavLink>
              ))}
            </nav>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-10 text-primary-foreground hover:bg-white/15 hover:text-primary-foreground"
                  aria-label="Menu akun"
                >
                  <MoreVerticalIcon className="size-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="font-normal">
                  <p className="font-medium">Akun kasir {business.name}</p>
                  <p className="text-xs text-muted-foreground">Perangkat {device.deviceCode}</p>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {canInstall && (
                  <DropdownMenuItem onSelect={() => void promptInstall()}>
                    <DownloadIcon />
                    Pasang aplikasi
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onSelect={() => setPrinterOpen(true)}>
                  <PrinterIcon />
                  Pengaturan printer
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={logout} variant="destructive">
                  <LogOutIcon />
                  Keluar
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>
        <main className="min-h-0 flex-1">
          <Suspense fallback={<PageLoading />}>
            <Outlet />
          </Suspense>
        </main>
        <PrinterSettingsDialog
          open={printerOpen}
          onOpenChange={setPrinterOpen}
          business={business}
        />
      </div>
    </CartProvider>
  )
}
