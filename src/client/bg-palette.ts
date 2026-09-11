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
import {
  BG_SCALE_DEFAULT,
  BG_SCALE_MAX,
  BG_SCALE_MIN,
  BG_ZOOM_DEFAULT,
  BG_ZOOM_MAX,
  BG_ZOOM_MIN,
} from '../bg-config.ts'

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
export const TOP_REGION_TOKENS: readonly string[] = [
  '--dsw-alias-bg-base',
  '--dsw-specific-sidebar-fill',
]

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
const LIGHT_TEXT_TOKENS: Record<string, string> = {
  // ---- 文字 ----
  '--dsw-alias-label-primary': '#f2f4f8',
  '--dsw-alias-label-primary-dimmed': '#e4e7ee',
  '--dsw-alias-label-primary-bluish': '#c9d8f6',
  '--dsw-alias-label-primary-foreground': '#0f1115',
  '--dsw-alias-label-primary-inverted': '#0f1115',
  '--dsw-alias-label-secondary': '#c6cdd8',
  '--dsw-alias-label-tertiary': '#98a2b3',
  '--dsw-alias-label-caption': '#8b95a3',
  '--dsw-alias-label-dimmed': '#767e8a',
  // ---- 页面/面板表面 ----
  // v0.4.4：承载文字的"内容面"透明度一律 ≥0.95 —— 半透明面板会把壁纸透上来
  // （深色壁纸 + 深字方案时面板变暗 → 深字看不见），所以只留一点点玻璃感。
  '--dsw-alias-bg-layer-1': 'rgb(10 13 18 / 0.96)',
  '--dsw-alias-bg-layer-2': 'rgb(23 28 36 / 0.96)',
  '--dsw-alias-bg-layer-3': 'rgb(31 37 46 / 0.97)',
  '--dsw-alias-bg-overlay': 'rgb(20 25 32 / 0.97)',
  '--dsw-alias-bg-module-platform': 'rgb(24 29 37 / 0.96)',
  '--dsw-alias-bg-multi-select': 'rgba(255,255,255,0.16)',
  // 遮罩压暗：暗底场景用纯黑薄纱（浅色 24% 黑会把整屏压灰、和壁纸打架）
  '--dsw-alias-bg-mask-1': 'rgba(0,0,0,0.28)',
  '--dsw-alias-bg-mask-2': 'rgba(0,0,0,0.14)',
  '--dsw-alias-bg-mask-3': 'rgba(0,0,0,0.45)',
  '--dsw-alias-bg-mask-photo': 'rgba(0,0,0,0.78)',
  '--dsw-alias-bg-mask-drop': 'rgba(0,0,0,0.55)',
  '--dsw-alias-bg-skeleton': 'rgba(255,255,255,0.08)',
  // ---- 边框 ----
  '--dsw-alias-border-l1': 'rgba(255,255,255,0.08)',
  '--dsw-alias-border-l2': 'rgba(255,255,255,0.16)',
  '--dsw-alias-border-l3': 'rgba(255,255,255,0.22)',
  '--dsw-alias-border-l4': 'rgba(255,255,255,0.28)',
  '--dsw-alias-border-inverted': 'rgba(255,255,255,0.10)',
  '--dsw-alias-border-inverted2': 'rgba(255,255,255,0.14)',
  // ---- 品牌 ----
  '--dsw-alias-brand-primary': '#f2f4f8',
  '--dsw-alias-brand-primary-invert': '#0f1115',
  '--dsw-alias-brand-text': '#f2f4f8',
  // ---- 按钮（滚动到底部箭头 / 新会话 / 设置弹窗控件命中的一族）----
  '--dsw-alias-button-elevated-fill': 'rgb(32 38 47 / 0.95)',
  '--dsw-alias-button-floating-fill': 'rgb(26 31 39 / 0.96)',
  '--dsw-alias-button-floating-hover': 'rgb(45 53 64 / 0.97)',
  '--dsw-alias-button-contrast-fill': '#e9ecf2',
  '--dsw-alias-button-ghost-active-fill': 'rgba(255,255,255,0.18)',
  '--dsw-alias-button-ghost-active-hover': 'rgba(255,255,255,0.26)',
  '--dsw-alias-button-ghost-active-border': 'rgba(255,255,255,0.4)',
  '--dsw-alias-button-primary-dimmed': 'rgba(255,255,255,0.16)',
  // ---- 交互态 ----
  '--dsw-alias-interactive-bg-hover': 'rgba(255,255,255,0.10)',
  '--dsw-alias-interactive-bg-hover-accent': 'rgba(255,255,255,0.22)',
  '--dsw-alias-interactive-bg-hover-solid': 'rgb(52 60 72 / 0.95)',
  '--dsw-alias-interactive-bg-active': 'rgba(255,255,255,0.16)',
  '--dsw-alias-interactive-bg-hover-danger': 'rgba(242,90,90,0.18)',
  // ---- 业务表面 ----
  '--dsw-specific-bubble': 'rgb(13 17 23 / 0.96)',
  '--dsw-specific-bubble-highlight': 'rgb(40 52 70 / 0.97)',
  '--dsw-specific-input-major': 'rgb(6 9 13 / 0.97)',
  '--dsw-specific-menu': 'rgb(24 30 38 / 0.97)',
  '--dsw-specific-selector': 'rgb(255 255 255 / 0.09)',
  '--dsw-specific-login-input': 'rgb(12 16 21 / 0.96)',
  '--dsw-specific-tip': 'rgb(30 36 45 / 0.97)',
  // 导航 selected/hover 是**淡色 tint**（薄薄一层），不是内容面：故意保持低 alpha，
  // 让文字对比度基本等于「文字 vs 面板」本身（对比度阈值为 4.5 而不是 7）。
  '--dsw-specific-sidebar-nav-item-active': 'rgba(255,255,255,0.12)',
  '--dsw-specific-sidebar-nav-item-hover': 'rgba(255,255,255,0.07)',
  '--dsw-specific-sidebar-nav-item-active-accent': 'rgba(86,134,254,0.32)',
  // ---- 代码/markdown ----
  '--dsw-alias-markdown-code-block': 'rgb(7 10 15 / 0.96)',
  '--dsw-alias-markdown-code-block-banner': 'rgb(21 26 33 / 0.97)',
  '--dsw-alias-markdown-inline-code': 'rgba(255,255,255,0.12)',
  '--dsw-alias-markdown-code-segment-selected': 'rgb(31 37 46 / 0.97)',
  '--dsw-alias-markdown-code-segment-unselected': 'rgb(15 19 25 / 0.96)',
  '--dsw-alias-markdown-citation': 'rgb(255 255 255 / 0.12)',
  '--dsw-alias-markdown-tag': 'rgba(255,255,255,0.10)',
  '--dsw-alias-markdown-placeholder': 'rgba(255,255,255,0.12)',
  // ---- 其它会“白底白字”的面 ----
  '--dsw-alias-toast-bg': 'rgb(45 53 64 / 0.96)',
  '--dsw-alias-tooltip-bg': 'rgb(40 47 57 / 0.97)',
  // ---- 滚动条 ----
  '--dsw-alias-scrollbar-bg-l1': 'rgba(255,255,255,0.20)',
  '--dsw-alias-scrollbar-bg-l2': 'rgba(255,255,255,0.24)',
  '--dsw-alias-scrollbar-hover-l1': 'rgba(255,255,255,0.34)',
  '--dsw-alias-scrollbar-hover-l2': 'rgba(255,255,255,0.38)',
}

