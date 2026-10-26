import { newId } from '@/lib/id'
import { nextSortOrder } from '@/lib/ordering'
import type { CatalogCategory, CatalogItem, ExpenseCategory } from '@/lib/types'
import { normalizeLabel, type BusinessTemplate } from './templates'

export interface TemplateTarget {
  catalogCategories: readonly CatalogCategory[]
  catalogItems: readonly CatalogItem[]
  expenseCategories: readonly ExpenseCategory[]
}

export interface TemplateRows {
  catalogCategories: CatalogCategory[]
  catalogItems: CatalogItem[]
  expenseCategories: ExpenseCategory[]
}

/**
 * Rows a template would add to a business: only what is missing by (normalized) name,
 * appended after the existing order. Existing rows — including deactivated ones — are
 * never changed, so applying a template twice adds nothing.
 */
export function templateRows(
  template: BusinessTemplate,
  businessId: string,
  existing: TemplateTarget,
): TemplateRows {
  const mine = <T extends { businessId: string }>(rows: readonly T[]) =>
    rows.filter((row) => row.businessId === businessId)
  const catalogCategories = [...mine(existing.catalogCategories)]
  const catalogItems = [...mine(existing.catalogItems)]
  const expenseCategories = [...mine(existing.expenseCategories)]
  const added: TemplateRows = { catalogCategories: [], catalogItems: [], expenseCategories: [] }
  const sameName = (a: string, b: string) => normalizeLabel(a) === normalizeLabel(b)

  for (const group of template.catalog) {
    let category = catalogCategories.find((c) => sameName(c.name, group.category))
    if (!category) {
      category = {
        id: newId(),
        businessId,
        name: group.category,
        sortOrder: nextSortOrder(catalogCategories),
        isActive: true,
      }
      catalogCategories.push(category)
      added.catalogCategories.push(category)
    }
    for (const item of group.items) {
      if (catalogItems.some((i) => sameName(i.name, item.name))) continue
      const siblings = catalogItems.filter((i) => i.categoryId === category.id)
      const row: CatalogItem = {
        id: newId(),
        businessId,
        categoryId: category.id,
        name: item.name,
        price: item.price,
        sortOrder: nextSortOrder(siblings),
        isActive: true,
      }
      catalogItems.push(row)
      added.catalogItems.push(row)
    }
  }

  for (const category of template.expenseCategories) {
    // Mirrors apply_template_rows: never a second catch-all "Lainnya".
    const requiresNote = category.requiresNote ?? false
    if (
      expenseCategories.some(
        (c) => sameName(c.name, category.name) || (requiresNote && c.requiresNote),
      )
    ) {
      continue
    }
    const row: ExpenseCategory = {
      id: newId(),
      businessId,
      name: category.name,
      sortOrder: nextSortOrder(expenseCategories),
      isActive: true,
      kind: category.kind,
      allowDrawer: category.allowDrawer,
      requiresNote,
    }
    expenseCategories.push(row)
    added.expenseCategories.push(row)
  }
  return added
}
