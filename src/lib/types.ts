export type Category =
  | 'web-ui'
  | 'terminal'
  | 'vision'
  | 'tools'
  | 'agent'
  | 'integrations'
  | 'ecosystem'
  | 'fun'

export interface InstallSpec {
  type: 'npm' | 'github' | 'script' | 'manual'
  package?: string
  command?: string
  profiles: string[]
}

export interface PluginEntry {
  slug: string
  name: string
  displayName: string
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
  source: string
  pluginCount: number
  plugins: PluginEntry[]
}

export const CATEGORIES: Record<Category, { label: string; zh: string; icon: string }> = {
  'web-ui': { label: 'Web UI & Skins', zh: '界面与皮肤', icon: '🎨' },
  terminal: { label: 'Terminal & Desktop', zh: '终端与桌面', icon: '💻' },
  vision: { label: 'Vision & Multimodal', zh: '视觉与多模态', icon: '👁️' },
  tools: { label: 'Tools & Editor UX', zh: '工具与编辑器', icon: '🛠️' },
  agent: { label: 'Agent & Workflow', zh: '编排与工作流', icon: '🕸️' },
  integrations: { label: 'Integrations & Bridges', zh: '集成与桥接', icon: '🔌' },
  ecosystem: { label: 'Ecosystem', zh: '生态基础', icon: '🌐' },
  fun: { label: 'Fun & Misc', zh: '好玩与杂项', icon: '🎈' },
}

export const CATEGORY_KEYS = Object.keys(CATEGORIES) as Category[]