/**
 * 深字方案：文字深色 + 浅色半透明表面（浅色背景）。值照 design-platform.css
 * 的 light 段解字面量，与浅字方案同键同刻度（只是明暗反转），保证两个方案可以
 * 互相对照维护。
 */
const DARK_TEXT_TOKENS: Record<string, string> = {
  // ---- 文字 ----
  '--dsw-alias-label-primary': '#1a1d24',
  '--dsw-alias-label-primary-dimmed': '#2b303a',
  '--dsw-alias-label-primary-bluish': '#1b3f80',
  '--dsw-alias-label-primary-foreground': '#f7f8fa',
  '--dsw-alias-label-primary-inverted': '#f7f8fa',
  '--dsw-alias-label-secondary': '#4c515b',
  '--dsw-alias-label-tertiary': '#646a75',
  '--dsw-alias-label-caption': '#6d747f',
  '--dsw-alias-label-dimmed': '#838a94',
  // ---- 页面/面板表面 ----
  // 同浅字方案：内容面透明度 ≥0.95（见上注）
  '--dsw-alias-bg-layer-1': 'rgb(250 251 253 / 0.96)',
  '--dsw-alias-bg-layer-2': 'rgb(255 255 255 / 0.96)',
  '--dsw-alias-bg-layer-3': 'rgb(255 255 255 / 0.96)',
  '--dsw-alias-bg-overlay': 'rgb(250 251 253 / 0.97)',
  '--dsw-alias-bg-module-platform': 'rgb(252 253 254 / 0.96)',
  '--dsw-alias-bg-multi-select': 'rgba(0,0,0,0.14)',
  '--dsw-alias-bg-mask-1': 'rgba(0,0,0,0.24)',
  '--dsw-alias-bg-mask-2': 'rgba(0,0,0,0.10)',
  '--dsw-alias-bg-mask-3': 'rgba(0,0,0,0.48)',
  '--dsw-alias-bg-mask-photo': 'rgba(0,0,0,0.88)',
  '--dsw-alias-bg-mask-drop': 'rgba(255,255,255,0.7)',
  '--dsw-alias-bg-skeleton': 'rgba(0,0,0,0.06)',
  // ---- 边框 ----
  '--dsw-alias-border-l1': 'rgba(0,0,0,0.06)',
  '--dsw-alias-border-l2': 'rgba(0,0,0,0.1)',
  '--dsw-alias-border-l3': 'rgba(0,0,0,0.14)',
  '--dsw-alias-border-l4': 'rgba(0,0,0,0.18)',
  '--dsw-alias-border-inverted': 'rgba(0,0,0,0.08)',
  '--dsw-alias-border-inverted2': 'rgba(0,0,0,0.12)',
  // ---- 品牌 ----
  '--dsw-alias-brand-primary': '#0f1115',
  '--dsw-alias-brand-primary-invert': '#f7f8fa',
  '--dsw-alias-brand-text': '#0f1115',
  // ---- 按钮 ----
  '--dsw-alias-button-elevated-fill': 'rgb(255 255 255 / 0.96)',
  '--dsw-alias-button-floating-fill': 'rgb(255 255 255 / 0.97)',
  '--dsw-alias-button-floating-hover': 'rgb(241 243 245 / 0.98)',
  '--dsw-alias-button-contrast-fill': '#43454a',
  '--dsw-alias-button-ghost-active-fill': 'rgba(15,17,21,0.10)',
  '--dsw-alias-button-ghost-active-hover': 'rgba(15,17,21,0.16)',
  '--dsw-alias-button-ghost-active-border': 'rgba(15,17,21,0.32)',
  '--dsw-alias-button-primary-dimmed': 'rgba(15,17,21,0.12)',
  // ---- 交互态 ----
  '--dsw-alias-interactive-bg-hover': 'rgba(15,17,21,0.06)',
  '--dsw-alias-interactive-bg-hover-accent': 'rgba(15,17,21,0.14)',
  '--dsw-alias-interactive-bg-hover-solid': 'rgb(233 236 242 / 0.95)',
  '--dsw-alias-interactive-bg-active': 'rgba(15,17,21,0.12)',
  '--dsw-alias-interactive-bg-hover-danger': 'rgba(236,19,19,0.08)',
  // ---- 业务表面 ----
  '--dsw-specific-bubble': 'rgb(250 251 253 / 0.96)',
  '--dsw-specific-bubble-highlight': 'rgb(228 237 253 / 0.97)',
  '--dsw-specific-input-major': 'rgb(255 255 255 / 0.97)',
  '--dsw-specific-menu': 'rgb(255 255 255 / 0.97)',
  '--dsw-specific-selector': 'rgba(0,0,0,0.06)',
  '--dsw-specific-login-input': 'rgb(255 255 255 / 0.96)',
  '--dsw-specific-tip': 'rgb(245 246 247 / 0.97)',
  // 淡色 tint（见浅字方案注）：对比度阈值按 4.5 核算
  '--dsw-specific-sidebar-nav-item-active': 'rgba(0,0,0,0.07)',
  '--dsw-specific-sidebar-nav-item-hover': 'rgba(0,0,0,0.04)',
  '--dsw-specific-sidebar-nav-item-active-accent': 'rgba(65,118,230,0.22)',
  // ---- 代码/markdown ----
  '--dsw-alias-markdown-code-block': 'rgb(248 250 253 / 0.96)',
  '--dsw-alias-markdown-code-block-banner': 'rgb(255 255 255 / 0.97)',
  '--dsw-alias-markdown-inline-code': 'rgba(0,0,0,0.07)',
  '--dsw-alias-markdown-code-segment-selected': 'rgb(255 255 255 / 0.97)',
  '--dsw-alias-markdown-code-segment-unselected': 'rgb(241 243 245 / 0.96)',
  '--dsw-alias-markdown-citation': 'rgba(0,0,0,0.08)',
  '--dsw-alias-markdown-tag': 'rgba(0,0,0,0.06)',
  '--dsw-alias-markdown-placeholder': 'rgba(0,0,0,0.08)',
  // ---- 其它面 ----
  '--dsw-alias-toast-bg': 'rgb(53 54 56 / 0.96)',
  '--dsw-alias-tooltip-bg': 'rgb(44 44 46 / 0.97)',
  // ---- 滚动条 ----
  '--dsw-alias-scrollbar-bg-l1': 'rgba(0,0,0,0.16)',
  '--dsw-alias-scrollbar-bg-l2': 'rgba(0,0,0,0.2)',
  '--dsw-alias-scrollbar-hover-l1': 'rgba(0,0,0,0.28)',
  '--dsw-alias-scrollbar-hover-l2': 'rgba(0,0,0,0.32)',
}

