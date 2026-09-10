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

// ---- 枚举（单点定义，settings schema / 工具参数 / UI 下拉共用） ----

/** 背景模式：video 为 v0.3 新增。 */
export const BG_MODES = ['off', 'color', 'gradient', 'image', 'video'] as const
export type BgMode = (typeof BG_MODES)[number]

/** 媒体适配（UI 下拉枚举；color/gradient 无意义禁用）。 */
export const BG_FITS = ['fill', 'cover', 'contain', 'center', 'tile'] as const
export type BgFit = (typeof BG_FITS)[number]

/** 文字方案：'auto' 按背景亮度推断；推断不出（image/video/media）默认 light-text。 */
export const BG_TEXT_SCHEMES = ['auto', 'light', 'dark'] as const
export type BgTextScheme = (typeof BG_TEXT_SCHEMES)[number]

// ---- 扩展名 → MIME（本地 file 校验 / 媒体路由 Content-Type 共用） ----

export const IMAGE_EXT_TO_MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  avif: 'image/avif',
  bmp: 'image/bmp',
  ico: 'image/x-icon',
}

export const VIDEO_EXT_TO_MIME: Record<string, string> = {
  mp4: 'video/mp4',
  webm: 'video/webm',
  ogg: 'video/ogg',
  ogv: 'video/ogg',
  mov: 'video/quicktime',
  m4v: 'video/x-m4v',
}

// ---- 配置类型与内置默认 ----

export interface BgConfig {
  /** 本地图片允许的扩展名（无点、小写）。 */
  imageExt: string[]
  /** 本地视频允许的扩展名（无点、小写）。 */
  videoExt: string[]
  /** UI 本地图片 data URI 内联上限（MB；host bg_apply file 参数同样校验）。 */
  maxImageMB: number
  /** 本地视频体积上限（MB；host 只校验不内联）。 */
  maxVideoMB: number
  /** image/video 模式默认 fit（color/gradient 无意义）。 */
  defaultFit: BgFit
  /** textScheme 默认。 */
  defaultTextScheme: BgTextScheme
  /** 视频循环默认（UI 可改；是否持久化可选）。 */
  defaultLoop: boolean
}

export const DEFAULT_BG_CONFIG: Readonly<BgConfig> = Object.freeze({
  imageExt: Object.freeze(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'avif', 'bmp', 'ico']),
  videoExt: Object.freeze(['mp4', 'webm', 'ogg', 'ogv', 'mov', 'm4v']),
  maxImageMB: 10,
  maxVideoMB: 500,
  defaultFit: 'cover',
  defaultTextScheme: 'auto',
  defaultLoop: true,
})

// ---- config.json 校验/清洗 ----

export interface BgConfigNormalizeResult {
  config: BgConfig
  /** 每个非法字段一条说明；空 = 全部合法（或输入缺失→默认，无 issue）。 */
  issues: string[]
}

/** 清洗单个扩展名字符串：去空白/前置点/转小写/去重。返回 '' 表示丢弃。 */
function cleanExt(raw: unknown): string {
  if (typeof raw !== 'string') return ''
  const ext = raw.trim().toLowerCase().replace(/^\.+/, '')
  return ext === '' ? '' : ext
}

function normalizeExtList(raw: unknown, fallback: readonly string[], label: string, issues: string[]): string[] {
  if (raw === undefined) return [...fallback]
  if (!Array.isArray(raw) || raw.length === 0) {
    issues.push(`config: ${label} 需是非空字符串数组（如 ["png","jpg"]），已回退内置默认`)
    return [...fallback]
  }
  const seen = new Set<string>()
  const out: string[] = []
  for (const item of raw) {
    const ext = cleanExt(item)
    if (ext === '') {
      issues.push(`config: ${label} 含有非法项（需是扩展名文本），已忽略`)
      continue
    }
    if (!seen.has(ext)) {
      seen.add(ext)
      out.push(ext)
    }
  }
  if (out.length === 0) {
    issues.push(`config: ${label} 清洗后为空，已回退内置默认`)
    return [...fallback]
  }
  return out
}

function normalizePositiveInt(raw: unknown, fallback: number, label: string, issues: string[]): number {
  if (raw === undefined) return fallback
  const n = typeof raw === 'number' ? raw : Number(raw)
  if (!Number.isFinite(n) || n <= 0) {
    issues.push(`config: ${label} 需是大于 0 的数字（MB），已回退 ${fallback}`)
    return fallback
  }
  return Math.max(1, Math.round(n))
}

/**
 * 把 config.json 的未知 JSON 形状规范化为合法 {@link BgConfig}。
 * @param raw - JSON.parse 后的 config.json 内容；undefined/null 表示无文件（纯默认，无 issue）。
 */
export function normalizeBgConfig(raw: unknown): BgConfigNormalizeResult {
  const issues: string[] = []
  if (raw === undefined || raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return { config: { ...DEFAULT_BG_CONFIG }, issues }
  }
  const obj = raw as Record<string, unknown>
  let defaultFit = obj.defaultFit as BgFit
  if (obj.defaultFit !== undefined && !BG_FITS.includes(defaultFit)) {
    issues.push(`config: defaultFit 需是 ${BG_FITS.join('/')} 之一，已回退 cover`)
    defaultFit = DEFAULT_BG_CONFIG.defaultFit
  }
  let defaultTextScheme = obj.defaultTextScheme as BgTextScheme
  if (obj.defaultTextScheme !== undefined && !BG_TEXT_SCHEMES.includes(defaultTextScheme)) {
    issues.push(`config: defaultTextScheme 需是 ${BG_TEXT_SCHEMES.join('/')} 之一，已回退 auto`)
    defaultTextScheme = DEFAULT_BG_CONFIG.defaultTextScheme
  }
  let defaultLoop = obj.defaultLoop
  if (obj.defaultLoop !== undefined && typeof obj.defaultLoop !== 'boolean') {
    issues.push('config: defaultLoop 需是布尔值，已回退 true')
    defaultLoop = DEFAULT_BG_CONFIG.defaultLoop
  }
  const config: BgConfig = {
    imageExt: normalizeExtList(obj.imageExt, DEFAULT_BG_CONFIG.imageExt, 'imageExt', issues),
    videoExt: normalizeExtList(obj.videoExt, DEFAULT_BG_CONFIG.videoExt, 'videoExt', issues),
    maxImageMB: normalizePositiveInt(obj.maxImageMB, DEFAULT_BG_CONFIG.maxImageMB, 'maxImageMB', issues),
    maxVideoMB: normalizePositiveInt(obj.maxVideoMB, DEFAULT_BG_CONFIG.maxVideoMB, 'maxVideoMB', issues),
    defaultFit,
    defaultTextScheme,
    defaultLoop,
  }
  return { config, issues }
}
