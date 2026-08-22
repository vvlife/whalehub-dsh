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

/** 社区提交队列（GitHub Issue 表单）：维护者审核后入册，仅收录通过"真·DSH 插件"校验的条目。
 *  每条含 fullName / category / tagline；install · notes · tags 由下方 OVERRIDES 补充。
 *  未通过校验的提交（无 dsh.bundle.patch）不会被 sync 收录，需作者补全后重新提交。 */
const SUBMISSIONS = [
  { fullName: 'tuogusa/dsh-plugin-toggle', category: 'tools', tagline: 'DSH 插件开关/删除管理器：设置页直接启用停用、删除插件，支持 bundle 整组开关' },
  { fullName: 'tuogusa/dsh-skill-manager', category: 'tools', tagline: 'DSH 技能管理器：设置页浏览/搜索/删除用户技能，显示来源与标记' },
  { fullName: 'tuogusa/dsh-session-tags', category: 'tools', tagline: 'DSH 会话标签：给会话打标签并按 tag 搜索管理' },
  { fullName: 'tuogusa/dsh-whale-background', category: 'web-ui', tagline: '壁纸 + 半透明磨砂应用表面' },
  { fullName: 'tuogusa/dsh-session-nav', category: 'web-ui', tagline: '会话对话快捷导航：右侧悬浮按钮，hover 弹出完整历史提问列表，点击快速跳转' },
  { fullName: 'bpc-oss/dsh-web-billing', category: 'web-ui', tagline: '人民币/美元 token 计费插件：官方政策自动计价、逐条消息记账、账号余额、本地模型节省统计（界面语言自动切换 ¥/$）' },
  { fullName: 'MatsMQ/dsh-deepseek-balance', category: 'web-ui', tagline: '实时显示 DeepSeek 开发平台余额' },
  { fullName: 'omdsh-plugins/omdsh-code', category: 'terminal', tagline: 'Code 模式：以 harness 自带终端作为中间列，在会话工作区里运行' },
  { fullName: 'omdsh-plugins/omdsh-sidepanel', category: 'web-ui', tagline: 'Work 模式下的右侧文件树与底部终端侧栏' },
  { fullName: 'omdsh-plugins/omdsh-sidechat', category: 'web-ui', tagline: '侧边对话：锚定当前浏览内容，在独立会话中提问，不打扰主会话' },
  { fullName: 'omdsh-plugins/omdsh-usage', category: 'web-ui', tagline: '会话/项目花费与账户余额一览' },
  { fullName: 'omdsh-plugins/omdsh-editor', category: 'tools', tagline: '在会话头部一键用本机编辑器/终端/文件管理器打开项目目录' },
  { fullName: 'omdsh-plugins/omdsh-remdev', category: 'integrations', tagline: '远程开发：把工作区接到 SSH 服务器，文件、终端与智能体都在远端运行' },
  { fullName: 'omdsh-plugins/omdsh-remctrl', category: 'integrations', tagline: '远程控制：独立端口的第二入口，设备配对 + 分级方法白名单' },
  { fullName: 'omdsh-plugins/omdsh-justchat', category: 'agent', tagline: 'Chat 模式：免选项目目录直接开聊，会话统一收纳在托管工作区' },
  { fullName: 'omdsh-plugins/omdsh-shortcuts', category: 'tools', tagline: '一键绑定命令的快捷键系统，桌面菜单与网页共用一份配置' },
  { fullName: 'peterliucius/dsh-prompt-optimize', category: 'tools', tagline: '对 composer 当前草稿做辅助 LLM 改写；点击只替换草稿，不发送消息、不开回合' },
  { fullName: 'omdsh-plugins/omdsh-base', category: 'ecosystem', tagline: 'DeepSeek Harness Web GUI 的会话模式系统：模式注册表、模式切换器与侧边栏圆点，自带 Work 模式' },
  { fullName: 'omdsh-plugins/omdsh-plughub', category: 'ecosystem', tagline: 'omdsh 插件中心：在设置页里安装、移除并配置整套 omdsh 插件' },
  { fullName: 'zyfgood/dsh-feishu-bot', category: 'integrations', tagline: '飞书/Lark 机器人接入 DSH：WebSocket 长连接免公网回调，agent 模式流式回复、任务执行中可提问、/attach 接管 GUI 会话，附 feishu_* 出站工具' },
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
  'zyfgood/dsh-feishu-bot': {
    tags: ['feishu', 'lark', 'bot', 'agent', 'messaging'],
    install: { type: 'github', profiles: ['web'] },
    notes: '需飞书自建应用凭证（FEISHU_APP_ID/FEISHU_APP_SECRET 环境变量，密钥不落盘）；事件订阅用长连接模式；pnpm 10/11 需在 profile 的 pnpm-workspace.yaml 放行 protobufjs（README FAQ）。已声明 dsh.bundle.patch，dsh plugin add 一条命令安装即挂载。',
  },
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
  // —— 社区提交队列（Issue 表单）经审核入册 ——
  'tuogusa/dsh-plugin-toggle': { tags: ['plugin-manager', 'toggle', 'settings'], install: { type: 'github', profiles: ['web'] } },
  'tuogusa/dsh-skill-manager': { tags: ['skills', 'manager', 'settings'], install: { type: 'github', profiles: ['web'] } },
  'tuogusa/dsh-session-tags': { tags: ['session', 'tags', 'search'], install: { type: 'github', profiles: ['web'] } },
  'tuogusa/dsh-whale-background': { tags: ['wallpaper', 'skin', 'ui'], install: { type: 'github', profiles: ['web'] } },
  'tuogusa/dsh-session-nav': {
    tags: ['session', 'navigation', 'sidebar'],
    install: { type: 'github', profiles: ['web'] },
    notes: '兼容 Profile: web；git 安装需在 profile 的 pnpm-workspace.yaml 添加 allowBuilds；装完重启 + Ctrl+Shift+R',
  },
  'bpc-oss/dsh-web-billing': {
    tags: ['billing', 'token', 'cost', 'cn'],
    install: { type: 'github', profiles: ['web'] },
    notes: 'Bundle 插件：dsh plugin add 会自动把 dsh-web-billing 加入 dsh.profile.bundles 后重启 dsh web。可选配置 localProviders（如 dgx-spark-vllm）启用本地模型节省统计。只读端点 /billing/state、/billing/session/<id> 默认仅回环地址可访问。',
  },
  'MatsMQ/dsh-deepseek-balance': { tags: ['balance', 'api', 'cn'], install: { type: 'github', profiles: ['web'] } },
  'omdsh-plugins/omdsh-code': {
    tags: ['code', 'terminal', 'mode'],
    install: { type: 'github', profiles: ['web'] },
    notes: '依赖 omdsh-base 的模式切换器；终端运行在独立 profile（默认 omdsh-tui，需按该仓库说明安装）。',
  },
  'omdsh-plugins/omdsh-sidepanel': {
    tags: ['sidebar', 'filetree', 'terminal', 'panel'],
    install: { type: 'github', profiles: ['web'] },
    notes: '仅 Work 模式显示；可选依赖 omdsh-remdev（远程开发服务）。',
  },
  'omdsh-plugins/omdsh-sidechat': { tags: ['sidechat', 'chat', 'panel'], install: { type: 'github', profiles: ['web'] } },
  'omdsh-plugins/omdsh-usage': { tags: ['usage', 'billing', 'cost'], install: { type: 'github', profiles: ['web'] } },
  'omdsh-plugins/omdsh-editor': { tags: ['editor', 'vscode', 'open'], install: { type: 'github', profiles: ['web'] } },
  'omdsh-plugins/omdsh-remdev': {
    tags: ['remote', 'ssh', 'dev'],
    install: { type: 'github', profiles: ['web'] },
    notes: '需目标服务器可 SSH 登录；自动安装 Node/pnpm 与 Code 终端 profile。',
  },
  'omdsh-plugins/omdsh-remctrl': {
    tags: ['remote', 'control', 'mobile'],
    install: { type: 'github', profiles: ['web'] },
    notes: '当前为 M0（门与锁）；面向 tailnet 内手机远程查看会话与审批。',
  },
  'omdsh-plugins/omdsh-justchat': {
    tags: ['chat', 'mode', 'workspace'],
    install: { type: 'github', profiles: ['web'] },
    notes: '提供 Chat 与 Work 两种模式。',
  },
  'omdsh-plugins/omdsh-shortcuts': { tags: ['shortcuts', 'keybinding'], install: { type: 'github', profiles: ['web'] } },
  'peterliucius/dsh-prompt-optimize': {
    tags: ['prompt', 'optimize', 'composer'],
    install: { type: 'github', profiles: ['web'] },
    notes: '兼容 Profile: web（占用 conversation.input.right，需要已有 web Client Remote gateway）；不兼容默认 headless（无 composer UI）。Windows 上若 git 依赖 symlink 报 EPERM，可在 pnpm-workspace.yaml 加 packageImportMethod: copy。',
  },
  'omdsh-plugins/omdsh-base': {
    featured: false,
    tags: ['ecosystem', 'mode', 'base'],
    install: { type: 'npm', package: '@omdsh-plugins/omdsh-base', profiles: ['web'] },
    notes: '需要全局 dsh CLI 与 web profile；安装后重启 dsh web 生效。配合 omdsh-justchat / omdsh-code 可组成 Chat/Work/Code 模式切换。',
  },
  'omdsh-plugins/omdsh-plughub': {
    featured: false,
    tags: ['ecosystem', 'hub', 'manager'],
    install: { type: 'npm', package: '@omdsh-plugins/omdsh-plughub', profiles: ['web'] },
    notes: 'npm 已发布；安装后重启生效，Settings → Plugins → OMDSH Plugins 中可安装其余插件。',
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
  // 社区提交队列（Issue 表单）并入解析结果；按 fullName 去重，避免与 awesome 列表重复收录
  const SUBMISSIONS_ALL = [...parseAwesome(md), ...EXTRA_ENTRIES, ...SUBMISSIONS]
  const seenFull = new Set()
  const parsed = SUBMISSIONS_ALL.filter((e) => {
    const k = e.fullName.toLowerCase()
    if (seenFull.has(k)) return false
    seenFull.add(k)
    return true
  })
  console.log(`parsed ${parsed.length} repos (awesome + extra + submissions, deduped)`)
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
