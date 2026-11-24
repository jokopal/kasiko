// Turns audit_log rows (decision #21) into readable lines for the Log Audit page (#44):
// who did it, what kind of change, on what, and each field's old → new value. Pure.

import { formatRupiah } from '@/lib/money'

export type AuditKind =
  'koreksi' | 'harga' | 'katalog' | 'pengaturan' | 'akun' | 'pembatalan' | 'pengeluaran'

export const AUDIT_KIND_LABEL: Record<AuditKind, string> = {
  koreksi: 'Koreksi nota',
  harga: 'Harga',
  katalog: 'Katalog',
  pengaturan: 'Pengaturan',
  akun: 'Akun',
  pembatalan: 'Pembatalan',
  pengeluaran: 'Pengeluaran',
}

/** The audit_log entities each filter asks the server for. */
export const AUDIT_KIND_ENTITIES: Record<AuditKind, string[]> = {
  koreksi: ['transactions'],
  harga: ['catalog_items'],
  katalog: ['catalog_items', 'catalog_categories', 'discounts'],
  pengaturan: ['businesses', 'expense_categories'],
  akun: ['business_members', 'cashier_password'],
  pembatalan: ['transactions', 'expenses'],
  pengeluaran: ['expenses'],
}

export function isAuditKind(value: string | null): value is AuditKind {
  return value !== null && value in AUDIT_KIND_LABEL
}

export interface AuditRow {
  actorId: string | null
  action: string
  entity: string
  oldData: Record<string, unknown> | null
  newData: Record<string, unknown> | null
}

export interface AuditChange {
  field: string
  from: string
  to: string
}

export interface AuditLine {
  kind: AuditKind
  title: string
  subject: string
  changes: AuditChange[]
}

const FIELD_LABEL: Record<string, string> = {
  name: 'Nama',
  price: 'Harga',
  is_active: 'Aktif',
  sort_order: 'Urutan',
  category_id: 'Kategori',
  counts_vehicles: 'Dihitung kendaraan',
  kind: 'Jenis',
  allow_drawer: 'Boleh dari laci',
  requires_note: 'Wajib keterangan',
  type: 'Tipe',
  value: 'Nilai',
  address: 'Alamat',
  phone: 'Telepon',
  receipt_footer: 'Teks penutup nota',
  primary_color: 'Warna utama',
  receipt_prefix: 'Prefix nota',
  timezone: 'Zona waktu',
  logo_path: 'Logo',
  opening_cash: 'Saldo awal kas',
  drawer_float: 'Modal laci',
  opening_reserve: 'Uang dingin',
  cashier_can_edit_prices: 'Kasir boleh ubah harga',
  role: 'Peran',
  status: 'Status',
  void_reason: 'Alasan batal',
}

const MONEY_FIELDS = new Set(['price', 'opening_cash', 'drawer_float', 'opening_reserve'])
// Bookkeeping columns that change with every save and mean nothing to the owner.
const IGNORED = new Set(['updated_at', 'created_at', 'voided_at', 'voided_by', 'received_at'])

function formatValue(field: string, value: unknown, names: ReadonlyMap<string, string>): string {
  if (value === null || value === undefined || value === '') return '–'
  if (typeof value === 'boolean') return value ? 'Ya' : 'Tidak'
  if (MONEY_FIELDS.has(field) && typeof value === 'number') return formatRupiah(value)
  if (field === 'category_id' && typeof value === 'string')
    return names.get(value) ?? 'kategori lain'
  if (typeof value === 'string') return value
  if (typeof value === 'number') return value.toLocaleString('id-ID')
  return JSON.stringify(value)
}

/** Fields whose value differs between old and new, in a stable, readable order. */
export function auditChanges(
  row: AuditRow,
  names: ReadonlyMap<string, string> = new Map(),
): AuditChange[] {
  const { oldData, newData } = row
  if (!oldData || !newData) return []
  const fields = Object.keys(FIELD_LABEL).filter(
    (field) =>
      !IGNORED.has(field) &&
      (field in oldData || field in newData) &&
      JSON.stringify(oldData[field] ?? null) !== JSON.stringify(newData[field] ?? null),
  )
  return fields.map((field) => ({
    field: FIELD_LABEL[field] ?? field,
    from: formatValue(field, oldData[field], names),
    to: formatValue(field, newData[field], names),
  }))
}

const isPriceChange = (row: AuditRow) =>
  row.entity === 'catalog_items' &&
  row.action === 'update' &&
  row.oldData?.price !== undefined &&
  row.oldData.price !== row.newData?.price

/** True when the row belongs under the filter (price changes are also catalog changes). */
export function matchesKind(row: AuditRow, kind: AuditKind): boolean {
  return describeAudit(row).kind === kind || (kind === 'katalog' && isPriceChange(row))
}

