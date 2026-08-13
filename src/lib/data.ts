import type { PluginEntry, Registry } from './types'
import data from '../../registry/plugins.json'

export const registry = data as unknown as Registry
export const plugins: PluginEntry[] = registry.plugins

export function getPlugin(slug: string): PluginEntry | undefined {
  return plugins.find((p) => p.slug === slug)
}

export const stats = {
  total: plugins.length,
  featured: plugins.filter((p) => p.featured).length,
  categories: new Set(plugins.map((p) => p.category)).size,
  totalStars: plugins.reduce((s, p) => s + p.stars, 0),
}
