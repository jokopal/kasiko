import type { ExpenseKind } from '@/lib/types'
import { LAYOUT_VERSION, type DashboardLayout, type PanelId } from './config'

// Business templates (decision #25): a starting set of catalog, expense categories and
// dashboard layout. A new business is created from one; an existing business can apply
// one again to add what it is missing. After that every value is the owner's to change —
// templates never overwrite or remove anything.

export interface ExpenseCategoryTemplate {
  name: string
  kind: ExpenseKind
  allowDrawer: boolean
  /** The catch-all "Lainnya": each expense needs a note (decision #36). */
  requiresNote?: boolean
  /** Spreadsheet labels (normalized) that mean exactly this category. */
  aliases?: string[]
  /** Fallback: a normalized label containing one of these maps here. */
  keywords?: string[]
}

export interface CatalogTemplate {
  category: string
  /** Each service here is one vehicle (decision #43); default true, false for add-ons. */
  countsVehicles?: boolean
  items: { name: string; price: number }[]
}

export interface BusinessTemplate {
  id: string
  name: string
  description: string
  catalog: CatalogTemplate[]
  expenseCategories: ExpenseCategoryTemplate[]
  dashboard: DashboardLayout
  /**
   * Product names in other POS reports (Olsera) per catalog item name, so an item-sales
   * import links them without asking (decision #45). Names only, never figures.
   */
  itemAliases?: Record<string, string[]>
}

const layout = (panels: PanelId[], hidden: PanelId[]): DashboardLayout => ({
  version: LAYOUT_VERSION,
  panels: [
    ...panels.map((id) => ({ id, visible: true })),
    ...hidden.map((id) => ({ id, visible: false })),
  ],
})

// Decision #40: three panels under the summary, plus the daily history (#43); the rest,
// including average daily income and vehicles per day, can be switched on.
const SIMPLE_PANELS = layout(
  ['trend', 'monthly', 'expenseMix', 'history'],
  ['paymentMethods', 'topItems', 'busyHours', 'avgIncome', 'vehicles'],
)

const op = (
  name: string,
  allowDrawer: boolean,
  aliases: string[] = [],
  keywords: string[] = [],
): ExpenseCategoryTemplate => ({ name, kind: 'operating', allowDrawer, aliases, keywords })

/** "Lainnya" (decision #36): open to the drawer, a note is required, sorted into proper
 * categories by the owner later. */
const other = (aliases: string[]): ExpenseCategoryTemplate => ({
  ...op('Lainnya', true, aliases),
  requiresNote: true,
})

