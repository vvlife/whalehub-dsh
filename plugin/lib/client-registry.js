window.__ModuleLoader__.load({
	id: "vvlife/whalehub-market",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region src/client/api.ts
		async function call(method, payload = {}) {
			const res = await fetch(`/whalehub/api/${method}`, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify(payload)
			});
			const body = await res.json();
			if (!res.ok || !body.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
			return body.data;
		}
		//#endregion
		//#region src/client/registry-types.ts
		const CATEGORIES = {
			"web-ui": "🎨 界面与皮肤",
			terminal: "💻 终端与桌面",
			vision: "👁️ 视觉与多模态",
			tools: "🛠️ 工具与编辑器",
			agent: "🕸️ 编排与工作流",
			integrations: "🔌 集成与桥接",
			ecosystem: "🌐 生态基础",
			fun: "🎈 好玩与杂项"
		};
		/** 与 web 端一致的安装目标解析。 */
		function resolveTarget(entry) {
			const install = entry.install;
			if (install.command) return {
				kind: "manual",
				command: install.command
			};
			if (install.type === "npm" && install.package) return {
				kind: "cli",
				target: install.package
			};
			return {
				kind: "cli",
				target: "github:" + entry.repoUrl.replace("https://github.com/", "")
			};
		}
		function installCommand(entry, profile) {
			const resolved = resolveTarget(entry);
			if (resolved.kind === "manual") return resolved.command;
			return `dsh plugin --profile ${profile} add ${resolved.target}`;
		}
		//#endregion
		//#region src/client/MarketTab.tsx
		/**
		* Settings → Plugins 里的「🐋 插件市场」Tab：
		* 实时拉取 WhaleHub 注册表浏览/搜索，一键安装（走 host 半执行 dsh CLI），
		* 「📮 提交插件」按钮弹出实时拉取的上传规则，同时保留复制命令的手动通道。
		*/
		const DEFAULT_PROFILES = ["web", "headless"];
		function copyText(text) {
			if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).catch(() => void 0);
		}
		/** 提交规则弹窗：打开时实时拉取（host 半多源回退），渲染结构化规则。 */
		function SubmitRulesModal({ fetchRules, onClose }) {
			const [state, setState] = (0, react.useState)(null);
			const [error, setError] = (0, react.useState)(null);
			(0, react.useEffect)(() => {
				let current = true;
				const load = fetchRules ?? (() => call("submit-rules").then((r) => ({
					rules: r.rules,
					source: r.source
				})));
				Promise.resolve().then(() => load()).then((r) => {
					if (current) setState(r);
				}).catch((e) => {
					if (current) setError(e instanceof Error ? e.message : String(e));
				});
				return () => {
					current = false;
				};
			}, [fetchRules]);
			(0, react.useEffect)(() => {
				const onKey = (e) => {
					if (e.key === "Escape") onClose();
				};
				window.addEventListener("keydown", onKey);
				return () => window.removeEventListener("keydown", onKey);
			}, [onClose]);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: "whalehub-modal-mask",
				onClick: onClose,
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "whalehub-modal",
					onClick: (e) => e.stopPropagation(),
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "whalehub-modal-head",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: state?.rules.title ?? "📮 提交你的插件" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: "whalehub-modal-close",
								onClick: onClose,
								children: "✕"
							})]
						}),
						error && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
							className: "whalehub-modal-error",
							children: ["⚠️ 无法加载提交规则：", error]
						}),
						!state && !error && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: "whalehub-modal-loading",
							children: "正在拉取最新提交规则…"
						}),
						state && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "whalehub-modal-body",
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: state.rules.intro }),
								state.rules.methods.map((m) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", { children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h4", { children: m.name }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("ol", { children: m.steps.map((s) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("li", { children: s }, s)) }),
									m.link && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("a", {
										href: m.link.url,
										target: "_blank",
										rel: "noreferrer",
										children: m.link.label
									}) })
								] }, m.name)),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h4", { children: "提交前自检清单" }),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("ul", { children: state.rules.checklist.map((c) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("li", { children: ["✅ ", c] }, c)) }),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h4", { children: "审核标准" }),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: state.rules.review }),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
									className: "whalehub-modal-meta",
									children: [
										state.source === "live" ? "规则实时拉取自 WhaleHub" : "网络不可达，展示内置规则快照",
										" ·",
										" ",
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("a", {
											href: state.rules.marketUrl,
											target: "_blank",
											rel: "noreferrer",
											children: "打开完整版 WhaleHub ↗"
										})
									]
								})
							]
						})
					]
				})
			});
		}
		function MarketTab({ fetchRegistry, installPlugin, fetchRules }) {
			const [state, setState] = (0, react.useState)(null);
			const [loadError, setLoadError] = (0, react.useState)(null);
			const [query, setQuery] = (0, react.useState)("");
			const [category, setCategory] = (0, react.useState)("all");
			const [profile, setProfile] = (0, react.useState)("web");
			const [installing, setInstalling] = (0, react.useState)({});
			const [copiedSlug, setCopiedSlug] = (0, react.useState)(null);
			const [showRules, setShowRules] = (0, react.useState)(false);
			const [restartPending, setRestartPending] = (0, react.useState)(false);
			const [restartState, setRestartState] = (0, react.useState)("idle");
			(0, react.useEffect)(() => {
				let current = true;
				const load = fetchRegistry ?? (() => call("registry").then((r) => ({
					registry: r.registry,
					source: r.source,
					fetchedAt: r.fetchedAt
				})));
				Promise.resolve().then(() => load()).then((r) => {
					if (current) setState(r);
				}).catch((e) => {
					if (current) setLoadError(e instanceof Error ? e.message : String(e));
				});
				return () => {
					current = false;
				};
			}, [fetchRegistry]);
			const registry = state?.registry ?? null;
			const results = (0, react.useMemo)(() => {
				if (!registry) return [];
				let out = registry.plugins;
				if (category !== "all") out = out.filter((p) => p.category === category);
				const q = query.trim().toLowerCase();
				if (q) out = out.filter((p) => [
					p.name,
					p.description,
					p.author,
					...p.tags
				].join(" ").toLowerCase().includes(q));
				return [...out].sort((a, b) => b.stars - a.stars);
			}, [
				registry,
				query,
				category
			]);
			const doInstall = (0, react.useCallback)(async (entry) => {
				const resolved = resolveTarget(entry);
				if (resolved.kind === "manual") {
					copyText(resolved.command);
					setCopiedSlug(entry.slug);
					setTimeout(() => setCopiedSlug(null), 1600);
					return;
				}
				setInstalling((s) => ({
					...s,
					[entry.slug]: { status: "running" }
				}));
				try {
					const result = await (installPlugin ?? ((p, t) => call("install", {
						profile: p,
						target: t
					})))(profile, resolved.target);
					setInstalling((s) => ({
						...s,
						[entry.slug]: {
							status: result.ok ? "ok" : "failed",
							output: result.output
						}
					}));
					if (result.ok) setRestartPending(true);
				} catch (e) {
					setInstalling((s) => ({
						...s,
						[entry.slug]: {
							status: "failed",
							output: e instanceof Error ? e.message : String(e)
						}
					}));
				}
			}, [profile, installPlugin]);
			/** 立即重启：host 半自我重启 dsh web；本页探活成功后自动刷新，新插件即出现在插件列表。 */
			const doRestart = (0, react.useCallback)(async () => {
				setRestartState("restarting");
				try {
					await call("restart");
				} catch {}
				await new Promise((r) => setTimeout(r, 2e3));
				const deadline = Date.now() + 3e4;
				while (Date.now() < deadline) {
					try {
						if ((await fetch("/", {
							method: "HEAD",
							cache: "no-store"
						})).ok) {
							location.reload();
							return;
						}
					} catch {}
					await new Promise((r) => setTimeout(r, 800));
				}
				setRestartState("failed");
			}, []);
			if (loadError) return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "whalehub-market whalehub-error",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", { children: ["⚠️ 无法加载插件注册表：", loadError] }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", { children: [
					"请确认 whalehub-market 的 host 半已随 profile 挂载，或访问 ",
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("a", {
						href: "https://vvlife.github.io/whalehub-dsh/",
						target: "_blank",
						rel: "noreferrer",
						children: "网页版 WhaleHub"
					}),
					"。"
				] })]
			});
			if (!registry || !state) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: "whalehub-market whalehub-loading",
				children: "正在加载插件注册表…"
			});
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "whalehub-market",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "whalehub-toolbar",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
								className: "whalehub-search",
								value: query,
								onChange: (e) => setQuery(e.target.value),
								placeholder: `搜索 ${registry.pluginCount} 个社区插件…`
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
								value: category,
								onChange: (e) => setCategory(e.target.value),
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
									value: "all",
									children: "全部分类"
								}), Object.keys(CATEGORIES).map((c) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
									value: c,
									children: CATEGORIES[c]
								}, c))]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
								className: "whalehub-profile",
								children: [
									"安装到",
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("select", {
										value: profile,
										onChange: (e) => setProfile(e.target.value),
										children: [.../* @__PURE__ */ new Set([...DEFAULT_PROFILES, profile])].map((p) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
											value: p,
											children: p
										}, p))
									}),
									"profile"
								]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: "whalehub-submit",
								onClick: () => setShowRules(true),
								children: "📮 提交插件"
							})
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
						className: "whalehub-meta",
						children: [
							state.source === "live" ? `实时数据 · 拉取于 ${state.fetchedAt.slice(0, 16).replace("T", " ")}` : `离线快照 ${registry.generatedAt.slice(0, 10)}（实时源不可达）`,
							" ",
							"· 命中 ",
							results.length,
							" 个 ·",
							" ",
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("a", {
								href: "https://vvlife.github.io/whalehub-dsh/",
								target: "_blank",
								rel: "noreferrer",
								children: "打开完整版 WhaleHub ↗"
							})
						]
					}),
					restartPending && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "whalehub-restart-bar",
						children: [
							restartState === "idle" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: "✅ 安装完成，重启 dsh web 后新插件才会出现在「插件列表」。" }),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									onClick: () => void doRestart(),
									children: "🔄 立即重启"
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: "whalehub-later",
									onClick: () => setRestartPending(false),
									children: "稍后重启"
								})
							] }),
							restartState === "restarting" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: "🔄 正在重启 dsh web，页面会自动刷新…" }),
							restartState === "failed" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: "⚠️ 等待重启超时。桌面 APP 可切走再切回本视图触发重启，或手动刷新页面。" })
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "whalehub-list",
						children: results.map((entry) => {
							const install = installing[entry.slug] ?? { status: "idle" };
							const manual = resolveTarget(entry).kind === "manual";
							return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "whalehub-card",
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: "whalehub-card-head",
										children: [
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: entry.name }),
											/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
												className: "whalehub-author",
												children: ["@", entry.author]
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
												className: "whalehub-stars",
												children: ["★ ", entry.stars]
											})
										]
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
										className: "whalehub-desc",
										children: entry.description || "暂无描述"
									}),
									entry.notes && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
										className: "whalehub-notes",
										children: ["⚠️ ", entry.notes]
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: "whalehub-actions",
										children: [
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
												type: "button",
												disabled: install.status === "running",
												onClick: () => void doInstall(entry),
												children: install.status === "running" ? "安装中…" : manual ? copiedSlug === entry.slug ? "✓ 已复制命令" : "📋 复制安装步骤" : install.status === "ok" ? "✅ 已安装" : "⚡ 一键安装"
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
												type: "button",
												className: "whalehub-copy",
												title: installCommand(entry, profile),
												onClick: () => {
													copyText(installCommand(entry, profile));
													setCopiedSlug(entry.slug + ":cmd");
													setTimeout(() => setCopiedSlug(null), 1600);
												},
												children: copiedSlug === entry.slug + ":cmd" ? "✓ 已复制" : "复制命令"
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("a", {
												href: entry.repoUrl,
												target: "_blank",
												rel: "noreferrer",
												children: "仓库 ↗"
											})
										]
									}),
									install.status === "ok" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
										className: "whalehub-ok",
										children: "✅ 已安装，重启 dsh web 后生效（可用上方「立即重启」，无需任何命令行操作）。"
									}),
									install.status === "failed" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("pre", {
										className: "whalehub-fail",
										children: install.output || "安装失败"
									})
								]
							}, entry.slug);
						})
					}),
					showRules && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SubmitRulesModal, {
						fetchRules,
						onClose: () => setShowRules(false)
					})
				]
			});
		}
		//#endregion
		//#region \0whalehub-css:/Users/nxhuang/Documents/Project/kimi with paseo/whalehub-dsh/plugin/src/client/market.css.mjs
		const css = "/* WhaleHub 市场 Tab 样式。\n * 颜色全部走 dsh web 的设计令牌（--dsw-alias-*，定义在 body / body[data-ds-dark-theme] 上），\n * 明/暗主题自动跟随；变量缺失时的兜底值按亮色取（dsh web 默认主题为亮）。 */\n.whalehub-market { display: flex; flex-direction: column; gap: 12px; padding: 4px 0; font-size: 14px; }\n.whalehub-loading, .whalehub-error { padding: 24px 8px; opacity: 0.8; }\n.whalehub-toolbar { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }\n.whalehub-search {\n  flex: 1; min-width: 220px; padding: 8px 12px; border-radius: 8px;\n  border: 1px solid var(--dsw-alias-border-l2, #cbd5e1);\n  background: var(--dsw-alias-bg-layer-1, #ffffff);\n  color: var(--dsw-alias-label-primary, inherit); font-size: 13px;\n}\n.whalehub-search::placeholder { color: var(--dsw-alias-label-dimmed, #94a3b8); }\n.whalehub-toolbar select {\n  padding: 8px 10px; border-radius: 8px;\n  border: 1px solid var(--dsw-alias-border-l2, #cbd5e1);\n  background: var(--dsw-alias-bg-layer-1, #ffffff);\n  color: var(--dsw-alias-label-primary, inherit); font-size: 13px;\n}\n.whalehub-profile { display: flex; gap: 6px; align-items: center; font-size: 13px; opacity: 0.9; }\n.whalehub-meta { margin: 0; font-size: 12px; opacity: 0.65; }\n.whalehub-list { display: flex; flex-direction: column; gap: 10px; }\n.whalehub-card {\n  border: 1px solid var(--dsw-alias-border-l2, #e2e8f0); border-radius: 10px;\n  padding: 12px 14px; display: flex; flex-direction: column; gap: 6px;\n  background: var(--dsw-alias-bg-layer-1, #ffffff);\n}\n.whalehub-card-head { display: flex; gap: 8px; align-items: baseline; }\n.whalehub-author { font-size: 12px; opacity: 0.6; flex: 1; }\n.whalehub-stars { font-size: 12px; color: #fbbf24; }\n.whalehub-desc { margin: 0; font-size: 13px; opacity: 0.85; }\n.whalehub-notes {\n  margin: 0; font-size: 12px; opacity: 0.8; border-left: 3px solid #fbbf24;\n  padding: 4px 10px; background: rgba(251, 191, 36, 0.08); border-radius: 0 6px 6px 0;\n}\n.whalehub-actions { display: flex; gap: 8px; align-items: center; margin-top: 2px; }\n.whalehub-actions button {\n  padding: 6px 14px; border-radius: 8px; border: none; cursor: pointer;\n  background: #0ea5e9; color: #fff; font-size: 13px; font-weight: 600;\n}\n.whalehub-actions button:disabled { opacity: 0.6; cursor: wait; }\n.whalehub-actions button.whalehub-copy {\n  background: transparent; border: 1px solid var(--dsw-alias-border-l2, #cbd5e1);\n  color: var(--dsw-alias-label-primary, inherit); font-weight: 400;\n}\n.whalehub-actions a { font-size: 13px; }\n.whalehub-ok { margin: 0; font-size: 12.5px; color: #34d399; }\n.whalehub-fail {\n  margin: 0; font-size: 12px; color: #f87171; white-space: pre-wrap; word-break: break-all;\n  max-height: 160px; overflow: auto; padding: 8px; border-radius: 6px;\n  background: var(--dsw-alias-bg-base, #f1f5f9);\n  border: 1px solid var(--dsw-alias-border-l2, #e2e8f0);\n}\n\n/* 📮 提交插件按钮 + 规则弹窗 */\n.whalehub-submit {\n  padding: 8px 14px; border-radius: 8px; cursor: pointer; font-size: 13px; font-weight: 600;\n  border: 1px solid #0ea5e9; background: transparent; color: #0ea5e9;\n}\n.whalehub-modal-mask {\n  position: fixed; inset: 0; z-index: 1000; background: rgba(2, 6, 23, 0.6);\n  display: flex; align-items: center; justify-content: center; padding: 24px;\n}\n.whalehub-modal {\n  width: min(560px, 100%); max-height: 80vh; overflow: auto; border-radius: 12px;\n  border: 1px solid var(--dsw-alias-border-l2, #e2e8f0);\n  background: var(--dsw-alias-bg-layer-2, #ffffff);\n  color: var(--dsw-alias-label-primary, inherit);\n  padding: 16px 20px; box-shadow: 0 20px 50px rgba(0, 0, 0, 0.25);\n}\n.whalehub-modal-head {\n  display: flex; align-items: center; justify-content: space-between;\n  font-size: 15px; margin-bottom: 8px;\n}\n.whalehub-modal-close {\n  border: none; background: transparent; color: inherit; cursor: pointer;\n  font-size: 14px; opacity: 0.7; padding: 4px 8px;\n}\n.whalehub-modal-close:hover { opacity: 1; }\n.whalehub-modal-body { font-size: 13px; line-height: 1.6; }\n.whalehub-modal-body h4 { margin: 14px 0 6px; font-size: 13.5px; }\n.whalehub-modal-body ol, .whalehub-modal-body ul { margin: 4px 0; padding-left: 22px; }\n.whalehub-modal-body p { margin: 6px 0; }\n.whalehub-modal-meta { font-size: 12px; opacity: 0.65; margin-top: 14px; }\n.whalehub-modal-loading, .whalehub-modal-error { padding: 16px 0; font-size: 13px; opacity: 0.85; }\n.whalehub-modal-error { color: #f87171; }\n\n/* 安装成功后的重启提示条 */\n.whalehub-restart-bar {\n  display: flex; gap: 10px; align-items: center; flex-wrap: wrap;\n  border: 1px solid rgba(52, 211, 153, 0.4); border-radius: 10px;\n  background: rgba(52, 211, 153, 0.08); padding: 10px 14px; font-size: 13px;\n}\n.whalehub-restart-bar button {\n  padding: 6px 14px; border-radius: 8px; border: none; cursor: pointer;\n  background: #34d399; color: #052e1b; font-size: 13px; font-weight: 600;\n}\n.whalehub-restart-bar button.whalehub-later {\n  background: transparent; border: 1px solid var(--dsw-alias-border-l2, #cbd5e1);\n  color: var(--dsw-alias-label-primary, inherit); font-weight: 400;\n}\n";
		if (typeof document !== "undefined" && !document.querySelector("style[data-plugin-css=\"vvlife/whalehub-market/market.css\"]")) {
			const tag = document.createElement("style");
			tag.dataset.pluginCss = "vvlife/whalehub-market/market.css";
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		//#endregion
		//#region src/client/index.tsx
		/** 模块 id 由构建横幅注入（window.__ModuleLoader__.load 的 id）。 */
		const inject = ["slots"];
		function apply(ctx) {
			ctx.slots.inject("settings.plugins.tab", () => ctx.slots.register({
				name: "settings.plugins.tab",
				id: "whalehub-market",
				order: 20,
				label: () => "🐋 插件市场"
			}, (props) => (0, react.createElement)(MarketTab, props)));
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
