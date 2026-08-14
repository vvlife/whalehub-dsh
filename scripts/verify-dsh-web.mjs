/* 在真实 DSH Web 里验证 whalehub-market：打开 Settings → Plugins → 🐋 插件市场，截图。 */
import { chromium } from 'playwright'

const BASE = process.env.DSH_URL ?? 'http://127.0.0.1:3081'
import { fileURLToPath } from 'node:url'
const OUT = fileURLToPath(new URL('../docs/screenshots/', import.meta.url))

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })
page.on('console', (m) => { if (m.type() === 'error') console.log('[console.error]', m.text().slice(0, 300)) })
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 300)))

await page.goto(BASE, { waitUntil: 'networkidle' })
await page.waitForTimeout(2500)
await page.screenshot({ path: OUT + '08-dsh-web-home.png' })

// 找 Settings 入口
const settingsCandidates = [
  page.getByText(/settings/i).first(),
  page.locator('[aria-label*="ettings"]').first(),
  page.locator('button:has-text("设置")').first(),
]
let opened = false
for (const c of settingsCandidates) {
  try {
    if (await c.isVisible({ timeout: 1500 })) { await c.click(); opened = true; break }
  } catch { /* next */ }
}
console.log('settings opened:', opened)
await page.waitForTimeout(1500)
await page.screenshot({ path: OUT + '09-dsh-web-settings.png' })

// 找 Plugins 区块
for (const c of [page.getByText(/plugins/i).first(), page.getByText('插件').first()]) {
  try {
    if (await c.isVisible({ timeout: 1500 })) { await c.click(); break }
  } catch { /* next */ }
}
await page.waitForTimeout(1500)

// 找我们的 Tab
const tab = page.getByText('插件市场').first()
const tabVisible = await tab.isVisible({ timeout: 3000 }).catch(() => false)
console.log('whalehub tab visible:', tabVisible)
if (tabVisible) {
  await tab.click()
  await page.waitForTimeout(2500)
  await page.screenshot({ path: OUT + '08-dsh-web-market.png', fullPage: false })
  // 试搜一下
  const search = page.locator('.whalehub-search')
  if (await search.isVisible().catch(() => false)) {
    await search.fill('tui')
    await page.waitForTimeout(600)
    await page.screenshot({ path: OUT + '10-dsh-web-market-search.png' })
  }
} else {
  await page.screenshot({ path: OUT + '08-dsh-web-market-missing.png' })
}

await browser.close()
console.log('done')
