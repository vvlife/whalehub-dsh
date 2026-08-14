/**
 * Settings → Plugins 里的「🐋 插件市场」Tab：
 * 实时拉取 WhaleHub 注册表浏览/搜索，一键安装（走 host 半执行 dsh CLI），
 * 「📮 提交插件」按钮弹出实时拉取的上传规则，同时保留复制命令的手动通道。
 */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { call } from './api.ts'
import {
  CATEGORIES,
  installCommand,
  resolveTarget,
  type Category,
  type LivePayload,
  type PluginEntry,
  type Registry,
  type SubmitRules,
} from './registry-types.ts'

interface InstallState {
  status: 'idle' | 'running' | 'ok' | 'failed'
  output?: string
}

interface RegistryState {
  registry: Registry
  source: 'live' | 'snapshot'
  fetchedAt: string
}

interface RulesState {
  rules: SubmitRules
  source: 'live' | 'snapshot'
}

interface MarketTabProps {
  /** 由 inject 面提供（测试可注入假实现）。 */
  fetchRegistry?: () => Promise<RegistryState>
  installPlugin?: (profile: string, target: string) => Promise<{ ok: boolean; output: string; restartHint?: string }>
  fetchRules?: () => Promise<RulesState>
}

const DEFAULT_PROFILES = ['web', 'headless']

function copyText(text: string): void {
  if (navigator.clipboard?.writeText) {
    void navigator.clipboard.writeText(text).catch(() => undefined)
  }
}

