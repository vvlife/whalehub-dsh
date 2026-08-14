#!/usr/bin/env node
/** 把注册表与提交规则复制到 public/，让静态站点暴露 /registry.json 与
 *  /submit-rules.json（工具与第三方可用，如 whalehub-market 插件实时拉取）。 */
import { copyFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
mkdirSync(join(ROOT, 'public'), { recursive: true })
for (const [src, dest] of [
  ['plugins.json', 'registry.json'],
  ['submit-rules.json', 'submit-rules.json'],
]) {
  copyFileSync(join(ROOT, 'registry', src), join(ROOT, 'public', dest))
  console.log(`public/${dest} updated`)
}
