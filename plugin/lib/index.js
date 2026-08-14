import { spawn } from "node:child_process";
//#region src/install.ts
/** 安装目标与 profile 的校验 + dsh CLI 参数构造（纯函数，便于测试）。 */
const PROFILE_RE = /^[\w][\w-]{0,39}$/;
/** npm 包名（可带 scope 与版本）：[@scope/]name[@version] */
const NPM_RE = /^(@[\w.-]+\/)?[\w.-]+(@[\w.^~*-][\w.^~*.-]*)?$/;
/** github:owner/repo[#ref][&path:/dir] */
const GITHUB_RE = /^github:[\w.-]+\/[\w.-]+(#[\w./-]+)?(&path:[\w./-]+)?$/;
function isValidProfile(profile) {
	return PROFILE_RE.test(profile);
}
function isValidTarget(target) {
	return NPM_RE.test(target) || GITHUB_RE.test(target);
}
//#endregion
//#region src/trust-fence.ts
function isLoopbackHostname(hostname) {
	if (hostname === "localhost" || hostname === "[::1]" || hostname === "::1") return true;
	const parts = hostname.split(".");
	return parts.length === 4 && parts[0] === "127" && parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255);
}
/** 判断请求是否允许触达插件路由。 */
function isTrustedRequest(headers, trustedHosts = []) {
	const fetchSite = headers["sec-fetch-site"];
	if (typeof fetchSite === "string" && fetchSite !== "same-origin" && fetchSite !== "none") return false;
	const host = headers.host;
	if (typeof host !== "string" || host === "") return false;
	let url;
	try {
		url = new URL(`http://${host}`);
	} catch {
		return false;
	}
	if (isLoopbackHostname(url.hostname)) return true;
	return trustedHosts.some((entry) => {
		try {
			return new URL(`http://${entry}`).hostname === url.hostname;
		} catch {
			return false;
		}
	});
}
//#endregion
//#region src/live.ts
const CACHE_TTL_MS = 3e5;
/** 实时源全挂时快照结果的缓存时长（比 live 短，网络恢复后更快回切实时）。 */
const SNAPSHOT_CACHE_TTL_MS = 6e4;
const FETCH_TIMEOUT_MS = 6e3;
/** 注册表实时源（/registry.json 与 main 分支 plugins.json 同构）。 */
const REGISTRY_SOURCES = [
	"https://whalehub-dsh.vercel.app/registry.json",
	"https://vvlife.github.io/whalehub-dsh/registry.json",
	"https://raw.githubusercontent.com/vvlife/whalehub-dsh/main/registry/plugins.json"
];
/** 提交规则实时源（/submit-rules.json 与 main 分支 submit-rules.json 同构）。 */
const RULES_SOURCES = [
	"https://whalehub-dsh.vercel.app/submit-rules.json",
	"https://vvlife.github.io/whalehub-dsh/submit-rules.json",
	"https://raw.githubusercontent.com/vvlife/whalehub-dsh/main/registry/submit-rules.json"
];
const cache = /* @__PURE__ */ new Map();
async function fetchJson(fetchImpl, url, timeoutMs) {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeoutMs);
	try {
		const res = await fetchImpl(url, { signal: controller.signal });
		if (!res.ok) throw new Error(`HTTP ${url} → ${res.ok}`);
		return await res.json();
	} finally {
		clearTimeout(timer);
	}
}
/**
* 各实时源并行竞速（Promise.any），最快成功的胜出；全部失败时返回
* snapshot 兜底结果。成功结果缓存 CACHE_TTL_MS，避免每次展开 Tab 都打外网。
* 并行是为了让「源挂到超时」与「源 404」不再串行叠加等待。
*/
async function fetchLive(options) {
	const { cacheKey, sources, snapshot, snapshotAt } = options;
	const fetchImpl = options.fetchImpl ?? globalThis.fetch;
	const now = options.now ?? Date.now;
	const hit = cache.get(cacheKey);
	if (hit && hit.expiresAt > now()) return hit.result;
	try {
		const { data, url } = await promiseAny(sources.map((url) => fetchJson(fetchImpl, url, FETCH_TIMEOUT_MS).then((data) => ({
			data,
			url
		}))));
		const result = {
			data,
			source: "live",
			fetchedAt: (/* @__PURE__ */ new Date()).toISOString(),
			url
		};
		cache.set(cacheKey, {
			result,
			expiresAt: now() + CACHE_TTL_MS
		});
		return result;
	} catch {
		const result = {
			data: snapshot,
			source: "snapshot",
			fetchedAt: snapshotAt
		};
		cache.set(cacheKey, {
			result,
			expiresAt: now() + SNAPSHOT_CACHE_TTL_MS
		});
		return result;
	}
}
/** Promise.any 的简版：全部 reject 时抛错（ Promise.any 的 AggregateError 不需要）。 */
function promiseAny(promises) {
	return new Promise((resolve, reject) => {
		let pending = promises.length;
		if (pending === 0) reject(/* @__PURE__ */ new Error("no sources"));
		for (const p of promises) p.then(resolve, () => {
			if (--pending === 0) reject(/* @__PURE__ */ new Error("all sources failed"));
		});
	});
}
//#endregion
//#region registry/plugins.json
var plugins_default = {
	$schema: "./schema.json",
	generatedAt: "2026-08-13T18:18:23.438Z",
	source: "https://raw.githubusercontent.com/vvlife/awesome-deepseek-harness-plugins/main/README.md",
	pluginCount: 66,
	plugins: [
		{
			"slug": "zhu1090093659-dsh-web-ui",
			"name": "dsh-web-ui",
			"displayName": "web ui",
			"description": "Plugin & skin collection for the DSH Web UI: task board, git graph, right-side panel, remote mobile UI, pet, live token stats, skin center.",
			"author": "zhu1090093659",
			"repoUrl": "https://github.com/zhu1090093659/dsh-web-ui",
			"category": "web-ui",
			"tags": [
				"skin",
				"task-board",
				"mobile",
				"ssh",
				"sidebar"
			],
			"stars": 357,
			"license": null,
			"updatedAt": "2026-08-13T15:20:42Z",
			"install": {
				"type": "npm",
				"package": "@linxin666/dsh-web-ui-all",
				"profiles": ["web"]
			},
			"notes": "皮肤-only 可装 @linxin666/dsh-skins。装完重启 dsh web。若报 ERR_PNPM_IGNORED_BUILDS，把 cloudflared/ssh2 加入 profile 的 pnpm-workspace.yaml 的 allowBuilds 后重跑；用 dsh --profile web --dump-config 验证。",
			"featured": true
		},
		{
			"slug": "ccch1mneyyy-dsh-cc-tui",
			"name": "dsh-cc-tui",
			"displayName": "cc tui",
			"description": "Claude Code-style full-screen TUI: pixel-whale top bar, live status row, streaming thoughts, double-Esc rollback, context bar + TPS meter. One-line npm install.",
			"author": "ccch1mneyyy",
			"repoUrl": "https://github.com/ccch1mneyyy/dsh-cc-tui",
			"category": "terminal",
			"tags": [
				"tui",
				"claude-code",
				"terminal",
				"skin"
			],
			"stars": 122,
			"license": "BSD-3-Clause",
			"updatedAt": "2026-08-13T16:10:47Z",
			"install": {
				"type": "npm",
				"package": "dsh-cc-tui",
				"profiles": ["cc-tui"]
			},
			"notes": "会自动初始化 cc-tui profile，装完用 dsh --profile cc-tui 启动；也可用仓库根目录 install.sh（Windows 用 dsh-cc.cmd）。纯插件挂载，卸载即完全还原。",
			"featured": true
		},
		{
			"slug": "anionex-dsh-vision-toolkit",
			"name": "dsh-vision-toolkit",
			"displayName": "vision toolkit",
			"description": "Vision toolkit for text-only models: intent-aware image Q&A, long-screenshot OCR, UI restoration, grounding, pixel diff, Artifacts, Web UI.",
			"author": "Anionex",
			"repoUrl": "https://github.com/Anionex/dsh-vision-toolkit",
			"category": "vision",
			"tags": [
				"vision",
				"ocr",
				"multimodal"
			],
			"stars": 122,
			"license": "MIT",
			"updatedAt": "2026-08-13T15:18:28Z",
			"install": {
				"type": "manual",
				"profiles": ["web", "headless"],
				"command": "git clone https://github.com/dsh-external/dsh-vision-toolkit.git && dsh plugin --profile web add \"$PWD/dsh-vision-toolkit\""
			},
			"notes": "当前为 dsh-external 私有 release，需读取权限。Web 和 Headless profile 各装一次；远程识别需在 Settings → Vision Toolkit 配置 OpenAI 兼容视觉端点 Credential，本地裁剪/trace/像素差不需要视觉 API。",
			"featured": true,
			"private": true
		},
		{
			"slug": "omdsh-dev-dsh-better-sidebar",
			"name": "DSH-better-sidebar",
			"displayName": "DSH better sidebar",
			"description": "Full workbench sidebar with third-party tab registration: file render/edit, terminal, Git, subagent.",
			"author": "omdsh-dev",
			"repoUrl": "https://github.com/omdsh-dev/DSH-better-sidebar",
			"category": "ecosystem",
			"tags": [
				"sidebar",
				"terminal",
				"git",
				"editor",
				"tui"
			],
			"stars": 78,
			"license": "MIT",
			"updatedAt": "2026-08-13T16:12:27Z",
			"install": {
				"type": "npm",
				"package": "dsh-better-sidebar@0.10.2",
				"profiles": ["web"]
			},
			"notes": "装完重启 DSH 并硬刷新（Cmd/Ctrl+Shift+R）。pnpm 11 若拦截 node-pty 构建，先 pnpm approve-builds --all。也可用仓库 scripts/install.sh 一键脚本。",
			"featured": true
		},
		{
			"slug": "small-tailqwq-dsh-deep-whale",
			"name": "dsh-deep-whale",
			"displayName": "deep whale",
			"description": "\"Whale-girl\" skin series (maid-atelier), CC BY-NC-SA 4.0.",
			"author": "Small-tailqwq",
			"repoUrl": "https://github.com/Small-tailqwq/dsh-deep-whale",
			"category": "web-ui",
			"tags": ["skin"],
			"stars": 73,
			"license": null,
			"updatedAt": "2026-08-13T14:32:37Z",
			"install": {
				"type": "github",
				"profiles": ["web"]
			},
			"notes": "CC BY-NC-SA 4.0 许可，注意非商业限制。"
		},
		{
			"slug": "nagi-ovo-dsh-ads",
			"name": "dsh-ads",
			"displayName": "ads",
			"description": "Tongue-in-cheek 2005-style Chinese-site ads in the sidebar / chat feed / popups.",
			"author": "Nagi-ovo",
			"repoUrl": "https://github.com/Nagi-ovo/dsh-ads",
			"category": "web-ui",
			"tags": ["sidebar"],
			"stars": 72,
			"license": null,
			"updatedAt": "2026-08-13T14:29:38Z",
			"install": {
				"type": "github",
				"profiles": ["web"]
			}
		},
		{
			"slug": "huiliyi37-dsh-tianshu-tui",
			"name": "dsh-tianshu-tui",
			"displayName": "tianshu tui",
			"description": "DSH terminal UI.",
			"author": "huiliyi37",
			"repoUrl": "https://github.com/huiliyi37/dsh-tianshu-tui",
			"category": "terminal",
			"tags": ["tui"],
			"stars": 59,
			"license": "Apache-2.0",
			"updatedAt": "2026-08-13T15:12:41Z",
			"install": {
				"type": "github",
				"profiles": ["web"]
			}
		},
		{
			"slug": "hust-open-atom-club-oh-dsh-desktop",
			"name": "oh-dsh-desktop",
			"displayName": "oh dsh desktop",
			"description": "Extensible macOS workbench: native PTY, workspace tools, live bilingual plugins, isolated-preview plugin marketplace.",
			"author": "hust-open-atom-club",
			"repoUrl": "https://github.com/hust-open-atom-club/oh-dsh-desktop",
			"category": "terminal",
			"tags": [
				"desktop",
				"macos",
				"sidebar"
			],
			"stars": 54,
			"license": "BSD-3-Clause",
			"updatedAt": "2026-08-13T15:23:06Z",
			"install": {
				"type": "github",
				"profiles": ["web"]
			}
		},
		{
			"slug": "nanmicoder-dsh-agent-teams",
			"name": "dsh-agent-teams",
			"displayName": "agent teams",
			"description": "AgentTeams plugin for DSH.",
			"author": "NanmiCoder",
			"repoUrl": "https://github.com/NanmiCoder/dsh-agent-teams",
			"category": "agent",
			"tags": ["multi-agent", "teams"],
			"stars": 42,
			"license": null,
			"updatedAt": "2026-08-13T14:39:24Z",
			"install": {
				"type": "github",
				"profiles": ["web"]
			},
			"notes": "多 Agent 团队协作插件；同类主题另见 dsh_workflow（可治理 Workflow 层）。安装到 web profile 后重启生效。",
			"featured": true
		},
		{
			"slug": "btspoony-mstar-harness",
			"name": "mstar-harness",
			"displayName": "mstar harness",
			"description": "Skill-driven Harness / Loop Engineering Workflow Agent Plugin.",
			"author": "btspoony",
			"repoUrl": "https://github.com/btspoony/mstar-harness",
			"category": "agent",
			"tags": ["workflow"],
			"stars": 38,
			"license": "MIT",
			"updatedAt": "2026-08-13T13:35:48Z",
			"install": {
				"type": "github",
				"profiles": ["web"]
			}
		},
		{
			"slug": "icetomoyo-dsh-workflow",
			"name": "dsh_workflow",
			"displayName": "dsh_workflow",
			"description": "Brings Claude Code's UltraCode to DSH; turns one-shot multi-agent dispatch into a generatable / savable / governable / observable / recoverable Workflow layer.",
			"author": "icetomoyo",
			"repoUrl": "https://github.com/icetomoyo/dsh_workflow",
			"category": "agent",
			"tags": [
				"workflow",
				"multi-agent",
				"governance"
			],
			"stars": 30,
			"license": "MIT",
			"updatedAt": "2026-08-13T14:54:56Z",
			"install": {
				"type": "github",
				"profiles": ["web"]
			},
			"notes": "私有仓库（dsh-external），github: 安装需读取权限；需 Node >=22.19。装完用 dsh --profile web --dump-config 验证出现 dsh-external-workflow 后重启。/workflow create 不接受 --wait。",
			"featured": true,
			"private": true
		},
		{
			"slug": "omdsh-dev-dsh-open-in-vscode",
			"name": "dsh-open-in-vscode",
			"displayName": "open in vscode",
			"description": "Open workspace directories in VS Code directly from the web GUI.",
			"author": "omdsh-dev",
			"repoUrl": "https://github.com/omdsh-dev/dsh-open-in-vscode",
			"category": "integrations",
			"tags": ["vscode", "editor"],
			"stars": 30,
			"license": "MIT",
			"updatedAt": "2026-08-13T15:28:56Z",
			"install": {
				"type": "github",
				"profiles": ["web"]
			}
		},
		{
			"slug": "dekrych-dshell-plugins",
			"name": "Dshell-plugins",
			"displayName": "Dshell plugins",
			"description": "Dshell plugin collection.",
			"author": "DeKrych",
			"repoUrl": "https://github.com/DeKrych/Dshell-plugins",
			"category": "ecosystem",
			"tags": [],
			"stars": 27,
			"license": "MIT",
			"updatedAt": "2016-06-20T15:24:29Z",
			"install": {
				"type": "github",
				"profiles": ["web"]
			}
		},
		{
			"slug": "zseven-w-dsh-openpencil",
			"name": "dsh-openpencil",
			"displayName": "openpencil",
			"description": "OpenPencil design preview & editing plugin.",
			"author": "ZSeven-W",
			"repoUrl": "https://github.com/ZSeven-W/dsh-openpencil",
			"category": "web-ui",
			"tags": [],
			"stars": 22,
			"license": "MIT",
			"updatedAt": "2026-08-13T14:54:25Z",
			"install": {
				"type": "github",
				"profiles": ["web"]
			}
		},
		{
			"slug": "omdsh-dev-dsh-at-file",
			"name": "dsh-at-file",
			"displayName": "at file",
			"description": "Codex-style `@file` mentions: search workspace files in the composer and attach their contents to prompts.",
			"author": "omdsh-dev",
			"repoUrl": "https://github.com/omdsh-dev/dsh-at-file",
			"category": "tools",
			"tags": ["editor", "mentions"],
			"stars": 22,
			"license": "MIT",
			"updatedAt": "2026-08-13T14:12:44Z",
			"install": {
				"type": "github",
				"profiles": ["web"]
			}
		},
		{
			"slug": "omdsh-dev-dsh-notification",
			"name": "dsh-notification",
			"displayName": "notification",
			"description": "Desktop notifications for turn completions, with per-outcome controls and include/exclude keyword rules.",
			"author": "omdsh-dev",
			"repoUrl": "https://github.com/omdsh-dev/dsh-notification",
			"category": "integrations",
			"tags": ["notification", "desktop"],
			"stars": 20,
			"license": "MIT",
			"updatedAt": "2026-08-13T15:28:50Z",
			"install": {
				"type": "github",
				"profiles": ["web"]
			}
		},
		{
			"slug": "alingalingling-ui-status-label",
			"name": "ui-status-label",
			"displayName": "ui status label",
			"description": "Customize the \"deep diving\" thinking-status label however you like.",
			"author": "alingalingling",
			"repoUrl": "https://github.com/alingalingling/ui-status-label",
			"category": "web-ui",
			"tags": [],
			"stars": 19,
			"license": null,
			"updatedAt": "2026-08-13T15:11:24Z",
			"install": {
				"type": "github",
				"profiles": ["web"]
			}
		},
		{
			"slug": "hanelalo-browser-bridge",
			"name": "browser-bridge",
			"displayName": "browser bridge",
			"description": "Let your agent drive your real browser window like you would.",
			"author": "hanelalo",
			"repoUrl": "https://github.com/hanelalo/browser-bridge",
			"category": "terminal",
			"tags": [
				"browser",
				"automation",
				"bridge"
			],
			"stars": 19,
			"license": null,
			"updatedAt": "2026-08-10T13:37:41Z",
			"install": {
				"type": "github",
				"profiles": ["web"]
			}
		},
		{
			"slug": "nagi-ovo-dsh-find-plugins",
			"name": "dsh-find-plugins",
			"displayName": "find plugins",
			"description": "In-app plugin finder.",
			"author": "Nagi-ovo",
			"repoUrl": "https://github.com/Nagi-ovo/dsh-find-plugins",
			"category": "integrations",
			"tags": ["plugin-finder"],
			"stars": 19,
			"license": null,
			"updatedAt": "2026-08-13T14:29:38Z",
			"install": {
				"type": "github",
				"profiles": ["web"]
			}
		},
		{
			"slug": "lum1104-dsh-browser",
			"name": "dsh-browser",
			"displayName": "browser",
			"description": "Chrome sidebar extension so DSH operates your browser directly, no vision needed.",
			"author": "Lum1104",
			"repoUrl": "https://github.com/Lum1104/dsh-browser",
			"category": "terminal",
			"tags": [
				"browser",
				"chrome",
				"vision",
				"sidebar"
			],
			"stars": 18,
			"license": "BSD-3-Clause",
			"updatedAt": "2026-08-13T14:03:40Z",
			"install": {
				"type": "github",
				"profiles": ["web"]
			}
		},
		{
			"slug": "omdsh-dev-dsh-custom-tool",
			"name": "dsh-custom-tool",
			"displayName": "custom tool",
			"description": "Create & manage sandboxed JavaScript tools with a Monaco editor and model-driven tool lifecycle.",
			"author": "omdsh-dev",
			"repoUrl": "https://github.com/omdsh-dev/dsh-custom-tool",
			"category": "tools",
			"tags": [
				"tools",
				"monaco",
				"sandbox",
				"editor"
			],
			"stars": 17,
			"license": "MIT",
			"updatedAt": "2026-08-13T15:11:37Z",
			"install": {
				"type": "github",
				"profiles": ["web"]
			}
		},
		{
			"slug": "anionex-dsh-turn-rewind",
			"name": "dsh-turn-rewind",
			"displayName": "turn rewind",
			"description": "Rewind conversation + workspace state via a persistent Change Ledger.",
			"author": "Anionex",
			"repoUrl": "https://github.com/Anionex/dsh-turn-rewind",
			"category": "tools",
			"tags": ["rewind", "checkpoint"],
			"stars": 17,
			"license": "BSD-3-Clause",
			"updatedAt": "2026-08-13T12:37:02Z",
			"install": {
				"type": "github",
				"profiles": ["web"]
			}
		},
		{
			"slug": "laplaceyoung-oh-my-dsh",
			"name": "oh-my-dsh",
			"displayName": "oh my dsh",
			"description": "Plugin ecosystem: 700+ plugins wired only through extension seams, no agent-loop changes.",
			"author": "LaplaceYoung",
			"repoUrl": "https://github.com/LaplaceYoung/oh-my-dsh",
			"category": "ecosystem",
			"tags": ["capability-library", "seams"],
			"stars": 17,
			"license": null,
			"updatedAt": "2026-08-13T13:04:56Z",
			"install": {
				"type": "manual",
				"profiles": ["web"],
				"command": "git clone https://github.com/LaplaceYoung/oh-my-dsh.git && cd oh-my-dsh && pnpm install && pnpm test"
			},
			"notes": "这是插件源码库/能力库（687 个插件按 plugins/<gap-id>/ 组织），不是一条命令装全家桶；按需挑选单个插件安装。e2e 需要 DEEPSEEK_API_KEY。",
			"featured": true
		},
		{
			"slug": "nagi-ovo-dsh-visualize",
			"name": "dsh-visualize",
			"displayName": "visualize",
			"description": "Generative UI: the model draws interactive HTML cards straight into the chat stream.",
			"author": "Nagi-ovo",
			"repoUrl": "https://github.com/Nagi-ovo/dsh-visualize",
			"category": "web-ui",
			"tags": ["genui", "generative-ui"],
			"stars": 16,
			"license": null,
			"updatedAt": "2026-08-13T14:29:38Z",
			"install": {
				"type": "github",
				"profiles": ["web"]
			}
		},
		{
			"slug": "vlln-whale-girl",
			"name": "whale-girl",
			"displayName": "whale girl",
			"description": "Desktop-pet plugin (QQ-pet style): draggable, feedable, accumulative companion.",
			"author": "vlln",
			"repoUrl": "https://github.com/vlln/whale-girl",
			"category": "web-ui",
			"tags": ["skin", "desktop"],
			"stars": 14,
			"license": "MIT",
			"updatedAt": "2026-08-13T14:22:20Z",
			"install": {
				"type": "github",
				"profiles": ["web"]
			}
		},
		{
			"slug": "omdsh-dev-dsh-genui",
			"name": "dsh-genui",
			"displayName": "genui",
			"description": "GenUI: interactive components (layout, charts, mermaid, 3D) rendered inline via the `dsh-ui` fence.",
			"author": "omdsh-dev",
			"repoUrl": "https://github.com/omdsh-dev/dsh-genui",
			"category": "web-ui",
			"tags": [
				"genui",
				"charts",
				"mermaid"
			],
			"stars": 11,
			"license": "MIT",
			"updatedAt": "2026-08-13T15:22:57Z",
			"install": {
				"type": "github",
				"profiles": ["web"]
			},
			"notes": "通过 `dsh-ui` 代码围栏在会话里内联渲染布局、图表、mermaid 与 3D 组件；安装到 web profile 后重启 dsh web 生效。",
			"featured": true
		},
		{
			"slug": "ruler4396-dsh-launcher",
			"name": "dsh-launcher",
			"displayName": "launcher",
			"description": "Lightweight Windows launcher: silent logon autostart + a minimal WebView2 window instead of a full browser.",
			"author": "Ruler4396",
			"repoUrl": "https://github.com/Ruler4396/dsh-launcher",
			"category": "terminal",
			"tags": [
				"windows",
				"launcher",
				"desktop"
			],
			"stars": 11,
			"license": "MIT",
			"updatedAt": "2026-08-13T16:09:48Z",
			"install": {
				"type": "github",
				"profiles": ["web"]
			}
		},
		{
			"slug": "loserfox-distill",
			"name": "distill",
			"displayName": "distill",
			"description": "Automatic conversation distillation: background subagent reflection + skill create/update.",
			"author": "LoserFox",
			"repoUrl": "https://github.com/LoserFox/distill",
			"category": "agent",
			"tags": [],
			"stars": 11,
			"license": null,
			"updatedAt": "2026-08-13T13:11:31Z",
			"install": {
				"type": "github",
				"profiles": ["web"]
			}
		},
		{
			"slug": "senmuuuuw-dsh-group-photo",
			"name": "dsh-group-photo",
			"displayName": "group photo",
			"description": "Internal-test group-photo wall (GitHub OAuth, frozen allowlist).",
			"author": "SenmuuuuW",
			"repoUrl": "https://github.com/SenmuuuuW/dsh-group-photo",
			"category": "fun",
			"tags": [],
			"stars": 11,
			"license": "MIT",
			"updatedAt": "2026-08-13T12:33:47Z",
			"install": {
				"type": "github",
				"profiles": ["web"]
			}
		},
		{
			"slug": "zhouwumu2-lab-dsh-vision-fix",
			"name": "dsh-vision-fix",
			"displayName": "vision fix",
			"description": "Vision fix / repair helper.",
			"author": "zhouwumu2-lab",
			"repoUrl": "https://github.com/zhouwumu2-lab/dsh-vision-fix",
			"category": "vision",
			"tags": ["vision"],
			"stars": 10,
			"license": "BSD-3-Clause",
			"updatedAt": "2026-08-11T17:22:26Z",
			"install": {
				"type": "github",
				"profiles": ["web"]
			}
		},
		{
			"slug": "omdsh-dev-dsh-annotation",
			"name": "dsh-annotation",
			"displayName": "annotation",
			"description": "Select text → annotate → send as a message; bubble-hidden annotation blocks.",
			"author": "omdsh-dev",
			"repoUrl": "https://github.com/omdsh-dev/dsh-annotation",
			"category": "web-ui",
			"tags": [],
			"stars": 9,
			"license": "MIT",
			"updatedAt": "2026-08-13T15:09:15Z",
			"install": {
				"type": "github",
				"profiles": ["web"]
			}
		},
		{
			"slug": "moeblack-dsh-message-edit",
			"name": "dsh-message-edit",
			"displayName": "message edit",
			"description": "Branch-based message editing, reroll, retry, version timeline.",
			"author": "Moeblack",
			"repoUrl": "https://github.com/Moeblack/dsh-message-edit",
			"category": "tools",
			"tags": ["editing", "branch"],
			"stars": 9,
			"license": null,
			"updatedAt": "2026-08-13T10:21:06Z",
			"install": {
				"type": "github",
				"profiles": ["web"]
			}
		},
		{
			"slug": "vlln-plugin-registry",
			"name": "plugin-registry",
			"displayName": "plugin registry",
			"description": "Plugin registry.",
			"author": "vlln",
			"repoUrl": "https://github.com/vlln/plugin-registry",
			"category": "ecosystem",
			"tags": [],
			"stars": 9,
			"license": "MIT",
			"updatedAt": "2026-08-13T14:22:05Z",
			"install": {
				"type": "github",
				"profiles": ["web"]
			}
		},
		{
			"slug": "anionex-dsh-computer-use",
			"name": "dsh-computer-use",
			"displayName": "computer use",
			"description": "Computer-use plugin for DSH.",
			"author": "Anionex",
			"repoUrl": "https://github.com/Anionex/dsh-computer-use",
			"category": "web-ui",
			"tags": [],
			"stars": 8,
			"license": "MIT",
			"updatedAt": "2026-08-13T12:54:35Z",
			"install": {
				"type": "github",
				"profiles": ["web"]
			}
		},
		{
			"slug": "chinesezjc-dsh-interconnect",
			"name": "dsh-interconnect",
			"displayName": "interconnect",
			"description": "Cross-instance message/event handoff.",
			"author": "Chinesezjc",
			"repoUrl": "https://github.com/Chinesezjc/dsh-interconnect",
			"category": "ecosystem",
			"tags": ["interop", "events"],
			"stars": 8,
			"license": "MIT",
			"updatedAt": "2026-08-13T14:47:44Z",
			"install": {
				"type": "github",
				"profiles": ["web"]
			}
		},
		{
			"slug": "hxs996-beep-deepact",
			"name": "deepAct",
			"displayName": "deepAct",
			"description": "deepAct.",
			"author": "hxs996-beep",
			"repoUrl": "https://github.com/hxs996-beep/deepAct",
			"category": "fun",
			"tags": [],
			"stars": 7,
			"license": "MIT",
			"updatedAt": "2026-08-08T03:16:24Z",
			"install": {
				"type": "github",
				"profiles": ["web"]
			}
		},
		{
			"slug": "whiteguo233-dsh-openbiliclaw",
			"name": "dsh-openbiliclaw",
			"displayName": "openbiliclaw",
			"description": "Bilibili integration for DSH.",
			"author": "whiteguo233",
			"repoUrl": "https://github.com/whiteguo233/dsh-openbiliclaw",
			"category": "terminal",
			"tags": ["bridge"],
			"stars": 6,
			"license": "BSD-3-Clause",
			"updatedAt": "2026-08-13T14:49:58Z",
			"install": {
				"type": "github",
				"profiles": ["web"]
			}
		},
		{
			"slug": "chen-001-dsh-grok-tui",
			"name": "dsh-grok-tui",
			"displayName": "grok tui",
			"description": "Grok-style TUI.",
			"author": "chen-001",
			"repoUrl": "https://github.com/chen-001/dsh-grok-tui",
			"category": "terminal",
			"tags": ["tui"],
			"stars": 5,
			"license": "MIT",
			"updatedAt": "2026-08-13T14:52:00Z",
			"install": {
				"type": "github",
				"profiles": ["web"]
			}
		},
		{
			"slug": "omdsh-dev-dsh-gomoku",
			"name": "dsh-gomoku",
			"displayName": "gomoku",
			"description": "Gomoku game plugin.",
			"author": "omdsh-dev",
			"repoUrl": "https://github.com/omdsh-dev/dsh-gomoku",
			"category": "agent",
			"tags": [],
			"stars": 5,
			"license": "MIT",
			"updatedAt": "2026-08-13T16:07:46Z",
			"install": {
				"type": "github",
				"profiles": ["web"]
			}
		},
		{
			"slug": "unknowbug-re-framework",
			"name": "RE-Framework",
			"displayName": "RE Framework",
			"description": "Frameworks.",
			"author": "unknowbug",
			"repoUrl": "https://github.com/unknowbug/RE-Framework",
			"category": "fun",
			"tags": [],
			"stars": 5,
			"license": null,
			"updatedAt": "2026-08-13T16:03:07Z",
			"install": {
				"type": "github",
				"profiles": ["web"]
			}
		},
		{
			"slug": "vibeinging-dsh-work",
			"name": "dsh-work",
			"displayName": "work",
			"description": "Work plugin.",
			"author": "vibeinging",
			"repoUrl": "https://github.com/vibeinging/dsh-work",
			"category": "agent",
			"tags": [],
			"stars": 4,
			"license": "MIT",
			"updatedAt": "2026-08-13T12:27:31Z",
			"install": {
				"type": "github",
				"profiles": ["web"]
			}
		},
		{
			"slug": "unknowbug-anchorlaw",
			"name": "anchorlaw",
			"displayName": "anchorlaw",
			"description": "Frameworks.",
			"author": "unknowbug",
			"repoUrl": "https://github.com/unknowbug/anchorlaw",
			"category": "fun",
			"tags": [],
			"stars": 4,
			"license": "MIT",
			"updatedAt": "2026-08-13T15:39:43Z",
			"install": {
				"type": "github",
				"profiles": ["web"]
			}
		},
		{
			"slug": "good-boy4069-deepseek-omnimodal",
			"name": "Deepseek-omnimodal",
			"displayName": "Deepseek omnimodal",
			"description": "Omnimodal support.",
			"author": "good-boy4069",
			"repoUrl": "https://github.com/good-boy4069/Deepseek-omnimodal",
			"category": "vision",
			"tags": [],
			"stars": 2,
			"license": "MIT",
			"updatedAt": "2026-08-10T03:38:53Z",
			"install": {
				"type": "github",
				"profiles": ["web"]
			}
		},
		{
			"slug": "yyh-001-dsh-companion",
			"name": "dsh-companion",
			"displayName": "companion",
			"description": "Companion plugin.",
			"author": "yyh-001",
			"repoUrl": "https://github.com/yyh-001/dsh-companion",
			"category": "agent",
			"tags": [],
			"stars": 2,
			"license": "MIT",
			"updatedAt": "2026-08-13T16:00:31Z",
			"install": {
				"type": "github",
				"profiles": ["web"]
			}
		},
		{
			"slug": "coppynight-dsh-doctor",
			"name": "dsh-doctor",
			"displayName": "doctor",
			"description": "Diagnostics / doctor.",
			"author": "coppynight",
			"repoUrl": "https://github.com/coppynight/dsh-doctor",
			"category": "ecosystem",
			"tags": [],
			"stars": 2,
			"license": "BSD-3-Clause",
			"updatedAt": "2026-08-13T13:06:07Z",
			"install": {
				"type": "github",
				"profiles": ["web"]
			}
		},
		{
			"slug": "bittersmilezzz-dsh-mac-desktop",
			"name": "dsh-mac-desktop",
			"displayName": "mac desktop",
			"description": "macOS desktop wrapper.",
			"author": "bitterSmilezzz",
			"repoUrl": "https://github.com/bitterSmilezzz/dsh-mac-desktop",
			"category": "terminal",
			"tags": ["desktop"],
			"stars": 1,
			"license": "MIT",
			"updatedAt": "2026-08-13T15:46:01Z",
			"install": {
				"type": "github",
				"profiles": ["web"]
			}
		},
		{
			"slug": "electricitysheep-dsh-tool-turbo",
			"name": "dsh-tool-turbo",
			"displayName": "tool turbo",
			"description": "Tool turbo.",
			"author": "Electricitysheep",
			"repoUrl": "https://github.com/Electricitysheep/dsh-tool-turbo",
			"category": "tools",
			"tags": [],
			"stars": 1,
			"license": null,
			"updatedAt": "2026-08-13T15:08:49Z",
			"install": {
				"type": "github",
				"profiles": ["web"]
			}
		},
		{
			"slug": "linglambda-dsh-undo",
			"name": "dsh-undo",
			"displayName": "undo",
			"description": "Undo support.",
			"author": "LingLambda",
			"repoUrl": "https://github.com/LingLambda/dsh-undo",
			"category": "tools",
			"tags": [],
			"stars": 1,
			"license": "MIT",
			"updatedAt": "2026-08-13T14:12:27Z",
			"install": {
				"type": "github",
				"profiles": ["web"]
			}
		},
		{
			"slug": "fakechris-dsh-track",
			"name": "dsh-track",
			"displayName": "track",
			"description": "Tracking helper.",
			"author": "fakechris",
			"repoUrl": "https://github.com/fakechris/dsh-track",
			"category": "tools",
			"tags": [],
			"stars": 1,
			"license": "BSD-3-Clause",
			"updatedAt": "2026-08-13T07:32:12Z",
			"install": {
				"type": "github",
				"profiles": ["web"]
			}
		},
		{
			"slug": "omdsh-dev-dsh-plugin-skills",
			"name": "dsh-plugin-skills",
			"displayName": "plugin skills",
			"description": "Skills plugin.",
			"author": "omdsh-dev",
			"repoUrl": "https://github.com/omdsh-dev/dsh-plugin-skills",
			"category": "tools",
			"tags": [],
			"stars": 1,
			"license": "MIT",
			"updatedAt": "2026-08-11T06:39:42Z",
			"install": {
				"type": "github",
				"profiles": ["web"]
			}
		},
		{
			"slug": "omdsh-dev-dsh-mnemon",
			"name": "dsh-mnemon",
			"displayName": "mnemon",
			"description": "Mnemonics plugin.",
			"author": "omdsh-dev",
			"repoUrl": "https://github.com/omdsh-dev/dsh-mnemon",
			"category": "tools",
			"tags": [],
			"stars": 1,
			"license": "BSD-3-Clause",
			"updatedAt": "2026-08-13T15:20:05Z",
			"install": {
				"type": "github",
				"profiles": ["web"]
			}
		},
		{
			"slug": "titanwings-dsh-plannotator",
			"name": "dsh-plannotator",
			"displayName": "plannotator",
			"description": "Plan annotator.",
			"author": "titanwings",
			"repoUrl": "https://github.com/titanwings/dsh-plannotator",
			"category": "agent",
			"tags": [],
			"stars": 1,
			"license": "MIT",
			"updatedAt": "2026-08-13T15:50:07Z",
			"install": {
				"type": "github",
				"profiles": ["web"]
			}
		},
		{
			"slug": "yytbit-dsh-plugin-claude-bridge",
			"name": "dsh-plugin-claude-bridge",
			"displayName": "plugin claude bridge",
			"description": "Bridge to Claude.",
			"author": "YYTbit",
			"repoUrl": "https://github.com/YYTbit/dsh-plugin-claude-bridge",
			"category": "integrations",
			"tags": ["bridge"],
			"stars": 1,
			"license": "MIT",
			"updatedAt": "2026-08-13T14:54:56Z",
			"install": {
				"type": "github",
				"profiles": ["web"]
			}
		},
		{
			"slug": "yytbit-dsh-plugin-codex-bridge",
			"name": "dsh-plugin-codex-bridge",
			"displayName": "plugin codex bridge",
			"description": "Bridge to Codex.",
			"author": "YYTbit",
			"repoUrl": "https://github.com/YYTbit/dsh-plugin-codex-bridge",
			"category": "integrations",
			"tags": ["bridge"],
			"stars": 1,
			"license": "MIT",
			"updatedAt": "2026-08-13T14:55:00Z",
			"install": {
				"type": "github",
				"profiles": ["web"]
			}
		},
		{
			"slug": "yytbit-dsh-plugin-pi-bridge",
			"name": "dsh-plugin-pi-bridge",
			"displayName": "plugin pi bridge",
			"description": "Bridge to Pi.",
			"author": "YYTbit",
			"repoUrl": "https://github.com/YYTbit/dsh-plugin-pi-bridge",
			"category": "integrations",
			"tags": ["bridge"],
			"stars": 1,
			"license": "MIT",
			"updatedAt": "2026-08-13T14:55:14Z",
			"install": {
				"type": "github",
				"profiles": ["web"]
			}
		},
		{
			"slug": "yytbit-dsh-plugin-opencode-bridge",
			"name": "dsh-plugin-opencode-bridge",
			"displayName": "plugin opencode bridge",
			"description": "Bridge to OpenCode.",
			"author": "YYTbit",
			"repoUrl": "https://github.com/YYTbit/dsh-plugin-opencode-bridge",
			"category": "integrations",
			"tags": ["bridge"],
			"stars": 1,
			"license": "MIT",
			"updatedAt": "2026-08-13T14:55:05Z",
			"install": {
				"type": "github",
				"profiles": ["web"]
			}
		},
		{
			"slug": "yoke233-dsh-openai-codex-auth",
			"name": "dsh-openai-codex-auth",
			"displayName": "openai codex auth",
			"description": "OpenAI Codex auth.",
			"author": "yoke233",
			"repoUrl": "https://github.com/yoke233/dsh-openai-codex-auth",
			"category": "integrations",
			"tags": [],
			"stars": 1,
			"license": "MIT",
			"updatedAt": "2026-08-13T14:32:43Z",
			"install": {
				"type": "github",
				"profiles": ["web"]
			}
		},
		{
			"slug": "kingjly-dsh-plugin-builder",
			"name": "dsh-plugin-builder",
			"displayName": "plugin builder",
			"description": "Plugin builder scaffolding.",
			"author": "kingjly",
			"repoUrl": "https://github.com/kingjly/dsh-plugin-builder",
			"category": "ecosystem",
			"tags": [],
			"stars": 1,
			"license": "MIT",
			"updatedAt": "2026-08-13T15:09:04Z",
			"install": {
				"type": "github",
				"profiles": ["web"]
			}
		},
		{
			"slug": "hacksing-dsh-plugins",
			"name": "dsh-plugins",
			"displayName": "plugins",
			"description": "Plugin collections.",
			"author": "HackSing",
			"repoUrl": "https://github.com/HackSing/dsh-plugins",
			"category": "ecosystem",
			"tags": [],
			"stars": 1,
			"license": "CC-BY-4.0",
			"updatedAt": "2026-08-13T15:49:37Z",
			"install": {
				"type": "github",
				"profiles": ["web"]
			}
		},
		{
			"slug": "yihong89-dsh-plugins",
			"name": "dsh-plugins",
			"displayName": "plugins",
			"description": "Plugin collections.",
			"author": "Yihong89",
			"repoUrl": "https://github.com/Yihong89/dsh-plugins",
			"category": "ecosystem",
			"tags": [],
			"stars": 1,
			"license": "MIT",
			"updatedAt": "2026-08-13T15:32:01Z",
			"install": {
				"type": "github",
				"profiles": ["web"]
			}
		},
		{
			"slug": "yyh-001-dsh-expression",
			"name": "dsh-expression",
			"displayName": "expression",
			"description": "Expression plugin.",
			"author": "yyh-001",
			"repoUrl": "https://github.com/yyh-001/dsh-expression",
			"category": "ecosystem",
			"tags": [],
			"stars": 1,
			"license": "MIT",
			"updatedAt": "2026-08-13T16:00:33Z",
			"install": {
				"type": "github",
				"profiles": ["web"]
			}
		},
		{
			"slug": "sjscy05-deepseek-harness-vision-plugin",
			"name": "deepseek-harness-vision-plugin",
			"displayName": "deepseek harness vision plugin",
			"description": "Vision plugin for DSH.",
			"author": "sjscy05",
			"repoUrl": "https://github.com/sjscy05/deepseek-harness-vision-plugin",
			"category": "vision",
			"tags": ["vision"],
			"stars": 0,
			"license": "MIT",
			"updatedAt": "2026-08-13T15:40:40Z",
			"install": {
				"type": "github",
				"profiles": ["web"]
			}
		},
		{
			"slug": "yytbit-dsh-plugin-vision-toolkit",
			"name": "dsh-plugin-vision-toolkit",
			"displayName": "plugin vision toolkit",
			"description": "Vision-toolkit bridge.",
			"author": "YYTbit",
			"repoUrl": "https://github.com/YYTbit/dsh-plugin-vision-toolkit",
			"category": "vision",
			"tags": ["vision", "bridge"],
			"stars": 0,
			"license": "MIT",
			"updatedAt": "2026-08-13T15:07:11Z",
			"install": {
				"type": "github",
				"profiles": ["web"]
			}
		},
		{
			"slug": "artificialnotimbecile-dsh-context-taxonomy",
			"name": "dsh-context-taxonomy",
			"displayName": "context taxonomy",
			"description": "Context taxonomy.",
			"author": "ArtificialNotImbecile",
			"repoUrl": "https://github.com/ArtificialNotImbecile/dsh-context-taxonomy",
			"category": "tools",
			"tags": [],
			"stars": 0,
			"license": "MIT",
			"updatedAt": "2026-08-13T14:24:04Z",
			"install": {
				"type": "github",
				"profiles": ["web"]
			}
		},
		{
			"slug": "bobleer-deepseek-harness-plugin-mcp",
			"name": "deepseek-harness-plugin-mcp",
			"displayName": "deepseek harness plugin mcp",
			"description": "MCP plugin.",
			"author": "bobleer",
			"repoUrl": "https://github.com/bobleer/deepseek-harness-plugin-mcp",
			"category": "integrations",
			"tags": [],
			"stars": 0,
			"license": "MIT",
			"updatedAt": "2026-08-13T15:08:14Z",
			"install": {
				"type": "github",
				"profiles": ["web"]
			}
		},
		{
			"slug": "syy-shark-dsh-music-plugin",
			"name": "dsh-music-plugin",
			"displayName": "music plugin",
			"description": "Music plugin.",
			"author": "syy-shark",
			"repoUrl": "https://github.com/syy-shark/dsh-music-plugin",
			"category": "fun",
			"tags": [],
			"stars": 0,
			"license": "MIT",
			"updatedAt": "2026-08-13T14:50:51Z",
			"install": {
				"type": "github",
				"profiles": ["web"]
			}
		}
	]
};
//#endregion
//#region registry/submit-rules.json
var submit_rules_default = {
	title: "📮 提交你的插件",
	intro: "WhaleHub 的注册表由 Git 仓库托管，提交流程 = 一次 Issue 或 PR，无需注册账号、无需等待复杂审核。",
	methods: [{
		"name": "方式一：提 Issue（推荐，1 分钟）",
		"steps": [
			"打开「提交插件 Issue 表单」",
			"填写仓库地址、分类、一句话描述",
			"维护者审核后合并，次日同步即上线"
		],
		"link": {
			"label": "提交插件 Issue 表单 ↗",
			"url": "https://github.com/vvlife/whalehub-dsh/issues/new?template=submit-plugin.yml"
		}
	}, {
		"name": "方式二：直接 PR（适合批量/急上架）",
		"steps": [
			"Fork 本仓库，编辑 registry/plugins.json（或 awesome 列表源）",
			"确保 npm test 的注册表校验通过",
			"提交 PR，审核通过后自动部署"
		],
		"link": {
			"label": "Fork whalehub-dsh ↗",
			"url": "https://github.com/vvlife/whalehub-dsh/fork"
		}
	}],
	checklist: [
		"仓库是公开的，README 写清了安装方式",
		"给仓库打上 dsh-plugin topic，方便生态索引",
		"声明兼容的 DSH Profile（web / headless / 自定义）",
		"如果是 npm 包，确认 dsh plugin add <包名> 可直接安装"
	],
	review: "只收录开源免费插件；拒绝恶意代码、付费墙与纯广告条目。审核通常在 24 小时内完成。",
	marketUrl: "https://whalehub-dsh.vercel.app"
};
//#endregion
//#region src/index.ts
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
/** cordis.yml 插件行 id。 */
const name = "whalehub-market";
/** 挂载前置服务：webserver 路由。 */
const inject = ["webServer"];
const INSTALL_TIMEOUT_MS = 18e4;
const LIST_TIMEOUT_MS = 2e4;
function writeJson(res, status, body) {
	const text = JSON.stringify(body);
	res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
	res.end(text);
}
function readJsonBody(req) {
	return new Promise((resolve, reject) => {
		const chunks = [];
		let size = 0;
		req.on("data", (chunk) => {
			size += chunk.length;
			if (size > 65536) {
				reject(/* @__PURE__ */ new Error("body too large"));
				req.destroy();
				return;
			}
			chunks.push(chunk);
		});
		req.on("end", () => {
			try {
				resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {});
			} catch {
				reject(/* @__PURE__ */ new Error("invalid JSON body"));
			}
		});
		req.on("error", reject);
	});
}
/**
* 解析 dsh CLI 调用方式。
*
* dsh web 进程的入口（process.argv[1]）就是 dsh 的 bin.js——用当前 node
* 直接执行它，在桌面 APP（内置 Node 运行时、PATH 里没有 dsh）场景下也能
* 调到同一个 dsh；常规全局安装则回退 PATH 里的 dsh。
* 可用 WHALEHUB_DSH_BIN 显式覆盖。
*/
function dshInvocation(args, env = process.env, argv1 = process.argv[1] ?? null, execPath = process.execPath) {
	if (env.WHALEHUB_DSH_BIN) return {
		command: env.WHALEHUB_DSH_BIN,
		args
	};
	if (argv1 && argv1.endsWith(".js") && /dsh/.test(argv1)) return {
		command: execPath,
		args: [argv1, ...args]
	};
	return {
		command: "dsh",
		args
	};
}
/** 从 dsh web 进程参数解析监听端口（--port，默认 3080）。 */
function resolveWebPort(argv = process.argv) {
	const i = argv.indexOf("--port");
	const v = i >= 0 ? Number(argv[i + 1]) : NaN;
	return Number.isInteger(v) && v > 0 ? v : 3080;
}
/**
* 构造自重启引导脚本（由 detached 的 `node -e` 执行）：
* 轮询直到当前进程退出、端口释放，再以完全相同的参数拉起新的 dsh web。
* 桌面 APP 场景下 APP 侧是 adopt-first（先探测健康实例再启动），
* 会直接收养这个自救进程，不会双起；终端独立运行 dsh web 时同样适用。
* 返回 null 表示无法识别 dsh 入口（此时只能手动重启）。
*/
function buildRelaunchScript(argv = process.argv, execPath = process.execPath) {
	const argv1 = argv[1];
	if (!argv1 || !argv1.endsWith(".js")) return null;
	const dshArgs = [argv1, ...argv.slice(2)];
	const port = resolveWebPort(argv);
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
`;
}
/** 应答客户端后自我重启：先派出重生引导进程，再走 SIGTERM 优雅退出。 */
function scheduleSelfRestart(script) {
	spawn(process.execPath, ["-e", script], {
		detached: true,
		stdio: "ignore",
		env: process.env
	}).unref();
	setTimeout(() => {
		process.kill(process.pid, "SIGTERM");
	}, 600);
}
function runDsh(args, timeoutMs) {
	return new Promise((resolve, reject) => {
		const invocation = dshInvocation(args);
		let child;
		try {
			child = spawn(invocation.command, invocation.args, { env: process.env });
		} catch (error) {
			reject(error);
			return;
		}
		let output = "";
		const timer = setTimeout(() => {
			child.kill("SIGTERM");
			reject(/* @__PURE__ */ new Error(`dsh ${args[0]} 超时（${timeoutMs / 1e3}s）`));
		}, timeoutMs);
		child.stdout?.on("data", (d) => {
			output += d.toString();
		});
		child.stderr?.on("data", (d) => {
			output += d.toString();
		});
		child.on("error", (error) => {
			clearTimeout(timer);
			reject(/* @__PURE__ */ new Error(`无法启动 dsh CLI：${error.message}（请确认 dsh 在 PATH 中）`));
		});
		child.on("close", (code) => {
			clearTimeout(timer);
			resolve({
				code,
				output: output.slice(-8e3)
			});
		});
	});
}
async function handle(method, payload) {
	if (method === "registry") {
		const result = await fetchLive({
			cacheKey: "registry",
			sources: REGISTRY_SOURCES,
			snapshot: plugins_default,
			snapshotAt: plugins_default.generatedAt
		});
		return {
			registry: result.data,
			source: result.source,
			fetchedAt: result.fetchedAt,
			url: result.url
		};
	}
	if (method === "submit-rules") {
		const result = await fetchLive({
			cacheKey: "submit-rules",
			sources: RULES_SOURCES,
			snapshot: submit_rules_default,
			snapshotAt: plugins_default.generatedAt
		});
		return {
			rules: result.data,
			source: result.source,
			fetchedAt: result.fetchedAt,
			url: result.url
		};
	}
	if (method === "install") {
		const profile = String(payload.profile ?? "web");
		const target = String(payload.target ?? "");
		if (!isValidProfile(profile)) throw new Error(`非法 profile：${profile}`);
		if (!isValidTarget(target)) throw new Error(`非法安装目标：${target}`);
		const result = await runDsh([
			"plugin",
			"--profile",
			profile,
			"add",
			target
		], INSTALL_TIMEOUT_MS);
		return {
			ok: result.code === 0,
			code: result.code,
			output: result.output,
			restartHint: result.code === 0 ? "安装完成，重启 dsh web 后生效（界面会提供一键重启，无需命令行）。" : void 0
		};
	}
	if (method === "restart") {
		const script = buildRelaunchScript();
		if (!script) throw new Error("当前运行方式不支持自动重启（找不到 dsh 入口）。桌面 APP 可切走再切回 Harness Web 视图完成重启。");
		scheduleSelfRestart(script);
		return {
			ok: true,
			restarting: true
		};
	}
	if (method === "installed") {
		const profile = String(payload.profile ?? "web");
		if (!isValidProfile(profile)) throw new Error(`非法 profile：${profile}`);
		const result = await runDsh([
			"plugin",
			"--profile",
			profile,
			"ls",
			"--depth",
			"0"
		], LIST_TIMEOUT_MS);
		return {
			ok: result.code === 0,
			output: result.output
		};
	}
	throw new Error(`未知方法：${method}`);
}
function apply(ctx) {
	ctx.effect(() => ctx.webServer.register({
		kind: "prefix",
		path: "/whalehub/api",
		handler: async (req, res) => {
			const request = req;
			const response = res;
			if (!isTrustedRequest(request.headers)) {
				writeJson(response, 403, {
					ok: false,
					error: "forbidden"
				});
				return;
			}
			if (request.method !== "POST") {
				writeJson(response, 405, {
					ok: false,
					error: "method not allowed"
				});
				return;
			}
			const pathname = new URL(request.url ?? "/", "http://dsh.internal").pathname;
			const method = pathname.startsWith("/whalehub/api/") ? pathname.slice(14) : void 0;
			if (method === void 0 || method.includes("/")) {
				writeJson(response, 404, {
					ok: false,
					error: "not found"
				});
				return;
			}
			try {
				writeJson(response, 200, {
					ok: true,
					data: await handle(method, await readJsonBody(request))
				});
			} catch (error) {
				writeJson(response, 400, {
					ok: false,
					error: error instanceof Error ? error.message : String(error)
				});
			}
		}
	}), "whalehub-market: /whalehub/api routes");
}
//#endregion
export { apply, buildRelaunchScript, dshInvocation, inject, name, resolveWebPort };
