import { describe, expect, it } from 'vitest'
import { noteProblem } from './rules'

describe('noteProblem', () => {
  const lainnya = { requiresNote: true }
  const makan = { requiresNote: false }

  it('requires a note of three letters (after trimming) for "Lainnya"', () => {
    expect(noteProblem(lainnya, '')).not.toBeNull()
    expect(noteProblem(lainnya, '  ab  ')).not.toBeNull()
    expect(noteProblem(lainnya, 'Beli lampu teras')).toBeNull()
  })

  it('leaves the note optional elsewhere, up to 200 letters', () => {
    expect(noteProblem(makan, '')).toBeNull()
    expect(noteProblem(makan, 'x'.repeat(201))).not.toBeNull()
  })
})
