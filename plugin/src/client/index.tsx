/**
 * whalehub-market client half：向 Settings → Plugins 区块贡献「插件市场」Tab。
 * 注册方式对齐官方 ui-settings-plugin-inventory 包（settings.plugins.tab
 * root list slot）；bundle 以 window.__ModuleLoader__.load 注册自身。
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import { createElement } from 'react'
import { MarketTab } from './MarketTab.tsx'
import './market.css'

/** 模块 id 由构建横幅注入（window.__ModuleLoader__.load 的 id）。 */
export const inject = ['slots']

export function apply(ctx: ClientContext): void {
  ctx.slots.inject('settings.plugins.tab', () =>
    ctx.slots.register(
      {
        name: 'settings.plugins.tab',
        id: 'whalehub-market',
        order: 20,
        label: () => '🐋 插件市场',
      },
      // 槽位渲染器会把 inject 面与运行时 props 合并后传给组件；
      // 本插件的 Tab 无额外注入依赖，直接用函数组件。
      (props: object) => createElement(MarketTab, props),
    ),
  )
}
