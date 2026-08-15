#!/usr/bin/env node
/**
 * WhaleHub registry sync script.
 *
 * 1. Parses the curated awesome-deepseek-harness-plugins list into structured
 *    plugin entries (category, repo, tagline).
 * 2. Enriches each entry with live GitHub metadata (stars, license,
 *    description, last push) via the GitHub API.
 * 3. Merges manual overrides (install type / package / notes / featured).
 * 4. Writes registry/plugins.json.
 *
 * Usage:
 *   node scripts/sync-registry.mjs            # uses `gh auth token` if available
 *   GH_TOKEN=... node scripts/sync-registry.mjs
 *   node scripts/sync-registry.mjs --no-api   # offline: skip GitHub enrichment
 */
import { execSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { isRealDshPlugin, fullNameFromRepoUrl } from './verify-plugin.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'registry', 'plugins.json')
const AWESOME_URL =
  'https://raw.githubusercontent.com/vvlife/awesome-deepseek-harness-plugins/main/README.md'
const NO_API = process.argv.includes('--no-api')

/**
 * 永久封禁名单：即使 awesome 列表里有，也绝不收录（典型：被误当成 DSH 插件的
 * agent-skills 元包 / 普通依赖，缺少 dsh.bundle.patch，dsh 永远不会真正加载）。
 * 也用于把已下架的条目从每日同步里剔除。
 */
const EXCLUDE = new Set([
  // 已确认「有 package.json 但无 dsh.bundle.patch」的假插件：dsh 装了也不会加载
  // （多为 agent-skills 元包 / 普通依赖）。经 scripts/validate-plugins.mjs 校验判定。
  'omdsh-dev/dsh-plugin-skills', // agent-skills 元包
  'lum1104/dsh-browser',
  'btspoony/mstar-harness',
  'whiteguo233/dsh-openbiliclaw',
  'vibeinging/dsh-work',
  'zhouwumu2-lab/dsh-vision-fix',
  'senmuuuuw/dsh-group-photo',
  'chen-001/dsh-grok-tui',
  'electricitysheep/dsh-tool-turbo',
  'yyh-001/dsh-companion',
  'sjscy05/deepseek-harness-vision-plugin',
  'yihong89/dsh-plugins',
  'artificialnotimbecile/dsh-context-taxonomy',
  'zhaoyilun/dsh-preset-flash-director',
  // —— 以下 10 条由 CI 校验门 (validate-plugins.mjs) 在 run 31893823351 判定为「非 DSH 插件」——
  // 要么仓库里根本没有任何 package.json（无法作为 dsh 插件安装），要么有 package.json 但不声明 dsh.bundle.patch。
  'nagi-ovo/dsh-find-plugins', // 仓库无 package.json
  'ruler4396/dsh-launcher', // 仓库无 package.json
  'dekrych/dshell-plugins', // 仓库无 package.json
  'hanelalo/browser-bridge', // package.json 无 dsh.bundle.patch [extension/package.json]
  'hxs996/beep-deepact', // 仓库无 package.json
  'unknowbug/re-framework', // 仓库无 package.json
  'unknowbug/anchorlaw', // package.json 无 dsh.bundle.patch [typescript/anchorlaw-scanner/package.json]
  'good-boy4069/deepseek-omnimodal', // 仓库无 package.json
  'coppynight/dsh-doctor', // package.json 无 dsh.bundle.patch [.dsh-plugin/package.json]
  'hacksing/dsh-plugins', // 仓库无 package.json
])

/** awesome 列表之外的本地补充条目（WhaleHub 自身等） */
const EXTRA_ENTRIES = [
  {
    fullName: 'vvlife/whalehub-dsh',
    category: 'ecosystem',
    tagline: 'WhaleHub 插件市场：Web 版 + DSH Web 内嵌市场（Settings → Plugins → 🐋 插件市场），一键安装社区插件。',
  },
  {
    fullName: 'vvlife/dsh-deploy-share',
    category: 'web-ui',
    tagline: 'HTML preview deploy & share buttons: one-click deploy to free account-less anonymous hosting and copy the live link.',
  },
]

/** awesome 列表章节标题 → WhaleHub 分类 */
const CATEGORY_MAP = {
  'Web UI & Skins': 'web-ui',
  'Terminal & Desktop': 'terminal',
  'Vision & Multimodal': 'vision',
  'Tools & Editor UX': 'tools',
  'Agent orchestration & Workflow': 'agent',
  'Integrations & Bridges': 'integrations',
  'Sidebar, Workspace & Ecosystem': 'ecosystem',
  'Fun & Misc': 'fun',
}

/** 已知插件的安装方式与实测笔记（来自 awesome 列表 Hands-on Notes 与仓库 README） */
const OVERRIDES = {
  'vvlife/dsh-agnes-paseo': {
    tags: ['llm', 'agnes-ai', 'paseo', 'acp', 'provider'],
    install: { type: 'github', profiles: ['headless', 'web'] },
  },
  'vvlife/dsh-paseo-mobile': {
    tags: ['mobile', 'paseo', 'acp', 'bridge', 'remote'],
    install: { type: 'github', profiles: ['headless'] },
    notes:
      '模型无关，不改 dsh 模型配置（与 dsh-agnes-paseo 互补）。装完在 profile 目录跑 pnpm exec dsh-paseo-mobile-setup --restart-daemon：复制 ACP 桥、探测当前默认模型写 provider.json、注册 Paseo provider；然后 paseo daemon pair 出二维码，手机 Paseo App 扫码即连。dsh web 会话可在 Paseo 导入镜像到手机，追问带上下文注入；Paseo 新建 agent 的回合间不保留上下文。',
  },
  'vvlife/dsh-deploy-share': {
    tags: ['html', 'deploy', 'share', 'hosting', 'sidebar'],
    install: { type: 'github', profiles: ['web'] },
    notes: '依赖 dsh-better-sidebar（经 ctx.betterSidebar 注册高优先级 HTML viewer）。部署经插件 host 路由 /deploy-share/upload 转发免账号托管（html.cafe → catbox.moe → envs.sh），上传后回读校验 text/html + CSP 放行内联脚本 + 响应体含内容标记，失败自动换下一家。装完重启 dsh web。',
  },
  'zhu1090093659/dsh-web-ui': {
    featured: true,
    tags: ['skin', 'task-board', 'mobile', 'ssh'],
    install: {
      type: 'npm',
      package: '@linxin666/dsh-web-ui-all',
      profiles: ['web'],
    },
    notes:
      '皮肤-only 可装 @linxin666/dsh-skins。装完重启 dsh web。若报 ERR_PNPM_IGNORED_BUILDS，把 cloudflared/ssh2 加入 profile 的 pnpm-workspace.yaml 的 allowBuilds 后重跑；用 dsh --profile web --dump-config 验证。',
  },
  'ccch1mneyyy/dsh-cc-tui': {
    featured: true,
    tags: ['tui', 'claude-code', 'terminal'],
    install: { type: 'npm', package: 'dsh-cc-tui', profiles: ['cc-tui'] },
    notes:
      '会自动初始化 cc-tui profile，装完用 dsh --profile cc-tui 启动；也可用仓库根目录 install.sh（Windows 用 dsh-cc.cmd）。纯插件挂载，卸载即完全还原。',
  },
  'omdsh-dev/DSH-better-sidebar': {
    featured: true,
    tags: ['sidebar', 'terminal', 'git', 'editor'],
    install: { type: 'npm', package: 'dsh-better-sidebar@0.10.2', profiles: ['web'] },
    notes:
      '装完重启 DSH 并硬刷新（Cmd/Ctrl+Shift+R）。pnpm 11 若拦截 node-pty 构建，先 pnpm approve-builds --all。也可用仓库 scripts/install.sh 一键脚本。',
  },
  'Anionex/dsh-vision-toolkit': {
    featured: true,
    tags: ['vision', 'ocr', 'multimodal'],
    install: { type: 'manual', profiles: ['web', 'headless'], command: 'git clone https://github.com/dsh-external/dsh-vision-toolkit.git && dsh plugin --profile web add "$PWD/dsh-vision-toolkit"' },
    notes:
      '当前为 dsh-external 私有 release，需读取权限。Web 和 Headless profile 各装一次；远程识别需在 Settings → Vision Toolkit 配置 OpenAI 兼容视觉端点 Credential，本地裁剪/trace/像素差不需要视觉 API。',
    private: true,
  },
  'LaplaceYoung/oh-my-dsh': {
    featured: true,
    tags: ['capability-library', 'seams'],
    install: { type: 'manual', profiles: ['web'], command: 'git clone https://github.com/LaplaceYoung/oh-my-dsh.git && cd oh-my-dsh && pnpm install && pnpm test' },
    notes:
      '这是插件源码库/能力库（687 个插件按 plugins/<gap-id>/ 组织），不是一条命令装全家桶；按需挑选单个插件安装。e2e 需要 DEEPSEEK_API_KEY。',
  },
  'icetomoyo/dsh_workflow': {
    featured: true,
    tags: ['workflow', 'multi-agent', 'governance'],
    install: { type: 'github', profiles: ['web'] },
    notes:
      '私有仓库（dsh-external），github: 安装需读取权限；需 Node >=22.19。装完用 dsh --profile web --dump-config 验证出现 dsh-external-workflow 后重启。/workflow create 不接受 --wait。',
    private: true,
  },
  'Small-tailqwq/dsh-deep-whale': {
    tags: ['skin'],
    notes: 'CC BY-NC-SA 4.0 许可，注意非商业限制。',
  },
  'hust-open-atom-club/oh-dsh-desktop': { tags: ['desktop', 'macos'] },
  'Ruler4396/dsh-launcher': { tags: ['windows', 'launcher'] },
  'omdsh-dev/dsh-genui': {
    featured: true,
    tags: ['genui', 'charts', 'mermaid'],
    notes: '通过 `dsh-ui` 代码围栏在会话里内联渲染布局、图表、mermaid 与 3D 组件；安装到 web profile 后重启 dsh web 生效。',
  },
  'Nagi-ovo/dsh-visualize': { tags: ['genui', 'generative-ui'] },
  'omdsh-dev/dsh-at-file': { tags: ['editor', 'mentions'] },
  'omdsh-dev/dsh-custom-tool': { tags: ['tools', 'monaco', 'sandbox'] },
  'Moeblack/dsh-message-edit': { tags: ['editing', 'branch'] },
  'Anionex/dsh-turn-rewind': { tags: ['rewind', 'checkpoint'] },
  'NanmiCoder/dsh-agent-teams': {
    featured: true,
    tags: ['multi-agent', 'teams'],
    notes: '多 Agent 团队协作插件；同类主题另见 dsh_workflow（可治理 Workflow 层）。安装到 web profile 后重启生效。',
  },
  'omdsh-dev/dsh-open-in-vscode': { tags: ['vscode'] },
  'omdsh-dev/dsh-notification': { tags: ['notification', 'desktop'] },
  'Nagi-ovo/dsh-find-plugins': { tags: ['plugin-finder'] },
  'Lum1104/dsh-browser': { tags: ['browser', 'chrome'] },
  'hanelalo/browser-bridge': { tags: ['browser', 'automation'] },
  'Chinesezjc/dsh-interconnect': { tags: ['interop', 'events'] },
  'vvlife/whalehub-dsh': {
    featured: true,
    tags: ['marketplace', 'plugin-manager', 'web-ui'],
    install: {
      type: 'github',
      profiles: ['web'],
      command: 'dsh plugin --profile web add "github:vvlife/whalehub-dsh#main&path:/plugin"',
    },
    notes:
      'DSH Web 内嵌市场：dsh plugin --profile web add "github:vvlife/whalehub-dsh#main&path:/plugin"，重启 dsh web 后 Settings → Plugins 出现「🐋 插件市场」Tab。网页版：https://whalehub-dsh.vercel.app',
  },
}

const TAG_RULES = [
  [/tui|terminal/i, 'tui'],
  [/skin|theme|whale/i, 'skin'],
  [/vision|ocr|image|multimodal/i, 'vision'],
  [/workflow|orchestrat/i, 'workflow'],
  [/agent.?team|multi.?agent/i, 'multi-agent'],
  [/bridge|integration/i, 'bridge'],
  [/desktop|macos|windows|launcher/i, 'desktop'],
  [/sidebar|panel|workbench/i, 'sidebar'],
  [/vscode|editor/i, 'editor'],
  [/notification/i, 'notification'],
]

function slugify(fullName) {
  return fullName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

/** 解析 awesome 列表，返回 [{ fullName, category, tagline }] */
export function parseAwesome(md) {
  const entries = []
  let category = null
  let inCommunity = false
  for (const line of md.split('\n')) {
    if (/^## Community plugins/.test(line)) { inCommunity = true; continue }
    if (inCommunity && /^## /.test(line)) break // 离开 Community plugins 章节
    const h3 = line.match(/^### (.+)$/)
    if (inCommunity && h3) { category = CATEGORY_MAP[h3[1].trim()] ?? null; continue }
    if (!category) continue
    // 一行可能含多个仓库链接：- [a/b](url) (★1) / [c/d](url2) — desc
    const links = [...line.matchAll(/\[([^\[\]]+\/[^\[\]]+)\]\((https:\/\/github\.com\/[^)]+)\)/g)]
    if (!links.length) continue
    const desc = (line.split('—')[1] ?? line.split(' - ')[1] ?? '').trim()
    for (const m of links) {
      const fullName = m[2].replace('https://github.com/', '').replace(/\/$/, '')
      entries.push({ fullName, category, tagline: desc })
    }
  }
  return entries
}

function ghToken() {
  if (process.env.GH_TOKEN) return process.env.GH_TOKEN
  try { return execSync('gh auth token', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() }
  catch { return null }
}

async function fetchRepoMeta(fullName, token) {
  const headers = {
    'User-Agent': 'whalehub-sync',
    Accept: 'application/vnd.github+json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
  const res = await fetch(`https://api.github.com/repos/${fullName}`, { headers })
  if (!res.ok) return null
  const j = await res.json()
  return {
    stars: j.stargazers_count ?? 0,
    license: j.license?.spdx_id && j.license.spdx_id !== 'NOASSERTION' ? j.license.spdx_id : null,
    description: j.description ?? '',
    updatedAt: j.pushed_at ?? null,
    archived: !!j.archived,
  }
}

async function main() {
  const md = await (await fetch(AWESOME_URL)).text()
  const parsed = [...parseAwesome(md), ...EXTRA_ENTRIES]
  console.log(`parsed ${parsed.length} repos from awesome list`)
  if (parsed.length < 40) throw new Error('parse result suspiciously small — awesome list format may have changed')

  const token = NO_API ? null : ghToken()
  console.log(token ? 'github api: authenticated' : 'github api: anonymous/offline')

  // 保留旧注册表中已被移除条目之外的增量字段（如人工补充的 notes）
  let prev = []
  try { prev = JSON.parse(readFileSync(OUT, 'utf8')).plugins } catch {}

  const plugins = []
  for (const { fullName, category, tagline } of parsed) {
    const slug = slugify(fullName)
    const prevEntry = prev.find((p) => p.slug === slug)
    const meta = NO_API ? null : await fetchRepoMeta(fullName, token).catch(() => null)
    const override = OVERRIDES[fullName] ?? {}

    // 永久封禁：即使 awesome 列表里有也绝不收录（大小写不敏感）
    if (EXCLUDE.has(fullName.toLowerCase())) {
      console.log(`  exclude (blocklist): ${fullName}`)
      continue
    }

    const install = override.install ?? { type: 'github', profiles: ['web'] }
    // 准入闸门：仅对「从未收录过」且非私有的 github/npm 新条目做真插件校验，
    // 防止 agent-skills 元包 / 普通依赖被误当 DSH 插件收进市场。
    // 仅当「成功拉到 manifest 且确实无 dsh.bundle」时跳过；网络/私有仓库拉取
    // 失败一律保留，避免每日同步因瞬时故障误删真实插件。
    const isNew = !prevEntry
    if (isNew && !override.private && (install.type === 'github' || install.type === 'npm')) {
      const v = await isRealDshPlugin(fullName, install)
      if (v.status === 'fail') {
        console.log(`  skip (not a real DSH plugin): ${fullName} — ${v.reason}`)
        continue
      }
    }

    const name = fullName.split('/')[1]
    const autoTags = TAG_RULES.filter(([re]) => re.test(tagline) || re.test(name)).map(([, t]) => t)
    plugins.push({
      slug,
      name,
      displayName: name.replace(/^dsh-/, '').replace(/-/g, ' '),
      description: tagline || meta?.description || prevEntry?.description || '',
      author: fullName.split('/')[0],
      repoUrl: `https://github.com/${fullName}`,
      category,
      tags: [...new Set([...(override.tags ?? []), ...autoTags])],
      stars: meta?.stars ?? prevEntry?.stars ?? 0,
      license: meta?.license ?? prevEntry?.license ?? null,
      updatedAt: meta?.updatedAt ?? prevEntry?.updatedAt ?? null,
      install,
      ...(override.notes ?? prevEntry?.notes ? { notes: override.notes ?? prevEntry?.notes } : {}),
      ...(override.featured ?? prevEntry?.featured ? { featured: true } : {}),
      ...(override.private ?? prevEntry?.private ? { private: true } : {}),
    })
  }

  plugins.sort((a, b) => b.stars - a.stars)
  const registry = {
    $schema: './schema.json',
    generatedAt: new Date().toISOString(),
    source: AWESOME_URL,
    pluginCount: plugins.length,
    plugins,
  }
  mkdirSync(dirname(OUT), { recursive: true })
  writeFileSync(OUT, JSON.stringify(registry, null, 2) + '\n')
  // 插件内嵌快照（host 半 /whalehub/api/registry 离线可读；随插件包分发）
  const pluginSnapshot = join(ROOT, 'plugin', 'registry', 'plugins.json')
  mkdirSync(dirname(pluginSnapshot), { recursive: true })
  writeFileSync(pluginSnapshot, JSON.stringify(registry, null, 2) + '\n')
  console.log(`wrote ${OUT} with ${plugins.length} plugins (+ plugin/registry snapshot)`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((e) => { console.error(e); process.exit(1) })
}
