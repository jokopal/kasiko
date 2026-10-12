import {
  HistoryIcon,
  LogOutIcon,
  MoreVerticalIcon,
  PrinterIcon,
  ShoppingCartIcon,
  WalletIcon,
} from 'lucide-react'
import { useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { BusinessLogo } from '@/components/business-logo'
import { PreviewBanner } from '@/components/preview-banner'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { signOut } from '@/features/auth/session'
import { useBrandTheme } from '@/features/business/use-brand-theme'
import { SyncStatus } from '@/features/offline/sync-status'
import { useBusinessData } from '@/features/preview/selectors'
import { PrinterSettingsDialog } from '@/features/receipt/printer-settings-dialog'
import { cn } from '@/lib/utils'
import { CartProvider } from './cart-provider'

const NAV = [
  { to: '/kasir', label: 'Kasir', icon: ShoppingCartIcon, end: true },
  { to: '/kasir/riwayat', label: 'Riwayat', icon: HistoryIcon, end: false },
  { to: '/kasir/ringkasan', label: 'Ringkasan', icon: WalletIcon, end: false },
] as const

export function KasirLayout() {
  const { business, cashierAccount } = useBusinessData()
  const navigate = useNavigate()
  const [printerOpen, setPrinterOpen] = useState(false)
  useBrandTheme(business.primaryColor)

  function logout() {
    signOut()
    void navigate('/masuk', { replace: true })
  }

  return (
    <CartProvider key={business.id}>
      <div className="flex h-dvh flex-col bg-muted/40">
        <PreviewBanner />
        <header className="bg-primary text-primary-foreground shadow-sm">
          <div className="flex h-14 items-center gap-2 px-3 md:h-16 md:gap-3 md:px-5">
            <BusinessLogo business={business} className="ring-2 ring-white/25 md:size-10" />
            <div className="min-w-0 flex-1">
              <p className="truncate leading-tight font-semibold md:text-lg">{business.name}</p>
              <p className="truncate text-xs opacity-80">Kasir</p>
            </div>
            <SyncStatus pending={0} />
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
                  <Icon className="size-5" aria-hidden />
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
                  <p className="font-medium">{cashierAccount?.username ?? 'Kasir'}</p>
                  <p className="text-xs text-muted-foreground">Akun kasir {business.name}</p>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
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
          <Outlet />
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
