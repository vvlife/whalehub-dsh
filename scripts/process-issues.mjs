#!/usr/bin/env node
/**
 * process-issues.mjs — 每日 CI 顺手处理插件提交 Issue
 *
 * 流程（处理标题以 [Plugin] 或 [Plugin manual review] 开头的 open issue）：
 *   1. 从 issue 标题 / 表单正文解析出 fullName / category / tagline / install / notes；
 *      标题只是项目名时回退表单仓库栏；安装方式里的固定 GitHub release tgz
 *      会原样保留为自定义命令（不会退回 github: 源码安装）；
 *   2. 固定 release tgz 做 URL 格式 + 可达性校验；其余用
 *      verify-plugin.mjs 的 isRealDshPlugin 做"真·DSH 插件"校验：
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
 *   GH_TOKEN=... node scripts/process-issues.mjs --backfill 41,42,43   # 回填，见下
 *
 * --backfill（事故救急用）：
 *   正常流程是「先关 issue，再等 CI 把 issue-submissions.json 提交上去」。若 CI 的
 *   提交/推送那一步失败（例如 push 撞上 non-fast-forward 被拒），就会出现
 *   issue 已关闭、但插件条目从未落盘的静默丢失 —— 因为下次只扫 open issue，
 *   这批插件永远不会被重新处理。
 *   --backfill 按编号重新解析指定的 issue，只把缺失的条目补回
 *   issue-submissions.json，不留言、不关闭、不改动任何外部状态。
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { isRealDshPlugin } from './verify-plugin.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SUB_FILE = join(ROOT, 'scripts', 'issue-submissions.json')
const REPO = process.env.GITHUB_REPOSITORY || 'vvlife/whalehub-dsh'
const DRY = process.argv.includes('--dry-run')
const GH_TOKEN = process.env.GH_TOKEN || process.env.GITHUB_TOKEN

/** --backfill 41,42,43 → [41,42,43]；未指定则为 null */
function parseBackfill() {
  const i = process.argv.indexOf('--backfill')
  if (i === -1) return null
  const nums = (process.argv[i + 1] || '')
    .split(',')
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => Number.isInteger(n) && n > 0)
  if (!nums.length) {
    console.error('--backfill 需要至少一个 issue 编号，例如 --backfill 41,42,43')
    process.exit(1)
  }
  return nums
}
const BACKFILL = parseBackfill()

/**
 * 调用 gh CLI。
 *
 * 必须走 execFileSync + 参数数组，不能用 execSync 拼字符串：
 * `gh issue close N --reason not planned` 里的 "not planned" 含空格，
 * 走 shell 会被拆成两个参数 → `invalid argument "not" for "-r, --reason"`。
 * 参数数组还顺带避免了 issue 正文/仓库名里的 shell 元字符注入。
 */
