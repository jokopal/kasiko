import { businessDayKey, shiftDayKey, startOfBusinessDayKey, getZonedParts } from '@/lib/datetime'
import { newId } from '@/lib/id'
import type {
  Business,
  CatalogCategory,
  CatalogItem,
  Expense,
  ExpenseCategory,
  HistoricalDay,
  PaymentMethod,
  ReserveMovement,
  Transaction,
} from '@/lib/types'
import { templateRows } from '@/features/business/apply-template'
import { normalizeLayout, type BusinessConfig } from '@/features/business/config'
import { findTemplate, type BusinessTemplate } from '@/features/business/templates'
import { quickCashOptions } from '@/features/pos/payment'
import { formatReceiptNo } from '@/features/receipt/receipt-number'

// Sample data for the preview. Each business is built from a template (decision #25);
// volumes follow the Saimara cash-flow audit (≈ Rp 1,9 jt/day, daily commission ≈ 35%),
// prices stay placeholders until the owner provides the real price list (open question #5).
// No row from the owner's spreadsheet is ever embedded here — it is imported at runtime.

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
  version: 3
  seededAt: string
  businesses: Business[]
  businessConfigs: BusinessConfig[]
  catalogCategories: CatalogCategory[]
  catalogItems: CatalogItem[]
  expenseCategories: ExpenseCategory[]
  transactions: Transaction[]
  expenses: Expense[]
  reserveMovements: ReserveMovement[]
  historicalDays: HistoricalDay[]
  cashierAccounts: CashierAccount[]
  devices: RegisteredDevice[]
}

/** Relative popularity per item name; 0 = add-on (sold alongside a main service). */
const ITEM_WEIGHTS: Record<string, number> = {
  'Cuci Mobil Kecil': 30,
  'Cuci Mobil Sedang': 25,
  'Cuci Mobil Besar / SUV': 18,
  'Cuci Pick-up': 6,
  'Cuci Motor': 14,
  'Salon Interior': 2,
  'Poles Body': 2,
  'Cuci Mesin': 4,
  'Cuci Kolong': 4,
  'Layanan Reguler': 10,
  'Layanan Premium': 4,
}

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
  template: BusinessTemplate
  dailyBase: number
  seed: number
  expensePlan: ExpensePlan
}

type SeedState = Omit<
  PreviewState,
  'version' | 'seededAt' | 'businesses' | 'businessConfigs' | 'cashierAccounts' | 'devices'
>

interface DayContext {
  dayOfMonth: number
  /** Paid revenue of the day — the daily commission is a share of it. */
  revenue: number
  random: Random
  /** Adds an expense unless its time is still in the future. */
  add: (
    category: string,
    amount: number,
    note: string,
    source: Expense['source'],
    hour: number,
  ) => void
}

type ExpensePlan = (day: DayContext) => void

const roundTo = (value: number, step: number) => Math.round(value / step) * step
const between = (random: Random, min: number, max: number, step: number) =>
  min + Math.floor(random() * ((max - min) / step + 1)) * step

const carWashPlan: ExpensePlan = ({ dayOfMonth, revenue, random, add }) => {
  // Daily, paid from the drawer at closing.
  const commission = roundTo(revenue * (0.34 + random() * 0.04), 500)
  add('Gaji Harian (Komisi)', commission, 'Komisi pencuci', 'drawer', 17.5)
  add('Upah Kasir', 50_000, 'Upah kasir harian', 'drawer', 17.75)
  add('Makan & Konsumsi', between(random, 90_000, 150_000, 15_000), 'Makan anggota', 'drawer', 12)
  if (random() < 0.8) {
    add(
      'Upah Driver & Antar-Jemput',
      between(random, 60_000, 86_000, 2_000),
      'Antar-jemput',
      'drawer',
      16,
    )
  }
  if (random() < 0.55) {
    add(
      'Komisi Cuci Gratis/Promo',
      17_500 * (1 + Math.floor(random() * 3)),
      'Cuci gratis',
      'drawer',
      15,
    )
  }
  if (random() < 0.3) {
    add('Alat & Bahan Cuci', between(random, 30_000, 210_000, 10_000), 'Sabun & lap', 'drawer', 10)
  }
  if (random() < 0.33) add('Listrik, Air & Internet', 200_000, 'Token listrik', 'drawer', 9)
  if (random() < 0.12) add('Prive Owner', 20_000, 'Diambil owner', 'drawer', 14)
  // Monthly, paid by the owner (never touches the drawer).
  if (dayOfMonth === 1) add('Gaji Bulanan Staf', 3_800_000, 'Gaji QC & finance', 'owner', 9)
  if (dayOfMonth === 5) add('Listrik, Air & Internet', 450_000, 'Wifi bulanan', 'owner', 9)
  if (dayOfMonth === 10) add('Cicilan & Utang', 4_800_000, 'Cicilan bank', 'owner', 9)
  if (dayOfMonth === 15) add('Prive Keluarga', 1_000_000, 'Kebutuhan rumah', 'owner', 19)
  if (dayOfMonth === 20) add('Kebersihan & Sampah', 75_000, 'Sampah bulanan', 'owner', 9)
}