/** 提交规则弹窗：打开时实时拉取（host 半多源回退），渲染结构化规则。 */
function SubmitRulesModal({ fetchRules, onClose }: {
  fetchRules?: () => Promise<RulesState>
  onClose: () => void
}): ReactNode {
  const [state, setState] = useState<RulesState | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let current = true
    const load = fetchRules ?? (() =>
      call<LivePayload<never> & { rules: SubmitRules }>('submit-rules')
        .then((r) => ({ rules: r.rules, source: r.source })))
    void Promise.resolve()
      .then(() => load())
      .then((r) => { if (current) setState(r) })
      .catch((e: unknown) => { if (current) setError(e instanceof Error ? e.message : String(e)) })
    return () => { current = false }
  }, [fetchRules])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="whalehub-modal-mask" onClick={onClose}>
      <div className="whalehub-modal" onClick={(e) => e.stopPropagation()}>
        <div className="whalehub-modal-head">
          <strong>{state?.rules.title ?? '📮 提交你的插件'}</strong>
          <button type="button" className="whalehub-modal-close" onClick={onClose}>✕</button>
        </div>
        {error && <p className="whalehub-modal-error">⚠️ 无法加载提交规则：{error}</p>}
        {!state && !error && <p className="whalehub-modal-loading">正在拉取最新提交规则…</p>}
        {state && (
          <div className="whalehub-modal-body">
            <p>{state.rules.intro}</p>
            {state.rules.methods.map((m) => (
              <section key={m.name}>
                <h4>{m.name}</h4>
                <ol>
                  {m.steps.map((s) => <li key={s}>{s}</li>)}
                </ol>
                {m.link && (
                  <p><a href={m.link.url} target="_blank" rel="noreferrer">{m.link.label}</a></p>
                )}
              </section>
            ))}
            <h4>提交前自检清单</h4>
            <ul>
              {state.rules.checklist.map((c) => <li key={c}>✅ {c}</li>)}
            </ul>
            <h4>审核标准</h4>
            <p>{state.rules.review}</p>
            <p className="whalehub-modal-meta">
              {state.source === 'live' ? '规则实时拉取自 WhaleHub' : '网络不可达，展示内置规则快照'} ·{' '}
              <a href={state.rules.marketUrl} target="_blank" rel="noreferrer">打开完整版 WhaleHub ↗</a>
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

export function MarketTab({ fetchRegistry, installPlugin, fetchRules }: MarketTabProps): ReactNode {
  const [state, setState] = useState<RegistryState | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<Category | 'all'>('all')
  const [profile, setProfile] = useState('web')
  const [installing, setInstalling] = useState<Record<string, InstallState>>({})
  const [copiedSlug, setCopiedSlug] = useState<string | null>(null)
  const [showRules, setShowRules] = useState(false)
  const [restartPending, setRestartPending] = useState(false)
  const [restartState, setRestartState] = useState<'idle' | 'restarting' | 'failed'>('idle')

  useEffect(() => {
    let current = true
    const load = fetchRegistry ?? (() =>
      call<LivePayload<never> & { registry: Registry }>('registry')
        .then((r) => ({ registry: r.registry, source: r.source, fetchedAt: r.fetchedAt })))
    void Promise.resolve()
      .then(() => load())
      .then((r) => { if (current) setState(r) })
      .catch((e: unknown) => { if (current) setLoadError(e instanceof Error ? e.message : String(e)) })
    return () => { current = false }
  }, [fetchRegistry])

  const registry = state?.registry ?? null

  const results = useMemo(() => {
    if (!registry) return []
    let out = registry.plugins
    if (category !== 'all') out = out.filter((p) => p.category === category)
    const q = query.trim().toLowerCase()
    if (q) {
      out = out.filter((p) =>
        [p.name, p.description, p.author, ...p.tags].join(' ').toLowerCase().includes(q),
      )
    }
    return [...out].sort((a, b) => b.stars - a.stars)
  }, [registry, query, category])

  const doInstall = useCallback(async (entry: PluginEntry) => {
    const resolved = resolveTarget(entry)
    if (resolved.kind === 'manual') {
      copyText(resolved.command)
      setCopiedSlug(entry.slug)
      setTimeout(() => setCopiedSlug(null), 1600)
      return
    }
    setInstalling((s) => ({ ...s, [entry.slug]: { status: 'running' } }))
    try {
      const run = installPlugin ?? ((p: string, t: string) => call('install', { profile: p, target: t }))
      const result = await run(profile, resolved.target)
      setInstalling((s) => ({
        ...s,
        [entry.slug]: { status: result.ok ? 'ok' : 'failed', output: result.output },
      }))
      if (result.ok) setRestartPending(true)
    } catch (e) {
      setInstalling((s) => ({
        ...s,
        [entry.slug]: { status: 'failed', output: e instanceof Error ? e.message : String(e) },
      }))
    }
  }, [profile, installPlugin])

  /** 立即重启：host 半自我重启 dsh web；本页探活成功后自动刷新，新插件即出现在插件列表。 */
  const doRestart = useCallback(async () => {
    setRestartState('restarting')
    try { await call('restart') } catch { /* 进程可能在响应前已退出，属正常 */ }
    // 旧进程有约 600ms 的响应冲刷窗口，2s 后再探活，避免打到尚未退出的旧进程
    await new Promise((r) => setTimeout(r, 2000))
    const deadline = Date.now() + 30_000
    while (Date.now() < deadline) {
      try {
        const res = await fetch('/', { method: 'HEAD', cache: 'no-store' })
        if (res.ok) { location.reload(); return }
      } catch { /* 还没起来 */ }
      await new Promise((r) => setTimeout(r, 800))
    }
    setRestartState('failed')
  }, [])

  if (loadError) {
    return (
      <div className="whalehub-market whalehub-error">
        <p>⚠️ 无法加载插件注册表：{loadError}</p>
        <p>请确认 whalehub-market 的 host 半已随 profile 挂载，或访问 <a href="https://vvlife.github.io/whalehub-dsh/" target="_blank" rel="noreferrer">网页版 WhaleHub</a>。</p>
      </div>
    )
  }
  if (!registry || !state) return <div className="whalehub-market whalehub-loading">正在加载插件注册表…</div>

  return (
    <div className="whalehub-market">
      <div className="whalehub-toolbar">
        <input
          className="whalehub-search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`搜索 ${registry.pluginCount} 个社区插件…`}
        />
        <select value={category} onChange={(e) => setCategory(e.target.value as Category | 'all')}>
          <option value="all">全部分类</option>
          {(Object.keys(CATEGORIES) as Category[]).map((c) => (
            <option key={c} value={c}>{CATEGORIES[c]}</option>
          ))}
        </select>
        <label className="whalehub-profile">
          安装到
          <select value={profile} onChange={(e) => setProfile(e.target.value)}>
            {[...new Set([...DEFAULT_PROFILES, profile])].map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
          profile
        </label>
        <button type="button" className="whalehub-submit" onClick={() => setShowRules(true)}>
          📮 提交插件
        </button>
      </div>

      <p className="whalehub-meta">
        {state.source === 'live'
          ? `实时数据 · 拉取于 ${state.fetchedAt.slice(0, 16).replace('T', ' ')}`
          : `离线快照 ${registry.generatedAt.slice(0, 10)}（实时源不可达）`}
        {' '}· 命中 {results.length} 个 ·{' '}
        <a href="https://vvlife.github.io/whalehub-dsh/" target="_blank" rel="noreferrer">打开完整版 WhaleHub ↗</a>
      </p>

      {restartPending && (
        <div className="whalehub-restart-bar">
          {restartState === 'idle' && (
            <>
              <span>✅ 安装完成，重启 dsh web 后新插件才会出现在「插件列表」。</span>
              <button type="button" onClick={() => void doRestart()}>🔄 立即重启</button>
              <button type="button" className="whalehub-later" onClick={() => setRestartPending(false)}>
                稍后重启
              </button>
            </>
          )}
          {restartState === 'restarting' && <span>🔄 正在重启 dsh web，页面会自动刷新…</span>}
          {restartState === 'failed' && (
            <span>⚠️ 等待重启超时。桌面 APP 可切走再切回本视图触发重启，或手动刷新页面。</span>
          )}
        </div>
      )}

      <div className="whalehub-list">
        {results.map((entry) => {
          const install = installing[entry.slug] ?? { status: 'idle' as const }
          const manual = resolveTarget(entry).kind === 'manual'
          return (
            <div key={entry.slug} className="whalehub-card">
              <div className="whalehub-card-head">
                <strong>{entry.name}</strong>
                <span className="whalehub-author">@{entry.author}</span>
                <span className="whalehub-stars">★ {entry.stars}</span>
              </div>
              <p className="whalehub-desc">{entry.description || '暂无描述'}</p>
              {entry.notes && <p className="whalehub-notes">⚠️ {entry.notes}</p>}
              <div className="whalehub-actions">
                <button
                  type="button"
                  disabled={install.status === 'running'}
                  onClick={() => void doInstall(entry)}
                >
                  {install.status === 'running'
                    ? '安装中…'
                    : manual
                      ? (copiedSlug === entry.slug ? '✓ 已复制命令' : '📋 复制安装步骤')
                      : install.status === 'ok'
                        ? '✅ 已安装'
                        : '⚡ 一键安装'}
                </button>
                <button
                  type="button"
                  className="whalehub-copy"
                  title={installCommand(entry, profile)}
                  onClick={() => {
                    copyText(installCommand(entry, profile))
                    setCopiedSlug(entry.slug + ':cmd')
                    setTimeout(() => setCopiedSlug(null), 1600)
                  }}
                >
                  {copiedSlug === entry.slug + ':cmd' ? '✓ 已复制' : '复制命令'}
                </button>
                <a href={entry.repoUrl} target="_blank" rel="noreferrer">仓库 ↗</a>
              </div>
              {install.status === 'ok' && (
                <p className="whalehub-ok">✅ 已安装，重启 dsh web 后生效（可用上方「立即重启」，无需任何命令行操作）。</p>
              )}
              {install.status === 'failed' && (
                <pre className="whalehub-fail">{install.output || '安装失败'}</pre>
              )}
            </div>
          )
        })}
      </div>

      {showRules && <SubmitRulesModal fetchRules={fetchRules} onClose={() => setShowRules(false)} />}
    </div>
  )
}
