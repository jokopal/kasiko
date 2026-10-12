import { businessDayKey, shiftDayKey, startOfBusinessDayKey, getZonedParts } from '@/lib/datetime'
import { newId } from '@/lib/id'
import type {
  Business,
  CatalogCategory,
  CatalogItem,
  Expense,
  ExpenseCategory,
  PaymentMethod,
  ReserveMovement,
  Transaction,
} from '@/lib/types'
import { quickCashOptions } from '@/features/pos/payment'
import { formatReceiptNo } from '@/features/receipt/receipt-number'

// Sample data for the preview. Prices are placeholders until the owner provides the
// real Saimara price list (open question #5).

/** The device that produced the sample history; real devices register after it. */
export const SEED_DEVICE = { id: 'seed-device', code: 'A' } as const

export interface CashierAccount {
  businessId: string
  username: string
  isActive: boolean
}

export interface RegisteredDevice {
  id: string
  businessId: string
  /** Server-assigned, unique per business, never reused (decision #16). */
  code: string
  registeredAt: string
}

export interface PreviewState {
  version: 2
  seededAt: string
  businesses: Business[]
  catalogCategories: CatalogCategory[]
  catalogItems: CatalogItem[]
  expenseCategories: ExpenseCategory[]
  transactions: Transaction[]
  expenses: Expense[]
  reserveMovements: ReserveMovement[]
  cashierAccounts: CashierAccount[]
  devices: RegisteredDevice[]
}

interface CatalogSeed {
  category: string
  items: [name: string, price: number, weight: number][]
}

const SAIMARA_CATALOG: CatalogSeed[] = [
  {
    category: 'Cuci',
    items: [
      ['Cuci Mobil Kecil', 35_000, 30],
      ['Cuci Mobil Sedang', 45_000, 25],
      ['Cuci Mobil Besar / SUV', 55_000, 18],
      ['Cuci Pick-up', 50_000, 6],
      ['Cuci Motor', 15_000, 14],
    ],
  },
  {
    category: 'Salon & Detailing',
    items: [
      ['Salon Interior', 300_000, 2],
      ['Poles Body', 350_000, 2],
      ['Cuci Mesin', 75_000, 4],
      ['Cuci Kolong', 40_000, 4],
    ],
  },
  {
    category: 'Tambahan',
    items: [
      ['Semir Ban', 10_000, 0],
      ['Pewangi', 10_000, 0],
      ['Vakum Interior', 15_000, 0],
      ['Fogging AC', 50_000, 0],
    ],
  },
]

const DEMO_CATALOG: CatalogSeed[] = [
  {
    category: 'Layanan',
    items: [
      ['Layanan Reguler', 25_000, 10],
      ['Layanan Premium', 60_000, 4],
    ],
  },
]

const EXPENSE_CATEGORY_NAMES = ['Bahan', 'Operasional', 'Gaji', 'Sewa', 'Lain-lain'] as const
type ExpenseCategoryName = (typeof EXPENSE_CATEGORY_NAMES)[number]

const HISTORY_DAYS = 45

