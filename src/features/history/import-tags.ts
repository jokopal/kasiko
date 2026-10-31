import type { ExpenseCategory, ExpenseKind } from '@/lib/types'

// Tags of the Kasiko import template (decision #38). Column A of a template row says what
// the row IS, so column B stays free text: "Makan siang" tagged #makan-konsumsi imports
// into that category with no label matching. Tags are built from the business's own
// categories, and a `#` prefix keeps them apart from anything in an old workbook.

/** The row holds income; several rows add up (e.g. one per service line). */
export const TAG_INCOME = '#pendapatan'
/** The row stays in the file but is not imported (decision #29). */
export const TAG_SKIP = '#lewati'

/** The sheets a template carries besides the months; the importer ignores them. */
export const GUIDE_SHEET = 'Panduan'
export const TAGS_SHEET = 'Tag'

/** `"Listrik, Air & Internet"` → `"#listrik-air-internet"`. */
export function tagFor(name: string): string {
  const slug = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return `#${slug || 'kategori'}`
}

/** The tag in a cell, normalized, or null when the cell is not a tag. */
export function tagOf(cell: unknown): string | null {
  if (typeof cell !== 'string') return null
  const text = cell.trim().toLowerCase()
  return /^#[a-z0-9][a-z0-9-]*$/.test(text) ? text : null
}

export interface CategoryTag {
  tag: string
  categoryId: string
  name: string
  kind: ExpenseKind
}

/**
 * One tag per category, in the order given. Two names that reduce to the same slug get a
 * numbered tag, so a tag always means exactly one category.
 */
export function categoryTags(
  categories: readonly Pick<ExpenseCategory, 'id' | 'name' | 'kind'>[],
): CategoryTag[] {
  const used = new Set([TAG_INCOME, TAG_SKIP])
  return categories.map((category) => {
    const base = tagFor(category.name)
    let tag = base
    for (let n = 2; used.has(tag); n++) tag = `${base}-${n}`
    used.add(tag)
    return { tag, categoryId: category.id, name: category.name, kind: category.kind }
  })
}
