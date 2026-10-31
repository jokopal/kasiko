import * as XLSX from 'xlsx'
import { describe, expect, it } from 'vitest'
import type { ExpenseCategory } from '@/lib/types'
import {
  parseCashflowWorkbook,
  planImport,
  resolveLabels,
  SKIP_LABEL,
  type Cell,
} from './cashflow-import'
import { categoryTags, GUIDE_SHEET, TAG_INCOME, TAG_SKIP, tagFor, TAGS_SHEET } from './import-tags'
import { monthsOfYear, renderTemplate, templateMonth, type TemplateMonth } from './import-template'

const category = (id: string, name: string, kind: ExpenseCategory['kind'] = 'operating') => ({
  id,
  name,
  kind,
})
const categories = [
  category('c-makan', 'Makan & Konsumsi'),
  category('c-listrik', 'Listrik, Air & Internet'),
  category('c-cicilan', 'Cicilan & Utang', 'non_operating'),
  category('c-prive', 'Prive Owner', 'drawing'),
]
const tags = categoryTags(categories)

async function readBack(months: readonly TemplateMonth[]) {
  const buffer = await renderTemplate({
    businessName: 'Saimara',
    brandColor: '#0e7490',
    tags,
    months,
  })
  const workbook = XLSX.read(new Uint8Array(buffer), { type: 'array' })
  const sheets = workbook.SheetNames.map((name) => ({
    name,
    rows: XLSX.utils.sheet_to_json<Cell[]>(workbook.Sheets[name] ?? {}, {
      header: 1,
      raw: true,
      defval: null,
    }),
  }))
  return { names: workbook.SheetNames, sheets }
}

describe('import tags', () => {
  it('builds stable, unique tags from category names', () => {
    expect(tagFor('Listrik, Air & Internet')).toBe('#listrik-air-internet')
    expect(tagFor('Café Kopi')).toBe('#cafe-kopi')
    const twins = categoryTags([category('a', 'A & B'), category('b', 'A B')])
    expect(twins.map((t) => t.tag)).toEqual(['#a-b', '#a-b-2'])
  })

  it('never lets a category take over a reserved tag', () => {
    expect(categoryTags([category('a', 'Pendapatan')])[0]?.tag).toBe('#pendapatan-2')
  })
})

describe('the template file', () => {
  it('carries the guide, the tag list and twelve month sheets', async () => {
    const { names, sheets } = await readBack(
      monthsOfYear(2026).map((key) => templateMonth(key, tags)),
    )
    expect(names.slice(0, 3)).toEqual([GUIDE_SHEET, TAGS_SHEET, 'JAN-26'])
    expect(names).toHaveLength(14)
    const tagColumn = sheets.find((s) => s.name === TAGS_SHEET)?.rows.map((r) => r[0])
    expect(tagColumn).toEqual(['Tag', TAG_INCOME, ...tags.map((t) => t.tag), TAG_SKIP])
  })

  it('reads as nothing to import while it is blank', async () => {
    const { sheets } = await readBack([templateMonth('2026-02', tags)])
    const parsed = parseCashflowWorkbook(sheets)
    expect(parsed.months).toEqual([])
    expect(parsed.skippedSheets).toEqual([])
    expect(parsed.warnings).toEqual([])
  })

  it('imports a filled month into the right categories, to the rupiah', async () => {
    const month = templateMonth('2026-02', tags)
    month.income = { ...month.income, amounts: { 1: 2_000_000, 28: 500_000 } }
    const rows = month.groups.flatMap((g) => g.rows)
    const fill = (tag: string, amounts: Record<number, number>, label?: string) => {
      const row = rows.find((r) => r.tag === tag)
      if (!row) throw new Error(tag)
      row.amounts = amounts
      if (label) row.label = label
    }
    fill('#makan-konsumsi', { 1: 150_000 }, 'Makan siang anggota')
    fill('#cicilan-utang', { 28: 300_000 })
    const spare = rows.filter((r) => r.tag === null)
    if (spare[0])
      Object.assign(spare[0], { tag: TAG_SKIP, label: 'Label aneh', amounts: { 1: 90_000 } })
    if (spare[1]) Object.assign(spare[1], { tag: '#prive-owner', amounts: { 2: 40_000 } })

    const { sheets } = await readBack([month])
    const parsed = parseCashflowWorkbook(sheets)
    expect(parsed.warnings).toEqual([])
    const mapping = resolveLabels(parsed.labels, {
      categories,
      rules: [],
      saved: {},
      overrides: {},
    })
    expect(Object.values(mapping).every((m) => m.source === 'tag')).toBe(true)
    const ids = Object.fromEntries(Object.entries(mapping).map(([k, v]) => [k, v.categoryId]))
    expect(ids['label aneh']).toBe(SKIP_LABEL)

    const plan = planImport(parsed, ids, {
      businessId: 'biz',
      liveDayKeys: new Set(),
      now: new Date('2026-03-01T00:00:00Z'),
    })
    expect(plan.income).toBe(2_500_000)
    expect(plan.expense).toBe(490_000)
    expect(plan.skippedExpense).toBe(90_000)
    expect(plan.days.map((d) => [d.dayKey, d.income, d.expenses])).toEqual([
      ['2026-02-01', 2_000_000, [{ categoryId: 'c-makan', amount: 150_000 }]],
      ['2026-02-02', 0, [{ categoryId: 'c-prive', amount: 40_000 }]],
      ['2026-02-28', 500_000, [{ categoryId: 'c-cicilan', amount: 300_000 }]],
    ])
  })
})

