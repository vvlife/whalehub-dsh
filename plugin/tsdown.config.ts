/**
 * whalehub-market 构建（对齐 dsh-better-sidebar 的官方 client bundle 预设，
 * 大幅简化版）：
 *
 * - lib/index.js：host 半（ESM, node），registry JSON 内联
 * - lib/client.js / lib/client-registry.js：browser 半（CJS 闭包工厂），
 *   分别以官方渠道 id（包名）与注册表渠道 id（dsh.plugin.json 的 id）注册
 *   window.__ModuleLoader__.load({ id, factory })
 * - externals 走模块表（react/cordis/ui-slots/client-runtime），其余内联
 * - 纯度门：禁止把 node builtin / 非白名单 @deepseek-ai/* 值导入打进浏览器包
 * - CSS 以 <style data-plugin> 注入
 */
import { readFile } from 'node:fs/promises'
import { builtinModules } from 'node:module'
import { basename, dirname, resolve as resolvePath } from 'node:path'
import type { UserConfig } from 'tsdown'

const NODE_BUILTINS = new Set([...builtinModules, ...builtinModules.map((id) => `node:${id}`)])

/** web shell 共享进冻结模块表的 specifier（官方 PLATFORM_MODULES + runtime/client 豁免）。 */
const CLIENT_EXTERNALS = [
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  'cordis',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-web-react',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-schema-form',
  '@deepseek-ai/dsh-client-runtime/client',
]

function purityGate() {
  return {
    name: 'whalehub-client-purity',
    resolveId(source: string) {
      if (NODE_BUILTINS.has(source)) {
        throw new Error(`client purity: node builtin "${source}" 不能进入浏览器模块表`)
      }
      if (source.startsWith('@deepseek-ai/') && !CLIENT_EXTERNALS.includes(source)) {
        throw new Error(`client purity: "${source}" 不是平台模块，跨插件值导入被禁止`)
      }
      return null
    },
  }
}

function cssPlugin(pluginId: string) {
  const PREFIX = '\0whalehub-css:'
  return {
    name: 'whalehub-css-inline',
    resolveId(source: string, importer: string | undefined) {
      if (!source.endsWith('.css')) return null
      return PREFIX + (importer ? resolvePath(dirname(importer), source) : source) + '.mjs'
    },
    async load(id: string) {
      if (!id.startsWith(PREFIX) || !id.endsWith('.mjs')) return null
      const file = id.slice(PREFIX.length, -'.mjs'.length)
      const css = await readFile(file, 'utf8')
      const tagId = `${pluginId}/${basename(file)}`
      return [
        `const css = ${JSON.stringify(css)};`,
        `if (typeof document !== 'undefined' && !document.querySelector('style[data-plugin-css=${JSON.stringify(tagId)}]')) {`,
        `  const tag = document.createElement('style');`,
        `  tag.dataset.pluginCss = ${JSON.stringify(tagId)};`,
        `  tag.textContent = css;`,
        `  document.head.appendChild(tag);`,
        `}`,
        `export default "";`,
      ].join('\n')
    },
  }
}

function clientBundle(pluginId: string, entryFile: string): UserConfig {
  return {
    entry: { client: 'src/client/index.tsx' },
    outDir: 'lib',
    format: 'cjs',
    platform: 'browser',
    dts: false,
    sourcemap: false,
    clean: false,
    external: [...CLIENT_EXTERNALS],
    define: {
      'process.env.NODE_ENV': JSON.stringify('production'),
    },
    noExternal: (id: string) => (CLIENT_EXTERNALS.includes(id) ? undefined : true),
    plugins: [purityGate(), cssPlugin(pluginId)],
    outputOptions: {
      entryFileNames: entryFile,
      banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(pluginId)}, factory: (require) => {`,
      footer: `return module.exports; } });`,
      intro: 'var module = { exports: {} }; var exports = module.exports;',
      codeSplitting: false,
    },
  }
}

export default [
  {
    entry: { index: 'src/index.ts' },
    outDir: 'lib',
    format: ['esm'],
    platform: 'node',
    target: 'es2022',
    fixedExtension: false,
    dts: false,
    clean: true,
  },
  // 官方 profile 渠道：bundle id = 包名
  clientBundle('whalehub-market', 'client.js'),
  // 注册表渠道（dsh.plugin.json）：bundle id = manifest id
  clientBundle('vvlife/whalehub-market', 'client-registry.js'),
] satisfies UserConfig[]
