import type { ExpenseCategory } from '@/lib/types'

// Note rules shared by the cashier, the owner and the outbox, so an expense the device
// accepts offline is never refused by the server later (create_expense, decision #36).

export const NOTE_MIN = 3
export const NOTE_MAX = 200

/** The problem with `note` for `category`, or null when it may be saved. */
export function noteProblem(
  category: Pick<ExpenseCategory, 'requiresNote'> | undefined,
  note: string,
): string | null {
  const length = note.trim().length
  if (length > NOTE_MAX) return `Catatan maksimal ${NOTE_MAX} huruf`
  if (category?.requiresNote && length < NOTE_MIN) {
    return `Tulis keterangan (min. ${NOTE_MIN} huruf), mis. "beli lampu teras"`
  }
  return null
}