/**
 * 具体方案的全部 token 覆盖（含全屏透出 token）。键名覆盖 REVEAL_TOKENS 之外的
 * 调色板；返回对象可直接序列化进 body{--x: v !important} 规则。
 */
export function tokensForTextScheme(scheme: 'light' | 'dark'): Record<string, string> {
  return { ...REVEAL_TOKENS, ...(scheme === 'light' ? LIGHT_TEXT_TOKENS : DARK_TEXT_TOKENS) }
}

// ---- v0.4.4 (#2)：设置弹窗遮罩选择器 ----

/**
 * 遮罩/面型阴影只在 `body, body *` 上被主题**预替换成字面量**（见 ui-theme
 * `styles/gradient-shadow-text.css:26-35` 的注释），所以在 body 上覆盖
 * `--dsw-alias-bg-mask-*` / `--dsw-alias-border-l4` 对设置弹窗的遮罩
 * （`SettingsRoot.module.css` 的 `.mask` 读 --dsw-alias-bg-mask-1）与
 * `--dsw-elevation-*` 无效 —— 必须用同特异性的 `body *` 规则重写，才能让它
 * 按自己看到的描边色/遮罩色重新求值。键名 → 覆盖值，供 buildStyleText 输出。
 */
export const BODY_DESCENDANT_TOKEN_SELECTORS: readonly string[] = [
  '--dsw-alias-bg-mask-1',
  '--dsw-alias-bg-mask-2',
  '--dsw-alias-bg-mask-3',
  '--dsw-alias-bg-mask-photo',
  '--dsw-alias-bg-mask-drop',
]

