/* 端到端：在 DSH Web 里把 dsh-undo 装进 headless profile（不碰用户的 web profile 正在跑的服务） */
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const BASE = process.env.DSH_URL ?? 'http://127.0.0.1:3081'
const OUT = fileURLToPath(new URL('../docs/screenshots/', import.meta.url))

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })
await page.goto(BASE, { waitUntil: 'networkidle' })
await page.waitForTimeout(2000)

// Settings → Plugins → 插件市场
await page.getByText(/settings/i).first().click()
await page.waitForTimeout(800)
await page.getByText(/plugins/i).first().click()
await page.waitForTimeout(800)
await page.getByText('插件市场').first().click()
await page.waitForTimeout(2000)

// 切到 headless profile
await page.locator('.whalehub-profile select').selectOption('headless')

// 搜索 dsh-undo 并安装
await page.locator('.whalehub-search').fill('dsh-undo')
await page.waitForTimeout(500)
const btn = page.locator('.whalehub-card button', { hasText: '一键安装' }).first()
await btn.click()
console.log('installing...')
// pnpm 安装可能耗时，最多等 3 分钟
await page.locator('.whalehub-ok, .whalehub-fail').first().waitFor({ timeout: 180_000 })
const ok = await page.locator('.whalehub-ok').isVisible().catch(() => false)
console.log('install result ok:', ok)
if (!ok) console.log('fail output:', await page.locator('.whalehub-fail').textContent().catch(() => 'n/a'))
await page.screenshot({ path: OUT + '11-dsh-web-install-result.png' })
await browser.close()
process.exit(ok ? 0 : 1)
