// Renders the generic app icon (public/favicon.svg) to the PNG sizes a PWA needs.
// Usage: node scripts/generate-icons.mjs   (requires `npx playwright install chromium`)
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'

const svg = await readFile(new URL('../public/favicon.svg', import.meta.url), 'utf8')
const dataUrl = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`

const icons = [
  { file: 'pwa-192x192.png', size: 192, padding: 0, background: 'transparent' },
  { file: 'pwa-512x512.png', size: 512, padding: 0, background: 'transparent' },
  // Maskable: launchers crop to a circle/squircle, keep the mark inside the safe zone.
  { file: 'maskable-512x512.png', size: 512, padding: 0.1, background: '#0f172a' },
  { file: 'apple-touch-icon-180x180.png', size: 180, padding: 0.06, background: '#0f172a' },
]

const browser = await chromium.launch()
const page = await browser.newPage()
for (const { file, size, padding, background } of icons) {
  const inner = Math.round(size * (1 - padding * 2))
  await page.setViewportSize({ width: size, height: size })
  await page.setContent(
    `<html><body style="margin:0;width:${size}px;height:${size}px;display:grid;place-items:center;background:${background}">
       <img src="${dataUrl}" width="${inner}" height="${inner}" />
     </body></html>`,
  )
  await page.screenshot({
    path: fileURLToPath(new URL(`../public/${file}`, import.meta.url)),
    omitBackground: background === 'transparent',
  })
  console.log(`public/${file}`)
}
await browser.close()
