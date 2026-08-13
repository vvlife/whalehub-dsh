import { describe, expect, it } from 'vitest'
import { cordisSnippet, installCommand, npmUrl, verifyCommand } from '../src/lib/install'
import { filterPlugins, formatStars, relatedPlugins } from '../src/lib/search'
import type { PluginEntry } from '../src/lib/types'

const mk = (over: Partial<PluginEntry>): PluginEntry => ({
  slug: 'a-b',
  name: 'b',
  displayName: 'b',
  description: '',
  author: 'a',
  repoUrl: 'https://github.com/a/b',
  category: 'web-ui',
  tags: [],
  stars: 0,
  license: 'MIT',
  updatedAt: '2026-08-13T00:00:00Z',
  install: { type: 'github', profiles: ['web'] },
  ...over,
})

describe('installCommand', () => {
  it('github 类型生成 github:owner/repo 形式', () => {
    expect(installCommand({ type: 'github', profiles: ['web'] }, 'web', 'https://github.com/a/b'))
      .toBe('dsh plugin --profile web add github:a/b')
  })
  it('npm 类型使用包名', () => {
    expect(
      installCommand({ type: 'npm', package: 'dsh-cc-tui', profiles: ['cc-tui'] }, 'cc-tui', 'https://github.com/a/b'),
    ).toBe('dsh plugin --profile cc-tui add dsh-cc-tui')
  })
  it('自定义 command 原样返回', () => {
    expect(installCommand({ type: 'manual', profiles: [], command: 'echo hi' }, 'web', '')).toBe('echo hi')
  })
  it('cordis 片段与校验命令', () => {
    expect(cordisSnippet({ type: 'npm', package: 'x', profiles: [] }, '')).toContain('name: x')
    expect(cordisSnippet({ type: 'github', profiles: [] }, 'https://github.com/a/b')).toContain('github:a/b')
    expect(verifyCommand('web')).toBe('dsh --profile web --dump-config')
  })
  it('npmUrl 去掉版本号', () => {
    expect(npmUrl('dsh-better-sidebar@0.10.2')).toBe('https://www.npmjs.com/package/dsh-better-sidebar')
    expect(npmUrl(undefined)).toBeNull()
  })
})

describe('filterPlugins', () => {
  const list = [
    mk({ slug: 'a-x', name: 'x', description: 'vision ocr', stars: 10, category: 'vision', tags: ['ocr'] }),
    mk({ slug: 'b-y', name: 'y', description: 'skin theme', stars: 50, category: 'web-ui', author: 'alice' }),
    mk({ slug: 'c-z', name: 'z', description: 'tui', stars: 1, category: 'terminal', updatedAt: '2026-08-14T00:00:00Z' }),
  ]
  it('按分类过滤', () => {
    expect(filterPlugins(list, { category: 'vision' })).toHaveLength(1)
  })
  it('按关键词模糊搜索（名称/描述/作者/标签）', () => {
    expect(filterPlugins(list, { query: 'ocr' })[0].slug).toBe('a-x')
    expect(filterPlugins(list, { query: 'ALICE' })[0].slug).toBe('b-y')
    expect(filterPlugins(list, { query: '不存在' })).toHaveLength(0)
  })
  it('默认按 stars 降序，支持名称与更新时间排序', () => {
    expect(filterPlugins(list, {}).map((p) => p.slug)).toEqual(['b-y', 'a-x', 'c-z'])
    expect(filterPlugins(list, { sort: 'name' }).map((p) => p.name)).toEqual(['x', 'y', 'z'])
    expect(filterPlugins(list, { sort: 'updated' })[0].slug).toBe('c-z')
  })
  it('分类 + 搜索组合', () => {
    expect(filterPlugins(list, { category: 'web-ui', query: 'skin' })).toHaveLength(1)
    expect(filterPlugins(list, { category: 'terminal', query: 'skin' })).toHaveLength(0)
  })
})

describe('misc utils', () => {
  it('relatedPlugins 取同分类且排除自身', () => {
    const list = [
      mk({ slug: 's1', category: 'fun', stars: 3 }),
      mk({ slug: 's2', category: 'fun', stars: 9 }),
      mk({ slug: 's3', category: 'fun', stars: 5 }),
      mk({ slug: 's4', category: 'web-ui', stars: 99 }),
    ]
    const rel = relatedPlugins(list, list[0])
    expect(rel.map((p) => p.slug)).toEqual(['s2', 's3'])
  })
  it('formatStars', () => {
    expect(formatStars(999)).toBe('999')
    expect(formatStars(1200)).toBe('1.2k')
    expect(formatStars(2000)).toBe('2k')
  })
})
