/* E2E：真实安装一个小插件 → 出现重启条 → 立即重启 → 页面自动刷新 →
 * 官方「Plugin list」里能看到新插件（修复验证：不再要求命令行操作）。 */
import { chromium } from 'playwright'

const BASE = process.env.DSH_URL ?? 'http://127.0.0.1:3180'
const OUT = process.env.OUT_DIR ?? '/tmp/whalehub-e2e/'
const TARGET = process.env.TEST_PLUGIN ?? 'gomoku'   // 搜索词
import { mkdirSync } from 'node:fs'
mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 300)))

async function openMarketTab() {
  await page.goto(BASE, { waitUntil: 'networkidle' })
  await page.waitForTimeout(3000)
  for (const c of [page.getByText(/settings/i).first(), page.locator('[aria-label*="ettings"]').first()]) {
    try { if (await c.isVisible({ timeout: 2000 })) { await c.click(); break } } catch { /* next */ }
  }
  await page.waitForTimeout(1500)
  for (const c of [page.getByText(/plugins/i).first(), page.getByText('插件').first()]) {
    try { if (await c.isVisible({ timeout: 2000 })) { await c.click(); break } } catch { /* next */ }
  }
  await page.waitForTimeout(1500)
  // 市场 tab：轮询等待（新进程首访时 bundle 加载可能较慢）
  const tab = page.getByText('插件市场').first()
  let ok = false
  for (let i = 0; i < 10; i++) {
    if (await tab.isVisible({ timeout: 1000 }).catch(() => false)) { ok = true; break }
  }
  if (!ok) {
    await page.screenshot({ path: OUT + 'debug-no-tab.png' })
    throw new Error('插件市场 tab 未出现（截图 debug-no-tab.png）')
  }
  await tab.click()
  await page.waitForTimeout(3500)
}

await openMarketTab()

// 搜索目标插件并安装
await page.locator('.whalehub-search').fill(TARGET)
await page.waitForTimeout(600)
const card = page.locator('.whalehub-card').first()
const cardName = (await card.locator('strong').first().textContent()) ?? ''
console.log('installing card:', cardName.trim())
const installBtn = card.locator('button', { hasText: '一键安装' })
if (!(await installBtn.isVisible().catch(() => false))) {
  console.log('FAIL: 没有找到可一键安装的卡片（可能已装过）')
  await page.screenshot({ path: OUT + '10-install-nobtn.png' })
  await browser.close()
  process.exit(1)
}
await installBtn.click()

// 等安装完成（github/npm 安装较慢，最多 150s）
let installed = false
for (let i = 0; i < 150; i++) {
  await page.waitForTimeout(1000)
  if (await page.locator('.whalehub-restart-bar').isVisible().catch(() => false)) { installed = true; break }
  if (await card.locator('.whalehub-fail').isVisible().catch(() => false)) {
    console.log('FAIL: 安装失败:', ((await card.locator('.whalehub-fail').textContent()) ?? '').slice(0, 400))
    await page.screenshot({ path: OUT + '10-install-failed.png' })
    await browser.close()
    process.exit(1)
  }
}
console.log('install ok, restart bar visible:', installed)
await page.screenshot({ path: OUT + '10-restart-bar.png' })
if (!installed) { await browser.close(); process.exit(1) }

// 点「立即重启」→ 页面应自动刷新（location.reload）
await page.locator('.whalehub-restart-bar button', { hasText: '立即重启' }).click()
console.log('restart clicked, waiting for auto reload…')
await page.waitForLoadState('load', { timeout: 45_000 }).catch(() => undefined)
// reload 后等待 SPA 重新就绪
await page.waitForTimeout(6000)
const alive = await page.evaluate(() => fetch('/', { method: 'HEAD' }).then((r) => r.ok).catch(() => false))
console.log('server alive after restart:', alive)
await page.screenshot({ path: OUT + '11-after-restart.png' })

// 去官方「Plugin list」确认新插件在运行实例里
await openMarketTab() // 重新进 settings → plugins（reload 后视图重置）
const pluginListTab = page.getByText('Plugin list').first()
if (await pluginListTab.isVisible({ timeout: 3000 }).catch(() => false)) {
  await pluginListTab.click()
  await page.waitForTimeout(2500)
  const bodyText = (await page.locator('body').textContent()) ?? ''
  const listed = bodyText.toLowerCase().includes(TARGET.toLowerCase())
  console.log(`「Plugin list」包含 ${TARGET}:`, listed)
  await page.screenshot({ path: OUT + '12-plugin-list.png' })
} else {
  console.log('FAIL: 找不到 Plugin list tab')
}

await browser.close()
console.log('done')
