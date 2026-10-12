// Brand color helpers. Each business has a single primary color (decision #10);
// the foreground color is derived so text on it always stays readable.

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/

export const DARK_FOREGROUND = '#0a0a0a'
export const LIGHT_FOREGROUND = '#ffffff'

export function isHexColor(value: string): boolean {
  return HEX_COLOR.test(value)
}

function channel(value: number): number {
  const c = value / 255
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

/** WCAG relative luminance of a `#rrggbb` color. */
export function relativeLuminance(hex: string): number {
  if (!isHexColor(hex)) throw new RangeError(`Warna tidak valid: ${hex}`)
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a)
  const lb = relativeLuminance(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

/** White or near-black, whichever contrasts more with `background`. */
export function readableForeground(background: string): string {
  return contrastRatio(background, LIGHT_FOREGROUND) >= contrastRatio(background, DARK_FOREGROUND)
    ? LIGHT_FOREGROUND
    : DARK_FOREGROUND
}

/** CSS custom properties that re-skin the shadcn theme with the business color. */
export function brandCssVariables(primaryColor: string): Record<string, string> {
  const foreground = readableForeground(primaryColor)
  return {
    '--primary': primaryColor,
    '--primary-foreground': foreground,
    '--ring': primaryColor,
    '--sidebar-primary': primaryColor,
    '--sidebar-primary-foreground': foreground,
    '--chart-1': primaryColor,
  }
}