/** 遮罩类 token 里需要以 `body *` 发出去的那些（值取自同一份调色板）。 */
export function maskTokensForTextScheme(scheme: 'light' | 'dark'): Record<string, string> {
  const all = scheme === 'light' ? LIGHT_TEXT_TOKENS : DARK_TEXT_TOKENS
  const out: Record<string, string> = {}
  for (const name of BODY_DESCENDANT_TOKEN_SELECTORS) {
    const value = all[name]
    if (typeof value === 'string') out[name] = value
  }
  return out
}

// ---- v0.6.0：毛玻璃质感（glass） ----

/**
 * 毛玻璃质感：把「承载文字的内容面」token 的透明度从 ~0.96 压到 ~0.55，配合
 * 下方 {@link GLASS_BACKDROP_FILTER} 的 backdrop-filter 让背景透过表面并模糊，
 * 呈现磨砂玻璃。只覆盖内容面（面板/气泡/输入/菜单/代码块/浮层），文字与边框
 * token 不动 —— 文字对比度仍由文字 token 与背后模糊后的背景共同保证。
 */
const GLASS_SURFACE_TOKENS_LIGHT: Record<string, string> = {
  '--dsw-alias-bg-layer-1': 'rgb(10 13 18 / 0.55)',
  '--dsw-alias-bg-layer-2': 'rgb(23 28 36 / 0.55)',
  '--dsw-alias-bg-layer-3': 'rgb(31 37 46 / 0.56)',
  '--dsw-alias-bg-overlay': 'rgb(20 25 32 / 0.58)',
  '--dsw-alias-bg-module-platform': 'rgb(24 29 37 / 0.55)',
  '--dsw-alias-button-elevated-fill': 'rgb(32 38 47 / 0.6)',
  '--dsw-alias-button-floating-fill': 'rgb(26 31 39 / 0.6)',
  '--dsw-alias-button-floating-hover': 'rgb(45 53 64 / 0.62)',
  '--dsw-alias-interactive-bg-hover-solid': 'rgb(52 60 72 / 0.6)',
  '--dsw-specific-bubble': 'rgb(13 17 23 / 0.55)',
  '--dsw-specific-bubble-highlight': 'rgb(40 52 70 / 0.6)',
  '--dsw-specific-input-major': 'rgb(6 9 13 / 0.55)',
  '--dsw-specific-menu': 'rgb(24 30 38 / 0.56)',
  '--dsw-specific-login-input': 'rgb(12 16 21 / 0.55)',
  '--dsw-specific-tip': 'rgb(30 36 45 / 0.56)',
  '--dsw-alias-markdown-code-block': 'rgb(7 10 15 / 0.55)',
  '--dsw-alias-markdown-code-block-banner': 'rgb(21 26 33 / 0.56)',
  '--dsw-alias-markdown-code-segment-selected': 'rgb(31 37 46 / 0.56)',
  '--dsw-alias-markdown-code-segment-unselected': 'rgb(15 19 25 / 0.55)',
  '--dsw-alias-toast-bg': 'rgb(45 53 64 / 0.6)',
  '--dsw-alias-tooltip-bg': 'rgb(40 47 57 / 0.6)',
}

