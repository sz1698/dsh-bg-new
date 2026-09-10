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
		/** 浅字方案：文字浅色 + 深色半透明表面（暗背景/未知背景媒体默认）。 */
		const LIGHT_TEXT_TOKENS = {
			"--dsw-alias-label-primary": "#f2f4f8",
			"--dsw-alias-label-secondary": "#c6cdd8",
			"--dsw-alias-label-tertiary": "#98a2b3",
			"--dsw-alias-bg-layer-1": "rgb(10 13 18 / 0.86)",
			"--dsw-alias-bg-layer-2": "rgb(23 28 36 / 0.9)",
			"--dsw-alias-bg-layer-3": "rgb(31 37 46 / 0.92)",
			"--dsw-alias-bg-overlay": "rgb(20 25 32 / 0.93)",
			"--dsw-alias-border-l1": "rgba(255,255,255,0.08)",
			"--dsw-alias-border-l2": "rgba(255,255,255,0.16)",
			"--dsw-alias-border-l3": "rgba(255,255,255,0.22)",
			"--dsw-alias-border-l4": "rgba(255,255,255,0.28)",
			"--dsw-specific-bubble": "rgb(13 17 23 / 0.84)",
			"--dsw-specific-bubble-highlight": "rgb(31 39 51 / 0.9)",
			"--dsw-specific-input-major": "rgb(6 9 13 / 0.92)",
			"--dsw-specific-menu": "rgb(24 30 38 / 0.94)",
			"--dsw-specific-selector": "rgb(255 255 255 / 0.09)",
			"--dsw-alias-markdown-code-block": "rgb(7 10 15 / 0.9)",
			"--dsw-alias-markdown-code-block-banner": "rgb(21 26 33 / 0.94)",
			"--dsw-alias-markdown-inline-code": "rgba(255,255,255,0.12)",
			"--dsw-specific-sidebar-nav-item-active": "rgba(255,255,255,0.14)",
			"--dsw-specific-sidebar-nav-item-hover": "rgba(255,255,255,0.08)"
		};
		/** 深字方案：文字深色 + 浅色半透明表面（浅色背景）。 */
		const DARK_TEXT_TOKENS = {
			"--dsw-alias-label-primary": "#1a1d24",
			"--dsw-alias-label-secondary": "#4c515b",
			"--dsw-alias-label-tertiary": "#6d7480",
			"--dsw-alias-bg-layer-1": "rgb(250 251 253 / 0.9)",
			"--dsw-alias-bg-layer-2": "rgb(255 255 255 / 0.86)",
			"--dsw-alias-bg-layer-3": "rgb(255 255 255 / 0.82)",
			"--dsw-alias-bg-overlay": "rgb(250 251 253 / 0.95)",
			"--dsw-alias-border-l1": "rgba(0,0,0,0.06)",
			"--dsw-alias-border-l2": "rgba(0,0,0,0.1)",
			"--dsw-alias-border-l3": "rgba(0,0,0,0.14)",
			"--dsw-alias-border-l4": "rgba(0,0,0,0.18)",
			"--dsw-specific-bubble": "rgb(250 251 253 / 0.92)",
			"--dsw-specific-bubble-highlight": "rgb(240 244 252 / 0.94)",
			"--dsw-specific-input-major": "rgb(255 255 255 / 0.9)",
			"--dsw-specific-menu": "rgb(255 255 255 / 0.92)",
			"--dsw-specific-selector": "rgba(0,0,0,0.06)",
			"--dsw-alias-markdown-code-block": "rgb(248 250 253 / 0.9)",
			"--dsw-alias-markdown-code-block-banner": "rgb(255 255 255 / 0.94)",
			"--dsw-alias-markdown-inline-code": "rgba(0,0,0,0.07)",
			"--dsw-specific-sidebar-nav-item-active": "rgba(0,0,0,0.08)",
			"--dsw-specific-sidebar-nav-item-hover": "rgba(0,0,0,0.05)"
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
		//#endregion
		//#region src/client/index.ts
		/**
		* dsh-bg-switch —— browser client half（v0.4：本地媒体上传伺服化 + 单渲染源 +
		* 防抖持久化 + 声音/音量 + 全量重置 + Enter 提交；引擎渲染机制沿用 v0.3.1）。
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
				volume: 1,
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
		/** CSS 字面量转义（url("...") 内防逃逸）。 */
		function cssEscape(value) {
			return value.replace(/[\\"]/g, (ch) => `\\${ch}`);
		}
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
		/**
		* 渲染一份快照的完整 CSS 文本（集中管理）：body token 覆盖 + layer 几何 +
		* 媒体渲染 + video 适配。样式卸载即整体移除 → 原主题完整还原。
		*/
		function buildStyleText(s) {
			const lines = [];
			lines.push("/* dsh-bg-switch v0.4.2 */");
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
				if (s.value !== "" || s.mediaKey !== "") {
					lines.push(`[${LAYER_ATTR}] video {`);
					lines.push("  width: 100%;");
					lines.push("  height: 100%;");
					lines.push("  display: block;");
					const fit = fitCssFor(s.fit, s.mode);
					lines.push(`  object-fit: ${fit.objectFit};`);
					lines.push(`  object-position: ${focusPositionCss(s.posX, s.posY)};`);
					lines.push("}");
				}
			} else if (s.mode === "image") {
				const imgSrc = bgMediaSrc(s);
				if (imgSrc !== null) {
					const fit = fitCssFor(s.fit, s.mode);
					lines.push(`[${LAYER_ATTR}] {`);
					lines.push(`  background-image: url("${cssEscape(imgSrc)}");`);
					lines.push(`  background-size: ${fit.backgroundSize};`);
					lines.push(`  background-position: ${focusPositionCss(s.posX, s.posY)};`);
					lines.push(`  background-repeat: ${fit.backgroundRepeat};`);
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
				removeLayer();
				notify();
				return;
			}
			try {
				ensureLayer();
				if (layerEl === null || styleEl === null) {
					notify();
					return;
				}
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
			pendingWrites.clear();
			clearFlushTimer();
			snapshot = {
				...defaultSnapshot(),
				video: idleVideoUi()
			};
			lastAppliedKey = applyKey(snapshot);
			notify();
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
			const limitMB = kind === "image" ? cfg.maxImageMB : cfg.maxVideoMB;
			if (file.size > limitMB * 1024 * 1024) return {
				ok: false,
				errorKey: "errFileTooBig",
				detail: `${limitMB}MB`
			};
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
					case "volume": return sectionNumber(section, "volume", 1);
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
					case "volume": return snapshot.volume;
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
				const volume = sectionNumber(section, "volume", 1);
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
					volume,
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
					"volume"
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
					volume: 1
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
				if (opts?.volume !== void 0) fields.volume = opts.volume;
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
				for (const [field, fieldValue] of Object.entries(fields)) if (!sameValue(fieldCurrent(field), fieldValue)) dirty[field] = fieldValue;
				applyBgState({ ...fields });
				persistSoon(dirty);
			}
			const zhPresetDict = Object.fromEntries(Object.entries(PRESET_LABELS_ZH).map(([k, v]) => ["preset." + k, v]));
			const enPresetDict = Object.fromEntries(Object.entries(PRESET_LABELS_EN).map(([k, v]) => ["preset." + k, v]));
			ctx.locale?.register("settings.dsh-bg", {
				zh: {
					nav: "背景",
					title: "背景",
					presets: "预设皮肤",
					custom: "自定义",
					color: "纯色",
					gradient: "渐变",
					image: "壁纸图片",
					video: "背景视频",
					applyColor: "应用",
					applyGradient: "应用",
					applyImage: "应用",
					applyVideo: "应用",
					reset: "恢复默认",
					current: "当前背景",
					currentOff: "默认（未设置）",
					colorPlaceholder: "#1e2a78",
					gradientPlaceholder: "linear-gradient(135deg, #1e2a78, #2b1055)",
					imagePlaceholder: "https://example.com/wallpaper.jpg",
					videoPlaceholder: "https://example.com/ocean.mp4",
					localImage: "本地图片",
					localVideo: "本地视频",
					localImageHint: "选择本地图片（≤上限），上传后自动生效；或让模型调用 bg_apply 工具（file 参数）",
					localVideoHint: "选择本地视频（≤上限），上传完成后自动全屏播放；或让模型调用 bg_apply 工具（file 参数）",
					uploading: "上传中…",
					errColor: "颜色需是 #rrggbb 形式（如 #1e2a78）",
					errGradient: "渐变格式无效，请用完整 CSS 渐变",
					errImage: "图片地址需以 http(s):// 开头",
					errVideo: "视频地址需以 http(s):// 开头",
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
					errApply: "应用背景时出错，请重试或先恢复默认",
					errVideoLoad: "视频加载失败（未给出具体原因）：请确认链接可直接播放",
					errVideoAborted: "视频加载被中止（MEDIA_ERR_ABORTED=1）",
					errVideoNetwork: "视频加载失败：网络错误（MEDIA_ERR_NETWORK=2），请检查链接能否直接访问",
					errVideoDecode: "视频加载失败：解码错误（MEDIA_ERR_DECODE=3），格式可能不受支持或文件已损坏",
					errVideoSrc: "视频源不受支持（MEDIA_ERR_SRC_NOT_SUPPORTED=4）：链接无法直接播放或格式未被允许",
					errVideoAutoplay: "浏览器阻止了自动播放，请点击「播放」开始",
					errVideoStalled: "视频网络较慢或服务器暂时无响应，正在等待数据…",
					notice: "提示",
					ok: "知道了",
					...zhPresetDict
				},
				en: {
					nav: "Background",
					title: "Background",
					presets: "Presets",
					custom: "Custom",
					color: "Color",
					gradient: "Gradient",
					image: "Wallpaper",
					video: "Video",
					applyColor: "Apply",
					applyGradient: "Apply",
					applyImage: "Apply",
					applyVideo: "Apply",
					reset: "Reset",
					current: "Current",
					currentOff: "Default (unset)",
					colorPlaceholder: "#1e2a78",
					gradientPlaceholder: "linear-gradient(135deg, #1e2a78, #2b1055)",
					imagePlaceholder: "https://example.com/wallpaper.jpg",
					videoPlaceholder: "https://example.com/ocean.mp4",
					localImage: "Local image",
					localVideo: "Local video",
					localImageHint: "Pick a local image (up to the limit); it uploads and takes effect automatically. Or ask the assistant to call bg_apply with a file path",
					localVideoHint: "Pick a local video (up to the limit); it plays fullscreen automatically after upload. Or ask the assistant to call bg_apply with a file path",
					uploading: "Uploading…",
					errColor: "Color must be like #rrggbb (e.g. #1e2a78)",
					errGradient: "Invalid gradient. Use a full CSS gradient",
					errImage: "Image URL must start with http(s)://",
					errVideo: "Video URL must start with http(s)://",
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
					errApply: "Failed to apply the background. Retry or reset to default first",
					errVideoLoad: "Video failed to load (no specific reason): make sure the link streams directly",
					errVideoAborted: "Video load aborted (MEDIA_ERR_ABORTED=1)",
					errVideoNetwork: "Video failed to load: network error (MEDIA_ERR_NETWORK=2). Check the link is directly reachable",
					errVideoDecode: "Video failed to load: decode error (MEDIA_ERR_DECODE=3). The format may be unsupported or the file is corrupt",
					errVideoSrc: "Video source not supported (MEDIA_ERR_SRC_NOT_SUPPORTED=4): the link is not directly playable or the format is not allowed",
					errVideoAutoplay: "Autoplay was blocked by the browser. Click Play to start",
					errVideoStalled: "The video network is slow or the server is not responding; waiting for data…",
					notice: "Notice",
					ok: "OK",
					...enPresetDict
				}
			});
			ctx.slots.inject("settings.section", () => ctx.slots.register({
				name: "settings.section",
				id: "dsh-bg",
				order: 500,
				label: () => text("nav"),
				inject: () => ({
					setBg,
					text
				})
			}, BgPanel));
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
				};
			});
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
			const tabForMode = (mode) => mode === "color" || mode === "gradient" || mode === "image" || mode === "video" ? mode : "presets";
			const [tab, setTab] = (0, react.useState)(() => tabForMode(snap.mode));
			(0, react.useEffect)(() => {
				setTab(tabForMode(snap.mode));
			}, [snap.mode]);
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
				setError("");
				setBg("gradient", v);
			};
			const applyImageUrl = () => {
				const v = imageUrl.trim();
				if (!/^https?:\/\//i.test(v)) {
					setError(text("errImage"));
					return;
				}
				setError("");
				setBg("image", v);
			};
			const applyVideoUrl = () => {
				const v = videoUrl.trim();
				if (!/^https?:\/\//i.test(v)) {
					setError(text("errVideo"));
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
			const swatchStyle = (p) => {
				if (p.mode === "off") return {
					background: "var(--dsw-alias-bg-layer-1, #fff)",
					border: "1px dashed var(--dsw-alias-border-l2, #aaa)"
				};
				return { background: p.value };
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
			const durSec = snap.video.duration;
			const curSec = snap.video.currentTime;
			const seekReady = durSec > 0;
			const progressRow = snap.mode === "video" ? (0, react_jsx_runtime.jsx)("div", {
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
			const videoControlRow = snap.mode === "video" ? (0, react_jsx_runtime.jsx)("div", {
				"data-testid": "dsh-bg-video-controls",
				style: {
					display: "flex",
					gap: "8px",
					alignItems: "center",
					margin: "8px 0 6px 52px",
					flexWrap: "wrap"
				},
				children: [
					makeButton(snap.video.paused ? text("play") : text("pause"), () => {
						bgVideoToggle();
					}),
					makeButton(text("stop"), () => {
						bgVideoStop();
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
			const sliderRow = (labelText, min, max, step, value, suffix, onInput) => (0, react_jsx_runtime.jsx)("div", {
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
			const wallpaperSliders = isWallpaper ? [
				sliderRow(text("opacityLabel"), 0, 100, 5, Math.round(snap.opacity * 100), "%", (v) => {
					setError("");
					setBg(snap.mode, snap.value, { opacity: v / 100 });
				}),
				sliderRow(text("posXLabel"), 0, 100, 1, Math.round(snap.posX), "%", (v) => {
					setError("");
					setBg(snap.mode, snap.value, { posX: v });
				}),
				sliderRow(text("posYLabel"), 0, 100, 1, Math.round(snap.posY), "%", (v) => {
					setError("");
					setBg(snap.mode, snap.value, { posY: v });
				})
			] : [];
			volumeRow = snap.mode === "video" ? sliderRow(text("volume"), 0, 100, 5, Math.round(clampBgVolume(snap.volume) * 100), "%", changeVolume) : null;
			const currentLabel = snap.mode === "off" || snap.mode === "" ? text("currentOff") : `${text("current")}: ${snap.mode} · ${(snap.value !== "" ? snap.value : snap.mediaKey !== "" ? `/dsh-bg-media/${snap.mediaKey}` : "").slice(0, 120)}`;
			const schemeLabel = snap.resolvedText === null ? "" : `（${snap.resolvedText === "light" ? text("textLight") : text("textDark")}）`;
			const tabBar = (0, react_jsx_runtime.jsx)("div", {
				"data-testid": "dsh-bg-tabs",
				role: "tablist",
				style: {
					display: "flex",
					gap: "6px",
					margin: "0 0 12px",
					flexWrap: "wrap",
					borderBottom: "1px solid var(--dsw-alias-border-l2, #ddd)",
					paddingBottom: "8px"
				},
				children: [
					["presets", text("presets")],
					["color", text("color")],
					["gradient", text("gradient")],
					["image", text("image")],
					["video", text("video")]
				].map(([id, label]) => {
					const activeTab = tab === id;
					return (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						key: id,
						role: "tab",
						"aria-selected": activeTab,
						onClick: () => setTab(id),
						style: {
							padding: "4px 12px",
							borderRadius: "14px",
							cursor: "pointer",
							fontSize: "0.85em",
							border: activeTab ? "1px solid #3b82f6" : "1px solid var(--dsw-alias-border-l2, #ddd)",
							background: activeTab ? "#3b82f6" : "transparent",
							color: activeTab ? "#fff" : "var(--dsw-alias-label-primary, #111)"
						},
						children: label
					});
				})
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
			if (tab === "color") editorNodes.push(row(text("color"), (0, react_jsx_runtime.jsx)("input", {
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
			if (tab === "gradient") editorNodes.push(row(text("gradient"), (0, react_jsx_runtime.jsx)("input", {
				type: "text",
				value: gradient,
				placeholder: text("gradientPlaceholder"),
				onChange: (e) => setGradient(e.target.value),
				onFocus: () => markEditing("gradient", true),
				onBlur: () => markEditing("gradient", false),
				onKeyDown: bgKeyEnter(applyGradient),
				style: inputStyle
			}), makeButton(text("applyGradient"), applyGradient, true)));
			if (tab === "image") {
				editorNodes.push(row(text("image"), (0, react_jsx_runtime.jsx)("input", {
					type: "text",
					value: imageUrl,
					placeholder: text("imagePlaceholder"),
					onChange: (e) => setImageUrl(e.target.value),
					onFocus: () => markEditing("image", true),
					onBlur: () => markEditing("image", false),
					onKeyDown: bgKeyEnter(applyImageUrl),
					style: inputStyle
				}), makeButton(text("applyImage"), applyImageUrl, true)));
				editorNodes.push((0, react_jsx_runtime.jsx)("div", {
					style: {
						margin: "2px 0 6px 52px",
						display: "flex",
						gap: "8px",
						alignItems: "center",
						flexWrap: "wrap"
					},
					children: [(0, react_jsx_runtime.jsx)("label", {
						"data-testid": "dsh-bg-image-file",
						style: {
							fontSize: "0.85em",
							display: "inline-flex",
							gap: "6px",
							alignItems: "center",
							cursor: uploading !== "" ? "not-allowed" : "pointer"
						},
						children: [text("localImage"), (0, react_jsx_runtime.jsx)("input", {
							type: "file",
							accept: acceptImageAttr,
							disabled: uploading !== "",
							style: { maxWidth: "240px" },
							onChange: (e) => {
								uploadLocal("image", e.target.files?.[0] ?? void 0);
							}
						})]
					}), uploading === "image" ? (0, react_jsx_runtime.jsx)("span", {
						"data-testid": "dsh-bg-uploading",
						style: {
							fontSize: "0.8em",
							opacity: .7
						},
						children: text("uploading")
					}) : (0, react_jsx_runtime.jsx)("span", {
						style: {
							fontSize: "0.8em",
							opacity: .6
						},
						children: text("localImageHint")
					})]
				}));
			}
			if (tab === "video") {
				editorNodes.push(row(text("video"), (0, react_jsx_runtime.jsx)("input", {
					type: "text",
					value: videoUrl,
					placeholder: text("videoPlaceholder"),
					onChange: (e) => setVideoUrl(e.target.value),
					onFocus: () => markEditing("video", true),
					onBlur: () => markEditing("video", false),
					onKeyDown: bgKeyEnter(applyVideoUrl),
					style: inputStyle
				}), makeButton(text("applyVideo"), applyVideoUrl, true)));
				editorNodes.push((0, react_jsx_runtime.jsx)("div", {
					style: {
						margin: "0 0 6px 52px",
						display: "flex",
						gap: "8px",
						alignItems: "center",
						flexWrap: "wrap"
					},
					children: [(0, react_jsx_runtime.jsx)("label", {
						"data-testid": "dsh-bg-video-file",
						style: {
							fontSize: "0.85em",
							display: "inline-flex",
							gap: "6px",
							alignItems: "center",
							cursor: uploading !== "" ? "not-allowed" : "pointer"
						},
						children: [text("localVideo"), (0, react_jsx_runtime.jsx)("input", {
							type: "file",
							accept: acceptVideoAttr,
							disabled: uploading !== "",
							style: { maxWidth: "240px" },
							onChange: (e) => {
								uploadLocal("video", e.target.files?.[0] ?? void 0);
							}
						})]
					}), uploading === "video" ? (0, react_jsx_runtime.jsx)("span", {
						"data-testid": "dsh-bg-uploading",
						style: {
							fontSize: "0.8em",
							opacity: .7
						},
						children: text("uploading")
					}) : (0, react_jsx_runtime.jsx)("span", {
						style: {
							fontSize: "0.8em",
							opacity: .6
						},
						children: text("localVideoHint")
					})]
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
			return (0, react_jsx_runtime.jsx)("div", {
				style: {
					padding: "4px 2px",
					maxWidth: "640px"
				},
				children: [
					(0, react_jsx_runtime.jsx)("div", {
						"data-testid": "dsh-bg-title",
						style: {
							fontSize: "1.1rem",
							fontWeight: 700,
							margin: "0 0 10px"
						},
						children: text("title")
					}),
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
					row(text("fit"), fitSelect, null),
					row(text("textScheme"), schemeSelect, null),
					...wallpaperSliders,
					runtimeErrorRow,
					(0, react_jsx_runtime.jsx)("div", {
						style: { margin: "12px 0 0" },
						children: makeButton(text("reset"), () => {
							closePopups();
							setBg("off", "", { resetAll: true });
						})
					}),
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
		//#endregion
		exports.BG_FITS = BG_FITS;
		exports.BG_TEXT_SCHEMES = BG_TEXT_SCHEMES;
		exports.BgPanel = BgPanel;
		exports.REVEAL_TOKENS = REVEAL_TOKENS;
		exports.apply = apply;
		exports.applyBg = applyBg;
		exports.applyBgState = applyBgState;
		exports.bgDefaultConfig = DEFAULT_BG_CONFIG;
		exports.bgKeyEnter = bgKeyEnter;
		exports.bgLuminance = backgroundLuminance;
		exports.bgNormalizeConfig = normalizeBgConfig;
		exports.bgRuntimeStatus = bgRuntimeStatus;
		exports.bgUploadLocalFile = bgUploadLocalFile;
		exports.bgVideoSeek = bgVideoSeek;
		exports.bgVideoSetLoop = bgVideoSetLoop;
		exports.bgVideoSetRate = bgVideoSetRate;
		exports.bgVideoSetSound = bgVideoSetSound;
		exports.bgVideoSetVolume = bgVideoSetVolume;
		exports.bgVideoStop = bgVideoStop;
		exports.bgVideoToggle = bgVideoToggle;
		exports.clampBgOpacity = clampBgOpacity;
		exports.clampBgPos = clampBgPos;
		exports.clampBgVolume = clampBgVolume;
		exports.fitCssFor = fitCssFor;
		exports.focusPositionCss = focusPositionCss;
		exports.inject = inject;
		exports.parseCssColor = parseCssColor;
		exports.relativeLuminance = relativeLuminance;
		exports.resolveTextScheme = resolveTextScheme;
		exports.restoreBg = restoreBg;
		exports.tokensForTextScheme = tokensForTextScheme;
		exports.videoErrorKeyForCode = videoErrorKeyForCode;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map