import { useState } from 'react'
import { PluginCard } from '../components/PluginCard'
import { getPlugin, plugins } from '../lib/data'
import { cordisSnippet, installCommand, npmUrl, verifyCommand } from '../lib/install'
import { useCopy } from '../lib/router'
import { formatDate, formatStars, relatedPlugins } from '../lib/search'
import { CATEGORIES } from '../lib/types'

function CopyBlock({ label, text }: { label: string; text: string }) {
  const [copied, copy] = useCopy()
  const isCopied = copied === text
  return (
    <div className="copy-block">
      <div className="copy-label">{label}</div>
      <pre><code>{text}</code></pre>
      <button className={isCopied ? 'copied' : ''} onClick={() => copy(text)}>
        {isCopied ? '✓ 已复制' : '📋 一键复制'}
      </button>
    </div>
  )
}

export function PluginDetail({ slug }: { slug: string }) {
  const plugin = getPlugin(slug)
  const [profile, setProfile] = useState('')
  if (!plugin) {
    return (
      <main className="page">
        <h1>插件不存在</h1>
        <p><a href="#/plugins">← 返回插件列表</a></p>
      </main>
    )
  }
  const profiles = plugin.install.profiles.length ? plugin.install.profiles : ['web']
  const activeProfile = profile || profiles[0]
  const cmd = installCommand(plugin.install, activeProfile, plugin.repoUrl)
  const snippet = cordisSnippet(plugin.install, plugin.repoUrl)
  const cat = CATEGORIES[plugin.category]
  const related = relatedPlugins(plugins, plugin)
  const npm = npmUrl(plugin.install.package)

  return (
    <main className="page detail">
      <p className="breadcrumb"><a href="#/plugins">插件</a> / {cat.zh} / {plugin.name}</p>
      <div className="detail-head">
        <span className="detail-icon">{cat.icon}</span>
        <div>
          <h1>
            {plugin.name}
            {plugin.featured && <span className="badge badge-featured">精选</span>}
            {plugin.private && <span className="badge badge-private">私有仓库</span>}
          </h1>
          <p className="detail-meta">
            <a href={`https://github.com/${plugin.author}`} target="_blank" rel="noreferrer">@{plugin.author}</a>
            {' · '}★ {formatStars(plugin.stars)}
            {' · '}{plugin.license ?? '未标注许可证'}
            {' · '}更新于 {formatDate(plugin.updatedAt)}
          </p>
        </div>
      </div>

      <p className="detail-desc">{plugin.description}</p>
      {plugin.tags.length > 0 && (
        <p className="tags">{plugin.tags.map((t) => <span key={t} className="chip">#{t}</span>)}</p>
      )}

      <section className="install-panel">
        <h2>⚡ 一键安装</h2>
        <div className="profile-picker">
          <span>安装到 Profile：</span>
          {profiles.map((p) => (
            <button
              key={p}
              className={p === activeProfile ? 'profile-btn active' : 'profile-btn'}
              onClick={() => setProfile(p)}
            >
              {p}
            </button>
          ))}
        </div>
        <CopyBlock label="① 在终端执行（dsh CLI）" text={cmd} />
        <CopyBlock label="② 安装后验证挂载成功" text={verifyCommand(activeProfile)} />
        <CopyBlock label="③ 或者直接粘贴进 cordis.yml" text={snippet} />
        <p className="install-hint">
          💡 安装完成后重启对应 profile（如 <code>dsh --profile {activeProfile}</code> 或 <code>dsh web</code>）即可生效。
        </p>
        {plugin.notes && (
          <div className="notes">
            <h3>⚠️ 安装须知 / 坑点</h3>
            <p>{plugin.notes}</p>
          </div>
        )}
      </section>

      <section className="detail-links">
        <a className="btn" href={plugin.repoUrl} target="_blank" rel="noreferrer">GitHub 仓库 →</a>
        {npm && <a className="btn" href={npm} target="_blank" rel="noreferrer">npm 页面 →</a>}
      </section>

      {related.length > 0 && (
        <section className="section">
          <h2>🔎 同分类推荐</h2>
          <div className="grid">
            {related.map((p) => <PluginCard key={p.slug} plugin={p} />)}
          </div>
        </section>
      )}
    </main>
  )
}
