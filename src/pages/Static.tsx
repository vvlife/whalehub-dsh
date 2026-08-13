export function Submit() {
  return (
    <main className="page prose">
      <h1>📮 提交你的插件</h1>
      <p>
        WhaleHub 的注册表由 Git 仓库托管，<strong>提交流程 = 一次 Issue 或 PR</strong>，无需注册账号、无需等待复杂审核。
      </p>

      <h2>方式一：提 Issue（推荐，1 分钟）</h2>
      <ol>
        <li>
          打开{' '}
          <a href="https://github.com/vvlife/whalehub-dsh/issues/new?template=submit-plugin.yml" target="_blank" rel="noreferrer">
            提交插件 Issue 表单
          </a>
        </li>
        <li>填写仓库地址、分类、一句话描述</li>
        <li>维护者审核后合并，次日同步即上线</li>
      </ol>

      <h2>方式二：直接 PR（适合批量/急上架）</h2>
      <ol>
        <li>Fork 本仓库，编辑 <code>registry/plugins.json</code>（或 awesome 列表源）</li>
        <li>确保 <code>npm test</code> 的注册表校验通过</li>
        <li>提交 PR，审核通过后自动部署</li>
      </ol>

      <h2>提交前自检清单</h2>
      <ul>
        <li>✅ 仓库是公开的，README 写清了安装方式</li>
        <li>✅ 给仓库打上 <code>dsh-plugin</code> topic，方便生态索引</li>
        <li>✅ 声明兼容的 DSH Profile（web / headless / 自定义）</li>
        <li>✅ 如果是 npm 包，确认 <code>dsh plugin add &lt;包名&gt;</code> 可直接安装</li>
      </ul>

      <h2>审核标准</h2>
      <p>
        只收录开源免费插件；拒绝恶意代码、付费墙与纯广告条目。审核通常在 24 小时内完成。
      </p>
    </main>
  )
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
