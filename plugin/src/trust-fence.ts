/**
 * 浏览器信任围栏：行为对齐 /api 网关——Host 头必须是 loopback（或部署配置
 * 的 trustedHosts），并拒绝跨站浏览器标记。这是 DNS-rebinding / 跨站防御，
 * 不是认证。（参考 @deepseek-ai/dsh-client-connection 的 api-request-trust，
 * 以及 dsh-better-sidebar 的同名实现；官方包未导出这些辅助函数。）
 */
import type { IncomingHttpHeaders } from 'node:http'

export function isLoopbackHostname(hostname: string): boolean {
  if (hostname === 'localhost' || hostname === '[::1]' || hostname === '::1') return true
  const parts = hostname.split('.')
  return (
    parts.length === 4 &&
    parts[0] === '127' &&
    parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255)
  )
}

/** 判断请求是否允许触达插件路由。 */
export function isTrustedRequest(
  headers: IncomingHttpHeaders,
  trustedHosts: readonly string[] = [],
): boolean {
  // 跨站浏览器标记一律拒绝
  const fetchSite = headers['sec-fetch-site']
  if (typeof fetchSite === 'string' && fetchSite !== 'same-origin' && fetchSite !== 'none') {
    return false
  }
  const host = headers.host
  if (typeof host !== 'string' || host === '') return false
  let url: URL
  try {
    url = new URL(`http://${host}`)
  } catch {
    return false
  }
  if (isLoopbackHostname(url.hostname)) return true
  return trustedHosts.some((entry) => {
    try {
      const entryUrl = new URL(`http://${entry}`)
      return entryUrl.hostname === url.hostname
    } catch {
      return false
    }
  })
}
