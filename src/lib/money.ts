// All money is integer rupiah. These helpers refuse fractional or unsafe values
// instead of silently rounding them.

const groupFormatter = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 })
const compactFormatter = new Intl.NumberFormat('id-ID', {
  notation: 'compact',
  maximumFractionDigits: 1,
})

export function assertRupiah(value: number): void {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`Nilai rupiah harus bilangan bulat: ${value}`)
  }
}

/** `35000` → `"Rp 35.000"`, `-5000` → `"-Rp 5.000"`. */
export function formatRupiah(value: number): string {
  assertRupiah(value)
  const sign = value < 0 ? '-' : ''
  return `${sign}Rp ${groupFormatter.format(Math.abs(value))}`
}

/** Short form for chart axes: `1250000` → `"Rp 1,3 jt"`. */
export function formatRupiahCompact(value: number): string {
  assertRupiah(value)
  const sign = value < 0 ? '-' : ''
  return `${sign}Rp ${compactFormatter.format(Math.abs(value))}`
}

/** Thousands-grouped digits without the currency prefix, for input fields. */
export function formatDigits(value: number): string {
  assertRupiah(value)
  return groupFormatter.format(value)
}

/**
 * Parses user input such as `"35.000"`, `"Rp 35.000"` or `"35000"`.
 * Returns `null` for empty, non-numeric, or decimal input (`"35.000,50"`).
 */
export function parseRupiah(input: string): number | null {
  const trimmed = input.trim()
  if (trimmed === '' || trimmed.includes(',')) return null
  const digits = trimmed.replace(/\D/g, '')
  if (digits === '') return null
  const value = Number(digits)
  return Number.isSafeInteger(value) ? value : null
}

export function sumRupiah(values: readonly number[]): number {
  let total = 0
  for (const value of values) {
    assertRupiah(value)
    total += value
  }
  assertRupiah(total)
  return total
}
