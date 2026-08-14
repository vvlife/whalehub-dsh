/**
 * WhaleHub 实时数据拉取：多源回退 + 短 TTL 缓存 + 打包快照兜底。
 *
 * 源优先级（registry 与 submit-rules 同构）：
 *   1. whalehub-dsh.vercel.app（主站，/registry.json 由 prepare-public 暴露）
 *   2. vvlife.github.io/whalehub-dsh（GitHub Pages 镜像）
 *   3. raw.githubusercontent.com（与 main 分支同步，永远最新）
 *   4. 插件打包快照（离线兜底）
 *
 * 纯函数设计：fetch 实现可注入，便于 vitest 不打真实网络。
 */

export interface LiveResult<T> {
  data: T
  /** live = 实时拉取成功；snapshot = 网络全挂，回退到打包快照 */
  source: 'live' | 'snapshot'
  /** 数据时间：live 时为拉取时刻，snapshot 时为快照 generatedAt */
  fetchedAt: string
  /** 命中的实时源 URL（snapshot 时无） */
  url?: string
}

export type FetchLike = (url: string, init?: { signal?: AbortSignal }) => Promise<{
  ok: boolean
  json: () => Promise<unknown>
}>

const CACHE_TTL_MS = 5 * 60 * 1000
/** 实时源全挂时快照结果的缓存时长（比 live 短，网络恢复后更快回切实时）。 */
const SNAPSHOT_CACHE_TTL_MS = 60 * 1000
const FETCH_TIMEOUT_MS = 6_000

/** 注册表实时源（/registry.json 与 main 分支 plugins.json 同构）。 */
export const REGISTRY_SOURCES = [
  'https://whalehub-dsh.vercel.app/registry.json',
  'https://vvlife.github.io/whalehub-dsh/registry.json',
  'https://raw.githubusercontent.com/vvlife/whalehub-dsh/main/registry/plugins.json',
]

/** 提交规则实时源（/submit-rules.json 与 main 分支 submit-rules.json 同构）。 */
export const RULES_SOURCES = [
  'https://whalehub-dsh.vercel.app/submit-rules.json',
  'https://vvlife.github.io/whalehub-dsh/submit-rules.json',
  'https://raw.githubusercontent.com/vvlife/whalehub-dsh/main/registry/submit-rules.json',
]

interface CacheEntry {
  result: LiveResult<unknown>
  expiresAt: number
}

const cache = new Map<string, CacheEntry>()

async function fetchJson(fetchImpl: FetchLike, url: string, timeoutMs: number): Promise<unknown> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetchImpl(url, { signal: controller.signal })
    if (!res.ok) throw new Error(`HTTP ${url} → ${res.ok}`)
    return await res.json()
  } finally {
    clearTimeout(timer)
  }
}

/**
 * 各实时源并行竞速（Promise.any），最快成功的胜出；全部失败时返回
 * snapshot 兜底结果。成功结果缓存 CACHE_TTL_MS，避免每次展开 Tab 都打外网。
 * 并行是为了让「源挂到超时」与「源 404」不再串行叠加等待。
 */
export async function fetchLive<T>(options: {
  cacheKey: string
  sources: string[]
  snapshot: T
  snapshotAt: string
  fetchImpl?: FetchLike
  now?: () => number
}): Promise<LiveResult<T>> {
  const { cacheKey, sources, snapshot, snapshotAt } = options
  const fetchImpl = options.fetchImpl ?? (globalThis.fetch as unknown as FetchLike)
  const now = options.now ?? Date.now

  const hit = cache.get(cacheKey)
  if (hit && hit.expiresAt > now()) return hit.result as LiveResult<T>

  try {
    const { data, url } = await promiseAny(
      sources.map((url) =>
        fetchJson(fetchImpl, url, FETCH_TIMEOUT_MS).then((data) => ({ data: data as T, url })),
      ),
    )
    const result: LiveResult<T> = { data, source: 'live', fetchedAt: new Date().toISOString(), url }
    cache.set(cacheKey, { result, expiresAt: now() + CACHE_TTL_MS })
    return result
  } catch {
    const result: LiveResult<T> = { data: snapshot, source: 'snapshot', fetchedAt: snapshotAt }
    cache.set(cacheKey, { result, expiresAt: now() + SNAPSHOT_CACHE_TTL_MS })
    return result
  }
}

/** Promise.any 的简版：全部 reject 时抛错（ Promise.any 的 AggregateError 不需要）。 */
function promiseAny<R>(promises: Promise<R>[]): Promise<R> {
  return new Promise((resolve, reject) => {
    let pending = promises.length
    if (pending === 0) reject(new Error('no sources'))
    for (const p of promises) {
      p.then(resolve, () => { if (--pending === 0) reject(new Error('all sources failed')) })
    }
  })
}

/** 测试用：清空缓存。 */
export function clearLiveCache(): void {
  cache.clear()
}
