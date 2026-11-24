import { describe, expect, it } from 'vitest'
import { actorLabel, auditChanges, describeAudit, matchesKind, type AuditRow } from './audit-format'

const priceChange: AuditRow = {
  actorId: 'kasir-1',
  action: 'update',
  entity: 'catalog_items',
  oldData: { name: 'Cuci Motor Kecil', price: 15_000, updated_at: 'a' },
  newData: { name: 'Cuci Motor Kecil', price: 17_000, updated_at: 'b' },
}

describe('describeAudit', () => {
  it('reads a price change with old and new price', () => {
    expect(describeAudit(priceChange)).toEqual({
      kind: 'harga',
      title: 'Harga diubah',
      subject: 'Cuci Motor Kecil',
      changes: [{ field: 'Harga', from: 'Rp 15.000', to: 'Rp 17.000' }],
    })
  })

  it('reads a rename as a catalog change and names the category', () => {
    const row: AuditRow = {
      actorId: null,
      action: 'update',
      entity: 'catalog_items',
      oldData: { name: 'Truck', price: 100_000, category_id: 'c1' },
      newData: { name: 'Cuci Truk', price: 100_000, category_id: 'c2' },
    }
    const line = describeAudit(
      row,
      new Map([
        ['c1', 'Cuci'],
        ['c2', 'Kendaraan Besar'],
      ]),
    )
    expect(line.kind).toBe('katalog')
    expect(line.title).toBe('Layanan diubah')
    expect(line.changes).toEqual([
      { field: 'Nama', from: 'Truck', to: 'Cuci Truk' },
      { field: 'Kategori', from: 'Cuci', to: 'Kendaraan Besar' },
    ])
  })

  it('reads voids, password reveals and settings', () => {
    expect(
      describeAudit({
        actorId: 'o',
        action: 'void',
        entity: 'transactions',
        oldData: {},
        newData: { receipt_no: 'SMR-261124-A0001', void_reason: 'Salah input' },
      }),
    ).toMatchObject({ kind: 'pembatalan', subject: 'SMR-261124-A0001' })
    expect(
      describeAudit({
        actorId: 'o',
        action: 'reveal',
        entity: 'cashier_password',
        oldData: null,
        newData: null,
      }).title,
    ).toBe('Kata sandi kasir dibuka')
    expect(
      describeAudit({
        actorId: 'o',
        action: 'update',
        entity: 'businesses',
        oldData: { name: 'Saimara', cashier_can_edit_prices: false },
        newData: { name: 'Saimara', cashier_can_edit_prices: true },
      }),
    ).toEqual({
      kind: 'pengaturan',
      title: 'Pengaturan usaha diubah',
      subject: 'Saimara',
      changes: [{ field: 'Kasir boleh ubah harga', from: 'Tidak', to: 'Ya' }],
    })
  })
})

describe('filters and actors', () => {
  it('counts a price change under both Harga and Katalog', () => {
    expect(matchesKind(priceChange, 'harga')).toBe(true)
    expect(matchesKind(priceChange, 'katalog')).toBe(true)
    expect(matchesKind(priceChange, 'akun')).toBe(false)
  })

  it('ignores bookkeeping columns', () => {
    expect(
      auditChanges({ ...priceChange, newData: { ...priceChange.oldData, updated_at: 'z' } }),
    ).toEqual([])
  })

  it('labels the actor by role', () => {
    const roles = new Map([
      ['o', 'owner'],
      ['k', 'cashier'],
    ])
    expect(actorLabel('o', roles)).toBe('Owner')
    expect(actorLabel('k', roles)).toBe('Kasir')
    expect(actorLabel(null, roles)).toBe('Sistem')
  })
})

describe('receipt corrections in the audit log (decision #44)', () => {
  it('shows a Koreksi nota line with each changed line, the printed total and the kept income', () => {
    const line = describeAudit({
      actorId: 'k',
      action: 'correction',
      entity: 'transactions',
      oldData: {
        receipt_no: 'SMR-261124-A0001',
        total: 50_000,
        plate_number: 'B 1 A',
        items: [{ name: 'Cuci Mobil Sedang', qty: 1, price: 50_000 }],
      },
      newData: {
        receipt_no: 'SMR-261124-A0001',
        total: 50_000,
        printed_total: 45_000,
        plate_number: 'B 1 A',
        items: [{ name: 'Cuci Mobil Sedang', qty: 1, price: 45_000 }],
      },
    })
    expect(line.kind).toBe('koreksi')
    expect(line.title).toBe('Nota dikoreksi')
    expect(line.subject).toBe('SMR-261124-A0001')
    expect(line.changes).toEqual([
      {
        field: 'Baris 1',
        from: 'Cuci Mobil Sedang 1 × Rp 50.000',
        to: 'Cuci Mobil Sedang 1 × Rp 45.000',
      },
      { field: 'Total nota', from: 'Rp 50.000', to: 'Rp 45.000' },
      { field: 'Pemasukan', from: 'Rp 50.000', to: 'Rp 50.000 (tetap)' },
    ])
  })
})