const GLASS_SURFACE_TOKENS_DARK: Record<string, string> = {
  '--dsw-alias-bg-layer-1': 'rgb(250 251 253 / 0.55)',
  '--dsw-alias-bg-layer-2': 'rgb(255 255 255 / 0.55)',
  '--dsw-alias-bg-layer-3': 'rgb(255 255 255 / 0.55)',
  '--dsw-alias-bg-overlay': 'rgb(250 251 253 / 0.58)',
  '--dsw-alias-bg-module-platform': 'rgb(252 253 254 / 0.55)',
  '--dsw-alias-button-elevated-fill': 'rgb(255 255 255 / 0.6)',
  '--dsw-alias-button-floating-fill': 'rgb(255 255 255 / 0.6)',
  '--dsw-alias-button-floating-hover': 'rgb(241 243 245 / 0.62)',
  '--dsw-alias-interactive-bg-hover-solid': 'rgb(233 236 242 / 0.6)',
  '--dsw-specific-bubble': 'rgb(250 251 253 / 0.55)',
  '--dsw-specific-bubble-highlight': 'rgb(228 237 253 / 0.6)',
  '--dsw-specific-input-major': 'rgb(255 255 255 / 0.55)',
  '--dsw-specific-menu': 'rgb(255 255 255 / 0.56)',
  '--dsw-specific-login-input': 'rgb(255 255 255 / 0.55)',
  '--dsw-specific-tip': 'rgb(245 246 247 / 0.56)',
  '--dsw-alias-markdown-code-block': 'rgb(248 250 253 / 0.55)',
  '--dsw-alias-markdown-code-block-banner': 'rgb(255 255 255 / 0.56)',
  '--dsw-alias-markdown-code-segment-selected': 'rgb(255 255 255 / 0.56)',
  '--dsw-alias-markdown-code-segment-unselected': 'rgb(241 243 245 / 0.55)',
  '--dsw-alias-toast-bg': 'rgb(53 54 56 / 0.6)',
  '--dsw-alias-tooltip-bg': 'rgb(44 44 46 / 0.6)',
}

/** 毛玻璃质感下的内容面 token 覆盖（仅 surface 键；随 body[data-dsh-bg-glass] 输出）。 */
export function glassSurfaceTokensForTextScheme(scheme: 'light' | 'dark'): Record<string, string> {
  return scheme === 'light' ? GLASS_SURFACE_TOKENS_LIGHT : GLASS_SURFACE_TOKENS_DARK
}

