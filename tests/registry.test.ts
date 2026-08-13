import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { PluginEntry, Registry } from '../src/lib/types'

const registry = JSON.parse(
  readFileSync(join(__dirname, '..', 'registry', 'plugins.json'), 'utf8'),
) as Registry

const VALID_CATEGORIES = [
  'web-ui', 'terminal', 'vision', 'tools',
  'agent', 'integrations', 'ecosystem', 'fun',
]
const VALID_INSTALL_TYPES = ['npm', 'github', 'script', 'manual']

describe('registry schema', () => {
  it('包含不少于 50 个插件（冷启动指标）', () => {
    expect(registry.plugins.length).toBeGreaterThanOrEqual(50)
    expect(registry.pluginCount).toBe(registry.plugins.length)
  })

  it('slug 全局唯一', () => {
    const slugs = registry.plugins.map((p) => p.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
  })

  it.each(registry.plugins.map((p) => [p.slug, p] as [string, PluginEntry]))(
    '条目 %s 字段完整且合法',
    (_slug, p) => {
      expect(p.slug).toMatch(/^[a-z0-9-]+$/)
      expect(p.name.length).toBeGreaterThan(0)
      expect(p.author.length).toBeGreaterThan(0)
      expect(p.repoUrl).toMatch(/^https:\/\/github\.com\/[^/]+\/[^/]+$/)
      expect(VALID_CATEGORIES).toContain(p.category)
      expect(VALID_INSTALL_TYPES).toContain(p.install.type)
      expect(Array.isArray(p.tags)).toBe(true)
      expect(p.stars).toBeGreaterThanOrEqual(0)
      expect(p.install.profiles.length).toBeGreaterThan(0)
      if (p.install.type === 'npm') expect(p.install.package).toBeTruthy()
    },
  )

  it('featured 插件必须有 notes 或 npm 安装方式（保证详情页有内容）', () => {
    for (const p of registry.plugins.filter((x) => x.featured)) {
      expect(p.notes || p.install.type === 'npm').toBeTruthy()
    }
  })

  it('每个分类都有插件', () => {
    for (const c of VALID_CATEGORIES) {
      expect(registry.plugins.some((p) => p.category === c)).toBe(true)
    }
  })
})
