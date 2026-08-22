#!/usr/bin/env node
/**
 * process-issues.mjs — 每日 CI 顺手处理插件提交 Issue
 *
 * 流程（仅处理标题以 [Plugin] 开头的 open issue）：
 *   1. 从 issue 标题 / 表单正文解析出 fullName / category / tagline / install / notes；
 *   2. 用 verify-plugin.mjs 的 isRealDshPlugin 做"真·DSH 插件"校验：
 *      - ok    → 写入 scripts/issue-submissions.json（下次 sync 自动进注册表），
 *                留言"已收录"并关闭 issue；
 *      - fail  → 确凿不达标（无 package.json / 有但不声明 dsh.bundle.patch / npm 包找不到），
 *                留言说明原因并关闭 issue；
 *      - skip  → 网络抖动 / manual·script 类安装（需人工核），不关闭，留着下次每日重试。
 *
 * 幂等：已收录/已关闭的 issue 不会重复处理；skip 的 issue 持续留 open 直到网络恢复或被人工处理。
 *
 * 用法：
 *   GH_TOKEN=... node scripts/process-issues.mjs            # 真实处理（留言+关闭+写文件）
 *   GH_TOKEN=... node scripts/process-issues.mjs --dry-run  # 只打印将要做什么，不改动
 */
import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { isRealDshPlugin } from './verify-plugin.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SUB_FILE = join(ROOT, 'scripts', 'issue-submissions.json')
const REPO = process.env.GITHUB_REPOSITORY || 'vvlife/whalehub-dsh'
const DRY = process.argv.includes('--dry-run')
const GH_TOKEN = process.env.GH_TOKEN || process.env.GITHUB_TOKEN

function gh(args) {
  return execSync(`gh ${args}`, {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, GH_TOKEN },
  }).toString()
}

