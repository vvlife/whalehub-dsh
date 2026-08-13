#!/usr/bin/env node
/**
 * 用 Playwright 为 README/宣传文截取各功能图例。
 * 用法：先 `npm run build && npm run preview`（或 vite dev），然后
 *   BASE_URL=http://localhost:4173 node scripts/screenshot.mjs
 */
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'docs', 'screenshots')
const BASE = process.env.BASE_URL ?? 'http://localhost:4173'

// 找一个有代表性的详情页 slug（含 notes + npm 安装）
const DETAIL_SLUG = process.env.DETAIL_SLUG ?? 'ccch1mneyyy-dsh-cc-tui'

const SHOTS = [
  { name: '01-home', path: '/', width: 1440, height: 900, fullPage: true },
  { name: '02-plugins-list', path: '/#/plugins', width: 1440, height: 900 },
  { name: '03-search', path: '/#/plugins', width: 1440, height: 900, action: 'search' },
  { name: '04-detail-install', path: `/#/plugin/${DETAIL_SLUG}`, width: 1440, height: 1000, fullPage: true },
  { name: '05-copy-feedback', path: `/#/plugin/${DETAIL_SLUG}`, width: 1440, height: 900, action: 'copy' },
  { name: '06-submit', path: '/#/submit', width: 1440, height: 900, fullPage: true },
  { name: '07-mobile-home', path: '/', width: 390, height: 844, fullPage: true },
]

async function main() {
  mkdirSync(OUT, { recursive: true })
  const browser = await chromium.launch()
  try {
    for (const shot of SHOTS) {
      const page = await browser.newPage({
        viewport: { width: shot.width, height: shot.height },
        deviceScaleFactor: 2,
      })
      await page.goto(BASE + shot.path, { waitUntil: 'networkidle' })
      if (shot.action === 'search') {
        await page.fill('.search-input', 'vision')
        await page.waitForTimeout(400)
      }
      if (shot.action === 'copy') {
        const btn = page.locator('.copy-block button').first()
        await btn.click()
        await page.waitForTimeout(300)
        // 聚焦到安装面板
        await page.locator('.install-panel').scrollIntoViewIfNeeded()
      }
      await page.waitForTimeout(300)
      await page.screenshot({
        path: join(OUT, `${shot.name}.png`),
        fullPage: !!shot.fullPage,
      })
      console.log(`✓ ${shot.name}.png`)
      await page.close()
    }
  } finally {
    await browser.close()
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
