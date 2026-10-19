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
    '--brand-ink': brandInk(primaryColor),
    '--brand-soft': brandSoft(primaryColor),
  }
}

function toHex(channels: number[]): string {
  return `#${channels
    .map((c) =>
      Math.round(Math.min(255, Math.max(0, c)))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`
}

function channels(hex: string): number[] {
  if (!isHexColor(hex)) throw new RangeError(`Warna tidak valid: ${hex}`)
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
}

/** Linear sRGB mix: `weight` 0 → `a`, 1 → `b`. */
export function mixColors(a: string, b: string, weight: number): string {
  const ca = channels(a)
  const cb = channels(b)
  return toHex(ca.map((c, i) => c + ((cb[i] ?? c) - c) * weight))
}

/**
 * The brand color as text on white: the color itself when it already reaches WCAG AA
 * (4.5:1), otherwise darkened step by step until it does. Keeps hue, never fails AA.
 */
export function brandInk(primaryColor: string): string {
  for (let step = 0; step <= 20; step++) {
    const candidate = mixColors(primaryColor, '#000000', step * 0.05)
    if (contrastRatio(candidate, LIGHT_FOREGROUND) >= 4.5) return candidate
  }
  return DARK_FOREGROUND
}

/** A faint tint of the brand color for selected rows and highlighted surfaces. */
export function brandSoft(primaryColor: string): string {
  return mixColors(primaryColor, LIGHT_FOREGROUND, 0.9)
}

export interface ContrastCheck {
  label: string
  ratio: number
  /** WCAG 2.2 AA minimum for this use. */
  required: number
  pass: boolean
  note?: string
}

/** WCAG AA checks for every way the brand color is used in the app. */
export function brandContrastChecks(primaryColor: string): ContrastCheck[] {
  const check = (label: string, ratio: number, required: number, note?: string) => ({
    label,
    ratio,
    required,
    pass: ratio >= required,
    note,
  })
  const ink = brandInk(primaryColor)
  return [
    check(
      'Teks di tombol & header',
      contrastRatio(primaryColor, readableForeground(primaryColor)),
      4.5,
    ),
    check('Garis, ikon & grafik di latar putih', contrastRatio(primaryColor, LIGHT_FOREGROUND), 3),
    check(
      'Teks berwarna brand di latar putih',
      contrastRatio(ink, LIGHT_FOREGROUND),
      4.5,
      ink === primaryColor.toLowerCase() ? undefined : `Otomatis digelapkan ke ${ink}`,
    ),
  ]
}
