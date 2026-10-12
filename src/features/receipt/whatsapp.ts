// WhatsApp sharing (decision #12): the number is only used to build the link and is
// never stored — not in the database, not in localStorage.

/**
 * Normalises Indonesian numbers to the international form wa.me expects:
 * `0812-3456-7890` / `+62 812…` / `812…` → `628123456789…`. Returns `null` when invalid.
 */
export function normalizeWhatsAppNumber(input: string): string | null {
  let digits = input.replace(/\D/g, '')
  if (digits.startsWith('0')) digits = `62${digits.slice(1)}`
  else if (digits.startsWith('8')) digits = `62${digits}`
  if (!digits.startsWith('62')) return null
  // 62 + 8–12 digit subscriber number
  return digits.length >= 10 && digits.length <= 15 && digits[2] === '8' ? digits : null
}

/** Monospace block so the padded receipt columns stay aligned in WhatsApp. */
export function whatsAppReceiptMessage(receiptText: string): string {
  return `\`\`\`\n${receiptText}\n\`\`\``
}

export function whatsAppUrl(phone: string, message: string): string {
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`
}
