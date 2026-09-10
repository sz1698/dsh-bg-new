/**
 * dsh-bg-switch —— client 纯工具：亮度/文字方案推导与表面 token 调色板。
 *
 * 契约依据（host 只读参考树，写入注释供复核）：
 * - 可覆盖 token 名单：packages/client/ui-theme/src/client/index.ts 的
 *   BUILTIN_INSPECT_TOKENS（131–145 行）：--dsw-alias-bg-base / bg-layer-1/2 /
 *   bg-overlay / border-l1/l2 / brand-primary / label-primary / label-secondary /
 *   --dsw-specific-sidebar-fill。design-platform.css 另确认存在
 *   --dsw-alias-label-tertiary（209/302 行）、--dsw-alias-bg-layer-3（160/253）、
 *   --dsw-alias-border-l3/l4（175–176/268–269）与 --dsw-specific-bubble /
 *   input-major / menu（=layer-3）/ sidebar-nav-item-* 等具体表面 token。
 * - 「全屏透出」原理：AppFrame.module.css `.frame{background:var(--dsw-alias-bg-base)}`
 *   （7 行）与 `.sidebarCol{background:var(--dsw-specific-sidebar-fill)}`（28 行）
 *   是挡住视口的两大面；web/src/base.css `body{background:var(--dsw-alias-bg-base,#fff)}`
 *   （30 行，html 无背景 → body 背景传播到画布）。把 bg-base 与 sidebar-fill
 *   置 transparent 后，画布以下只剩我们自管的 z-index:-1 背景层，壁纸透出整窗。
 *
 * 所有覆盖值都是字面量（rgb/rgba/#hex），绝不引用正在覆盖的同名 var ——
 * 规避 CSS 变量自引用陷阱（如 color-mix 里写 var(--dsw-alias-bg-base)）。
 */

import type { BgMode, BgTextScheme } from '../bg-config.ts'

// ---- CSS 颜色解析（hex / rgb/rgba 现代与逗号语法；不支持返回 null） ----

export interface RgbTriple {
  r: number
  g: number
  b: number
}

function clamp255(n: number): number | null {
  return Number.isFinite(n) ? Math.max(0, Math.min(255, Math.round(n))) : null
}

/** 解析一个 CSS 颜色为 RGB 三元组；解析失败（命名色/hsl/畸形）返回 null。 */
export function parseCssColor(value: string): RgbTriple | null {
  const input = value.trim()
  if (input === '') return null
  if (input.startsWith('#')) {
    const hex = input.slice(1)
    if (/^[0-9a-fA-F]{3}$/.test(hex)) {
      return {
        r: parseInt(hex[0] + hex[0], 16),
        g: parseInt(hex[1] + hex[1], 16),
        b: parseInt(hex[2] + hex[2], 16),
      }
    }
    if (/^[0-9a-fA-F]{6}$/.test(hex)) {
      return {
        r: parseInt(hex.slice(0, 2), 16),
        g: parseInt(hex.slice(2, 4), 16),
        b: parseInt(hex.slice(4, 6), 16),
      }
    }
    return null
  }
  const rgbMatch = /^rgba?\((.*)\)$/s.exec(input)
  if (!rgbMatch) return null
  const inner = rgbMatch[1]
  const hasSlash = inner.includes('/')
  const commaParts = inner.split(',').map((part) => part.trim())
  let channels: string[]
  let alpha = 1
  if (hasSlash) {
    const [rgbPart, aRaw] = inner.split('/')
    channels = rgbPart.split(/[\s,]+/).map((part) => part.trim()).filter((part) => part !== '')
    const a = parseFloat(aRaw)
    alpha = Number.isFinite(a) ? a : 1
  } else if (commaParts.length === 4) {
    channels = commaParts.slice(0, 3)
    const a = parseFloat(commaParts[3])
    alpha = Number.isFinite(a) ? a : 1
  } else if (commaParts.length === 3) {
    channels = commaParts
  } else {
    // 现代空格语法 rgb(10 20 30 / 0.5) 已经过 hasSlash 分支；兜底按空白切
    channels = inner.split(/[\s]+/).map((part) => part.trim()).filter((part) => part !== '')
  }
  if (channels.length < 3) return null
  const toChannel = (part: string): number | null => {
    if (part.endsWith('%')) {
      const pct = parseFloat(part)
      return Number.isFinite(pct) ? Math.round((pct / 100) * 255) : null
    }
    return clamp255(parseFloat(part))
  }
  const r = toChannel(channels[0])
  const g = toChannel(channels[1])
  const b = toChannel(channels[2])
  // alpha=0 的颜色视为无法给出有效亮度（完全透明没有底色意义）
  if (r === null || g === null || b === null || alpha === 0) return null
  return { r, g, b }
}