/** Deterministic PRNG so every fresh preview shows the same shape of data. */
function mulberry32(seed: number) {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

type Random = () => number

function pickWeighted<T>(random: Random, entries: readonly (readonly [T, number])[]): T {
  const total = entries.reduce((sum, [, w]) => sum + w, 0)
  let roll = random() * total
  for (const [value, weight] of entries) {
    roll -= weight
    if (roll < 0) return value
  }
  const last = entries[entries.length - 1]
  if (!last) throw new Error('pickWeighted needs at least one entry')
  return last[0]
}

const HOUR_WEIGHTS: [number, number][] = [
  [8, 6],
  [9, 9],
  [10, 10],
  [11, 8],
  [12, 5],
  [13, 6],
  [14, 8],
  [15, 10],
  [16, 9],
  [17, 5],
]

const PLATE_PREFIXES = ['B', 'D', 'F', 'DK', 'L', 'AB']
const PLATE_LETTERS = 'ABCDEFGHJKLMNPRSTUVWXYZ'

function randomPlate(random: Random): string {
  const prefix = PLATE_PREFIXES[Math.floor(random() * PLATE_PREFIXES.length)] ?? 'B'
  const digits = 1000 + Math.floor(random() * 8999)
  const suffix = Array.from(
    { length: 2 + Math.floor(random() * 2) },
    () => PLATE_LETTERS[Math.floor(random() * PLATE_LETTERS.length)],
  ).join('')
  return `${prefix} ${digits} ${suffix}`
}

interface BusinessSeed {
  business: Business
  catalog: CatalogSeed[]
  dailyBase: number
  seed: number
}

function buildBusiness(
  input: BusinessSeed,
  now: Date,
  state: Omit<PreviewState, 'version' | 'seededAt' | 'businesses' | 'cashierAccounts' | 'devices'>,
) {
  const { business, catalog, dailyBase } = input
  const random = mulberry32(input.seed)
  const tz = business.timezone

  const items: CatalogItem[] = []
  const weighted: [CatalogItem, number][] = []
  const addons: CatalogItem[] = []
  catalog.forEach((group, categoryIndex) => {
    const category: CatalogCategory = {
      id: newId(),
      businessId: business.id,
      name: group.category,
      sortOrder: categoryIndex,
      isActive: true,
    }
    state.catalogCategories.push(category)
    group.items.forEach(([name, price, weight], itemIndex) => {
      const item: CatalogItem = {
        id: newId(),
        businessId: business.id,
        categoryId: category.id,
        name,
        price,
        sortOrder: itemIndex,
        isActive: true,
      }
      items.push(item)
      if (weight > 0) weighted.push([item, weight])
      else addons.push(item)
    })
  })
  state.catalogItems.push(...items)

  const expenseCategory = {} as Record<ExpenseCategoryName, ExpenseCategory>
  EXPENSE_CATEGORY_NAMES.forEach((name, index) => {
    const category: ExpenseCategory = {
      id: newId(),
      businessId: business.id,
      name,
      sortOrder: index,
      isActive: true,
    }
    expenseCategory[name] = category
    state.expenseCategories.push(category)
  })

  const todayKey = businessDayKey(now, tz)
  const firstKey = shiftDayKey(todayKey, -(HISTORY_DAYS - 1))
  const at = (dayKey: string, hour: number, minute: number) =>
    new Date(startOfBusinessDayKey(dayKey, tz).getTime() + (hour * 60 + minute) * 60_000)

  for (let offset = 0; offset < HISTORY_DAYS; offset++) {
    const dayKey = shiftDayKey(firstKey, offset)
    const isToday = dayKey === todayKey
    const weekday = getZonedParts(at(dayKey, 12, 0), tz).weekday
    const weekendBoost = weekday === 0 || weekday === 6 ? 1.6 : 1
    const count = Math.round(dailyBase * weekendBoost * (0.75 + random() * 0.5))

    const stamps = Array.from({ length: count }, () =>
      at(dayKey, pickWeighted(random, HOUR_WEIGHTS), Math.floor(random() * 60)),
    )
      .filter((date) => !isToday || date.getTime() < now.getTime())
      .sort((a, b) => a.getTime() - b.getTime())

    stamps.forEach((occurredAt, index) => {
      const main = pickWeighted(random, weighted)
      const chosen = [main]
      const addon = addons[Math.floor(random() * addons.length)]
      if (addon && random() < 0.35) chosen.push(addon)
      const txItems = chosen.map((item) => ({
        id: newId(),
        catalogItemId: item.id,
        nameSnapshot: item.name,
        priceSnapshot: item.price,
        qty: 1,
        lineTotal: item.price,
      }))
      const total = txItems.reduce((sum, item) => sum + item.lineTotal, 0)
      const method = pickWeighted<PaymentMethod>(random, [
        ['cash', 6],
        ['qris', 3],
        ['transfer', 1],
      ])
      const cashOptions = [total, ...quickCashOptions(total, 2)]
      const cashReceived =
        method === 'cash' ? (cashOptions[Math.floor(random() * cashOptions.length)] ?? total) : null
      const isVoid = random() < 0.02
      state.transactions.push({
        id: newId(),
        businessId: business.id,
        receiptNo: formatReceiptNo({
          prefix: business.receiptPrefix,
          occurredAt,
          timeZone: tz,
          deviceCode: SEED_DEVICE.code,
          seq: index + 1,
        }),
        occurredAt: occurredAt.toISOString(),
        plateNumber: random() < 0.5 ? randomPlate(random) : null,
        paymentMethod: method,
        total,
        cashReceived,
        changeAmount: cashReceived === null ? null : cashReceived - total,
        status: isVoid ? 'void' : 'paid',
        voidReason: isVoid ? 'Salah input layanan' : null,
        voidedAt: isVoid ? new Date(occurredAt.getTime() + 5 * 60_000).toISOString() : null,
        deviceId: `${SEED_DEVICE.id}-${business.id}`,
        receivedAt: occurredAt.toISOString(),
        items: txItems,
      })
    })

    // Small daily drawer expenses.
    const drawerExpenses: [ExpenseCategoryName, string, number][] = [
      ['Bahan', 'Sabun & shampo mobil', 25_000 + Math.floor(random() * 6) * 10_000],
      ['Operasional', 'Air minum & kebersihan', 10_000 + Math.floor(random() * 3) * 5_000],
    ]
    drawerExpenses.forEach(([category, note, amount], index) => {
      const occurredAt = at(dayKey, 10 + index * 4, 15)
      if (isToday && occurredAt.getTime() >= now.getTime()) return
      if (random() < 0.3) return
      state.expenses.push(
        expense(business.id, expenseCategory[category].id, amount, note, 'drawer', occurredAt),
      )
    })

    // Monthly owner expenses.
    const dayOfMonth = Number(dayKey.slice(8, 10))
    if (dayOfMonth === 1) {
      const occurredAt = at(dayKey, 9, 0)
      state.expenses.push(
        expense(
          business.id,
          expenseCategory.Gaji.id,
          dailyBase * 250_000,
          'Gaji karyawan',
          'owner',
          occurredAt,
        ),
        expense(
          business.id,
          expenseCategory.Sewa.id,
          dailyBase * 150_000,
          'Sewa tempat',
          'owner',
          occurredAt,
        ),
      )
    }
    if (dayOfMonth === 5) {
      state.expenses.push(
        expense(
          business.id,
          expenseCategory.Operasional.id,
          dailyBase * 40_000,
          'Listrik & air',
          'owner',
          at(dayKey, 9, 30),
        ),
      )
    }
  }

  const reserve = (
    daysAgo: number,
    movement: Omit<ReserveMovement, 'id' | 'businessId' | 'occurredAt'>,
  ) =>
    state.reserveMovements.push({
      id: newId(),
      businessId: business.id,
      occurredAt: at(shiftDayKey(todayKey, -daysAgo), 18, 0).toISOString(),
      ...movement,
    })
  reserve(40, { type: 'deposit', amount: dailyBase * 250_000, source: 'capital', reason: null })
  reserve(20, { type: 'deposit', amount: dailyBase * 60_000, source: 'cash', reason: null })
  reserve(9, {
    type: 'withdraw',
    amount: dailyBase * 25_000,
    source: null,
    reason: 'Servis mesin steam',
  })
}

function expense(
  businessId: string,
  categoryId: string,
  amount: number,
  note: string,
  source: Expense['source'],
  occurredAt: Date,
): Expense {
  return {
    id: newId(),
    businessId,
    categoryId,
    amount,
    note,
    source,
    occurredAt: occurredAt.toISOString(),
    status: 'active',
    voidReason: null,
    voidedAt: null,
    receivedAt: occurredAt.toISOString(),
  }
}

export function createSeedState(now: Date): PreviewState {
  const saimara: Business = {
    id: 'saimara',
    name: 'Saimara',
    logoUrl: null,
    address: 'Alamat usaha (isi di Pengaturan)',
    phone: '0812-0000-0000',
    receiptFooter: 'Terima kasih, sampai jumpa lagi!',
    primaryColor: '#0e7490',
    receiptPrefix: 'SMR',
    timezone: 'Asia/Jakarta',
    openingCash: 2_000_000,
    isActive: true,
  }
  const demo: Business = {
    id: 'usaha-contoh',
    name: 'Usaha Contoh',
    logoUrl: null,
    address: 'Usaha kedua untuk mencoba pemilih usaha',
    phone: '0813-0000-0000',
    receiptFooter: 'Terima kasih!',
    primaryColor: '#7c3aed',
    receiptPrefix: 'UC',
    timezone: 'Asia/Makassar',
    openingCash: 500_000,
    isActive: true,
  }

  const state: PreviewState = {
    version: 2,
    seededAt: now.toISOString(),
    businesses: [saimara, demo],
    catalogCategories: [],
    catalogItems: [],
    expenseCategories: [],
    transactions: [],
    expenses: [],
    reserveMovements: [],
    cashierAccounts: [
      { businessId: saimara.id, username: 'kasir.saimara', isActive: true },
      { businessId: demo.id, username: 'kasir.contoh', isActive: true },
    ],
    devices: [saimara, demo].map((b) => ({
      id: `${SEED_DEVICE.id}-${b.id}`,
      businessId: b.id,
      code: SEED_DEVICE.code,
      registeredAt: now.toISOString(),
    })),
  }
  buildBusiness({ business: saimara, catalog: SAIMARA_CATALOG, dailyBase: 18, seed: 7 }, now, state)
  buildBusiness({ business: demo, catalog: DEMO_CATALOG, dailyBase: 6, seed: 11 }, now, state)
  return state
}
