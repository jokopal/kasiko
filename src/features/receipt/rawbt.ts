// RawBT bridge (decision #42): most cheap Bluetooth receipt printers use classic
// Bluetooth (SPP), which no browser can reach. The free Android app RawBT can: Kasiko
// hands it the same ESC/POS bytes through an Android intent, and RawBT prints them over
// the printer the cashier paired in Android settings (or over USB).

export const RAWBT_PACKAGE = 'ru.a402d.rawbtprinter'
export const RAWBT_STORE_URL = `https://play.google.com/store/apps/details?id=${RAWBT_PACKAGE}`

export function isAndroid(): boolean {
  return typeof navigator !== 'undefined' && /android/i.test(navigator.userAgent)
}

export function toBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return btoa(binary)
}

/**
 * The intent RawBT documents for web pages. Without the app installed, Chrome follows
 * the fallback to the Play Store page.
 */
export function rawbtIntentUrl(bytes: Uint8Array): string {
  return (
    `intent:base64,${toBase64(bytes)}#Intent;scheme=rawbt;package=${RAWBT_PACKAGE};` +
    `S.browser_fallback_url=${encodeURIComponent(RAWBT_STORE_URL)};end;`
  )
}

export function printViaRawbt(bytes: Uint8Array) {
  window.location.href = rawbtIntentUrl(bytes)
}
