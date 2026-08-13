# 🐋 WhaleHub 上线：DeepSeek Harness 终于有了插件市场

**一句话：打开一个网站，搜索插件，复制一条命令，粘贴，重启 —— DSH 插件安装从此不用再翻仓库。**

👉 在线体验：https://whalehub-dsh.vercel.app
👉 源码：https://github.com/vvlife/whalehub-dsh

---

## 痛点

DeepSeek Harness（DSH）发布开发者预览才一天，社区就炸了：皮肤包、Claude Code 风 TUI、视觉工具箱、多 Agent 工作流……"Everything is a Plugin" 不是口号，是现实。

但问题来了：**插件散在上百个仓库里**。

- 想找插件？得先知道 awesome 列表，再一个个点仓库
- 想装插件？每个仓库 README 写法都不一样，npm 包名、`github:` 形式、私有仓库授权……全靠自己翻
- 想确认装上了？还得自己记得 `--dump-config` 这条命令

## 解法：WhaleHub

![WhaleHub 首页](docs/screenshots/01-home.png)

打开首页，66 个精选插件按 8 个分类排好（界面皮肤 / 终端桌面 / 视觉多模态 / 工具编辑器 / 编排工作流 / 集成桥接 / 生态基础 / 好玩杂项），数据每日自动从 awesome 列表和 GitHub API 同步，stars、更新时间都是新鲜的。

### 🔍 搜索、筛选、排序

![搜索](docs/screenshots/03-search.png)

名称、描述、作者、标签随便搜；按热度、更新时间、名称排序。比如搜 "vision"，立刻列出所有让纯文本模型"看图"的插件。

### ⚡ 一键安装（核心）

![一键安装面板](docs/screenshots/04-detail-install.png)

点进任意插件详情页：

1. **选 Profile**（web / headless / cc-tui…），命令实时跟着变
2. **点"一键复制"**，粘贴进终端：`dsh plugin --profile web add dsh-better-sidebar@0.10.2`
3. 顺手复制校验命令 `dsh --profile web --dump-config` 确认挂载
4. 习惯手写配置的直接拿 `cordis.yml` 片段

![复制成功反馈](docs/screenshots/05-copy-feedback.png)

更贴心的是**安装须知**：哪些插件要 `pnpm approve-builds --all`、哪些是私有仓库需要权限、哪些装完要硬刷新——这些来自实测笔记的坑点，直接写在安装面板里，不用装完才发现踩坑。

### 📮 插件作者 1 分钟上架

![提交插件](docs/screenshots/06-submit.png)

不用注册、不用后端账号：填一个 GitHub Issue 表单（仓库地址 + 分类 + 一句话描述），审核通过后次日自动同步上线。着急的话直接 PR 改 `registry/plugins.json`，CI 自动校验 schema。

## 技术上有意思的地方

**零后端架构**。没有数据库、没有服务器、没有账号系统：

- 注册表就是仓库里的一个 JSON 文件，Git 历史天然是审计日志
- GitHub Actions 每日 cron 跑同步脚本：解析 awesome 列表 → GitHub API 补充元数据 → 自动提交
- 前端 React + Vite 纯静态 SPA，部署在 Vercel，免费且全球 HTTPS

这也意味着**任何人都能 fork 一份跑自己的插件市场**。

## 接下来

- DSH Web GUI 深度集成：检测到本地 `dsh web` 在跑，直接把安装命令推送过去，复制都不用
- GitHub 登录、收藏、评分评论（v2，届时引入后端）
- npm 下载量统计与趋势看板

---

 whale 已就位，插件市场开门营业。🐋

*WhaleHub 是社区项目，与 DeepSeek 官方无隶属关系。*