const generalPlan: ExpensePlan = ({ dayOfMonth, random, add }) => {
  if (random() < 0.7) {
    add('Bahan', between(random, 25_000, 75_000, 10_000), 'Bahan habis pakai', 'drawer', 10)
  }
  if (random() < 0.7) {
    add('Operasional', between(random, 10_000, 20_000, 5_000), 'Air minum', 'drawer', 14)
  }
  if (dayOfMonth === 1) {
    add('Gaji', 1_500_000, 'Gaji karyawan', 'owner', 9)
    add('Sewa', 900_000, 'Sewa tempat', 'owner', 9)
  }
}

function buildBusiness(input: BusinessSeed, now: Date, state: SeedState) {
  const { business, template, dailyBase } = input
  const random = mulberry32(input.seed)
  const tz = business.timezone

  const rows = templateRows(template, business.id, state)
  state.catalogCategories.push(...rows.catalogCategories)
  state.catalogItems.push(...rows.catalogItems)
  state.expenseCategories.push(...rows.expenseCategories)
  const weighted: [CatalogItem, number][] = []
  const addons: CatalogItem[] = []
  for (const item of rows.catalogItems) {
    const weight = ITEM_WEIGHTS[item.name] ?? 0
    if (weight > 0) weighted.push([item, weight])
    else addons.push(item)
  }
  const categoryId = (name: string) => {
    const category = rows.expenseCategories.find((c) => c.name === name)
    if (!category) throw new Error(`Kategori ${name} tidak ada di template ${template.id}`)
    return category.id
  }

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

    let revenue = 0
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
      if (!isVoid) revenue += total
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

    input.expensePlan({
      dayOfMonth: Number(dayKey.slice(8, 10)),
      revenue,
      random,
      add: (category, amount, note, source, hour) => {
        const occurredAt = at(dayKey, Math.floor(hour), Math.round((hour % 1) * 60))
        if (amount <= 0 || (isToday && occurredAt.getTime() >= now.getTime())) return
        state.expenses.push(
          expense(business.id, categoryId(category), amount, note, source, occurredAt),
        )
      },
    })
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

export function configFromTemplate(businessId: string, template: BusinessTemplate): BusinessConfig {
  return {
    businessId,
    templateId: template.id,
    dashboard: normalizeLayout(template.dashboard),
    importMapping: {},
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
  const carWash = findTemplate('cuci-mobil')
  const general = findTemplate('umum')

  const state: PreviewState = {
    version: 3,
    seededAt: now.toISOString(),
    businesses: [saimara, demo],
    businessConfigs: [
      configFromTemplate(saimara.id, carWash),
      configFromTemplate(demo.id, general),
    ],
    catalogCategories: [],
    catalogItems: [],
    expenseCategories: [],
    transactions: [],
    expenses: [],
    reserveMovements: [],
    historicalDays: [],
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
  buildBusiness(
    { business: saimara, template: carWash, dailyBase: 28, seed: 7, expensePlan: carWashPlan },
    now,
    state,
  )
  buildBusiness(
    { business: demo, template: general, dailyBase: 6, seed: 11, expensePlan: generalPlan },
    now,
    state,
  )
  return state
}
