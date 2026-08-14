import rules from '../../registry/submit-rules.json'

/**
 * 提交规则页：内容单一来源是 registry/submit-rules.json（同文件经
 * prepare-public 暴露为 /submit-rules.json，供 whalehub-market 插件实时拉取）。
 */
export function Submit() {
  return (
    <main className="page prose">
      <h1>{rules.title}</h1>
      <p>{rules.intro}</p>

      {rules.methods.map((m) => (
        <section key={m.name}>
          <h2>{m.name}</h2>
          <ol>
            {m.steps.map((s) => (
              <li key={s}>{renderText(s)}</li>
            ))}
          </ol>
          {m.link && (
            <p>
              <a href={m.link.url} target="_blank" rel="noreferrer">
                {m.link.label}
              </a>
            </p>
          )}
        </section>
      ))}

      <h2>提交前自检清单</h2>
      <ul>
        {rules.checklist.map((c) => (
          <li key={c}>✅ {renderText(c)}</li>
        ))}
      </ul>

      <h2>审核标准</h2>
      <p>{rules.review}</p>
    </main>
  )
}

/** 把规则文本里的 <包名> / dsh-plugin 等片段渲染为 code（保持原页面的排版语义）。 */
function renderText(text: string) {
  const parts = text.split(/(`[^`]+`|<[^>]+>)/g)
  return parts.map((part, i) => {
    if (part.startsWith('`') && part.endsWith('`')) return <code key={i}>{part.slice(1, -1)}</code>
    if (part.startsWith('<') && part.endsWith('>')) return <code key={i}>{part}</code>
    return part
  })
}

export function About() {
  return (
    <main className="page prose">
      <h1>🐋 关于 WhaleHub</h1>
      <p>
        WhaleHub 是面向 <a href="https://github.com/deepseek-ai/deepseek-harness" target="_blank" rel="noreferrer">DeepSeek Harness (DSH)</a> 生态的
        社区插件市场。DSH 基于 Cordis 插件系统，"Everything is a Plugin" —— 但插件散落在上百个仓库里，
        找到并装对一个插件的成本太高。WhaleHub 把它们聚到一起：
      </p>
      <ul>
        <li>🔍 <strong>发现</strong>：搜索、分类、热度排序，一眼看清每个插件是干什么的</li>
        <li>⚡ <strong>安装</strong>：选择 Profile，一键复制 <code>dsh plugin add</code> 命令或 <code>cordis.yml</code> 片段</li>
        <li>🔄 <strong>新鲜</strong>：数据每日从 awesome 列表与 GitHub API 自动同步</li>
        <li>📮 <strong>开放</strong>：任何人都能通过 Issue / PR 提交插件</li>
      </ul>
      <h2>技术</h2>
      <p>
        纯静态架构：React + Vite 前端 + 仓库内 JSON 注册表 + GitHub Actions 每日同步，部署在 Vercel。
        没有后端、没有账号体系，Git 历史即审计日志。产品需求见{' '}
        <a href="https://github.com/vvlife/whalehub-dsh/blob/main/docs/PRD.md" target="_blank" rel="noreferrer">PRD</a>。
      </p>
      <p className="muted">
        WhaleHub 是社区项目，与 DeepSeek 官方无隶属关系。鲸鱼 emoji 致敬 DSH 的 "deep diving" 状态标签。
      </p>
    </main>
  )
}
