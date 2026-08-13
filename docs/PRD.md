# WhaleHub — DeepSeek Harness Plugin Marketplace 产品需求文档 (PRD)

> 代号：**WhaleHub for DSH**（原名 ClawHub for DSH，已更名）
> 版本：v0.2（已评审修正版，替代 v0.1 Draft）
> 日期：2026-08-13
> 作者：Agnes (Sapiens AI)

---

## 0. v0.2 修订记录（相对 v0.1 的错漏修正）

| # | v0.1 的问题 | v0.2 修正 |
|---|------------|-----------|
| 1 | 日期标注 2026-07-10，但 DSH 于 2026-08-13 才发布开发者预览，时间线矛盾 | 日期更正为 2026-08-13 |
| 2 | 安装命令写作 `dsh plugin install <package>`，与 DSH 实际 CLI 不符 | 更正为 `dsh plugin add <package>`（可选 `--profile <name>`）；仓库托管插件使用 `github:<owner>/<repo>` 形式 |
| 3 | 分类体系（`bash/fs/web/agent/tool/cordis/ui/workflow`）凭空设想，与真实社区生态不符 | 改用与 [awesome-deepseek-harness-plugins](https://github.com/vvlife/awesome-deepseek-harness-plugins) 对齐的 8 个真实分类（见 §4.2） |
| 4 | v1 要求 PostgreSQL + 独立后端 + GitHub OAuth + 定时同步服务，MVP 过重，且无法零成本部署 | v1 改为**零后端架构**：注册表 = 仓库内 `registry/plugins.json`，前端为纯静态 SPA；提交走 GitHub PR/Issue；同步走 GitHub Actions cron。OAuth/评论/后端整体移至 v2 |
| 5 | 缺少冷启动方案：新市场初始无插件 | 新增 §3.5 冷启动：以 awesome 列表为种子数据源，脚本自动解析 + GitHub API 补充元数据 |
| 6 | "一键安装"只描述了复制命令，未定义完整自动化路径 | 新增 §3.1.3 修订：安装面板提供 ① 一键复制安装命令 ② profile 选择 ③ `cordis.yml` 片段生成 ④ 安装后校验命令（`--dump-config`） |
| 7 | 数据模型缺 `stars`、`installType`（npm/github/script）、`featured` 等关键字段；`installCount` 在零后端架构下无法采集 | 数据模型修订（见 §4.2）；v1 用 GitHub stars 替代安装量做热度排序 |
| 8 | 缺少"已安装检测"的现实性说明（浏览器无法读本地 node_modules） | §4.3 修订：v1 不做本地扫描，仅提供命令复制；DSH Web GUI 深度链接列为 v2 |
| 9 | 成功指标"收录 ≥50 插件"无来源支撑 | 冷启动即从 awesome 列表收录 50+ 插件，指标改为可达成口径 |

---

## 1. 项目概述

### 1.1 背景

DeepSeek Harness (`dsh`) 是一套基于 Cordis 插件系统的 AI Agent 运行时平台（2026-08-13 发布开发者预览，MIT 协议），支持通过插件组合（Profile）构建不同场景的 Agent 能力。当前插件的发现主要依赖口耳相传和 awesome 列表，安装需要用户自行去各个仓库翻找安装方式，缺乏一个可视化的、社区驱动的插件发现与安装中心。

**WhaleHub** 是面向 DSH 插件生态的 Web 化插件市场：用户只需打开这一个网站，就能浏览、搜索并**一键复制安装命令**，无需再到处搜索手工安装。

### 1.2 目标

| 目标 | 说明 |
|------|------|
| **P1 发现** | 让用户通过 Web 界面轻松发现社区插件，降低插件使用门槛 |
| **P2 安装** | 一键复制与所选 Profile 匹配的安装命令及配置片段，复制即用 |
| **P3 发布** | 为插件开发者提供便捷的提交流程（GitHub Issue/PR，零门槛） |
| **P4 社区** | v2 建立评分、评论、收藏等社区机制 |

### 1.3 非目标（不在 v1 范围内）

- 不替代 `dsh plugin` CLI 命令，而是与其互补
- 不托管插件源码仓库（仍使用 npm/GitHub），只托管元数据和索引
- 不做插件沙箱隔离执行（沙箱由 DSH 本体负责）
- 不做支付/付费插件系统
- v1 不做用户账号体系（GitHub OAuth、收藏、评论移至 v2）

---

## 2. 用户画像

### 2.1 插件使用者（Plugin User）
- **典型场景**：刚装好 DSH，想找皮肤、TUI、工作流等插件，但不知道去哪找、怎么装
- **核心诉求**：快速搜索、清晰描述、一键复制安装命令、安全可信

### 2.2 插件开发者（Plugin Developer）
- **典型场景**：开发了一个 Cordis 插件，希望社区能发现和使用
- **核心诉求**：简单的提交流程（提个 Issue/PR 即可）、清晰的展示

### 2.3 DSH 平台维护者（Platform Maintainer）
- **典型场景**：希望监控生态健康度，管理被下架的恶意插件
- **核心诉求**：注册表可审计（Git 历史即审计日志）、违规条目可快速移除

---

## 3. 产品功能需求

### 3.1 前台功能（面向普通用户）

#### 3.1.1 插件浏览与搜索

| 功能项 | 描述 | 优先级 |
|--------|------|--------|
| 插件列表页 | 展示所有收录插件，卡片式布局（名称、描述、作者、stars、分类、标签） | P0 |
| 分类浏览 | 按 8 个真实生态分类浏览（见 §4.2 category 枚举） | P0 |
| 搜索 | 按名称、描述、作者、标签模糊搜索 | P0 |
| 排序 | 按 stars（热度）、名称、最近更新排序 | P0 |
| 精选区 | 首页展示官方推荐/高星精选插件 | P0 |

#### 3.1.2 插件详情页

| 功能项 | 描述 | 优先级 |
|--------|------|--------|
| 基本信息 | 名称、作者、许可证、简介、stars、最近更新时间 | P0 |
| 安装信息 | 安装命令、Profile 兼容性、安装方式（npm/github/script） | P0 |
| 安装指引 | 针对该插件的注意事项（坑点、前置依赖，来自实测笔记） | P1 |
| 相关插件 | 同分类插件推荐 | P1 |
| 外链 | GitHub 仓库、npm 页面 | P0 |

#### 3.1.3 一键安装（v1 核心）

| 功能项 | 描述 | 优先级 |
|--------|------|--------|
| 安装面板 | 选择目标 Profile（web/headless/自定义）后实时生成对应命令 | P0 |
| 一键复制 | 复制 `dsh plugin --profile <p> add <package>` 命令 | P0 |
| 配置片段 | 生成可直接粘贴进 `cordis.yml` 的 YAML 片段 | P1 |
| 安装后校验 | 提供 `dsh --profile <p> --dump-config` 验证命令与重启提示 | P1 |
| DSH Web GUI 深度链接 | 检测本地 DSH 并推送安装 | P2（v2） |

#### 3.1.4 用户账号与社区（v2）

GitHub 登录、收藏、评分评论、个人主页 —— 整体移至 v2，依赖后端服务。

### 3.2 开发者功能（面向插件作者）

| 功能项 | 描述 | 优先级 |
|--------|------|--------|
| 插件提交 | 通过 GitHub Issue 模板提交（包名/仓库/分类/描述），或直接在 awesome 列表提 PR | P0 |
| 元数据自动验证 | CI 校验注册表 schema：必填字段、分类枚举、URL 合法性、条目唯一性 | P0 |
| 元数据自动补充 | 同步脚本自动从 GitHub API 拉取 stars、许可证、描述、更新时间 | P0 |
| Webhook 自动更新 | GitHub Actions cron 每日同步 awesome 列表与仓库元数据 | P1 |

### 3.3 后台功能（面向平台维护者）

| 功能项 | 描述 | 优先级 |
|--------|------|--------|
| 审核 | Issue/PR 人工审核，合并即发布 | P0 |
| 下架 | 从 `registry/plugins.json` 移除条目并提交说明 | P0 |
| 审计日志 | Git 提交历史即审计日志 | P0 |
| 数据看板 | 移至 v2 | P2 |

### 3.5 冷启动（新增）

| 功能项 | 描述 | 优先级 |
|--------|------|--------|
| 种子数据 | 解析 [awesome-deepseek-harness-plugins](https://github.com/vvlife/awesome-deepseek-harness-plugins) 精选列表（50+ 插件，8 个分类）生成初始注册表 | P0 |
| 元数据补充 | 用 GitHub API 补充每个仓库的 stars/license/description/updatedAt | P0 |
| 实测笔记导入 | awesome 列表中 6 个高星插件的 Hands-on Notes 转为详情页安装指引 | P0 |
| 持续同步 | 每日 cron 重新执行上述流程，保持数据新鲜 | P1 |

---

## 4. 技术架构

### 4.1 整体架构（v1，零后端）

```
┌──────────────────────────────────────────────────────┐
│                  前端 (静态 SPA)                       │
│  React 18 + TypeScript + Vite，自写 CSS               │
│  部署：Vercel（静态托管，自动 HTTPS）                   │
└──────────────┬───────────────────────────────────────┘
               │ 构建期内嵌 / 运行时 fetch
┌──────────────▼───────────────────────────────────────┐
│           注册表 registry/plugins.json                │
│  存放于本仓库，Git 版本控制，PR 审核制                   │
└──────────────▲───────────────────────────────────────┘
               │ 每日 cron / 手动触发
┌──────────────┴───────────────────────────────────────┐
│           同步脚本 scripts/sync-registry.mjs          │
│  解析 awesome 列表 → GitHub API 补充元数据 → 写 JSON   │
│  运行于 GitHub Actions                                │
└──────────────────────────────────────────────────────┘
```

### 4.2 数据模型（注册表条目）

```typescript
type Category =
  | 'web-ui'        // Web UI 与皮肤
  | 'terminal'      // 终端与桌面
  | 'vision'        // 视觉与多模态
  | 'tools'         // 工具与编辑器体验
  | 'agent'         // Agent 编排与工作流
  | 'integrations'  // 集成与桥接
  | 'ecosystem'     // 侧边栏 / 工作区 / 生态
  | 'fun'           // 好玩与杂项

interface PluginEntry {
  slug: string            // 唯一标识，= GitHub owner/repo 转 kebab
  name: string            // 仓库名
  displayName: string     // 展示名
  description: string     // 一句话描述
  author: string          // GitHub owner
  repoUrl: string         // https://github.com/owner/repo
  category: Category
  tags: string[]
  stars: number           // GitHub stars（热度指标）
  license: string | null
  updatedAt: string       // ISO 日期，仓库最近 push
  install: {
    type: 'npm' | 'github' | 'script' | 'manual'
    package?: string      // npm 包名（type=npm 时）
    command?: string      // 完整自定义命令（type=script/manual 时）
    profiles: string[]    // 推荐安装的 profile，如 ['web']
  }
  notes?: string          // 安装注意事项 / 坑点
  featured?: boolean      // 首页精选
  private?: boolean       // 私有仓库标注
}
```

### 4.3 与 DSH 本体的集成点（修订）

| 集成方式 | 说明 |
|----------|------|
| **安装命令生成** | 详情页根据条目 `install` 字段与所选 profile 生成 `dsh plugin --profile <p> add <pkg>` 或 `github:<owner>/<repo>` 形式命令，一键复制 |
| **配置片段生成** | 生成 `cordis.yml` 的 plugins 片段，供手写配置的用户直接粘贴 |
| **安装校验** | 提供 `dsh --profile <p> --dump-config` 验证命令 |
| **每日同步** | GitHub Actions cron 运行同步脚本，数据漂移自动修复 |
| **DSH Web GUI 桥接** | v2：检测本地 `http://127.0.0.1:3080` 可达后提供"推送到本地 DSH"按钮 |

### 4.4 技术选型（修订）

| 层次 | 技术 | 理由 |
|------|------|------|
| 前端框架 | React 18 + TypeScript + Vite | 与 DSH Web GUI 技术栈一致 |
| 路由 | 轻量 hash 路由（自实现，~40 行） | 静态托管零配置，无需服务端 rewrite |
| 样式 | 手写 CSS（深海/鲸鱼主题） | 无 UI 框架依赖，构建快 |
| 注册表 | 仓库内 JSON + GitHub Actions 同步 | 零成本、可审计、PR 即审核 |
| 测试 | Vitest（schema 校验 + 工具函数单测） | 与 Vite 生态一致 |
| 部署 | Vercel 静态托管 | 免费、自动 HTTPS、与现有项目一致 |
| v2 后端 | Hono + PostgreSQL + GitHub OAuth | 需要账号/评论时再引入 |

---

## 5. 信息架构与页面规划（hash 路由）

```
#/                     ← 首页：英雄区 + 数据统计 + 精选插件 + 分类导航
#/plugins              ← 插件列表页（搜索 + 分类筛选 + 排序）
#/plugin/:slug         ← 插件详情页（含一键安装面板）
#/submit               ← 提交插件指引（GitHub Issue / PR 流程）
#/about                ← 关于本项目
```

---

## 6. MVP 范围（v1.0）

### 必须包含（P0）
- [x] 首页（英雄区、统计、精选、分类导航）
- [x] 插件列表页（搜索、分类筛选、排序、卡片布局）
- [x] 插件详情页（基本信息、一键安装面板、安装指引）
- [x] 一键复制安装命令（Profile 可选）
- [x] 插件提交流程（Issue 模板 + PR 说明）
- [x] 冷启动：awesome 列表种子数据 + GitHub 元数据补充
- [x] 注册表 schema CI 校验
- [x] 每日自动同步（GitHub Actions）

### 可以延后（P1/P2 → v2）
- [ ] GitHub OAuth 登录、收藏、评分评论
- [ ] DSH Web GUI 深度集成（本地检测 + 推送安装）
- [ ] 数据统计看板
- [ ] npm 下载量统计

---

## 7. 成功指标

| 指标 | v1 目标 |
|------|---------|
| 收录插件数量 | ≥ 50 个（冷启动即达成，来自 awesome 精选） |
| 安装命令复制成功率 | 100%（纯前端剪贴板 API，无后端依赖） |
| 注册表数据新鲜度 | ≤ 24 小时（每日 cron 同步） |
| 插件提交 → 上架时效 | < 24 小时（PR 审核制） |
| 月活跃用户 (MAU) | ≥ 200 人 |

---

## 8. 风险与注意事项

| 风险 | 缓解措施 |
|------|----------|
| 恶意插件提交 | PR 人工审核 + 仓库存在性自动校验 + Issue 举报通道 |
| 插件与 DSH 版本不兼容 | 详情页标注数据快照日期；安装指引收录实测坑点；私有仓库明确标注 |
| 元数据不准确 | 每日从 GitHub API 重新拉取，漂移自动修复 |
| awesome 列表格式变化导致解析失败 | 同步脚本失败时保留上一版注册表并在 CI 中报错告警 |
| 剪贴板 API 在非 HTTPS 环境不可用 | 部署强制 HTTPS；提供 textarea fallback |

---

## 9. 附录：参考竞品分析

| 产品 | 特点 | 可借鉴点 |
|------|------|----------|
| **ClawHub** | AI Agent 插件市场，简洁卡片式 UI，一键安装 | 视觉风格、安装引导流程 |
| **VS Code Marketplace** | 成熟的插件市场，丰富的筛选和排序 | 搜索体验、版本管理 |
| **Cursor Extensions** | 面向 AI 编码助手的扩展生态 | 与 IDE 的深度集成方式 |
| **oh-my-dsh** | DSH 插件能力库 | 分类与收录口径 |

---

*文档版本：v0.2 · 已评审修正 · 对应实现见本仓库代码与 README*
