/** 安装目标与 profile 的校验 + dsh CLI 参数构造（纯函数，便于测试）。 */

const PROFILE_RE = /^[\w][\w-]{0,39}$/
/** npm 包名（可带 scope 与版本）：[@scope/]name[@version] */
const NPM_RE = /^(@[\w.-]+\/)?[\w.-]+(@[\w.^~*-][\w.^~*.-]*)?$/
/** github:owner/repo[#ref][&path:/dir] */
const GITHUB_RE = /^github:[\w.-]+\/[\w.-]+(#[\w./-]+)?(&path:[\w./-]+)?$/

export function isValidProfile(profile: string): boolean {
  return PROFILE_RE.test(profile)
}

export function isValidTarget(target: string): boolean {
  return NPM_RE.test(target) || GITHUB_RE.test(target)
}

/** 由注册表条目解析安装目标（npm 优先，否则 github: 形式）。 */
export function resolveTarget(install: {
  type: string
  package?: string
  command?: string
  profiles: string[]
}, repoUrl: string): { kind: 'cli'; target: string } | { kind: 'manual'; command: string } {
  if (install.command) return { kind: 'manual', command: install.command }
  if (install.type === 'npm' && install.package) return { kind: 'cli', target: install.package }
  return { kind: 'cli', target: 'github:' + repoUrl.replace('https://github.com/', '') }
}

/** 构造 dsh CLI 参数数组（spawn 用，不经 shell，无注入风险）。 */
export function installArgs(profile: string, target: string): string[] {
  if (!isValidProfile(profile)) throw new Error(`invalid profile: ${profile}`)
  if (!isValidTarget(target)) throw new Error(`invalid target: ${target}`)
  return ['plugin', '--profile', profile, 'add', target]
}

export function listArgs(profile: string): string[] {
  if (!isValidProfile(profile)) throw new Error(`invalid profile: ${profile}`)
  return ['plugin', '--profile', profile, 'ls', '--depth', '0']
}
