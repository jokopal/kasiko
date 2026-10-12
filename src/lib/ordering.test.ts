import { describe, expect, it } from 'vitest'
import { moveInOrder, nextSortOrder } from './ordering'

const rows = [
  { id: 'a', group: 1, sortOrder: 0 },
  { id: 'b', group: 1, sortOrder: 1 },
  { id: 'x', group: 2, sortOrder: 0 },
  { id: 'c', group: 1, sortOrder: 2 },
]
const sameGroup = (a: (typeof rows)[number], b: (typeof rows)[number]) => a.group === b.group
const order = (list: typeof rows, group: number) =>
  list
    .filter((r) => r.group === group)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((r) => r.id)

describe('moveInOrder', () => {
  it('moves within the group only', () => {
    const moved = moveInOrder(rows, 'c', -1, sameGroup)
    expect(order(moved, 1)).toEqual(['a', 'c', 'b'])
    expect(moved.find((r) => r.id === 'x')).toBe(rows[2])
  })

  it('is a no-op at the edges or for unknown ids', () => {
    expect(order(moveInOrder(rows, 'a', -1, sameGroup), 1)).toEqual(['a', 'b', 'c'])
    expect(order(moveInOrder(rows, 'c', 1, sameGroup), 1)).toEqual(['a', 'b', 'c'])
    expect(moveInOrder(rows, 'zzz', 1)).toEqual(rows)
  })

  it('handles duplicate sort orders', () => {
    const flat = [
      { id: 'p', sortOrder: 0 },
      { id: 'q', sortOrder: 0 },
    ]
    const moved = moveInOrder(flat, 'q', -1)
    expect(moved.sort((a, b) => a.sortOrder - b.sortOrder).map((r) => r.id)).toEqual(['q', 'p'])
  })
})

describe('nextSortOrder', () => {
  it('appends after the largest value', () => {
    expect(nextSortOrder([])).toBe(0)
    expect(nextSortOrder(rows)).toBe(3)
  })
})
