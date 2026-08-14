/**
 * whalehub-market 平台类型的最小声明（typecheck 用）。
 * 运行时这些模块由 DSH 的模块表/宿主提供，本包不携带其实现。
 */
declare module '*.css' {
  const content: string
  export default content
}

declare module 'cordis' {
  export interface Context {
    effect(fn: () => (() => void) | void, label?: string): void
    webServer: {
      register(route: {
        kind: 'prefix'
        path: string
        handler: (req: unknown, res: unknown) => Promise<void> | void
      }): () => void
    }
    [key: string]: unknown
  }
}

declare module '@deepseek-ai/dsh-client-runtime/client' {
  export interface SlotRegistration {
    name: string
    id: string
    order?: number
    label?: () => string
    locale?: string
    inject?: () => Record<string, unknown>
  }
  export interface ClientContext {
    effect(fn: () => (() => void) | void, label?: string): void
    slots: {
      inject(slot: string, fn: () => unknown): void
      register(reg: SlotRegistration, component: unknown): () => void
    }
    [key: string]: unknown
  }
}
