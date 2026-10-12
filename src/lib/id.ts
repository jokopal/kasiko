// Client-generated UUID v4 (idempotency key for offline sync).
// `crypto.randomUUID` only exists in secure contexts, but a phone testing the dev
// server over plain-http LAN is not one; `getRandomValues` works everywhere.

export function newId(): string {
  if (typeof crypto.randomUUID === 'function' && globalThis.isSecureContext) {
    return crypto.randomUUID()
  }
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
