import {
  LayoutDashboardIcon,
  PackageIcon,
  PiggyBankIcon,
  ReceiptTextIcon,
  SettingsIcon,
  UserCogIcon,
  WalletIcon,
  type LucideIcon,
} from 'lucide-react'

export interface OwnerNavItem {
  to: string
  label: string
  icon: LucideIcon
}

export const OWNER_NAV: { label: string; items: OwnerNavItem[] }[] = [
  {
    label: 'Keuangan',
    items: [
      { to: '/owner', label: 'Dashboard', icon: LayoutDashboardIcon },
      { to: '/owner/transaksi', label: 'Transaksi', icon: ReceiptTextIcon },
      { to: '/owner/pengeluaran', label: 'Pengeluaran', icon: WalletIcon },
      { to: '/owner/cadangan', label: 'Dana Cadangan', icon: PiggyBankIcon },
    ],
  },
  {
    label: 'Pengaturan',
    items: [
      { to: '/owner/katalog', label: 'Katalog', icon: PackageIcon },
      { to: '/owner/pengaturan', label: 'Pengaturan Usaha', icon: SettingsIcon },
      { to: '/owner/akun-kasir', label: 'Akun Kasir', icon: UserCogIcon },
    ],
  },
]
