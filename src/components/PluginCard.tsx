import { CATEGORIES } from '../lib/types'
import { formatStars } from '../lib/search'
import { navigate } from '../lib/router'
import type { PluginEntry } from '../lib/types'

export function PluginCard({ plugin }: { plugin: PluginEntry }) {
  const cat = CATEGORIES[plugin.category]
  return (
    <article
      className="card"
      onClick={() => navigate(`/plugin/${plugin.slug}`)}
      role="link"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && navigate(`/plugin/${plugin.slug}`)}
    >
      <div className="card-head">
        <span className="card-icon">{cat.icon}</span>
        <div className="card-title">
          <h3>{plugin.name}</h3>
          <span className="card-author">@{plugin.author}</span>
        </div>
        {plugin.featured && <span className="badge badge-featured">精选</span>}
        {plugin.private && <span className="badge badge-private">私有</span>}
      </div>
      <p className="card-desc">{plugin.description || '暂无描述'}</p>
      <div className="card-foot">
        <span className="chip">{cat.zh}</span>
        <span className="stars">★ {formatStars(plugin.stars)}</span>
      </div>
    </article>
  )
}
