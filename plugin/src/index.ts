/**
 * whalehub-market host half：/whalehub/api JSON 路由。
 *
 * - `registry`：WhaleHub 注册表——优先实时拉取（主站/镜像/raw 多源回退，
 *   5 分钟缓存），网络不可达时回退到打包快照（离线可用）
 * - `submit-rules`：插件提交规则，同样实时拉取 + 快照兜底，供「📮 提交插件」弹窗
 * - `install`：对当前机器执行 `dsh plugin --profile <p> add <target>`
 *   （spawn 参数数组，不经 shell；profile/target 白名单校验）
 * - `installed`：列出某 profile 已安装的包（pnpm ls --depth 0）
 *
 * 所有请求过浏览器信任围栏（Host 头 loopback / trustedHosts），与 /api
 * 网关同级别的 DNS-rebinding / 跨站防御。
 */
import { spawn } from 'node:child_process'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from 'cordis'
import { isValidProfile, isValidTarget } from './install.ts'
import { isTrustedRequest } from './trust-fence.ts'
import { fetchLive, REGISTRY_SOURCES, RULES_SOURCES } from './live.ts'
import registrySnapshot from '../registry/plugins.json' with { type: 'json' }
import rulesSnapshot from '../registry/submit-rules.json' with { type: 'json' }

/** cordis.yml 插件行 id。 */
export const name = 'whalehub-market'

/** 挂载前置服务：webserver 路由。 */
export const inject = ['webServer']

const INSTALL_TIMEOUT_MS = 180_000
const LIST_TIMEOUT_MS = 20_000

function writeJson(res: ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body)
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  res.end(text)
}

function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    req.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > 64 * 1024) {
        reject(new Error('body too large'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      try {
        resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {})
      } catch {
        reject(new Error('invalid JSON body'))
      }
    })
    req.on('error', reject)
  })
}

interface RunResult {
  code: number | null
  output: string
}

/**
 * 解析 dsh CLI 调用方式。
 *
 * dsh web 进程的入口（process.argv[1]）就是 dsh 的 bin.js——用当前 node
 * 直接执行它，在桌面 APP（内置 Node 运行时、PATH 里没有 dsh）场景下也能
 * 调到同一个 dsh；常规全局安装则回退 PATH 里的 dsh。
 * 可用 WHALEHUB_DSH_BIN 显式覆盖。
 */
export function dshInvocation(
  args: string[],
  env: NodeJS.ProcessEnv = process.env,
  argv1: string | null = process.argv[1] ?? null,
  execPath: string = process.execPath,
): { command: string; args: string[] } {
  if (env.WHALEHUB_DSH_BIN) return { command: env.WHALEHUB_DSH_BIN, args }
  if (argv1 && argv1.endsWith('.js') && /dsh/.test(argv1)) {
    return { command: execPath, args: [argv1, ...args] }
  }
  return { command: 'dsh', args }
}

/** 从 dsh web 进程参数解析监听端口（--port，默认 3080）。 */
export function resolveWebPort(argv: string[] = process.argv): number {
  const i = argv.indexOf('--port')
  const v = i >= 0 ? Number(argv[i + 1]) : NaN
  return Number.isInteger(v) && v > 0 ? v : 3080
}

/**
 * 构造自重启引导脚本（由 detached 的 `node -e` 执行）：
 * 轮询直到当前进程退出、端口释放，再以完全相同的参数拉起新的 dsh web。
 * 桌面 APP 场景下 APP 侧是 adopt-first（先探测健康实例再启动），
 * 会直接收养这个自救进程，不会双起；终端独立运行 dsh web 时同样适用。
 * 返回 null 表示无法识别 dsh 入口（此时只能手动重启）。
 */
export function buildRelaunchScript(
  argv: string[] = process.argv,
  execPath: string = process.execPath,
): string | null {
  const argv1 = argv[1]
  if (!argv1 || !argv1.endsWith('.js')) return null
  const dshArgs = [argv1, ...argv.slice(2)]
  const port = resolveWebPort(argv)
  return `const { spawn } = require('node:child_process');
const http = require('node:http');
const cmd = ${JSON.stringify(execPath)};
const args = ${JSON.stringify(dshArgs)};
const port = ${port};
function waitFree() {
  const req = http.get({ host: '127.0.0.1', port, path: '/', timeout: 800 });
  req.on('response', () => { req.destroy(); setTimeout(waitFree, 400); });
  req.on('timeout', () => { req.destroy(); setTimeout(waitFree, 400); });
  req.on('error', () => {
    const child = spawn(cmd, args, { detached: true, stdio: 'ignore', env: process.env });
    child.unref();
  });
}
waitFree();
`
}

