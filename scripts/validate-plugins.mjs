#!/usr/bin/env node
/**
 * validate-plugins.mjs — WhaleHub CI 注册表"真插件"校验门
 *
 * 对注册表里每个 install.type 为 github / npm 的条目，实测其 package.json
 * 是否声明 dsh.bundle.patch（即 dsh 真的会加载的插件）。
 *   - ok   : 声明了 dsh.bundle.patch → 真插件
 *   - fail : 拉到了 manifest 但不声明 dsh.bundle.patch → 假插件（阻断 CI）
 *   - skip : 手动/脚本类安装，或网络/私有仓库拉取失败（仅告警，不阻断）
 *
 * 用法：
 *   node scripts/validate-plugins.mjs                # 校验 registry/plugins.json
 *   node scripts/validate-plugins.mjs --registry X   # 指定路径
 *
 * 退出码：任一 fail → 1；否则 0。
 */
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { isRealDshPlugin, fullNameFromRepoUrl } from './verify-plugin.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const argv = process.argv.slice(2)
const registryArg = argv.find((a) => a.startsWith('--registry='))?.split('=')[1]
const REGISTRY = resolve(ROOT, registryArg ?? 'registry/plugins.json')

const registry = JSON.parse(readFileSync(REGISTRY, 'utf8'))
const plugins = registry.plugins ?? []

const results = []
let skipped = 0
const fails = []
let oks = 0

console.log(`\nWhaleHub 插件真实验证 — ${plugins.length} 个条目 @ ${REGISTRY}\n`)

for (const p of plugins) {
  const fullName = fullNameFromRepoUrl(p.repoUrl)
  const r = await isRealDshPlugin(fullName, p.install ?? {})
  const tag = r.status === 'ok' ? '✓ OK  ' : r.status === 'fail' ? '✗ FAIL' : '· skip '
  if (r.status === 'ok') oks++
  else if (r.status === 'fail') { fails.push({ p, r }); }
  else skipped++
  const pathInfo = r.resolvedPath ? ` [${r.resolvedPath}]` : ''
  console.log(`  ${tag} ${p.slug.padEnd(34)} ${p.install?.type ?? '?'}`)
  console.log(`         ${r.reason}${pathInfo}`)
  results.push({ slug: p.slug, status: r.status, reason: r.reason })
}

console.log('\n────────────────────────────────────────────')
console.log(`  OK   : ${oks}`)
console.log(`  skip : ${skipped}  (手动/脚本安装 或 网络/私有仓库拉取失败)`)
console.log(`  FAIL : ${fails.length}`)
console.log('────────────────────────────────────────────\n')

if (fails.length) {
  console.log('以下条目被判定为"非 DSH 插件"（声明了 github/npm 安装，但 package.json 没有 dsh.bundle.patch）：\n')
  for (const { p, r } of fails) {
    console.log(`  • ${p.name}  (${p.slug})`)
    console.log(`      repo : ${p.repoUrl}`)
    console.log(`      why  : ${r.reason}`)
    if (p.notes) console.log(`      note : ${p.notes}`)
    console.log('')
  }
  console.log('建议：从 awesome 列表移除、在 sync-registry.mjs 的 EXCLUDE 中屏蔽，')
  console.log('或为其补充正确的 dsh.bundle 声明后重新收录。\n')
  process.exit(1)
}

console.log('✅ 所有 github/npm 类条目均通过"真·DSH 插件"校验。\n')
process.exit(0)