// Built from the audit of a car-wash daily cash-flow workbook (2026-10-19): ~75 free-text
// labels folded into categories an owner can actually compare month to month. Labels with
// no clear meaning get no alias on purpose (decision #29): they are not imported until the
// owner creates or picks a category for them.
const CAR_WASH: BusinessTemplate = {
  id: 'cuci-mobil',
  name: 'Cuci Mobil',
  description:
    'Layanan cuci & detailing, gaji komisi harian, biaya laci harian, cicilan dan prive terpisah.',
  itemAliases: {
    'Cuci Mobil Kecil': ['Mobil Kecil'],
    'Cuci Mobil Sedang': ['Mobil Sedang'],
    'Cuci Mobil Besar / SUV': ['Mobil Besar'],
    'Cuci Mobil 4x4': ['Double Cabin 4x4'],
    'Cuci Mobil Kecil Tanpa Kolong': ['Mobil Kecil + Interior Tanpa Hidrolik'],
    'Cuci Mobil Sedang Tanpa Kolong': ['Mobil Sedang + Interior tanpa Hidrolik'],
    'Cuci Mobil Besar Tanpa Kolong': ['Mobil Besar + Interior Tanpa Hidrolik'],
    'Cuci Mobil Kecil Tanpa Kolong & Interior': ['Mobil Kecil Tanpa Hidrolik dan Interior'],
    'Cuci Mobil Sedang Tanpa Kolong & Interior': ['Mobil Sedang Tanpa hidrolik dan Interior'],
    'Cuci Mobil Besar Tanpa Kolong & Interior': ['Mobil Besar Tanpa Hidrolik dan Interior'],
    'Cuci Motor Kecil': ['Cuci Motor 100-145 CC'],
    'Cuci Motor Besar': ['Cuci Motor 150-UP CC', 'Motor 250 cc up'],
    'Cuci Truk': ['truck', 'Colt Diesel'],
  },
  catalog: [
    {
      category: 'Cuci Mobil',
      items: [
        { name: 'Cuci Mobil Kecil', price: 45_000 },
        { name: 'Cuci Mobil Sedang', price: 50_000 },
        { name: 'Cuci Mobil Besar / SUV', price: 55_000 },
        { name: 'Cuci Mobil 4x4', price: 60_000 },
      ],
    },
    {
      category: 'Cuci Motor',
      items: [
        { name: 'Cuci Motor Kecil', price: 15_000 },
        { name: 'Cuci Motor Besar', price: 20_000 },
      ],
    },
    {
      category: 'Kendaraan Besar',
      items: [
        { name: 'Cuci Hiace', price: 85_000 },
        { name: 'Cuci Truk', price: 100_000 },
      ],
    },
    {
      category: 'Salon & Detailing',
      countsVehicles: false,
      items: [
        { name: 'Salon Interior', price: 300_000 },
        { name: 'Poles Body', price: 350_000 },
        { name: 'Cuci Kolong', price: 40_000 },
      ],
    },
    {
      category: 'Tambahan',
      countsVehicles: false,
      items: [
        { name: 'Cuci Mesin Mobil', price: 10_000 },
        { name: 'Cuci Karpet', price: 10_000 },
        { name: 'Semir Ban', price: 10_000 },
        { name: 'Pewangi', price: 10_000 },
      ],
    },
  ],
  expenseCategories: [
    op('Gaji Harian (Komisi)', true, ['gaji', 'gaji harian', 'komisi']),
    op('Komisi Cuci Gratis/Promo', true, ['gratis cuci', 'cuci gratis', 'promo'], ['gratis']),
    op('Upah Kasir', true, ['kasir', 'upah kasir']),
    op('Upah Driver & Antar-Jemput', true, ['driver', 'uang motor', 'antar jemput'], ['driver']),
    op(
      'Gaji Bulanan Staf',
      false,
      ['qc', 'thr', 'gaji bulanan', 'bonus', 'anggota terbaik'],
      ['gaji', 'thr', 'bonus'],
    ),
    op(
      'Makan & Konsumsi',
      true,
      ['makan anggota', 'warkop', 'jajan', 'rokok', 'konsumsi', 'air minum'],
      ['makan', 'jajan', 'warkop', 'kopi', 'minum', 'snack'],
    ),
    op(
      'Alat & Bahan Cuci',
      true,
      ['alat cucian', 'sabun dan kmit', 'sabun', 'kimia', 'shopee', 'kit', 'elbow', 'laundry'],
      ['sabun', 'shampo', 'alat', 'bahan', 'kimia', 'kaca', 'semir'],
    ),
    op(
      'Listrik, Air & Internet',
      true,
      ['listrik', 'listrik toko', 'wifi', 'internet', 'pajak air', 'air', 'pulsa'],
      ['listrik', 'wifi', 'pdam', 'token'],
    ),
    op(
      'Perawatan & Perbaikan',
      true,
      [
        'maintenece alat',
        'maintenance alat',
        'maintenance',
        'ac',
        'kerak boiler',
        'perbaiki mobil',
        'service mobil',
        'pintu',
        'lampu',
        'parit',
      ],
      ['maint', 'servis', 'service', 'perbaik', 'boiler', 'oli'],
    ),
    op(
      'BBM & Transport',
      true,
      ['bbm', 'solar', 'bensin', 'mio', 'parkir', 'transport'],
      ['bbm', 'bensin', 'solar', 'parkir'],
    ),
    op(
      'Kebersihan & Sampah',
      true,
      ['sampah', 'sampah bulanan', 'kebersihan'],
      ['sampah', 'bersih'],
    ),
    op(
      'ATK & Promosi',
      true,
      ['atk', 'spanduk', 'banner', 'promosi', 'showcase'],
      ['atk', 'spanduk', 'promosi'],
    ),
    op(
      'Sosial & Sumbangan',
      true,
      ['sumbangan', 'gereja', 'sponsor', 'papan bunga', 'papanbunga', 'proposal', 'donasi'],
      ['sumbang', 'proposal', 'gereja', 'masjid', 'bunga', 'sponsor', 'agustus'],
    ),
    op('Ganti Rugi Pelanggan', true, ['ganti rugi'], ['ganti rugi', 'rusak']),
    op('Software & Langganan', false, ['olsera', 'aplikasi', 'langganan'], ['langganan']),
    op('Pajak & Retribusi', false, ['pajak', 'retribusi'], ['pajak', 'retribusi']),
    other(['dana lain-lain', 'lain-lain', 'lainnya', 'belanja', 'obat']),
    {
      name: 'Cicilan & Utang',
      kind: 'non_operating',
      allowDrawer: false,
      aliases: ['cicilan', 'utang', 'pinjaman', 'cicilan kit'],
      keywords: ['cicil', 'utang', 'hutang', 'pinjam', 'kredit', 'angsur', 'leasing'],
    },
    {
      name: 'Aset & Renovasi',
      kind: 'non_operating',
      allowDrawer: false,
      aliases: ['pagar', 'coran depan', 'lahan belakang', 'sofa', 'speaker', 'renovasi'],
      keywords: ['renov', 'bangun', 'pagar', 'coran', 'pompa', 'lahan'],
    },
    {
      name: 'Prive Owner',
      kind: 'drawing',
      allowDrawer: true,
      aliases: ['owner', 'prive', 'ambil owner'],
      keywords: ['owner', 'prive'],
    },
    {
      name: 'Prive Keluarga',
      kind: 'drawing',
      allowDrawer: true,
      aliases: ['rumah', 'listrik rumah', 'keluarga', 'bayar hp', 'bapak', 'ibu'],
      keywords: ['rumah', 'keluarga'],
    },
  ],
  dashboard: SIMPLE_PANELS,
}

