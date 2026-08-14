export type Category =
  | 'web-ui' | 'terminal' | 'vision' | 'tools'
  | 'agent' | 'integrations' | 'ecosystem' | 'fun'

export interface InstallSpec {
  type: 'npm' | 'github' | 'script' | 'manual'
  package?: string
  command?: string
  profiles: string[]
}

export interface PluginEntry {
  slug: string
  name: string
  description: string
  author: string
  repoUrl: string
  category: Category
  tags: string[]
  stars: number
  license: string | null
  updatedAt: string | null
  install: InstallSpec
  notes?: string
  featured?: boolean
  private?: boolean
}

export interface Registry {
  generatedAt: string
  pluginCount: number
  plugins: PluginEntry[]
}

/** host 半 registry/submit-rules 接口的公共返回壳。 */
export interface LivePayload<T> {
  source: 'live' | 'snapshot'
  fetchedAt: string
  url?: string
}

/** 提交规则（与 whalehub-dsh registry/submit-rules.json 同构）。 */
export interface SubmitRules {
  title: string
  intro: string
  methods: {
    name: string
    steps: string[]
    link?: { label: string; url: string }
  }[]
  checklist: string[]
  review: string
  marketUrl: string
}

export const CATEGORIES: Record<Category, string> = {
  'web-ui': '🎨 界面与皮肤',
  terminal: '💻 终端与桌面',
  vision: '👁️ 视觉与多模态',
  tools: '🛠️ 工具与编辑器',
  agent: '🕸️ 编排与工作流',
  integrations: '🔌 集成与桥接',
  ecosystem: '🌐 生态基础',
  fun: '🎈 好玩与杂项',
}

/** 与 web 端一致的安装目标解析。 */
export function resolveTarget(entry: PluginEntry): { kind: 'cli'; target: string } | { kind: 'manual'; command: string } {
  const install = entry.install
  if (install.command) return { kind: 'manual', command: install.command }
  if (install.type === 'npm' && install.package) return { kind: 'cli', target: install.package }
  return { kind: 'cli', target: 'github:' + entry.repoUrl.replace('https://github.com/', '') }
}

export function installCommand(entry: PluginEntry, profile: string): string {
  const resolved = resolveTarget(entry)
  if (resolved.kind === 'manual') return resolved.command
  return `dsh plugin --profile ${profile} add ${resolved.target}`
}
