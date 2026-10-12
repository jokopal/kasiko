import { describe, expect, it } from 'vitest'
import { normalizeWhatsAppNumber, whatsAppReceiptMessage, whatsAppUrl } from './whatsapp'

describe('normalizeWhatsAppNumber', () => {
  it.each([
    ['0812-3456-7890', '6281234567890'],
    ['+62 812 3456 7890', '6281234567890'],
    ['6281234567890', '6281234567890'],
    ['81234567890', '6281234567890'],
    [' (0812) 3456 789 ', '628123456789'],
  ])('%s → %s', (input, expected) => {
    expect(normalizeWhatsAppNumber(input)).toBe(expected)
  })

  it.each(['', '123', '021-555-1234', '+1 415 555 0100', '0812345678901234'])(
    'rejects %j',
    (input) => {
      expect(normalizeWhatsAppNumber(input)).toBeNull()
    },
  )
})

describe('whatsAppUrl', () => {
  it('wraps the receipt in a monospace block and encodes it', () => {
    const url = whatsAppUrl('6281234567890', whatsAppReceiptMessage('TOTAL  Rp 5.000'))
    expect(url.startsWith('https://wa.me/6281234567890?text=')).toBe(true)
    expect(decodeURIComponent(url.split('text=')[1]!)).toBe('```\nTOTAL  Rp 5.000\n```')
  })
})