const GENERAL: BusinessTemplate = {
  id: 'umum',
  name: 'Umum',
  description: 'Kerangka minimal untuk usaha jasa apa pun. Lengkapi katalog sendiri.',
  catalog: [
    {
      category: 'Layanan',
      items: [
        { name: 'Layanan Reguler', price: 25_000 },
        { name: 'Layanan Premium', price: 60_000 },
      ],
    },
  ],
  expenseCategories: [
    op('Bahan', true, ['bahan'], ['bahan']),
    op('Operasional', true, ['operasional'], ['listrik', 'air', 'wifi', 'bbm']),
    op('Gaji', false, ['gaji'], ['gaji', 'upah']),
    op('Sewa', false, ['sewa'], ['sewa']),
    other(['lain-lain', 'lainnya']),
    {
      name: 'Cicilan & Aset',
      kind: 'non_operating',
      allowDrawer: false,
      aliases: ['cicilan', 'aset'],
      keywords: ['cicil', 'utang', 'pinjam', 'renov'],
    },
    {
      name: 'Prive',
      kind: 'drawing',
      allowDrawer: true,
      aliases: ['prive', 'owner'],
      keywords: ['prive', 'owner'],
    },
  ],
  dashboard: SIMPLE_PANELS,
}

export const BUSINESS_TEMPLATES: readonly BusinessTemplate[] = [CAR_WASH, GENERAL]

export function findTemplate(id: string): BusinessTemplate {
  return BUSINESS_TEMPLATES.find((t) => t.id === id) ?? GENERAL
}

/** Lowercase, single-spaced, trimmed: how spreadsheet labels are compared. */
export function normalizeLabel(label: string): string {
  return label.toLowerCase().replace(/\s+/g, ' ').trim()
}

/**
 * Suggests an expense category name for a free-text label: an exact alias wins over a
 * keyword, and earlier categories win ties. `null` means "let the owner decide".
 */
export function suggestCategory(
  label: string,
  categories: readonly Pick<ExpenseCategoryTemplate, 'name' | 'aliases' | 'keywords'>[],
): string | null {
  const normalized = normalizeLabel(label)
  if (normalized === '') return null
  const byName = categories.find((c) => normalizeLabel(c.name) === normalized)
  if (byName) return byName.name
  const byAlias = categories.find((c) => c.aliases?.includes(normalized))
  if (byAlias) return byAlias.name
  const byKeyword = categories.find((c) => c.keywords?.some((k) => normalized.includes(k)))
  return byKeyword?.name ?? null
}