function gh(args) {
  const arr = Array.isArray(args) ? args : String(args).trim().split(/\s+/)
  return execFileSync('gh', arr, {
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

/** 只接受真正的 owner/repo 形式，避免把 "[Plugin] Persona" 当成仓库名 */
function isValidFullName(s) {
  return !!s && /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(s)
}

export function parseIssue(title, body) {
  // 仓库：优先标题 [Plugin] owner/repo；标题只是项目名（如 "[Plugin] Persona"）
  // 时回退到表单的"GitHub 仓库地址"栏，最后才是正文里首个 github.com/owner/repo。
  let fullName = null
  const tm = title.match(/^\[Plugin(?:\s+manual\s+review)?\]\s*([^\]\s`*—]+)/i)
  const fromTitle = tm ? tm[1].replace(/[`*]/g, '').trim() : null
  if (isValidFullName(fromTitle)) fullName = fromTitle
  if (!fullName) {
    const repoSec = section(body, [
      'GitHub 仓库地址', 'GitHub repository', '仓库地址', 'repository',
    ])
    const bm = (repoSec || body).match(/github\.com\/([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)/i)
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

export function parseInstall(instSec) {
  if (!instSec) return { type: 'github', profiles: ['web'] }
  const s = instSec.trim()

  // 固定发行包：dsh plugin add <GitHub release tgz URL>。必须原样保留 URL，
  // 否则退回 github:owner/repo 源码安装会把作者明确固定的宿主版本装错。
  const tgz = s.match(/https:\/\/[A-Za-z0-9_./%:@?&=+~#-]+\.tgz\b/i)
  if (tgz) {
    const url = tgz[0]
    return {
      type: 'manual',
      profiles: ['web'],
      command: `dsh plugin --profile web add ${url}`,
    }
  }

  // npm：npm:pkg / dsh plugin add pkg（不强制正文出现 "npm" 字样；
  // 只取包名安全字符，github: 目标留给下面的分支处理）
  if (/npm/i.test(s) || /dsh\s+plugin(?:\s+--profile\s+[\w-]+)?\s+add\s+/i.test(s)) {
    const m =
      s.match(/npm:\s*([@A-Za-z0-9_./-]+)/i) ||
      s.match(/dsh\s+plugin(?:\s+--profile\s+[\w-]+)?\s+add\s+([@A-Za-z0-9_./:+-]+)/i)
    if (m) {
      const pkg = m[1].replace(/^npm:/i, '')
      if (pkg && !/^github:/i.test(pkg)) return { type: 'npm', package: pkg.replace(/["'`]+$/, ''), profiles: ['web'] }
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

export function oneClick(fullName, install) {
  if (install.command) return install.command
  if (install.type === 'npm' && install.package) return `dsh plugin --profile web add ${install.package}`
  return `dsh plugin --profile web add "github:${fullName}"`
}

/**
 * 固定发行包（GitHub release tgz）只接受严格格式：
 *   dsh plugin --profile <profile> add https://github.com/<当前仓库>/releases/download/<tag>/<file>.tgz
 * 不接受任意 shell 命令，也不接受指向其他仓库的 tgz，避免 Issue 里的自定义
 * command 变成任意命令注入 / 挂错仓库。
 */
export function fixedReleaseUrl(fullName, install) {
  if (install?.type !== 'manual' || !install.command) return null
  const m = install.command.match(
    /^dsh plugin --profile ([\w][\w-]{0,39}) add (https:\/\/github\.com\/[A-Za-z0-9_./%:@&=+~#-]+\.tgz)$/i,
  )
  if (!m) return null
  const prefix = `https://github.com/${String(fullName || '').toLowerCase()}/releases/download/`
  if (!m[2].toLowerCase().startsWith(prefix)) return null
  return { profile: m[1], url: m[2] }
}

/** 固定发行包只做可达性检查；宿主版本匹配由作者在 Issue 中声明并经人工审核。 */
async function verifyFixedRelease(fullName, install) {
  const fixed = fixedReleaseUrl(fullName, install)
  if (!fixed) return null
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), 20_000)
  try {
    const res = await fetch(fixed.url, {
      method: 'HEAD',
      redirect: 'follow',
      signal: ac.signal,
      headers: { 'User-Agent': 'whalehub-verify' },
    })
    if (!res.ok) return { status: 'fail', reason: `固定发行包 HTTP ${res.status}：${fixed.url}` }
    return { status: 'ok', reason: `固定发行包可访问 ✓（profile: ${fixed.profile}）` }
  } catch (e) {
    return { status: 'skip', reason: `固定发行包 HEAD 失败：${String(e?.message ?? e)}` }
  } finally {
    clearTimeout(timer)
  }
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
  gh(['issue', 'comment', String(number), '--repo', REPO, '--body-file', f])
}
function closeIssue(number, reason) {
  const args = ['issue', 'close', String(number), '--repo', REPO]
  if (reason) args.push('--reason', reason)
  gh(args)
}

async function main() {
  if (!GH_TOKEN) { console.error('GH_TOKEN not set — cannot talk to GitHub'); process.exit(1) }
  console.log(`process-issues: repo=${REPO} dry-run=${DRY}${BACKFILL ? ` backfill=[${BACKFILL}]` : ''}`)

  let targets
  if (BACKFILL) {
    // 按编号逐个取，不区分 open/closed —— 要救的就是已被关闭的那批
    targets = BACKFILL.map((n) =>
      JSON.parse(gh(['issue', 'view', String(n), '--repo', REPO, '--json', 'number,title,body']))
    )
    console.log(`backfill: ${targets.length} 个指定 issue（只补文件，不留言/不关闭）`)
  } else {
    const raw = gh(['issue', 'list', '--repo', REPO, '--state', 'open', '--json', 'number,title,body', '--limit', '100'])
    const issues = JSON.parse(raw)
    targets = issues.filter((i) => /^\[Plugin(?:\s+manual\s+review)?\]/i.test(i.title))
    console.log(`open plugin-submission issues: ${targets.length}`)
  }

  const subs = loadSubs()
  let changed = false

  for (const iss of targets) {
    const { fullName, category, tagline, install, notes } = parseIssue(iss.title, iss.body)
    console.log(`\n#${iss.number} ${iss.title}\n  parsed: fullName=${fullName} category=${category} install.type=${install.type}`)
    if (!fullName) {
      console.log('  skip: 无法从标题/正文解析出 owner/repo')
      continue
    }

    const fixed = fixedReleaseUrl(fullName, install)
    let verdict
    try {
      verdict = fixed
        ? (await verifyFixedRelease(fullName, install)) ?? { status: 'skip', reason: '固定发行包校验不可用' }
        : await isRealDshPlugin(fullName, install)
    } catch (e) {
      verdict = { status: 'skip', reason: 'verify threw: ' + String(e?.message ?? e) }
    }
    console.log(`  verify: ${verdict.status} — ${verdict.reason}`)

    if (verdict.status === 'ok') {
      const already = subs.some((s) => s.fullName.toLowerCase() === fullName.toLowerCase())
      if (!already) { subs.push({ fullName, category, tagline, install, notes: notes || undefined }); changed = true }
      const cmd = oneClick(fullName, install)
      const passed = fixed
        ? '✅ 固定 GitHub Release 安装包可访问，已按作者指定的宿主匹配版本收录进注册表（发行包内容/宿主匹配由作者验证，市场不做运行时背书）。'
        : '✅ 已通过 WhaleHub 的"真·DSH 插件"校验（仓库声明了 `dsh.bundle.patch`），已自动收录进注册表。'
      const body = [
        passed,
        '',
        `- 仓库：${fullName}`,
        `- 分类：${category}`,
        `- 一键安装：\`${cmd}\``,
        '',
        '将在下次每日同步构建后自动上线（Vercel 主站 + GitHub Pages 国内镜像）。感谢贡献！🐋',
      ].join('\n')
      if (BACKFILL) {
        // 回填模式：只补文件，绝不碰 issue 状态
        console.log(already ? `  已在册，跳过：${fullName}` : `  回填：${fullName}`)
      } else if (DRY) {
        console.log('  [dry-run] ACCEPT + close\n' + body)
      } else { commentIssue(iss.number, body); closeIssue(iss.number, 'completed') }
    } else if (verdict.status === 'fail') {
      if (BACKFILL) { console.log('  不回填：校验 fail'); continue }
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

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((e) => { console.error(e); process.exit(1) })
}
