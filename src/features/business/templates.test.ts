import { describe, expect, it } from 'vitest'
import { templateRows } from './apply-template'
import { moveEntry, normalizeEntries, normalizeLayout, toggleEntry, visibleIds } from './config'
import { BUSINESS_TEMPLATES, findTemplate, normalizeLabel, suggestCategory } from './templates'

const carWash = findTemplate('cuci-mobil')
const suggest = (label: string) => suggestCategory(label, carWash.expenseCategories)

describe('suggestCategory', () => {
  it('matches spreadsheet labels regardless of case and spacing', () => {
    expect(normalizeLabel('  Makan   Anggota ')).toBe('makan anggota')
    expect(suggest('GRATIS CUCI')).toBe('Komisi Cuci Gratis/Promo')
    expect(suggest('Maintenece alat')).toBe('Perawatan & Perbaikan')
  })

  it('prefers an exact alias over a keyword', () => {
    // "listrik rumah" contains the utilities keyword, but its alias says family drawing.
    expect(suggest('Listrik rumah')).toBe('Prive Keluarga')
    expect(suggest('Listrik toko')).toBe('Listrik, Air & Internet')
    expect(suggest('Gaji')).toBe('Gaji Harian (Komisi)')
  })

  it('falls back to keywords for unseen labels', () => {
    expect(suggest('Gaji mandor')).toBe('Gaji Bulanan Staf')
    expect(suggest('Cicilan leasing pick-up')).toBe('Cicilan & Utang')
    expect(suggest('Jajan anak cuci')).toBe('Makan & Konsumsi')
    expect(suggest('Renovasi kanopi')).toBe('Aset & Renovasi')
  })

  it('leaves unknown and ambiguous labels to the owner (decision #29)', () => {
    for (const label of ['Oktober', 'haga', 'Finance', 'Kasir titip', '']) {
      expect(suggest(label)).toBeNull()
    }
  })

  it('separates the three kinds the way the profit tiers need', () => {
    const kindOf = (name: string) => carWash.expenseCategories.find((c) => c.name === name)?.kind
    expect(kindOf('Cicilan & Utang')).toBe('non_operating')
    expect(kindOf('Aset & Renovasi')).toBe('non_operating')
    expect(kindOf('Prive Owner')).toBe('drawing')
    expect(kindOf('Gaji Harian (Komisi)')).toBe('operating')
  })
})

describe('templates', () => {
  it('have unique category names', () => {
    for (const template of BUSINESS_TEMPLATES) {
      const names = template.expenseCategories.map((c) => normalizeLabel(c.name))
      expect(new Set(names).size).toBe(names.length)
    }
  })

  it('falls back to the general template for unknown ids', () => {
    expect(findTemplate('tidak-ada').id).toBe('umum')
  })
})

describe('templateRows', () => {
  const empty = { catalogCategories: [], catalogItems: [], expenseCategories: [] }

  it('creates the full template for an empty business', () => {
    const rows = templateRows(carWash, 'biz', empty)
    expect(rows.expenseCategories).toHaveLength(carWash.expenseCategories.length)
    expect(rows.catalogItems.length).toBeGreaterThan(0)
    expect(rows.expenseCategories.every((c) => c.businessId === 'biz' && c.isActive)).toBe(true)
    expect(rows.expenseCategories.map((c) => c.sortOrder)).toEqual(
      rows.expenseCategories.map((_, i) => i),
    )
  })

  it('adds nothing twice and never touches existing rows', () => {
    const first = templateRows(carWash, 'biz', empty)
    const renamed = first.expenseCategories.map((c, i) => (i === 0 ? { ...c, isActive: false } : c))
    const again = templateRows(carWash, 'biz', { ...first, expenseCategories: renamed })
    expect(again.catalogCategories).toHaveLength(0)
    expect(again.catalogItems).toHaveLength(0)
    expect(again.expenseCategories).toHaveLength(0)
  })

  it('only looks at the target business', () => {
    const other = templateRows(carWash, 'other', empty)
    const rows = templateRows(carWash, 'biz', other)
    expect(rows.expenseCategories).toHaveLength(carWash.expenseCategories.length)
  })
})

describe('dashboard layout', () => {
  it('keeps saved order, drops unknown ids and appends new ones hidden', () => {
    const entries = normalizeEntries(
      [
        { id: 'b', visible: true },
        { id: 'gone' as 'a', visible: true },
        { id: 'b', visible: false },
      ],
      ['a', 'b', 'c'] as const,
    )
    expect(entries).toEqual([
      { id: 'b', visible: true },
      { id: 'a', visible: false },
      { id: 'c', visible: false },
    ])
  })

  it('moves and toggles entries', () => {
    const entries = [
      { id: 'a', visible: true },
      { id: 'b', visible: true },
    ]
    expect(moveEntry(entries, 'b', -1).map((e) => e.id)).toEqual(['b', 'a'])
    expect(moveEntry(entries, 'a', -1).map((e) => e.id)).toEqual(['a', 'b'])
    expect(visibleIds(toggleEntry(entries, 'a', false))).toEqual(['b'])
  })

  it('normalizes every template layout to the full set of widgets', () => {
    for (const template of BUSINESS_TEMPLATES) {
      const layout = normalizeLayout(template.dashboard)
      expect(layout.kpis).toHaveLength(9)
      expect(layout.panels).toHaveLength(7)
    }
  })
})