// ---- Rec.709 相对亮度 ----

/** sRGB 通道线性化（Rec.709）。 */
function linearChannel(c8: number): number {
  const c = c8 / 255
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
}

/**
 * Rec.709 相对亮度（0..1）：0.2126 R + 0.7152 G + 0.0722 B。
 * 供「背景亮度 → 文字深浅」判定：亮度 ≥ 0.5 视为浅底（用深字），否则深底（用浅字）。
 */
export function relativeLuminance(rgb: RgbTriple): number {
  return 0.2126 * linearChannel(rgb.r) + 0.7152 * linearChannel(rgb.g) + 0.0722 * linearChannel(rgb.b)
}

// ---- 从 mode/value 提取可解析颜色 ----

/** 依出现顺序抽取 CSS 渐变里的可解析颜色（#hex 与 rgb/rgba）。 */
export function parseGradientColors(value: string): RgbTriple[] {
  const colors: RgbTriple[] = []
  const pattern = /#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)/g
  let match: RegExpExecArray | null
  while ((match = pattern.exec(value)) !== null) {
    const parsed = parseCssColor(match[0])
    if (parsed !== null) colors.push(parsed)
  }
  return colors
}

/**
 * 从 mode/value 推出背景亮度（0..1）。
 * - color → 该色亮度；
 * - gradient → 前两个可解析色阶亮度的均值（解析失败按 media 处理 → null）；
 * - image/video/off 或解析不出 → null（未知，调用方按 media 处理）。
 */
export function backgroundLuminance(mode: string, value: string): number | null {
  if (mode === 'color') {
    const color = parseCssColor(value)
    return color === null ? null : relativeLuminance(color)
  }
  if (mode === 'gradient') {
    const stops = parseGradientColors(value)
    if (stops.length === 0) return null
    const sample = stops.slice(0, 2)
    const total = sample.reduce((sum, stop) => sum + relativeLuminance(stop), 0)
    return total / sample.length
  }
  return null
}

/**
 * 解析文字方案偏好为具体 'light'（浅字）| 'dark'（深字）。
 * - 手动 light/dark 直接生效；
 * - auto：能推出背景亮度则按阈值（≥0.5 → 深字），推不出（image/video/off/
 *   解析失败）按媒体处理 → 默认浅字（light）；
 * - off：返回 null（无需文字方案）。
 */
export function resolveTextScheme(
  mode: string,
  value: string,
  preference: BgTextScheme | undefined,
): 'light' | 'dark' | null {
  if (mode === 'off') return null
  if (preference === 'light' || preference === 'dark') return preference
  const luminance = backgroundLuminance(mode, value)
  if (luminance === null) return 'light'
  return luminance >= 0.5 ? 'dark' : 'light'
}

// ---- 表面/文字调色板 ----

/** 全屏透出 token：把挡住视口的面（frame + sidebar）置透明（查实依据见文件头）。 */
export const REVEAL_TOKENS: Record<string, string> = {
  '--dsw-alias-bg-base': 'transparent',
  '--dsw-specific-sidebar-fill': 'transparent',
}

/** 浅字方案：文字浅色 + 深色半透明表面（暗背景/未知背景媒体默认）。 */
const LIGHT_TEXT_TOKENS: Record<string, string> = {
  '--dsw-alias-label-primary': '#f2f4f8',
  '--dsw-alias-label-secondary': '#c6cdd8',
  '--dsw-alias-label-tertiary': '#98a2b3',
  '--dsw-alias-bg-layer-1': 'rgb(10 13 18 / 0.86)',
  '--dsw-alias-bg-layer-2': 'rgb(23 28 36 / 0.9)',
  '--dsw-alias-bg-layer-3': 'rgb(31 37 46 / 0.92)',
  '--dsw-alias-bg-overlay': 'rgb(20 25 32 / 0.93)',
  '--dsw-alias-border-l1': 'rgba(255,255,255,0.08)',
  '--dsw-alias-border-l2': 'rgba(255,255,255,0.16)',
  '--dsw-alias-border-l3': 'rgba(255,255,255,0.22)',
  '--dsw-alias-border-l4': 'rgba(255,255,255,0.28)',
  '--dsw-specific-bubble': 'rgb(13 17 23 / 0.84)',
  '--dsw-specific-bubble-highlight': 'rgb(31 39 51 / 0.9)',
  '--dsw-specific-input-major': 'rgb(6 9 13 / 0.92)',
  '--dsw-specific-menu': 'rgb(24 30 38 / 0.94)',
  '--dsw-specific-selector': 'rgb(255 255 255 / 0.09)',
  '--dsw-alias-markdown-code-block': 'rgb(7 10 15 / 0.9)',
  '--dsw-alias-markdown-code-block-banner': 'rgb(21 26 33 / 0.94)',
  '--dsw-alias-markdown-inline-code': 'rgba(255,255,255,0.12)',
  '--dsw-specific-sidebar-nav-item-active': 'rgba(255,255,255,0.14)',
  '--dsw-specific-sidebar-nav-item-hover': 'rgba(255,255,255,0.08)',
}

