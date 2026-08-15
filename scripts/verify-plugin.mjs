#!/usr/bin/env node
/**
 * verify-plugin.mjs — WhaleHub 的"真·DSH 插件"判定器（共享模块）
 *
 * 判定依据（权威，直接对齐 dsh 自身的加载逻辑）：
 *   dsh 的 `plugin add` 在 reconcile 阶段只把"声明了 dsh.bundle.patch 的依赖"
 *   提进 `dsh.profile.bundles` 真正加载；否则只当普通依赖装进去并打印
 *   `... declares no dsh.bundle — installed as a plain dependency` 警告。
 *   见 app bundle：runtime/dsh/lib/plugin-*.js 里的 exportsPatch()：
 *       return readProfileManifest(NAME, dir).dsh?.bundle?.patch !== void 0
 *
 * 所以："收录进来的真的是插件" ⇔ 其 package.json 声明 dsh.bundle.patch。
 *
 * 本模块被两处复用：
 *   - scripts/validate-plugins.mjs   CI 全量校验注册表
 *   - scripts/sync-registry.mjs      每日同步时跳过非插件，杜绝再次混入
 *
 * 探测策略（尽量降低误判）：
 *   - GitHub：先查 API 拿 default_branch，再回退 main/master/trunk/develop；
 *     依次探测 hint / plugin / src / 仓库根 的 package.json；
 *     只要任一 manifest 声明 dsh.bundle.patch → OK；
 *     拉到 manifest 但都不声明 → FAIL（确凿的"假插件"）；
 *     所有探测路径都 404（无 package.json）→ SKIP（可能是非标准分支/子目录/ monorepo，需人工核）；
 *     网络/私有仓库拉取失败 → SKIP（告警，不阻断）。
 *   - npm：拉取 packument，取指定版本或 latest 的 manifest；404 → FAIL；网络错 → SKIP。
 *   - manual / script 类安装：本来就不是"一条命令装一个 bundle" → SKIP。
 */

const TIMEOUT_MS = 20_000

/** 与 dsh exportsPatch() 完全一致：声明了 dsh.bundle.patch 才是真插件 */
export function dshBundleDeclared(manifest) {
  return !!(manifest && manifest.dsh && manifest.dsh.bundle && manifest.dsh.bundle.patch !== undefined)
}

function withTimeout(ms) {
  const ac = new AbortController()
  const t = setTimeout(() => ac.abort(), ms)
  return { signal: ac.signal, clear: () => clearTimeout(t) }
}

async function fetchJson(url, { headers = {} } = {}) {
  const { signal, clear } = withTimeout(TIMEOUT_MS)
  try {
    const res = await fetch(url, { signal, headers: { 'User-Agent': 'whalehub-verify', ...headers } })
    if (!res.ok) return { ok: false, status: res.status, body: null }
    return { ok: true, status: res.status, body: await res.json() }
  } catch (e) {
    return { ok: false, status: 0, body: null, error: String(e?.message ?? e) }
  } finally {
    clear()
  }
}

function ghToken() {
  return process.env.GH_TOKEN || null
}

/** 解析 npm 包名里的版本（@scope/name@1.2.3 或 name@1.2.3） */
function splitNpm(pkg) {
  const m = pkg.match(/^(.+)@((?:\d+\.){1,3}\d+[\w.-]*)$/)
  if (m) return { name: m[1], version: m[2] }
  return { name: pkg, version: null }
}

/** 取 npm 指定版本或 latest 的 manifest，返回与 GitHub 解析一致的形状 */
async function resolveNpm(pkg) {
  const { name, version } = splitNpm(pkg)
  const enc = encodeURIComponent(name)
  const r = await fetchJson(`https://registry.npmjs.org/${enc}`)
  if (!r.ok) return { found: false, manifest: null, notFound: r.status === 404, networkError: r.status ? `http ${r.status}` : r.error }
  const doc = r.body
  const ver = version || doc['dist-tags']?.latest
  const manifest = doc.versions?.[ver] ?? doc.versions?.[doc['dist-tags']?.latest]
  if (!manifest) return { found: false, manifest: null, notFound: true }
  return { found: true, declared: dshBundleDeclared(manifest), manifest }
}

/** GitHub 默认分支（API 优先，失败回退常见分支） */
async function defaultBranches(fullName, token) {
  const headers = token ? { Authorization: `Bearer ${token}` } : {}
  const r = await fetchJson(`https://api.github.com/repos/${fullName}`, { headers })
  if (r.ok && r.body?.default_branch) return [r.body.default_branch, 'main', 'master', 'trunk', 'develop']
  return ['main', 'master', 'trunk', 'develop']
}