/** 毛玻璃的 backdrop 滤镜（blur + 轻微饱和，经典磨砂玻璃）。 */
export const GLASS_BACKDROP_FILTER = 'blur(16px) saturate(1.2)'

/**
 * 需要真正「背后来模糊」的浮层表面选择器（CSS 模块类名哈希不稳定，故只列出
 * 有稳定 data/role 钩子的容器）：我们的抽屉、设置/弹窗、输入卡。其余内容面
 * （气泡/菜单等）只靠上面的表面 token 半透明获得"透出"玻璃感（不模糊）。
 */
export const GLASS_BACKDROP_SELECTOR =
  '[data-dsh-bg-drawer], div[role="dialog"][aria-modal="true"], [data-composer-card]'

// ---- v0.4.4 (#5)：设置面板里的背景预览取色 ----

export interface PreviewTheme {
  /** 预览里模拟 UI 的文字色（= 当前方案下 --dsw-alias-label-primary）。 */
  text: string
  /** 预览里模拟 UI 的次要文字色。 */
  secondary: string
  /** 预览里模拟 UI 的表面色（侧栏/气泡/输入条）。 */
  surface: string
  /** 预览里模拟 UI 的输入条底色。 */
  input: string
  /** 预览框自身的描边色。 */
  border: string
  /** 预览框自身的底色（mode=off 时铺满，说明用的是默认界面）。 */
  fallbackBg: string
}

/**
 * 预览用取色（#5）：直接复用上面两份**已经解成字面量**的调色板，保证「预览里
 * 看到的对比度」就是「应用后真实 UI 的对比度」——预览不会因为自己另写一套色而
 * 说谎。scheme 为 null（mode=off，未设背景）时预览底板用中性灰（说明此时用的是
 * 界面默认皮肤），模拟 UI 仍按浅字方案给色。
 */
