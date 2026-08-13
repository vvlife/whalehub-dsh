import { PluginCard } from '../components/PluginCard'
import { plugins, registry, stats } from '../lib/data'
import { formatStars } from '../lib/search'
import { navigate } from '../lib/router'
import { CATEGORIES, CATEGORY_KEYS } from '../lib/types'
import { useState } from 'react'

export function Home() {
  const [q, setQ] = useState('')
  const featured = plugins.filter((p) => p.featured).slice(0, 6)
  const top = [...plugins].sort((a, b) => b.stars - a.stars).slice(0, 6)
  const shown = featured.length >= 6 ? featured : [...new Map([...featured, ...top].map((p) => [p.slug, p])).values()].slice(0, 6)

  return (
    <main>
      <section className="hero">
        <div className="hero-whale">🐋</div>
        <h1>
          WhaleHub<span className="hero-dot"> · </span>DSH 插件市场
        </h1>
        <p className="hero-slogan">
          发现 DeepSeek Harness 社区插件，复制一条命令即可安装 —— 不用再到处翻仓库。
        </p>
        <form
          className="hero-search"
          onSubmit={(e) => {
            e.preventDefault()
            navigate(q.trim() ? `/plugins?q=${encodeURIComponent(q.trim())}` : '/plugins')
          }}
        >
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="搜索插件：皮肤 / TUI / 视觉 / 工作流…"
            aria-label="搜索插件"
          />
          <button type="submit">搜索</button>
        </form>
        <div className="hero-install">
          <code>dsh plugin --profile web add github:owner/repo</code>
          <span>← 在 WhaleHub，每个插件都能一键复制这样的安装命令</span>
        </div>
        <div className="hero-stats">
          <div><strong>{stats.total}</strong><span>收录插件</span></div>
          <div><strong>{stats.categories}</strong><span>分类</span></div>
          <div><strong>{formatStars(stats.totalStars)}</strong><span>累计 Stars</span></div>
          <div><strong>每日</strong><span>自动同步</span></div>
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <h2>⭐ 精选插件</h2>
          <a href="#/plugins">查看全部 →</a>
        </div>
        <div className="grid">
          {shown.map((p) => <PluginCard key={p.slug} plugin={p} />)}
        </div>
      </section>

      <section className="section">
        <h2>🗂️ 按分类浏览</h2>
        <div className="cat-grid">
          {CATEGORY_KEYS.map((c) => {
            const count = plugins.filter((p) => p.category === c).length
            return (
              <button key={c} className="cat-card" onClick={() => navigate(`/plugins?cat=${c}`)}>
                <span className="cat-icon">{CATEGORIES[c].icon}</span>
                <span className="cat-name">{CATEGORIES[c].zh}</span>
                <span className="cat-count">{count} 个插件</span>
              </button>
            )
          })}
        </div>
      </section>

      <section className="section note">
        <p>
          数据快照：{registry.generatedAt.slice(0, 10)} · 来源{' '}
          <a href="https://github.com/vvlife/awesome-deepseek-harness-plugins" target="_blank" rel="noreferrer">
            awesome-deepseek-harness-plugins
          </a>
        </p>
      </section>
    </main>
  )
}