/** 取 body 中某个 `##`/`###` 小标题（标签之一）到下一个小标题之间的文本 */
function section(body, labels) {
  const lines = body.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const h = lines[i].match(/^#{2,3}\s+(.*)$/)
    if (h && labels.some((l) => h[1].includes(l))) {
      const out = []
      for (let j = i + 1; j < lines.length; j++) {
        if (/^#{2,3}\s+/.test(lines[j])) break
        out.push(lines[j])
      }
      return out.join('\n').trim()
    }
  }
  return ''
}

const CATEGORY_KEYS = {
  'web-ui': /web-?ui|界面|皮肤|skin/i,
  'terminal': /terminal|终端|桌面|desktop/i,
  'vision': /vision|视觉|多模态|multimodal/i,
  'tools': /tools|工具|编辑器|editor/i,
  'agent': /agent|编排|工作流|workflow|orchestrat/i,
  'integrations': /integrations|集成|桥接|bridge/i,
  'ecosystem': /ecosystem|生态|基础/i,
  'fun': /fun|好玩|杂项|misc/i,
}

function parseIssue(title, body) {
  // 仓库：优先标题 [Plugin] owner/repo，回退正文首个 github.com/owner/repo
  let fullName = null
  const tm = title.match(/\[Plugin\]\s*([^\]\s`*]+)/i)
  if (tm) fullName = tm[1].replace(/[`*]/g, '').trim()
  if (!fullName) {
    const bm = body.match(/github\.com\/([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)/)
    if (bm) fullName = bm[1]
  }
  if (fullName) fullName = fullName.split('/').slice(0, 2).join('/') // 剥掉子路径

  const catSec = section(body, ['分类'])
  let category = 'tools'
  if (catSec) {
    for (const [k, re] of Object.entries(CATEGORY_KEYS)) {
      if (re.test(catSec)) { category = k; break }
    }
  }

  const tagline =
    section(body, ['一句话描述', '描述'])?.trim() ||
    (fullName ? `${fullName} — DSH 插件` : 'DSH 插件')

  const install = parseInstall(section(body, ['安装方式']))
  const notes = section(body, ['安装注意事项', '依赖', '已知坑点'])?.trim() || ''

  return { fullName, category, tagline, install, notes }
}

function parseInstall(instSec) {
  if (!instSec) return { type: 'github', profiles: ['web'] }
  const s = instSec.trim()
  // npm：npm:pkg / dsh plugin add pkg（只取包名安全字符，避免吞入中文说明）
  if (/npm/i.test(s)) {
    const m =
      s.match(/npm:\s*([@A-Za-z0-9_./-]+)/i) ||
      s.match(/dsh\s+plugin\s+add\s+([@A-Za-z0-9_./-]+)/i)
    if (m) {
      const pkg = m[1].replace(/^npm:/i, '')
      if (pkg && !pkg.startsWith('github:')) return { type: 'npm', package: pkg, profiles: ['web'] }
    }
  }
  // 显式 github:（只取 URL 安全字符；可能带 #branch&path:/x 子目录）
  const ghFull = s.match(/github:([A-Za-z0-9_./#&:@-]+)/i)
  if (ghFull) {
    const cmd = 'github:' + ghFull[1]
    const install = { type: 'github', profiles: ['web'] }
    if (/[#&]/.test(cmd)) install.command = cmd // 含分支/子路径，原样保留
    return install
  }
  return { type: 'github', profiles: ['web'] }
}

function oneClick(fullName, install) {
  if (install.command) return `dsh plugin add "${install.command}"`
  if (install.type === 'npm' && install.package) return `dsh plugin add ${install.package}`
  return `dsh plugin add "github:${fullName}"`
}

function loadSubs() {
  try { return JSON.parse(readFileSync(SUB_FILE, 'utf8')) } catch { return [] }
}
function saveSubs(arr) {
  writeFileSync(SUB_FILE, JSON.stringify(arr, null, 2) + '\n', 'utf8')
}
function commentIssue(number, body) {
  const f = '/tmp/whalehub_issue_comment.txt'
  writeFileSync(f, body, 'utf8')
  gh(`issue comment ${number} --repo ${REPO} --body-file ${f}`)
}
function closeIssue(number, reason) {
  gh(`issue close ${number} --repo ${REPO}${reason ? ` --reason ${reason}` : ''}`)
}

async function main() {
  if (!GH_TOKEN) { console.error('GH_TOKEN not set — cannot talk to GitHub'); process.exit(1) }
  console.log(`process-issues: repo=${REPO} dry-run=${DRY}`)

  const raw = gh('issue list --repo ' + REPO + ' --state open --json number,title,body --limit 100')
  const issues = JSON.parse(raw)
  const targets = issues.filter((i) => /^\[Plugin\]/i.test(i.title))
  console.log(`open plugin-submission issues: ${targets.length}`)

  const subs = loadSubs()
  let changed = false

  for (const iss of targets) {
    const { fullName, category, tagline, install, notes } = parseIssue(iss.title, iss.body)
    console.log(`\n#${iss.number} ${iss.title}\n  parsed: fullName=${fullName} category=${category} install.type=${install.type}`)
    if (!fullName) {
      console.log('  skip: 无法从标题/正文解析出 owner/repo')
      continue
    }

    let verdict
    try {
      verdict = await isRealDshPlugin(fullName, install)
    } catch (e) {
      verdict = { status: 'skip', reason: 'verify threw: ' + String(e?.message ?? e) }
    }
    console.log(`  verify: ${verdict.status} — ${verdict.reason}`)

    if (verdict.status === 'ok') {
      const already = subs.some((s) => s.fullName.toLowerCase() === fullName.toLowerCase())
      if (!already) { subs.push({ fullName, category, tagline, install, notes: notes || undefined }); changed = true }
      const cmd = oneClick(fullName, install)
      const body = [
        '✅ 已通过 WhaleHub 的"真·DSH 插件"校验（仓库声明了 `dsh.bundle.patch`），已自动收录进注册表。',
        '',
        `- 仓库：${fullName}`,
        `- 分类：${category}`,
        `- 一键安装：\`${cmd}\``,
        '',
        '将在下次每日同步构建后自动上线（Vercel 主站 + GitHub Pages 国内镜像）。感谢贡献！🐋',
      ].join('\n')
      if (DRY) { console.log('  [dry-run] ACCEPT + close\n' + body) }
      else { commentIssue(iss.number, body); closeIssue(iss.number, 'completed') }
    } else if (verdict.status === 'fail') {
      const body = [
        '⚠️ 抱歉，这个提交未通过 WhaleHub 的收录校验，已关闭本 issue。',
        '',
        `原因：${verdict.reason}`,
        '',
        '若可修复，开一个新 issue 重新提交即可：',
        '- 确保仓库根或插件目录的 `package.json` 声明了 `"dsh": { "bundle": { "patch": true } }`（这是 dsh 真正加载插件的必要条件）；',
        '- npm 包请确认包名正确且已发布；',
        '- monorepo 子目录请在"安装方式"写明 `github:owner/repo#branch&path:/packages/xxx`。',
        '',
        '判定逻辑见仓库 `scripts/verify-plugin.mjs`。',
      ].join('\n')
      if (DRY) { console.log('  [dry-run] REJECT + close\n' + body) }
      else { commentIssue(iss.number, body); closeIssue(iss.number, 'not planned') }
    } else {
      // skip：网络抖动 / manual·script 类安装，留 open 等下次重试或人工处理，避免误杀
      console.log('  skip: 留 open（网络抖动或 manual/script 类安装，需人工核）')
    }
  }

  if (changed && !DRY) saveSubs(subs)
  console.log(`\ndone. issue-submissions.json changed=${changed}`)
}

main().catch((e) => { console.error(e); process.exit(1) })
