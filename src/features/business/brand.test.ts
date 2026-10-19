import { describe, expect, it } from 'vitest'
import {
  brandContrastChecks,
  brandCssVariables,
  brandInk,
  brandSoft,
  contrastRatio,
  DARK_FOREGROUND,
  isHexColor,
  LIGHT_FOREGROUND,
  readableForeground,
} from './brand'

describe('brand colors', () => {
  it('validates #rrggbb only', () => {
    expect(isHexColor('#0e7490')).toBe(true)
    expect(isHexColor('#fff')).toBe(false)
    expect(isHexColor('0e7490')).toBe(false)
  })

  it('computes WCAG contrast', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 0)
    expect(contrastRatio('#777777', '#777777')).toBeCloseTo(1, 5)
  })

  it('picks a readable foreground', () => {
    expect(readableForeground('#0e7490')).toBe(LIGHT_FOREGROUND)
    expect(readableForeground('#facc15')).toBe(DARK_FOREGROUND)
  })

  it('maps the color onto theme variables', () => {
    const vars = brandCssVariables('#b45309')
    expect(vars['--primary']).toBe('#b45309')
    expect(vars['--primary-foreground']).toBe(LIGHT_FOREGROUND)
  })

  it('rejects invalid colors', () => {
    expect(() => readableForeground('teal')).toThrow(RangeError)
  })
})

describe('derived brand tokens', () => {
  it('keeps a dark brand color as its own text color', () => {
    expect(brandInk('#0e7490')).toBe('#0e7490')
  })

  it('darkens a light brand color until text reaches WCAG AA', () => {
    const ink = brandInk('#facc15')
    expect(ink).not.toBe('#facc15')
    expect(contrastRatio(ink, LIGHT_FOREGROUND)).toBeGreaterThanOrEqual(4.5)
  })

  it('reports every use of the color against its WCAG minimum', () => {
    const checks = brandContrastChecks('#facc15')
    expect(checks.map((c) => c.required)).toEqual([4.5, 3, 4.5])
    expect(checks[1]?.pass).toBe(false) // yellow lines on white are too faint
    expect(checks[2]?.pass).toBe(true) // text falls back to the darkened ink
  })

  it('tints the soft surface toward white', () => {
    expect(contrastRatio(brandSoft('#0e7490'), LIGHT_FOREGROUND)).toBeLessThan(1.3)
  })
})
