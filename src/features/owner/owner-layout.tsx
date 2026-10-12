import { CheckIcon, ChevronsUpDownIcon, LogOutIcon, PlusIcon, WifiOffIcon } from 'lucide-react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { BusinessLogo } from '@/components/business-logo'
import { PreviewBanner } from '@/components/preview-banner'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Separator } from '@/components/ui/separator'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
  useSidebar,
} from '@/components/ui/sidebar'
import { selectBusiness, signOut } from '@/features/auth/session'
import { useBrandTheme } from '@/features/business/use-brand-theme'
import { useOnlineStatus } from '@/features/offline/use-online-status'
import { useBusinessData } from '@/features/preview/selectors'
import { usePreviewState } from '@/features/preview/store'
import type { Business } from '@/lib/types'
import { OWNER_NAV } from './nav'

// Tablets start with the icon rail so content gets the width; desktops get the full sidebar.
const startExpanded = () => window.matchMedia('(min-width: 1024px)').matches

export function OwnerLayout() {
  const { business } = useBusinessData()
  const online = useOnlineStatus()
  const location = useLocation()
  useBrandTheme(business.primaryColor)

  const title =
    OWNER_NAV.flatMap((group) => group.items).find((item) => item.to === location.pathname)
      ?.label ?? 'Owner'

  return (
    <SidebarProvider defaultOpen={startExpanded()}>
      <OwnerSidebar current={business} />
      <SidebarInset className="min-w-0">
        <PreviewBanner />
        <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b bg-background/95 px-3 backdrop-blur md:px-4">
          <SidebarTrigger className="size-9" />
          <Separator orientation="vertical" className="mx-1 data-[orientation=vertical]:h-5" />
          <p className="min-w-0 flex-1 truncate font-medium">{title}</p>
          <span className="flex min-w-0 items-center gap-2 rounded-full border px-2.5 py-1 text-xs">
            <span className="size-2.5 shrink-0 rounded-full bg-primary" aria-hidden />
            <span className="max-w-32 truncate font-medium">{business.name}</span>
          </span>
        </header>
        {online ? (
          <Outlet />
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
            <WifiOffIcon className="size-10 text-muted-foreground" aria-hidden />
            <h2 className="text-lg font-semibold">Butuh koneksi internet</h2>
            <p className="max-w-sm text-sm text-muted-foreground">
              Area owner selalu menampilkan data terbaru dari server. Sambungkan perangkat ke
              internet untuk melanjutkan.
            </p>
          </div>
        )}
      </SidebarInset>
    </SidebarProvider>
  )
}

function OwnerSidebar({ current }: { current: Business }) {
  const { businesses } = usePreviewState()
  const { isMobile, setOpenMobile } = useSidebar()
  const location = useLocation()
  const navigate = useNavigate()

  const closeOnMobile = () => isMobile && setOpenMobile(false)

  function logout() {
    signOut()
    void navigate('/masuk', { replace: true })
  }

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton size="lg" className="data-[state=open]:bg-sidebar-accent">
                  <BusinessLogo business={current} className="size-8" />
                  <span className="grid min-w-0 flex-1 text-left leading-tight">
                    <span className="truncate font-semibold">{current.name}</span>
                    <span className="truncate text-xs text-muted-foreground">Owner</span>
                  </span>
                  <ChevronsUpDownIcon className="ml-auto" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="start"
                side={isMobile ? 'bottom' : 'right'}
                className="w-64"
              >
                <DropdownMenuLabel className="text-xs text-muted-foreground">
                  Pilih usaha
                </DropdownMenuLabel>
                {businesses.map((b) => (
                  <DropdownMenuItem
                    key={b.id}
                    onSelect={() => {
                      selectBusiness(b.id)
                      closeOnMobile()
                    }}
                    className="gap-2 py-2"
                  >
                    <BusinessLogo business={b} className="size-7 text-xs" />
                    <span className="flex-1 truncate">{b.name}</span>
                    {b.id === current.id && <CheckIcon className="size-4" />}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onSelect={() => toast.info('Tambah usaha aktif setelah database tersambung')}
                  className="gap-2 py-2"
                >
                  <span className="flex size-7 items-center justify-center rounded-lg border">
                    <PlusIcon className="size-4" />
                  </span>
                  Tambah usaha
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {OWNER_NAV.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => (
                  <SidebarMenuItem key={item.to}>
                    <SidebarMenuButton
                      asChild
                      isActive={location.pathname === item.to}
                      tooltip={item.label}
                      className="h-10"
                    >
                      <NavLink
                        to={{ pathname: item.to, search: location.search }}
                        onClick={closeOnMobile}
                      >
                        <item.icon />
                        <span>{item.label}</span>
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={logout} tooltip="Keluar" className="h-10">
              <LogOutIcon />
              <span>Keluar</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
