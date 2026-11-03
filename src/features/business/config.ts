// Per-business owner configuration (decision #25). Everything the owner can tailor that
// is not branding lives here: which template the business started from, the dashboard
// layout, and the remembered spreadsheet-label → category mapping for imports.
// Owner-only: never cached on the cashier device.

export type PanelId =
  'trend' | 'monthly' | 'paymentMethods' | 'topItems' | 'expenseMix' | 'busyHours'

export interface LayoutEntry<T extends string> {
  id: T
  visible: boolean
}

/**
 * Version 2 (decision #40): the summary cards are fixed, only the panels below them are
 * arranged. A layout saved by version 1 (with its own KPI list) starts over from the
 * template, so every business gets the simplified dashboard once.
 */
export const LAYOUT_VERSION = 2

export interface DashboardLayout {
  version: number
  panels: LayoutEntry<PanelId>[]
}

export interface BusinessConfig {
  businessId: string
  templateId: string
  dashboard: DashboardLayout
  /** Normalized spreadsheet label → expense category id, remembered between imports. */
  importMapping: Record<string, string>
}

export const PANEL_INFO: Record<PanelId, { label: string; hint: string }> = {
  trend: { label: 'Tren harian', hint: 'Pemasukan dan pengeluaran per hari' },
  monthly: { label: 'Tren bulanan', hint: '12 bulan terakhir, termasuk data impor' },
  paymentMethods: { label: 'Metode pembayaran', hint: 'Tunai, QRIS, Transfer' },
  topItems: { label: 'Layanan terlaris', hint: 'Berdasarkan nilai penjualan' },
  expenseMix: { label: 'Komposisi pengeluaran', hint: 'Per kategori dan jenis' },
  busyHours: { label: 'Jam & hari tersibuk', hint: 'Jumlah transaksi per jam' },
}

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

export function normalizeLayout(layout: Pick<DashboardLayout, 'panels'>): DashboardLayout {
  return { version: LAYOUT_VERSION, panels: normalizeEntries(layout.panels, PANEL_IDS) }
}

/** The saved layout, or the template's when it was saved by an older version. */
export function savedLayout(
  saved: { version?: number; panels?: LayoutEntry<PanelId>[] } | null | undefined,
  template: DashboardLayout,
): DashboardLayout {
  const current = saved?.version === LAYOUT_VERSION && saved.panels ? saved : template
  return normalizeLayout({ panels: current.panels ?? [] })
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
