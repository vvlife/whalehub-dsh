import type { InstallSpec } from './types'

/** 生成 dsh CLI 安装命令 */
export function installCommand(install: InstallSpec, profile: string, repoUrl: string): string {
  if (install.command) return install.command
  const target =
    install.type === 'npm' && install.package
      ? install.package
      : 'github:' + repoUrl.replace('https://github.com/', '')
  return `dsh plugin --profile ${profile} add ${target}`
}

/** 生成可粘贴进 cordis.yml 的配置片段 */
export function cordisSnippet(install: InstallSpec, repoUrl: string): string {
  const target =
    install.type === 'npm' && install.package
      ? install.package
      : 'github:' + repoUrl.replace('https://github.com/', '')
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