/** 深字方案：文字深色 + 浅色半透明表面（浅色背景）。 */
const DARK_TEXT_TOKENS: Record<string, string> = {
  '--dsw-alias-label-primary': '#1a1d24',
  '--dsw-alias-label-secondary': '#4c515b',
  '--dsw-alias-label-tertiary': '#6d7480',
  '--dsw-alias-bg-layer-1': 'rgb(250 251 253 / 0.9)',
  '--dsw-alias-bg-layer-2': 'rgb(255 255 255 / 0.86)',
  '--dsw-alias-bg-layer-3': 'rgb(255 255 255 / 0.82)',
  '--dsw-alias-bg-overlay': 'rgb(250 251 253 / 0.95)',
  '--dsw-alias-border-l1': 'rgba(0,0,0,0.06)',
  '--dsw-alias-border-l2': 'rgba(0,0,0,0.1)',
  '--dsw-alias-border-l3': 'rgba(0,0,0,0.14)',
  '--dsw-alias-border-l4': 'rgba(0,0,0,0.18)',
  '--dsw-specific-bubble': 'rgb(250 251 253 / 0.92)',
  '--dsw-specific-bubble-highlight': 'rgb(240 244 252 / 0.94)',
  '--dsw-specific-input-major': 'rgb(255 255 255 / 0.9)',
  '--dsw-specific-menu': 'rgb(255 255 255 / 0.92)',
  '--dsw-specific-selector': 'rgba(0,0,0,0.06)',
  '--dsw-alias-markdown-code-block': 'rgb(248 250 253 / 0.9)',
  '--dsw-alias-markdown-code-block-banner': 'rgb(255 255 255 / 0.94)',
  '--dsw-alias-markdown-inline-code': 'rgba(0,0,0,0.07)',
  '--dsw-specific-sidebar-nav-item-active': 'rgba(0,0,0,0.08)',
  '--dsw-specific-sidebar-nav-item-hover': 'rgba(0,0,0,0.05)',
}

/**
 * 具体方案的全部 token 覆盖（含全屏透出 token）。键名覆盖 REVEAL_TOKENS 之外的
 * 调色板；返回对象可直接序列化进 body{--x: v !important} 规则。
 */
export function tokensForTextScheme(scheme: 'light' | 'dark'): Record<string, string> {
  return { ...REVEAL_TOKENS, ...(scheme === 'light' ? LIGHT_TEXT_TOKENS : DARK_TEXT_TOKENS) }
}

// ---- fit → 渲染 CSS（image 用 background-*；video 用 object-fit） ----

export interface FitCss {
  backgroundSize: string
  backgroundPosition: string
  backgroundRepeat: string
  objectFit: string
  objectPosition: string
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
export function fitCssFor(fit: string, mode: string): FitCss {
  switch (fit) {
    case 'fill':
      return { backgroundSize: '100% 100%', backgroundPosition: 'center', backgroundRepeat: 'no-repeat', objectFit: 'fill', objectPosition: 'center' }
    case 'contain':
      return { backgroundSize: 'contain', backgroundPosition: 'center', backgroundRepeat: 'no-repeat', objectFit: 'contain', objectPosition: 'center' }
    case 'center':
      return { backgroundSize: 'auto', backgroundPosition: 'center', backgroundRepeat: 'no-repeat', objectFit: 'none', objectPosition: 'center' }
    case 'tile':
      return { backgroundSize: 'auto', backgroundPosition: 'left top', backgroundRepeat: 'repeat', objectFit: mode === 'video' ? 'cover' : 'none', objectPosition: mode === 'video' ? 'center' : 'left top' }
    case 'cover':
    default:
      return { backgroundSize: 'cover', backgroundPosition: 'center', backgroundRepeat: 'no-repeat', objectFit: 'cover', objectPosition: 'center' }
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
export function focusPositionCss(posX: number | undefined, posY: number | undefined): string {
  const clampPct = (raw: number | undefined, fallback: number): number => {
    if (typeof raw !== 'number' || !Number.isFinite(raw)) return fallback
    return Math.min(100, Math.max(0, raw))
  }
  return `${clampPct(posX, 50)}% ${clampPct(posY, 50)}%`
}

export type { BgMode, BgTextScheme }
