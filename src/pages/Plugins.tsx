import { useMemo, useState } from 'react'
import { PluginCard } from '../components/PluginCard'
import { plugins } from '../lib/data'
import { filterPlugins, type SortKey } from '../lib/search'
import { CATEGORIES, CATEGORY_KEYS, type Category } from '../lib/types'

function readParams() {
  const h = window.location.hash
  const qi = h.indexOf('?')
  const sp = new URLSearchParams(qi >= 0 ? h.slice(qi + 1) : '')
  return { q: sp.get('q') ?? '', cat: (sp.get('cat') ?? 'all') as Category | 'all' }
}

export function Plugins() {
  const init = readParams()
  const [query, setQuery] = useState(init.q)
  const [category, setCategory] = useState<Category | 'all'>(init.cat)
  const [sort, setSort] = useState<SortKey>('stars')

  const results = useMemo(
    () => filterPlugins(plugins, { query, category, sort }),
    [query, category, sort],
  )

  return (
    <main className="page">
      <h1>🧩 全部插件 <span className="muted">({results.length})</span></h1>
      <div className="toolbar">
        <input
          className="search-input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="按名称、描述、作者、标签搜索…"
          aria-label="搜索插件"
        />
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value as Category | 'all')}
          aria-label="按分类筛选"
        >
          <option value="all">全部分类</option>
          {CATEGORY_KEYS.map((c) => (
            <option key={c} value={c}>
              {CATEGORIES[c].icon} {CATEGORIES[c].zh}
            </option>
          ))}
        </select>
        <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} aria-label="排序">
          <option value="stars">🔥 按热度</option>
          <option value="updated">🕒 最近更新</option>
          <option value="name">🔤 按名称</option>
        </select>
      </div>
      {results.length === 0 ? (
        <p className="empty">没有找到匹配的插件，换个关键词试试？</p>
      ) : (
        <div className="grid">
          {results.map((p) => <PluginCard key={p.slug} plugin={p} />)}
        </div>
      )}
    </main>
  )
}
