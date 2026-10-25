import {
  FileSpreadsheetIcon,
  LayoutDashboardIcon,
  PackageIcon,
  PercentIcon,
  PiggyBankIcon,
  ReceiptTextIcon,
  SettingsIcon,
  TableIcon,
  TagsIcon,
  UserCogIcon,
  WalletIcon,
  type LucideIcon,
} from 'lucide-react'

export interface OwnerNavItem {
  to: string
  label: string
  icon: LucideIcon
}

// Three owner roles in one account: watch the numbers, run the money, set the business up.
export const OWNER_NAV: { label: string; items: OwnerNavItem[] }[] = [
  {
    label: 'Monitor',
    items: [
      { to: '/owner', label: 'Dashboard', icon: LayoutDashboardIcon },
      { to: '/owner/rekap', label: 'Rekap Bulanan', icon: TableIcon },
      { to: '/owner/transaksi', label: 'Transaksi', icon: ReceiptTextIcon },
    ],
  },
  {
    label: 'Manajemen',
    items: [
      { to: '/owner/pengeluaran', label: 'Pengeluaran', icon: WalletIcon },
      { to: '/owner/cadangan', label: 'Dana Cadangan', icon: PiggyBankIcon },
      { to: '/owner/impor', label: 'Impor Data', icon: FileSpreadsheetIcon },
    ],
  },
  {
    label: 'Admin',
    items: [
      { to: '/owner/katalog', label: 'Katalog', icon: PackageIcon },
      { to: '/owner/diskon', label: 'Diskon', icon: PercentIcon },
      { to: '/owner/kategori-pengeluaran', label: 'Kategori Pengeluaran', icon: TagsIcon },
      { to: '/owner/pengaturan', label: 'Pengaturan Usaha', icon: SettingsIcon },
      { to: '/owner/akun-kasir', label: 'Akun Kasir', icon: UserCogIcon },
    ],
  },
]
