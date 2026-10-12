export interface Ordered {
  id: string
  sortOrder: number
}

/**
 * Swaps `id` with its neighbour (`direction` -1 = up, 1 = down) among the rows that
 * share its group, returning a new array. Rows outside the group are untouched.
 */
export function moveInOrder<T extends Ordered>(
  rows: readonly T[],
  id: string,
  direction: -1 | 1,
  sameGroup: (a: T, b: T) => boolean = () => true,
): T[] {
  const target = rows.find((row) => row.id === id)
  if (!target) return [...rows]
  const group = rows
    .filter((row) => sameGroup(row, target))
    .sort((a, b) => a.sortOrder - b.sortOrder)
  const index = group.findIndex((row) => row.id === id)
  const neighbour = group[index + direction]
  if (!neighbour) return [...rows]
  // Renumber the group so equal or sparse sort orders still move predictably.
  const reordered = group.map((row) => row.id)
  reordered[index] = neighbour.id
  reordered[index + direction] = id
  const order = new Map(reordered.map((rowId, position) => [rowId, position]))
  return rows.map((row) => {
    const position = order.get(row.id)
    return position === undefined ? row : { ...row, sortOrder: position }
  })
}

export function bySortOrder<T extends Ordered>(a: T, b: T): number {
  return a.sortOrder - b.sortOrder
}

/** Next sort order at the end of a group. */
export function nextSortOrder(rows: readonly Ordered[]): number {
  return rows.reduce((max, row) => Math.max(max, row.sortOrder + 1), 0)
}
