import type { InstallSpec } from './types'

/** 解析安装目标；自定义 command 时优先取 `add <target>` 里的目标（如固定 tgz URL） */
function installTarget(install: InstallSpec, repoUrl: string): string {
  if (install.command) {
    const m = install.command.match(
      /\badd\s+(?:"([^"]+)"|'([^']+)'|(https?:\/\/[^\s"'#]+))(?=\s|$)/i,
    )
    const fromCommand = m?.[1] ?? m?.[2] ?? m?.[3]
    if (fromCommand) return fromCommand
  }
  if (install.type === 'npm' && install.package) return install.package
  return 'github:' + repoUrl.replace('https://github.com/', '')
}

/** 生成 dsh CLI 安装命令 */
export function installCommand(install: InstallSpec, profile: string, repoUrl: string): string {
  if (install.command) return install.command
  return `dsh plugin --profile ${profile} add ${installTarget(install, repoUrl)}`
}

/** 生成可粘贴进 cordis.yml 的配置片段 */
export function cordisSnippet(install: InstallSpec, repoUrl: string): string {
  const target = installTarget(install, repoUrl)
  return ['plugins:', `  - name: ${target}`, '    enabled: true'].join('\n')
}

/** 安装后校验命令 */
export function verifyCommand(profile: string): string {
  return `dsh --profile ${profile} --dump-config`
}

export function npmUrl(pkg?: string): string | null {
  if (!pkg) return null
  return 'https://www.npmjs.com/package/' + pkg.replace(/@[\d.]+$/, '')
}
