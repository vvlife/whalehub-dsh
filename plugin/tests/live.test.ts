import { beforeEach, describe, expect, it } from 'vitest'
import { clearLiveCache, fetchLive, REGISTRY_SOURCES, RULES_SOURCES, type FetchLike } from '../src/live.ts'
import { buildRelaunchScript, dshInvocation, resolveWebPort } from '../src/index.ts'

const okFetch = (data: unknown): FetchLike => async () => ({ ok: true, json: async () => data })
const failFetch: FetchLike = async () => { throw new Error('network down') }

function sequencedFetch(results: { ok: boolean; data?: unknown }[]): FetchLike {
  let i = 0
  return async () => {
    const r = results[Math.min(i++, results.length - 1)]
    if (!r.ok) throw new Error('unreachable')
    return { ok: true, json: async () => r.data }
  }
}

describe('fetchLive 多源回退与缓存', () => {
  beforeEach(() => clearLiveCache())

  const snapshot = { pluginCount: 1, plugins: [] }

  it('首个源成功 → live', async () => {
    const r = await fetchLive({
      cacheKey: 't1', sources: ['https://a/x.json'], snapshot, snapshotAt: '2026-01-01',
      fetchImpl: okFetch({ pluginCount: 68, plugins: [] }),
    })
    expect(r.source).toBe('live')
    expect((r.data as typeof snapshot).pluginCount).toBe(68)
    expect(r.url).toBe('https://a/x.json')
  })

  it('首源失败回退次源', async () => {
    const r = await fetchLive({
      cacheKey: 't2', sources: ['https://a/x.json', 'https://b/x.json'], snapshot, snapshotAt: '2026-01-01',
      fetchImpl: sequencedFetch([{ ok: false }, { ok: true, data: { pluginCount: 2, plugins: [] } }]),
    })
    expect(r.source).toBe('live')
    expect(r.url).toBe('https://b/x.json')
  })

  it('全部源失败 → snapshot 兜底', async () => {
    const r = await fetchLive({
      cacheKey: 't3', sources: ['https://a/x.json'], snapshot, snapshotAt: '2026-01-01',
      fetchImpl: failFetch,
    })
    expect(r.source).toBe('snapshot')
    expect(r.data).toBe(snapshot)
    expect(r.fetchedAt).toBe('2026-01-01')
  })

  it('TTL 内命中缓存，不再请求网络', async () => {
    let calls = 0
    const counting: FetchLike = async (url) => { calls++; return { ok: true, json: async () => ({ pluginCount: 5 }) } }
    const opts = {
      cacheKey: 't4', sources: ['https://a/x.json'], snapshot, snapshotAt: '2026-01-01', fetchImpl: counting,
    }
    await fetchLive(opts)
    await fetchLive(opts)
    expect(calls).toBe(1)
  })

  it('registry 与 rules 源列表都指向 WhaleHub 官方域名', () => {
    for (const u of [...REGISTRY_SOURCES, ...RULES_SOURCES]) {
      expect(u).toMatch(/^https:\/\/(whalehub-dsh\.vercel\.app|vvlife\.github\.io|raw\.githubusercontent\.com)\//)
    }
  })
})

describe('dshInvocation（桌面 APP 无 PATH dsh 的场景）', () => {
  it('WHALEHUB_DSH_BIN 显式覆盖优先', () => {
    expect(dshInvocation(['plugin', 'ls'], { WHALEHUB_DSH_BIN: '/opt/dsh' } as NodeJS.ProcessEnv, null))
      .toEqual({ command: '/opt/dsh', args: ['plugin', 'ls'] })
  })
  it('argv1 是 dsh bin.js → 用当前 node 执行它', () => {
    expect(dshInvocation(['plugin', 'ls'], {} as NodeJS.ProcessEnv, '/app/runtime/dsh/lib/bin.js', '/app/runtime/node/bin/node'))
      .toEqual({ command: '/app/runtime/node/bin/node', args: ['/app/runtime/dsh/lib/bin.js', 'plugin', 'ls'] })
  })
  it('无 argv1 或入口与 dsh 无关 → 回退 PATH 的 dsh', () => {
    expect(dshInvocation(['plugin', 'ls'], {} as NodeJS.ProcessEnv, null))
      .toEqual({ command: 'dsh', args: ['plugin', 'ls'] })
    expect(dshInvocation(['plugin', 'ls'], {} as NodeJS.ProcessEnv, '/usr/lib/node_modules/vitest/vitest.mjs'))
      .toEqual({ command: 'dsh', args: ['plugin', 'ls'] })
  })
})

describe('自重启（restart API）', () => {
  it('resolveWebPort 解析 --port，缺省 3080', () => {
    expect(resolveWebPort(['node', '/x/bin.js', 'web', '--host', '127.0.0.1', '--port', '3180'])).toBe(3180)
    expect(resolveWebPort(['node', '/x/bin.js', 'web'])).toBe(3080)
    expect(resolveWebPort(['node', '/x/bin.js', 'web', '--port', 'abc'])).toBe(3080)
  })
  it('buildRelaunchScript 复用原参数与端口', () => {
    const script = buildRelaunchScript(
      ['/usr/bin/node', '/app/runtime/dsh/lib/bin.js', 'web', '--host', '127.0.0.1', '--port', '3180'],
      '/usr/bin/node',
    )
    expect(script).not.toBeNull()
    expect(script).toContain('"/app/runtime/dsh/lib/bin.js"')
    expect(script).toContain('"web"')
    expect(script).toContain('"3180"')
    expect(script).toContain('detached: true')
  })
  it('无 dsh 入口时返回 null（调用方报不支持自动重启）', () => {
    expect(buildRelaunchScript(['/usr/bin/node'], '/usr/bin/node')).toBeNull()
    expect(buildRelaunchScript(['/usr/bin/node', '/x/cli.cjs', 'web'], '/usr/bin/node')).toBeNull()
  })
})