describe('tagged rows in any workbook', () => {
  const header: Cell[] = ['Tag', 'Maret 2026', 1, 2, 'Total']
  const sheet = (rows: Cell[][]) => [{ name: 'MAR-26', rows: [header, ...rows] }]

  it('adds up several income rows and reads rows above them', () => {
    const parsed = parseCashflowWorkbook(
      sheet([
        ['#makan-konsumsi', 'Makan', 10_000, null, 10_000],
        [TAG_INCOME, 'Cuci', 100_000, null, 100_000],
        [TAG_INCOME, 'Salon', 50_000, 20_000, 70_000],
      ]),
    )
    expect(parsed.months[0]?.days.map((d) => d.income)).toEqual([150_000, 20_000])
    expect(parsed.labels.map((l) => l.key)).toEqual(['#makan-konsumsi'])
  })

  it('folds rows that share a tag and stops at the totals', () => {
    const parsed = parseCashflowWorkbook(
      sheet([
        [TAG_INCOME, 'Pendapatan', 100_000],
        ['#makan-konsumsi', 'Makan siang', 10_000],
        ['#makan-konsumsi', 'Kopi', 5_000],
        [null, 'Total Pengeluaran', 15_000],
        ['#makan-konsumsi', 'Di bawah total', 1],
      ]),
    )
    expect(parsed.labels).toMatchObject([{ key: '#makan-konsumsi', total: 15_000, entries: 2 }])
  })

  it('leaves an unknown tag for the owner to decide', () => {
    const parsed = parseCashflowWorkbook(
      sheet([
        [TAG_INCOME, 'Pendapatan', 100_000],
        ['#tidak-ada', 'Sesuatu', 10_000],
      ]),
    )
    const mapping = resolveLabels(parsed.labels, {
      categories,
      rules: [],
      saved: {},
      overrides: {},
    })
    expect(mapping['#tidak-ada']).toEqual({ categoryId: SKIP_LABEL, source: 'unknown' })
  })

  it('lets the owner override a tag', () => {
    const parsed = parseCashflowWorkbook(
      sheet([
        [TAG_INCOME, 'Pendapatan', 100_000],
        ['#makan-konsumsi', 'Makan', 10_000],
      ]),
    )
    const mapping = resolveLabels(parsed.labels, {
      categories,
      rules: [],
      saved: {},
      overrides: { '#makan-konsumsi': 'c-prive' },
    })
    expect(mapping['#makan-konsumsi']).toEqual({ categoryId: 'c-prive', source: 'manual' })
  })
})
