import { randomUUID } from "node:crypto";
import { createReadStream, createWriteStream, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, extname, join } from "node:path";
import { defineTool } from "@deepseek-ai/dsh-tools";
import { dshHomePath } from "@deepseek-ai/dsh-home-paths";
import z from "@deepseek-ai/schemastery";
//#region src/bg-config.ts
/**
* dsh-bg-switch —— 共享纯配置核心（host 与 client 两半共用，零依赖、可进 bundle）。
*
* 职责（v0.3 规格 5「格式/大小配置」）：
* - 内置默认表与类型：image/video 允许扩展名、单文件上限、defaultFit /
*   defaultTextScheme / defaultLoop。数值与 README/config 文档逐字对应：
*   image: png/jpg/jpeg/gif/webp/svg/avif/bmp/ico；video: mp4/webm/ogg/ogv/mov/m4v；
*   maxImageMB=10；maxVideoMB=500；defaultFit='cover'；defaultTextScheme='auto'；
*   defaultLoop=true。
* - normalizeBgConfig(raw)：把 $DSH_HOME/dsh-bg-switch/config.json 的未知形状
*   逐字段校验/清洗成合法的 BgConfig：非法字段回退内置默认并记一条 issue
*   （host 启动时记日志），合法字段照单全收。
* - 本文件刻意不 import 任何 node: 模块：host 侧 src/config.ts 包装文件读取，
*   client 侧（src/client/index.ts）直接 import 本文件做 UI 兜底默认与导出，
*   单份常量避免两半漂移。
*
* 枚举同时供 settings schema（z.union([...BG_MODES]) 等）与工具/客户端使用。
*/
/** 背景模式：video 为 v0.3 新增。 */
const BG_MODES = [
	"off",
	"color",
	"gradient",
	"image",
	"video"
];
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
const IMAGE_EXT_TO_MIME = {
	png: "image/png",
	jpg: "image/jpeg",
	jpeg: "image/jpeg",
	gif: "image/gif",
	webp: "image/webp",
	svg: "image/svg+xml",
	avif: "image/avif",
	bmp: "image/bmp",
	ico: "image/x-icon"
};
const VIDEO_EXT_TO_MIME = {
	mp4: "video/mp4",
	webm: "video/webm",
	ogg: "video/ogg",
	ogv: "video/ogg",
	mov: "video/quicktime",
	m4v: "video/x-m4v"
};
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
//#region src/config.ts
/**
* dsh-bg-switch —— host 侧 config.json 读取（文件 IO 包装层）。
*
* 位置：$DSH_HOME/dsh-bg-switch/config.json（与 state.json 同目录；DSH_HOME
* 未设置时 @deepseek-ai/dsh-home-paths 回退 ~/.dsh）。可覆盖字段见
* src/bg-config.ts 的 {@link BgConfig}（imageExt/videoExt/maxImageMB/maxVideoMB/
* defaultFit/defaultTextScheme/defaultLoop）。文件缺失 → 全默认；JSON 解析失败
* 或字段非法 → 逐字段回退内置默认并记录 issue（installBgNamespace 启动时经
* ctx.logger 打日志）。
*
* 结果进程内缓存（模块级）：host 启动读一次，tool / bg-settings / media 路由
* 共用同一份；config.json 的改动需重启进程生效（README 已注明）。
*/
let cached;
/** config.json 绝对路径（测试可用 DSH_HOME 环境变量重定向）。 */
function bgConfigPath() {
	return dshHomePath("dsh-bg-switch", "config.json");
}
function readRaw() {
	try {
		const text = readFileSync(bgConfigPath(), "utf8");
		return {
			raw: JSON.parse(text),
			warnings: [],
			source: "file"
		};
	} catch (error) {
		if (error.code === "ENOENT") return {
			raw: void 0,
			warnings: [],
			source: "default"
		};
		return {
			raw: void 0,
			warnings: [`dsh-bg-switch: 读取 config.json 失败（${error instanceof Error ? error.message : String(error)}），使用内置默认配置`],
			source: "default"
		};
	}
}
/**
* 解析并缓存配置。首次调用读盘，其后返回缓存。
* @param force - true 时强制重读（测试用）。
*/
function loadBgConfig(force = false) {
	if (cached !== void 0 && !force) return cached;
	const { raw, warnings, source } = readRaw();
	const { config, issues } = normalizeBgConfig(raw);
	if (config === DEFAULT_BG_CONFIG && source === "file" && issues.length === 0) {}
	cached = {
		config,
		source,
		warnings: [...warnings, ...issues]
	};
	return cached;
}
/** 便捷读当前生效配置（同步）。 */
function currentBgConfig() {
	return loadBgConfig().config;
}
//#endregion
//#region src/state.ts
/**
* dsh-bg-switch —— 背景状态读写（host 各插件共享；settings 缺失时回退镜像）。
*
* 状态持久化在 DSH 用户数据区：$DSH_HOME/dsh-bg-switch/state.json
* （DSH_HOME 未设置时默认 ~/.dsh；桌面版会指向其自己的 dsh-home）。
* 放在用户数据区而不是插件目录旁：插件可能从只读位置加载，
* 而这里保证可写、且重启后不丢。
*
* v0.3：BgMode 枚举移入 src/bg-config.ts（host/client 共用的纯模块），本文件
* 只保留文件 IO 与状态形状；BgState 新增 fit/textScheme/loop/mediaKey 可选字段
* （settings 命名空间有这些字段时以 settings 为准，state.json 仅作无 settings
* provider 的回退镜像，按需写入可选字段）。
* v0.4：新增可选 volume（0..1 媒体音量，默认 1；state.json 回退镜像同样按需写入）。
* v0.4.3：新增可选 scale（0.25..4 媒体自由缩放）。
* v0.5.0：新增可选 zoom（1..3 放大聚焦；「独立设置窗口」的路由也经 settings
* 命名空间写它 —— 无 settings provider 时回退本文件的 state.json）。
*/
const EMPTY_STATE = {
	mode: "off",
	value: "",
	updatedAt: ""
};
function statePath() {
	return dshHomePath("dsh-bg-switch", "state.json");
}
/** 同步读取当前状态；文件缺失或损坏时返回空状态。 */
function readState() {
	try {
		const raw = readFileSync(statePath(), "utf8");
		const parsed = JSON.parse(raw);
		if (parsed && typeof parsed === "object") {
			const p = parsed;
			if (typeof p.mode === "string" && typeof p.value === "string") return {
				mode: p.mode,
				value: p.value,
				updatedAt: typeof p.updatedAt === "string" ? p.updatedAt : "",
				fit: typeof p.fit === "string" ? p.fit : void 0,
				textScheme: typeof p.textScheme === "string" ? p.textScheme : void 0,
				loop: typeof p.loop === "boolean" ? p.loop : void 0,
				mediaKey: typeof p.mediaKey === "string" ? p.mediaKey : void 0,
				opacity: typeof p.opacity === "number" ? p.opacity : void 0,
				posX: typeof p.posX === "number" ? p.posX : void 0,
				posY: typeof p.posY === "number" ? p.posY : void 0,
				scale: typeof p.scale === "number" ? p.scale : void 0,
				zoom: typeof p.zoom === "number" ? p.zoom : void 0,
				volume: typeof p.volume === "number" ? p.volume : void 0,
				glass: typeof p.glass === "boolean" ? p.glass : void 0
			};
		}
	} catch {}
	return EMPTY_STATE;
}
/** 同步写入状态（写临时文件后原子改名；Windows 上 rename 覆盖已有文件会失败，先删再改）。 */
function writeState(state) {
	const path = statePath();
	mkdirSync(dirname(path), { recursive: true });
	const tmp = `${path}.tmp`;
	writeFileSync(tmp, JSON.stringify(state, null, 2), "utf8");
	try {
		renameSync(tmp, path);
	} catch {
		rmSync(path, { force: true });
		renameSync(tmp, path);
	}
}
//#endregion
//#region src/bg-settings.ts
/** settings 命名空间（host 与 client 共享的 wire 标识）。 */
const BG_NAMESPACE = "dsh-bg";
/**
* 用一份已解析配置构造命名空间 schema。config 默认烘焙进 .default()：
* - 客户端 scope 快照（describe view.value）自动携带镜像字段与运行时默认；
* - 首次使用时（user 层没有该字段）即得到 config 的默认行为。
*/
function buildBgSectionSchema(cfg) {
	return z.object({
		mode: z.union([...BG_MODES]).default("off"),
		value: z.string().default(""),
		fit: z.union([...BG_FITS]).default(cfg.defaultFit),
		textScheme: z.union([...BG_TEXT_SCHEMES]).default(cfg.defaultTextScheme),
		loop: z.boolean().default(cfg.defaultLoop),
		mediaKey: z.string().default(""),
		opacity: z.number().min(0).max(1).step(.05).default(1),
		posX: z.number().min(0).max(100).default(50),
		posY: z.number().min(0).max(100).default(50),
		scale: z.number().min(BG_SCALE_MIN).max(4).step(.05).default(1),
		zoom: z.number().min(1).max(3).step(.05).default(1),
		volume: z.number().min(0).max(1).step(.05).default(1),
		glass: z.boolean().default(false),
		imageExt: z.array(z.string()).default([...cfg.imageExt]),
		videoExt: z.array(z.string()).default([...cfg.videoExt]),
		maxImageMB: z.number().default(cfg.maxImageMB),
		maxVideoMB: z.number().default(cfg.maxVideoMB),
		defaultFit: z.union([...BG_FITS]).default(cfg.defaultFit),
		defaultTextScheme: z.union([...BG_TEXT_SCHEMES]).default(cfg.defaultTextScheme),
		defaultLoop: z.boolean().default(cfg.defaultLoop)
	});
}
let activeScope;
/**
* 清空媒体目录缓存 $DSH_HOME/dsh-bg-switch/media/ 下已登记的上传/登记文件
* （v0.4.2，#7「恢复默认清除背景缓存」）。恢复默认（mode=off）后所有 mediaKey
* 都已失效，这些残留上传文件就是"残留壁纸/视频缓存"；目录缺失/不可读返回 0，
* 单个文件删除失败不中断其余清理。
* @returns 成功删除的文件数。
*/
function pruneMediaCache() {
	const dir = dshHomePath("dsh-bg-switch", "media");
	try {
		const names = readdirSync(dir);
		let removed = 0;
		for (const name of names) try {
			rmSync(join(dir, name), { force: true });
			removed += 1;
		} catch {}
		return removed;
	} catch {
		return 0;
	}
}
/**
* 在 ctx 上安装 'dsh-bg' 命名空间注册（随 settings 服务生命周期挂/摘）。
* 启动时读取并校验 config.json（src/config.ts，进程内缓存），非法字段回退
* 默认并在此记日志。
* v0.4.2：命名空间**提交为 mode=off（恢复默认）**时清理媒体目录缓存（#7）——
* watch 覆盖所有写者（工具 / 客户端设置页 / 外部会话），只对真正提交的 resolved
* 值生效，幂等（已空目录清 0 次）。
* @param ctx - host 插件 ctx（index.ts 入口调用一次）。
* @returns disposer：摘除注册并清空 activeScope。
*/
function installBgNamespace(ctx) {
	const resolved = loadBgConfig();
	for (const warning of resolved.warnings) ctx.logger.warn(warning);
	const disposer = ctx.inject(["settings"], (settingsCtx) => {
		const scope = settingsCtx.settings.register(BG_NAMESPACE, buildBgSectionSchema(resolved.config));
		activeScope = scope;
		const unwatch = scope.watch((next) => {
			if ((typeof next === "object" && next !== null && !Array.isArray(next) ? next : void 0)?.mode === "off") pruneMediaCache();
		});
		settingsCtx.effect(() => () => {
			if (activeScope === scope) activeScope = void 0;
			unwatch();
		}, `dsh-bg: ${BG_NAMESPACE} scope detached`);
	});
	return () => {
		activeScope = void 0;
		disposer();
	};
}
/**
* 持久化一次背景状态：settings 可用写命名空间（按字段存在性 merge，
* 不动只读镜像字段），否则写 state.json。
* @param state - 背景状态；fit/textScheme/loop/mediaKey 为可选，仅当存在于
*   state 时才写（避免每次 apply 都清掉/覆盖上次用户选择）。
*/
async function persistBgState(state) {
	if (activeScope !== void 0) {
		const patch = {
			mode: state.mode,
			value: state.value
		};
		if (state.fit !== void 0) patch.fit = state.fit;
		if (state.textScheme !== void 0) patch.textScheme = state.textScheme;
		if (state.loop !== void 0) patch.loop = state.loop;
		if (state.mediaKey !== void 0) patch.mediaKey = state.mediaKey;
		if (state.opacity !== void 0) patch.opacity = state.opacity;
		if (state.posX !== void 0) patch.posX = state.posX;
		if (state.posY !== void 0) patch.posY = state.posY;
		if (state.scale !== void 0) patch.scale = state.scale;
		if (state.zoom !== void 0) patch.zoom = state.zoom;
		if (state.volume !== void 0) patch.volume = state.volume;
		if (state.glass !== void 0) patch.glass = state.glass;
		await activeScope.update(patch);
		return { target: "settings" };
	}
	writeState(state);
	return { target: "file" };
}
/**
* 读取当前背景状态：settings 可用时以命名空间为准（schema 默认 = config
* 解析值；fit/textScheme/loop 缺失时取命名空间默认），否则回退 state.json
* 并用 config 默认补齐可选字段。供 tool / style.ts / media 路由读取。
*/
function readBgState() {
	if (activeScope !== void 0) {
		const doc = activeScope.get();
		return {
			mode: doc.mode,
			value: doc.value,
			fit: doc.fit,
			textScheme: doc.textScheme,
			loop: doc.loop,
			mediaKey: doc.mediaKey,
			opacity: typeof doc.opacity === "number" ? doc.opacity : 1,
			posX: typeof doc.posX === "number" ? doc.posX : 50,
			posY: typeof doc.posY === "number" ? doc.posY : 50,
			scale: typeof doc.scale === "number" ? doc.scale : 1,
			zoom: typeof doc.zoom === "number" ? doc.zoom : 1,
			volume: typeof doc.volume === "number" ? doc.volume : 1,
			glass: typeof doc.glass === "boolean" ? doc.glass : false,
			updatedAt: ""
		};
	}
	const state = readState();
	const cfg = loadBgConfig().config;
	return {
		mode: state.mode,
		value: state.value,
		fit: state.fit ?? cfg.defaultFit,
		textScheme: state.textScheme ?? cfg.defaultTextScheme,
		loop: state.loop ?? cfg.defaultLoop,
		mediaKey: state.mediaKey ?? "",
		opacity: state.opacity ?? 1,
		posX: state.posX ?? 50,
		posY: state.posY ?? 50,
		scale: state.scale ?? 1,
		zoom: state.zoom ?? 1,
		volume: state.volume ?? 1,
		glass: state.glass ?? false,
		updatedAt: state.updatedAt
	};
}
//#endregion
//#region src/tool.ts
/**
* dsh-bg-switch —— host 工具插件（R3 触发面；v0.3 扩 video/fit/textScheme）。
*
* 注册工具 bg_apply：模型通过对话调用它来更换 DSH 网页界面的背景。
* v0.3 行为：
* - mode 扩 'video'：value 为 http(s) 视频 URL；file 参数给本地视频绝对路径时
*   不内联 —— 生成随机 mediaKey 并随状态写 settings（value 保留路径），host 的
*   /dsh-bg-media/<key> 路由（src/media.ts）按 key 从当前状态找路径流式伺服
*   （实现 Range 206，供视频拖动/时长）。跨重启有效：settings 持久化后路由仍
*   按同一份状态找文件。
* - 校验扩展名/大小用 config.json（src/config.ts → src/bg-config.ts）的
*   imageExt/videoExt/maxImageMB/maxVideoMB；非法字段启动时已回退默认并记日志。
* - fit / textScheme 可选参数：合法时随状态持久化（color/gradient 可忽略 fit）。
* - v0.3.1：新增可选 opacity（0–1 小数或 0–100 百分数，吸附 0.05 步长）与
*   posX / posY（0–100 百分比焦点；默认 50=居中），仅 image/video 生效。
* - v0.4：本地 image 不再内联 data URI —— 与本地 video 一致「登记 + mediaKey」：
*   校验扩展名/大小（config 表）后 value 保留原路径、mediaKey 写 settings，
*   host /dsh-bg-media/<key> 路由伺服（GET 先查媒体目录、再按状态原路径回退）。
*   mode=off 整命名空间重置：除 mode/value/mediaKey 外，fit/textScheme/loop/
*   opacity/posX/posY/volume 全部回默认（config 默认与 1/50/50/1），不留残值。
*
* 持久化（settings 优先，state.json 回退；见 src/bg-settings.ts）。
*/
const name$2 = "dsh-bg-switch";
const inject$2 = ["tools"];
/** CSS 安全字符集：阻止通过 value 注入分号/花括号/尖括号拆出多余规则。 */
const CSS_SAFE = /^[A-Za-z0-9#(),.%\s/\-]+$/;
/** 校验并规整 CSS 颜色/渐变载荷；非法则抛错。 */
function normalizeCssValue(mode, raw) {
	const value = raw.trim();
	if (value.length === 0) throw new Error(`bg_apply: ${mode} 模式需要 value 参数（CSS ${mode === "color" ? "颜色" : "渐变"}）`);
	if (value.length > 300) throw new Error("bg_apply: value 过长（>300 字符）");
	if (!CSS_SAFE.test(value)) throw new Error("bg_apply: value 含不允许的字符（仅允许 CSS 颜色/渐变语法字符，不能含 ; { } < >）");
	if (mode === "gradient") {
		const open = value.indexOf("(");
		const head = (open >= 0 ? value.slice(0, open + 1) : "").toLowerCase();
		if (![
			"linear-gradient(",
			"radial-gradient(",
			"conic-gradient(",
			"repeating-linear-gradient(",
			"repeating-radial-gradient("
		].includes(head)) throw new Error("bg_apply: gradient 模式的 value 必须是完整 CSS 渐变，如 linear-gradient(135deg, #1e2a78, #2b1055)");
	} else if (!/^[A-Za-z#]/.test(value)) throw new Error("bg_apply: color 模式的 value 需要是 CSS 颜色，如 #1e2a78 或 rgb(30, 42, 120)");
	return value;
}
/**
* http(s) URL 校验（image/video 共用）；去掉会在 CSS url() 里造成歧义的字符。
* v0.6.0：按扩展名做**跨类型**校验 —— image 模式拒绝明显是视频的链接
* （.mp4/.webm/…），video 模式拒绝明显是图片的链接；无扩展名的动态地址放行。
*/
function normalizeMediaUrlValue(raw, kind, cfg) {
	const value = raw.trim();
	if (!/^https?:\/\//i.test(value)) throw new Error("bg_apply: 该模式的 URL 必须以 http:// 或 https:// 开头");
	if (value.length > 2e3) throw new Error("bg_apply: URL 过长");
	const conflict = mediaUrlKindConflict(value, kind, cfg);
	if (conflict === "is-video") throw new Error("bg_apply: 这是视频链接（扩展名属于视频），image 模式请改用 mode=video，或换成图片链接");
	if (conflict === "is-image") throw new Error("bg_apply: 这是图片链接（扩展名属于图片），video 模式请改用 mode=image，或换成视频链接");
	return value.replace(/[\\"]/g, "");
}
/** 校验可选 fit 参数（undefined = 不随本次写；持久化保留上次选择）。 */
function normalizeFitArg(raw) {
	if (raw === void 0 || raw === null) return void 0;
	const value = String(raw).trim();
	if (!BG_FITS.includes(value)) throw new Error(`bg_apply: fit 需是 ${BG_FITS.join(" / ")} 之一，收到：${JSON.stringify(value)}`);
	return value;
}
/** 校验可选 textScheme 参数。 */
function normalizeTextSchemeArg(raw) {
	if (raw === void 0 || raw === null) return void 0;
	const value = String(raw).trim();
	if (!BG_TEXT_SCHEMES.includes(value)) throw new Error(`bg_apply: textScheme 需是 ${BG_TEXT_SCHEMES.join(" / ")} 之一，收到：${JSON.stringify(value)}`);
	return value;
}
/**
* 校验可选 opacity 参数（v0.3.1；image/video）。
* 兼容两种写法：0–1 小数（0.5）与 0–100 百分数（50 / '60'）；>1 按百分数换算。
* 返回值吸附到 settings schema 的 0.05 步长（避免 update 时 step 校验拒绝）。
*/
function normalizeOpacityArg(raw) {
	if (raw === void 0 || raw === null || raw === "") return void 0;
	const value = typeof raw === "number" ? raw : Number(String(raw).trim());
	if (!Number.isFinite(value)) throw new Error(`bg_apply: opacity 需是 0–1 的小数或 0–100 的百分数（如 0.5 或 50），收到：${JSON.stringify(raw)}`);
	if (value < 0 || value > 100) throw new Error(`bg_apply: opacity 超出范围（0–1 小数或 0–100 百分数），收到：${JSON.stringify(raw)}`);
	const frac = value > 1 ? value / 100 : value;
	return Math.round(frac * 20) / 20;
}
/** 校验可选 posX/posY 参数（v0.3.1；0–100 百分比，默认 50=居中）。 */
function normalizePosArg(raw, label) {
	if (raw === void 0 || raw === null || raw === "") return void 0;
	const value = typeof raw === "number" ? raw : Number(String(raw).trim());
	if (!Number.isFinite(value)) throw new Error(`bg_apply: ${label} 需是 0–100 的数字（百分比，默认 50=居中），收到：${JSON.stringify(raw)}`);
	if (value < 0 || value > 100) throw new Error(`bg_apply: ${label} 超出范围 0–100，收到：${JSON.stringify(raw)}`);
	return Math.round(value);
}
/**
* 校验可选 scale 参数（v0.4.3；媒体缩放 0.25–4）。
* 兼容两种写法：倍数（1.5 / '1.5'）与百分数（150 / '150%'，>4 时按百分数换算），
* 结果吸附到 settings schema 的 0.05 步长并钳制在 0.25–4。
*/
function normalizeScaleArg(raw) {
	if (raw === void 0 || raw === null || raw === "") return void 0;
	const value = typeof raw === "number" ? raw : Number(String(raw).trim().replace(/%$/, ""));
	if (!Number.isFinite(value)) throw new Error(`bg_apply: scale 需是 ${BG_SCALE_MIN}–4 的倍数（如 1.5）或百分数（如 150%），收到：${JSON.stringify(raw)}`);
	const factor = value > 4 ? value / 100 : value;
	if (factor < .25 || factor > 4) throw new Error(`bg_apply: scale 超出范围 ${BG_SCALE_MIN}–4（1=不缩放），收到：${JSON.stringify(raw)}`);
	return Math.round(factor * 20) / 20;
}
/**
* 校验可选 zoom 参数（v0.5.0；放大聚焦 1–3）。
* 兼容两种写法：倍数（2 / '2'）与百分数（200 / '200%'，>BG_ZOOM_MAX 时按百分数换算），
* 结果吸附到 settings schema 的 0.05 步长并钳制在 1–3。
*/
function normalizeZoomArg(raw) {
	if (raw === void 0 || raw === null || raw === "") return void 0;
	const value = typeof raw === "number" ? raw : Number(String(raw).trim().replace(/%$/, ""));
	if (!Number.isFinite(value)) throw new Error(`bg_apply: zoom 需是 1–3 的倍数（如 2）或百分数（如 200%），收到：${JSON.stringify(raw)}`);
	const factor = value > 3 ? value / 100 : value;
	if (factor < 1 || factor > 3) throw new Error(`bg_apply: zoom 超出范围 1–3（1=不缩放，最大 3=300%；缩小请用 scale），收到：${JSON.stringify(raw)}`);
	return Math.round(factor * 20) / 20;
}
/** 校验可选 glass 参数（v0.6.0；毛玻璃质感开关）。 */
function normalizeGlassArg(raw) {
	if (raw === void 0 || raw === null || raw === "") return void 0;
	if (typeof raw === "boolean") return raw;
	const value = String(raw).trim().toLowerCase();
	if (value === "true" || value === "1" || value === "on") return true;
	if (value === "false" || value === "0" || value === "off") return false;
	throw new Error(`bg_apply: glass 需是布尔值（true/false），收到：${JSON.stringify(raw)}`);
}
/** 取文件扩展名（无点、小写）。 */
function fileExt$1(path) {
	return extname(path).slice(1).toLowerCase();
}
function localFileSize(path) {
	try {
		return statSync(path).size;
	} catch {
		return null;
	}
}
/**
* 校验并返回本地媒体文件（image/video 共用，v0.4：只登记不内联）：
* 扩展名须在 kind 对应允许表、文件可读。
* v0.6.0：**视频不校验体积**（需求「背景视频大小不要设限制」）；图片仍按
* config.maxImageMB。超限/格式错抛中文 Error。
*/
function validateLocalMediaFile(path, kind, cfg) {
	const ext = fileExt$1(path);
	const allowed = kind === "image" ? cfg.imageExt : cfg.videoExt;
	if (!allowed.includes(ext)) throw new Error(`bg_apply: 不支持的${kind === "image" ? "图片" : "视频"}类型 .${ext || "(无扩展名)"}（允许 ${allowed.join(" / ")}）`);
	const size = localFileSize(path);
	if (size === null) throw new Error(`bg_apply: 读取本地${kind === "image" ? "图片" : "视频"}失败：${path}（请确认路径存在且可读）`);
	if (kind === "video") return path;
	const limitMB = cfg.maxImageMB;
	if (size > limitMB * 1024 * 1024) throw new Error(`bg_apply: 本地图片 ${size} 字节超过上限 ${limitMB}MB`);
	return path;
}
/**
* 纯逻辑核心（不碰 ctx/settings）：把工具参数校验并组装成 {@link BgState}。
* 抽出为模块导出便于 build/verify-client.mjs 对 URL 放行 / mediaKey 生成 /
* 扩展名校验做真实断言（execute 内部与测试共用同一路径）。
* @param args - 模型给的原始参数。
* @param cfg - 已解析的 config（src/config.ts currentBgConfig()）。
* @throws 带中文错误信息（给出允许格式）。
*/
function executeBgApply(args, cfg) {
	const modeRaw = String(args.mode ?? "").trim();
	const fit = normalizeFitArg(args.fit);
	const textScheme = normalizeTextSchemeArg(args.textScheme);
	const opacity = normalizeOpacityArg(args.opacity);
	const posX = normalizePosArg(args.posX, "posX");
	const posY = normalizePosArg(args.posY, "posY");
	const scale = normalizeScaleArg(args.scale);
	const zoom = normalizeZoomArg(args.zoom);
	const glass = normalizeGlassArg(args.glass);
	const file = typeof args.file === "string" && args.file.trim() !== "" ? args.file.trim() : null;
	const stamp = (/* @__PURE__ */ new Date()).toISOString();
	/** 组装状态：只放确实提供的可选字段，避免 undefined 污染持久化。 */
	const buildState = (mode, value, mediaKey = "") => {
		const out = {
			mode,
			value,
			mediaKey,
			updatedAt: stamp
		};
		if (fit !== void 0) out.fit = fit;
		if (textScheme !== void 0) out.textScheme = textScheme;
		if (opacity !== void 0) out.opacity = opacity;
		if (posX !== void 0) out.posX = posX;
		if (posY !== void 0) out.posY = posY;
		if (scale !== void 0) out.scale = scale;
		if (zoom !== void 0) out.zoom = zoom;
		if (glass !== void 0) out.glass = glass;
		return out;
	};
	switch (modeRaw) {
		case "color":
		case "gradient": return buildState(modeRaw, normalizeCssValue(modeRaw, String(args.value ?? "")));
		case "image":
			if (file) return buildState("image", validateLocalMediaFile(file, "image", cfg), randomUUID());
			return buildState("image", normalizeMediaUrlValue(String(args.value ?? ""), "image", cfg));
		case "video":
			if (file) return buildState("video", validateLocalMediaFile(file, "video", cfg), randomUUID());
			return buildState("video", normalizeMediaUrlValue(String(args.value ?? ""), "video", cfg));
		case "off": return {
			mode: "off",
			value: "",
			mediaKey: "",
			fit: cfg.defaultFit,
			textScheme: cfg.defaultTextScheme,
			loop: cfg.defaultLoop,
			opacity: 1,
			posX: 50,
			posY: 50,
			scale: 1,
			zoom: 1,
			volume: 1,
			glass: false,
			updatedAt: stamp
		};
		default: throw new Error(`bg_apply: mode 必须是 color / gradient / image / video / off 之一，收到：${JSON.stringify(modeRaw)}`);
	}
}
function apply$2(ctx) {
	ctx.tools.register(defineTool({
		name: "bg_apply",
		description: "更换 DeepSeek Harness 网页界面的背景。当用户说想换背景、换配色、换皮肤、放壁纸图片、放背景视频时使用。mode=color 把全局底色换成指定 CSS 颜色；mode=gradient 用指定 CSS 渐变做整页背景；mode=image 用一张图片做整页壁纸（给 http(s) URL，或 file 传本地图片路径）；mode=video 用一个视频做整页背景（给 http(s) URL，或 file 传本地视频路径；本地视频不内联、由插件媒体路由伺服）；mode=off 恢复默认。fit/textScheme/opacity/posX/posY/scale/zoom/glass 可选（opacity/posX/posY/scale/zoom 仅 image/video：opacity=媒体不透明度 0–1 小数或 0–100 百分数；posX/posY=焦点定位百分比 0–100，50/50=居中；scale=媒体缩放 0.25–4 倍数或百分数，1=不缩放；zoom=放大聚焦 1–3 倍数或百分数，1=不缩放，最大 300%，缩放中心为焦点）。glass=毛玻璃质感开关（true/false，默认 false；开启后界面表面半透明并对背景做模糊）。设置成功写入 settings 命名空间后客户端即时生效；无客户端会话时提示用户刷新页面生效。",
		parameters: {
			mode: {
				type: "string",
				required: true,
				description: "背景模式：color（纯色）| gradient（渐变）| image（图片）| video（视频）| off（恢复默认）"
			},
			value: {
				type: "string",
				description: "color: CSS 颜色如 #1e2a78；gradient: 完整 CSS 渐变；image/video: http(s) URL（按扩展名校验类型：image 不收 .mp4/.webm 等视频链接，video 不收 .jpg/.png 等图片链接；无扩展名的动态地址放行）"
			},
			file: {
				type: "string",
				description: "本地文件绝对路径（image/video 通用；登记伺服不内联：校验后生成 mediaKey 由插件媒体路由 /dsh-bg-media/<key> 伺服；image ≤maxImageMB，视频不设大小上限）"
			},
			fit: {
				type: "string",
				description: `image/video 适配（可选）：${BG_FITS.join(" / ")}（fill=拉伸铺满 / cover=裁切铺满 / contain=完整容纳 / center=不缩放居中 / tile=平铺）`
			},
			textScheme: {
				type: "string",
				description: "文字与表面方案（可选）：auto（按背景亮度推断；image/video 推断不出时用浅色文字+深色表面）| light | dark"
			},
			opacity: {
				type: "number",
				description: "媒体不透明度（可选，仅 image/video）：0–1 小数或 0–100 百分数（如 0.6 或 60；默认 1=不透明）"
			},
			posX: {
				type: "number",
				description: "焦点水平定位（可选，仅 image/video）：0–100 百分比（默认 50=居中；0=看最左，100=看最右；配合 fit 的 cover/contain 即\"定位到图片的某一块\"）"
			},
			posY: {
				type: "number",
				description: "焦点垂直定位（可选，仅 image/video）：0–100 百分比（默认 50=居中；0=看最上，100=看最下）"
			},
			scale: {
				type: "number",
				description: `媒体缩放（可选，仅 image/video）：${BG_SCALE_MIN}–4 倍数（1=不缩放，>1 放大，<1 缩小）或百分数（150 或 '150%'）；与 posX/posY 组合即以焦点为中心放大/缩小`
			},
			zoom: {
				type: "number",
				description: `放大聚焦（可选，仅 image/video）：1–3 倍数（1=不缩放，最大 3=300%）或百分数（200 或 '200%'）；等价于"把可见窗口聚焦到 posX/posY 处并放大"，缩放中心即焦点；缩小请用 scale`
			},
			glass: {
				type: "boolean",
				description: "毛玻璃质感（可选）：true 开启（界面表面半透明 + 背景模糊），false 关闭（默认）。适合壁纸/视频背景让面板、气泡等表面呈现磨砂玻璃质感"
			}
		},
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: {
					ok: {
						type: "boolean",
						required: true
					},
					message: {
						type: "string",
						required: true
					},
					target: {
						type: "string",
						description: "落盘目标：settings=settings 命名空间（权威，客户端即时生效）；file=state.json（回退，需刷新）"
					}
				}
			},
			render: (_args, value) => [{
				type: "text",
				text: value.message
			}]
		},
		async execute(args) {
			const state = executeBgApply(args, currentBgConfig());
			const fileUsed = typeof args.file === "string" && args.file.trim() !== "";
			const { target } = await persistBgState(state);
			return {
				ok: true,
				message: `${state.mode === "off" ? "已恢复默认背景（含定位/透明度/音量等全部运行时字段）。" : state.mode === "image" ? "壁纸已设置" + (fileUsed ? "（本地图片已登记伺服，不内联）" : "") + "。" : state.mode === "video" ? "背景视频已设置" + (fileUsed ? "（本地视频已登记伺服，经插件媒体路由流式播放）" : "") + "。" : `背景已设为 ${state.mode === "color" ? "纯色" : "渐变"}。`}${target === "settings" ? "客户端设置页将即时生效；若当前会话未加载客户端，刷新页面生效。" : "已写入状态文件，刷新页面生效。"}`,
				target
			};
		}
	}));
}
//#endregion
//#region src/media.ts
/**
* dsh-bg-switch —— host 本地媒体路由（v0.4：上传登记 + 任意已登记媒体伺服）。
*
* v0.3 起为本地背景视频提供流式伺服；v0.4 扩为通用「上传+伺服」：
* - **POST /dsh-bg-media/upload?kind=image|video&ext=<ext>**：body = 原始文件流。
*   按 kind 校验扩展名（image 用 config.imageExt / video 用 videoExt，含默认表）；
*   **体积上限只对 image 生效**（config.maxImageMB 默认 10MB）—— v0.6.0 起视频
*   不设上限（需求：背景视频大小不要设限制），limitBytes 用 MAX_SAFE_INTEGER
*   表示"不限制"（流式落盘的超限中止因此永不触发）。通过后写入
*   `$DSH_HOME/dsh-bg-switch/media/<uuid>.<ext>`（dshHomePath 来自
*   @deepseek-ai/dsh-home-paths）。响应 JSON `{ok:true, mediaKey:'<uuid>'}`；
*   非法扩展 / 超限 / 坏参数 → 400 + 中文 message。
*   上传的媒体**不写入 settings value**：客户端拿 mediaKey 调 setBg，value 留空，
*   mediaKey 入 settings；`<img>/<video>` 的 src 按 资源解析 =
*   mediaKey 非空 → `/dsh-bg-media/<mediaKey>`，否则 value 直接作 URL。
* - **GET / HEAD /dsh-bg-media/<mediaKey>**：按 mediaKey 伺服**任意已登记媒体**
*   （不再限定 mode=video / 状态匹配）：先查媒体目录里的 `<uuid>.<ext>`；未命中再
*   兼容旧模式（状态 mode=video 且 mediaKey 匹配且 value 是本地绝对路径 → 伺服
*   原路径文件，bg_apply file 参数的登记方式，v0.3 行为保留）。单段 bytes Range
*   206 / 416 / 400 / 404 / HEAD 只回头。MIME 按扩展名（image 表 → video 表 →
*   octet-stream）。
*
* 契约依据（host 源码，dsh-host 只读参考树，写入注释供复核）：
* - webserver 注册 API：packages/host/webserver/src/index.ts
*   `register(route: {kind:'prefix'|'exact', path, handler(req,res)})`（165–172），
*   返回 disposer；重复 (kind,path) 抛错（168 行）。handler 拥有完整响应生命周期，
*   res 是 node:http ServerResponse（47 行），可直接写流。method 不限 ——
*   POST body 以原始流到达（req 是 IncomingMessage，可 'data'/'end' 边收边落盘，
*   边计数即可在超限时提前中止，无需把 500MB 级视频整读进内存）。
* - 命名路由先于 fallback 命中（match 221–229/317–327），因此本前缀路由与
*   frontend-static 的 fallback 席位不冲突。
* - compression 中间件对带 content-range 的响应豁免 gzip（95 行），印证 Range
*   响应由路由直写姿势。
*
* 本插件声明 inject:['webServer']：只有提供 webServer 的 profile（web/桌面
* connection）才激活；headless/纯 CLI 无 webServer 时不激活、无副作用。
*/
const name$1 = "dsh-bg-media";
const inject$1 = ["webServer"];
/** 本插件持有的 webServer 前缀（客户端用它拼 src / 上传 URL）。 */
const MEDIA_PATH_PREFIX = "/dsh-bg-media";
/** 媒体目录（上传文件落地处）：$DSH_HOME/dsh-bg-switch/media/。导出供冒烟/测试。 */
function mediaDirPath() {
	return dshHomePath("dsh-bg-switch", "media");
}
/** 取文件扩展名（无点、小写）。 */
function fileExt(path) {
	return extname(path).slice(1).toLowerCase();
}
/** 状态里的 value 是否是本地绝对路径（bg_apply file 登记的旧模式）。 */
function looksLocalPath(value) {
	return !/^(?:https?:|data:|blob:)/i.test(value) && value.length > 0;
}
/** 扩展名 → Content-Type（image 表优先，其次 video 表，未知 octet-stream）。 */
function extToMime(ext) {
	return IMAGE_EXT_TO_MIME[ext] ?? VIDEO_EXT_TO_MIME[ext] ?? "application/octet-stream";
}
/**
* 解析单个 Range 头（只支持单段 bytes 语法）。
* @returns 目标 [start,end]（闭区间，含端），或 'invalid'（400）/ 'unsatisfiable'（416）。
* 导出供 build/verify-client.mjs 断言（真实 HTTP 冒烟由 CLI web 启动覆盖）。
*/
function parseByteRange(header, size) {
	const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
	if (!match) return "invalid";
	const [, startRaw, endRaw] = match;
	if (startRaw === "" && endRaw === "") return "invalid";
	if (startRaw === "") {
		const suffix = Number(endRaw);
		if (!Number.isFinite(suffix) || suffix <= 0) return "invalid";
		if (size === 0) return "unsatisfiable";
		return {
			start: Math.max(0, size - suffix),
			end: size - 1
		};
	}
	const start = Number(startRaw);
	if (!Number.isInteger(start) || start < 0) return "invalid";
	if (start >= size) return "unsatisfiable";
	const end = endRaw === "" ? size - 1 : Math.min(Number(endRaw), size - 1);
	if (!Number.isInteger(end) || end < start) return "invalid";
	return {
		start,
		end
	};
}
/** 发 JSON 响应（上传接口用）。 */
function jsonResponse(res, status, payload) {
	res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
	res.end(JSON.stringify(payload));
}
/** 发 404。 */
function notFound(res) {
	res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
	res.end("dsh-bg-media: 未知媒体（媒体目录无该文件，且当前状态未指向本地背景）");
}
/** 发 416（Range 不可满足）。 */
function rangeNotSatisfiable(res, size) {
	res.writeHead(416, { "content-range": `bytes */${size}` });
	res.end();
}
/** 解析请求路径（/dsh-bg-media/... → pathname；上传判断需要）。 */
function pathnameOf(req) {
	try {
		return new URL(req.url ?? "/", "http://x").pathname;
	} catch {
		return "";
	}
}
/** 解析请求路径里的 mediaKey（/dsh-bg-media/<key>）。 */
function mediaKeyOf(req) {
	try {
		const pathname = new URL(req.url ?? "/", "http://x").pathname;
		return decodeURIComponent(pathname.slice(14));
	} catch {
		return "";
	}
}
/**
* 上传参数预校验（纯逻辑，供路由与 verify-client.mjs 断言共用）。
* @param kindRaw - query.kind（image | video）。
* @param extRaw - query.ext（如 png / mp4；可带前置点，会清洗）。
* @param size - 已知大小（Content-Length）；null 表示流式未知（只返回上限）。
* @param cfg - 解析后的 config（允许扩展表 / MB 上限）。
*/
function validateUpload(kindRaw, extRaw, size, cfg) {
	const kind = kindRaw === "image" ? "image" : kindRaw === "video" ? "video" : null;
	if (kind === null) return {
		ok: false,
		status: 400,
		message: "dsh-bg-media: 参数 kind 需是 image 或 video"
	};
	const ext = (extRaw ?? "").trim().toLowerCase().replace(/^\.+/, "");
	if (!/^[a-z0-9]{1,12}$/.test(ext)) return {
		ok: false,
		status: 400,
		message: `dsh-bg-media: 缺少或非法的扩展名参数 ext（如 png / mp4），收到：${JSON.stringify(extRaw ?? "")}`
	};
	const allowed = kind === "image" ? cfg.imageExt : cfg.videoExt;
	if (!allowed.includes(ext)) return {
		ok: false,
		status: 400,
		message: `dsh-bg-media: 不支持的${kind === "image" ? "图片" : "视频"}类型 .${ext}（允许 ${allowed.join(" / ")}）`
	};
	if (kind === "video") return {
		ok: true,
		limitBytes: Number.MAX_SAFE_INTEGER
	};
	const limitMB = cfg.maxImageMB;
	const limitBytes = Math.round(limitMB * 1024 * 1024);
	if (size !== null && Number.isFinite(size) && size > limitBytes) return {
		ok: false,
		status: 400,
		message: `dsh-bg-media: 文件 ${size} 字节超过上限 ${limitMB}MB（kind=image）`
	};
	return {
		ok: true,
		limitBytes
	};
}
/**
* 按 mediaKey 解析可伺服文件：① 媒体目录里 `<key>.<ext>`（上传登记）；
* ② 旧模式状态（mode=video、mediaKey 匹配、value 为本地绝对路径）。
* @returns 绝对路径；未命中返回 null。
*/
function resolveMediaFilePath(mediaKey) {
	if (!/^[0-9a-zA-Z-]{1,80}$/.test(mediaKey)) return null;
	try {
		const dir = mediaDirPath();
		for (const name of readdirSync(dir)) if (name.startsWith(`${mediaKey}.`)) return join(dir, name);
	} catch {}
	const state = readBgState();
	if (state.mode === "video" && state.mediaKey === mediaKey && looksLocalPath(state.value)) try {
		if (statSync(state.value).isFile()) return state.value;
	} catch {}
	return null;
}
/**
* 以单段 Range 语义伺服一个文件（GET/HEAD 共用；206 单段，200 整段）。
* 从 resolveMediaFilePath 拿到 path 后调用。
*/
function serveFile(req, res, filePath) {
	let stat;
	try {
		stat = statSync(filePath);
	} catch {
		notFound(res);
		return;
	}
	if (!stat.isFile()) {
		notFound(res);
		return;
	}
	const size = stat.size;
	const baseHeaders = {
		"content-type": extToMime(fileExt(filePath)),
		"accept-ranges": "bytes",
		"cache-control": "no-store"
	};
	const rangeHeader = typeof req.headers.range === "string" ? req.headers.range : void 0;
	if (rangeHeader !== void 0) {
		const parsed = parseByteRange(rangeHeader, size);
		if (parsed === "invalid") {
			res.writeHead(400);
			res.end();
			return;
		}
		if (parsed === "unsatisfiable") {
			rangeNotSatisfiable(res, size);
			return;
		}
		const { start, end } = parsed;
		const length = end - start + 1;
		res.writeHead(206, {
			...baseHeaders,
			"content-range": `bytes ${start}-${end}/${size}`,
			"content-length": length
		});
		if (req.method === "HEAD") {
			res.end();
			return;
		}
		streamBody(req, res, filePath, {
			start,
			end
		});
		return;
	}
	res.writeHead(200, {
		...baseHeaders,
		"content-length": size
	});
	if (req.method === "HEAD") {
		res.end();
		return;
	}
	streamBody(req, res, filePath, {});
}
/** 把文件的 [start,end] 段（或整段）pipe 到 res，随连接关闭销毁。 */
function streamBody(req, res, filePath, range) {
	return new Promise((resolve) => {
		const stream = createReadStream(filePath, range.start !== void 0 ? {
			start: range.start,
			end: range.end
		} : {});
		stream.on("error", () => {
			res.destroy();
			resolve();
		});
		res.on("close", () => {
			stream.destroy();
			resolve();
		});
		req.on("close", () => {
			stream.destroy();
			resolve();
		});
		stream.pipe(res);
		stream.on("end", () => resolve());
	});
}
/**
* POST /dsh-bg-media/upload：边收边校验边落盘（超限即中止）。
* 成功 → {ok:true, mediaKey}；失败 → 400 + 中文 message。
*/
async function handleUpload(req, res) {
	let cfg;
	let ext;
	let limitBytes;
	try {
		const url = new URL(req.url ?? "/", "http://x");
		const kindRaw = url.searchParams.get("kind");
		const extRaw = url.searchParams.get("ext");
		cfg = currentBgConfig();
		const pre = validateUpload(kindRaw, extRaw, (() => {
			const raw = req.headers["content-length"];
			if (typeof raw !== "string" || raw === "") return null;
			const n = Number(raw);
			return Number.isFinite(n) ? n : null;
		})(), cfg);
		if (!pre.ok) {
			jsonResponse(res, pre.status, {
				ok: false,
				message: pre.message
			});
			req.resume();
			return;
		}
		ext = (extRaw ?? "").trim().toLowerCase().replace(/^\.+/, "");
		limitBytes = pre.limitBytes;
	} catch (error) {
		jsonResponse(res, 400, {
			ok: false,
			message: `dsh-bg-media: 请求参数解析失败（${error instanceof Error ? error.message : String(error)}）`
		});
		req.resume();
		return;
	}
	const key = randomUUID();
	const dir = mediaDirPath();
	try {
		mkdirSync(dir, { recursive: true });
	} catch (error) {
		jsonResponse(res, 500, {
			ok: false,
			message: `dsh-bg-media: 创建媒体目录失败（${error instanceof Error ? error.message : String(error)}）`
		});
		req.resume();
		return;
	}
	const tmpPath = join(dir, `.${key}.tmp`);
	const finalPath = join(dir, `${key}.${ext}`);
	let failed = false;
	const out = createWriteStream(tmpPath);
	out.on("error", () => {
		if (failed) return;
		failed = true;
		rmSync(tmpPath, { force: true });
		jsonResponse(res, 400, {
			ok: false,
			message: "dsh-bg-media: 写入媒体目录失败"
		});
		req.resume();
	});
	req.on("error", () => {
		if (failed) return;
		failed = true;
		out.destroy();
		rmSync(tmpPath, { force: true });
		jsonResponse(res, 400, {
			ok: false,
			message: "dsh-bg-media: 读取上传流失败"
		});
	});
	let received = 0;
	req.on("data", (chunk) => {
		if (failed) return;
		received += chunk.length;
		if (received > limitBytes) {
			failed = true;
			out.destroy();
			rmSync(tmpPath, { force: true });
			jsonResponse(res, 400, {
				ok: false,
				message: `dsh-bg-media: 上传超过上限 ${Math.round(limitBytes / 1024 / 1024)}MB（kind=image）`
			});
			req.resume();
			return;
		}
		out.write(chunk);
	});
	req.on("end", () => {
		if (failed) return;
		out.end(() => {
			if (failed) return;
			try {
				renameSync(tmpPath, finalPath);
			} catch (error) {
				failed = true;
				rmSync(tmpPath, { force: true });
				jsonResponse(res, 500, {
					ok: false,
					message: `dsh-bg-media: 落盘失败（${error instanceof Error ? error.message : String(error)}）`
				});
				return;
			}
			jsonResponse(res, 200, {
				ok: true,
				mediaKey: key
			});
		});
	});
}
/** 单次请求的处理入口（按 method + path 分流：上传 / 伺服）。 */
async function handleMedia(req, res) {
	const pathname = pathnameOf(req);
	if (req.method === "POST" && pathname === "/dsh-bg-media/upload") {
		await handleUpload(req, res);
		return;
	}
	if (req.method !== "GET" && req.method !== "HEAD") {
		res.writeHead(405);
		res.end();
		return;
	}
	const key = mediaKeyOf(req);
	if (key === "") {
		notFound(res);
		return;
	}
	const filePath = resolveMediaFilePath(key);
	if (filePath === null) {
		notFound(res);
		return;
	}
	serveFile(req, res, filePath);
}
function apply$1(ctx) {
	ctx.effect(() => ctx.webServer.register({
		kind: "prefix",
		path: MEDIA_PATH_PREFIX,
		handler: handleMedia
	}), "dsh-bg: /dsh-bg-media route (upload + serve)");
}
//#endregion
//#region src/index.ts
const name = "dsh-bg-switch";
const inject = ["tools"];
function apply(ctx) {
	ctx.effect(() => installBgNamespace(ctx), "dsh-bg: settings namespace");
	ctx.plugin({
		name: name$2,
		inject: inject$2 ?? [],
		apply: apply$2
	});
	ctx.plugin({
		name: name$1,
		inject: inject$1 ?? [],
		apply: apply$1
	});
}
//#endregion
export { apply, inject, name };

//# sourceMappingURL=index.js.map