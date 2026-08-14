import { describe, expect, it } from 'vitest'
import {
  installArgs,
  isValidProfile,
  isValidTarget,
  listArgs,
  resolveTarget,
} from '../src/install.ts'
import { isLoopbackHostname, isTrustedRequest } from '../src/trust-fence.ts'

describe('install target 校验', () => {
  it('接受合法 npm 包名与 github: 形式', () => {
    expect(isValidTarget('dsh-cc-tui')).toBe(true)
    expect(isValidTarget('@linxin666/dsh-web-ui-all')).toBe(true)
    expect(isValidTarget('dsh-better-sidebar@0.10.2')).toBe(true)
    expect(isValidTarget('github:vvlife/whalehub-dsh')).toBe(true)
    expect(isValidTarget('github:vvlife/whalehub-dsh#main&path:/plugin')).toBe(true)
  })
  it('拒绝注入与非法输入', () => {
    expect(isValidTarget('foo; rm -rf /')).toBe(false)
    expect(isValidTarget('$(whoami)')).toBe(false)
    expect(isValidTarget('a b')).toBe(false)
    expect(isValidTarget('')).toBe(false)
    expect(isValidTarget('github:../../etc')).toBe(false)
  })
  it('profile 校验', () => {
    expect(isValidProfile('web')).toBe(true)
    expect(isValidProfile('cc-tui')).toBe(true)
    expect(isValidProfile('bad name')).toBe(false)
    expect(isValidProfile('-bad')).toBe(false)
  })
  it('installArgs 构造参数数组', () => {
    expect(installArgs('web', 'dsh-cc-tui')).toEqual(['plugin', '--profile', 'web', 'add', 'dsh-cc-tui'])
    expect(() => installArgs('web', 'bad target')).toThrow()
    expect(listArgs('web')).toEqual(['plugin', '--profile', 'web', 'ls', '--depth', '0'])
  })
})

describe('resolveTarget', () => {
  const repo = 'https://github.com/a/b'
  it('npm 优先，github 兜底，command 原样', () => {
    expect(resolveTarget({ type: 'npm', package: 'x@1.0.0', profiles: [] }, repo))
      .toEqual({ kind: 'cli', target: 'x@1.0.0' })
    expect(resolveTarget({ type: 'github', profiles: [] }, repo))
      .toEqual({ kind: 'cli', target: 'github:a/b' })
    expect(resolveTarget({ type: 'manual', command: 'echo hi', profiles: [] }, repo))
      .toEqual({ kind: 'manual', command: 'echo hi' })
  })
})

describe('trust fence', () => {
  it('loopback host 通过', () => {
    expect(isLoopbackHostname('127.0.0.1')).toBe(true)
    expect(isLoopbackHostname('localhost')).toBe(true)
    expect(isLoopbackHostname('::1')).toBe(true)
    expect(isLoopbackHostname('192.168.1.1')).toBe(false)
    expect(isTrustedRequest({ host: '127.0.0.1:3080' })).toBe(true)
    expect(isTrustedRequest({ host: 'localhost:3080' })).toBe(true)
  })
  it('跨站标记拒绝、无 host 拒绝、trustedHosts 放行', () => {
    expect(isTrustedRequest({ host: '127.0.0.1:3080', 'sec-fetch-site': 'cross-site' })).toBe(false)
    expect(isTrustedRequest({})).toBe(false)
    expect(isTrustedRequest({ host: 'evil.com' })).toBe(false)
    expect(isTrustedRequest({ host: 'myhost.lan:3080' }, ['myhost.lan:3080'])).toBe(true)
  })
})
