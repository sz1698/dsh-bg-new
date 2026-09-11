window.__ModuleLoader__.load({
	id: "dsh-bg-switch",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react_jsx_runtime = require("react/jsx-runtime");
		let react = require("react");
		//#region src/bg-config.ts
		/** 媒体适配（UI 下拉枚举；color/gradient 无意义禁用）。 */
		const BG_FITS = [
			"fill",
			"cover",
			"contain",
			"center",
			"tile"
		];
		/** 文字方案：'auto' 按背景亮度推断；推断不出（image/video/media）默认 light-text。 */
		const BG_TEXT_SCHEMES = [
			"auto",
			"light",
			"dark"
		];
		/** 媒体缩放下限（0.25 = 缩到 25%，可看到整体留白）。 */
		const BG_SCALE_MIN = .25;
		/**
		* 取 URL 路径部分的扩展名（无点、小写；已去 query/hash）。
		*
		* 无法判定时返回 ''（目录结尾、无扩展名、非法 URL）—— 调用方对 '' 一律放行：
		* CDN 上「无扩展名的动态图片地址」很常见，无法判定 ≠ 非法。
		*/
		function urlExtOf(url) {
			const clean = url.trim().split(/[?#]/)[0] ?? "";
			const slash = Math.max(clean.lastIndexOf("/"), clean.lastIndexOf("\\"));
			const dot = clean.lastIndexOf(".");
			if (dot < 0 || dot < slash) return "";
			const ext = clean.slice(dot + 1).toLowerCase();
			return /^[a-z0-9]{1,12}$/.test(ext) ? ext : "";
		}
		/**
		* 跨类型 URL 校验（client UI 与 bg_apply 共用同一份判断）。
		* @param url - 用户/模型给的 http(s) 地址。
		* @param kind - 该输入框/该次调用期望的媒体类型。
		* @param ext - 允许的扩展名表（config 的 imageExt / videoExt）。
		* @returns 'ok'（放行）/ 'is-video'（图片栏收到视频链接）/ 'is-image'（视频栏收到图片链接）。
		*/
		function mediaUrlKindConflict(url, kind, ext) {
			const suffix = urlExtOf(url);
			if (suffix === "") return "ok";
			const inImage = ext.imageExt.includes(suffix);
			const inVideo = ext.videoExt.includes(suffix);
			if (kind === "image") return inVideo && !inImage ? "is-video" : "ok";
			return inImage && !inVideo ? "is-image" : "ok";
		}
		/** CSS 载荷安全字符集（与 src/tool.ts 同一份规则，阻止注入分号/花括号拆规则）。 */
		const BG_CSS_SAFE = /^[A-Za-z0-9#(),.%\s/\-]+$/;
		const DEFAULT_BG_CONFIG = Object.freeze({
			imageExt: Object.freeze([
				"png",
				"jpg",
				"jpeg",
				"gif",
				"webp",
				"svg",
				"avif",
				"bmp",
				"ico"
			]),
			videoExt: Object.freeze([
				"mp4",
				"webm",
				"ogg",
				"ogv",
				"mov",
				"m4v"
			]),
			maxImageMB: 10,
			maxVideoMB: 500,
			defaultFit: "cover",
			defaultTextScheme: "auto",
			defaultLoop: true
		});
		/** 清洗单个扩展名字符串：去空白/前置点/转小写/去重。返回 '' 表示丢弃。 */
		function cleanExt(raw) {
			if (typeof raw !== "string") return "";
			const ext = raw.trim().toLowerCase().replace(/^\.+/, "");
			return ext === "" ? "" : ext;
		}
		function normalizeExtList(raw, fallback, label, issues) {
			if (raw === void 0) return [...fallback];
			if (!Array.isArray(raw) || raw.length === 0) {
				issues.push(`config: ${label} 需是非空字符串数组（如 ["png","jpg"]），已回退内置默认`);
				return [...fallback];
			}
			const seen = /* @__PURE__ */ new Set();
			const out = [];
			for (const item of raw) {
				const ext = cleanExt(item);
				if (ext === "") {
					issues.push(`config: ${label} 含有非法项（需是扩展名文本），已忽略`);
					continue;
				}
				if (!seen.has(ext)) {
					seen.add(ext);
					out.push(ext);
				}
			}
			if (out.length === 0) {
				issues.push(`config: ${label} 清洗后为空，已回退内置默认`);
				return [...fallback];
			}
			return out;
		}
		function normalizePositiveInt(raw, fallback, label, issues) {
			if (raw === void 0) return fallback;
			const n = typeof raw === "number" ? raw : Number(raw);
			if (!Number.isFinite(n) || n <= 0) {
				issues.push(`config: ${label} 需是大于 0 的数字（MB），已回退 ${fallback}`);
				return fallback;
			}
			return Math.max(1, Math.round(n));
		}
		/**
		* 把 config.json 的未知 JSON 形状规范化为合法 {@link BgConfig}。
		* @param raw - JSON.parse 后的 config.json 内容；undefined/null 表示无文件（纯默认，无 issue）。
		*/
		function normalizeBgConfig(raw) {
			const issues = [];
			if (raw === void 0 || raw === null || typeof raw !== "object" || Array.isArray(raw)) return {
				config: { ...DEFAULT_BG_CONFIG },
				issues
			};
			const obj = raw;
			let defaultFit = obj.defaultFit;
			if (obj.defaultFit !== void 0 && !BG_FITS.includes(defaultFit)) {
				issues.push(`config: defaultFit 需是 ${BG_FITS.join("/")} 之一，已回退 cover`);
				defaultFit = DEFAULT_BG_CONFIG.defaultFit;
			}
			let defaultTextScheme = obj.defaultTextScheme;
			if (obj.defaultTextScheme !== void 0 && !BG_TEXT_SCHEMES.includes(defaultTextScheme)) {
				issues.push(`config: defaultTextScheme 需是 ${BG_TEXT_SCHEMES.join("/")} 之一，已回退 auto`);
				defaultTextScheme = DEFAULT_BG_CONFIG.defaultTextScheme;
			}
			let defaultLoop = obj.defaultLoop;
			if (obj.defaultLoop !== void 0 && typeof obj.defaultLoop !== "boolean") {
				issues.push("config: defaultLoop 需是布尔值，已回退 true");
				defaultLoop = DEFAULT_BG_CONFIG.defaultLoop;
			}
			return {
				config: {
					imageExt: normalizeExtList(obj.imageExt, DEFAULT_BG_CONFIG.imageExt, "imageExt", issues),
					videoExt: normalizeExtList(obj.videoExt, DEFAULT_BG_CONFIG.videoExt, "videoExt", issues),
					maxImageMB: normalizePositiveInt(obj.maxImageMB, DEFAULT_BG_CONFIG.maxImageMB, "maxImageMB", issues),
					maxVideoMB: normalizePositiveInt(obj.maxVideoMB, DEFAULT_BG_CONFIG.maxVideoMB, "maxVideoMB", issues),
					defaultFit,
					defaultTextScheme,
					defaultLoop
				},
				issues
			};
		}
		//#endregion
		//#region src/client/bg-palette.ts
		function clamp255(n) {
			return Number.isFinite(n) ? Math.max(0, Math.min(255, Math.round(n))) : null;
		}
		/** 解析一个 CSS 颜色为 RGB 三元组；解析失败（命名色/hsl/畸形）返回 null。 */
		function parseCssColor(value) {
			const input = value.trim();
			if (input === "") return null;
			if (input.startsWith("#")) {
				const hex = input.slice(1);
				if (/^[0-9a-fA-F]{3}$/.test(hex)) return {
					r: parseInt(hex[0] + hex[0], 16),
					g: parseInt(hex[1] + hex[1], 16),
					b: parseInt(hex[2] + hex[2], 16)
				};
				if (/^[0-9a-fA-F]{6}$/.test(hex)) return {
					r: parseInt(hex.slice(0, 2), 16),
					g: parseInt(hex.slice(2, 4), 16),
					b: parseInt(hex.slice(4, 6), 16)
				};
				return null;
			}
			const rgbMatch = /^rgba?\((.*)\)$/s.exec(input);
			if (!rgbMatch) return null;
			const inner = rgbMatch[1];
			const hasSlash = inner.includes("/");
			const commaParts = inner.split(",").map((part) => part.trim());
			let channels;
			let alpha = 1;
			if (hasSlash) {
				const [rgbPart, aRaw] = inner.split("/");
				channels = rgbPart.split(/[\s,]+/).map((part) => part.trim()).filter((part) => part !== "");
				const a = parseFloat(aRaw);
				alpha = Number.isFinite(a) ? a : 1;
			} else if (commaParts.length === 4) {
				channels = commaParts.slice(0, 3);
				const a = parseFloat(commaParts[3]);
				alpha = Number.isFinite(a) ? a : 1;
			} else if (commaParts.length === 3) channels = commaParts;
			else channels = inner.split(/[\s]+/).map((part) => part.trim()).filter((part) => part !== "");
			if (channels.length < 3) return null;
			const toChannel = (part) => {
				if (part.endsWith("%")) {
					const pct = parseFloat(part);
					return Number.isFinite(pct) ? Math.round(pct / 100 * 255) : null;
				}
				return clamp255(parseFloat(part));
			};
			const r = toChannel(channels[0]);
			const g = toChannel(channels[1]);
			const b = toChannel(channels[2]);
			if (r === null || g === null || b === null || alpha === 0) return null;
			return {
				r,
				g,
				b
			};
		}
		/** sRGB 通道线性化（Rec.709）。 */
		function linearChannel(c8) {
			const c = c8 / 255;
			return c <= .04045 ? c / 12.92 : Math.pow((c + .055) / 1.055, 2.4);
		}
		/**
		* Rec.709 相对亮度（0..1）：0.2126 R + 0.7152 G + 0.0722 B。
		* 供「背景亮度 → 文字深浅」判定：亮度 ≥ 0.5 视为浅底（用深字），否则深底（用浅字）。
		*/
		function relativeLuminance(rgb) {
			return .2126 * linearChannel(rgb.r) + .7152 * linearChannel(rgb.g) + .0722 * linearChannel(rgb.b);
		}
		/** 依出现顺序抽取 CSS 渐变里的可解析颜色（#hex 与 rgb/rgba）。 */
		function parseGradientColors(value) {
			const colors = [];
			const pattern = /#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)/g;
			let match;
			while ((match = pattern.exec(value)) !== null) {
				const parsed = parseCssColor(match[0]);
				if (parsed !== null) colors.push(parsed);
			}
			return colors;
		}
		/**
		* 从 mode/value 推出背景亮度（0..1）。
		* - color → 该色亮度；
		* - gradient → 前两个可解析色阶亮度的均值（解析失败按 media 处理 → null）；
		* - image/video/off 或解析不出 → null（未知，调用方按 media 处理）。
		*/
		function backgroundLuminance(mode, value) {
			if (mode === "color") {
				const color = parseCssColor(value);
				return color === null ? null : relativeLuminance(color);
			}
			if (mode === "gradient") {
				const stops = parseGradientColors(value);
				if (stops.length === 0) return null;
				const sample = stops.slice(0, 2);
				return sample.reduce((sum, stop) => sum + relativeLuminance(stop), 0) / sample.length;
			}
			return null;
		}
		/**
		* 解析文字方案偏好为具体 'light'（浅字）| 'dark'（深字）。
		* - 手动 light/dark 直接生效；
		* - auto：能推出背景亮度则按阈值（≥0.5 → 深字），推不出（image/video/off/
		*   解析失败）按媒体处理 → 默认浅字（light）；
		* - off：返回 null（无需文字方案）。
		*/
		function resolveTextScheme(mode, value, preference) {
			if (mode === "off") return null;
			if (preference === "light" || preference === "dark") return preference;
			const luminance = backgroundLuminance(mode, value);
			if (luminance === null) return "light";
			return luminance >= .5 ? "dark" : "light";
		}
		/** 全屏透出 token：把挡住视口的面（frame + sidebar）置透明（查实依据见文件头）。 */
		const REVEAL_TOKENS = {
			"--dsw-alias-bg-base": "transparent",
			"--dsw-specific-sidebar-fill": "transparent"
		};
		/**
		* v0.5.0（规格 E）——**应用内顶部区域**（侧栏品牌行 / 会话标题行 / 各列头行）
		* 的透出 token 集合。逐条查实（dsh-host 只读参考树，行号供复核）：
		*
		* | 面 | 源码 | 底色 |
		* |---|---|---|
		* | 应用框架 | `ui-layout/src/client/AppFrame.module.css:7` `.frame` | `--dsw-alias-bg-base` |
		* | 侧栏列 | `AppFrame.module.css:28` `.sidebarCol` | `--dsw-specific-sidebar-fill` |
		* | 侧栏内容根（品牌行所在列） | `ui-sidebar/src/client/SidebarRoot.module.css:16` `.root` | `--dsw-specific-sidebar-fill` |
		* | 侧栏品牌行 `.logoRow` / `.brand` | `SidebarRoot.module.css:90-125` | **无 background**（透明） |
		* | 会话列内容根（标题行所在列） | `ui-conversation/src/client/skeleton/ConversationRoot.module.css:7` `.root` | `--dsw-alias-bg-base` |
		* | 会话标题行 `.header` | `ConversationRoot.module.css:37-42` | **无 background**（透明，仅 border-bottom） |
		* | 详情列根 | `ui-chat/src/client/details/DetailsPanel.module.css:11` `.root` | `--dsw-alias-bg-base` |
		* | 画布 | `client/web/src/base.css:30` `body` | `--dsw-alias-bg-base` |
		*
		* 结论：**应用内顶部区域不吃任何"标题栏专属 token"** —— 品牌行/标题行本身透明，
		* 它们透出的垫面就是这两个 token（已在上面的 REVEAL_TOKENS 里置 transparent），
		* 所以顶部区域与整窗一起透出，无需第三条 token；唯一额外的联动是行内文字/分隔线
		* （`--dsw-alias-label-*` / `--dsw-alias-border-l3`，由 textScheme 调色板覆盖）。
		* 本常量把它固化成可断言的"顶部覆盖集合"，避免以后有人删掉其中一项而悄悄把顶部
		* 变回实心面。
		*
		* **OS 原生标题栏不在此列**：桌面窗口是原生标题栏（无 `titleBarOverlay`），
		* 页面无法改它 —— 需 DSH 主程序支持（`titleBarOverlay` / IPC），插件只同步
		* `<meta name="theme-color">`（浏览器/系统侧的窗口配色提示）。
		*/
		const TOP_REGION_TOKENS = ["--dsw-alias-bg-base", "--dsw-specific-sidebar-fill"];
		/**
		* 浅字方案：文字浅色 + 深色半透明表面（暗背景/未知背景媒体默认）。
		*
		* v0.4.4 (#2)：从「文字三兄弟 + 少数表面」扩成**完整语义刻度** —— 之前只覆盖
		* label-* / bg-layer-* / bubble / input / code 一族，凡是没被覆盖的 alias token
		* 仍吃 UI 主题当前配色（`ui-theme` preference=light 时全是浅色字面量）。于是
		* 「深色壁纸 + 浅色主题」下这些组件就变成白底白字、完全看不见：
		*   - 聊天区滚动到底部的圆形箭头 `.toBottom`（color: label-primary +
		*     background: --dsw-alias-button-floating-fill）
		*   - 左侧栏「新会话」按钮 `.newSession`（color: label-primary +
		*     background: --dsw-alias-button-elevated-fill），hover 走
		*     --dsw-alias-button-floating-hover
		*   - 设置弹窗里的浅色控件（--dsw-alias-button-ghost-active-fill /
		*     --dsw-alias-interactive-bg-hover-solid 等）
		*   - bubble-highlight 在被覆盖列表里却写错了值（写成深色面），深底上气泡高亮
		*     反而不亮
		*   - 遮罩 --dsw-alias-bg-mask-1 是浅色 24% 黑，暗底上把整屏压灰；elevation
		*     描边（--dsw-alias-border-l4 间接）在暗底上几乎看不见
		* 值全部照 design-platform.css 的 light 段（157–246 行）与 dark 段
		* （250–339 行）解出字面量，再按「深色半透明面」的灰阶/透明度重排；每个值都
		* 保证与其上的文字有充足对比（正文 ≥ 7:1）。
		*/
		const LIGHT_TEXT_TOKENS = {
			"--dsw-alias-label-primary": "#f2f4f8",
			"--dsw-alias-label-primary-dimmed": "#e4e7ee",
			"--dsw-alias-label-primary-bluish": "#c9d8f6",
			"--dsw-alias-label-primary-foreground": "#0f1115",
			"--dsw-alias-label-primary-inverted": "#0f1115",
			"--dsw-alias-label-secondary": "#c6cdd8",
			"--dsw-alias-label-tertiary": "#98a2b3",
			"--dsw-alias-label-caption": "#8b95a3",
			"--dsw-alias-label-dimmed": "#767e8a",
			"--dsw-alias-bg-layer-1": "rgb(10 13 18 / 0.96)",
			"--dsw-alias-bg-layer-2": "rgb(23 28 36 / 0.96)",
			"--dsw-alias-bg-layer-3": "rgb(31 37 46 / 0.97)",
			"--dsw-alias-bg-overlay": "rgb(20 25 32 / 0.97)",
			"--dsw-alias-bg-module-platform": "rgb(24 29 37 / 0.96)",
			"--dsw-alias-bg-multi-select": "rgba(255,255,255,0.16)",
			"--dsw-alias-bg-mask-1": "rgba(0,0,0,0.28)",
			"--dsw-alias-bg-mask-2": "rgba(0,0,0,0.14)",
			"--dsw-alias-bg-mask-3": "rgba(0,0,0,0.45)",
			"--dsw-alias-bg-mask-photo": "rgba(0,0,0,0.78)",
			"--dsw-alias-bg-mask-drop": "rgba(0,0,0,0.55)",
			"--dsw-alias-bg-skeleton": "rgba(255,255,255,0.08)",
			"--dsw-alias-border-l1": "rgba(255,255,255,0.08)",
			"--dsw-alias-border-l2": "rgba(255,255,255,0.16)",
			"--dsw-alias-border-l3": "rgba(255,255,255,0.22)",
			"--dsw-alias-border-l4": "rgba(255,255,255,0.28)",
			"--dsw-alias-border-inverted": "rgba(255,255,255,0.10)",
			"--dsw-alias-border-inverted2": "rgba(255,255,255,0.14)",
			"--dsw-alias-brand-primary": "#f2f4f8",
			"--dsw-alias-brand-primary-invert": "#0f1115",
			"--dsw-alias-brand-text": "#f2f4f8",
			"--dsw-alias-button-elevated-fill": "rgb(32 38 47 / 0.95)",
			"--dsw-alias-button-floating-fill": "rgb(26 31 39 / 0.96)",
			"--dsw-alias-button-floating-hover": "rgb(45 53 64 / 0.97)",
			"--dsw-alias-button-contrast-fill": "#e9ecf2",
			"--dsw-alias-button-ghost-active-fill": "rgba(255,255,255,0.18)",
			"--dsw-alias-button-ghost-active-hover": "rgba(255,255,255,0.26)",
			"--dsw-alias-button-ghost-active-border": "rgba(255,255,255,0.4)",
			"--dsw-alias-button-primary-dimmed": "rgba(255,255,255,0.16)",
			"--dsw-alias-interactive-bg-hover": "rgba(255,255,255,0.10)",
			"--dsw-alias-interactive-bg-hover-accent": "rgba(255,255,255,0.22)",
			"--dsw-alias-interactive-bg-hover-solid": "rgb(52 60 72 / 0.95)",
			"--dsw-alias-interactive-bg-active": "rgba(255,255,255,0.16)",
			"--dsw-alias-interactive-bg-hover-danger": "rgba(242,90,90,0.18)",
			"--dsw-specific-bubble": "rgb(13 17 23 / 0.96)",
			"--dsw-specific-bubble-highlight": "rgb(40 52 70 / 0.97)",
			"--dsw-specific-input-major": "rgb(6 9 13 / 0.97)",
			"--dsw-specific-menu": "rgb(24 30 38 / 0.97)",
			"--dsw-specific-selector": "rgb(255 255 255 / 0.09)",
			"--dsw-specific-login-input": "rgb(12 16 21 / 0.96)",
			"--dsw-specific-tip": "rgb(30 36 45 / 0.97)",
			"--dsw-specific-sidebar-nav-item-active": "rgba(255,255,255,0.12)",
			"--dsw-specific-sidebar-nav-item-hover": "rgba(255,255,255,0.07)",
			"--dsw-specific-sidebar-nav-item-active-accent": "rgba(86,134,254,0.32)",
			"--dsw-alias-markdown-code-block": "rgb(7 10 15 / 0.96)",
			"--dsw-alias-markdown-code-block-banner": "rgb(21 26 33 / 0.97)",
			"--dsw-alias-markdown-inline-code": "rgba(255,255,255,0.12)",
			"--dsw-alias-markdown-code-segment-selected": "rgb(31 37 46 / 0.97)",
			"--dsw-alias-markdown-code-segment-unselected": "rgb(15 19 25 / 0.96)",
			"--dsw-alias-markdown-citation": "rgb(255 255 255 / 0.12)",
			"--dsw-alias-markdown-tag": "rgba(255,255,255,0.10)",
			"--dsw-alias-markdown-placeholder": "rgba(255,255,255,0.12)",
			"--dsw-alias-toast-bg": "rgb(45 53 64 / 0.96)",
			"--dsw-alias-tooltip-bg": "rgb(40 47 57 / 0.97)",
			"--dsw-alias-scrollbar-bg-l1": "rgba(255,255,255,0.20)",
			"--dsw-alias-scrollbar-bg-l2": "rgba(255,255,255,0.24)",
			"--dsw-alias-scrollbar-hover-l1": "rgba(255,255,255,0.34)",
			"--dsw-alias-scrollbar-hover-l2": "rgba(255,255,255,0.38)"
		};
		/**
		* 深字方案：文字深色 + 浅色半透明表面（浅色背景）。值照 design-platform.css
		* 的 light 段解字面量，与浅字方案同键同刻度（只是明暗反转），保证两个方案可以
		* 互相对照维护。
		*/
		const DARK_TEXT_TOKENS = {
			"--dsw-alias-label-primary": "#1a1d24",
			"--dsw-alias-label-primary-dimmed": "#2b303a",
			"--dsw-alias-label-primary-bluish": "#1b3f80",
			"--dsw-alias-label-primary-foreground": "#f7f8fa",
			"--dsw-alias-label-primary-inverted": "#f7f8fa",
			"--dsw-alias-label-secondary": "#4c515b",
			"--dsw-alias-label-tertiary": "#646a75",
			"--dsw-alias-label-caption": "#6d747f",
			"--dsw-alias-label-dimmed": "#838a94",
			"--dsw-alias-bg-layer-1": "rgb(250 251 253 / 0.96)",
			"--dsw-alias-bg-layer-2": "rgb(255 255 255 / 0.96)",
			"--dsw-alias-bg-layer-3": "rgb(255 255 255 / 0.96)",
			"--dsw-alias-bg-overlay": "rgb(250 251 253 / 0.97)",
			"--dsw-alias-bg-module-platform": "rgb(252 253 254 / 0.96)",
			"--dsw-alias-bg-multi-select": "rgba(0,0,0,0.14)",
			"--dsw-alias-bg-mask-1": "rgba(0,0,0,0.24)",
			"--dsw-alias-bg-mask-2": "rgba(0,0,0,0.10)",
			"--dsw-alias-bg-mask-3": "rgba(0,0,0,0.48)",
			"--dsw-alias-bg-mask-photo": "rgba(0,0,0,0.88)",
			"--dsw-alias-bg-mask-drop": "rgba(255,255,255,0.7)",
			"--dsw-alias-bg-skeleton": "rgba(0,0,0,0.06)",
			"--dsw-alias-border-l1": "rgba(0,0,0,0.06)",
			"--dsw-alias-border-l2": "rgba(0,0,0,0.1)",
			"--dsw-alias-border-l3": "rgba(0,0,0,0.14)",
			"--dsw-alias-border-l4": "rgba(0,0,0,0.18)",
			"--dsw-alias-border-inverted": "rgba(0,0,0,0.08)",
			"--dsw-alias-border-inverted2": "rgba(0,0,0,0.12)",
			"--dsw-alias-brand-primary": "#0f1115",
			"--dsw-alias-brand-primary-invert": "#f7f8fa",
			"--dsw-alias-brand-text": "#0f1115",
			"--dsw-alias-button-elevated-fill": "rgb(255 255 255 / 0.96)",
			"--dsw-alias-button-floating-fill": "rgb(255 255 255 / 0.97)",
			"--dsw-alias-button-floating-hover": "rgb(241 243 245 / 0.98)",
			"--dsw-alias-button-contrast-fill": "#43454a",
			"--dsw-alias-button-ghost-active-fill": "rgba(15,17,21,0.10)",
			"--dsw-alias-button-ghost-active-hover": "rgba(15,17,21,0.16)",
			"--dsw-alias-button-ghost-active-border": "rgba(15,17,21,0.32)",
			"--dsw-alias-button-primary-dimmed": "rgba(15,17,21,0.12)",
			"--dsw-alias-interactive-bg-hover": "rgba(15,17,21,0.06)",
			"--dsw-alias-interactive-bg-hover-accent": "rgba(15,17,21,0.14)",
			"--dsw-alias-interactive-bg-hover-solid": "rgb(233 236 242 / 0.95)",
			"--dsw-alias-interactive-bg-active": "rgba(15,17,21,0.12)",
			"--dsw-alias-interactive-bg-hover-danger": "rgba(236,19,19,0.08)",
			"--dsw-specific-bubble": "rgb(250 251 253 / 0.96)",
			"--dsw-specific-bubble-highlight": "rgb(228 237 253 / 0.97)",
			"--dsw-specific-input-major": "rgb(255 255 255 / 0.97)",
			"--dsw-specific-menu": "rgb(255 255 255 / 0.97)",
			"--dsw-specific-selector": "rgba(0,0,0,0.06)",
			"--dsw-specific-login-input": "rgb(255 255 255 / 0.96)",
			"--dsw-specific-tip": "rgb(245 246 247 / 0.97)",
			"--dsw-specific-sidebar-nav-item-active": "rgba(0,0,0,0.07)",
			"--dsw-specific-sidebar-nav-item-hover": "rgba(0,0,0,0.04)",
			"--dsw-specific-sidebar-nav-item-active-accent": "rgba(65,118,230,0.22)",
			"--dsw-alias-markdown-code-block": "rgb(248 250 253 / 0.96)",
			"--dsw-alias-markdown-code-block-banner": "rgb(255 255 255 / 0.97)",
			"--dsw-alias-markdown-inline-code": "rgba(0,0,0,0.07)",
			"--dsw-alias-markdown-code-segment-selected": "rgb(255 255 255 / 0.97)",
			"--dsw-alias-markdown-code-segment-unselected": "rgb(241 243 245 / 0.96)",
			"--dsw-alias-markdown-citation": "rgba(0,0,0,0.08)",
			"--dsw-alias-markdown-tag": "rgba(0,0,0,0.06)",
			"--dsw-alias-markdown-placeholder": "rgba(0,0,0,0.08)",
			"--dsw-alias-toast-bg": "rgb(53 54 56 / 0.96)",
			"--dsw-alias-tooltip-bg": "rgb(44 44 46 / 0.97)",
			"--dsw-alias-scrollbar-bg-l1": "rgba(0,0,0,0.16)",
			"--dsw-alias-scrollbar-bg-l2": "rgba(0,0,0,0.2)",
			"--dsw-alias-scrollbar-hover-l1": "rgba(0,0,0,0.28)",
			"--dsw-alias-scrollbar-hover-l2": "rgba(0,0,0,0.32)"
		};
		/**
		* 具体方案的全部 token 覆盖（含全屏透出 token）。键名覆盖 REVEAL_TOKENS 之外的
		* 调色板；返回对象可直接序列化进 body{--x: v !important} 规则。
		*/
		function tokensForTextScheme(scheme) {
			return {
				...REVEAL_TOKENS,
				...scheme === "light" ? LIGHT_TEXT_TOKENS : DARK_TEXT_TOKENS
			};
		}
		/**
		* 遮罩/面型阴影只在 `body, body *` 上被主题**预替换成字面量**（见 ui-theme
		* `styles/gradient-shadow-text.css:26-35` 的注释），所以在 body 上覆盖
		* `--dsw-alias-bg-mask-*` / `--dsw-alias-border-l4` 对设置弹窗的遮罩
		* （`SettingsRoot.module.css` 的 `.mask` 读 --dsw-alias-bg-mask-1）与
		* `--dsw-elevation-*` 无效 —— 必须用同特异性的 `body *` 规则重写，才能让它
		* 按自己看到的描边色/遮罩色重新求值。键名 → 覆盖值，供 buildStyleText 输出。
		*/
		const BODY_DESCENDANT_TOKEN_SELECTORS = [
			"--dsw-alias-bg-mask-1",
			"--dsw-alias-bg-mask-2",
			"--dsw-alias-bg-mask-3",
			"--dsw-alias-bg-mask-photo",
			"--dsw-alias-bg-mask-drop"
		];
		/** 遮罩类 token 里需要以 `body *` 发出去的那些（值取自同一份调色板）。 */
		function maskTokensForTextScheme(scheme) {
			const all = scheme === "light" ? LIGHT_TEXT_TOKENS : DARK_TEXT_TOKENS;
			const out = {};
			for (const name of BODY_DESCENDANT_TOKEN_SELECTORS) {
				const value = all[name];
				if (typeof value === "string") out[name] = value;
			}
			return out;
		}
		/**
		* 毛玻璃质感：把「承载文字的内容面」token 的透明度从 ~0.96 压到 ~0.55，配合
		* 下方 {@link GLASS_BACKDROP_FILTER} 的 backdrop-filter 让背景透过表面并模糊，
		* 呈现磨砂玻璃。只覆盖内容面（面板/气泡/输入/菜单/代码块/浮层），文字与边框
		* token 不动 —— 文字对比度仍由文字 token 与背后模糊后的背景共同保证。
		*/
		const GLASS_SURFACE_TOKENS_LIGHT = {
			"--dsw-alias-bg-layer-1": "rgb(10 13 18 / 0.55)",
			"--dsw-alias-bg-layer-2": "rgb(23 28 36 / 0.55)",
			"--dsw-alias-bg-layer-3": "rgb(31 37 46 / 0.56)",
			"--dsw-alias-bg-overlay": "rgb(20 25 32 / 0.58)",
			"--dsw-alias-bg-module-platform": "rgb(24 29 37 / 0.55)",
			"--dsw-alias-button-elevated-fill": "rgb(32 38 47 / 0.6)",
			"--dsw-alias-button-floating-fill": "rgb(26 31 39 / 0.6)",
			"--dsw-alias-button-floating-hover": "rgb(45 53 64 / 0.62)",
			"--dsw-alias-interactive-bg-hover-solid": "rgb(52 60 72 / 0.6)",
			"--dsw-specific-bubble": "rgb(13 17 23 / 0.55)",
			"--dsw-specific-bubble-highlight": "rgb(40 52 70 / 0.6)",
			"--dsw-specific-input-major": "rgb(6 9 13 / 0.55)",
			"--dsw-specific-menu": "rgb(24 30 38 / 0.56)",
			"--dsw-specific-login-input": "rgb(12 16 21 / 0.55)",
			"--dsw-specific-tip": "rgb(30 36 45 / 0.56)",
			"--dsw-alias-markdown-code-block": "rgb(7 10 15 / 0.55)",
			"--dsw-alias-markdown-code-block-banner": "rgb(21 26 33 / 0.56)",
			"--dsw-alias-markdown-code-segment-selected": "rgb(31 37 46 / 0.56)",
			"--dsw-alias-markdown-code-segment-unselected": "rgb(15 19 25 / 0.55)",
			"--dsw-alias-toast-bg": "rgb(45 53 64 / 0.6)",
			"--dsw-alias-tooltip-bg": "rgb(40 47 57 / 0.6)"
		};
		const GLASS_SURFACE_TOKENS_DARK = {
			"--dsw-alias-bg-layer-1": "rgb(250 251 253 / 0.55)",
			"--dsw-alias-bg-layer-2": "rgb(255 255 255 / 0.55)",
			"--dsw-alias-bg-layer-3": "rgb(255 255 255 / 0.55)",
			"--dsw-alias-bg-overlay": "rgb(250 251 253 / 0.58)",
			"--dsw-alias-bg-module-platform": "rgb(252 253 254 / 0.55)",
			"--dsw-alias-button-elevated-fill": "rgb(255 255 255 / 0.6)",
			"--dsw-alias-button-floating-fill": "rgb(255 255 255 / 0.6)",
			"--dsw-alias-button-floating-hover": "rgb(241 243 245 / 0.62)",
			"--dsw-alias-interactive-bg-hover-solid": "rgb(233 236 242 / 0.6)",
			"--dsw-specific-bubble": "rgb(250 251 253 / 0.55)",
			"--dsw-specific-bubble-highlight": "rgb(228 237 253 / 0.6)",
			"--dsw-specific-input-major": "rgb(255 255 255 / 0.55)",
			"--dsw-specific-menu": "rgb(255 255 255 / 0.56)",
			"--dsw-specific-login-input": "rgb(255 255 255 / 0.55)",
			"--dsw-specific-tip": "rgb(245 246 247 / 0.56)",
			"--dsw-alias-markdown-code-block": "rgb(248 250 253 / 0.55)",
			"--dsw-alias-markdown-code-block-banner": "rgb(255 255 255 / 0.56)",
			"--dsw-alias-markdown-code-segment-selected": "rgb(255 255 255 / 0.56)",
			"--dsw-alias-markdown-code-segment-unselected": "rgb(241 243 245 / 0.55)",
			"--dsw-alias-toast-bg": "rgb(53 54 56 / 0.6)",
			"--dsw-alias-tooltip-bg": "rgb(44 44 46 / 0.6)"
		};
		/** 毛玻璃质感下的内容面 token 覆盖（仅 surface 键；随 body[data-dsh-bg-glass] 输出）。 */
		function glassSurfaceTokensForTextScheme(scheme) {
			return scheme === "light" ? GLASS_SURFACE_TOKENS_LIGHT : GLASS_SURFACE_TOKENS_DARK;
		}
		/** 毛玻璃的 backdrop 滤镜（blur + 轻微饱和，经典磨砂玻璃）。 */
		const GLASS_BACKDROP_FILTER = "blur(16px) saturate(1.2)";
		/**
		* 需要真正「背后来模糊」的浮层表面选择器（CSS 模块类名哈希不稳定，故只列出
		* 有稳定 data/role 钩子的容器）：我们的抽屉、设置/弹窗、输入卡。其余内容面
		* （气泡/菜单等）只靠上面的表面 token 半透明获得"透出"玻璃感（不模糊）。
		*/
		const GLASS_BACKDROP_SELECTOR = "[data-dsh-bg-drawer], div[role=\"dialog\"][aria-modal=\"true\"], [data-composer-card]";
		/**
		* 预览用取色（#5）：直接复用上面两份**已经解成字面量**的调色板，保证「预览里
		* 看到的对比度」就是「应用后真实 UI 的对比度」——预览不会因为自己另写一套色而
		* 说谎。scheme 为 null（mode=off，未设背景）时预览底板用中性灰（说明此时用的是
		* 界面默认皮肤），模拟 UI 仍按浅字方案给色。
		*/
		function previewThemeFor(scheme) {
			const all = scheme === "dark" ? DARK_TEXT_TOKENS : LIGHT_TEXT_TOKENS;
			return {
				text: all["--dsw-alias-label-primary"],
				secondary: all["--dsw-alias-label-secondary"],
				surface: all["--dsw-alias-bg-layer-2"],
				input: all["--dsw-specific-input-major"],
				border: all["--dsw-alias-border-l2"],
				fallbackBg: "#8b939e"
			};
		}
		/**
		* fit 到具体 CSS 值（v0.3 规格 2）：
		* fill=100% 100% / cover / contain / center=不缩放居中 / tile=repeat。
		* video 的 tile 无实际意义（单帧不可平铺），回落 cover。
		*
		* 注：返回的 backgroundPosition / objectPosition 只表达「居中」的缺省位置；
		* image/video 的实际 position 由客户端 buildStyleText 用
		* {@link focusPositionCss}（posX/posY 百分比焦点，默认 50/50=居中）覆盖。
		*/
		function fitCssFor(fit, mode) {
			switch (fit) {
				case "fill": return {
					backgroundSize: "100% 100%",
					backgroundPosition: "center",
					backgroundRepeat: "no-repeat",
					objectFit: "fill",
					objectPosition: "center"
				};
				case "contain": return {
					backgroundSize: "contain",
					backgroundPosition: "center",
					backgroundRepeat: "no-repeat",
					objectFit: "contain",
					objectPosition: "center"
				};
				case "center": return {
					backgroundSize: "auto",
					backgroundPosition: "center",
					backgroundRepeat: "no-repeat",
					objectFit: "none",
					objectPosition: "center"
				};
				case "tile": return {
					backgroundSize: "auto",
					backgroundPosition: "left top",
					backgroundRepeat: "repeat",
					objectFit: mode === "video" ? "cover" : "none",
					objectPosition: mode === "video" ? "center" : "left top"
				};
				default: return {
					backgroundSize: "cover",
					backgroundPosition: "center",
					backgroundRepeat: "no-repeat",
					objectFit: "cover",
					objectPosition: "center"
				};
			}
		}
		/**
		* 焦点定位 → CSS position 百分比文本（v0.3.1 规格 C「定位到某一块」）。
		*
		* 语义与公式（标准 CSS 百分比定位）：
		* background-position / object-position 的百分比 p%（0..100）把「内容上
		* 距起点 p% 的点」对齐到「容器/盒子上距起点 p% 的点」。因此：
		* - cover / contain / center 下即以该百分比点为可见中心：50/50=居中
		*   （与 center 等价），0/0=看左上角，100/100=看右下角；
		* - fill（拉伸铺满）下容器与内容同框，百分比定位无裁剪差异，仍按此公式生效；
		* - tile（平铺）下作用于图案起点偏移（background-position 对重复背景即偏移量）。
		* 返回 `${posX}% ${posY}%`；非有限数回退 50，越界值钳制到 0..100。
		*/
		function focusPositionCss(posX, posY) {
			const clampPct = (raw, fallback) => {
				if (typeof raw !== "number" || !Number.isFinite(raw)) return fallback;
				return Math.min(100, Math.max(0, raw));
			};
			return `${clampPct(posX, 50)}% ${clampPct(posY, 50)}%`;
		}
		/** CSS 字面量转义（url("...") 内防逃逸）。真实层与预览画布共用。 */
		function cssEscape(value) {
			return value.replace(/[\\"]/g, (ch) => `\\${ch}`);
		}
		/** 缩放/缩放系数钳制到 1..3（zoom；缺省 1），吸附 0.05 步长。 */
		function clampZoom(raw, fallback = 1) {
			return Math.min(3, Math.max(1, Math.round((typeof raw === "number" && Number.isFinite(raw) ? raw : fallback) * 20) / 20));
		}
		/** 媒体自由缩放钳制到 0.25..4（scale；缺省 1），吸附 0.05 步长。 */
		function clampScale(raw, fallback = 1) {
			return Math.min(4, Math.max(BG_SCALE_MIN, Math.round((typeof raw === "number" && Number.isFinite(raw) ? raw : fallback) * 20) / 20));
		}
		/** 不透明度钳制到 0..1（缺省 1）。 */
		function clampOpacity(raw, fallback = 1) {
			return Math.min(1, Math.max(0, typeof raw === "number" && Number.isFinite(raw) ? raw : fallback));
		}
		/** 乘法结果定点回圆（避免 1.5*1.15 = 1.7249999… 这类尾巴进 CSS）。 */
		function round2(n) {
			return Math.round(n * 100) / 100;
		}
		/**
		* zoom → background-size（v0.5.0 规格 B：image 的缩放走 background-size）。
		*
		* 语义：把 fit 给出的基准尺寸**按倍数放大**。CSS 里唯一能对任意 fit 结果再乘
		* 系数的形式是百分比分量的 `calc()`，所以：
		* - 基准是百分比（fill = `100% 100%`）→ `calc(100% * 1.5) calc(100% * 1.5)`；
		*   配合 `background-position: posX% posY%` 即"把可见窗口聚焦到 posX/posY 处并放大"
		*   （与以焦点为原点做等比放大等价）；
		* - 基准是关键字（cover / contain / auto）→ **CSS 无法表达"cover 再乘系数"**
		*   （关键字尺寸依赖图片固有宽高比，运行期才知道），此时 zoom 走元素
		*   `transform: scale()`（见 {@link bgMediaRender} 的 imageFactor 计算），
		*   视觉等价：以焦点为原点等比放大。
		* @param baseSize - fitCssFor(fit,'image').backgroundSize（'100% 100%' / cover / …）。
		* @param zoom - 1..3（1 时原样返回，保持最小 CSS）。
		*/
		function zoomBackgroundSize(baseSize, zoom) {
			const z = clampZoom(zoom);
			if (z === 1) return baseSize;
			return baseSize.split(/\s+/).filter((part) => part !== "").map((part) => /^[\d.]+%$/.test(part) ? `calc(${part} * ${z})` : part).join(" ");
		}
		/**
		* 计算 image/video 的渲染 CSS（v0.5.0 规格 A「与真实渲染同源同参」）。
		*
		* 单一真源的意义：真实全屏层（`<style id="dsh-bg-style">` 文本）与设置页里的
		* **预览画布**都调本函数 —— 预览不可能与真实效果漂移（fit/焦点/zoom/scale/
		* opacity 全部同一份公式）。mockup 缩略图那种"另写一套"的做法 v0.5.0 已删除。
		*
		* zoom 与 scale 的分工（两者都是等比缩放，但轴不同）：
		* - zoom（1..3，v0.5.0 新字段，面板主控件）：只放大。image 在 fit=fill 时进
		*   `background-size`，其余 fit 与 video 一样进 `transform`；
		* - scale（0.25..4，v0.4.3 兼容字段）：可缩小可放大，恒走 `transform`；
		* - 两者同时非 1 时相乘（zoom 已进 background-size 的那一支不再重复计入 transform）。
		*/
		function bgMediaRender(input) {
			const fit = fitCssFor(input.fit, input.mode);
			const position = focusPositionCss(input.posX, input.posY);
			const zoom = clampZoom(input.zoom);
			const scale = clampScale(input.scale);
			const opacity = clampOpacity(input.opacity);
			if (input.mode === "image" && input.src !== null) {
				const zoomInSize = input.fit === "fill";
				const factor = round2((zoomInSize ? 1 : zoom) * scale);
				return {
					image: {
						backgroundImage: `url("${cssEscape(input.src)}")`,
						backgroundSize: zoomBackgroundSize(fit.backgroundSize, zoomInSize ? zoom : 1),
						backgroundPosition: position,
						backgroundRepeat: fit.backgroundRepeat,
						transform: factor === 1 ? null : `scale(${factor})`,
						transformOrigin: position
					},
					video: null,
					opacity
				};
			}
			if (input.mode === "video" && input.src !== null) {
				const factor = round2(zoom * scale);
				return {
					image: null,
					video: {
						objectFit: fit.objectFit,
						objectPosition: position,
						transform: factor === 1 ? null : `scale(${factor})`,
						transformOrigin: position
					},
					opacity
				};
			}
			return {
				image: null,
				video: null,
				opacity
			};
		}
		/**
		* 背景 → 窗口/浏览器侧配色提示（`<meta name="theme-color">`）。
		*
		* 为什么需要它：ui-layout 的 ThemePresenter（theme-presenter.ts:54）把该 meta
		* 设成 `getComputedStyle(body).backgroundColor`，而被本插件置 transparent 的
		* body 背景算出来是透明 → meta 失去意义。于是本插件按当前背景自己给一个稳定值：
		* - color → 该颜色本身；gradient → 前两个可解析色阶的均值；
		* - image/video → 亮度未知，按**文字方案反推**（浅字=深底 → 深色窗口；深字=浅底 →
		*   浅色窗口），用两套方案各自的 surface 字面量；
		* - off → null（调用方恢复原值）。
		* @returns CSS 颜色文本；null = 无建议值。
		*/
		function bgThemeColorFor(mode, value, resolvedText) {
			const rgbText = (rgb) => `rgb(${rgb.r} ${rgb.g} ${rgb.b})`;
			if (mode === "color") {
				const parsed = parseCssColor(value);
				return parsed === null ? null : rgbText(parsed);
			}
			if (mode === "gradient") {
				const stops = parseGradientColors(value);
				if (stops.length === 0) return null;
				const sample = stops.slice(0, 2);
				return rgbText({
					r: Math.round(sample.reduce((sum, c) => sum + c.r, 0) / sample.length),
					g: Math.round(sample.reduce((sum, c) => sum + c.g, 0) / sample.length),
					b: Math.round(sample.reduce((sum, c) => sum + c.b, 0) / sample.length)
				});
			}
			if (mode === "image" || mode === "video") return resolvedText === "dark" ? "#f7f8fa" : "#0f1115";
			return null;
		}
		//#endregion
		//#region src/client/index.ts
		/**
		* dsh-bg-switch —— browser client half（v0.6.0：右侧抽屉交互 + 侧栏入口 +
		* 毛玻璃质感 + 滑动降透明；预览画布与独立设置窗口已移除）。
		*
		* v0.6.0（本轮）：
		* - **交互迁移**：背景不再进设置页（settings.section 注册移除），改为两个 slot：
		*   `sidebar.footer.action`（设置按钮上方的「更换壁纸」按钮）切换右侧抽屉，
		*   `shell.overlay`（聊天界面右侧滑出的抽屉）承载原背景设置内容（BgPanel）。
		* - **去掉预览**：预览画布（dsh-bg-canvas）与「按住预览/预览模式」降透明 UI 移除。
		* - **滑动降透明**：拖动定位/透明度/缩放滑杆时（pointerdown→pointerup），抽屉
		*   自身 opacity 过渡到 0.22，松开恢复 —— 目标就是我们自己的抽屉，不再动宿主
		*   设置弹窗 DOM（旧的 resolveDimTarget/applyUiDim/previewMode 机制删除）。
		* - **去掉独立窗口**：/dsh-bg-panel 路由（src/panel.ts）与「在独立窗口打开」按钮
		*   删除。
		* - **毛玻璃质感**：新增持久化字段 `glass`（bool，默认 false）；开启后内容面 token
		*   压到 ~0.55 透明，并对抽屉/弹窗/输入卡做 backdrop-filter 模糊（bg-palette 的
		*   glassSurfaceTokensForTextScheme + GLASS_BACKDROP_*，buildStyleText 输出
		*   `body[data-dsh-bg-glass]` 作用域）。
		*
		* 历史（v0.5.0 A–E）：
		* - **A 预览画布**：设置页里的 mini 界面缩略图（v0.4.4 #5）**换成纯预览画布**
		*   （`data-testid=dsh-bg-canvas`，16:9、高度 380–440px、宽度不超容器）——
		*   画布里**只渲染当前背景本身**（color/gradient/image/video），不再有任何侧栏/
		*   聊天/气泡等应用 UI（用户要的是"看背景效果"，不是"看界面缩略图"）。渲染与
		*   真实全屏层**同源同参**：两边都调 `bgMediaRender()`（fit 五档 / posX / posY /
		*   zoom / scale / opacity 同一份公式），image 用 `background-*`、video 用独立
		*   `<video muted autoplay loop playsinline>` 元素（与真实层的 `<video>` 互不
		*   干扰 —— 预览不参与播放控制，播放控制只作用于真实层的元素）。off/无源时是
		*   虚线占位 + 「未设置背景」。
		* - **B zoom**：新增持久化字段 `zoom`（1..3，step 0.05，默认 1）——在 fit 基准
		*   尺寸上"聚焦放大"：image 的 fill 档进 `background-size: calc(100% * z)`
		*   （等价于把可见窗口聚焦到 posX/posY 处并放大），其余 fit 档与 video 走
		*   `transform: scale(z)` + `transform-origin: posX% posY%`；面板新增「缩放」
		*   滑杆 100%–300%，`bg_apply` 增可选 zoom。v0.4.3 的 scale（0.25–4）保留为
		*   兼容字段（旧 settings 仍生效），面板上的缩放控件改为 zoom（写 zoom 时顺带把
		*   遗留 scale 归 1，避免两条缩放轴叠加）。
		* - **C 调参降透明**：拖我们的壁纸控件（pointerdown→pointerup）或按住
		*   「按住预览」时，把**设置弹窗**（`div[role="dialog"][aria-modal="true"]`，
		*   从面板根元素向上找；找不到就只降我们面板自身）的内联 opacity 过渡到 0.1
		*   （transition 150ms），松开/失焦恢复 —— 记录写入前的内联值并**完整还原**
		*   （卸载/异常路径也还原：写入抛错则状态回滚、绝不留下"以为已降透明"的记录）。
		*   另有 sticky「预览模式」开关保持降透明，并在 `<body>` 上挂一条**不在弹窗内**
		*   的提示条（弹窗整体 10% 时它仍可读）：「预览模式：松开/关闭以恢复界面」+
		*   「恢复界面」按钮。
		* - **D 独立设置窗口**：host 新增 `/dsh-bg-panel` 自包含设置页（src/panel.ts，
		*   GET 页面 / GET state / POST set）+ 主设置页「在独立窗口打开」按钮
		*   （window.open(location.origin + '/dsh-bg-panel', '_blank', 'width=520,height=760')，
		*   桌面端由主程序交给系统浏览器 = 真正独立窗口）。
		* - **E 顶部区域**：查实应用内顶部（侧栏品牌行 / 会话标题行 / 列头行）**没有**
		*   标题栏专属 token，它们本身透明、垫面就是 `--dsw-alias-bg-base` 与
		*   `--dsw-specific-sidebar-fill`（已在透出集合里 transparent），故随整窗透出；
		*   新增可断言的 `TOP_REGION_TOKENS` 固化该集合，并同步
		*   `<meta name="theme-color">`（ThemePresenter 会因为 body 背景被我们置透明而
		*   算出透明，这里按背景自算一个稳定值）。**OS 原生标题栏改不了**（需 DSH 主程序
		*   支持 titleBarOverlay/IPC）—— README 已写明。
		*
		* v0.4.4（对比度补齐 + 弹窗拖动 + 预览）：
		* - #1 点预设皮肤不再跳 tab：删掉 `useEffect([snap.mode]) → setTab` 的自动切
		*   tab；tab 只在面板挂载时按当前背景初始化一次，之后完全跟着点击走。原先点
		*   「极夜」（mode: off→color）会立刻从「预设皮肤」弹到「纯色」、「深蓝紫」同理
		*   弹到「渐变」，看起来像点一下跳了页。
		* - #2 文字颜色不跟着背景走（白底白字）：调色板从「文字三兄弟 + 少数表面」扩成
		*   **完整语义刻度**（按钮/交互态/遮罩/品牌/代码/滚动条…），见 bg-palette.ts 头注
		*   LIGHT/DARK_TEXT_TOKENS。之前的漏网 token 一直吃 UI 主题当前配色（浅色主题下
		*   全是浅色面），于是滚动到底部圆钮、左侧「新会话」、设置弹窗浅色控件都变成白
		*   底白字；bubble-highlight 还被写成了深色面。另外：
		*   · 遮罩/浮层族（--dsw-alias-bg-mask-*）在主题里是**预替换字面量**、声明在
		*     `body, body *`，只在 body 上覆盖对设置弹窗无效 → 增加 `body *` 同特异性
		*     重写（maskTokensForTextScheme）；
		*   · 设置弹窗的全屏遮罩会整块挡住自管背景层 → 置透明，保持「背景全屏透出」。
		*     （不做全局 text-shadow：深字方案下会在浅底上描出黑边，反而更糊。）
		* - #3「恢复默认」移到 tab 栏右侧：只重置背景命名空间（不再是每个 tab 各一个按钮
		*   的观感），tablist 收进内层容器，恢复默认不进 tab 序列。
		* - #4 设置弹窗可拖动：MutationObserver 等 role=dialog 出现 → attachDialogDrag
		*   在面板本体上接 pointerdown（命中控件不下手），位移写 inline transform
		*   （priority=important），关闭/卸载即复位，下次打开仍居中。
		* - #5 tab 布局下新增「背景预览」：mini 界面缩略图 + 取色示例行，取色直接复用
		*   调色板字面量（previewThemeFor），保证预览里的对比度 = 应用后的真实对比度。
		*
		* v0.4.3（tab 隔离 + 自由缩放 + 恢复默认强制回默认）：
		* - 媒体/视频专属控件随 tab 隔离（#1）：进度条 / 视频控制行 / 音量 / 适配 / 透明度 /
		*   定位 / 缩放只在"当前背景对应的那个媒体 tab"（image 或 video）里出现；切到预设
		*   皮肤等别的 tab 全部隐藏（背景本身不受影响）。文字方案是全局项，始终可见。
		* - 媒体自由缩放（#2）：新增持久化字段 `scale`（0.25–4，1=不缩放），image 用
		*   layer 的 transform: scale + transform-origin（缩放中心 = 焦点 posX/posY），
		*   video 用 <video> 的同一对属性；UI 滑杆 25%–400%，bg_apply 亦支持 scale
		*   （倍数或百分数）。scale=1 时不输出 transform（保持最小 CSS）。
		* - 恢复默认强制回默认（#3）：resetAll 不再做"仅写变化字段"的过滤，一次性原子
		*   提交**全部**默认字段（mode=off、value/mediaKey 空、fit/textScheme/loop 回
		*   config 默认、opacity=1、posX/posY=50、scale=1、volume=1），user 层里的任何
		*   残留（透明度/定位/缩放/旧媒体键）都会被显式覆盖。
		*
		* v0.4.1（QA 回归修复 + 面板改版）：
		* - tabs 布局：设置页改为「预设皮肤 / 纯色 / 渐变 / 壁纸图片 / 背景视频」五个 tab，
		*   通用控制（适配/文字/透明度/定位/音量/视频控制/恢复默认）仍在底部常驻。
		* - 选项微调不再误清 mediaKey（#3/#4）：拖透明度/定位、改 fit 等"选项微调"（mode
		*   与 value 未变、未给新 mediaKey）不再把本地图/视频的来源键清掉 —— 壁纸不再
		*   拖动中消失/变白；也不会把清键写进 settings 造成重启后丢壁纸。
		* - 视频换源清旧键（#9）：本地视频切到远程 URL（mode=video 且 value 变化）会清掉
		*   旧 mediaKey —— 引擎不再优先旧键、死播本地文件，而会真的去尝试新源并报错。
		* - 恢复默认持久化（#2）：resetAll 仍全字段回默认（mode=off、定位/透明度/音量回
		*   50/50/100%），配合下方"一次原子提交"，重启后不再回旧壁纸/旧定位。
		* - 一次变更 = 一次原子 mutate（#2/#4/#6 防回滚）：~300ms 防抖后把所有待写字段
		*   合并为**单次 scope.mutate**（逐字段 set 仅作受限 scope 回退），把多轮单字段
		*   写入带来的镜像整文档重载/落盘竞态窗口从 N 个往返压到 1 个。
		* - 设置页回显当前背景（#5）：重启/换源/恢复默认后，作者输入框回显当前生效值
		*   —— 本地图/视频 value 记原文件名/路径（UI 上传保留 file.name、bg_apply 保留
		*   完整路径），远程 URL 原样显示，不再空白。
		* - 报错弹窗（#7）：输入校验错误与视频/应用硬错误以弹窗展示（点「知道了」关闭，
		*   数据源 status.error 中 errVideo* / errApply）；自动播放被拒/网络慢等软提示仍走
		*   面板内提示行，不打断操作。
		* - 视频进度条（#8）：视频控制行新增 seek 滑杆 + mm:ss 时间（timeupdate 实时推进，
		*   bgVideoSeek 支持拖动定位；时长元数据未就绪时禁用）。
		*
		* v0.4 关键决策（对应桌面实测根因，细节在相关代码处注释）：
		* - 单渲染源：host style.ts 的 index-inject 媒体 CSS 停用（src/style.ts no-op、
		*   src/index.ts 不再挂载），视觉只归本引擎 —— 修图片"重叠"（旧固定 center/cover
		*   与引擎同时生效各画一层）。
		* - 本地媒体统一上传+伺服：file 不再内联 data URI 进 settings（巨型 base64 每次
		*   持久化整文件重写是拖慢定位滑杆的根因）—— fetch POST /dsh-bg-media/upload 拿
		*   mediaKey，setBg(mode,'',{mediaKey})；资源解析 bgResourceUrl = mediaKey 非空 →
		*   /dsh-bg-media/<key>，否则 value 直接当 URL。
		* - 滑杆 onChange 只本地乐观 apply（一次）；持久化 ~300ms 防抖、单字段单次 set；
		*   adopt 只以 settings 镜像为权威 + applyKey 去重，pending 字段保持本地值直到镜像
		*   追上（不倒退不振荡）。
		* - 恢复默认 = resetAll 整命名空间重置（mode/value/mediaKey 清空、fit/textScheme/
		*   loop 回 config 默认、opacity=1、posX/posY=50、volume=1）；视频 stop 停在当前帧；
		*   文本框 Enter 应用。
		*
		* 机制（对照官方 ui-theme / ui-settings 源码实现，无 @deepseek-ai 值导入）：
		* - 服务协作：ctx.slots（设置页注册）、ctx.settingsScope（settings 镜像读写）、
		*   ctx.locale（双语文案）。type-only 声明保持类型、值零导入。
		* - 渲染引擎（规格 2/7）：
		*   · 自管 DOM：document.body 末尾一个 <div data-dsh-bg-layer>（fixed/inset:0/
		*     z-index:-1/pointer-events:none），其下承载 color/gradient/image 的 CSS
		*     background 或 <video> 子元素；全部 CSS 集中写进插件自管的
		*     <style id="dsh-bg-style">（随生命周期挂/摘，避免逐条 body.style）。
		*   · 「全屏透出」：查实结论（dsh-host 只读树，见 src/client/bg-palette.ts 头注）
		*     —— AppFrame.module.css .frame 吃 --dsw-alias-bg-base、.sidebarCol 吃
		*     --dsw-specific-sidebar-fill；web/src/base.css body 背景 = bg-base 变量
		*     （html 无背景 → 传播到画布）。style 内把这两个 token 置 transparent
		*     !important 后，壁纸透出整窗（含侧栏/详情列）。
		*   · 表面/文字（规格 1）：按 textScheme（auto 依 Rec.709 亮度推断；image/video
		*     推断不出 → 浅字默认）把 body 上的 label/layer/overlay/border/气泡/输入/
		*     代码 token 覆盖成 浅字+深色半透明 或 深字+浅色半透明 两套字面量（无 var
		*     自引用，见 bg-palette）。
		*   · v0.3.1 媒体渲染扩展：image/video 支持 layer opacity（透明度 0..1）与
		*     background-position / object-position 焦点（posX/posY 百分比，
		*     见 bg-palette.focusPositionCss 的公式注释）；gradient/color 不支持。
		*   · 卸载：ctx.effect 清理时 remove style + layer → 外观完整还原。
		* - 持久化：settings 命名空间 'dsh-bg'（host 半注册并落盘）。UI/工具写入的
		*   字段 = mode/value/fit/textScheme/loop/mediaKey/opacity/posX/posY；imageExt
		*   等只读镜像字段由 host schema 默认携带，UI 从这里读限制与默认（无 scope 时
		*   用内置默认）。
		* - 视频（规格 3/6）：mode video 时 layer 内建 <video autoplay muted loop
		*   playsinline>；本地视频 src=/dsh-bg-media/<mediaKey>（host Range 伺服），
		*   远端用 http(s) URL。面板视频控制（播放/暂停/停止/倍速/循环）经模块级
		*   bgVideo* 函数作用到同一 <video>（运行时态；loop 可选持久化）。
		* - 视频错误可见化（v0.3.1 规格 A）：<video> 的 error/stalled/suspend 与
		*   play() 拒绝不再静默 —— 可读信息写进 snapshot.status.error（字典 errVideo*
		*   键，面板红色错误行展示，data-testid=dsh-bg-status-error）；playing/canplay
		*   清 error（自动播放被拒的提示保留到真正开始播放）。applyBgState/setBg 的
		*   即时应用包 try/catch：异常 → status.error=errApply（不再吞掉）。
		*/
		const PRESETS = [
			{
				mode: "off",
				value: "",
				key: "default"
			},
			{
				mode: "gradient",
				value: "linear-gradient(135deg, #1e2a78, #2b1055)",
				key: "deep"
			},
			{
				mode: "gradient",
				value: "linear-gradient(160deg, #0f2027, #203a43, #2c5364)",
				key: "ocean"
			},
			{
				mode: "color",
				value: "#0d1117",
				key: "night"
			},
			{
				mode: "color",
				value: "#f3f4f6",
				key: "mist"
			},
			{
				mode: "color",
				value: "#2b2d42",
				key: "ink"
			}
		];
		const PRESET_LABELS_ZH = {
			default: "默认",
			deep: "深蓝紫",
			ocean: "深海",
			night: "极夜",
			mist: "晨雾",
			ink: "墨蓝"
		};
		const PRESET_LABELS_EN = {
			default: "Default",
			deep: "Deep purple",
			ocean: "Ocean",
			night: "Night",
			mist: "Mist",
			ink: "Ink blue"
		};
		function defaultSnapshot() {
			return {
				mode: "off",
				value: "",
				fit: DEFAULT_BG_CONFIG.defaultFit,
				textScheme: DEFAULT_BG_CONFIG.defaultTextScheme,
				loop: DEFAULT_BG_CONFIG.defaultLoop,
				mediaKey: "",
				opacity: 1,
				posX: 50,
				posY: 50,
				scale: 1,
				zoom: 1,
				volume: 1,
				glass: false,
				resolvedText: null,
				cfg: {
					...DEFAULT_BG_CONFIG,
					imageExt: [...DEFAULT_BG_CONFIG.imageExt],
					videoExt: [...DEFAULT_BG_CONFIG.videoExt]
				},
				video: {
					paused: true,
					rate: 1,
					loop: DEFAULT_BG_CONFIG.defaultLoop,
					soundOn: false,
					currentTime: 0,
					duration: 0
				},
				status: { error: "" }
			};
		}
		/** 视频时间轴的空态（离开视频 / 卸载时回写；与 defaultSnapshot.video 同步）。 */
		function idleVideoUi() {
			return {
				paused: true,
				rate: 1,
				loop: DEFAULT_BG_CONFIG.defaultLoop,
				soundOn: false,
				currentTime: 0,
				duration: 0
			};
		}
		let snapshot = defaultSnapshot();
		let lastAppliedKey = "";
		const listeners = /* @__PURE__ */ new Set();
		/** 处于防抖窗口内/写入在途的字段 → 本地期望值（adopt 合并用，见 apply()）。 */
		const pendingWrites = /* @__PURE__ */ new Map();
		/** 持久化防抖毫秒数（v0.4.1：滑杆拖动只乐观 apply；静止 300ms 后**一次原子提交**全部待写字段）。 */
		const DEBOUNCE_MS = 300;
		/** 全局单一防抖句柄（任何新写入都重置它，把一次操作的所有字段合并成最后一次 flush）。 */
		let flushHandle = void 0;
		/** 真正的 flush 实现，由 apply() 注入（需要 scope / 镜像，见 apply() 内 runFlushNow）。 */
		let runFlushImpl = null;
		function clearFlushTimer() {
			if (flushHandle !== void 0) {
				const g = globalThis;
				try {
					g.clearTimeout?.(flushHandle);
				} catch {}
				flushHandle = void 0;
			}
		}
		/**
		* 调度一次（合并后的）防抖 flush：再次写入会取消上一次 → 拖动/连续变更只提交
		* 最后一次的完整字段集合。无计时器环境（测试注入缺失）→ 下个微任务立即执行。
		*/
		function scheduleFlushTimer() {
			clearFlushTimer();
			const run = () => {
				flushHandle = void 0;
				runFlushImpl?.();
			};
			const g = globalThis;
			if (typeof g.setTimeout === "function") flushHandle = g.setTimeout(run, DEBOUNCE_MS);
			else queueMicrotask(run);
		}
		function notify() {
			for (const l of listeners) l();
		}
		function subscribeStore(cb) {
			listeners.add(cb);
			return () => listeners.delete(cb);
		}
		function getSnapshot() {
			return snapshot;
		}
		/**
		* 被覆盖的"已应用签名"（避免无谓重写 DOM）。
		* v0.3.1：opacity/posX/posY 参与 key（它们改变渲染 CSS，变了必须重写；
		* status.error 不参与 —— 它只驱动面板错误行，与 DOM 渲染无关）。
		* v0.4：volume 不参与 key —— 它是 <video> 元素运行时属性而非 CSS，本地/镜像音量
		* 变化走 applyBgState 的 early-return 运行时同步（不重建 DOM）；sound 纯运行时态。
		* v0.4.3：scale 参与 key（它改变 layer/video 的 transform，变了必须重写）。
		* v0.5.0：zoom 参与 key（它改变 background-size 或 transform，变了必须重写）。
		*/
		function applyKey(s) {
			return [
				s.mode,
				s.value,
				s.fit,
				s.textScheme,
				s.loop,
				s.mediaKey,
				s.opacity,
				s.posX,
				s.posY,
				s.scale,
				s.zoom,
				s.glass,
				s.resolvedText
			].join("\0");
		}
		/** 钳制媒体不透明度到 0..1（缺省 1）。导出供验证。 */
		function clampBgOpacity(raw, fallback = 1) {
			return Math.min(1, Math.max(0, typeof raw === "number" && Number.isFinite(raw) ? raw : fallback));
		}
		/** 钳制焦点定位到 0..100（缺省 50）。导出供验证。 */
		function clampBgPos(raw, fallback = 50) {
			return Math.min(100, Math.max(0, typeof raw === "number" && Number.isFinite(raw) ? raw : fallback));
		}
		/** 钳制视频音量到 0..1（缺省 1）。导出供验证。 */
		function clampBgVolume(raw, fallback = 1) {
			return Math.min(1, Math.max(0, typeof raw === "number" && Number.isFinite(raw) ? raw : fallback));
		}
		/** 钳制媒体缩放到 0.25..4（缺省 1=不缩放）。导出供验证。 */
		function clampBgScale(raw, fallback = 1) {
			return Math.min(4, Math.max(BG_SCALE_MIN, Math.round((typeof raw === "number" && Number.isFinite(raw) ? raw : fallback) * 20) / 20));
		}
		/**
		* 钳制放大聚焦 zoom 到 1..3（v0.5.0；缺省 1=不缩放），吸附 0.05 步长。
		* 与 {@link clampBgScale}（0.25–4，可缩小）是两个独立轴：zoom 只放大。
		* 导出供验证。
		*/
		function clampBgZoom(raw, fallback = 1) {
			return Math.min(3, Math.max(1, Math.round((typeof raw === "number" && Number.isFinite(raw) ? raw : fallback) * 20) / 20));
		}
		/** zoom 下限（1=不缩放）：面板滑杆 100%–300% 的下界。导出供验证。 */
		const bgZoomMin = 1;
		/** zoom 上限（3=300%）。导出供验证。 */
		const bgZoomMax = 3;
		/** 原始值等同判断（防抖/镜像合并用；均为 string/number/boolean）。 */
		function sameValue(a, b) {
			return a === b;
		}
		/**
		* 视频错误码 → 字典键（可读文案见 dictionary errVideo*；键再经 text() 翻译）。
		* 1=中止 2=网络 3=解码失败(格式或损坏) 4=源不支持(链接不可直接播放/格式未允许)。
		*/
		function videoErrorKeyForCode(code) {
			switch (code) {
				case 1: return "errVideoAborted";
				case 2: return "errVideoNetwork";
				case 3: return "errVideoDecode";
				case 4: return "errVideoSrc";
				default: return "errVideoLoad";
			}
		}
		/** 写运行态错误并通知（值不变时不重复通知）。 */
		function setStatusError(key) {
			if (snapshot.status.error === key) return;
			snapshot = {
				...snapshot,
				status: { error: key }
			};
			notify();
		}
		/** 清运行态错误并通知（已空时不重复通知）。 */
		function clearStatusError() {
			if (snapshot.status.error === "") return;
			snapshot = {
				...snapshot,
				status: { error: "" }
			};
			notify();
		}
		/** 当前运行态错误（面板错误行数据源；导出供验证/复用）。 */
		function bgRuntimeStatus() {
			return { error: snapshot.status.error };
		}
		const STYLE_ID = "dsh-bg-style";
		const LAYER_TAG = "div";
		const LAYER_ATTR = "data-dsh-bg-layer";
		let styleEl = null;
		let layerEl = null;
		let videoEl = null;
		function ensureLayer() {
			if (typeof document === "undefined") return;
			if (layerEl === null || !layerEl.isConnected) {
				layerEl = document.createElement(LAYER_TAG);
				layerEl.setAttribute(LAYER_ATTR, "");
				document.body.append(layerEl);
			}
			if (styleEl === null || !styleEl.isConnected) {
				styleEl = document.createElement("style");
				styleEl.id = STYLE_ID;
				(document.head ?? document.body).append(styleEl);
			}
		}
		function removeLayer() {
			if (videoEl !== null) videoEl = null;
			if (layerEl !== null) {
				layerEl.remove();
				layerEl = null;
			}
			if (styleEl !== null) {
				styleEl.remove();
				styleEl = null;
			}
		}
		/** 按 glass 状态挂/摘 body 上的 data-dsh-bg-glass（毛玻璃 CSS 的作用域标记）。 */
		function syncGlassAttribute(on) {
			if (typeof document === "undefined") return;
			try {
				if (on) document.body.setAttribute("data-dsh-bg-glass", "");
				else document.body.removeAttribute("data-dsh-bg-glass");
			} catch {}
		}
		/** 本插件写过的 meta 状态（用于**完整还原**：只还原我们自己改的内容）。 */
		let themeColorMeta = null;
		let themeColorCreatedByUs = false;
		let themeColorOriginal = null;
		/**
		* 把当前背景的建议配色写进 `meta[name="theme-color"]`（E 的可做部分）。
		*
		* 为什么必须自己写：ui-layout 的 ThemePresenter（theme-presenter.ts:54）每次应用
		* 主题都会把该 meta 设成 `getComputedStyle(body).backgroundColor`，而本插件把 body
		* 的 bg-base 覆盖成 transparent（"全屏透出"的前提）→ 主题侧算出的永远是透明，
		* 该 meta 事实上失效。这里按背景自己算（见 bg-palette.bgThemeColorFor）。
		*
		* 安全还原：只动 `content`，且记住写入前的值与是否为**我们创建**的节点 ——
		* 卸载/切回 off 时精确还原（我们创建的节点移除，别人的节点恢复原 content）。
		* 主题侧后续再应用主题会覆盖 content，属预期（下一次背景变更我们会再写回）。
		* @param color - CSS 颜色文本；null = 无建议值（还原）。
		*/
		function syncThemeColorMeta(color) {
			if (typeof document === "undefined") return;
			try {
				if (themeColorMeta === null || !themeColorMeta.isConnected) {
					const existing = typeof document.querySelector === "function" ? document.querySelector("meta[name=\"theme-color\"]") : null;
					if (existing !== null && existing !== void 0) {
						themeColorMeta = existing;
						themeColorCreatedByUs = false;
						themeColorOriginal = existing.getAttribute("content");
					} else {
						const created = document.createElement("meta");
						created.setAttribute("name", "theme-color");
						themeColorMeta = created;
						themeColorCreatedByUs = true;
						themeColorOriginal = null;
						(document.head ?? document.body)?.append(created);
					}
				}
				if (color === null) {
					if (themeColorCreatedByUs) {
						themeColorMeta.remove();
						themeColorMeta = null;
						themeColorCreatedByUs = false;
						themeColorOriginal = null;
						return;
					}
					if (themeColorOriginal === null) themeColorMeta.removeAttribute("content");
					else themeColorMeta.setAttribute("content", themeColorOriginal);
					themeColorMeta = null;
					themeColorOriginal = null;
					return;
				}
				themeColorMeta.setAttribute("content", color);
			} catch {}
		}
		/**
		* 渲染一份快照的完整 CSS 文本（集中管理）：body token 覆盖 + layer 几何 +
		* 媒体渲染 + video 适配。样式卸载即整体移除 → 原主题完整还原。
		*/
		function buildStyleText(s) {
			const lines = [];
			lines.push("/* dsh-bg-switch v0.4.4 */");
			const tokenLines = [];
			if (s.resolvedText !== null) {
				const tokens = tokensForTextScheme(s.resolvedText);
				for (const [name, value] of Object.entries(tokens)) tokenLines.push(`  ${name}: ${value} !important;`);
			}
			if (tokenLines.length > 0) {
				lines.push("body {");
				lines.push(...tokenLines);
				lines.push("}");
			}
			if (s.resolvedText !== null) {
				const maskTokens = maskTokensForTextScheme(s.resolvedText);
				const maskLines = [];
				for (const [name, value] of Object.entries(maskTokens)) maskLines.push(`  ${name}: ${value} !important;`);
				if (maskLines.length > 0) {
					lines.push("body * {");
					lines.push(...maskLines);
					lines.push("}");
				}
			}
			if (s.glass === true && s.resolvedText !== null) {
				const glassTokens = glassSurfaceTokensForTextScheme(s.resolvedText);
				const glassLines = [];
				for (const [name, value] of Object.entries(glassTokens)) glassLines.push(`  ${name}: ${value} !important;`);
				if (glassLines.length > 0) {
					lines.push("body[data-dsh-bg-glass] {");
					lines.push(...glassLines);
					lines.push("}");
				}
				lines.push(`body[data-dsh-bg-glass] :where(${GLASS_BACKDROP_SELECTOR}) {`);
				lines.push(`  backdrop-filter: ${GLASS_BACKDROP_FILTER};`);
				lines.push(`  -webkit-backdrop-filter: ${GLASS_BACKDROP_FILTER};`);
				lines.push("}");
			}
			lines.push("body div[role=\"presentation\"]:has(> div[role=\"dialog\"][aria-modal=\"true\"]) {");
			lines.push("  background: transparent !important;");
			lines.push("}");
			lines.push("body div[role=\"presentation\"]:has(> div[role=\"dialog\"][aria-modal=\"true\"]) > [aria-hidden=\"true\"] {");
			lines.push("  background: transparent !important;");
			lines.push("}");
			lines.push(`[${LAYER_ATTR}] {`);
			lines.push("  position: fixed;");
			lines.push("  inset: 0;");
			lines.push("  z-index: -1;");
			lines.push("  pointer-events: none;");
			lines.push("  overflow: hidden;");
			lines.push("  margin: 0;");
			lines.push("  padding: 0;");
			lines.push("  background-origin: border-box;");
			lines.push("}");
			if (s.mode === "video") {
				const plan = mediaRenderPlan(s);
				if (plan.video !== null) {
					lines.push(`[${LAYER_ATTR}] video {`);
					lines.push("  width: 100%;");
					lines.push("  height: 100%;");
					lines.push("  display: block;");
					lines.push(`  object-fit: ${plan.video.objectFit};`);
					lines.push(`  object-position: ${plan.video.objectPosition};`);
					if (plan.video.transform !== null) {
						lines.push(`  transform-origin: ${plan.video.transformOrigin};`);
						lines.push(`  transform: ${plan.video.transform};`);
					}
					lines.push("}");
				}
			} else if (s.mode === "image") {
				const plan = mediaRenderPlan(s);
				if (plan.image !== null) {
					lines.push(`[${LAYER_ATTR}] {`);
					lines.push(`  background-image: ${plan.image.backgroundImage};`);
					lines.push(`  background-size: ${plan.image.backgroundSize};`);
					lines.push(`  background-position: ${plan.image.backgroundPosition};`);
					lines.push(`  background-repeat: ${plan.image.backgroundRepeat};`);
					if (plan.image.transform !== null) {
						lines.push(`  transform-origin: ${plan.image.transformOrigin};`);
						lines.push(`  transform: ${plan.image.transform};`);
					}
					lines.push("}");
				}
			} else if (s.mode === "gradient" && s.value !== "") {
				const fit = fitCssFor("cover", s.mode);
				lines.push(`[${LAYER_ATTR}] {`);
				lines.push(`  background: ${s.value} no-repeat center/${fit.backgroundSize};`);
				lines.push("}");
			} else if (s.mode === "color" && s.value !== "") {
				lines.push(`[${LAYER_ATTR}] {`);
				lines.push(`  background: ${s.value} no-repeat center/cover;`);
				lines.push("}");
			}
			if ((s.mode === "image" || s.mode === "video") && s.opacity < 1) {
				lines.push(`[${LAYER_ATTR}] {`);
				lines.push(`  opacity: ${clampBgOpacity(s.opacity)};`);
				lines.push("}");
			}
			return lines.join("\n");
		}
		/**
		* 媒体资源统一解析（v0.4）：mediaKey 非空 → host 伺服 URL /dsh-bg-media/<key>
		* （上传/登记的本地媒体，value 为空）；否则 value 直接当 URL（http/https/data:）。
		* 返回 null 表示没有可渲染源。
		*/
		function bgMediaSrc(s) {
			if (s.mediaKey !== "") return `/dsh-bg-media/${encodeURIComponent(s.mediaKey)}`;
			if (s.value !== "") return s.value;
			return null;
		}
		/** 计算 video 的 <video src>；返回 null 表示无法解析（仅 http(s) 与 mediaKey）。 */
		function videoSrcOf(s) {
			if (s.mediaKey !== "") return `/dsh-bg-media/${encodeURIComponent(s.mediaKey)}`;
			if (/^https?:\/\//i.test(s.value)) return s.value;
			return null;
		}
		/**
		* v0.5.0：一张快照的媒体渲染计划（**真实全屏层与设置页预览画布的唯一计算入口**）。
		* 源解析规则按 mode 分流（video 只认 http(s)/mediaKey，image 认 mediaKey/任意 value），
		* 其余（fit/焦点/zoom/scale/opacity）全部交给 bg-palette 的纯函数。
		*/
		function mediaRenderPlan(s) {
			return bgMediaRender({
				mode: s.mode,
				src: s.mode === "video" ? videoSrcOf(s) : bgMediaSrc(s),
				fit: s.fit,
				posX: s.posX,
				posY: s.posY,
				zoom: s.zoom,
				scale: s.scale,
				opacity: s.opacity
			});
		}
		function syncVideoUiFromElement() {
			if (videoEl === null) return;
			const duration = typeof videoEl.duration === "number" && Number.isFinite(videoEl.duration) ? videoEl.duration : 0;
			const currentTime = typeof videoEl.currentTime === "number" && Number.isFinite(videoEl.currentTime) ? Math.min(Math.max(videoEl.currentTime, 0), duration > 0 ? duration : videoEl.currentTime) : 0;
			snapshot = {
				...snapshot,
				video: {
					...snapshot.video,
					paused: videoEl.paused,
					rate: videoEl.playbackRate,
					loop: videoEl.loop,
					currentTime,
					duration
				}
			};
			syncNoPictureStatus();
		}
		/**
		* v0.6.0：**「有声无画」检测**（本地视频最常见的"没出画面、声音倒是有"根因）。
		*
		* 判定：元素已经有媒体时长（duration > 0 说明容器/音轨解析成功）且正在播放，
		* 但 `videoWidth`/`videoHeight` 仍为 0 —— 说明**视频轨没有被解出**（编码不受支持：
		* H.265/HEVC、ProRes、AV1 在部分 Chromium/Windows 组合下就只有音轨能放）。
		* 这种情况不会触发 `error` 事件，所以旧实现完全静默；这里写一条软提示
		* （errVideoNoPicture，面板红行可见，不弹窗），并在画面恢复时自动清除。
		*/
		function syncNoPictureStatus() {
			if (videoEl === null) return;
			if (videoEl.videoWidth > 0 && videoEl.videoHeight > 0) {
				if (snapshot.status.error === "errVideoNoPicture") clearStatusError();
				return;
			}
			if (snapshot.video.duration <= 0 || videoEl.paused) return;
			if (snapshot.status.error !== "" && snapshot.status.error !== "errVideoNoPicture") return;
			setStatusError("errVideoNoPicture");
		}
		function attachVideoEvents() {
			if (videoEl === null) return;
			const onState = () => {
				syncVideoUiFromElement();
				notify();
			};
			videoEl.addEventListener("play", onState);
			videoEl.addEventListener("pause", onState);
			videoEl.addEventListener("ratechange", onState);
			videoEl.addEventListener("emptied", onState);
			videoEl.addEventListener("timeupdate", onState);
			videoEl.addEventListener("durationchange", onState);
			videoEl.addEventListener("loadedmetadata", onState);
			videoEl.addEventListener("seeked", onState);
			videoEl.addEventListener("error", () => {
				setStatusError(videoErrorKeyForCode(videoEl?.error?.code));
			});
			videoEl.addEventListener("stalled", () => {
				setStatusError("errVideoStalled");
			});
			videoEl.addEventListener("suspend", () => {
				if (snapshot.status.error === "errVideoStalled") clearStatusError();
			});
			videoEl.addEventListener("playing", () => {
				clearStatusError();
			});
			videoEl.addEventListener("canplay", () => {
				const err = snapshot.status.error;
				if (err !== "" && err !== "errVideoAutoplay") clearStatusError();
			});
		}
		/** 建立（或更新）layer 里的 <video> 子元素；返回它。 */
		function buildVideo(s) {
			if (typeof document === "undefined") return null;
			const src = videoSrcOf(s);
			if (src === null) return null;
			const created = videoEl === null || !videoEl.isConnected;
			if (created) {
				videoEl = document.createElement("video");
				videoEl.setAttribute("data-dsh-bg-video", "");
				videoEl.muted = true;
				videoEl.autoplay = true;
				videoEl.playsInline = true;
				attachVideoEvents();
				syncVideoUiFromElement();
			}
			videoEl.loop = s.loop;
			videoEl.volume = clampBgVolume(s.volume);
			if (!created) videoEl.muted = !(s.video?.soundOn ?? false);
			if (videoEl.getAttribute("src") !== src) {
				videoEl.removeAttribute("src");
				videoEl.setAttribute("src", src);
				videoEl.load();
			}
			if (layerEl !== null && videoEl.parentElement !== layerEl) layerEl.append(videoEl);
			const playPromise = videoEl.play();
			if (playPromise !== void 0 && typeof playPromise.then === "function") playPromise.catch((reason) => {
				const name = reason && typeof reason === "object" && "name" in reason ? String(reason.name) : "";
				if (name === "AbortError") return;
				if (name === "NotAllowedError") setStatusError("errVideoAutoplay");
				else setStatusError("errVideoLoad");
			});
			return videoEl;
		}
		/** 两份配置镜像浅比较（数组按 join 比较）。 */
		function cfgSame(a, b) {
			return a.maxImageMB === b.maxImageMB && a.maxVideoMB === b.maxVideoMB && a.imageExt.join(",") === b.imageExt.join(",") && a.videoExt.join(",") === b.videoExt.join(",") && a.defaultFit === b.defaultFit && a.defaultTextScheme === b.defaultTextScheme && a.defaultLoop === b.defaultLoop;
		}
		/** 单一应用入口：把整份快照落到界面（style + layer + video + token）。 */
		function applyBgState(doc) {
			const prevCfg = snapshot.cfg;
			const prevVolume = snapshot.volume;
			const next = {
				...snapshot,
				...doc,
				cfg: doc.cfg ?? snapshot.cfg
			};
			next.opacity = clampBgOpacity(doc.opacity !== void 0 ? doc.opacity : snapshot.opacity);
			next.posX = clampBgPos(doc.posX !== void 0 ? doc.posX : snapshot.posX);
			next.posY = clampBgPos(doc.posY !== void 0 ? doc.posY : snapshot.posY);
			next.scale = clampBgScale(doc.scale !== void 0 ? doc.scale : snapshot.scale);
			next.zoom = clampBgZoom(doc.zoom !== void 0 ? doc.zoom : snapshot.zoom);
			next.volume = clampBgVolume(doc.volume !== void 0 ? doc.volume : snapshot.volume);
			next.resolvedText = resolveTextScheme(next.mode, next.value, next.textScheme);
			if (doc.video !== void 0) next.video = { ...doc.video };
			snapshot = next;
			const key = applyKey(snapshot);
			const cfgChanged = doc.cfg !== void 0 && !cfgSame(doc.cfg, prevCfg);
			const volumeChanged = doc.volume !== void 0 && next.volume !== prevVolume;
			if (typeof document === "undefined") {
				if (key !== lastAppliedKey || cfgChanged) {
					lastAppliedKey = key;
					notify();
				}
				return;
			}
			if (key === lastAppliedKey) {
				if (volumeChanged && videoEl !== null) videoEl.volume = next.volume;
				if (cfgChanged || volumeChanged) notify();
				return;
			}
			lastAppliedKey = key;
			if (snapshot.status.error !== "") snapshot = {
				...snapshot,
				status: { error: "" }
			};
			if (snapshot.mode === "off" || snapshot.mode === "video" && videoSrcOf(snapshot) === null || snapshot.mode === "image" && bgMediaSrc(snapshot) === null || (snapshot.mode === "gradient" || snapshot.mode === "color") && snapshot.value === "") {
				syncThemeColorMeta(null);
				syncGlassAttribute(false);
				removeLayer();
				notify();
				return;
			}
			syncThemeColorMeta(bgThemeColorFor(snapshot.mode, snapshot.value, snapshot.resolvedText));
			try {
				ensureLayer();
				if (layerEl === null || styleEl === null) {
					notify();
					return;
				}
				syncGlassAttribute(snapshot.glass === true);
				if (snapshot.mode === "video") {
					if (videoEl !== null && videoEl.parentElement !== null && videoEl.parentElement !== layerEl) {
						videoEl.remove();
						videoEl = null;
					}
					buildVideo(snapshot);
				} else if (videoEl !== null) {
					videoEl.remove();
					videoEl = null;
					snapshot = {
						...snapshot,
						video: idleVideoUi()
					};
				}
				styleEl.textContent = buildStyleText(snapshot);
			} catch {
				snapshot = {
					...snapshot,
					status: { error: "errApply" }
				};
			}
			notify();
		}
		/** 兼容入口：applyBg(mode, value, opts?)。 */
		function applyBg(mode, value, opts) {
			applyBgState({
				mode,
				value,
				...opts
			});
		}
		/** 卸载/停用时的完整恢复（移除 style + layer + 视频，状态回 off）。 */
		function restoreBg() {
			if (typeof document !== "undefined") removeLayer();
			syncThemeColorMeta(null);
			pendingWrites.clear();
			clearFlushTimer();
			snapshot = {
				...defaultSnapshot(),
				video: idleVideoUi()
			};
			lastAppliedKey = applyKey(snapshot);
			notify();
		}
		/**
		* 交互期标志：我们的壁纸控件（定位/透明度/缩放等滑杆）在 pointerdown→pointerup
		* 期间把它置 true，抽屉据此把自己的面板透明度过渡降低（便于边拖边看壁纸），
		* 松开/失焦/取消即恢复。与旧「降设置弹窗透明度」不同：目标就是**我们自己的抽屉**，
		* 不再去动宿主设置弹窗的 DOM（v0.6.0 背景已从设置页迁到右侧抽屉）。
		*/
		let adjustingActive = false;
		const adjustingListeners = /* @__PURE__ */ new Set();
		function setAdjusting(on) {
			if (adjustingActive === on) return;
			adjustingActive = on;
			for (const listener of adjustingListeners) listener();
		}
		function subscribeAdjusting(listener) {
			adjustingListeners.add(listener);
			return () => {
				adjustingListeners.delete(listener);
			};
		}
		function getAdjusting() {
			return adjustingActive;
		}
		/** 交互期开关（导出供 UI 与验证调用）。 */
		function bgSetAdjusting(on) {
			setAdjusting(on);
		}
		/** 当前是否处于「正在滑动/调参」状态。导出供验证。 */
		function bgIsAdjusting() {
			return adjustingActive;
		}
		/** 卸载路径：结束交互期（ctx.effect 清理时调用）。 */
		function disposeAdjusting() {
			setAdjusting(false);
		}
		/** 抽屉是否打开（模块级 store：侧栏按钮与抽屉是两个 slot 根，跨根共享状态）。 */
		let drawerOpen = false;
		const drawerListeners = /* @__PURE__ */ new Set();
		function setDrawerOpen(open) {
			if (drawerOpen === open) return;
			drawerOpen = open;
			syncDrawerLayoutAttr(open);
			for (const listener of drawerListeners) listener();
		}
		function subscribeDrawer(listener) {
			drawerListeners.add(listener);
			return () => {
				drawerListeners.delete(listener);
			};
		}
		function getDrawerOpen() {
			return drawerOpen;
		}
		/** 切换抽屉开关（导出供侧栏按钮与验证调用）。 */
		function toggleDrawer() {
			setDrawerOpen(!drawerOpen);
			return drawerOpen;
		}
		/** 当前抽屉是否打开。导出供验证。 */
		function bgIsDrawerOpen() {
			return drawerOpen;
		}
		/** 播放/暂停切换；无 <video> 时返回 'none'。 */
		function bgVideoToggle() {
			if (videoEl === null) return "none";
			if (videoEl.paused) {
				const p = videoEl.play();
				if (p !== void 0) p.catch(() => {});
				return "playing";
			}
			videoEl.pause();
			return "paused";
		}
		/** 停止（v0.4 语义）：暂停并停在当前帧 —— 不再回卷 currentTime=0。 */
		function bgVideoStop() {
			if (videoEl === null) return;
			videoEl.pause();
			syncVideoUiFromElement();
			notify();
		}
		/**
		* 进度条 seek（v0.4.1）：把播放头移动到 0..duration 的某秒（clamp；未就绪/无
		* 元数据时返回当前值）。停止态下 seek 只移动播放头不恢复播放。
		* @returns 实际落到的秒数。
		*/
		function bgVideoSeek(seconds) {
			if (videoEl === null) return 0;
			const duration = typeof videoEl.duration === "number" && Number.isFinite(videoEl.duration) ? videoEl.duration : 0;
			if (!(duration > 0)) return 0;
			const target = Math.min(Math.max(Number.isFinite(seconds) ? seconds : 0, 0), duration);
			if (typeof videoEl.currentTime === "number") try {
				videoEl.currentTime = target;
			} catch {}
			syncVideoUiFromElement();
			notify();
			return target;
		}
		/** 设置倍速（clamp 0.5–2）。 */
		function bgVideoSetRate(rate) {
			const clamped = Math.max(.5, Math.min(2, Number.isFinite(rate) ? rate : 1));
			if (videoEl !== null) {
				videoEl.playbackRate = clamped;
				syncVideoUiFromElement();
				notify();
			}
			return clamped;
		}
		/** 设置循环（运行时 + 元素属性）。 */
		function bgVideoSetLoop(loop) {
			const value = !!loop;
			if (videoEl !== null) {
				videoEl.loop = value;
				syncVideoUiFromElement();
			}
			snapshot = {
				...snapshot,
				loop: value,
				video: {
					...snapshot.video,
					loop: value
				}
			};
			notify();
			return value;
		}
		/**
		* 声音开关（v0.4；纯运行时态、不持久化 —— 重启回到默认静音自动播放）。
		* 打开 = 用户手势：muted=false 并 resume play()（自动播放策略放行）；
		* 关闭 = muted=true（播放继续但静音）。
		*/
		function bgVideoSetSound(on) {
			const value = !!on;
			if (videoEl !== null) {
				videoEl.muted = !value;
				if (value) {
					const p = videoEl.play();
					if (p !== void 0) p.catch(() => {});
				}
			}
			snapshot = {
				...snapshot,
				video: {
					...snapshot.video,
					soundOn: value
				}
			};
			notify();
			return value;
		}
		/** 设置音量 0..1（写 <video>.volume 并快照；持久化由调用方经 setBg 防抖写 volume）。 */
		function bgVideoSetVolume(volume) {
			const value = clampBgVolume(volume);
			snapshot = {
				...snapshot,
				volume: value
			};
			if (videoEl !== null) videoEl.volume = value;
			notify();
			return value;
		}
		/**
		* 需求 6：图片/视频地址输入框里这个值该怎么处理（纯函数，便于验证）。
		*
		* 背景：选了本地图片/视频后，输入框会回显当前值（UI 上传记文件名、`bg_apply file`
		* 记绝对路径）。旧实现点「应用」时只认 `http(s)://`，于是"什么都没改"也会报
		* 「地址需以 http 开头」—— 纯噪音。这里把判定抽出来：
		* - **noop**：就是当前本地媒体的值且没改过 → 保持不变、不报错、不写设置；
		* - **url**：合法 http(s) 链接 → 交给调用方继续做长度/跨类型校验；
		* - **local-path**：像本地路径（`C:\…`、`\\…`、`/…`、`file:`）→ 提示改用本地选择按钮；
		* - **invalid**：空或其它非法文本 → 提示需要 http(s) 链接。
		* @param kind - 当前页签期望的媒体类型。
		* @param input - 输入框里的原始文本。
		* @param current - 当前生效状态（快照的 mode/mediaKey/value 三个叶子字段）。
		*/
		function bgMediaFieldVerdict(kind, input, current) {
			const v = input.trim();
			if (v === "") return "invalid";
			if (current.mode === kind && current.mediaKey !== "" && v === current.value) return "noop";
			if (/^https?:\/\//i.test(v)) return "url";
			if (/^[a-zA-Z]:[\\/]/.test(v) || v.startsWith("\\\\") || v.startsWith("/") || /^file:/i.test(v)) return "local-path";
			return "invalid";
		}
		/**
		* Enter 键提交 handler（渐变 / 图片 URL / 视频 URL 文本框共用；阻止默认动作）。
		* @returns React onKeyDown handler：仅当 e.key === 'Enter' 时调用 apply()。
		* 导出供 build/verify-client.mjs 模拟 handler 断言。
		*/
		function bgKeyEnter(apply) {
			return (e) => {
				if ((e.key ?? "") !== "Enter") return;
				try {
					e.preventDefault?.();
				} catch {}
				apply();
			};
		}
		/**
		* 本地媒体「上传 + 伺服」（v0.4）：不做 data URI 内联 —— 客户端先按 config 镜像
		* 预校验扩展名/大小，再 fetch POST /dsh-bg-media/upload?kind=…&ext=…（同源相对
		* 路径；body = 原始文件流），成功返回 {ok, mediaKey} 供 setBg(mode,'',{mediaKey})。
		* 服务端仍会按 config 权威复验（非法扩展 / 超限 → 400 + 中文消息）。
		*/
		async function bgUploadLocalFile(file, kind, cfg) {
			const dot = file.name.lastIndexOf(".");
			const ext = dot >= 0 ? file.name.slice(dot + 1).toLowerCase() : "";
			const allowed = kind === "image" ? cfg.imageExt : cfg.videoExt;
			if (!allowed.includes(ext)) return {
				ok: false,
				errorKey: "errFileType",
				detail: allowed.join(" / ")
			};
			if (kind === "image") {
				const limitMB = cfg.maxImageMB;
				if (file.size > limitMB * 1024 * 1024) return {
					ok: false,
					errorKey: "errFileTooBig",
					detail: `${limitMB}MB`
				};
			}
			const url = `/dsh-bg-media/upload?kind=${encodeURIComponent(kind)}&ext=${encodeURIComponent(ext)}`;
			let res;
			try {
				const fetcher = globalThis.fetch;
				if (typeof fetcher !== "function") throw new Error("fetch unavailable");
				res = await fetcher(url, {
					method: "POST",
					body: file
				});
			} catch {
				return {
					ok: false,
					message: "dsh-bg-media: 上传失败（无法连接媒体服务）"
				};
			}
			let payload = {};
			try {
				const parsed = await res.json();
				if (parsed !== null && typeof parsed === "object") payload = parsed;
			} catch {}
			if (res.ok && payload.ok === true && typeof payload.mediaKey === "string" && payload.mediaKey !== "") return {
				ok: true,
				mediaKey: payload.mediaKey
			};
			return {
				ok: false,
				message: typeof payload.message === "string" && payload.message !== "" ? payload.message : "dsh-bg-media: 上传失败（服务端拒绝）"
			};
		}
		const inject = [
			"slots",
			"settingsScope",
			"locale"
		];
		function apply(ctx) {
			let scope;
			try {
				scope = ctx.settingsScope?.bind({ namespace: "dsh-bg" });
			} catch {
				scope = void 0;
			}
			runFlushImpl = runFlushNow;
			const t = ctx.locale ? ctx.locale.bind("settings.dsh-bg") : void 0;
			const text = (key) => t ? t(key) : key;
			/** 从 scope 快照取出 section（兼容两种形状：平铺字段 / {value:{...}}）。 */
			function readScopeSection() {
				const raw = scope?.getSnapshot?.();
				if (raw === null || raw === void 0 || typeof raw !== "object") return {};
				const candidate = raw;
				const nested = candidate.value;
				if (nested !== null && typeof nested === "object" && !Array.isArray(nested)) {
					const inner = nested;
					if ("mode" in inner || "fit" in inner) return inner;
				}
				return candidate;
			}
			function sectionString(section, key, fallback) {
				const value = section[key];
				return typeof value === "string" ? value : fallback;
			}
			/** 采纳外部变化（host/工具/其他会话写 settings → 推送浏览器；settings 镜像为权威）。 */
			/** 读命名空间里的数字字段；缺失/非数字回退 fallback（opacity/posX/posY/volume）。 */
			function sectionNumber(section, key, fallback) {
				const value = section[key];
				return typeof value === "number" && Number.isFinite(value) ? value : fallback;
			}
			/** 镜像里某持久化字段的读值（与字段写入同语义；判断防抖字段是否已收敛）。 */
			function mirrorField(section, field) {
				switch (field) {
					case "mode": return sectionString(section, "mode", "off");
					case "value": return sectionString(section, "value", "");
					case "mediaKey": return sectionString(section, "mediaKey", "");
					case "fit": {
						const raw = sectionString(section, "fit", "");
						return BG_FITS.includes(raw) ? raw : DEFAULT_BG_CONFIG.defaultFit;
					}
					case "textScheme": {
						const raw = sectionString(section, "textScheme", "");
						return BG_TEXT_SCHEMES.includes(raw) ? raw : DEFAULT_BG_CONFIG.defaultTextScheme;
					}
					case "loop": return typeof section.loop === "boolean" ? section.loop : DEFAULT_BG_CONFIG.defaultLoop;
					case "opacity": return sectionNumber(section, "opacity", 1);
					case "posX": return sectionNumber(section, "posX", 50);
					case "posY": return sectionNumber(section, "posY", 50);
					case "scale": return sectionNumber(section, "scale", 1);
					case "zoom": return sectionNumber(section, "zoom", 1);
					case "volume": return sectionNumber(section, "volume", 1);
					case "glass": return typeof section.glass === "boolean" ? section.glass : false;
					default: return;
				}
			}
			/** 快照里某持久化字段的当前值（本地权威；pending 覆盖用）。 */
			function fieldCurrent(field) {
				switch (field) {
					case "mode": return snapshot.mode;
					case "value": return snapshot.value;
					case "fit": return snapshot.fit;
					case "textScheme": return snapshot.textScheme;
					case "loop": return snapshot.loop;
					case "mediaKey": return snapshot.mediaKey;
					case "opacity": return snapshot.opacity;
					case "posX": return snapshot.posX;
					case "posY": return snapshot.posY;
					case "scale": return snapshot.scale;
					case "zoom": return snapshot.zoom;
					case "volume": return snapshot.volume;
					case "glass": return snapshot.glass;
					default: return;
				}
			}
			function adopt() {
				const section = readScopeSection();
				const mode = sectionString(section, "mode", "off");
				const value = sectionString(section, "value", "");
				const fitRaw = sectionString(section, "fit", "");
				const fit = BG_FITS.includes(fitRaw) ? fitRaw : DEFAULT_BG_CONFIG.defaultFit;
				const schemeRaw = sectionString(section, "textScheme", "");
				const textScheme = BG_TEXT_SCHEMES.includes(schemeRaw) ? schemeRaw : DEFAULT_BG_CONFIG.defaultTextScheme;
				const loopRaw = section.loop;
				const loop = typeof loopRaw === "boolean" ? loopRaw : DEFAULT_BG_CONFIG.defaultLoop;
				const mediaKey = sectionString(section, "mediaKey", "");
				const opacity = sectionNumber(section, "opacity", 1);
				const posX = sectionNumber(section, "posX", 50);
				const posY = sectionNumber(section, "posY", 50);
				const scale = sectionNumber(section, "scale", 1);
				const zoom = sectionNumber(section, "zoom", 1);
				const volume = sectionNumber(section, "volume", 1);
				const glass = typeof section.glass === "boolean" ? section.glass : false;
				const arrOf = (key) => {
					const rawArr = section[key];
					return Array.isArray(rawArr) && rawArr.every((item) => typeof item === "string") ? rawArr : [...DEFAULT_BG_CONFIG[key]];
				};
				const cfg = {
					imageExt: arrOf("imageExt"),
					videoExt: arrOf("videoExt"),
					maxImageMB: typeof section.maxImageMB === "number" ? section.maxImageMB : DEFAULT_BG_CONFIG.maxImageMB,
					maxVideoMB: typeof section.maxVideoMB === "number" ? section.maxVideoMB : DEFAULT_BG_CONFIG.maxVideoMB,
					defaultFit: BG_FITS.includes(sectionString(section, "defaultFit", "")) ? sectionString(section, "defaultFit", "") : DEFAULT_BG_CONFIG.defaultFit,
					defaultTextScheme: BG_TEXT_SCHEMES.includes(sectionString(section, "defaultTextScheme", "")) ? sectionString(section, "defaultTextScheme", "") : DEFAULT_BG_CONFIG.defaultTextScheme,
					defaultLoop: typeof section.defaultLoop === "boolean" ? section.defaultLoop : DEFAULT_BG_CONFIG.defaultLoop
				};
				for (const [field, expected] of [...pendingWrites]) if (sameValue(mirrorField(section, field), expected)) pendingWrites.delete(field);
				const doc = {
					mode,
					value,
					fit,
					textScheme,
					loop,
					mediaKey,
					opacity,
					posX,
					posY,
					scale,
					zoom,
					volume,
					glass,
					cfg
				};
				for (const field of pendingWrites.keys()) if ([
					"mode",
					"value",
					"fit",
					"textScheme",
					"loop",
					"mediaKey",
					"opacity",
					"posX",
					"posY",
					"scale",
					"zoom",
					"volume",
					"glass"
				].includes(field)) doc[field] = fieldCurrent(field);
				applyBgState(doc);
			}
			/**
			* 一次原子 flush（v0.4.1）：把所有待写字段合并为**单次 scope.mutate**——
			* 相比 v0.4 的逐字段 300ms 各自 set，单次提交把"镜像整文档重载 / 落盘"的竞态
			* 窗口从 N 个往返缩小为 1 个；pending 在提交 settle 后释放（防抖窗口内 adopt
			* 仍以本地期望值压住镜像旧值，窗口外镜像为权威）。
			* - scope 缺失：纯客户端态，仅清 pending（本次会话生效）。
			* - 提交失败（拒绝/网络）：同样释放 pending，让 scope 的 recover() 重载镜像接管。
			*/
			function runFlushNow() {
				clearFlushTimer();
				if (pendingWrites.size === 0) return;
				const fields = [...pendingWrites.entries()];
				const release = () => {
					for (const [field] of fields) pendingWrites.delete(field);
					notify();
				};
				if (!scope) {
					pendingWrites.clear();
					return;
				}
				try {
					const ops = fields.map(([field, value]) => ({
						op: "set",
						path: [field],
						value
					}));
					const outcome = typeof scope.mutate === "function" ? scope.mutate(ops) : (() => {
						const promises = fields.map(([field, value]) => scope?.set(field, value));
						return Promise.all(promises.filter((p) => p !== void 0 && typeof p.then === "function"));
					})();
					if (outcome !== void 0 && typeof outcome.then === "function") outcome.then(release, release);
					else release();
				} catch {
					release();
				}
			}
			/** 合并的 ~300ms 防抖持久化（v0.4.1）：只登记真正变化的字段，一次 flush 全提交。 */
			function persistSoon(fields) {
				if (!scope) return;
				for (const [field, value] of Object.entries(fields)) pendingWrites.set(field, value);
				scheduleFlushTimer();
			}
			/**
			* 组装待写字段（resetAll = 整命名空间重置，全字段回默认）。
			* v0.4.1 修两处媒体键误清：
			* - 只在**更换来源**（mode 变了 / value 变了 / 显式给了 mediaKey）时清/写 mediaKey；
			* - 纯"选项微调"（如拖透明度/定位、改 fit，mode/value 未变且无 mediaKey 入参）
			*   不再动 mediaKey → 本地图/视频壁纸在拖动/改 fit 时不再因键被清而消失，
			*   且不会把"清键"写进 settings 造成重启后壁纸丢失。
			* 另：切到 video 换远程 URL 也会清旧 mediaKey（否则引擎优先 mediaKey 一直播旧文件）。
			*/
			function composeFields(mode, value, opts) {
				if (opts?.resetAll) return {
					mode: "off",
					value: "",
					mediaKey: "",
					fit: snapshot.cfg.defaultFit,
					textScheme: snapshot.cfg.defaultTextScheme,
					loop: snapshot.cfg.defaultLoop,
					opacity: 1,
					posX: 50,
					posY: 50,
					scale: 1,
					zoom: 1,
					volume: 1,
					glass: false
				};
				const fields = {
					mode,
					value
				};
				if (opts?.mediaKey !== void 0 || mode !== snapshot.mode || value !== snapshot.value) fields.mediaKey = opts?.mediaKey ?? "";
				if (opts?.fit !== void 0) fields.fit = opts.fit;
				if (opts?.textScheme !== void 0) fields.textScheme = opts.textScheme;
				if (opts?.loop !== void 0) fields.loop = opts.loop;
				if (opts?.opacity !== void 0) fields.opacity = opts.opacity;
				if (opts?.posX !== void 0) fields.posX = opts.posX;
				if (opts?.posY !== void 0) fields.posY = opts.posY;
				if (opts?.scale !== void 0) fields.scale = opts.scale;
				if (opts?.zoom !== void 0) fields.zoom = opts.zoom;
				if (opts?.volume !== void 0) fields.volume = opts.volume;
				if (opts?.glass !== void 0) fields.glass = opts.glass;
				return fields;
			}
			/**
			* UI/注入面入口：**乐观 apply 一次**（本地即时，不等待持久化）+ **合并防抖持久化**
			* （只登记与当前快照不同的字段；静止 300ms 后**一次原子 mutate** 提交全部字段 ——
			* 巨型本地媒体已不再入 settings，拖动定位/透明度不再触发整文件重写，卡顿根因消除；
			* 原子提交把多字段写入的镜像竞态窗口压到单次往返，见 runFlushNow）。
			*/
			function setBg(mode, value, opts) {
				const fields = composeFields(mode, value, opts);
				const dirty = {};
				for (const [field, fieldValue] of Object.entries(fields)) if (opts?.resetAll === true || !sameValue(fieldCurrent(field), fieldValue)) dirty[field] = fieldValue;
				applyBgState({ ...fields });
				persistSoon(dirty);
			}
			const zhPresetDict = Object.fromEntries(Object.entries(PRESET_LABELS_ZH).map(([k, v]) => ["preset." + k, v]));
			const enPresetDict = Object.fromEntries(Object.entries(PRESET_LABELS_EN).map(([k, v]) => ["preset." + k, v]));
			ctx.locale?.register("settings.dsh-bg", {
				zh: {
					nav: "壁纸",
					title: "壁纸",
					presets: "系统",
					custom: "自定义",
					color: "纯色",
					gradient: "渐变",
					image: "图片",
					video: "视频",
					applyColor: "应用",
					applyGradient: "应用",
					applyImage: "应用",
					applyVideo: "应用",
					reset: "重置",
					current: "当前背景",
					currentOff: "默认（未设置）",
					wallpaper: "壁纸",
					close: "关闭",
					glass: "毛玻璃质感",
					glassHint: "开启后界面表面半透明并对背景做模糊（磨砂玻璃质感）",
					zoomLabel: "缩放",
					minimapHint: "在小图里滚动滚轮 = 缩放，按住拖动 = 定位",
					chooseFile: "选择本地文件",
					colorPlaceholder: "#1e2a78",
					gradientPlaceholder: "linear-gradient(135deg, #1e2a78, #2b1055)",
					imagePlaceholder: "https://example.com/wallpaper.jpg",
					videoPlaceholder: "https://example.com/ocean.mp4",
					localImage: "本地图片",
					localVideo: "本地视频",
					localImageHint: "选择本地图片（≤上限），上传后自动生效；或让模型调用 bg_apply 工具（file 参数）",
					localVideoHint: "选择本地视频：文件只存在本机、只在本机播放，不会上传到云端；选中后自动全屏播放",
					uploading: "上传中…",
					errColor: "颜色需是 #rrggbb 形式（如 #1e2a78）",
					errGradient: "渐变格式无效，请用完整 CSS 渐变",
					errGradientCharset: "渐变里含不允许的字符（只允许 CSS 颜色/渐变语法，不能含 ; { } < >）",
					errImage: "图片地址需以 http(s):// 开头",
					errVideo: "视频地址需以 http(s):// 开头",
					errUrlIsVideo: "这是视频链接（.{ext}）：请切到「视频」页签，或换成图片链接",
					errUrlIsImage: "这是图片链接（.{ext}）：请切到「图片」页签，或换成视频链接",
					errUrlTooLong: "地址过长（上限 2000 字符）",
					errLocalPathImage: "这是本地文件路径：请用下面的「本地图片」按钮选择，输入框只接受 http(s) 链接（当前壁纸保持不变可直接点应用）",
					errLocalPathVideo: "这是本地文件路径：请用下面的「本地视频」按钮选择，输入框只接受 http(s) 链接（当前壁纸保持不变可直接点应用）",
					errFileTooBig: "文件超过大小上限",
					errFileType: "不支持的文件类型",
					fit: "适配",
					textScheme: "文字",
					fitFill: "拉伸铺满",
					fitCover: "裁切铺满",
					fitContain: "完整容纳",
					fitCenter: "不缩放居中",
					fitTile: "平铺",
					schemeAuto: "自动",
					schemeLight: "浅色文字",
					schemeDark: "深色文字",
					videoControls: "视频控制",
					play: "播放",
					pause: "暂停",
					stop: "停止",
					speed: "倍速",
					loop: "循环播放",
					textLight: "浅字",
					textDark: "深字",
					sound: "声音",
					volume: "音量",
					opacityLabel: "透明度",
					posXLabel: "水平定位",
					posYLabel: "垂直定位",
					scaleLabel: "缩放",
					errApply: "应用背景时出错，请重试或先恢复默认",
					errVideoLoad: "视频加载失败（未给出具体原因）：请确认链接可直接播放",
					errVideoAborted: "视频加载被中止（MEDIA_ERR_ABORTED=1）",
					errVideoNetwork: "视频加载失败：网络错误（MEDIA_ERR_NETWORK=2），请检查链接能否直接访问",
					errVideoDecode: "视频加载失败：解码错误（MEDIA_ERR_DECODE=3），格式可能不受支持或文件已损坏",
					errVideoSrc: "视频源不受支持（MEDIA_ERR_SRC_NOT_SUPPORTED=4）：链接无法直接播放或格式未被允许",
					errVideoAutoplay: "浏览器阻止了自动播放，请点击「播放」开始",
					errVideoStalled: "视频网络较慢或服务器暂时无响应，正在等待数据…",
					errVideoNoPicture: "视频只有声音、没有画面：视频轨编码可能不受支持（如 H.265/HEVC、ProRes），请换 H.264(AVC) 编码的 MP4",
					notice: "提示",
					ok: "知道了",
					...zhPresetDict
				},
				en: {
					nav: "Wallpaper",
					title: "Wallpaper",
					presets: "System",
					custom: "Custom",
					color: "Color",
					gradient: "Gradient",
					image: "Image",
					video: "Video",
					applyColor: "Apply",
					applyGradient: "Apply",
					applyImage: "Apply",
					applyVideo: "Apply",
					reset: "Reset",
					current: "Current",
					currentOff: "Default (unset)",
					wallpaper: "Wallpaper",
					close: "Close",
					glass: "Frosted glass",
					glassHint: "Make surfaces translucent and blur the background behind them",
					zoomLabel: "Zoom",
					minimapHint: "Scroll inside the mini map to zoom; drag to set the focus position",
					chooseFile: "Choose a local file",
					colorPlaceholder: "#1e2a78",
					gradientPlaceholder: "linear-gradient(135deg, #1e2a78, #2b1055)",
					imagePlaceholder: "https://example.com/wallpaper.jpg",
					videoPlaceholder: "https://example.com/ocean.mp4",
					localImage: "Local image",
					localVideo: "Local video",
					localImageHint: "Pick a local image (up to the limit); it uploads and takes effect automatically. Or ask the assistant to call bg_apply with a file path",
					localVideoHint: "Pick a local video: the file stays on this machine and is never uploaded to any cloud service; it plays fullscreen right away",
					uploading: "Uploading…",
					errColor: "Color must be like #rrggbb (e.g. #1e2a78)",
					errGradient: "Invalid gradient. Use a full CSS gradient",
					errGradientCharset: "The gradient contains forbidden characters (only CSS color/gradient syntax; no ; { } < >)",
					errImage: "Image URL must start with http(s)://",
					errVideo: "Video URL must start with http(s)://",
					errUrlIsVideo: "That is a video link (.{ext}): switch to the Video tab, or use an image link",
					errUrlIsImage: "That is an image link (.{ext}): switch to the Image tab, or use a video link",
					errUrlTooLong: "URL too long (2000 characters max)",
					errLocalPathImage: "That is a local file path: pick the file with the Local image button below. The field takes http(s) links only (clicking Apply on the current wallpaper changes nothing)",
					errLocalPathVideo: "That is a local file path: pick the file with the Local video button below. The field takes http(s) links only (clicking Apply on the current wallpaper changes nothing)",
					errFileTooBig: "File exceeds the size limit",
					errFileType: "Unsupported file type",
					fit: "Fit",
					textScheme: "Text",
					fitFill: "Fill",
					fitCover: "Cover",
					fitContain: "Contain",
					fitCenter: "Center",
					fitTile: "Tile",
					schemeAuto: "Auto",
					schemeLight: "Light text",
					schemeDark: "Dark text",
					videoControls: "Video controls",
					play: "Play",
					pause: "Pause",
					stop: "Stop",
					speed: "Speed",
					loop: "Loop",
					textLight: "Light text",
					textDark: "Dark text",
					sound: "Sound",
					volume: "Volume",
					opacityLabel: "Opacity",
					posXLabel: "Horizontal focus",
					posYLabel: "Vertical focus",
					scaleLabel: "Zoom",
					errApply: "Failed to apply the background. Retry or reset to default first",
					errVideoLoad: "Video failed to load (no specific reason): make sure the link streams directly",
					errVideoAborted: "Video load aborted (MEDIA_ERR_ABORTED=1)",
					errVideoNetwork: "Video failed to load: network error (MEDIA_ERR_NETWORK=2). Check the link is directly reachable",
					errVideoDecode: "Video failed to load: decode error (MEDIA_ERR_DECODE=3). The format may be unsupported or the file is corrupt",
					errVideoSrc: "Video source not supported (MEDIA_ERR_SRC_NOT_SUPPORTED=4): the link is not directly playable or the format is not allowed",
					errVideoAutoplay: "Autoplay was blocked by the browser. Click Play to start",
					errVideoStalled: "The video network is slow or the server is not responding; waiting for data…",
					errVideoNoPicture: "The video has sound but no picture: its video track may use an unsupported codec (H.265/HEVC, ProRes). Use an H.264 (AVC) MP4",
					notice: "Notice",
					ok: "OK",
					...enPresetDict
				}
			});
			ctx.slots.inject("sidebar.footer.action", () => ctx.slots.register({
				name: "sidebar.footer.action",
				id: "dsh-bg",
				order: 0,
				label: () => text("wallpaper"),
				inject: () => ({ text })
			}, BgSidebarAction));
			ctx.slots.inject("shell.overlay", () => ctx.slots.register({
				name: "shell.overlay",
				id: "dsh-bg",
				order: 0,
				label: () => text("wallpaper"),
				inject: () => ({
					setBg,
					text
				})
			}, BgDrawer));
			ctx.effect(() => {
				let off;
				try {
					off = scope?.subscribe(adopt);
				} catch {
					off = void 0;
				}
				adopt();
				return () => {
					off?.();
					runFlushImpl = null;
					restoreBg();
					disposeAdjusting();
					setDrawerOpen(false);
				};
			});
			ctx.effect(() => installDrawerLayoutStyle());
		}
		function BgPanel(props) {
			const snap = (0, react.useSyncExternalStore)(subscribeStore, getSnapshot);
			const setBg = props.setBg ?? (() => {});
			const text = props.text ?? ((k) => k);
			const [hex, setHex] = (0, react.useState)("#1e2a78");
			const [gradient, setGradient] = (0, react.useState)("linear-gradient(135deg, #1e2a78, #2b1055)");
			const [imageUrl, setImageUrl] = (0, react.useState)("");
			const [videoUrl, setVideoUrl] = (0, react.useState)("");
			const [error, setError] = (0, react.useState)("");
			/** 上传进行中（'image' | 'video' | ''）：按钮 disabled + 上传中文案（v0.4）。 */
			const [uploading, setUploading] = (0, react.useState)("");
			/**
			* 需求（第三轮 5 / 第五轮 2）：**只有真的在拖动才降透明**。
			*
			* 旧实现把降透明挂在 pointerdown 上，于是"单击滑条轨道跳一个值"（pointerdown
			* 紧接 pointerup、指针没动过）也会让抽屉闪一下 22% —— 用户看到的就是"点击时也
			* 降透明"。现在 pointerdown 只记起点，指针**移动超过 3px** 才置交互期；
			* pointerup / pointercancel / blur 收尾。监听挂 document，拖出控件盒子也不丢。
			*/
			const DIM_DRAG_PX = 3;
			const dimPress = (0, react.useRef)(null);
			const dimPressEnd = () => {
				dimPress.current?.cleanup();
			};
			const dimPressBegin = (x, y) => {
				dimPressEnd();
				const state = { on: false };
				const doc = globalThis.document;
				function cleanup() {
					doc?.removeEventListener?.("pointermove", onMove);
					doc?.removeEventListener?.("pointerup", cleanup);
					doc?.removeEventListener?.("pointercancel", cleanup);
					if (state.on) bgSetAdjusting(false);
					if (dimPress.current !== null && dimPress.current.cleanup === cleanup) dimPress.current = null;
				}
				function onMove(e) {
					if (state.on) return;
					const cx = Number.isFinite(e.clientX) ? Number(e.clientX) : x;
					const cy = Number.isFinite(e.clientY) ? Number(e.clientY) : y;
					if (Math.hypot(cx - x, cy - y) < DIM_DRAG_PX) return;
					state.on = true;
					bgSetAdjusting(true);
				}
				dimPress.current = {
					get on() {
						return state.on;
					},
					cleanup
				};
				doc?.addEventListener?.("pointermove", onMove);
				doc?.addEventListener?.("pointerup", cleanup);
				doc?.addEventListener?.("pointercancel", cleanup);
			};
			(0, react.useEffect)(() => () => {
				dimPress.current?.cleanup();
				bgSetAdjusting(false);
			}, []);
			const dimHandlers = {
				onPointerDown: (e) => {
					dimPressBegin(Number.isFinite(e?.clientX) ? Number(e?.clientX) : 0, Number.isFinite(e?.clientY) ? Number(e?.clientY) : 0);
				},
				onPointerUp: () => {
					dimPressEnd();
				},
				onPointerCancel: () => {
					dimPressEnd();
				},
				onBlur: () => {
					dimPressEnd();
				},
				onKeyDown: () => {
					bgSetAdjusting(true);
				},
				onKeyUp: () => {
					bgSetAdjusting(false);
				}
			};
			/** 滚轮缩放没有 pointerup —— 用一段静默期自动结束降透明。 */
			const dimTimer = (0, react.useRef)(void 0);
			const dimAutoOff = () => {
				const g = globalThis;
				bgSetAdjusting(true);
				g.clearTimeout?.(dimTimer.current);
				dimTimer.current = g.setTimeout?.(() => {
					bgSetAdjusting(false);
				}, 420);
			};
			(0, react.useEffect)(() => () => {
				globalThis.clearTimeout?.(dimTimer.current);
			}, []);
			const tabForMode = (mode) => mode === "color" || mode === "gradient" || mode === "image" || mode === "video" ? mode : "presets";
			const [tab, setTab] = (0, react.useState)(() => tabForMode(snap.mode));
			/** 硬错误（弹窗）；软提示（自动播放被拒/网络慢）只走面板内提示行，不打断操作。 */
			const HARD_ERROR_KEYS = [
				"errApply",
				"errVideoLoad",
				"errVideoAborted",
				"errVideoNetwork",
				"errVideoDecode",
				"errVideoSrc"
			];
			const [rtKey, setRtKey] = (0, react.useState)("");
			(0, react.useEffect)(() => {
				const key = snap.status.error;
				if (HARD_ERROR_KEYS.includes(key)) setRtKey(key);
				else if (key === "" || key !== "" && !HARD_ERROR_KEYS.includes(key)) setRtKey("");
			}, [snap.status.error]);
			const closePopups = () => {
				setError("");
				setRtKey("");
			};
			const popupMessage = rtKey !== "" ? text(rtKey) : error;
			/** 编辑中的字段（焦点内不覆盖，防打字被镜像打断）。 */
			const editing = (0, react.useRef)({});
			const markEditing = (field, value) => {
				editing.current[field] = value;
			};
			(0, react.useEffect)(() => {
				const EDITABLE_VALUE_MAX = 4e3;
				const editableValue = (v) => v !== "" && v.length <= EDITABLE_VALUE_MAX ? v : "";
				if (editing.current.color !== true) {
					const short = /^#[0-9a-fA-F]{3}$/.test(snap.value) ? "#" + snap.value.slice(1).split("").map((c) => c + c).join("") : snap.value;
					const v = snap.mode === "color" && /^#[0-9a-fA-F]{3,8}$/.test(short) ? short.toLowerCase() : "#1e2a78";
					if (hex !== v) setHex(v);
				}
				if (editing.current.gradient !== true) {
					const applied = snap.mode === "gradient" ? editableValue(snap.value) : "";
					const v = applied !== "" ? applied : "linear-gradient(135deg, #1e2a78, #2b1055)";
					if (gradient !== v) setGradient(v);
				}
				if (editing.current.image !== true) {
					const v = snap.mode === "image" ? editableValue(snap.value) : "";
					if (imageUrl !== v) setImageUrl(v);
				}
				if (editing.current.video !== true) {
					const v = snap.mode === "video" ? editableValue(snap.value) : "";
					if (videoUrl !== v) setVideoUrl(v);
				}
			}, [
				snap.mode,
				snap.value,
				snap.mediaKey
			]);
			/** 进度/时长 mm:ss 格式化（#8）。 */
			const fmtTime = (sec) => {
				const total = Math.max(0, Math.floor(Number.isFinite(sec) ? sec : 0));
				const m = Math.floor(total / 60);
				const r = total % 60;
				return `${m}:${String(r).padStart(2, "0")}`;
			};
			const activeKey = `${snap.mode}\u0000${snap.value}\u0000${snap.fit}`;
			const isWallpaper = snap.mode === "image" || snap.mode === "video";
			const imageExt = snap.cfg?.imageExt?.length ? snap.cfg.imageExt : DEFAULT_BG_CONFIG.imageExt;
			const videoExt = snap.cfg?.videoExt?.length ? snap.cfg.videoExt : DEFAULT_BG_CONFIG.videoExt;
			const acceptImageAttr = imageExt.map((ext) => `.${ext}`).join(",");
			const acceptVideoAttr = videoExt.map((ext) => `.${ext}`).join(",");
			const makeButton = (label, onPress, primary = false, disabled = false) => (0, react_jsx_runtime.jsx)("button", {
				type: "button",
				disabled,
				onClick: onPress,
				style: {
					padding: "4px 12px",
					borderRadius: "6px",
					border: "1px solid var(--dsw-alias-border-l2, #ccc)",
					background: primary ? "#3b82f6" : "transparent",
					color: primary ? "#fff" : "var(--dsw-alias-label-primary, #111)",
					cursor: disabled ? "not-allowed" : "pointer",
					opacity: disabled ? .45 : 1
				},
				children: label
			});
			const inputStyle = {
				flex: 1,
				minWidth: "180px",
				padding: "6px 8px",
				borderRadius: "6px",
				border: "1px solid var(--dsw-alias-border-l2, #ccc)",
				background: "var(--dsw-alias-bg-layer-1, #fff)",
				color: "var(--dsw-alias-label-primary, #111)"
			};
			const selectStyle = {
				padding: "4px 6px",
				borderRadius: "6px",
				border: "1px solid var(--dsw-alias-border-l2, #ccc)",
				background: "var(--dsw-alias-bg-layer-1, #fff)",
				color: "var(--dsw-alias-label-primary, #111)"
			};
			const row = (label, input, action) => (0, react_jsx_runtime.jsx)("div", {
				style: {
					display: "flex",
					gap: "8px",
					alignItems: "center",
					margin: "6px 0",
					flexWrap: "wrap"
				},
				children: [
					(0, react_jsx_runtime.jsx)("span", {
						style: {
							width: "44px",
							flexShrink: 0
						},
						children: label
					}),
					input,
					action
				]
			});
			/**
			* 需求 1：不带标签的行 —— 四个来源页签（纯色/渐变/图片/视频）里的编辑行都只留
			* 「输入框 + （图片/视频再加一个本地文件图标）+ 应用按钮」（页签本身已经说明了
			* 来源，再写一遍是重复）。可变参数便于把隐藏的 file input 一起塞进行里。
			*/
			const plainRow = (...children) => (0, react_jsx_runtime.jsx)("div", {
				style: {
					display: "flex",
					gap: "8px",
					alignItems: "center",
					margin: "6px 0",
					flexWrap: "wrap"
				},
				children
			});
			const applyColor = () => {
				const v = hex.trim();
				if (!/^#[0-9a-fA-F]{3,8}$/.test(v)) {
					setError(text("errColor"));
					return;
				}
				setError("");
				setBg("color", v.toLowerCase());
			};
			const applyGradient = () => {
				const v = gradient.trim();
				if (v.length > 300) {
					setError(text("errGradient"));
					return;
				}
				const open = v.indexOf("(");
				const head = (open >= 0 ? v.slice(0, open + 1) : "").toLowerCase();
				if (![
					"linear-gradient(",
					"radial-gradient(",
					"conic-gradient("
				].includes(head)) {
					setError(text("errGradient"));
					return;
				}
				if (!BG_CSS_SAFE.test(v)) {
					setError(text("errGradientCharset"));
					return;
				}
				setError("");
				setBg("gradient", v);
			};
			/**
			* 需求 6：输入框回显的可能是**本地文件**的当前值（UI 上传记文件名、`bg_apply
			* file` 记绝对路径）。判定收敛在 bgMediaFieldVerdict 里：
			* noop = 当前本地媒体且没改 → 保持不变；local-path = 换成别的本地路径 → 提示用
			* 本地选择按钮；invalid = 空/乱文本 → 提示需要 http(s)。
			*/
			const applyImageUrl = () => {
				const v = imageUrl.trim();
				const verdict = bgMediaFieldVerdict("image", v, snap);
				if (verdict === "noop") {
					setError("");
					return;
				}
				if (verdict === "local-path") {
					setError(text("errLocalPathImage"));
					return;
				}
				if (verdict === "invalid") {
					setError(text("errImage"));
					return;
				}
				if (v.length > 2e3) {
					setError(text("errUrlTooLong"));
					return;
				}
				if (mediaUrlKindConflict(v, "image", snap.cfg) === "is-video") {
					setError(text("errUrlIsVideo").replace("{ext}", urlExtOf(v)));
					return;
				}
				setError("");
				setBg("image", v);
			};
			const applyVideoUrl = () => {
				const v = videoUrl.trim();
				const verdict = bgMediaFieldVerdict("video", v, snap);
				if (verdict === "noop") {
					setError("");
					return;
				}
				if (verdict === "local-path") {
					setError(text("errLocalPathVideo"));
					return;
				}
				if (verdict === "invalid") {
					setError(text("errVideo"));
					return;
				}
				if (v.length > 2e3) {
					setError(text("errUrlTooLong"));
					return;
				}
				if (mediaUrlKindConflict(v, "video", snap.cfg) === "is-image") {
					setError(text("errUrlIsImage").replace("{ext}", urlExtOf(v)));
					return;
				}
				setError("");
				setBg("video", v);
			};
			/**
			* 本地文件上传（v0.4：image/video 统一走 POST /dsh-bg-media/upload → mediaKey；
			* v0.4.1：value 记**原文件名**供展示/重启后回显 —— 引擎渲染仍以 mediaKey 优先，
			* value 只是可读来源标识（bg_apply file 登记的本地文件 value 则保留完整路径）。
			* 不再内联 data URI）。上传中按钮 disabled + 文案。
			*/
			const uploadLocal = async (kind, file) => {
				if (!file) return;
				if (uploading !== "") return;
				setUploading(kind);
				setError("");
				const outcome = await bgUploadLocalFile(file, kind, snap.cfg?.imageExt?.length ? snap.cfg : {
					...DEFAULT_BG_CONFIG,
					imageExt: [...DEFAULT_BG_CONFIG.imageExt],
					videoExt: [...DEFAULT_BG_CONFIG.videoExt]
				});
				setUploading("");
				if (outcome.ok && outcome.mediaKey !== void 0) {
					setBg(kind, file.name, { mediaKey: outcome.mediaKey });
					return;
				}
				if (outcome.errorKey === "errFileTooBig") setError(`${text("errFileTooBig")}（≤${outcome.detail ?? ""}）`);
				else if (outcome.errorKey === "errFileType") setError(`${text("errFileType")}（${outcome.detail ?? ""}）`);
				else setError(outcome.message ?? text("errFileType"));
			};
			const imageFileRef = (0, react.useRef)(null);
			const videoFileRef = (0, react.useRef)(null);
			/** 点图标 = 触发对应的隐藏 <input type=file>（浏览器只允许用户手势里这么做）。 */
			const openFilePicker = (kind) => {
				const el = kind === "image" ? imageFileRef.current : videoFileRef.current;
				try {
					el?.click?.();
				} catch {}
			};
			/** 隐藏的 file input：`display:none` 之后浏览器不再渲染"未选择任何文件"文案。 */
			const fileInput = (kind, ref, accept) => (0, react_jsx_runtime.jsx)("input", {
				key: "file",
				ref,
				type: "file",
				accept,
				disabled: uploading !== "",
				style: { display: "none" },
				onChange: (e) => {
					uploadLocal(kind, e.target.files?.[0] ?? void 0);
					try {
						if (e.target.value !== void 0) e.target.value = "";
					} catch {}
				}
			});
			/** 行内的本地文件图标按钮：作用等于"选择本地文件"。 */
			const filePickButton = (kind) => (0, react_jsx_runtime.jsx)("button", {
				key: "pick",
				type: "button",
				"data-testid": kind === "image" ? "dsh-bg-image-file" : "dsh-bg-video-file",
				"aria-label": text("chooseFile"),
				title: text("chooseFile"),
				disabled: uploading !== "",
				onClick: () => {
					openFilePicker(kind);
				},
				style: {
					boxSizing: "border-box",
					width: "32px",
					height: "32px",
					flexShrink: 0,
					display: "inline-flex",
					alignItems: "center",
					justifyContent: "center",
					cursor: uploading !== "" ? "not-allowed" : "pointer",
					opacity: uploading !== "" ? .5 : 1,
					padding: 0,
					border: "1px solid var(--dsw-alias-border-l2, #ccc)",
					borderRadius: "6px",
					background: "transparent",
					color: "var(--dsw-alias-label-secondary, #666)",
					fontSize: "0.75em"
				},
				children: uploading === kind ? "…" : folderIcon(16)
			});
			const changeFit = (fit) => {
				setError("");
				setBg(snap.mode, snap.value, { fit });
			};
			const changeScheme = (scheme) => {
				setError("");
				setBg(snap.mode, snap.value, { textScheme: scheme });
			};
			const changeLoop = (checked) => {
				setError("");
				const applied = bgVideoSetLoop(checked);
				setBg(snap.mode, snap.value, { loop: applied });
			};
			/** 声音开关：运行时态（不持久化）；点开=手势 → muted=false + resume play()。 */
			const changeSound = (checked) => {
				setError("");
				bgVideoSetSound(checked);
			};
			/** 音量滑杆：乐观写元素 + 快照，持久化 volume 经 setBg 防抖。 */
			const changeVolume = (percent) => {
				setError("");
				const applied = bgVideoSetVolume(percent / 100);
				setBg(snap.mode, snap.value, { volume: applied });
			};
			/**
			* v0.5.0：**缩放（zoom）滑杆 100%–300%** —— 面板上的"缩放"控件改用 zoom（在
			* fit 基准尺寸上放大聚焦，见 bgMediaRender）：写快照即时渲染 + 防抖持久化。
			* 若 settings 里还留着 v0.4.3 的 `scale`（≠1），本次一并把它归 1 —— 两条缩放轴
			* 相乘会把画面放大两次（隐藏的坑），归 1 后行为可预期。
			*/
			const changeZoom = (percent) => {
				setError("");
				const zoom = clampBgZoom(percent / 100);
				const opts = snap.scale === 1 ? { zoom } : {
					zoom,
					scale: 1
				};
				setBg(snap.mode, snap.value, opts);
			};
			/** v0.6.0：毛玻璃质感开关（持久化 glass 字段）。 */
			const changeGlass = (checked) => {
				setError("");
				setBg(snap.mode, snap.value, { glass: checked });
			};
			const swatchStyle = (p) => {
				if (p.mode === "off") return {
					background: "var(--dsw-alias-bg-layer-1, #fff)",
					border: "1px dashed var(--dsw-alias-border-l2, #aaa)"
				};
				return { background: p.value };
			};
			/** v0.4.4 (#3)：恢复默认（只重置背景命名空间，不影响其它设置页）。 */
			const resetToDefault = () => {
				closePopups();
				setBg("off", "", { resetAll: true });
			};
			const fitSelect = (0, react_jsx_runtime.jsx)("select", {
				value: snap.fit,
				disabled: !isWallpaper,
				onChange: (e) => changeFit(e.target.value),
				style: {
					...selectStyle,
					opacity: isWallpaper ? 1 : .5
				},
				children: BG_FITS.map((fit) => (0, react_jsx_runtime.jsx)("option", {
					key: fit,
					value: fit,
					children: text("fit" + fit[0].toUpperCase() + fit.slice(1))
				}))
			});
			const schemeSelect = (0, react_jsx_runtime.jsx)("select", {
				value: snap.textScheme,
				disabled: snap.mode === "off",
				onChange: (e) => changeScheme(e.target.value),
				style: {
					...selectStyle,
					opacity: snap.mode === "off" ? .5 : 1
				},
				children: BG_TEXT_SCHEMES.map((scheme) => (0, react_jsx_runtime.jsx)("option", {
					key: scheme,
					value: scheme,
					children: text("scheme" + scheme[0].toUpperCase() + scheme.slice(1))
				}))
			});
			const mediaTabActive = isWallpaper && tab === snap.mode;
			const videoTabActive = snap.mode === "video" && tab === "video";
			const durSec = snap.video.duration;
			const curSec = snap.video.currentTime;
			const seekReady = durSec > 0;
			const progressRow = videoTabActive ? (0, react_jsx_runtime.jsx)("div", {
				"data-testid": "dsh-bg-video-progress",
				style: {
					display: "flex",
					gap: "8px",
					alignItems: "center",
					margin: "4px 0 2px 52px"
				},
				children: [
					(0, react_jsx_runtime.jsx)("span", {
						style: {
							width: "38px",
							flexShrink: 0,
							textAlign: "right",
							fontSize: "0.78em",
							opacity: .8,
							fontVariantNumeric: "tabular-nums"
						},
						children: fmtTime(curSec)
					}),
					(0, react_jsx_runtime.jsx)("input", {
						type: "range",
						min: 0,
						max: durSec,
						step: .1,
						value: Math.min(curSec, durSec),
						disabled: !seekReady,
						onChange: (e) => {
							bgVideoSeek(Number(e.target.value));
						},
						style: {
							flex: 1,
							minWidth: "80px",
							opacity: seekReady ? 1 : .45,
							cursor: seekReady ? "pointer" : "not-allowed"
						}
					}),
					(0, react_jsx_runtime.jsx)("span", {
						style: {
							width: "38px",
							flexShrink: 0,
							fontSize: "0.78em",
							opacity: .8,
							fontVariantNumeric: "tabular-nums"
						},
						children: fmtTime(durSec)
					})
				]
			}) : null;
			const videoControlRow = videoTabActive ? (0, react_jsx_runtime.jsx)("div", {
				"data-testid": "dsh-bg-video-controls",
				style: {
					display: "flex",
					gap: "8px",
					alignItems: "center",
					margin: "8px 0 6px 52px",
					flexWrap: "wrap"
				},
				children: [
					(0, react_jsx_runtime.jsx)("button", {
						type: "button",
						key: "playstop",
						"data-testid": "dsh-bg-video-playstop",
						"aria-label": snap.video.paused ? text("play") : text("stop"),
						title: snap.video.paused ? text("play") : text("stop"),
						onClick: () => {
							if (snap.video.paused) bgVideoToggle();
							else bgVideoStop();
						},
						style: {
							boxSizing: "border-box",
							width: "28px",
							height: "28px",
							flexShrink: 0,
							display: "inline-flex",
							alignItems: "center",
							justifyContent: "center",
							cursor: "pointer",
							padding: 0,
							border: "1px solid var(--dsw-alias-border-l2, #ccc)",
							borderRadius: "50%",
							background: "transparent",
							color: "var(--dsw-alias-label-primary, #111)"
						},
						children: snap.video.paused ? playIcon(14) : stopIcon(14)
					}),
					(0, react_jsx_runtime.jsx)("label", {
						style: {
							fontSize: "0.85em",
							display: "flex",
							gap: "4px",
							alignItems: "center"
						},
						children: [text("speed"), (0, react_jsx_runtime.jsx)("select", {
							value: snap.video.rate,
							onChange: (e) => bgVideoSetRate(Number(e.target.value)),
							style: selectStyle,
							children: [
								"0.5",
								"1",
								"1.5",
								"2"
							].map((rate) => (0, react_jsx_runtime.jsx)("option", {
								key: rate,
								value: rate,
								children: `${rate}x`
							}))
						})]
					}),
					(0, react_jsx_runtime.jsx)("label", {
						style: {
							fontSize: "0.85em",
							display: "flex",
							gap: "4px",
							alignItems: "center"
						},
						children: [(0, react_jsx_runtime.jsx)("input", {
							type: "checkbox",
							checked: snap.loop,
							onChange: (e) => changeLoop(e.target.checked)
						}), text("loop")]
					}),
					(0, react_jsx_runtime.jsx)("label", {
						"data-testid": "dsh-bg-video-sound",
						style: {
							fontSize: "0.85em",
							display: "flex",
							gap: "4px",
							alignItems: "center"
						},
						children: [(0, react_jsx_runtime.jsx)("input", {
							type: "checkbox",
							checked: snap.video.soundOn,
							onChange: (e) => changeSound(e.target.checked)
						}), text("sound")]
					})
				]
			}) : null;
			let volumeRow = null;
			const sliderRow = (labelText, min, max, step, value, suffix, onInput, dim = false) => (0, react_jsx_runtime.jsx)("div", {
				style: {
					display: "flex",
					gap: "8px",
					alignItems: "center",
					margin: "6px 0",
					flexWrap: "wrap"
				},
				children: [
					(0, react_jsx_runtime.jsx)("span", {
						style: {
							width: "64px",
							flexShrink: 0,
							fontSize: "0.9em"
						},
						children: labelText
					}),
					(0, react_jsx_runtime.jsx)("input", {
						type: "range",
						min,
						max,
						step,
						value,
						onChange: (e) => onInput(Number(e.target.value)),
						...dim ? dimHandlers : {},
						style: {
							flex: 1,
							minWidth: "120px"
						}
					}),
					(0, react_jsx_runtime.jsx)("span", {
						style: {
							width: "52px",
							textAlign: "right",
							fontSize: "0.85em",
							opacity: .8
						},
						children: `${value}${suffix}`
					})
				]
			});
			/**
			* 一块小图（16:9，只画当前背景本身），把「缩放」与「定位」两个功能合到一个控件上：
			* - **滚轮**在小图里滚动 = 缩放（zoom 1..3，按 1.1 的倍率、吸附 0.05）；
			* - **按住拖动** = 定位（posX / posY，拖满小图宽/高 = 0→100 全量程）。
			*
			* 小图用 mediaRenderPlan(snap) 渲染 —— 与真实全屏层同一份公式（fit / 焦点 /
			* zoom / scale / opacity），所以小图里看到的就是主界面的效果，不是另一套近似。
			* 拖动/滚轮期间同样进入交互期（抽屉降透明，见 dimHandlers / dimAutoOff）。
			*/
			const mapRef = (0, react.useRef)(null);
			/** 视频模式下的小图画布：直接镜像真实层那一帧（见 videoMirrorDraw）。 */
			const mapCanvasRef = (0, react.useRef)(null);
			const mapPlan = mediaRenderPlan(snap);
			const mapSource = snap.mode === "video" ? videoSrcOf(snap) : snap.mode === "image" ? bgMediaSrc(snap) : null;
			const mapEnabled = mediaTabActive && mapSource !== null;
			/** 越界宽限毫秒数（第五轮需求 4：拖出边界后 2 秒内仍可继续定位）。 */
			const MAP_GRACE_MS = 2e3;
			/** 指针是否正处在小图边界之外（驱动明暗闪动边框，需求 5）。 */
			const [mapOutside, setMapOutside] = (0, react.useState)(false);
			/** 当前这次小图拖动：只需保留"结束拖动"的能力（其余状态在闭包里）。 */
			const mapDrag = (0, react.useRef)(null);
			/**
			* fit → 在给定盒子里的基准尺寸（与 CSS 的 background-size / object-fit 同一套规则）。
			* 小图的视频画布用它复算真实层的构图。
			*/
			const fitBoxSize = (vw, vh, W, H, fit) => {
				if (fit === "fill") return {
					w: W,
					h: H
				};
				if (fit === "contain") {
					const s = Math.min(W / vw, H / vh);
					return {
						w: vw * s,
						h: vh * s
					};
				}
				if (fit === "center" || fit === "tile") return {
					w: vw,
					h: vh
				};
				const s = Math.max(W / vw, H / vh);
				return {
					w: vw * s,
					h: vh * s
				};
			};
			/**
			* 第七轮需求 4：视频模式下的小图**不再开第二路 `<video>`**，改成把真实层那个
			* `<video>` 的当前帧 `drawImage` 到 canvas 上。
			*
			* 为什么：远程视频链接在小图的第二个 `<video>` 里经常不出画面（浏览器对同一 URL
			* 的第二路媒体加载/自动播放策略更严，也可能被服务端按 Referer 拒掉），而 canvas
			* 直接复用真实层**已经解码好的那一帧** —— 本地/远程一视同仁，也不额外吃解码与带宽。
			* 构图（fit / 焦点 / zoom）在这里按与真实层相同的公式复算：先按 fit 求基准尺寸，
			* 再绕焦点（posX% / posY%）放大 zoom 倍 —— 这正是 CSS
			* `object-fit + object-position + transform: scale(z)/transform-origin: p% p%` 的效果。
			*/
			const videoMirrorDraw = () => {
				const canvas = mapCanvasRef.current;
				const src = videoEl;
				if (canvas === null || canvas === void 0 || src === null) return;
				const vw = src.videoWidth;
				const vh = src.videoHeight;
				const W = canvas.clientWidth;
				const H = canvas.clientHeight;
				if (!(vw > 0) || !(vh > 0) || !(W > 0) || !(H > 0)) return;
				const ctx = canvas.getContext?.("2d");
				if (ctx === null || ctx === void 0) return;
				if (canvas.width !== W) canvas.width = W;
				if (canvas.height !== H) canvas.height = H;
				const s = getSnapshot();
				const base = fitBoxSize(vw, vh, W, H, s.fit);
				const z = clampBgZoom(s.zoom);
				const px = clampBgPos(s.posX) / 100;
				const py = clampBgPos(s.posY) / 100;
				const left0 = px * (W - base.w);
				const top0 = py * (H - base.h);
				const originX = px * W;
				const originY = py * H;
				try {
					ctx.clearRect(0, 0, W, H);
					ctx.drawImage(src, originX + (left0 - originX) * z, originY + (top0 - originY) * z, base.w * z, base.h * z);
				} catch {}
			};
			(0, react.useEffect)(() => {
				if (!mapEnabled || snap.mode !== "video") return;
				const g = globalThis;
				videoMirrorDraw();
				const handle = g.setInterval?.(() => {
					videoMirrorDraw();
				}, 140);
				return () => {
					g.clearInterval?.(handle);
				};
			}, [mapEnabled, snap.mode]);
			/**
			* 滚轮缩放（第五轮需求 1 的修复）：**监听挂在 document 上、事件时再判断目标是否
			* 落在小图内**。
			*
			* 之前把 wheel 监听装在 `[data-testid=dsh-bg-minimap-box]` 的 ref 上、effect 依赖
			* 只有 `[setBg]` —— 打开抽屉时如果当前不是图片/视频（小图还没渲染），effect 那次
			* 拿到的是 null，之后切到图片/视频页签小图挂出来了，effect 却不会再跑，于是滚轮
			* 完全没反应。改成 document 级 + 包含判断后，监听只装一次，小图何时出现都生效。
			*
			* React 的 onWheel 在根上挂 passive，preventDefault 无效，所以这里用原生
			* addEventListener + { passive: false }（capture 阶段，抢在抽屉滚动之前）。
			*/
			(0, react.useEffect)(() => {
				const doc = globalThis.document;
				if (doc === null || doc === void 0 || typeof doc.addEventListener !== "function") return;
				const onWheel = (e) => {
					const box = mapRef.current;
					if (box === null || box === void 0 || typeof box.contains !== "function") return;
					const target = e.target;
					if (target === null || target === void 0) return;
					try {
						if (!box.contains(target)) return;
					} catch {
						return;
					}
					try {
						e.preventDefault?.();
					} catch {}
					const current = getSnapshot();
					const step = (e.deltaY ?? 0) < 0 ? 1.1 : 1 / 1.1;
					const next = clampBgZoom(current.zoom * step);
					if (next === clampBgZoom(current.zoom)) return;
					setError("");
					setBg(current.mode, current.value, { zoom: next });
					dimAutoOff();
				};
				doc.addEventListener("wheel", onWheel, {
					passive: false,
					capture: true
				});
				return () => {
					doc.removeEventListener?.("wheel", onWheel, { capture: true });
				};
			}, [setBg]);
			/**
			* 小图拖动（第五轮需求 4/5）：定位 + **2 秒越界宽限**。
			* - 指针拖出小图边界后**不立刻结束**：2 秒内仍可继续定位（位置继续跟随、夹 0..100）；
			*   中途回到边界内则取消计时；2 秒到点（或松手）才真正离开边界、结束这次拖动。
			* - 越界期间小图边框走明暗闪动动画（需求 5），说明"正在边界外操作"。
			* 监听挂 document：拖出小图后照样收得到 pointermove / pointerup。
			*/
			const mapPointerDown = (e) => {
				mapEndDrag();
				const box = e.currentTarget?.getBoundingClientRect?.();
				const doc = globalThis.document;
				const g = globalThis;
				const start = getSnapshot();
				const state = {
					x: Number.isFinite(e.clientX) ? Number(e.clientX) : 0,
					y: Number.isFinite(e.clientY) ? Number(e.clientY) : 0,
					width: box !== void 0 && box.width > 0 ? box.width : 1,
					height: box !== void 0 && box.height > 0 ? box.height : 1,
					posX: start.posX,
					posY: start.posY,
					box: box ?? null,
					outside: false,
					grace: void 0
				};
				function clearGrace() {
					if (state.grace !== void 0) {
						g.clearTimeout?.(state.grace);
						state.grace = void 0;
					}
				}
				function leave() {
					clearGrace();
					doc?.removeEventListener?.("pointermove", onMove);
					doc?.removeEventListener?.("pointerup", leave);
					doc?.removeEventListener?.("pointercancel", leave);
					if (state.outside) setMapOutside(false);
					if (mapDrag.current !== null && mapDrag.current.cleanup === leave) mapDrag.current = null;
					dimHandlers.onPointerUp();
				}
				function onMove(ev) {
					const cx = Number.isFinite(ev.clientX) ? Number(ev.clientX) : state.x;
					const cy = Number.isFinite(ev.clientY) ? Number(ev.clientY) : state.y;
					const cur = getSnapshot();
					const nx = clampBgPos(state.posX + (cx - state.x) / state.width * 100);
					const ny = clampBgPos(state.posY + (cy - state.y) / state.height * 100);
					if (nx !== cur.posX || ny !== cur.posY) {
						setError("");
						setBg(cur.mode, cur.value, {
							posX: nx,
							posY: ny
						});
					}
					const r = state.box;
					if (r === null) return;
					if (cx >= r.left && cx <= r.right && cy >= r.top && cy <= r.bottom) {
						if (state.outside) {
							state.outside = false;
							clearGrace();
							setMapOutside(false);
						}
						return;
					}
					if (state.outside) return;
					state.outside = true;
					setMapOutside(true);
					state.grace = g.setTimeout?.(() => {
						leave();
					}, MAP_GRACE_MS);
				}
				doc?.addEventListener?.("pointermove", onMove);
				doc?.addEventListener?.("pointerup", leave);
				doc?.addEventListener?.("pointercancel", leave);
				mapDrag.current = {
					outside: state.outside,
					cleanup: leave
				};
				dimHandlers.onPointerDown(e);
			};
			const mapEndDrag = () => {
				mapDrag.current?.cleanup();
			};
			const mapLayerStyle = (extra) => ({
				position: "absolute",
				inset: "0",
				opacity: `${mapPlan.opacity}`,
				...extra
			});
			const minimapBlock = mapEnabled ? (0, react_jsx_runtime.jsx)("div", {
				"data-testid": "dsh-bg-minimap",
				style: { margin: "2px 0 8px" },
				children: [(0, react_jsx_runtime.jsx)("div", {
					ref: mapRef,
					"data-testid": "dsh-bg-minimap-box",
					"data-dsh-bg-map-outside": mapOutside ? "" : void 0,
					onPointerDown: mapPointerDown,
					title: text("minimapHint"),
					style: {
						position: "relative",
						width: "100%",
						aspectRatio: "16 / 9",
						maxHeight: "180px",
						borderRadius: "10px",
						overflow: "hidden",
						border: "1px solid var(--dsw-alias-border-l2, #ccc)",
						backgroundColor: "var(--dsw-alias-bg-layer-3, #eee)",
						cursor: mapOutside ? "grabbing" : "grab",
						touchAction: "none",
						userSelect: "none",
						animation: mapOutside ? "dsh-bg-minimap-outside 0.9s ease-in-out infinite" : void 0
					},
					children: [mapPlan.image !== null ? (0, react_jsx_runtime.jsx)("div", {
						"data-dsh-bg-minimap-layer": "",
						style: mapLayerStyle({
							backgroundImage: mapPlan.image.backgroundImage,
							backgroundSize: mapPlan.image.backgroundSize,
							backgroundPosition: mapPlan.image.backgroundPosition,
							backgroundRepeat: mapPlan.image.backgroundRepeat,
							...mapPlan.image.transform !== null ? {
								transformOrigin: mapPlan.image.transformOrigin,
								transform: mapPlan.image.transform
							} : {}
						})
					}) : (0, react_jsx_runtime.jsx)("video", {
						"data-dsh-bg-minimap-video": "",
						ref: mapCanvasRef,
						style: mapLayerStyle({
							width: "100%",
							height: "100%",
							display: "block"
						})
					})]
				}), (0, react_jsx_runtime.jsx)("p", {
					style: {
						fontSize: "0.75em",
						opacity: .6,
						margin: "6px 0 0"
					},
					children: text("minimapHint")
				})]
			}) : null;
			const wallpaperSliders = mediaTabActive ? [
				sliderRow(text("opacityLabel"), 0, 100, 5, Math.round(snap.opacity * 100), "%", (v) => {
					setError("");
					setBg(snap.mode, snap.value, { opacity: v / 100 });
				}, true),
				sliderRow(text("posXLabel"), 0, 100, 1, Math.round(snap.posX), "%", (v) => {
					setError("");
					setBg(snap.mode, snap.value, { posX: v });
				}, true),
				sliderRow(text("posYLabel"), 0, 100, 1, Math.round(snap.posY), "%", (v) => {
					setError("");
					setBg(snap.mode, snap.value, { posY: v });
				}, true),
				sliderRow(text("zoomLabel"), Math.round(100), Math.round(300), 5, Math.round(clampBgZoom(snap.zoom) * 100), "%", changeZoom, true)
			] : [];
			volumeRow = videoTabActive ? sliderRow(text("volume"), 0, 100, 5, Math.round(clampBgVolume(snap.volume) * 100), "%", changeVolume) : null;
			const currentLabel = snap.mode === "off" || snap.mode === "" ? text("currentOff") : `${text("current")}: ${snap.mode} · ${(snap.value !== "" ? snap.value : snap.mediaKey !== "" ? `/dsh-bg-media/${snap.mediaKey}` : "").slice(0, 120)}`;
			const schemeLabel = snap.resolvedText === null ? "" : `（${snap.resolvedText === "light" ? text("textLight") : text("textDark")}）`;
			const tabDefs = [
				["presets", text("presets")],
				["color", text("color")],
				["gradient", text("gradient")],
				["image", text("image")],
				["video", text("video")]
			];
			const tabIndex = Math.max(0, tabDefs.findIndex(([id]) => id === tab));
			const tabThumb = (0, react_jsx_runtime.jsx)("div", {
				key: "thumb",
				"data-testid": "dsh-bg-tab-thumb",
				"aria-hidden": true,
				style: {
					position: "absolute",
					top: "3px",
					bottom: "3px",
					left: "3px",
					width: `calc((100% - 6px) / ${tabDefs.length})`,
					borderRadius: "999px",
					background: "var(--dsw-alias-bg-layer-1, #fff)",
					boxShadow: "var(--dsw-elevation-panel, 0 1px 3px rgb(0 0 0 / 0.12))",
					transform: `translateX(${tabIndex * 100}%)`,
					transition: "transform 260ms cubic-bezier(0.2, 0.8, 0.2, 1)",
					pointerEvents: "none"
				}
			});
			const tabButton = (id, label) => {
				const activeTab = tab === id;
				return (0, react_jsx_runtime.jsx)("button", {
					type: "button",
					key: id,
					role: "tab",
					"aria-selected": activeTab,
					onClick: () => setTab(id),
					style: {
						position: "relative",
						zIndex: 1,
						flex: "1 1 0",
						minWidth: 0,
						padding: "5px 8px",
						border: "none",
						outline: "none",
						background: "transparent",
						borderRadius: "999px",
						cursor: "pointer",
						fontFamily: "inherit",
						fontSize: "0.85em",
						lineHeight: "18px",
						whiteSpace: "nowrap",
						overflow: "hidden",
						textOverflow: "ellipsis",
						color: activeTab ? "var(--dsw-alias-label-primary, #111)" : "var(--dsw-alias-label-secondary, #666)",
						fontWeight: activeTab ? 600 : 400,
						transition: "color 200ms ease"
					},
					children: label
				});
			};
			const tabBar = (0, react_jsx_runtime.jsx)("div", {
				"data-testid": "dsh-bg-tabs",
				style: {
					display: "flex",
					alignItems: "center",
					gap: "8px",
					margin: "0 0 12px",
					flexWrap: "nowrap",
					borderBottom: "1px solid var(--dsw-alias-border-l2, #ddd)",
					paddingBottom: "8px"
				},
				children: [(0, react_jsx_runtime.jsx)("div", {
					role: "tablist",
					"data-testid": "dsh-bg-tablist",
					style: {
						position: "relative",
						display: "flex",
						alignItems: "stretch",
						flex: "1 1 auto",
						minWidth: 0,
						padding: "3px",
						borderRadius: "999px",
						background: "var(--dsw-specific-selector, rgba(127, 127, 127, 0.14))",
						border: "1px solid var(--dsw-alias-border-l1, rgba(127, 127, 127, 0.16))"
					},
					children: [tabThumb, ...tabDefs.map(([id, label]) => tabButton(id, label))]
				}), (0, react_jsx_runtime.jsx)("button", {
					type: "button",
					key: "reset",
					"data-testid": "dsh-bg-reset",
					onClick: resetToDefault,
					style: {
						flexShrink: 0,
						padding: "5px 12px",
						borderRadius: "999px",
						cursor: "pointer",
						fontSize: "0.85em",
						fontFamily: "inherit",
						border: "1px solid var(--dsw-alias-border-l2, #ddd)",
						background: "transparent",
						color: "var(--dsw-alias-label-secondary, #666)"
					},
					children: text("reset")
				})]
			});
			const presetGrid = (0, react_jsx_runtime.jsx)("div", {
				style: {
					display: "grid",
					gridTemplateColumns: "repeat(auto-fill, minmax(92px, 1fr))",
					gap: "8px",
					marginBottom: "4px"
				},
				children: PRESETS.map((p) => {
					const isActive = activeKey === `${p.mode}\u0000${p.value}\u0000${snap.fit}`;
					return (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						key: p.key,
						onClick: () => {
							closePopups();
							setBg(p.mode, p.value);
						},
						style: {
							display: "flex",
							flexDirection: "column",
							alignItems: "center",
							gap: "6px",
							padding: "8px",
							borderRadius: "8px",
							cursor: "pointer",
							border: isActive ? "2px solid #3b82f6" : "1px solid var(--dsw-alias-border-l2, #ddd)",
							background: "transparent"
						},
						children: [(0, react_jsx_runtime.jsx)("div", { style: {
							width: "100%",
							height: "44px",
							borderRadius: "6px",
							...swatchStyle(p)
						} }), (0, react_jsx_runtime.jsx)("span", {
							style: {
								fontSize: "0.8em",
								color: "var(--dsw-alias-label-secondary, #666)"
							},
							children: text("preset." + p.key)
						})]
					});
				})
			});
			/** 各 tab 的编辑内容（一次只显示一类来源，tabs 布局）。 */
			const editorNodes = [];
			if (tab === "presets") editorNodes.push(presetGrid);
			if (tab === "color") editorNodes.push(plainRow((0, react_jsx_runtime.jsx)("input", {
				type: "color",
				value: hex,
				onChange: (e) => setHex(e.target.value),
				style: {
					height: "28px",
					width: "48px",
					padding: 0,
					border: "none",
					background: "none"
				}
			}), makeButton(text("applyColor"), applyColor, true)));
			if (tab === "gradient") editorNodes.push(plainRow((0, react_jsx_runtime.jsx)("input", {
				type: "text",
				value: gradient,
				placeholder: text("gradientPlaceholder"),
				onChange: (e) => setGradient(e.target.value),
				onFocus: () => markEditing("gradient", true),
				onBlur: () => markEditing("gradient", false),
				onKeyDown: bgKeyEnter(applyGradient),
				style: inputStyle
			}), makeButton(text("applyGradient"), applyGradient, true)));
			if (tab === "image") editorNodes.push(plainRow((0, react_jsx_runtime.jsx)("input", {
				type: "text",
				value: imageUrl,
				placeholder: text("imagePlaceholder"),
				onChange: (e) => setImageUrl(e.target.value),
				onFocus: () => markEditing("image", true),
				onBlur: () => markEditing("image", false),
				onKeyDown: bgKeyEnter(applyImageUrl),
				style: inputStyle
			}), filePickButton("image"), makeButton(text("applyImage"), applyImageUrl, true), fileInput("image", imageFileRef, acceptImageAttr)));
			if (tab === "video") {
				editorNodes.push(plainRow((0, react_jsx_runtime.jsx)("input", {
					type: "text",
					value: videoUrl,
					placeholder: text("videoPlaceholder"),
					onChange: (e) => setVideoUrl(e.target.value),
					onFocus: () => markEditing("video", true),
					onBlur: () => markEditing("video", false),
					onKeyDown: bgKeyEnter(applyVideoUrl),
					style: inputStyle
				}), filePickButton("video"), makeButton(text("applyVideo"), applyVideoUrl, true), fileInput("video", videoFileRef, acceptVideoAttr)));
				editorNodes.push((0, react_jsx_runtime.jsx)("p", {
					style: {
						fontSize: "0.78em",
						opacity: .6,
						margin: "2px 0 6px"
					},
					children: text("localVideoHint")
				}));
			}
			/**
			* v0.4.1：运行态错误**始终**显示面板内红色错误行（旧#8 坏链接可读），其中硬错误
			* （errVideo 系列 / errApply）同时弹窗（新#7）；自动播放被拒/网络慢等软提示不弹窗。
			* 弹窗关闭后（或错误被 playing/换背景清除前）红行持续可见作"最近错误"线索。
			*/
			const runtimeErrorRow = snap.status.error !== "" ? (0, react_jsx_runtime.jsx)("p", {
				"data-testid": "dsh-bg-status-error",
				style: {
					color: "#e5484d",
					fontSize: "0.85em",
					margin: "6px 0 0",
					fontWeight: 600
				},
				children: text(snap.status.error)
			}) : null;
			/** v0.4.1：弹窗（#7）——校验错误与视频/应用硬错误统一弹窗，点「知道了」关闭。 */
			const popupOverlay = popupMessage !== "" ? (0, react_jsx_runtime.jsx)("div", {
				"data-testid": "dsh-bg-error-popup",
				onClick: closePopups,
				style: {
					position: "fixed",
					inset: 0,
					zIndex: 2147483e3,
					display: "flex",
					alignItems: "center",
					justifyContent: "center",
					background: "rgba(0, 0, 0, 0.45)",
					padding: "16px"
				},
				children: (0, react_jsx_runtime.jsx)("div", {
					role: "alertdialog",
					onClick: (e) => {
						try {
							e.stopPropagation?.();
						} catch {}
					},
					style: {
						maxWidth: "min(560px, 100%)",
						padding: "16px 18px",
						borderRadius: "10px",
						background: "var(--dsw-alias-bg-layer-1, #fff)",
						color: "var(--dsw-alias-label-primary, #111)",
						border: "1px solid var(--dsw-alias-border-l2, #ccc)",
						boxShadow: "0 12px 40px rgb(0 0 0 / 0.35)"
					},
					children: [
						(0, react_jsx_runtime.jsx)("div", {
							style: {
								fontWeight: 700,
								marginBottom: "8px",
								color: "#e5484d"
							},
							children: text("notice")
						}),
						(0, react_jsx_runtime.jsx)("div", {
							style: {
								fontSize: "0.9em",
								whiteSpace: "pre-wrap",
								wordBreak: "break-word"
							},
							children: popupMessage
						}),
						(0, react_jsx_runtime.jsx)("div", {
							style: {
								marginTop: "14px",
								display: "flex",
								justifyContent: "flex-end"
							},
							children: makeButton(text("ok"), closePopups, true)
						})
					]
				})
			}) : null;
			/**
			* v0.6.0 (#5)：毛玻璃质感开关（全局项，始终可见）。
			* 开启 = 表面半透明 + 背景模糊（磨砂玻璃）；关闭 = 当前半透明表面但不模糊。
			*/
			const glassRow = (0, react_jsx_runtime.jsx)("label", {
				"data-testid": "dsh-bg-glass",
				style: {
					fontSize: "0.9em",
					display: "inline-flex",
					gap: "6px",
					alignItems: "center",
					flexWrap: "wrap",
					margin: "4px 0"
				},
				children: [
					(0, react_jsx_runtime.jsx)("input", {
						type: "checkbox",
						checked: snap.glass === true,
						onChange: (e) => changeGlass(e.target.checked)
					}),
					text("glass"),
					(0, react_jsx_runtime.jsx)("span", {
						style: {
							fontSize: "0.78em",
							opacity: .6
						},
						children: text("glassHint")
					})
				]
			});
			return (0, react_jsx_runtime.jsx)("div", {
				style: { padding: "4px 2px" },
				children: [
					tabBar,
					...editorNodes,
					(0, react_jsx_runtime.jsx)("div", { style: {
						height: "1px",
						background: "var(--dsw-alias-border-l2, #e5e7eb)",
						margin: "12px 0 6px"
					} }),
					progressRow,
					videoControlRow,
					volumeRow,
					minimapBlock,
					mediaTabActive ? row(text("fit"), fitSelect, null) : null,
					row(text("textScheme"), schemeSelect, null),
					...wallpaperSliders,
					glassRow,
					runtimeErrorRow,
					(0, react_jsx_runtime.jsx)("p", {
						"data-testid": "dsh-bg-current",
						style: {
							fontSize: "0.85em",
							opacity: .7,
							margin: "12px 0 0",
							wordBreak: "break-all"
						},
						children: `${currentLabel}${schemeLabel}`
					}),
					popupOverlay
				]
			});
		}
		/** 抽屉宽度（需求 2：在 420px 基础上 +50%）。 */
		const DRAWER_WIDTH_CSS = "min(630px, 100vw)";
		/** body 上的抽屉打开标记（"隐藏聊天区"布局的 CSS 作用域）。 */
		const DRAWER_ATTR = "data-dsh-bg-drawer";
		/** 插件自管的抽屉布局样式表 id（与背景引擎的 dsh-bg-style 相互独立）。 */
		const DRAWER_STYLE_ID = "dsh-bg-drawer-style";
		/**
		* 抽屉打开时的全局布局样式（第二轮需求 1）：**把左侧侧栏与聊天区整列隐藏**，
		* 只留壁纸 + 抽屉，这样调壁纸时不会被界面挡着（之前是"聊天让位"，用户要求直接隐藏）。
		*
		* 选择器锚点说明：AppFrame 的根是唯一「直接子节点带 data-shell-overlay」的元素
		* （`.overlayLayer` 由 ui-layout 写在 frame 根下），而列宽 gridTemplateColumns 是
		* 它上面的**内联样式**（布局 store 驱动），所以必须用 `!important` 才能盖住。
		* 三条轨道都收成 0：侧栏 / 会话列 / 详情列 —— 抽屉本身挂在 overlayLayer（
		* position:absolute; inset:0），不受轨道影响。
		*/
		const DRAWER_LAYOUT_CSS = `
body[${DRAWER_ATTR}] div:has(> [data-shell-overlay]) {
  grid-template-columns: 0px 0px 0px !important;
}
/* 双保险：三条轨道收 0 之外，frame 的直接子节点里除 overlayLayer（抽屉所在层）
   之外全部隐藏 —— 侧栏列、会话列、详情列、两个拖拽把手都在此列。 */
body[${DRAWER_ATTR}] div:has(> [data-shell-overlay]) > *:not([data-shell-overlay]) {
  display: none !important;
}
/* 第五轮需求 5：小图拖动越界（2 秒宽限期内）边框明暗闪动，
   提示"指针已经在边界外、还能继续操作一会儿"。 */
@keyframes dsh-bg-minimap-outside {
  0%, 100% {
    border-color: var(--dsw-alias-label-primary, #111);
    box-shadow: inset 0 0 0 2px rgba(59, 130, 246, 0.55);
  }
  50% {
    border-color: rgba(127, 127, 127, 0.35);
    box-shadow: inset 0 0 0 2px rgba(59, 130, 246, 0.08);
  }
}
`;
		/** 安装抽屉布局样式表（插件生命周期内常驻；规则本身以 body 属性为开关）。 */
		function installDrawerLayoutStyle() {
			if (typeof document === "undefined") return () => {};
			let el = null;
			try {
				el = document.createElement("style");
				el.id = DRAWER_STYLE_ID;
				el.textContent = DRAWER_LAYOUT_CSS;
				(document.head ?? document.body)?.append(el);
			} catch {
				el = null;
			}
			return () => {
				try {
					el?.remove();
				} catch {}
				syncDrawerLayoutAttr(false);
			};
		}
		/** 按抽屉开关挂/摘 body 标记与抽屉宽度变量。 */
		function syncDrawerLayoutAttr(open) {
			if (typeof document === "undefined") return;
			try {
				const body = document.body;
				if (open) {
					body.setAttribute(DRAWER_ATTR, "");
					body.style.setProperty("--dsh-bg-drawer-w", DRAWER_WIDTH_CSS);
				} else {
					body.removeAttribute(DRAWER_ATTR);
					body.style.removeProperty("--dsh-bg-drawer-w");
				}
			} catch {}
		}
		/** 壁纸图标（16×16 线性图标，与官方 primitives 的描边风格一致；不引入外部资源）。 */
		function wallpaperIcon(size) {
			return (0, react_jsx_runtime.jsx)("svg", {
				width: size,
				height: size,
				viewBox: "0 0 16 16",
				fill: "none",
				"aria-hidden": true,
				focusable: "false",
				style: {
					flexShrink: 0,
					display: "block"
				},
				children: [
					(0, react_jsx_runtime.jsx)("rect", {
						key: "frame",
						x: 1.6,
						y: 2.6,
						width: 12.8,
						height: 10.8,
						rx: 2.2,
						stroke: "currentColor",
						strokeWidth: 1.3
					}),
					(0, react_jsx_runtime.jsx)("circle", {
						key: "sun",
						cx: 5.6,
						cy: 6.4,
						r: 1.05,
						fill: "currentColor"
					}),
					(0, react_jsx_runtime.jsx)("path", {
						key: "hills",
						d: "M2.4 11.9 L6.2 8.4 L8.6 10.6 L10.6 8.8 L13.6 11.4",
						stroke: "currentColor",
						strokeWidth: 1.3,
						strokeLinecap: "round",
						strokeLinejoin: "round"
					})
				]
			});
		}
		/** 播放图标（实心三角；第二轮需求 2：与停止合成一个按钮）。 */
		function playIcon(size) {
			return (0, react_jsx_runtime.jsx)("svg", {
				width: size,
				height: size,
				viewBox: "0 0 16 16",
				fill: "none",
				"aria-hidden": true,
				focusable: "false",
				style: { display: "block" },
				children: [(0, react_jsx_runtime.jsx)("path", {
					d: "M5.2 3.4 L12.6 8 L5.2 12.6 Z",
					fill: "currentColor"
				})]
			});
		}
		/** 停止图标（实心方块）。 */
		function stopIcon(size) {
			return (0, react_jsx_runtime.jsx)("svg", {
				width: size,
				height: size,
				viewBox: "0 0 16 16",
				fill: "none",
				"aria-hidden": true,
				focusable: "false",
				style: { display: "block" },
				children: [(0, react_jsx_runtime.jsx)("rect", {
					x: 4.4,
					y: 4.4,
					width: 7.2,
					height: 7.2,
					rx: 1.2,
					fill: "currentColor"
				})]
			});
		}
		/** 文件夹图标：行内的「选择本地文件」按钮（第五轮需求 3）。 */
		function folderIcon(size) {
			return (0, react_jsx_runtime.jsx)("svg", {
				width: size,
				height: size,
				viewBox: "0 0 16 16",
				fill: "none",
				"aria-hidden": true,
				focusable: "false",
				style: { display: "block" },
				children: [(0, react_jsx_runtime.jsx)("path", {
					d: "M1.9 4.3a1.4 1.4 0 0 1 1.4-1.4h2.9l1.5 1.7h5.4a1.4 1.4 0 0 1 1.4 1.4v5.5a1.4 1.4 0 0 1-1.4 1.4H3.3a1.4 1.4 0 0 1-1.4-1.4z",
					stroke: "currentColor",
					strokeWidth: 1.3,
					strokeLinejoin: "round"
				}), (0, react_jsx_runtime.jsx)("path", {
					d: "M8 6.6v3.1M6.6 8l1.4-1.4L9.4 8",
					stroke: "currentColor",
					strokeWidth: 1.1,
					strokeLinecap: "round",
					strokeLinejoin: "round"
				})]
			});
		}
		/**
		* 侧栏「壁纸」按钮（需求 6）：展开时是「图标 + 壁纸」，收起（轨道态）只留图标。
		* 外观（第二轮需求 3）：**无描边**，几何/圆角/悬浮与选中底色都对齐它下面的
		* Settings 控件（ui-settings-general 的 `.trigger`：42px 高 / 12px 圆角 /
		* padding 0 10px 0 8px / 悬浮 `--dsw-alias-interactive-bg-hover`；轨道态 36px 圆形）。
		*/
		function BgSidebarAction(props) {
			const open = (0, react.useSyncExternalStore)(subscribeDrawer, getDrawerOpen);
			const text = props.text ?? ((k) => k);
			const wide = props.wide === true;
			return (0, react_jsx_runtime.jsx)("button", {
				type: "button",
				"data-testid": "dsh-bg-sidebar-action",
				"data-active": open ? "" : void 0,
				"aria-label": text("wallpaper"),
				"aria-expanded": open,
				title: text("wallpaper"),
				onClick: () => {
					toggleDrawer();
				},
				style: {
					boxSizing: "border-box",
					cursor: "pointer",
					display: "flex",
					alignItems: "center",
					justifyContent: wide ? "flex-start" : "center",
					gap: "8px",
					width: wide ? "calc(100% + 4px)" : "36px",
					height: wide ? "42px" : "36px",
					flex: "none",
					margin: wide ? "4px -2px" : "0 auto",
					padding: wide ? "0 10px 0 8px" : "0",
					borderRadius: wide ? "12px" : "50%",
					border: "none",
					outline: "none",
					background: open ? "var(--dsw-alias-interactive-bg-hover)" : "transparent",
					color: "var(--dsw-alias-label-primary, #111)",
					fontFamily: "inherit",
					fontSize: "14px",
					lineHeight: "22px",
					overflow: "hidden",
					whiteSpace: "nowrap"
				},
				children: wide ? [wallpaperIcon(16), (0, react_jsx_runtime.jsx)("span", {
					key: "label",
					children: text("wallpaper")
				})] : wallpaperIcon(18)
			});
		}
		/** 右侧抽屉：打开时从聊天界面右侧滑出，承载 BgPanel；滑动调参时自身降透明。 */
		function BgDrawer(props) {
			const open = (0, react.useSyncExternalStore)(subscribeDrawer, getDrawerOpen);
			const adjusting = (0, react.useSyncExternalStore)(subscribeAdjusting, getAdjusting);
			const snap = (0, react.useSyncExternalStore)(subscribeStore, getSnapshot);
			const text = props.text ?? ((k) => k);
			if (!open) return null;
			/**
			* 需求 6：抽屉底板必须**半透明**（不要固定色），否则它会把刚设好的壁纸整块挡住。
			* 取色跟背景引擎同一份调色板：有背景时用该方案下的 `--dsw-alias-bg-layer-2`
			* 半透明字面量（浅字方案=深色 55%，深字方案=浅色 55%）+ backdrop 模糊；
			* 没有背景（off）时回落到主题自己的表面色，避免"深色面板 + 浅色主题深字"看不清。
			*/
			const scheme = snap?.resolvedText === "dark" ? "dark" : snap?.resolvedText === "light" ? "light" : null;
			const panelBackground = scheme === null ? "var(--dsw-alias-bg-layer-2, #fff)" : glassSurfaceTokensForTextScheme(scheme)["--dsw-alias-bg-layer-2"] ?? "rgb(23 28 36 / 0.55)";
			return (0, react_jsx_runtime.jsx)("div", {
				"data-dsh-bg-drawer-root": "",
				style: {
					position: "fixed",
					inset: 0,
					zIndex: 2147483e3,
					display: "flex",
					justifyContent: "flex-end",
					pointerEvents: "none"
				},
				children: [(0, react_jsx_runtime.jsx)("div", {
					key: "backdrop",
					"data-testid": "dsh-bg-drawer-backdrop",
					onClick: () => {
						setDrawerOpen(false);
					},
					style: {
						position: "absolute",
						inset: 0,
						background: "transparent",
						pointerEvents: "auto"
					}
				}), (0, react_jsx_runtime.jsx)("div", {
					key: "panel",
					"data-dsh-bg-drawer": "",
					style: {
						position: "relative",
						height: "100%",
						width: DRAWER_WIDTH_CSS,
						maxWidth: "100vw",
						display: "flex",
						flexDirection: "column",
						pointerEvents: "auto",
						opacity: adjusting ? .22 : 1,
						transition: "opacity 150ms ease",
						boxShadow: "0 0 0 1px var(--dsw-alias-border-l2, rgba(0,0,0,0.1)), 0 12px 48px rgb(0 0 0 / 0.3)",
						background: panelBackground,
						backdropFilter: scheme === null ? void 0 : "blur(18px) saturate(1.2)",
						WebkitBackdropFilter: scheme === null ? void 0 : "blur(18px) saturate(1.2)",
						color: "var(--dsw-alias-label-primary, #111)"
					},
					children: [(0, react_jsx_runtime.jsx)("div", {
						style: {
							display: "flex",
							alignItems: "center",
							justifyContent: "space-between",
							padding: "12px 16px",
							borderBottom: "1px solid var(--dsw-alias-border-l2, #e5e7eb)"
						},
						children: [(0, react_jsx_runtime.jsx)("span", {
							style: {
								fontWeight: 700,
								fontSize: "1rem"
							},
							children: text("title")
						}), (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							"data-testid": "dsh-bg-drawer-close",
							"aria-label": text("close"),
							title: text("close"),
							onClick: () => {
								setDrawerOpen(false);
							},
							style: {
								boxSizing: "border-box",
								width: "28px",
								height: "28px",
								flexShrink: 0,
								display: "inline-flex",
								alignItems: "center",
								justifyContent: "center",
								cursor: "pointer",
								border: "1px solid var(--dsw-alias-border-l2, #ccc)",
								borderRadius: "50%",
								aspectRatio: "1 / 1",
								background: "transparent",
								color: "var(--dsw-alias-label-secondary, #666)",
								fontSize: "16px",
								lineHeight: 1,
								padding: 0
							},
							children: "×"
						})]
					}), (0, react_jsx_runtime.jsx)("div", {
						style: {
							flex: 1,
							overflowY: "auto",
							padding: "12px 16px 20px"
						},
						children: (0, react_jsx_runtime.jsx)(BgPanel, {
							setBg: props.setBg,
							text: props.text
						})
					})]
				})]
			});
		}
		//#endregion
		exports.BG_CSS_SAFE = BG_CSS_SAFE;
		exports.BG_FITS = BG_FITS;
		exports.BG_TEXT_SCHEMES = BG_TEXT_SCHEMES;
		exports.BgDrawer = BgDrawer;
		exports.BgPanel = BgPanel;
		exports.BgSidebarAction = BgSidebarAction;
		exports.DRAWER_WIDTH_CSS = DRAWER_WIDTH_CSS;
		exports.GLASS_BACKDROP_FILTER = GLASS_BACKDROP_FILTER;
		exports.GLASS_BACKDROP_SELECTOR = GLASS_BACKDROP_SELECTOR;
		exports.REVEAL_TOKENS = REVEAL_TOKENS;
		exports.TOP_REGION_TOKENS = TOP_REGION_TOKENS;
		exports.apply = apply;
		exports.applyBg = applyBg;
		exports.applyBgState = applyBgState;
		exports.bgDefaultConfig = DEFAULT_BG_CONFIG;
		exports.bgIsAdjusting = bgIsAdjusting;
		exports.bgIsDrawerOpen = bgIsDrawerOpen;
		exports.bgKeyEnter = bgKeyEnter;
		exports.bgLuminance = backgroundLuminance;
		exports.bgMediaFieldVerdict = bgMediaFieldVerdict;
		exports.bgMediaRender = bgMediaRender;
		exports.bgNormalizeConfig = normalizeBgConfig;
		exports.bgRuntimeStatus = bgRuntimeStatus;
		exports.bgSetAdjusting = bgSetAdjusting;
		exports.bgThemeColorFor = bgThemeColorFor;
		exports.bgUploadLocalFile = bgUploadLocalFile;
		exports.bgVideoSeek = bgVideoSeek;
		exports.bgVideoSetLoop = bgVideoSetLoop;
		exports.bgVideoSetRate = bgVideoSetRate;
		exports.bgVideoSetSound = bgVideoSetSound;
		exports.bgVideoSetVolume = bgVideoSetVolume;
		exports.bgVideoStop = bgVideoStop;
		exports.bgVideoToggle = bgVideoToggle;
		exports.bgZoomMax = bgZoomMax;
		exports.bgZoomMin = bgZoomMin;
		exports.clampBgOpacity = clampBgOpacity;
		exports.clampBgPos = clampBgPos;
		exports.clampBgScale = clampBgScale;
		exports.clampBgVolume = clampBgVolume;
		exports.clampBgZoom = clampBgZoom;
		exports.cssEscape = cssEscape;
		exports.disposeAdjusting = disposeAdjusting;
		exports.fitCssFor = fitCssFor;
		exports.focusPositionCss = focusPositionCss;
		exports.glassSurfaceTokensForTextScheme = glassSurfaceTokensForTextScheme;
		exports.inject = inject;
		exports.maskTokensForTextScheme = maskTokensForTextScheme;
		exports.mediaUrlKindConflict = mediaUrlKindConflict;
		exports.parseCssColor = parseCssColor;
		exports.previewThemeFor = previewThemeFor;
		exports.relativeLuminance = relativeLuminance;
		exports.resolveTextScheme = resolveTextScheme;
		exports.restoreBg = restoreBg;
		exports.toggleDrawer = toggleDrawer;
		exports.tokensForTextScheme = tokensForTextScheme;
		exports.urlExtOf = urlExtOf;
		exports.videoErrorKeyForCode = videoErrorKeyForCode;
		exports.zoomBackgroundSize = zoomBackgroundSize;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map