const ENTITY_LABEL: Record<string, string> = {
  catalog_items: 'Layanan',
  catalog_categories: 'Kategori layanan',
  discounts: 'Diskon',
  expense_categories: 'Kategori pengeluaran',
  businesses: 'Pengaturan usaha',
  business_members: 'Anggota usaha',
  transactions: 'Transaksi',
  expenses: 'Pengeluaran',
}

function subjectOf(row: AuditRow): string {
  const data = row.newData ?? row.oldData ?? {}
  const pick = (key: string) => (typeof data[key] === 'string' ? data[key] : null)
  if (row.entity === 'business_members') {
    return pick('role') === 'cashier' ? 'Akun kasir' : 'Akun owner'
  }
  return pick('name') ?? pick('receipt_no') ?? ENTITY_LABEL[row.entity] ?? row.entity
}

export function describeAudit(
  row: AuditRow,
  names: ReadonlyMap<string, string> = new Map(),
): AuditLine {
  const subject = subjectOf(row)
  const changes = auditChanges(row, names)
  const entity = ENTITY_LABEL[row.entity] ?? row.entity

  if (row.entity === 'cashier_password') {
    return { kind: 'akun', title: 'Kata sandi kasir dibuka', subject: 'Akun kasir', changes: [] }
  }
  if (row.action === 'correction') {
    return { kind: 'koreksi', title: 'Nota dikoreksi', subject, changes: correctionChanges(row) }
  }
  if (row.action === 'void') {
    const reason = typeof row.newData?.void_reason === 'string' ? row.newData.void_reason : null
    return {
      kind: 'pembatalan',
      title: `${entity} dibatalkan`,
      subject,
      changes: reason ? [{ field: 'Alasan', from: '–', to: reason }] : [],
    }
  }
  if (row.action === 'recategorize') {
    return { kind: 'pengeluaran', title: 'Pengeluaran dipindah kategori', subject, changes }
  }
  if (isPriceChange(row)) {
    return { kind: 'harga', title: 'Harga diubah', subject, changes }
  }
  const kind: AuditKind =
    row.entity === 'business_members'
      ? 'akun'
      : row.entity === 'businesses' || row.entity === 'expense_categories'
        ? 'pengaturan'
        : 'katalog'
  const verb = row.action === 'insert' ? 'ditambahkan' : 'diubah'
  return {
    kind,
    title: `${entity} ${verb}`,
    subject,
    changes: row.action === 'insert' ? [] : changes,
  }
}

export function actorLabel(actorId: string | null, roles: ReadonlyMap<string, string>): string {
  if (!actorId) return 'Sistem'
  const role = roles.get(actorId)
  return role === 'cashier' ? 'Kasir' : role === 'owner' ? 'Owner' : 'Pengguna lain'
}

interface CorrectionSnapshot {
  plate_number?: unknown
  total?: unknown
  printed_total?: unknown
  items?: unknown
}

const lineText = (line: unknown) => {
  if (typeof line !== 'object' || line === null) return '–'
  const { name, qty, price } = line as { name?: unknown; qty?: unknown; price?: unknown }
  const amount = typeof price === 'number' ? formatRupiah(price) : '–'
  return `${typeof name === 'string' ? name : '–'} ${typeof qty === 'number' ? qty : '?'} × ${amount}`
}

/** Line-by-line old → new of a receipt correction, the printed total, and the real income. */
function correctionChanges(row: AuditRow): AuditChange[] {
  const before = (row.oldData ?? {}) as CorrectionSnapshot
  const after = (row.newData ?? {}) as CorrectionSnapshot
  const oldItems = Array.isArray(before.items) ? (before.items as unknown[]) : []
  const newItems = Array.isArray(after.items) ? (after.items as unknown[]) : []
  const changes: AuditChange[] = []
  for (let i = 0; i < Math.max(oldItems.length, newItems.length); i++) {
    const from = i < oldItems.length ? lineText(oldItems[i]) : '–'
    const to = i < newItems.length ? lineText(newItems[i]) : '–'
    if (from !== to) changes.push({ field: `Baris ${i + 1}`, from, to })
  }
  const plate = (value: unknown) => (typeof value === 'string' && value !== '' ? value : '–')
  if (plate(before.plate_number) !== plate(after.plate_number)) {
    changes.push({ field: 'Plat', from: plate(before.plate_number), to: plate(after.plate_number) })
  }
  const income = typeof after.total === 'number' ? after.total : null
  const printed = typeof after.printed_total === 'number' ? after.printed_total : null
  if (income !== null && printed !== null) {
    changes.push({ field: 'Total nota', from: formatRupiah(income), to: formatRupiah(printed) })
    changes.push({
      field: 'Pemasukan',
      from: formatRupiah(income),
      to: `${formatRupiah(income)} (tetap)`,
    })
  }
  return changes
}
