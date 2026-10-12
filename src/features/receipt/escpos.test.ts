import { describe, expect, it } from 'vitest'
import { chunk, encodeReceipt, ESCPOS } from './escpos'

const startsWith = (bytes: Uint8Array, prefix: readonly number[]) =>
  prefix.every((b, i) => bytes[i] === b)
const indexOf = (bytes: Uint8Array, seq: readonly number[]) => {
  for (let i = 0; i <= bytes.length - seq.length; i++) {
    if (seq.every((b, j) => bytes[i + j] === b)) return i
  }
  return -1
}

describe('encodeReceipt', () => {
  const bytes = encodeReceipt([
    { text: 'Saimara', align: 'center', bold: true, large: false },
    { text: 'TOTAL   Rp 1', align: 'left', bold: true, large: true },
  ])

  it('initialises the printer and ends with feed + cut', () => {
    expect(startsWith(bytes, ESCPOS.init)).toBe(true)
    expect(Array.from(bytes.slice(-ESCPOS.cut.length))).toEqual([...ESCPOS.cut])
  })

  it('applies alignment and emphasis around the text', () => {
    const text = Array.from('Saimara', (c) => c.charCodeAt(0))
    expect(
      indexOf(bytes, [...ESCPOS.alignCenter, ...ESCPOS.boldOn, ...text, 0x0a]),
    ).toBeGreaterThan(0)
    expect(indexOf(bytes, ESCPOS.doubleHeightOn)).toBeGreaterThan(0)
    expect(indexOf(bytes, ESCPOS.normalSize)).toBeGreaterThan(indexOf(bytes, ESCPOS.doubleHeightOn))
  })

  it('replaces non-ASCII defensively', () => {
    const out = encodeReceipt([{ text: 'é', align: 'left', bold: false, large: false }])
    expect(out).toContain(0x3f)
  })
})

describe('chunk', () => {
  it('splits into BLE-sized pieces without losing bytes', () => {
    const parts = chunk(
      Uint8Array.from({ length: 45 }, (_, i) => i),
      20,
    )
    expect(parts.map((p) => p.length)).toEqual([20, 20, 5])
    expect(parts.flatMap((p) => Array.from(p))).toHaveLength(45)
  })
})
