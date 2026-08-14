/* E2E：桌面 APP 的 dsh web（127.0.0.1:3180）里验证 whalehub-market 新功能：
 * Settings → Plugins → 🐋 插件市场 —— 实时数据标识 / 搜索 / 📮提交插件弹窗。 */
import { chromium } from 'playwright'

const BASE = process.env.DSH_URL ?? 'http://127.0.0.1:3180'
const OUT = process.env.OUT_DIR ?? '/tmp/whalehub-e2e/'
import { mkdirSync } from 'node:fs'
mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })
page.on('console', (m) => { if (m.type() === 'error') console.log('[console.error]', m.text().slice(0, 300)) })
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 300)))

await page.goto(BASE, { waitUntil: 'networkidle' })
await page.waitForTimeout(2500)
await page.screenshot({ path: OUT + '01-home.png' })

// 找 Settings 入口
let opened = false
for (const c of [
  page.getByText(/settings/i).first(),
  page.locator('[aria-label*="ettings"]').first(),
  page.locator('button:has-text("设置")').first(),
  page.locator('[title*="设置"], [title*="Settings"]').first(),
]) {
  try {
    if (await c.isVisible({ timeout: 1500 })) { await c.click(); opened = true; break }
  } catch { /* next */ }
}
console.log('settings opened:', opened)
await page.waitForTimeout(1500)
await page.screenshot({ path: OUT + '02-settings.png' })

// 找 Plugins 区块
for (const c of [page.getByText(/plugins/i).first(), page.getByText('插件').first()]) {
  try {
    if (await c.isVisible({ timeout: 1500 })) { await c.click(); break }
  } catch { /* next */ }
}
await page.waitForTimeout(1500)
await page.screenshot({ path: OUT + '03-plugins.png' })

// 找我们的 Tab
const tab = page.getByText('插件市场').first()
const tabVisible = await tab.isVisible({ timeout: 3000 }).catch(() => false)
console.log('whalehub tab visible:', tabVisible)
if (!tabVisible) {
  await page.screenshot({ path: OUT + '04-market-MISSING.png' })
  await browser.close()
  process.exit(1)
}
await tab.click()
await page.waitForTimeout(4000) // 等实时拉取
await page.screenshot({ path: OUT + '04-market.png' })

// 实时数据标识
const metaLive = await page.locator('.whalehub-meta').first().textContent().catch(() => '')
console.log('meta:', (metaLive ?? '').trim())
console.log('live indicator:', /实时数据/.test(metaLive ?? ''))

// 搜索框
const search = page.locator('.whalehub-search')
const searchVisible = await search.isVisible().catch(() => false)
console.log('search visible:', searchVisible)
const cardsBefore = await page.locator('.whalehub-card').count()
if (searchVisible) {
  await search.fill('tui')
  await page.waitForTimeout(600)
  await page.screenshot({ path: OUT + '05-search-tui.png' })
  const cardsAfter = await page.locator('.whalehub-card').count()
  console.log(`cards: before=${cardsBefore} afterSearch=${cardsAfter}`)
  await search.fill('')
  await page.waitForTimeout(400)
}

// 📮 提交插件 → 规则弹窗
const submitBtn = page.locator('button.whalehub-submit')
const btnVisible = await submitBtn.isVisible().catch(() => false)
console.log('submit button visible:', btnVisible)
if (btnVisible) {
  await submitBtn.click()
  // 规则加载：实时源不可达时首请求需等一轮超时（~6s），轮询内容出现
  const modal = page.locator('.whalehub-modal')
  let ready = false
  for (let i = 0; i < 20; i++) {
    await page.waitForTimeout(500)
    const t = (await modal.textContent().catch(() => '')) ?? ''
    if (/方式一/.test(t) || /无法加载提交规则/.test(t)) { ready = true; break }
  }
  const modalVisible = await modal.isVisible().catch(() => false)
  console.log('rules modal visible:', modalVisible, '| content ready:', ready)
  const modalText = (await modal.textContent().catch(() => '')) ?? ''
  console.log('modal has methods:', /方式一/.test(modalText) && /方式二/.test(modalText))
  console.log('modal has checklist:', /自检清单/.test(modalText))
  console.log('modal has review:', /审核标准/.test(modalText))
  await page.screenshot({ path: OUT + '06-rules-modal.png' })
  await page.locator('.whalehub-modal-close').click().catch(() => undefined)
}

await browser.close()
console.log('done')
