import { describe, expect, it } from 'vitest'
import {
  brandCssVariables,
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
