import { useCallback, useEffect, useState } from 'react'

/** 轻量 hash 路由：useHashRoute() 返回当前路径，navigate() 跳转 */
export function useHashRoute(): string {
  const [hash, setHash] = useState(() => window.location.hash.slice(1) || '/')
  useEffect(() => {
    const onChange = () => {
      setHash(window.location.hash.slice(1) || '/')
      window.scrollTo(0, 0)
    }
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return hash
}

export function navigate(to: string) {
  window.location.hash = to
}

export function useCopy(): [string | null, (text: string, key?: string) => void] {
  const [copied, setCopied] = useState<string | null>(null)
  const copy = useCallback((text: string, key = text) => {
    const done = () => {
      setCopied(key)
      setTimeout(() => setCopied(null), 1600)
    }
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(() => fallbackCopy(text, done))
    } else {
      fallbackCopy(text, done)
    }
  }, [])
  return [copied, copy]
}

function fallbackCopy(text: string, done: () => void) {
  const ta = document.createElement('textarea')
  ta.value = text
  ta.style.position = 'fixed'
  ta.style.opacity = '0'
  document.body.appendChild(ta)
  ta.select()
  try { document.execCommand('copy') } catch { /* ignore */ }
  document.body.removeChild(ta)
  done()
}
