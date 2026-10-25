// Per-business owner configuration (decision #25). Everything the owner can tailor that
// is not branding lives here: which template the business started from, the dashboard
// layout, and the remembered spreadsheet-label → category mapping for imports.
// Owner-only: never cached on the cashier device.

export type KpiId =
  | 'income'
  | 'expense'
  | 'operatingProfit'
  | 'profit'
  | 'drawings'
  | 'netCashFlow'
  | 'reserve'
  | 'freeCash'
  | 'discounts'

export type PanelId =
  | 'profitBreakdown'
  | 'trend'
  | 'monthly'
  | 'paymentMethods'
  | 'topItems'
  | 'expenseMix'
  | 'busyHours'

export interface LayoutEntry<T extends string> {
  id: T
  visible: boolean
}

export interface DashboardLayout {
  kpis: LayoutEntry<KpiId>[]
  panels: LayoutEntry<PanelId>[]
}

export interface BusinessConfig {
  businessId: string
  templateId: string
  dashboard: DashboardLayout
  /** Normalized spreadsheet label → expense category id, remembered between imports. */
  importMapping: Record<string, string>
}

export const KPI_INFO: Record<KpiId, { label: string; hint: string }> = {
  income: { label: 'Pemasukan', hint: 'Total transaksi lunas' },
  expense: { label: 'Pengeluaran', hint: 'Semua pengeluaran, termasuk prive' },
  operatingProfit: {
    label: 'Profit operasional',
    hint: 'Pemasukan − biaya operasional',
  },
  profit: { label: 'Profit bersih', hint: 'Profit operasional − cicilan & aset' },
  drawings: { label: 'Prive', hint: 'Uang diambil owner/keluarga' },
  netCashFlow: { label: 'Arus kas bersih', hint: 'Pemasukan − semua pengeluaran' },
  reserve: { label: 'Saldo cadangan', hint: 'Per akhir periode' },
  freeCash: { label: 'Kas bebas', hint: 'Per akhir periode' },
  discounts: { label: 'Diskon diberikan', hint: 'Potongan harga pada transaksi lunas' },
}

export const PANEL_INFO: Record<PanelId, { label: string; hint: string }> = {
  profitBreakdown: {
    label: 'Alur profit',
    hint: 'Dari pemasukan sampai arus kas bersih',
  },
  trend: { label: 'Tren harian', hint: 'Pemasukan dan pengeluaran per hari' },
  monthly: { label: 'Tren bulanan', hint: '12 bulan terakhir, termasuk data impor' },
  paymentMethods: { label: 'Metode pembayaran', hint: 'Tunai, QRIS, Transfer' },
  topItems: { label: 'Layanan terlaris', hint: 'Berdasarkan nilai penjualan' },
  expenseMix: { label: 'Komposisi pengeluaran', hint: 'Per kategori dan jenis' },
  busyHours: { label: 'Jam & hari tersibuk', hint: 'Jumlah transaksi per jam' },
}

export const KPI_IDS = Object.keys(KPI_INFO) as KpiId[]
export const PANEL_IDS = Object.keys(PANEL_INFO) as PanelId[]

/**
 * Keeps the saved order, drops ids that no longer exist and appends new ones (hidden),
 * so a layout saved by an older version always renders.
 */
export function normalizeEntries<T extends string>(
  saved: readonly LayoutEntry<T>[],
  all: readonly T[],
): LayoutEntry<T>[] {
  const known = new Set(all)
  const seen = new Set<T>()
  const kept = saved.filter((entry) => {
    if (!known.has(entry.id) || seen.has(entry.id)) return false
    seen.add(entry.id)
    return true
  })
  return [...kept, ...all.filter((id) => !seen.has(id)).map((id) => ({ id, visible: false }))]
}

export function normalizeLayout(layout: DashboardLayout): DashboardLayout {
  return {
    kpis: normalizeEntries(layout.kpis, KPI_IDS),
    panels: normalizeEntries(layout.panels, PANEL_IDS),
  }
}

/** Moves the entry with `id` one step up (−1) or down (+1). */
export function moveEntry<T extends string>(
  entries: readonly LayoutEntry<T>[],
  id: T,
  direction: -1 | 1,
): LayoutEntry<T>[] {
  const index = entries.findIndex((entry) => entry.id === id)
  const target = index + direction
  if (index < 0 || target < 0 || target >= entries.length) return [...entries]
  const next = [...entries]
  const [moved] = next.splice(index, 1)
  if (moved) next.splice(target, 0, moved)
  return next
}

export function toggleEntry<T extends string>(
  entries: readonly LayoutEntry<T>[],
  id: T,
  visible: boolean,
): LayoutEntry<T>[] {
  return entries.map((entry) => (entry.id === id ? { ...entry, visible } : entry))
}

export const visibleIds = <T extends string>(entries: readonly LayoutEntry<T>[]): T[] =>
  entries.filter((entry) => entry.visible).map((entry) => entry.id)
