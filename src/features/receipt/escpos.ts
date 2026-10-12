import type { ReceiptLine } from './format-receipt'

// Minimal ESC/POS encoder: only the commands every common 58/80mm printer supports.

const ESC = 0x1b
const GS = 0x1d
const LF = 0x0a

export const ESCPOS = {
  init: [ESC, 0x40],
  alignLeft: [ESC, 0x61, 0x00],
  alignCenter: [ESC, 0x61, 0x01],
  boldOn: [ESC, 0x45, 0x01],
  boldOff: [ESC, 0x45, 0x00],
  doubleHeightOn: [GS, 0x21, 0x01],
  normalSize: [GS, 0x21, 0x00],
  /** Feed n lines so the receipt clears the tear bar. */
  feed: (lines: number) => [ESC, 0x64, lines],
  /** Partial cut; printers without a cutter ignore it. */
  cut: [GS, 0x56, 0x42, 0x00],
} as const

function ascii(text: string): number[] {
  // Lines from formatReceipt are already printable ASCII; guard anyway.
  return Array.from(text, (char) => {
    const code = char.charCodeAt(0)
    return code >= 0x20 && code <= 0x7e ? code : 0x3f
  })
}

export function encodeReceipt(lines: readonly ReceiptLine[]): Uint8Array<ArrayBuffer> {
  const bytes: number[] = [...ESCPOS.init]
  for (const line of lines) {
    bytes.push(...(line.align === 'center' ? ESCPOS.alignCenter : ESCPOS.alignLeft))
    if (line.bold) bytes.push(...ESCPOS.boldOn)
    // Double height keeps the width, so the padded columns still line up.
    if (line.large) bytes.push(...ESCPOS.doubleHeightOn)
    bytes.push(...ascii(line.text), LF)
    if (line.large) bytes.push(...ESCPOS.normalSize)
    if (line.bold) bytes.push(...ESCPOS.boldOff)
  }
  bytes.push(...ESCPOS.alignLeft, ...ESCPOS.feed(4), ...ESCPOS.cut)
  return Uint8Array.from(bytes)
}

/** Splits a payload into BLE-sized writes. */
export function chunk(bytes: Uint8Array<ArrayBuffer>, size: number): Uint8Array<ArrayBuffer>[] {
  const chunks: Uint8Array<ArrayBuffer>[] = []
  for (let offset = 0; offset < bytes.length; offset += size) {
    chunks.push(bytes.subarray(offset, offset + size))
  }
  return chunks
}
