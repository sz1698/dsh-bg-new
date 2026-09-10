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

import { jsx } from 'react/jsx-runtime'
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import {
  DEFAULT_BG_CONFIG,
  BG_FITS,
  BG_TEXT_SCHEMES,
  type BgConfig,
  type BgFit,
  type BgTextScheme,
} from '../bg-config.ts'
import {
  fitCssFor,
  focusPositionCss,
  resolveTextScheme,
  tokensForTextScheme,
} from './bg-palette.ts'

// ---- 供验证/复用导出的纯工具（保持名字稳定） ----

export { parseCssColor, relativeLuminance, backgroundLuminance as bgLuminance, resolveTextScheme, fitCssFor, focusPositionCss, tokensForTextScheme, REVEAL_TOKENS } from './bg-palette.ts'
export { DEFAULT_BG_CONFIG as bgDefaultConfig, normalizeBgConfig as bgNormalizeConfig, BG_FITS, BG_TEXT_SCHEMES } from '../bg-config.ts'

// ---- 与服务无关的局部结构类型（不 import 官方包） ----

interface SettingsScopeLike {
  getSnapshot(): unknown
  subscribe(listener: () => void): () => void
  set(field: string, value: unknown): Promise<void> | void
  /**
   * 官方 SettingsScope 的原子写入口（v0.4.1：把一次变更的所有字段合并为
   * **单次 mutate** —— 减少多轮单字段往返带来的镜像/落盘竞态窗口）。
   * 旧/受限 scope 无该方法时回退逐字段 set。
   */
  mutate?(ops: ReadonlyArray<{ op: 'set'; path: readonly string[]; value: unknown }>): Promise<void> | void
}
interface SlotsLike {
  inject(name: string, register: () => unknown): unknown
  register(options: Record<string, unknown>, component: unknown): () => void
}
interface LocaleLike {
  register(ns: string, dict: Record<string, Record<string, string>>): unknown
  bind(ns: string): (key: string) => string
}
interface CtxLike {
  slots: SlotsLike
  settingsScope?: { bind(options: { namespace: string }): SettingsScopeLike }
  locale?: LocaleLike
  effect(fn: () => unknown): unknown
}

// ---- 预设皮肤（仅 color/gradient/off；v0.3 不加外部视频/图片预设） ----

interface Preset {
  mode: 'off' | 'color' | 'gradient'
  value: string
  key: string
}
const PRESETS: Preset[] = [
  { mode: 'off', value: '', key: 'default' },
  { mode: 'gradient', value: 'linear-gradient(135deg, #1e2a78, #2b1055)', key: 'deep' },
  { mode: 'gradient', value: 'linear-gradient(160deg, #0f2027, #203a43, #2c5364)', key: 'ocean' },
  { mode: 'color', value: '#0d1117', key: 'night' },
  { mode: 'color', value: '#f3f4f6', key: 'mist' },
  { mode: 'color', value: '#2b2d42', key: 'ink' },
]

const PRESET_LABELS_ZH: Record<string, string> = {
  default: '默认', deep: '深蓝紫', ocean: '深海', night: '极夜', mist: '晨雾', ink: '墨蓝',
}
const PRESET_LABELS_EN: Record<string, string> = {
  default: 'Default', deep: 'Deep purple', ocean: 'Ocean', night: 'Night', mist: 'Mist', ink: 'Ink blue',
}

// ---- 运行态（模块级快照 + 视频 UI 态） ----

/** 视频/应用运行态错误（面板红色错误行数据源；键见字典 errVideo* / errApply）。 */
interface BgStatus {
  /** 非空 = 字典键（zh/en 有对应文案）；空 = 无运行态错误。 */
  error: string
}

/** 面板/订阅共享的完整快照。 */
interface BgSnapshot {
  mode: string
  value: string
  fit: BgFit
  textScheme: BgTextScheme
  loop: boolean
  mediaKey: string
  /** 媒体不透明度 0..1（image/video 渲染；默认 1=不透明；gradient/color 不支持）。 */
  opacity: number
  /** 焦点水平定位 0..100（%）（image/video；默认 50=居中）。 */
  posX: number
  /** 焦点垂直定位 0..100（%）（image/video；默认 50=居中）。 */
  posY: number
  /** 视频音量 0..1（v0.4 持久化字段；默认 1=满音量）。 */
  volume: number
  /** auto 推断后的具体方案（'light'=浅字/深表面；off 时为 null）。 */
  resolvedText: 'light' | 'dark' | null
  /** 配置镜像（settings 只读字段回退内置默认）。 */
  cfg: BgConfig
  video: { paused: boolean; rate: number; loop: boolean; soundOn: boolean; currentTime: number; duration: number }
  /** 运行态错误（不参与渲染 key；只驱动面板错误行）。 */
  status: BgStatus
}

function defaultSnapshot(): BgSnapshot {
  return {
    mode: 'off',
    value: '',
    fit: DEFAULT_BG_CONFIG.defaultFit,
    textScheme: DEFAULT_BG_CONFIG.defaultTextScheme,
    loop: DEFAULT_BG_CONFIG.defaultLoop,
    mediaKey: '',
    opacity: 1,
    posX: 50,
    posY: 50,
    volume: 1,
    resolvedText: null,
    cfg: { ...DEFAULT_BG_CONFIG, imageExt: [...DEFAULT_BG_CONFIG.imageExt], videoExt: [...DEFAULT_BG_CONFIG.videoExt] },
    video: { paused: true, rate: 1, loop: DEFAULT_BG_CONFIG.defaultLoop, soundOn: false, currentTime: 0, duration: 0 },
    status: { error: '' },
  }
}

/** 视频时间轴的空态（离开视频 / 卸载时回写；与 defaultSnapshot.video 同步）。 */
function idleVideoUi() {
  return { paused: true, rate: 1, loop: DEFAULT_BG_CONFIG.defaultLoop, soundOn: false, currentTime: 0, duration: 0 }
}

let snapshot: BgSnapshot = defaultSnapshot()
let lastAppliedKey = ''
const listeners = new Set<() => void>()
/** 处于防抖窗口内/写入在途的字段 → 本地期望值（adopt 合并用，见 apply()）。 */
const pendingWrites = new Map<string, unknown>()
/** 持久化防抖毫秒数（v0.4.1：滑杆拖动只乐观 apply；静止 300ms 后**一次原子提交**全部待写字段）。 */
const DEBOUNCE_MS = 300
/** 全局单一防抖句柄（任何新写入都重置它，把一次操作的所有字段合并成最后一次 flush）。 */
let flushHandle: unknown = undefined
/** 真正的 flush 实现，由 apply() 注入（需要 scope / 镜像，见 apply() 内 runFlushNow）。 */
let runFlushImpl: (() => void) | null = null

function clearFlushTimer(): void {
  if (flushHandle !== undefined) {
    const g = globalThis as { clearTimeout?: (handle: unknown) => void }
    try { g.clearTimeout?.(flushHandle) } catch { /* noop */ }
    flushHandle = undefined
  }
}

/**
 * 调度一次（合并后的）防抖 flush：再次写入会取消上一次 → 拖动/连续变更只提交
 * 最后一次的完整字段集合。无计时器环境（测试注入缺失）→ 下个微任务立即执行。
 */
function scheduleFlushTimer(): void {
  clearFlushTimer()
  const run = (): void => {
    flushHandle = undefined
    runFlushImpl?.()
  }
  const g = globalThis as { setTimeout?: (cb: () => void, ms: number) => unknown }
  if (typeof g.setTimeout === 'function') {
    flushHandle = g.setTimeout(run, DEBOUNCE_MS)
  } else {
    queueMicrotask(run)
  }
}

function notify(): void {
  for (const l of listeners) l()
}
function subscribeStore(cb: () => void): () => void {
  listeners.add(cb)
  return () => listeners.delete(cb)
}
function getSnapshot(): BgSnapshot {
  return snapshot
}

/**
 * 被覆盖的"已应用签名"（避免无谓重写 DOM）。
 * v0.3.1：opacity/posX/posY 参与 key（它们改变渲染 CSS，变了必须重写；
 * status.error 不参与 —— 它只驱动面板错误行，与 DOM 渲染无关）。
 * v0.4：volume 不参与 key —— 它是 <video> 元素运行时属性而非 CSS，本地/镜像音量
 * 变化走 applyBgState 的 early-return 运行时同步（不重建 DOM）；sound 纯运行时态。
 */
function applyKey(s: BgSnapshot): string {
  return [s.mode, s.value, s.fit, s.textScheme, s.loop, s.mediaKey, s.opacity, s.posX, s.posY, s.resolvedText].join('\u0000')
}

// ---- 数值钳制（opacity/posX/posY；UI/工具/历史数据可能越界） ----

/** 钳制媒体不透明度到 0..1（缺省 1）。导出供验证。 */
export function clampBgOpacity(raw: number | undefined, fallback = 1): number {
  const n = typeof raw === 'number' && Number.isFinite(raw) ? raw : fallback
  return Math.min(1, Math.max(0, n))
}

/** 钳制焦点定位到 0..100（缺省 50）。导出供验证。 */
export function clampBgPos(raw: number | undefined, fallback = 50): number {
  const n = typeof raw === 'number' && Number.isFinite(raw) ? raw : fallback
  return Math.min(100, Math.max(0, n))
}

/** 钳制视频音量到 0..1（缺省 1）。导出供验证。 */
export function clampBgVolume(raw: number | undefined, fallback = 1): number {
  const n = typeof raw === 'number' && Number.isFinite(raw) ? raw : fallback
  return Math.min(1, Math.max(0, n))
}

/** 原始值等同判断（防抖/镜像合并用；均为 string/number/boolean）。 */
function sameValue(a: unknown, b: unknown): boolean {
  return a === b
}

// ---- 视频运行态错误（status.error） ----

/**
 * 视频错误码 → 字典键（可读文案见 dictionary errVideo*；键再经 text() 翻译）。
 * 1=中止 2=网络 3=解码失败(格式或损坏) 4=源不支持(链接不可直接播放/格式未允许)。
 */
export function videoErrorKeyForCode(code: number | null | undefined): string {
  switch (code) {
    case 1: return 'errVideoAborted'
    case 2: return 'errVideoNetwork'
    case 3: return 'errVideoDecode'
    case 4: return 'errVideoSrc'
    default: return 'errVideoLoad'
  }
}