export function previewThemeFor(scheme: 'light' | 'dark' | null): PreviewTheme {
  const all = scheme === 'dark' ? DARK_TEXT_TOKENS : LIGHT_TEXT_TOKENS
  return {
    text: all['--dsw-alias-label-primary'],
    secondary: all['--dsw-alias-label-secondary'],
    surface: all['--dsw-alias-bg-layer-2'],
    input: all['--dsw-specific-input-major'],
    border: all['--dsw-alias-border-l2'],
    fallbackBg: '#8b939e',
  }
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

// ---- v0.5.0：媒体渲染计划（真实全屏层与设置页预览画布**共用同一份计算**） ----

/** CSS 字面量转义（url("...") 内防逃逸）。真实层与预览画布共用。 */
export function cssEscape(value: string): string {
  return value.replace(/[\\"]/g, (ch) => `\\${ch}`)
}

/** 缩放/缩放系数钳制到 1..3（zoom；缺省 1），吸附 0.05 步长。 */
export function clampZoom(raw: number | undefined, fallback = BG_ZOOM_DEFAULT): number {
  const n = typeof raw === 'number' && Number.isFinite(raw) ? raw : fallback
  return Math.min(BG_ZOOM_MAX, Math.max(BG_ZOOM_MIN, Math.round(n * 20) / 20))
}

/** 媒体自由缩放钳制到 0.25..4（scale；缺省 1），吸附 0.05 步长。 */
export function clampScale(raw: number | undefined, fallback = BG_SCALE_DEFAULT): number {
  const n = typeof raw === 'number' && Number.isFinite(raw) ? raw : fallback
  return Math.min(BG_SCALE_MAX, Math.max(BG_SCALE_MIN, Math.round(n * 20) / 20))
}

/** 不透明度钳制到 0..1（缺省 1）。 */
export function clampOpacity(raw: number | undefined, fallback = 1): number {
  const n = typeof raw === 'number' && Number.isFinite(raw) ? raw : fallback
  return Math.min(1, Math.max(0, n))
}

/** 乘法结果定点回圆（避免 1.5*1.15 = 1.7249999… 这类尾巴进 CSS）。 */
function round2(n: number): number {
  return Math.round(n * 100) / 100
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
export function zoomBackgroundSize(baseSize: string, zoom: number): string {
  const z = clampZoom(zoom)
  if (z === BG_ZOOM_DEFAULT) return baseSize
  return baseSize
    .split(/\s+/)
    .filter((part) => part !== '')
    .map((part) => (/^[\d.]+%$/.test(part) ? `calc(${part} * ${z})` : part))
    .join(' ')
}

/** 媒体渲染计划（供重写引擎 CSS 文本与预览画布内联样式共用）。 */
export interface BgMediaRender {
  /** image：background-* 属性组（含 zoom 缩放后的 size）；不需要时为 null。 */
  image: {
    backgroundImage: string
    backgroundSize: string
    backgroundPosition: string
    backgroundRepeat: string
    /** 需要时输出的 transform（`scale(1.5)`）；null = 不输出（保持最小 CSS）。 */
    transform: string | null
    transformOrigin: string
  } | null
  /** video：object-* + transform；不需要时为 null。 */
  video: {
    objectFit: string
    objectPosition: string
    transform: string | null
    transformOrigin: string
  } | null
  /** 媒体不透明度（0..1）；1 = 默认，调用方不输出。 */
  opacity: number
}

export interface BgMediaRenderInput {
  mode: string
  /** 已解析的媒体地址（mediaKey 优先，其次 value）；null = 无源。 */
  src: string | null
  fit: string
  posX: number
  posY: number
  /** 放大聚焦 1..3（v0.5.0）。 */
  zoom: number
  /** 媒体自由缩放 0.25..4（v0.4.3 兼容字段）。 */
  scale: number
  /** 媒体不透明度 0..1。 */
  opacity: number
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
export function bgMediaRender(input: BgMediaRenderInput): BgMediaRender {
  const fit = fitCssFor(input.fit, input.mode)
  const position = focusPositionCss(input.posX, input.posY)
  const zoom = clampZoom(input.zoom)
  const scale = clampScale(input.scale)
  const opacity = clampOpacity(input.opacity)
  if (input.mode === 'image' && input.src !== null) {
    // fit=fill（100% 100%）→ zoom 可精确进 background-size，transform 只承载 scale
    const zoomInSize = input.fit === 'fill'
    const factor = round2((zoomInSize ? BG_ZOOM_DEFAULT : zoom) * scale)
    return {
      image: {
        backgroundImage: `url("${cssEscape(input.src)}")`,
        backgroundSize: zoomBackgroundSize(fit.backgroundSize, zoomInSize ? zoom : BG_ZOOM_DEFAULT),
        backgroundPosition: position,
        backgroundRepeat: fit.backgroundRepeat,
        transform: factor === BG_SCALE_DEFAULT ? null : `scale(${factor})`,
        transformOrigin: position,
      },
      video: null,
      opacity,
    }
  }
  if (input.mode === 'video' && input.src !== null) {
    const factor = round2(zoom * scale)
    return {
      image: null,
      video: {
        objectFit: fit.objectFit,
        objectPosition: position,
        transform: factor === BG_SCALE_DEFAULT ? null : `scale(${factor})`,
        transformOrigin: position,
      },
      opacity,
    }
  }
  return { image: null, video: null, opacity }
}

// ---- v0.5.0：<meta name="theme-color"> 同步（规格 E 的可做部分） ----

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
export function bgThemeColorFor(mode: string, value: string, resolvedText: 'light' | 'dark' | null): string | null {
  const rgbText = (rgb: RgbTriple): string => `rgb(${rgb.r} ${rgb.g} ${rgb.b})`
  if (mode === 'color') {
    const parsed = parseCssColor(value)
    return parsed === null ? null : rgbText(parsed)
  }
  if (mode === 'gradient') {
    const stops = parseGradientColors(value)
    if (stops.length === 0) return null
    const sample = stops.slice(0, 2)
    const avg: RgbTriple = {
      r: Math.round(sample.reduce((sum, c) => sum + c.r, 0) / sample.length),
      g: Math.round(sample.reduce((sum, c) => sum + c.g, 0) / sample.length),
      b: Math.round(sample.reduce((sum, c) => sum + c.b, 0) / sample.length),
    }
    return rgbText(avg)
  }
  if (mode === 'image' || mode === 'video') {
    // 浅字方案 = 深色底 → 深色窗口 chrome；深字方案 = 浅色底 → 浅色 chrome
    return resolvedText === 'dark' ? '#f7f8fa' : '#0f1115'
  }
  return null
}
