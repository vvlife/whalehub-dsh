import type { Category, PluginEntry } from './types'

export type SortKey = 'stars' | 'name' | 'updated'

export interface Filter {
  query?: string
  category?: Category | 'all'
  sort?: SortKey
}

export function filterPlugins(plugins: PluginEntry[], f: Filter): PluginEntry[] {
  let out = plugins
  if (f.category && f.category !== 'all') {
    out = out.filter((p) => p.category === f.category)
  }
  const q = f.query?.trim().toLowerCase()
  if (q) {
    out = out.filter((p) =>
      [p.name, p.displayName, p.description, p.author, ...p.tags]
        .join(' ')
        .toLowerCase()
        .includes(q),
    )
  }
  const sort = f.sort ?? 'stars'
  return [...out].sort((a, b) => {
    if (sort === 'name') return a.name.localeCompare(b.name)
    if (sort === 'updated')
      return (b.updatedAt ?? '').localeCompare(a.updatedAt ?? '')
    return b.stars - a.stars
  })
}

export function relatedPlugins(plugins: PluginEntry[], current: PluginEntry, n = 4): PluginEntry[] {
  return plugins
    .filter((p) => p.slug !== current.slug && p.category === current.category)
    .sort((a, b) => b.stars - a.stars)
    .slice(0, n)
}

export function formatStars(n: number): string {
  return n >= 1000 ? (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k' : String(n)
}

export function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return iso.slice(0, 10)
}