/** 写运行态错误并通知（值不变时不重复通知）。 */
function setStatusError(key: string): void {
  if (snapshot.status.error === key) return
  snapshot = { ...snapshot, status: { error: key } }
  notify()
}

/** 清运行态错误并通知（已空时不重复通知）。 */
function clearStatusError(): void {
  if (snapshot.status.error === '') return
  snapshot = { ...snapshot, status: { error: '' } }
  notify()
}

/** 当前运行态错误（面板错误行数据源；导出供验证/复用）。 */
export function bgRuntimeStatus(): { error: string } {
  return { error: snapshot.status.error }
}

// ---- 自管 DOM（style + layer + video） ----

const STYLE_ID = 'dsh-bg-style'
const LAYER_TAG = 'div'
const LAYER_ATTR = 'data-dsh-bg-layer'
let styleEl: HTMLStyleElement | null = null
let layerEl: HTMLElement | null = null
let videoEl: HTMLVideoElement | null = null

/** CSS 字面量转义（url("...") 内防逃逸）。 */
function cssEscape(value: string): string {
  return value.replace(/[\\"]/g, (ch) => `\\${ch}`)
}

function ensureLayer(): void {
  if (typeof document === 'undefined') return
  if (layerEl === null || !layerEl.isConnected) {
    layerEl = document.createElement(LAYER_TAG)
    layerEl.setAttribute(LAYER_ATTR, '')
    document.body.append(layerEl)
  }
  if (styleEl === null || !styleEl.isConnected) {
    styleEl = document.createElement('style')
    styleEl.id = STYLE_ID
    const mount = document.head ?? document.body
    mount.append(styleEl)
  }
}

function removeLayer(): void {
  if (videoEl !== null) {
    videoEl = null
  }
  if (layerEl !== null) {
    layerEl.remove()
    layerEl = null
  }
  if (styleEl !== null) {
    styleEl.remove()
    styleEl = null
  }
}

/**
 * 渲染一份快照的完整 CSS 文本（集中管理）：body token 覆盖 + layer 几何 +
 * 媒体渲染 + video 适配。样式卸载即整体移除 → 原主题完整还原。
 */
function buildStyleText(s: BgSnapshot): string {
  const lines: string[] = []
  lines.push('/* dsh-bg-switch v0.4.2 */')
  // 1) 全屏透出 + 表面/文字 token（!important 盖过主题层与 body 变量）
  const tokenLines: string[] = []
  if (s.resolvedText !== null) {
    const tokens = tokensForTextScheme(s.resolvedText)
    for (const [name, value] of Object.entries(tokens)) {
      tokenLines.push(`  ${name}: ${value} !important;`)
    }
  }
  if (tokenLines.length > 0) {
    lines.push('body {')
    lines.push(...tokenLines)
    lines.push('}')
  }
  // 2) layer 几何
  lines.push(`[${LAYER_ATTR}] {`)
  lines.push('  position: fixed;')
  lines.push('  inset: 0;')
  lines.push('  z-index: -1;')
  lines.push('  pointer-events: none;')
  lines.push('  overflow: hidden;')
  lines.push('  margin: 0;')
  lines.push('  padding: 0;')
  lines.push('  background-origin: border-box;')
  lines.push('}')
  // 3) 媒体渲染（color/gradient/image 经 layer background；video 经子元素）
  if (s.mode === 'video') {
    if (s.value !== '' || s.mediaKey !== '') {
      lines.push(`[${LAYER_ATTR}] video {`)
      lines.push('  width: 100%;')
      lines.push('  height: 100%;')
      lines.push('  display: block;')
      const fit = fitCssFor(s.fit, s.mode)
      lines.push(`  object-fit: ${fit.objectFit};`)
      // v0.3.1：焦点定位（posX/posY 百分比）覆盖 fit 的静态位置
      lines.push(`  object-position: ${focusPositionCss(s.posX, s.posY)};`)
      lines.push('}')
    }
  } else if (s.mode === 'image') {
    // v0.4：资源解析统一 bgMediaSrc（mediaKey 优先，其次 value 直接当 URL）
    const imgSrc = bgMediaSrc(s)
    if (imgSrc !== null) {
      const fit = fitCssFor(s.fit, s.mode)
      lines.push(`[${LAYER_ATTR}] {`)
      lines.push(`  background-image: url("${cssEscape(imgSrc)}");`)
      lines.push(`  background-size: ${fit.backgroundSize};`)
      // v0.3.1：焦点定位（posX/posY 百分比）覆盖 fit 的静态位置
      lines.push(`  background-position: ${focusPositionCss(s.posX, s.posY)};`)
      lines.push(`  background-repeat: ${fit.backgroundRepeat};`)
      lines.push('}')
    }
  } else if (s.mode === 'gradient' && s.value !== '') {
    const fit = fitCssFor('cover', s.mode)
    lines.push(`[${LAYER_ATTR}] {`)
    lines.push(`  background: ${s.value} no-repeat center/${fit.backgroundSize};`)
    lines.push('}')
  } else if (s.mode === 'color' && s.value !== '') {
    lines.push(`[${LAYER_ATTR}] {`)
    lines.push(`  background: ${s.value} no-repeat center/cover;`)
    lines.push('}')
  }
  // 4) 媒体层不透明度（v0.3.1：仅 image/video；layer 元素 opacity 同时作用于
  //    video 子元素。gradient/color 是纯色表面，不透明度没意义，不输出。
  //    缺省 1 时不输出（保持默认外观、CSS 最少变化）。
  if ((s.mode === 'image' || s.mode === 'video') && s.opacity < 1) {
    lines.push(`[${LAYER_ATTR}] {`)
    lines.push(`  opacity: ${clampBgOpacity(s.opacity)};`)
    lines.push('}')
  }
  return lines.join('\n')
}

/**
 * 媒体资源统一解析（v0.4）：mediaKey 非空 → host 伺服 URL /dsh-bg-media/<key>
 * （上传/登记的本地媒体，value 为空）；否则 value 直接当 URL（http/https/data:）。
 * 返回 null 表示没有可渲染源。
 */
function bgMediaSrc(s: BgSnapshot): string | null {
  if (s.mediaKey !== '') return `/dsh-bg-media/${encodeURIComponent(s.mediaKey)}`
  if (s.value !== '') return s.value
  return null
}

/** 计算 video 的 <video src>；返回 null 表示无法解析（仅 http(s) 与 mediaKey）。 */
function videoSrcOf(s: BgSnapshot): string | null {
  if (s.mediaKey !== '') return `/dsh-bg-media/${encodeURIComponent(s.mediaKey)}`
  if (/^https?:\/\//i.test(s.value)) return s.value
  return null
}

function syncVideoUiFromElement(): void {
  if (videoEl === null) return
  // v0.4：soundOn 是运行时态（不随元素事件同步），spread 保留
  // v0.4.1：同步时间轴字段（进度条数据源）：currentTime 实时、duration 元数据
  // 就绪后才有；NaN/Infinity 归一为 0（元素无元数据或源失败时防 UI 污染）。
  const duration = typeof videoEl.duration === 'number' && Number.isFinite(videoEl.duration) ? videoEl.duration : 0
  const currentTime = typeof videoEl.currentTime === 'number' && Number.isFinite(videoEl.currentTime)
    ? Math.min(Math.max(videoEl.currentTime, 0), duration > 0 ? duration : videoEl.currentTime)
    : 0
  snapshot = {
    ...snapshot,
    video: { ...snapshot.video, paused: videoEl.paused, rate: videoEl.playbackRate, loop: videoEl.loop, currentTime, duration },
  }
}

function attachVideoEvents(): void {
  if (videoEl === null) return
  const onState = (): void => { syncVideoUiFromElement(); notify() }
  videoEl.addEventListener('play', onState)
  videoEl.addEventListener('pause', onState)
  videoEl.addEventListener('ratechange', onState)
  videoEl.addEventListener('emptied', onState)
  // v0.4.1：时间轴（进度条数据源）—— timeupdate 实时推进、durationchange /
  // loadedmetadata 在元数据就绪后刷新总时长（换源后元素会先被 load() 清空）
  videoEl.addEventListener('timeupdate', onState)
  videoEl.addEventListener('durationchange', onState)
  videoEl.addEventListener('loadedmetadata', onState)
  videoEl.addEventListener('seeked', onState)
  // v0.3.1：错误/缓冲事件不再静默 —— 写进 snapshot.status（面板红色行）
  videoEl.addEventListener('error', () => {
    // 源加载失败：把 videoEl.error.code 映射成可读字典键
    setStatusError(videoErrorKeyForCode(videoEl?.error?.code))
  })
  videoEl.addEventListener('stalled', () => {
    // 网络无进展（等待数据）→ 提示；恢复后由 suspend/playing/canplay 清掉
    setStatusError('errVideoStalled')
  })
  videoEl.addEventListener('suspend', () => {
    // 下载暂停（缓冲充足/网络空闲）：只清“等待数据”类提示，不动硬错误
    if (snapshot.status.error === 'errVideoStalled') clearStatusError()
  })
  videoEl.addEventListener('playing', () => {
    // 真正开始播放 → 任何运行态错误都解除
    clearStatusError()
  })
  videoEl.addEventListener('canplay', () => {
    // 已可播放 → 加载类错误解除；自动播放被拒的提示保留到真正开始播放，
    // 避免“请点击播放”一闪而过（autoplay 拒绝时元素停在 paused 且数据就绪）
    const err = snapshot.status.error
    if (err !== '' && err !== 'errVideoAutoplay') clearStatusError()
  })
}

/** 建立（或更新）layer 里的 <video> 子元素；返回它。 */
function buildVideo(s: BgSnapshot): HTMLVideoElement | null {
  if (typeof document === 'undefined') return null
  const src = videoSrcOf(s)
  if (src === null) return null
  const created = videoEl === null || !videoEl.isConnected
  if (created) {
    videoEl = document.createElement('video')
    videoEl.setAttribute('data-dsh-bg-video', '')
    // v0.4：新元素初始 muted=true —— 保证无手势自动播放；要声音须用户点
    // 「声音」开关（=手势）→ muted=false + resume play()（见 bgVideoSetSound）
    videoEl.muted = true
    videoEl.autoplay = true
    videoEl.playsInline = true
    attachVideoEvents()
    // v0.4.1：新元素先把时间轴快照归零（时长元数据未就绪时 duration=0，
    // 避免旧背景的进度/时长残留在新视频的进度条上）
    syncVideoUiFromElement()
  }
  videoEl.loop = s.loop
  // v0.4：音量（0..1）直接写元素属性；静音推导 muted = !soundOn（持续存在的
  // 元素尊重用户声音开关；新元素保持初始 muted=true 以便自动播放）
  videoEl.volume = clampBgVolume(s.volume)
  if (!created) videoEl.muted = !(s.video?.soundOn ?? false)
  if (videoEl.getAttribute('src') !== src) {
    videoEl.removeAttribute('src')
    // 先移除后设 src，强制重新加载（同一元素换源时避免缓存旧画面）
    videoEl.setAttribute('src', src)
    videoEl.load()
  }
  if (layerEl !== null && videoEl.parentElement !== layerEl) {
    layerEl.append(videoEl)
  }
  // muted autoplay 允许无手势播放；play() 被拒不再静默：
  // NotAllowedError（自动播放策略）→ 提示点击播放；AbortError（换源竞态）忽略；
  // 其余拒绝 → 通用加载失败提示。成功路径由 'playing' 事件清 status。
  const playPromise = videoEl.play()
  if (playPromise !== undefined && typeof playPromise.then === 'function') {
    playPromise.catch((reason: unknown) => {
      const name = (reason && typeof reason === 'object' && 'name' in reason)
        ? String((reason as { name?: unknown }).name)
        : ''
      if (name === 'AbortError') return
      if (name === 'NotAllowedError') {
        setStatusError('errVideoAutoplay')
      } else {
        setStatusError('errVideoLoad')
      }
    })
  }
  return videoEl
}

/** 两份配置镜像浅比较（数组按 join 比较）。 */
function cfgSame(a: BgConfig, b: BgConfig): boolean {
  return a.maxImageMB === b.maxImageMB && a.maxVideoMB === b.maxVideoMB
    && a.imageExt.join(',') === b.imageExt.join(',') && a.videoExt.join(',') === b.videoExt.join(',')
    && a.defaultFit === b.defaultFit && a.defaultTextScheme === b.defaultTextScheme && a.defaultLoop === b.defaultLoop
}

/** 单一应用入口：把整份快照落到界面（style + layer + video + token）。 */
export function applyBgState(doc: Partial<BgSnapshot> & { mode: string }): void {
  const prevCfg = snapshot.cfg
  const prevVolume = snapshot.volume
  const next = {
    ...snapshot,
    ...doc,
    cfg: doc.cfg ?? snapshot.cfg,
  }
  // v0.3.1：媒体数值钳制（opacity 0..1；posX/posY 0..100）+ v0.4 volume 0..1——
  // UI/工具/历史 settings 里的越界值在此归一，保证渲染只看到合法数字。
  next.opacity = clampBgOpacity(doc.opacity !== undefined ? doc.opacity : snapshot.opacity)
  next.posX = clampBgPos(doc.posX !== undefined ? doc.posX : snapshot.posX)
  next.posY = clampBgPos(doc.posY !== undefined ? doc.posY : snapshot.posY)
  next.volume = clampBgVolume(doc.volume !== undefined ? doc.volume : snapshot.volume)
  next.resolvedText = resolveTextScheme(next.mode, next.value, next.textScheme)
  if (doc.video !== undefined) next.video = { ...doc.video }
  snapshot = next
  const key = applyKey(snapshot)
  const cfgChanged = doc.cfg !== undefined && !cfgSame(doc.cfg, prevCfg)
  const volumeChanged = doc.volume !== undefined && next.volume !== prevVolume
  if (typeof document === 'undefined') {
    // 纯 headless（node 冒烟）：只更新状态快照，不动 DOM
    if (key !== lastAppliedKey || cfgChanged) {
      lastAppliedKey = key
      notify()
    }
    return
  }
  if (key === lastAppliedKey) {
    // v0.4：视觉签名未变也可能有「非 CSS」变化需要落地：
    // - volume：音量是 <video> 元素属性而非 CSS —— 直接运行时写入，不重建 DOM
    // - cfg 变化：面板限制/默认要刷新（与 DOM 渲染无关）
    if (volumeChanged && videoEl !== null) videoEl.volume = next.volume
    if (cfgChanged || volumeChanged) notify()
    return
  }
  lastAppliedKey = key

  // 进入真正的渲染分支：先清掉旧运行态错误（上一视频源的报错不残留到新背景；
  // 新源若失败会由 error 事件 / play() 拒绝在异步阶段重新写回 status）。
  if (snapshot.status.error !== '') {
    snapshot = { ...snapshot, status: { error: '' } }
  }

  // v0.4：image 的"有源"判定改为 bgMediaSrc（value 或 mediaKey 任一即可）
  const isInactive = snapshot.mode === 'off'
    || (snapshot.mode === 'video' && videoSrcOf(snapshot) === null)
    || (snapshot.mode === 'image' && bgMediaSrc(snapshot) === null)
    || ((snapshot.mode === 'gradient' || snapshot.mode === 'color') && snapshot.value === '')
  if (isInactive) {
    // off/无源：移除全部自管外观（style/layer/video）→ 主题原样
    removeLayer()
    notify()
    return
  }
  // v0.3.1：即时应用包不再让异常静默 —— 任何 DOM/渲染异常都落进 status.error
  // （面板红色错误行展示），并保持此前已建立的 DOM 不回滚（页面不至于被
  // 半应用状态弄坏）。
  try {
    ensureLayer()
    if (layerEl === null || styleEl === null) {
      notify()
      return
    }
    // video 子元素在写 style 前建好（style 里引用 #layer video）
    if (snapshot.mode === 'video') {
      if (videoEl !== null && videoEl.parentElement !== null && videoEl.parentElement !== layerEl) {
        videoEl.remove()
        videoEl = null
      }
      buildVideo(snapshot)
    } else if (videoEl !== null) {
      videoEl.remove()
      videoEl = null
      // v0.4：离开视频时清运行时声音态（重进时新元素初始 muted=true 自动播放）
      // v0.4.1：一并清时间轴（进度条归零、总时长复位）
      snapshot = { ...snapshot, video: idleVideoUi() }
    }
    styleEl.textContent = buildStyleText(snapshot)
  } catch {
    snapshot = { ...snapshot, status: { error: 'errApply' } }
  }
  notify()
}

/** 兼容入口：applyBg(mode, value, opts?)。 */
export function applyBg(mode: string, value: string, opts?: Partial<Pick<BgSnapshot, 'fit' | 'textScheme' | 'loop' | 'mediaKey' | 'opacity' | 'posX' | 'posY' | 'volume'>>): void {
  applyBgState({ mode, value, ...opts } as BgSnapshot)
}

/** 卸载/停用时的完整恢复（移除 style + layer + 视频，状态回 off）。 */
export function restoreBg(): void {
  if (typeof document !== 'undefined') removeLayer()
  pendingWrites.clear()
  clearFlushTimer()
  snapshot = { ...defaultSnapshot(), video: idleVideoUi() }
  lastAppliedKey = applyKey(snapshot)
  notify()
}

// ---- 视频运行时控制（作用于当前全屏 <video>） ----

/** 播放/暂停切换；无 <video> 时返回 'none'。 */
export function bgVideoToggle(): 'playing' | 'paused' | 'none' {
  if (videoEl === null) return 'none'
  if (videoEl.paused) {
    const p = videoEl.play()
    if (p !== undefined) p.catch(() => {})
    return 'playing'
  }
  videoEl.pause()
  return 'paused'
}

/** 停止（v0.4 语义）：暂停并停在当前帧 —— 不再回卷 currentTime=0。 */
export function bgVideoStop(): void {
  if (videoEl === null) return
  videoEl.pause()
  syncVideoUiFromElement()
  notify()
}

/**
 * 进度条 seek（v0.4.1）：把播放头移动到 0..duration 的某秒（clamp；未就绪/无
 * 元数据时返回当前值）。停止态下 seek 只移动播放头不恢复播放。
 * @returns 实际落到的秒数。
 */
export function bgVideoSeek(seconds: number): number {
  if (videoEl === null) return 0
  const duration = typeof videoEl.duration === 'number' && Number.isFinite(videoEl.duration) ? videoEl.duration : 0
  if (!(duration > 0)) return 0
  const target = Math.min(Math.max(Number.isFinite(seconds) ? seconds : 0, 0), duration)
  if (typeof videoEl.currentTime === 'number') {
    try {
      videoEl.currentTime = target
    } catch {
      /* 源未就绪时某些实现抛错 —— 忽略，保持原位 */
    }
  }
  syncVideoUiFromElement()
  notify()
  return target
}

/** 设置倍速（clamp 0.5–2）。 */
export function bgVideoSetRate(rate: number): number {
  const clamped = Math.max(0.5, Math.min(2, Number.isFinite(rate) ? rate : 1))
  if (videoEl !== null) {
    videoEl.playbackRate = clamped
    syncVideoUiFromElement()
    notify()
  }
  return clamped
}

/** 设置循环（运行时 + 元素属性）。 */
export function bgVideoSetLoop(loop: boolean): boolean {
  const value = !!loop
  if (videoEl !== null) {
    videoEl.loop = value
    syncVideoUiFromElement()
  }
  snapshot = { ...snapshot, loop: value, video: { ...snapshot.video, loop: value } }
  notify()
  return value
}

/**
 * 声音开关（v0.4；纯运行时态、不持久化 —— 重启回到默认静音自动播放）。
 * 打开 = 用户手势：muted=false 并 resume play()（自动播放策略放行）；
 * 关闭 = muted=true（播放继续但静音）。
 */
export function bgVideoSetSound(on: boolean): boolean {
  const value = !!on
  if (videoEl !== null) {
    videoEl.muted = !value
    if (value) {
      const p = videoEl.play()
      if (p !== undefined) p.catch(() => {})
    }
  }
  snapshot = { ...snapshot, video: { ...snapshot.video, soundOn: value } }
  notify()
  return value
}

/** 设置音量 0..1（写 <video>.volume 并快照；持久化由调用方经 setBg 防抖写 volume）。 */
export function bgVideoSetVolume(volume: number): number {
  const value = clampBgVolume(volume)
  snapshot = { ...snapshot, volume: value }
  if (videoEl !== null) videoEl.volume = value
  notify()
  return value
}

// ---- v0.4 面板辅助（Enter 提交 / 本地文件上传） ----

/**
 * Enter 键提交 handler（渐变 / 图片 URL / 视频 URL 文本框共用；阻止默认动作）。
 * @returns React onKeyDown handler：仅当 e.key === 'Enter' 时调用 apply()。
 * 导出供 build/verify-client.mjs 模拟 handler 断言。
 */
export function bgKeyEnter(apply: () => void): (e: { key?: string; preventDefault?: () => void }) => void {
  return (e) => {
    if ((e.key ?? '') !== 'Enter') return
    try { e.preventDefault?.() } catch { /* noop */ }
    apply()
  }
}

/** 本地文件上传结果（面板错误行数据源；message 为可读文案）。 */
export interface BgUploadResult {
  ok: boolean
  mediaKey?: string
  /** 客户端预校验失败的字典键（errFileType / errFileTooBig）。 */
  errorKey?: string
  /** 展示用附加信息（如允许的扩展名列表 / 上限 MB）。 */
  detail?: string
  /** 服务端返回或网络失败的可读消息。 */
  message?: string
}

/**
 * 本地媒体「上传 + 伺服」（v0.4）：不做 data URI 内联 —— 客户端先按 config 镜像
 * 预校验扩展名/大小，再 fetch POST /dsh-bg-media/upload?kind=…&ext=…（同源相对
 * 路径；body = 原始文件流），成功返回 {ok, mediaKey} 供 setBg(mode,'',{mediaKey})。
 * 服务端仍会按 config 权威复验（非法扩展 / 超限 → 400 + 中文消息）。
 */
export async function bgUploadLocalFile(
  file: { name: string; size: number },
  kind: 'image' | 'video',
  cfg: BgConfig,
): Promise<BgUploadResult> {
  const dot = file.name.lastIndexOf('.')
  const ext = dot >= 0 ? file.name.slice(dot + 1).toLowerCase() : ''
  const allowed = kind === 'image' ? cfg.imageExt : cfg.videoExt
  if (!allowed.includes(ext)) {
    return { ok: false, errorKey: 'errFileType', detail: allowed.join(' / ') }
  }
  const limitMB = kind === 'image' ? cfg.maxImageMB : cfg.maxVideoMB
  if (file.size > limitMB * 1024 * 1024) {
    return { ok: false, errorKey: 'errFileTooBig', detail: `${limitMB}MB` }
  }
  const url = `/dsh-bg-media/upload?kind=${encodeURIComponent(kind)}&ext=${encodeURIComponent(ext)}`
  let res: { ok: boolean; json(): Promise<unknown> }
  try {
    const fetcher = (globalThis as { fetch?: typeof fetch }).fetch
    if (typeof fetcher !== 'function') throw new Error('fetch unavailable')
    res = await fetcher(url, { method: 'POST', body: file as unknown as BodyInit })
  } catch {
    return { ok: false, message: 'dsh-bg-media: 上传失败（无法连接媒体服务）' }
  }
  let payload: { ok?: boolean; mediaKey?: string; message?: string } = {}
  try {
    const parsed = await res.json()
    if (parsed !== null && typeof parsed === 'object') payload = parsed as typeof payload
  } catch {
    // 非 JSON 响应（如网关 502 文本）→ 走通用失败
  }
  if (res.ok && payload.ok === true && typeof payload.mediaKey === 'string' && payload.mediaKey !== '') {
    return { ok: true, mediaKey: payload.mediaKey }
  }
  return { ok: false, message: typeof payload.message === 'string' && payload.message !== ''
    ? payload.message
    : 'dsh-bg-media: 上传失败（服务端拒绝）' }
}

// ---- 插件入口 ----

export const inject = ['slots', 'settingsScope', 'locale']

export function apply(ctx: CtxLike): void {
  let scope: SettingsScopeLike | undefined
  try {
    scope = ctx.settingsScope?.bind({ namespace: 'dsh-bg' })
  } catch {
    scope = undefined
  }
  // v0.4.1：把模块级单一防抖 flush 接到本 ctx 的实现（需要 scope / 镜像读写）
  runFlushImpl = runFlushNow
  const t = ctx.locale ? ctx.locale.bind('settings.dsh-bg') : undefined
  const text = (key: string): string => (t ? t(key) : key)

  /** 从 scope 快照取出 section（兼容两种形状：平铺字段 / {value:{...}}）。 */
  function readScopeSection(): Record<string, unknown> {
    const raw = scope?.getSnapshot?.()
    if (raw === null || raw === undefined || typeof raw !== 'object') return {}
    const candidate = raw as Record<string, unknown>
    const nested = candidate.value
    if (nested !== null && typeof nested === 'object' && !Array.isArray(nested)) {
      const inner = nested as Record<string, unknown>
      if ('mode' in inner || 'fit' in inner) return inner
    }
    return candidate
  }

  function sectionString(section: Record<string, unknown>, key: string, fallback: string): string {
    const value = section[key]
    return typeof value === 'string' ? value : fallback
  }

  /** 采纳外部变化（host/工具/其他会话写 settings → 推送浏览器；settings 镜像为权威）。 */
  /** 读命名空间里的数字字段；缺失/非数字回退 fallback（opacity/posX/posY/volume）。 */
  function sectionNumber(section: Record<string, unknown>, key: string, fallback: number): number {
    const value = section[key]
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback
  }

  /** 镜像里某持久化字段的读值（与字段写入同语义；判断防抖字段是否已收敛）。 */
  function mirrorField(section: Record<string, unknown>, field: string): unknown {
    switch (field) {
      case 'mode': return sectionString(section, 'mode', 'off')
      case 'value': return sectionString(section, 'value', '')
      case 'mediaKey': return sectionString(section, 'mediaKey', '')
      case 'fit': {
        const raw = sectionString(section, 'fit', '')
        return (BG_FITS as readonly string[]).includes(raw) ? raw : DEFAULT_BG_CONFIG.defaultFit
      }
      case 'textScheme': {
        const raw = sectionString(section, 'textScheme', '')
        return (BG_TEXT_SCHEMES as readonly string[]).includes(raw) ? raw : DEFAULT_BG_CONFIG.defaultTextScheme
      }
      case 'loop': return typeof section.loop === 'boolean' ? section.loop : DEFAULT_BG_CONFIG.defaultLoop
      case 'opacity': return sectionNumber(section, 'opacity', 1)
      case 'posX': return sectionNumber(section, 'posX', 50)
      case 'posY': return sectionNumber(section, 'posY', 50)
      case 'volume': return sectionNumber(section, 'volume', 1)
      default: return undefined
    }
  }

  /** 快照里某持久化字段的当前值（本地权威；pending 覆盖用）。 */
  function fieldCurrent(field: string): unknown {
    switch (field) {
      case 'mode': return snapshot.mode
      case 'value': return snapshot.value
      case 'fit': return snapshot.fit
      case 'textScheme': return snapshot.textScheme
      case 'loop': return snapshot.loop
      case 'mediaKey': return snapshot.mediaKey
      case 'opacity': return snapshot.opacity
      case 'posX': return snapshot.posX
      case 'posY': return snapshot.posY
      case 'volume': return snapshot.volume
      default: return undefined
    }
  }

  function adopt(): void {
    const section = readScopeSection()
    const mode = sectionString(section, 'mode', 'off')
    const value = sectionString(section, 'value', '')
    const fitRaw = sectionString(section, 'fit', '')
    const fit = (BG_FITS as readonly string[]).includes(fitRaw) ? fitRaw as BgFit : DEFAULT_BG_CONFIG.defaultFit
    const schemeRaw = sectionString(section, 'textScheme', '')
    const textScheme = (BG_TEXT_SCHEMES as readonly string[]).includes(schemeRaw)
      ? schemeRaw as BgTextScheme
      : DEFAULT_BG_CONFIG.defaultTextScheme
    const loopRaw = section.loop
    const loop = typeof loopRaw === 'boolean' ? loopRaw : DEFAULT_BG_CONFIG.defaultLoop
    const mediaKey = sectionString(section, 'mediaKey', '')
    // v0.3.1：媒体不透明度与焦点定位（schema 默认 1 / 50 / 50）；v0.4 音量（默认 1）
    // —— 越界交给 applyBgState 的钳制归一
    const opacity = sectionNumber(section, 'opacity', 1)
    const posX = sectionNumber(section, 'posX', 50)
    const posY = sectionNumber(section, 'posY', 50)
    const volume = sectionNumber(section, 'volume', 1)
    // 配置镜像（只读字段；缺字段回退内置默认）
    const arrOf = (key: string): string[] => {
      const rawArr = section[key]
      return Array.isArray(rawArr) && rawArr.every((item) => typeof item === 'string')
        ? (rawArr as string[])
        : [...DEFAULT_BG_CONFIG[key as keyof BgConfig] as readonly string[]]
    }
    const cfg: BgConfig = {
      imageExt: arrOf('imageExt'),
      videoExt: arrOf('videoExt'),
      maxImageMB: typeof section.maxImageMB === 'number' ? section.maxImageMB : DEFAULT_BG_CONFIG.maxImageMB,
      maxVideoMB: typeof section.maxVideoMB === 'number' ? section.maxVideoMB : DEFAULT_BG_CONFIG.maxVideoMB,
      defaultFit: (BG_FITS as readonly string[]).includes(sectionString(section, 'defaultFit', ''))
        ? sectionString(section, 'defaultFit', '') as BgFit
        : DEFAULT_BG_CONFIG.defaultFit,
      defaultTextScheme: (BG_TEXT_SCHEMES as readonly string[]).includes(sectionString(section, 'defaultTextScheme', ''))
        ? sectionString(section, 'defaultTextScheme', '') as BgTextScheme
        : DEFAULT_BG_CONFIG.defaultTextScheme,
      defaultLoop: typeof section.defaultLoop === 'boolean' ? section.defaultLoop : DEFAULT_BG_CONFIG.defaultLoop,
    }
    // v0.4 收敛策略：本地防抖写入在途时，镜像到达后——
    // 1) 若镜像某字段已收敛到期望值 → 释放 pending（之后以镜像为准）；
    // 2) 仍未收敛的 pending 字段以本地值为权威覆盖 doc（防止镜像旧值把刚拖的
    //    定位/透明度拉回去造成"一帧帧滞后/振荡"）；镜像追上后 key 相同 → 去重。
    for (const [field, expected] of [...pendingWrites]) {
      if (sameValue(mirrorField(section, field), expected)) pendingWrites.delete(field)
    }
    const doc: Partial<BgSnapshot> & { mode: string } = {
      mode, value, fit, textScheme, loop, mediaKey, opacity, posX, posY, volume, cfg,
    } as BgSnapshot
    for (const field of pendingWrites.keys()) {
      if (['mode', 'value', 'fit', 'textScheme', 'loop', 'mediaKey', 'opacity', 'posX', 'posY', 'volume'].includes(field)) {
        ;(doc as Record<string, unknown>)[field] = fieldCurrent(field)
      }
    }
    // applyBgState 内部按 applyKey 去重：镜像与本地一致时不再重建 DOM → 收敛不振荡
    applyBgState(doc)
  }

  /**
   * 一次原子 flush（v0.4.1）：把所有待写字段合并为**单次 scope.mutate**——
   * 相比 v0.4 的逐字段 300ms 各自 set，单次提交把"镜像整文档重载 / 落盘"的竞态
   * 窗口从 N 个往返缩小为 1 个；pending 在提交 settle 后释放（防抖窗口内 adopt
   * 仍以本地期望值压住镜像旧值，窗口外镜像为权威）。
   * - scope 缺失：纯客户端态，仅清 pending（本次会话生效）。
   * - 提交失败（拒绝/网络）：同样释放 pending，让 scope 的 recover() 重载镜像接管。
   */
  function runFlushNow(): void {
    clearFlushTimer()
    if (pendingWrites.size === 0) return
    const fields = [...pendingWrites.entries()]
    const release = (): void => {
      for (const [field] of fields) pendingWrites.delete(field)
      notify()
    }
    if (!scope) {
      pendingWrites.clear()
      return
    }
    try {
      const ops = fields.map(([field, value]) => ({ op: 'set' as const, path: [field] as readonly string[], value }))
      const outcome = typeof scope.mutate === 'function'
        ? scope.mutate(ops)
        : (() => {
          // 受限/旧 scope：退化为逐字段 set。**同步全部发出**（不逐字段 await ——
          // 服务端/scope 自带串行队列，这里一次提交所有字段，避免微任务交错把
          // 一次 flush 拆成多帧）。
          const promises: Array<PromiseLike<unknown> | void> = fields.map(([field, value]) => scope?.set(field, value))
          return Promise.all(promises.filter((p): p is PromiseLike<unknown> => p !== undefined && typeof (p as PromiseLike<unknown>).then === 'function'))
        })()
      if (outcome !== undefined && typeof (outcome as PromiseLike<unknown>).then === 'function') {
        void (outcome as PromiseLike<void>).then(release, release)
      } else {
        release()
      }
    } catch {
      release()
    }
  }

  /** 合并的 ~300ms 防抖持久化（v0.4.1）：只登记真正变化的字段，一次 flush 全提交。 */
  function persistSoon(fields: Record<string, unknown>): void {
    if (!scope) return
    for (const [field, value] of Object.entries(fields)) {
      pendingWrites.set(field, value)
    }
    scheduleFlushTimer()
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
  function composeFields(mode: string, value: string, opts?: BgApplyOpts): Record<string, unknown> {
    if (opts?.resetAll) {
      return {
        mode: 'off', value: '', mediaKey: '',
        fit: snapshot.cfg.defaultFit,
        textScheme: snapshot.cfg.defaultTextScheme,
        loop: snapshot.cfg.defaultLoop,
        opacity: 1, posX: 50, posY: 50, volume: 1,
      }
    }
    const fields: Record<string, unknown> = { mode, value }
    const replacingSource = opts?.mediaKey !== undefined || mode !== snapshot.mode || value !== snapshot.value
    if (replacingSource) {
      fields.mediaKey = opts?.mediaKey ?? ''
    }
    if (opts?.fit !== undefined) fields.fit = opts.fit
    if (opts?.textScheme !== undefined) fields.textScheme = opts.textScheme
    if (opts?.loop !== undefined) fields.loop = opts.loop
    if (opts?.opacity !== undefined) fields.opacity = opts.opacity
    if (opts?.posX !== undefined) fields.posX = opts.posX
    if (opts?.posY !== undefined) fields.posY = opts.posY
    if (opts?.volume !== undefined) fields.volume = opts.volume
    return fields
  }

  /**
   * UI/注入面入口：**乐观 apply 一次**（本地即时，不等待持久化）+ **合并防抖持久化**
   * （只登记与当前快照不同的字段；静止 300ms 后**一次原子 mutate** 提交全部字段 ——
   * 巨型本地媒体已不再入 settings，拖动定位/透明度不再触发整文件重写，卡顿根因消除；
   * 原子提交把多字段写入的镜像竞态窗口压到单次往返，见 runFlushNow）。
   */
  function setBg(mode: string, value: string, opts?: BgApplyOpts): void {
    const fields = composeFields(mode, value, opts)
    // 先算"真正变化"的字段（相对应用前的快照），再乐观 apply + 防抖持久化
    const dirty: Record<string, unknown> = {}
    for (const [field, fieldValue] of Object.entries(fields)) {
      if (!sameValue(fieldCurrent(field), fieldValue)) dirty[field] = fieldValue
    }
    applyBgState({ ...fields } as BgSnapshot)
    persistSoon(dirty)
  }

  const zhPresetDict = Object.fromEntries(Object.entries(PRESET_LABELS_ZH).map(([k, v]) => ['preset.' + k, v]))
  const enPresetDict = Object.fromEntries(Object.entries(PRESET_LABELS_EN).map(([k, v]) => ['preset.' + k, v]))

  ctx.locale?.register('settings.dsh-bg', {
    zh: {
      nav: '背景', title: '背景', presets: '预设皮肤', custom: '自定义',
      color: '纯色', gradient: '渐变', image: '壁纸图片', video: '背景视频',
      applyColor: '应用', applyGradient: '应用', applyImage: '应用', applyVideo: '应用',
      reset: '恢复默认', current: '当前背景', currentOff: '默认（未设置）',
      colorPlaceholder: '#1e2a78', gradientPlaceholder: 'linear-gradient(135deg, #1e2a78, #2b1055)',
      imagePlaceholder: 'https://example.com/wallpaper.jpg',
      videoPlaceholder: 'https://example.com/ocean.mp4',
      localImage: '本地图片',
      localVideo: '本地视频',
      localImageHint: '选择本地图片（≤上限），上传后自动生效；或让模型调用 bg_apply 工具（file 参数）',
      localVideoHint: '选择本地视频（≤上限），上传完成后自动全屏播放；或让模型调用 bg_apply 工具（file 参数）',
      uploading: '上传中…',
      errColor: '颜色需是 #rrggbb 形式（如 #1e2a78）',
      errGradient: '渐变格式无效，请用完整 CSS 渐变',
      errImage: '图片地址需以 http(s):// 开头',
      errVideo: '视频地址需以 http(s):// 开头',
      errFileTooBig: '文件超过大小上限',
      errFileType: '不支持的文件类型',
      fit: '适配', textScheme: '文字',
      fitFill: '拉伸铺满', fitCover: '裁切铺满', fitContain: '完整容纳', fitCenter: '不缩放居中', fitTile: '平铺',
      schemeAuto: '自动', schemeLight: '浅色文字', schemeDark: '深色文字',
      videoControls: '视频控制', play: '播放', pause: '暂停', stop: '停止', speed: '倍速',
      loop: '循环播放', textLight: '浅字', textDark: '深字',
      // v0.4：声音/音量（sound 为运行时开关、volume 持久化 0–1）
      sound: '声音', volume: '音量',
      // v0.3.1：媒体滑杆与视频运行态错误文案
      opacityLabel: '透明度', posXLabel: '水平定位', posYLabel: '垂直定位',
      errApply: '应用背景时出错，请重试或先恢复默认',
      errVideoLoad: '视频加载失败（未给出具体原因）：请确认链接可直接播放',
      errVideoAborted: '视频加载被中止（MEDIA_ERR_ABORTED=1）',
      errVideoNetwork: '视频加载失败：网络错误（MEDIA_ERR_NETWORK=2），请检查链接能否直接访问',
      errVideoDecode: '视频加载失败：解码错误（MEDIA_ERR_DECODE=3），格式可能不受支持或文件已损坏',
      errVideoSrc: '视频源不受支持（MEDIA_ERR_SRC_NOT_SUPPORTED=4）：链接无法直接播放或格式未被允许',
      errVideoAutoplay: '浏览器阻止了自动播放，请点击「播放」开始',
      errVideoStalled: '视频网络较慢或服务器暂时无响应，正在等待数据…',
      // v0.4.1：弹窗（#7）标题与确认钮
      notice: '提示', ok: '知道了',
      ...zhPresetDict,
    },
    en: {
      nav: 'Background', title: 'Background', presets: 'Presets', custom: 'Custom',
      color: 'Color', gradient: 'Gradient', image: 'Wallpaper', video: 'Video',
      applyColor: 'Apply', applyGradient: 'Apply', applyImage: 'Apply', applyVideo: 'Apply',
      reset: 'Reset', current: 'Current', currentOff: 'Default (unset)',
      colorPlaceholder: '#1e2a78', gradientPlaceholder: 'linear-gradient(135deg, #1e2a78, #2b1055)',
      imagePlaceholder: 'https://example.com/wallpaper.jpg',
      videoPlaceholder: 'https://example.com/ocean.mp4',
      localImage: 'Local image',
      localVideo: 'Local video',
      localImageHint: 'Pick a local image (up to the limit); it uploads and takes effect automatically. Or ask the assistant to call bg_apply with a file path',
      localVideoHint: 'Pick a local video (up to the limit); it plays fullscreen automatically after upload. Or ask the assistant to call bg_apply with a file path',
      uploading: 'Uploading…',
      errColor: 'Color must be like #rrggbb (e.g. #1e2a78)',
      errGradient: 'Invalid gradient. Use a full CSS gradient',
      errImage: 'Image URL must start with http(s)://',
      errVideo: 'Video URL must start with http(s)://',
      errFileTooBig: 'File exceeds the size limit',
      errFileType: 'Unsupported file type',
      fit: 'Fit', textScheme: 'Text',
      fitFill: 'Fill', fitCover: 'Cover', fitContain: 'Contain', fitCenter: 'Center', fitTile: 'Tile',
      schemeAuto: 'Auto', schemeLight: 'Light text', schemeDark: 'Dark text',
      videoControls: 'Video controls', play: 'Play', pause: 'Pause', stop: 'Stop', speed: 'Speed',
      loop: 'Loop', textLight: 'Light text', textDark: 'Dark text',
      // v0.4: sound (runtime toggle) + volume (persisted 0–1)
      sound: 'Sound', volume: 'Volume',
      // v0.3.1：media sliders + video runtime error copy
      opacityLabel: 'Opacity', posXLabel: 'Horizontal focus', posYLabel: 'Vertical focus',
      errApply: 'Failed to apply the background. Retry or reset to default first',
      errVideoLoad: 'Video failed to load (no specific reason): make sure the link streams directly',
      errVideoAborted: 'Video load aborted (MEDIA_ERR_ABORTED=1)',
      errVideoNetwork: 'Video failed to load: network error (MEDIA_ERR_NETWORK=2). Check the link is directly reachable',
      errVideoDecode: 'Video failed to load: decode error (MEDIA_ERR_DECODE=3). The format may be unsupported or the file is corrupt',
      errVideoSrc: 'Video source not supported (MEDIA_ERR_SRC_NOT_SUPPORTED=4): the link is not directly playable or the format is not allowed',
      errVideoAutoplay: 'Autoplay was blocked by the browser. Click Play to start',
      errVideoStalled: 'The video network is slow or the server is not responding; waiting for data…',
      // v0.4.1: popup (#7) title + confirm
      notice: 'Notice', ok: 'OK',
      ...enPresetDict,
    },
  })

  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'dsh-bg',
    order: 500,
    label: () => text('nav'),
    inject: () => ({ setBg, text }),
  }, BgPanel))

  ctx.effect(() => {
    let off: (() => void) | undefined
    try {
      off = scope?.subscribe(adopt)
    } catch {
      off = undefined
    }
    adopt()
    return () => {
      off?.()
      runFlushImpl = null
      restoreBg()
    }
  })
}

// ---- 面板组件（纯 react/jsx + 内联样式，无官方组件库） ----

/** UI setBg 选项（v0.4 增 volume；resetAll = 整命名空间重置）。 */
export interface BgApplyOpts {
  fit?: BgFit
  textScheme?: BgTextScheme
  loop?: boolean
  mediaKey?: string
  opacity?: number
  posX?: number
  posY?: number
  /** 视频音量 0..1（持久化字段；默认 1）。 */
  volume?: number
  /** true：恢复默认 = 整命名空间重置（mode=off 且全部运行时字段回默认）。 */
  resetAll?: boolean
}

interface BgPanelProps {
  setBg?: (mode: string, value: string, opts?: BgApplyOpts) => void
  text?: (key: string) => string
}

export function BgPanel(props: BgPanelProps): unknown {
  const snap = useSyncExternalStore(subscribeStore, getSnapshot)
  const setBg = props.setBg ?? (() => {})
  const text = props.text ?? ((k: string) => k)

  const [hex, setHex] = useState('#1e2a78')
  const [gradient, setGradient] = useState('linear-gradient(135deg, #1e2a78, #2b1055)')
  const [imageUrl, setImageUrl] = useState('')
  const [videoUrl, setVideoUrl] = useState('')
  const [error, setError] = useState('')
  /** 上传进行中（'image' | 'video' | ''）：按钮 disabled + 上传中文案（v0.4）。 */
  const [uploading, setUploading] = useState<'image' | 'video' | ''>('')

  // ---- v0.4.1：tabs 布局（预设 / 纯色 / 渐变 / 图片 / 视频）----
  const tabForMode = (mode: string): string => (mode === 'color' || mode === 'gradient' || mode === 'image' || mode === 'video' ? mode : 'presets')
  const [tab, setTab] = useState<string>(() => tabForMode(snap.mode))
  useEffect(() => {
    // 应用/采纳到的背景模式变化 → 自动切到对应 tab（用户在 tab 间浏览时不受影响，
    // 因为 snap.mode 只在真的"生效"时变化）
    setTab(tabForMode(snap.mode))
  }, [snap.mode])

  // ---- v0.4.1：弹窗报错（#7）----
  /** 硬错误（弹窗）；软提示（自动播放被拒/网络慢）只走面板内提示行，不打断操作。 */
  const HARD_ERROR_KEYS = ['errApply', 'errVideoLoad', 'errVideoAborted', 'errVideoNetwork', 'errVideoDecode', 'errVideoSrc']
  const [rtKey, setRtKey] = useState('')
  useEffect(() => {
    const key = snap.status.error
    if (HARD_ERROR_KEYS.includes(key)) setRtKey(key)
    else if (key === '' || (key !== '' && !HARD_ERROR_KEYS.includes(key))) setRtKey('')
  }, [snap.status.error])
  const closePopups = (): void => { setError(''); setRtKey('') }
  const popupMessage = rtKey !== '' ? text(rtKey) : error

  // ---- v0.4.1：设置页回显当前背景（#5：重启后仍显示本地路径/超链接）----
  /** 编辑中的字段（焦点内不覆盖，防打字被镜像打断）。 */
  const editing = useRef<Record<string, boolean>>({})
  const markEditing = (field: string, value: boolean): void => { editing.current[field] = value }
  useEffect(() => {
    // 镜像/应用采纳变化后，把作者输入框回显为"当前生效值"：重启/换源/恢复默认后
    // 文本框不再空白 —— 本地文件 value=原路径/文件名、远程=URL 都照常显示。
    // v0.4.2：**巨型旧值不回显进可编辑输入框**（#6）——历史版本曾把整张图片的
    // base64 存在 value 里（几十万字符），塞进 <input> 会让聚焦/光标计算卡死页面。
    // 超过上限就留空（底部"当前背景"仍截断展示来源）。正常 URL/路径/文件名远小于上限。
    const EDITABLE_VALUE_MAX = 4000
    const editableValue = (v: string): string => (v !== '' && v.length <= EDITABLE_VALUE_MAX ? v : '')
    if (editing.current.color !== true) {
      // type=color 只接受 #rrggbb：3 位短 hex 展开成 6 位，其余非法值回模板色
      const short = /^#[0-9a-fA-F]{3}$/.test(snap.value)
        ? '#' + snap.value.slice(1).split('').map((c) => c + c).join('')
        : snap.value
      const v = snap.mode === 'color' && /^#[0-9a-fA-F]{3,8}$/.test(short) ? short.toLowerCase() : '#1e2a78'
      if (hex !== v) setHex(v)
    }
    if (editing.current.gradient !== true) {
      const applied = snap.mode === 'gradient' ? editableValue(snap.value) : ''
      const v = applied !== '' ? applied : 'linear-gradient(135deg, #1e2a78, #2b1055)'
      if (gradient !== v) setGradient(v)
    }
    if (editing.current.image !== true) {
      const v = snap.mode === 'image' ? editableValue(snap.value) : ''
      if (imageUrl !== v) setImageUrl(v)
    }
    if (editing.current.video !== true) {
      const v = snap.mode === 'video' ? editableValue(snap.value) : ''
      if (videoUrl !== v) setVideoUrl(v)
    }
    // 依赖仅取生效态三元组（含 mediaKey：本地媒体换文件时 value/name 相同也要回显）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snap.mode, snap.value, snap.mediaKey])

  /** 进度/时长 mm:ss 格式化（#8）。 */
  const fmtTime = (sec: number): string => {
    const total = Math.max(0, Math.floor(Number.isFinite(sec) ? sec : 0))
    const m = Math.floor(total / 60)
    const r = total % 60
    return `${m}:${String(r).padStart(2, '0')}`
  }

  const activeKey = `${snap.mode}\u0000${snap.value}\u0000${snap.fit}`
  const isWallpaper = snap.mode === 'image' || snap.mode === 'video'
  const imageExt = snap.cfg?.imageExt?.length ? snap.cfg.imageExt : DEFAULT_BG_CONFIG.imageExt
  const videoExt = snap.cfg?.videoExt?.length ? snap.cfg.videoExt : DEFAULT_BG_CONFIG.videoExt
  const acceptImageAttr = imageExt.map((ext) => `.${ext}`).join(',')
  const acceptVideoAttr = videoExt.map((ext) => `.${ext}`).join(',')

  const makeButton = (label: string, onPress: () => void, primary = false, disabled = false) =>
    jsx('button', {
      type: 'button',
      disabled,
      onClick: onPress,
      style: {
        padding: '4px 12px',
        borderRadius: '6px',
        border: '1px solid var(--dsw-alias-border-l2, #ccc)',
        background: primary ? '#3b82f6' : 'transparent',
        color: primary ? '#fff' : 'var(--dsw-alias-label-primary, #111)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.45 : 1,
      },
      children: label,
    })

  const inputStyle = {
    flex: 1,
    minWidth: '180px',
    padding: '6px 8px',
    borderRadius: '6px',
    border: '1px solid var(--dsw-alias-border-l2, #ccc)',
    background: 'var(--dsw-alias-bg-layer-1, #fff)',
    color: 'var(--dsw-alias-label-primary, #111)',
  }

  const selectStyle = {
    padding: '4px 6px',
    borderRadius: '6px',
    border: '1px solid var(--dsw-alias-border-l2, #ccc)',
    background: 'var(--dsw-alias-bg-layer-1, #fff)',
    color: 'var(--dsw-alias-label-primary, #111)',
  }

  const row = (label: string, input: unknown, action: unknown) =>
    jsx('div', {
      style: { display: 'flex', gap: '8px', alignItems: 'center', margin: '6px 0', flexWrap: 'wrap' },
      children: [
        jsx('span', { style: { width: '44px', flexShrink: 0 }, children: label }),
        input,
        action,
      ],
    })

  const applyColor = (): void => {
    const v = hex.trim()
    if (!/^#[0-9a-fA-F]{3,8}$/.test(v)) {
      setError(text('errColor'))
      return
    }
    setError('')
    setBg('color', v.toLowerCase())
  }
  const applyGradient = (): void => {
    const v = gradient.trim()
    const open = v.indexOf('(')
    const head = (open >= 0 ? v.slice(0, open + 1) : '').toLowerCase()
    if (!['linear-gradient(', 'radial-gradient(', 'conic-gradient('].includes(head)) {
      setError(text('errGradient'))
      return
    }
    setError('')
    setBg('gradient', v)
  }
  const applyImageUrl = (): void => {
    const v = imageUrl.trim()
    if (!/^https?:\/\//i.test(v)) {
      setError(text('errImage'))
      return
    }
    setError('')
    setBg('image', v)
  }
  const applyVideoUrl = (): void => {
    const v = videoUrl.trim()
    if (!/^https?:\/\//i.test(v)) {
      setError(text('errVideo'))
      return
    }
    setError('')
    setBg('video', v)
  }

  /**
   * 本地文件上传（v0.4：image/video 统一走 POST /dsh-bg-media/upload → mediaKey；
   * v0.4.1：value 记**原文件名**供展示/重启后回显 —— 引擎渲染仍以 mediaKey 优先，
   * value 只是可读来源标识（bg_apply file 登记的本地文件 value 则保留完整路径）。
   * 不再内联 data URI）。上传中按钮 disabled + 文案。
   */
  const uploadLocal = async (kind: 'image' | 'video', file: File | undefined): Promise<void> => {
    if (!file) return
    if (uploading !== '') return
    setUploading(kind)
    setError('')
    const cfg = snap.cfg?.imageExt?.length ? snap.cfg : {
      ...DEFAULT_BG_CONFIG,
      imageExt: [...DEFAULT_BG_CONFIG.imageExt],
      videoExt: [...DEFAULT_BG_CONFIG.videoExt],
    }
    const outcome = await bgUploadLocalFile(file, kind, cfg)
    setUploading('')
    if (outcome.ok && outcome.mediaKey !== undefined) {
      // 上传成功：value = 原文件名（可读来源，重启后设置页可回显）；引擎按 mediaKey 伺服
      setBg(kind, file.name, { mediaKey: outcome.mediaKey })
      return
    }
    if (outcome.errorKey === 'errFileTooBig') {
      setError(`${text('errFileTooBig')}（≤${outcome.detail ?? ''}）`)
    } else if (outcome.errorKey === 'errFileType') {
      setError(`${text('errFileType')}（${outcome.detail ?? ''}）`)
    } else {
      setError(outcome.message ?? text('errFileType'))
    }
  }

  const changeFit = (fit: string): void => {
    setError('')
    setBg(snap.mode, snap.value, { fit: fit as BgFit })
  }
  const changeScheme = (scheme: string): void => {
    setError('')
    setBg(snap.mode, snap.value, { textScheme: scheme as BgTextScheme })
  }
  const changeLoop = (checked: boolean): void => {
    setError('')
    const applied = bgVideoSetLoop(checked)
    setBg(snap.mode, snap.value, { loop: applied })
  }
  /** 声音开关：运行时态（不持久化）；点开=手势 → muted=false + resume play()。 */
  const changeSound = (checked: boolean): void => {
    setError('')
    bgVideoSetSound(checked)
  }
  /** 音量滑杆：乐观写元素 + 快照，持久化 volume 经 setBg 防抖。 */
  const changeVolume = (percent: number): void => {
    setError('')
    const applied = bgVideoSetVolume(percent / 100)
    setBg(snap.mode, snap.value, { volume: applied })
  }

  const swatchStyle = (p: Preset): Record<string, string> => {
    if (p.mode === 'off') {
      return {
        background: 'var(--dsw-alias-bg-layer-1, #fff)',
        border: '1px dashed var(--dsw-alias-border-l2, #aaa)',
      }
    }
    return { background: p.value }
  }

  const fitSelect = jsx('select', {
    value: snap.fit,
    disabled: !isWallpaper,
    onChange: (e: { target: { value: string } }) => changeFit(e.target.value),
    style: { ...selectStyle, opacity: isWallpaper ? 1 : 0.5 },
    children: BG_FITS.map((fit) =>
      jsx('option', { key: fit, value: fit, children: text('fit' + fit[0].toUpperCase() + fit.slice(1)) })),
  })
  const schemeSelect = jsx('select', {
    value: snap.textScheme,
    disabled: snap.mode === 'off',
    onChange: (e: { target: { value: string } }) => changeScheme(e.target.value),
    style: { ...selectStyle, opacity: snap.mode === 'off' ? 0.5 : 1 },
    children: BG_TEXT_SCHEMES.map((scheme) =>
      jsx('option', { key: scheme, value: scheme, children: text('scheme' + scheme[0].toUpperCase() + scheme.slice(1)) })),
  })

  // v0.4.1：进度条 seek（#8）——拖动/点击移动到对应播放位置；无元数据时禁用。
  const durSec = snap.video.duration
  const curSec = snap.video.currentTime
  const seekReady = durSec > 0
  const progressRow = snap.mode === 'video'
    ? jsx('div', {
        'data-testid': 'dsh-bg-video-progress',
        // 不要 width:100% —— 与 52px 左缩进叠加会超出面板右缘（#2）。
        style: { display: 'flex', gap: '8px', alignItems: 'center', margin: '4px 0 2px 52px' },
        children: [
          jsx('span', { style: { width: '38px', flexShrink: 0, textAlign: 'right', fontSize: '0.78em', opacity: 0.8, fontVariantNumeric: 'tabular-nums' }, children: fmtTime(curSec) }),
          jsx('input', {
            type: 'range',
            min: 0,
            max: durSec,
            step: 0.1,
            value: Math.min(curSec, durSec),
            disabled: !seekReady,
            onChange: (e: { target: { value: string } }) => { bgVideoSeek(Number(e.target.value)) },
            style: { flex: 1, minWidth: '80px', opacity: seekReady ? 1 : 0.45, cursor: seekReady ? 'pointer' : 'not-allowed' },
          }),
          jsx('span', { style: { width: '38px', flexShrink: 0, fontSize: '0.78em', opacity: 0.8, fontVariantNumeric: 'tabular-nums' }, children: fmtTime(durSec) }),
        ],
      })
    : null

  const videoControlRow = snap.mode === 'video'
    ? jsx('div', {
        'data-testid': 'dsh-bg-video-controls',
        style: { display: 'flex', gap: '8px', alignItems: 'center', margin: '8px 0 6px 52px', flexWrap: 'wrap' },
        children: [
          makeButton(snap.video.paused ? text('play') : text('pause'), () => { bgVideoToggle() }),
          makeButton(text('stop'), () => { bgVideoStop() }),
          jsx('label', { style: { fontSize: '0.85em', display: 'flex', gap: '4px', alignItems: 'center' }, children: [
            text('speed'),
            jsx('select', {
              value: snap.video.rate,
              onChange: (e: { target: { value: string } }) => bgVideoSetRate(Number(e.target.value)),
              style: selectStyle,
              children: ['0.5', '1', '1.5', '2'].map((rate) =>
                jsx('option', { key: rate, value: rate, children: `${rate}x` })),
            }),
          ]}),
          jsx('label', { style: { fontSize: '0.85em', display: 'flex', gap: '4px', alignItems: 'center' }, children: [
            jsx('input', {
              type: 'checkbox',
              checked: snap.loop,
              onChange: (e: { target: { checked: boolean } }) => changeLoop(e.target.checked),
            }),
            text('loop'),
          ]}),
          // v0.4：声音开关（运行时态：点开 = 用户手势 → muted=false + resume play）
          jsx('label', {
            'data-testid': 'dsh-bg-video-sound',
            style: { fontSize: '0.85em', display: 'flex', gap: '4px', alignItems: 'center' },
            children: [
              jsx('input', {
                type: 'checkbox',
                checked: snap.video.soundOn,
                onChange: (e: { target: { checked: boolean } }) => changeSound(e.target.checked),
              }),
              text('sound'),
            ],
          }),
        ],
      })
    : null

  // v0.4：音量滑杆（0–100% → video.volume 0–1；仅视频模式，持久化 volume）
  // —— 定义在 sliderRow 之后（下方），避免 TDZ。
  let volumeRow: unknown = null

  // v0.3.1：媒体滑杆（仅 wallpaper = image/video 时显示；拖动即 setBg 即时生效
  // + 持久化）。透明度 0–100%（step 5 → opacity 0.05 步长）；焦点 0–100 两轴。
  const sliderRow = (
    labelText: string,
    min: number,
    max: number,
    step: number,
    value: number,
    suffix: string,
    onInput: (v: number) => void,
  ) => jsx('div', {
    style: { display: 'flex', gap: '8px', alignItems: 'center', margin: '6px 0', flexWrap: 'wrap' },
    children: [
      jsx('span', { style: { width: '64px', flexShrink: 0, fontSize: '0.9em' }, children: labelText }),
      jsx('input', {
        type: 'range', min, max, step, value,
        onChange: (e: { target: { value: string } }) => onInput(Number(e.target.value)),
        style: { flex: 1, minWidth: '120px' },
      }),
      jsx('span', {
        style: { width: '52px', textAlign: 'right', fontSize: '0.85em', opacity: 0.8 },
        children: `${value}${suffix}`,
      }),
    ],
  })
  const wallpaperSliders = isWallpaper
    ? [
        sliderRow(text('opacityLabel'), 0, 100, 5, Math.round(snap.opacity * 100), '%', (v) => {
          setError('')
          setBg(snap.mode, snap.value, { opacity: v / 100 })
        }),
        sliderRow(text('posXLabel'), 0, 100, 1, Math.round(snap.posX), '%', (v) => {
          setError('')
          setBg(snap.mode, snap.value, { posX: v })
        }),
        sliderRow(text('posYLabel'), 0, 100, 1, Math.round(snap.posY), '%', (v) => {
          setError('')
          setBg(snap.mode, snap.value, { posY: v })
        }),
      ]
    : []
  // v0.4：音量滑杆（仅视频模式显示；0–100% → volume 0–1）
  volumeRow = snap.mode === 'video'
    ? sliderRow(text('volume'), 0, 100, 5, Math.round(clampBgVolume(snap.volume) * 100), '%', changeVolume)
    : null

  const currentLabel = snap.mode === 'off' || snap.mode === ''
    ? text('currentOff')
    : `${text('current')}: ${snap.mode} · ${(snap.value !== '' ? snap.value : snap.mediaKey !== '' ? `/dsh-bg-media/${snap.mediaKey}` : '').slice(0, 120)}`
  const schemeLabel = snap.resolvedText === null
    ? ''
    : `（${snap.resolvedText === 'light' ? text('textLight') : text('textDark')}）`

  // ---- v0.4.1：tabs 布局（#1）----
  const tabDefs: Array<[string, string]> = [
    ['presets', text('presets')],
    ['color', text('color')],
    ['gradient', text('gradient')],
    ['image', text('image')],
    ['video', text('video')],
  ]
  const tabBar = jsx('div', {
    'data-testid': 'dsh-bg-tabs',
    role: 'tablist',
    style: {
      display: 'flex', gap: '6px', margin: '0 0 12px', flexWrap: 'wrap',
      borderBottom: '1px solid var(--dsw-alias-border-l2, #ddd)', paddingBottom: '8px',
    },
    children: tabDefs.map(([id, label]) => {
      const activeTab = tab === id
      return jsx('button', {
        type: 'button',
        key: id,
        role: 'tab',
        'aria-selected': activeTab,
        onClick: () => setTab(id),
        style: {
          padding: '4px 12px', borderRadius: '14px', cursor: 'pointer', fontSize: '0.85em',
          border: activeTab ? '1px solid #3b82f6' : '1px solid var(--dsw-alias-border-l2, #ddd)',
          background: activeTab ? '#3b82f6' : 'transparent',
          color: activeTab ? '#fff' : 'var(--dsw-alias-label-primary, #111)',
        },
        children: label,
      })
    }),
  })

  const presetGrid = jsx('div', {
    style: {
      display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(92px, 1fr))',
      gap: '8px', marginBottom: '4px',
    },
    children: PRESETS.map((p) => {
      const isActive = activeKey === `${p.mode}\u0000${p.value}\u0000${snap.fit}`
      return jsx('button', {
        type: 'button',
        key: p.key,
        onClick: () => {
          closePopups()
          setBg(p.mode, p.value)
        },
        style: {
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px',
          padding: '8px', borderRadius: '8px', cursor: 'pointer',
          border: isActive ? '2px solid #3b82f6' : '1px solid var(--dsw-alias-border-l2, #ddd)',
          background: 'transparent',
        },
        children: [
          jsx('div', { style: { width: '100%', height: '44px', borderRadius: '6px', ...swatchStyle(p) } }),
          jsx('span', {
            style: { fontSize: '0.8em', color: 'var(--dsw-alias-label-secondary, #666)' },
            children: text('preset.' + p.key),
          }),
        ],
      })
    }),
  })

  /** 各 tab 的编辑内容（一次只显示一类来源，tabs 布局）。 */
  const editorNodes: unknown[] = []
  if (tab === 'presets') editorNodes.push(presetGrid)
  if (tab === 'color') {
    editorNodes.push(row(text('color'),
      jsx('input', {
        type: 'color', value: hex,
        onChange: (e: { target: { value: string } }) => setHex(e.target.value),
        style: { height: '28px', width: '48px', padding: 0, border: 'none', background: 'none' },
      }),
      makeButton(text('applyColor'), applyColor, true)))
  }
  if (tab === 'gradient') {
    editorNodes.push(row(text('gradient'),
      jsx('input', {
        type: 'text', value: gradient,
        placeholder: text('gradientPlaceholder'),
        onChange: (e: { target: { value: string } }) => setGradient(e.target.value),
        onFocus: () => markEditing('gradient', true),
        onBlur: () => markEditing('gradient', false),
        // v0.4：Enter = 应用（阻止默认）
        onKeyDown: bgKeyEnter(applyGradient),
        style: inputStyle,
      }),
      makeButton(text('applyGradient'), applyGradient, true)))
  }
  if (tab === 'image') {
    editorNodes.push(row(text('image'),
      jsx('input', {
        type: 'text', value: imageUrl,
        placeholder: text('imagePlaceholder'),
        onChange: (e: { target: { value: string } }) => setImageUrl(e.target.value),
        onFocus: () => markEditing('image', true),
        onBlur: () => markEditing('image', false),
        onKeyDown: bgKeyEnter(applyImageUrl),
        style: inputStyle,
      }),
      makeButton(text('applyImage'), applyImageUrl, true)))
    editorNodes.push(jsx('div', {
      style: { margin: '2px 0 6px 52px', display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' },
      children: [
        jsx('label', {
          'data-testid': 'dsh-bg-image-file',
          style: { fontSize: '0.85em', display: 'inline-flex', gap: '6px', alignItems: 'center', cursor: uploading !== '' ? 'not-allowed' : 'pointer' },
          children: [
            text('localImage'),
            jsx('input', {
              type: 'file',
              accept: acceptImageAttr,
              disabled: uploading !== '',
              style: { maxWidth: '240px' },
              onChange: (e: { target: { files: FileList | null } }) => { void uploadLocal('image', e.target.files?.[0] ?? undefined) },
            }),
          ],
        }),
        uploading === 'image'
          ? jsx('span', { 'data-testid': 'dsh-bg-uploading', style: { fontSize: '0.8em', opacity: 0.7 }, children: text('uploading') })
          : jsx('span', { style: { fontSize: '0.8em', opacity: 0.6 }, children: text('localImageHint') }),
      ],
    }))
  }
  if (tab === 'video') {
    editorNodes.push(row(text('video'),
      jsx('input', {
        type: 'text', value: videoUrl,
        placeholder: text('videoPlaceholder'),
        onChange: (e: { target: { value: string } }) => setVideoUrl(e.target.value),
        onFocus: () => markEditing('video', true),
        onBlur: () => markEditing('video', false),
        onKeyDown: bgKeyEnter(applyVideoUrl),
        style: inputStyle,
      }),
      makeButton(text('applyVideo'), applyVideoUrl, true)))
    editorNodes.push(jsx('div', {
      style: { margin: '0 0 6px 52px', display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' },
      children: [
        jsx('label', {
          'data-testid': 'dsh-bg-video-file',
          style: { fontSize: '0.85em', display: 'inline-flex', gap: '6px', alignItems: 'center', cursor: uploading !== '' ? 'not-allowed' : 'pointer' },
          children: [
            text('localVideo'),
            jsx('input', {
              type: 'file',
              accept: acceptVideoAttr,
              disabled: uploading !== '',
              style: { maxWidth: '240px' },
              onChange: (e: { target: { files: FileList | null } }) => { void uploadLocal('video', e.target.files?.[0] ?? undefined) },
            }),
          ],
        }),
        uploading === 'video'
          ? jsx('span', { 'data-testid': 'dsh-bg-uploading', style: { fontSize: '0.8em', opacity: 0.7 }, children: text('uploading') })
          : jsx('span', { style: { fontSize: '0.8em', opacity: 0.6 }, children: text('localVideoHint') }),
      ],
    }))
  }

  /**
   * v0.4.1：运行态错误**始终**显示面板内红色错误行（旧#8 坏链接可读），其中硬错误
   * （errVideo 系列 / errApply）同时弹窗（新#7）；自动播放被拒/网络慢等软提示不弹窗。
   * 弹窗关闭后（或错误被 playing/换背景清除前）红行持续可见作"最近错误"线索。
   */
  const runtimeErrorRow = snap.status.error !== ''
    ? jsx('p', {
        'data-testid': 'dsh-bg-status-error',
        style: { color: '#e5484d', fontSize: '0.85em', margin: '6px 0 0', fontWeight: 600 },
        children: text(snap.status.error),
      })
    : null

  /** v0.4.1：弹窗（#7）——校验错误与视频/应用硬错误统一弹窗，点「知道了」关闭。 */
  const popupOverlay = popupMessage !== ''
    ? jsx('div', {
        'data-testid': 'dsh-bg-error-popup',
        onClick: closePopups,
        style: {
          position: 'fixed', inset: 0, zIndex: 2147483000,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(0, 0, 0, 0.45)', padding: '16px',
        },
        children: jsx('div', {
          role: 'alertdialog',
          onClick: (e: { stopPropagation?: () => void }) => { try { e.stopPropagation?.() } catch { /* noop */ } },
          style: {
            maxWidth: 'min(560px, 100%)',
            padding: '16px 18px', borderRadius: '10px',
            background: 'var(--dsw-alias-bg-layer-1, #fff)',
            color: 'var(--dsw-alias-label-primary, #111)',
            border: '1px solid var(--dsw-alias-border-l2, #ccc)',
            boxShadow: '0 12px 40px rgb(0 0 0 / 0.35)',
          },
          children: [
            jsx('div', { style: { fontWeight: 700, marginBottom: '8px', color: '#e5484d' }, children: text('notice') }),
            jsx('div', { style: { fontSize: '0.9em', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }, children: popupMessage }),
            jsx('div', { style: { marginTop: '14px', display: 'flex', justifyContent: 'flex-end' }, children: makeButton(text('ok'), closePopups, true) }),
          ],
        }),
      })
    : null

  return jsx('div', {
    style: { padding: '4px 2px', maxWidth: '640px' },
    children: [
      jsx('div', {
        'data-testid': 'dsh-bg-title',
        style: { fontSize: '1.1rem', fontWeight: 700, margin: '0 0 10px' },
        children: text('title'),
      }),
      tabBar,
      ...editorNodes,
      jsx('div', { style: { height: '1px', background: 'var(--dsw-alias-border-l2, #e5e7eb)', margin: '12px 0 6px' } }),
      progressRow,
      videoControlRow,
      volumeRow,
      row(text('fit'), fitSelect, null),
      row(text('textScheme'), schemeSelect, null),
      ...wallpaperSliders,
      runtimeErrorRow,
      jsx('div', { style: { margin: '12px 0 0' }, children: makeButton(text('reset'), () => { closePopups(); setBg('off', '', { resetAll: true }) }) }),
      jsx('p', {
        'data-testid': 'dsh-bg-current',
        style: { fontSize: '0.85em', opacity: 0.7, margin: '12px 0 0', wordBreak: 'break-all' },
        children: `${currentLabel}${schemeLabel}`,
      }),
      popupOverlay,
    ],
  })
}