/** 应答客户端后自我重启：先派出重生引导进程，再走 SIGTERM 优雅退出。 */
function scheduleSelfRestart(script: string): void {
  const child = spawn(process.execPath, ['-e', script], {
    detached: true,
    stdio: 'ignore',
    env: process.env,
  })
  child.unref()
  // 给 HTTP 响应留出冲刷时间，再让 dsh 自己的 SIGTERM 处理做干净退出
  setTimeout(() => { process.kill(process.pid, 'SIGTERM') }, 600)
}

function runDsh(args: string[], timeoutMs: number): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const invocation = dshInvocation(args)
    let child
    try {
      child = spawn(invocation.command, invocation.args, { env: process.env })
    } catch (error) {
      reject(error)
      return
    }
    let output = ''
    const timer = setTimeout(() => {
      child.kill('SIGTERM')
      reject(new Error(`dsh ${args[0]} 超时（${timeoutMs / 1000}s）`))
    }, timeoutMs)
    child.stdout?.on('data', (d: Buffer) => { output += d.toString() })
    child.stderr?.on('data', (d: Buffer) => { output += d.toString() })
    child.on('error', (error) => {
      clearTimeout(timer)
      reject(new Error(`无法启动 dsh CLI：${error.message}（请确认 dsh 在 PATH 中）`))
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      resolve({ code, output: output.slice(-8000) })
    })
  })
}

async function handle(method: string, payload: Record<string, unknown>): Promise<unknown> {
  if (method === 'registry') {
    const result = await fetchLive({
      cacheKey: 'registry',
      sources: REGISTRY_SOURCES,
      snapshot: registrySnapshot,
      snapshotAt: registrySnapshot.generatedAt,
    })
    return { registry: result.data, source: result.source, fetchedAt: result.fetchedAt, url: result.url }
  }
  if (method === 'submit-rules') {
    const result = await fetchLive({
      cacheKey: 'submit-rules',
      sources: RULES_SOURCES,
      snapshot: rulesSnapshot,
      snapshotAt: registrySnapshot.generatedAt,
    })
    return { rules: result.data, source: result.source, fetchedAt: result.fetchedAt, url: result.url }
  }
  if (method === 'install') {
    const profile = String(payload.profile ?? 'web')
    const target = String(payload.target ?? '')
    if (!isValidProfile(profile)) throw new Error(`非法 profile：${profile}`)
    if (!isValidTarget(target)) throw new Error(`非法安装目标：${target}`)
    const result = await runDsh(['plugin', '--profile', profile, 'add', target], INSTALL_TIMEOUT_MS)
    return {
      ok: result.code === 0,
      code: result.code,
      output: result.output,
      restartHint: result.code === 0 ? '安装完成，重启 dsh web 后生效（界面会提供一键重启，无需命令行）。' : undefined,
    }
  }
  if (method === 'restart') {
    const script = buildRelaunchScript()
    if (!script) {
      throw new Error('当前运行方式不支持自动重启（找不到 dsh 入口）。桌面 APP 可切走再切回 Harness Web 视图完成重启。')
    }
    scheduleSelfRestart(script)
    return { ok: true, restarting: true }
  }
  if (method === 'installed') {
    const profile = String(payload.profile ?? 'web')
    if (!isValidProfile(profile)) throw new Error(`非法 profile：${profile}`)
    const result = await runDsh(['plugin', '--profile', profile, 'ls', '--depth', '0'], LIST_TIMEOUT_MS)
    return { ok: result.code === 0, output: result.output }
  }
  throw new Error(`未知方法：${method}`)
}

export function apply(ctx: Context): void {
  ctx.effect(() => ctx.webServer.register({
    kind: 'prefix',
    path: '/whalehub/api',
    handler: async (req, res) => {
      const request = req as IncomingMessage
      const response = res as ServerResponse
      if (!isTrustedRequest(request.headers)) {
        writeJson(response, 403, { ok: false, error: 'forbidden' })
        return
      }
      if (request.method !== 'POST') {
        writeJson(response, 405, { ok: false, error: 'method not allowed' })
        return
      }
      const pathname = new URL(request.url ?? '/', 'http://dsh.internal').pathname
      const method = pathname.startsWith('/whalehub/api/')
        ? pathname.slice('/whalehub/api/'.length)
        : undefined
      if (method === undefined || method.includes('/')) {
        writeJson(response, 404, { ok: false, error: 'not found' })
        return
      }
      try {
        const payload = await readJsonBody(request)
        writeJson(response, 200, { ok: true, data: await handle(method, payload) })
      } catch (error) {
        writeJson(response, 400, {
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    },
  }), 'whalehub-market: /whalehub/api routes')
}