/** 从 install.command 里抠出 path:/xxx 子目录提示（如 github:..#main&path:/plugin） */
function pathHintFromCommand(command) {
  if (!command) return null
  const m = command.match(/path:(\/[A-Za-z0-9_.\-/]+)/)
  return m ? m[1].replace(/^\//, '') : null
}

/**
 * 通过 GitHub API git tree 列出仓库里所有 package.json（递归），用于快速探测
 * 没命中时的"兜底确权"：能确定仓库到底有没有 package.json，避免把 monorepo
 * 子目录里的真插件误判为"无 manifest"。
 * @returns {Promise<string[]|null>} package.json 路径数组；API 不可用时返回 null
 */
async function packageJsonCandidatesViaTree(fullName, branch, token) {
  const headers = token ? { Authorization: `Bearer ${token}` } : {}
  const r = await fetchJson(`https://api.github.com/repos/${fullName}/git/trees/${branch}?recursive=1`, { headers })
  if (!r.ok || !Array.isArray(r.body?.tree)) return null
  return r.body.tree
    .filter((t) => t.type === 'blob' && /(^|\/)package\.json$/.test(t.path))
    .map((t) => t.path)
}

/**
 * 解析 GitHub 仓库里"可能的 dsh 插件 manifest"。
 * 先快速探测常见路径；若都没命中，再用 git tree 兜底扫描全部 package.json。
 * @returns {Promise<{found:boolean, declared:boolean, manifest?:any, resolvedPath?:string, networkError?:string}>}
 */
async function resolveGithub(fullName, install) {
  const token = ghToken()
  const branches = await defaultBranches(fullName, token)
  const hint = install?.path || pathHintFromCommand(install?.command)
  const quickPaths = []
  if (hint) quickPaths.push(hint)
  quickPaths.push('plugin', 'src', '.')

  let firstManifest = null
  let firstPath = null
  let networkError = null

  // 1) 快速探测常见路径
  for (const branch of branches) {
    for (const c of quickPaths) {
      const base = `https://raw.githubusercontent.com/${fullName}/${branch}`
      const url = c === '.' ? `${base}/package.json` : `${base}/${c}/package.json`
      const r = await fetchJson(url)
      if (r.ok && r.body) {
        if (dshBundleDeclared(r.body)) return { found: true, declared: true, manifest: r.body, resolvedPath: c === '.' ? 'package.json' : `${c}/package.json` }
        if (!firstManifest) { firstManifest = r.body; firstPath = c === '.' ? 'package.json' : `${c}/package.json` }
      } else if (r.status === 404) {
        continue
      } else {
        networkError = r.error ?? `http ${r.status}`
      }
    }
  }
  if (firstManifest) return { found: true, declared: false, manifest: firstManifest, resolvedPath: firstPath }

  // 2) 兜底：git tree 扫描全部 package.json（确权证伪，避免漏掉 monorepo 子目录插件）
  const treePaths = await packageJsonCandidatesViaTree(fullName, branches[0], token)
  if (treePaths && treePaths.length) {
    for (const p of treePaths) {
      const url = `https://raw.githubusercontent.com/${fullName}/${branches[0]}/${p}`
      const r = await fetchJson(url)
      if (r.ok && r.body) {
        if (dshBundleDeclared(r.body)) return { found: true, declared: true, manifest: r.body, resolvedPath: p }
        if (!firstManifest) { firstManifest = r.body; firstPath = p }
      }
    }
    return { found: true, declared: false, manifest: firstManifest, resolvedPath: firstPath }
  }
  if (treePaths === null) return { found: false, declared: false, manifest: null, networkError: networkError ?? 'tree scan unavailable' }
  // tree 明确为空 → 仓库真的没有 package.json → 绝非可安装的 DSH 插件
  return { found: false, declared: false, manifest: null }
}

/**
 * 判定一个注册表条目是不是"真·DSH 插件"。
 * @param {string} fullName owner/repo
 * @param {{type?:string, package?:string, path?:string, command?:string}} install 条目的 install 字段
 * @returns {Promise<{status:'ok'|'skip'|'fail', reason:string, manifest?:any, resolvedPath?:string}>}
 */
export async function isRealDshPlugin(fullName, install = {}) {
  const type = install.type

  // 手动/脚本类安装：本来就不是"一条命令装一个 bundle"，跳过（仅告警）
  if (type === 'manual' || type === 'script') {
    return { status: 'skip', reason: `install.type=${type} — 非单包自动安装，跳过 bundle 校验` }
  }

  let resolved
  if (type === 'npm') {
    if (!install.package) return { status: 'skip', reason: 'npm 类型但缺 install.package，跳过' }
    resolved = await resolveNpm(install.package)
  } else if (type === 'github') {
    resolved = await resolveGithub(fullName, install)
  } else {
    return { status: 'skip', reason: `install.type=${type ?? 'unknown'} 不在校验范围，跳过` }
  }

  if (resolved.networkError) {
    return { status: 'skip', reason: `无法拉取 manifest（${resolved.networkError}），跳过` }
  }
  if (type === 'npm' && resolved.notFound) {
    return { status: 'fail', reason: `npm 包未找到：${install.package}` }
  }
  if (!resolved.found) {
    // github 经"快速探测 + git tree 兜底"后仍无任何 package.json → 绝非可安装的 DSH 插件
    return { status: 'fail', reason: '仓库中找不到任何 package.json（无法作为 DSH 插件安装）' }
  }
  if (resolved.declared) {
    return { status: 'ok', reason: '声明 dsh.bundle.patch ✓', manifest: resolved.manifest, resolvedPath: resolved.resolvedPath }
  }
  return {
    status: 'fail',
    reason: 'package.json 未声明 dsh.bundle.patch —— 不是可加载的 DSH 插件（可能只是 agent skills / 普通依赖）',
    manifest: resolved.manifest,
    resolvedPath: resolved.resolvedPath,
  }
}

/** 从 repoUrl 抠 owner/repo */
export function fullNameFromRepoUrl(repoUrl = '') {
  return repoUrl.replace(/^https:\/\/github\.com\//, '').replace(/\/$/, '')
}

// 允许以 `node scripts/verify-plugin.mjs <repoUrl> [type] [package]` 单测
import { pathToFileURL } from 'node:url'
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const repoUrl = process.argv[2]
  const type = process.argv[3] ?? 'github'
  const pkg = process.argv[4]
  if (!repoUrl) {
    console.error('usage: node scripts/verify-plugin.mjs <repoUrl> [type] [package]')
    process.exit(2)
  }
  const r = await isRealDshPlugin(fullNameFromRepoUrl(repoUrl), { type, package: pkg })
  console.log(JSON.stringify({ repoUrl, ...r }, null, 2))
  process.exit(r.status === 'fail' ? 1 : 0)
}
