import { navigate, useHashRoute } from '../lib/router'

const LINKS: [string, string][] = [
  ['/', '首页'],
  ['/plugins', '插件'],
  ['/submit', '提交插件'],
  ['/about', '关于'],
]

export function Nav() {
  const route = useHashRoute()
  return (
    <header className="nav">
      <a className="nav-logo" href="#/" onClick={(e) => { e.preventDefault(); navigate('/') }}>
        🐋 <strong>WhaleHub</strong>
        <span className="nav-sub">DeepSeek Harness 插件市场</span>
      </a>
      <nav className="nav-links">
        {LINKS.map(([to, label]) => (
          <a
            key={to}
            href={'#' + to}
            className={route === to || (to !== '/' && route.startsWith(to)) ? 'active' : ''}
          >
            {label}
          </a>
        ))}
        <a
          href="https://github.com/vvlife/whalehub-dsh"
          target="_blank"
          rel="noreferrer"
          className="nav-github"
        >
          GitHub
        </a>
      </nav>
    </header>
  )
}

export function Footer() {
  return (
    <footer className="footer">
      <p>
        WhaleHub · 社区驱动的 DeepSeek Harness 插件市场 · 数据来自{' '}
        <a href="https://github.com/vvlife/awesome-deepseek-harness-plugins" target="_blank" rel="noreferrer">
          awesome-deepseek-harness-plugins
        </a>{' '}
        与 GitHub API，每日自动同步
      </p>
      <p>插件版权归各自作者所有 · MIT License</p>
    </footer>
  )
}
