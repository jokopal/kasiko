export const MAX_PLATE_LENGTH = 12

/** `" b  1234 xyz "` → `"B 1234 XYZ"`; empty input → `null` (plate is optional). */
export function normalizePlate(input: string): string | null {
  const normalized = input.trim().replace(/\s+/g, ' ').toUpperCase()
  if (normalized === '') return null
  return normalized.slice(0, MAX_PLATE_LENGTH)
}
