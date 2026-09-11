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

import { jsx } from 'react/jsx-runtime'
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import {
  DEFAULT_BG_CONFIG,
  BG_CSS_SAFE,
  BG_FITS,
  BG_GLASS_DEFAULT,
  BG_SCALE_DEFAULT,
  BG_SCALE_MAX,
  BG_SCALE_MIN,
  BG_TEXT_SCHEMES,
  BG_ZOOM_DEFAULT,
  BG_ZOOM_MAX,
  BG_ZOOM_MIN,
  mediaUrlKindConflict,
  urlExtOf,
  type BgConfig,
  type BgFit,
  type BgTextScheme,
} from '../bg-config.ts'
import {
  bgMediaRender,
  bgThemeColorFor,
  fitCssFor,
  glassSurfaceTokensForTextScheme,
  GLASS_BACKDROP_FILTER,
  GLASS_BACKDROP_SELECTOR,
  maskTokensForTextScheme,
  resolveTextScheme,
  tokensForTextScheme,
  type BgMediaRender,
} from './bg-palette.ts'

// ---- 供验证/复用导出的纯工具（保持名字稳定） ----

export { parseCssColor, relativeLuminance, backgroundLuminance as bgLuminance, resolveTextScheme, fitCssFor, focusPositionCss, tokensForTextScheme, maskTokensForTextScheme, previewThemeFor, glassSurfaceTokensForTextScheme, GLASS_BACKDROP_FILTER, GLASS_BACKDROP_SELECTOR, REVEAL_TOKENS, TOP_REGION_TOKENS, bgMediaRender, bgThemeColorFor, zoomBackgroundSize, cssEscape } from './bg-palette.ts'
export { DEFAULT_BG_CONFIG as bgDefaultConfig, normalizeBgConfig as bgNormalizeConfig, BG_FITS, BG_TEXT_SCHEMES } from '../bg-config.ts'
export { urlExtOf, mediaUrlKindConflict, BG_CSS_SAFE } from '../bg-config.ts'

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
  /** 媒体缩放 0.25..4（v0.4.3；默认 1=不缩放，缩放中心 = 焦点 posX/posY）。 */
  scale: number
  /** 放大聚焦 1..3（v0.5.0；默认 1=不缩放，缩放中心 = 焦点 posX/posY）。 */
  zoom: number
  /** 视频音量 0..1（v0.4 持久化字段；默认 1=满音量）。 */
  volume: number
  /** 毛玻璃质感（v0.6.0；默认 false=关闭：表面半透明 + 背景模糊）。 */
  glass: boolean
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
    scale: BG_SCALE_DEFAULT,
    zoom: BG_ZOOM_DEFAULT,
    volume: 1,
    glass: BG_GLASS_DEFAULT,
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
 * v0.4.3：scale 参与 key（它改变 layer/video 的 transform，变了必须重写）。
 * v0.5.0：zoom 参与 key（它改变 background-size 或 transform，变了必须重写）。
 */
function applyKey(s: BgSnapshot): string {
  return [s.mode, s.value, s.fit, s.textScheme, s.loop, s.mediaKey, s.opacity, s.posX, s.posY, s.scale, s.zoom, s.glass, s.resolvedText].join('\u0000')
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

/** 钳制媒体缩放到 0.25..4（缺省 1=不缩放）。导出供验证。 */
export function clampBgScale(raw: number | undefined, fallback = BG_SCALE_DEFAULT): number {
  const n = typeof raw === 'number' && Number.isFinite(raw) ? raw : fallback
  return Math.min(BG_SCALE_MAX, Math.max(BG_SCALE_MIN, Math.round(n * 20) / 20))
}

/**
 * 钳制放大聚焦 zoom 到 1..3（v0.5.0；缺省 1=不缩放），吸附 0.05 步长。
 * 与 {@link clampBgScale}（0.25–4，可缩小）是两个独立轴：zoom 只放大。
 * 导出供验证。
 */
export function clampBgZoom(raw: number | undefined, fallback = BG_ZOOM_DEFAULT): number {
  const n = typeof raw === 'number' && Number.isFinite(raw) ? raw : fallback
  return Math.min(BG_ZOOM_MAX, Math.max(BG_ZOOM_MIN, Math.round(n * 20) / 20))
}

/** zoom 下限（1=不缩放）：面板滑杆 100%–300% 的下界。导出供验证。 */
export const bgZoomMin = BG_ZOOM_MIN
/** zoom 上限（3=300%）。导出供验证。 */
export const bgZoomMax = BG_ZOOM_MAX

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

// 注：v0.5.0 起 CSS 字面量转义（cssEscape）与媒体渲染计划（bgMediaRender）都住在
// ./bg-palette.ts —— 真实层与预览画布共用同一份实现。

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

/** 按 glass 状态挂/摘 body 上的 data-dsh-bg-glass（毛玻璃 CSS 的作用域标记）。 */
function syncGlassAttribute(on: boolean): void {
  if (typeof document === 'undefined') return
  try {
    if (on) document.body.setAttribute('data-dsh-bg-glass', '')
    else document.body.removeAttribute('data-dsh-bg-glass')
  } catch {
    // 受限/异常 DOM：忽略（不影响背景渲染本身）
  }
}

// ---- v0.5.0 (#E)：<meta name="theme-color"> 同步（窗口/浏览器侧配色的可做部分）----

/** 本插件写过的 meta 状态（用于**完整还原**：只还原我们自己改的内容）。 */
let themeColorMeta: HTMLMetaElement | null = null
let themeColorCreatedByUs = false
let themeColorOriginal: string | null = null

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
function syncThemeColorMeta(color: string | null): void {
  if (typeof document === 'undefined') return
  try {
    if (themeColorMeta === null || !themeColorMeta.isConnected) {
      const existing = typeof document.querySelector === 'function'
        ? document.querySelector('meta[name="theme-color"]') as HTMLMetaElement | null
        : null
      if (existing !== null && existing !== undefined) {
        themeColorMeta = existing
        themeColorCreatedByUs = false
        themeColorOriginal = existing.getAttribute('content')
      } else {
        const created = document.createElement('meta') as HTMLMetaElement
        created.setAttribute('name', 'theme-color')
        themeColorMeta = created
        themeColorCreatedByUs = true
        themeColorOriginal = null
        ;(document.head ?? document.body)?.append(created)
      }
    }
    if (color === null) {
      if (themeColorCreatedByUs) {
        themeColorMeta.remove()
        themeColorMeta = null
        themeColorCreatedByUs = false
        themeColorOriginal = null
        return
      }
      if (themeColorOriginal === null) themeColorMeta.removeAttribute('content')
      else themeColorMeta.setAttribute('content', themeColorOriginal)
      themeColorMeta = null
      themeColorOriginal = null
      return
    }
    themeColorMeta.setAttribute('content', color)
  } catch {
    // 受限/异常 DOM：放弃同步（不影响背景渲染本身）
  }
}

/**
 * 渲染一份快照的完整 CSS 文本（集中管理）：body token 覆盖 + layer 几何 +
 * 媒体渲染 + video 适配。样式卸载即整体移除 → 原主题完整还原。
 */
function buildStyleText(s: BgSnapshot): string {
  const lines: string[] = []
  lines.push('/* dsh-bg-switch v0.4.4 */')
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
  // 1b) v0.4.4 (#2)：遮罩/浮层族 token 必须在 `body *` 上重写 —— 主题把
  //     --dsw-alias-bg-mask-* 与 --dsw-elevation-* 预替换成字面量后声明在
  //     `body, body *`（gradient-shadow-text.css:26-35），只在 body 上覆盖对
  //     设置弹窗的遮罩无效（弹窗会拿到浅色遮罩，把壁纸压成灰）。同特异性重写。
  if (s.resolvedText !== null) {
    const maskTokens = maskTokensForTextScheme(s.resolvedText)
    const maskLines: string[] = []
    for (const [name, value] of Object.entries(maskTokens)) {
      maskLines.push(`  ${name}: ${value} !important;`)
    }
    if (maskLines.length > 0) {
      lines.push('body * {')
      lines.push(...maskLines)
      lines.push('}')
    }
  }
  // 1d) v0.6.0：毛玻璃质感 —— 内容面 token 压透明 + 指定浮层 backdrop-filter。
  //     玻璃只在 glass 开启且存在文字方案（背景生效）时输出；body 上的
  //     data-dsh-bg-glass 属性由 applyBgState 按 glass 状态挂/摘。
  if (s.glass === true && s.resolvedText !== null) {
    const glassTokens = glassSurfaceTokensForTextScheme(s.resolvedText)
    const glassLines: string[] = []
    for (const [name, value] of Object.entries(glassTokens)) {
      glassLines.push(`  ${name}: ${value} !important;`)
    }
    if (glassLines.length > 0) {
      lines.push('body[data-dsh-bg-glass] {')
      lines.push(...glassLines)
      lines.push('}')
    }
    lines.push(`body[data-dsh-bg-glass] :where(${GLASS_BACKDROP_SELECTOR}) {`)
    lines.push(`  backdrop-filter: ${GLASS_BACKDROP_FILTER};`)
    lines.push(`  -webkit-backdrop-filter: ${GLASS_BACKDROP_FILTER};`)
    lines.push('}')
  }
  // 1c) v0.4.4 (#2)：设置弹窗（ui-settings-general SettingsRoot）的遮罩是全屏
  //     浅色/深色实体面，会整块挡住自管背景层 —— 插件的前提是「背景全屏透出」，
  //     所以把它置透明，只留居中的面板本体。面板/文字色已由上面的 token 覆盖。
  lines.push('body div[role="presentation"]:has(> div[role="dialog"][aria-modal="true"]) {')
  lines.push('  background: transparent !important;')
  lines.push('}')
  lines.push('body div[role="presentation"]:has(> div[role="dialog"][aria-modal="true"]) > [aria-hidden="true"] {')
  lines.push('  background: transparent !important;')
  lines.push('}')
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
  //    v0.5.0：image/video 的 CSS 全部来自 bgMediaRender()——与设置页的预览画布
  //    同一份公式（fit / 焦点 / zoom / scale / opacity），不可能与真实效果漂移。
  if (s.mode === 'video') {
    const plan = mediaRenderPlan(s)
    if (plan.video !== null) {
      lines.push(`[${LAYER_ATTR}] video {`)
      lines.push('  width: 100%;')
      lines.push('  height: 100%;')
      lines.push('  display: block;')
      lines.push(`  object-fit: ${plan.video.objectFit};`)
      // v0.3.1：焦点定位（posX/posY 百分比）覆盖 fit 的静态位置
      lines.push(`  object-position: ${plan.video.objectPosition};`)
      // v0.4.3 scale / v0.5.0 zoom：等比缩放——缩放中心 = 焦点 posX/posY
      if (plan.video.transform !== null) {
        lines.push(`  transform-origin: ${plan.video.transformOrigin};`)
        lines.push(`  transform: ${plan.video.transform};`)
      }
      lines.push('}')
    }
  } else if (s.mode === 'image') {
    const plan = mediaRenderPlan(s)
    if (plan.image !== null) {
      lines.push(`[${LAYER_ATTR}] {`)
      lines.push(`  background-image: ${plan.image.backgroundImage};`)
      // v0.5.0：zoom 在 fit=fill 档直接进 background-size（calc(100% * z)），
      // 其余 fit 档与 video 一样走 transform（见 bg-palette.zoomBackgroundSize）
      lines.push(`  background-size: ${plan.image.backgroundSize};`)
      // v0.3.1：焦点定位（posX/posY 百分比）覆盖 fit 的静态位置
      lines.push(`  background-position: ${plan.image.backgroundPosition};`)
      lines.push(`  background-repeat: ${plan.image.backgroundRepeat};`)
      if (plan.image.transform !== null) {
        lines.push(`  transform-origin: ${plan.image.transformOrigin};`)
        lines.push(`  transform: ${plan.image.transform};`)
      }
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
  // 5) v0.6.0：设置弹窗拖动的 CSS 已随 attachDialogDrag 移除（背景改为抽屉交互，
  //    不再需要拖动设置弹窗）。
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

/**
 * v0.5.0：一张快照的媒体渲染计划（**真实全屏层与设置页预览画布的唯一计算入口**）。
 * 源解析规则按 mode 分流（video 只认 http(s)/mediaKey，image 认 mediaKey/任意 value），
 * 其余（fit/焦点/zoom/scale/opacity）全部交给 bg-palette 的纯函数。
 */
function mediaRenderPlan(s: BgSnapshot): BgMediaRender {
  return bgMediaRender({
    mode: s.mode,
    src: s.mode === 'video' ? videoSrcOf(s) : bgMediaSrc(s),
    fit: s.fit,
    posX: s.posX,
    posY: s.posY,
    zoom: s.zoom,
    scale: s.scale,
    opacity: s.opacity,
  })
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
  syncNoPictureStatus()
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
function syncNoPictureStatus(): void {
  if (videoEl === null) return
  const hasPicture = videoEl.videoWidth > 0 && videoEl.videoHeight > 0
  if (hasPicture) {
    if (snapshot.status.error === 'errVideoNoPicture') clearStatusError()
    return
  }
  if (snapshot.video.duration <= 0 || videoEl.paused) return
  // 不覆盖别的运行态错误（缓冲/自动播放提示等）
  if (snapshot.status.error !== '' && snapshot.status.error !== 'errVideoNoPicture') return
  setStatusError('errVideoNoPicture')
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
  // v0.4.3：媒体缩放 0.25..4（1=不缩放）
  next.scale = clampBgScale(doc.scale !== undefined ? doc.scale : snapshot.scale)
  // v0.5.0：放大聚焦 1..3（1=不缩放）
  next.zoom = clampBgZoom(doc.zoom !== undefined ? doc.zoom : snapshot.zoom)
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
    // v0.5.0 (#E)：顺带还原 meta theme-color（off 不该留着上一个背景的窗口配色）
    syncThemeColorMeta(null)
    syncGlassAttribute(false)
    removeLayer()
    notify()
    return
  }
  // v0.5.0 (#E)：窗口/浏览器侧配色提示随背景走（color 用本色、gradient 用均值、
  // image/video 按文字方案反推；见 bg-palette.bgThemeColorFor）
  syncThemeColorMeta(bgThemeColorFor(snapshot.mode, snapshot.value, snapshot.resolvedText))
  // v0.3.1：即时应用包不再让异常静默 —— 任何 DOM/渲染异常都落进 status.error
  // （面板红色错误行展示），并保持此前已建立的 DOM 不回滚（页面不至于被
  // 半应用状态弄坏）。
  try {
    ensureLayer()
    if (layerEl === null || styleEl === null) {
      notify()
      return
    }
    // v0.6.0：毛玻璃作用域标记（body[data-dsh-bg-glass]）随 glass 状态挂/摘
    syncGlassAttribute(snapshot.glass === true)
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
export function applyBg(mode: string, value: string, opts?: Partial<Pick<BgSnapshot, 'fit' | 'textScheme' | 'loop' | 'mediaKey' | 'opacity' | 'posX' | 'posY' | 'scale' | 'zoom' | 'volume'>>): void {
  applyBgState({ mode, value, ...opts } as BgSnapshot)
}

/** 卸载/停用时的完整恢复（移除 style + layer + 视频，状态回 off）。 */
export function restoreBg(): void {
  if (typeof document !== 'undefined') removeLayer()
  syncThemeColorMeta(null)
  pendingWrites.clear()
  clearFlushTimer()
  snapshot = { ...defaultSnapshot(), video: idleVideoUi() }
  lastAppliedKey = applyKey(snapshot)
  notify()
}

// ---- v0.6.0 (#3)：滑动定位/调参期间降低抽屉透明度 ----

/**
 * 交互期标志：我们的壁纸控件（定位/透明度/缩放等滑杆）在 pointerdown→pointerup
 * 期间把它置 true，抽屉据此把自己的面板透明度过渡降低（便于边拖边看壁纸），
 * 松开/失焦/取消即恢复。与旧「降设置弹窗透明度」不同：目标就是**我们自己的抽屉**，
 * 不再去动宿主设置弹窗的 DOM（v0.6.0 背景已从设置页迁到右侧抽屉）。
 */
let adjustingActive = false
const adjustingListeners = new Set<() => void>()

function setAdjusting(on: boolean): void {
  if (adjustingActive === on) return
  adjustingActive = on
  for (const listener of adjustingListeners) listener()
}

function subscribeAdjusting(listener: () => void): () => void {
  adjustingListeners.add(listener)
  return () => { adjustingListeners.delete(listener) }
}

function getAdjusting(): boolean {
  return adjustingActive
}

/** 交互期开关（导出供 UI 与验证调用）。 */
export function bgSetAdjusting(on: boolean): void {
  setAdjusting(on)
}

/** 当前是否处于「正在滑动/调参」状态。导出供验证。 */
export function bgIsAdjusting(): boolean {
  return adjustingActive
}

/** 卸载路径：结束交互期（ctx.effect 清理时调用）。 */
export function disposeAdjusting(): void {
  setAdjusting(false)
}

// ---- v0.6.0 (#2)：右侧抽屉开关（侧栏「更换壁纸」按钮 ↔ shell.overlay 抽屉） ----

/** 抽屉是否打开（模块级 store：侧栏按钮与抽屉是两个 slot 根，跨根共享状态）。 */
let drawerOpen = false
const drawerListeners = new Set<() => void>()

function setDrawerOpen(open: boolean): void {
  if (drawerOpen === open) return
  drawerOpen = open
  // 需求 11：打开期间让聊天区让出抽屉宽度，右缘的「对话电梯」不会被盖住。
  syncDrawerLayoutAttr(open)
  for (const listener of drawerListeners) listener()
}

function subscribeDrawer(listener: () => void): () => void {
  drawerListeners.add(listener)
  return () => { drawerListeners.delete(listener) }
}

function getDrawerOpen(): boolean {
  return drawerOpen
}

/** 切换抽屉开关（导出供侧栏按钮与验证调用）。 */
export function toggleDrawer(): boolean {
  setDrawerOpen(!drawerOpen)
  return drawerOpen
}

/** 当前抽屉是否打开。导出供验证。 */
export function bgIsDrawerOpen(): boolean {
  return drawerOpen
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
export function bgMediaFieldVerdict(
  kind: 'image' | 'video',
  input: string,
  current: { mode: string; mediaKey: string; value: string },
): 'noop' | 'url' | 'local-path' | 'invalid' {
  const v = input.trim()
  if (v === '') return 'invalid'
  if (current.mode === kind && current.mediaKey !== '' && v === current.value) return 'noop'
  if (/^https?:\/\//i.test(v)) return 'url'
  if (/^[a-zA-Z]:[\\/]/.test(v) || v.startsWith('\\\\') || v.startsWith('/') || /^file:/i.test(v)) return 'local-path'
  return 'invalid'
}

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
  // v0.6.0：视频不设体积上限（需求）；图片仍按 config.maxImageMB 预校验。
  if (kind === 'image') {
    const limitMB = cfg.maxImageMB
    if (file.size > limitMB * 1024 * 1024) {
      return { ok: false, errorKey: 'errFileTooBig', detail: `${limitMB}MB` }
    }
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
      case 'scale': return sectionNumber(section, 'scale', BG_SCALE_DEFAULT)
      case 'zoom': return sectionNumber(section, 'zoom', BG_ZOOM_DEFAULT)
      case 'volume': return sectionNumber(section, 'volume', 1)
      case 'glass': return typeof section.glass === 'boolean' ? section.glass : BG_GLASS_DEFAULT
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
      case 'scale': return snapshot.scale
      case 'zoom': return snapshot.zoom
      case 'volume': return snapshot.volume
      case 'glass': return snapshot.glass
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
    // v0.4.3：媒体缩放（schema 默认 1=不缩放）
    const scale = sectionNumber(section, 'scale', BG_SCALE_DEFAULT)
    // v0.5.0：放大聚焦（schema 默认 1=不缩放）
    const zoom = sectionNumber(section, 'zoom', BG_ZOOM_DEFAULT)
    const volume = sectionNumber(section, 'volume', 1)
    // v0.6.0：毛玻璃质感（布尔；缺失回默认 false）
    const glass = typeof section.glass === 'boolean' ? section.glass : BG_GLASS_DEFAULT
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
      mode, value, fit, textScheme, loop, mediaKey, opacity, posX, posY, scale, zoom, volume, glass, cfg,
    } as BgSnapshot
    for (const field of pendingWrites.keys()) {
      if (['mode', 'value', 'fit', 'textScheme', 'loop', 'mediaKey', 'opacity', 'posX', 'posY', 'scale', 'zoom', 'volume', 'glass'].includes(field)) {
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
      // v0.4.3：恢复默认显式回写**全部**运行时字段（含 scale），配合 setBg 的
      // "强制脏"提交 —— 清掉任何残留（透明度/定位/缩放不再留上次的值，#3）。
      // v0.5.0：zoom 一并回 1（新增字段也必须被"恢复默认"清干净）。
      return {
        mode: 'off', value: '', mediaKey: '',
        fit: snapshot.cfg.defaultFit,
        textScheme: snapshot.cfg.defaultTextScheme,
        loop: snapshot.cfg.defaultLoop,
        opacity: 1, posX: 50, posY: 50, scale: BG_SCALE_DEFAULT, zoom: BG_ZOOM_DEFAULT, volume: 1, glass: BG_GLASS_DEFAULT,
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
    if (opts?.scale !== undefined) fields.scale = opts.scale
    if (opts?.zoom !== undefined) fields.zoom = opts.zoom
    if (opts?.volume !== undefined) fields.volume = opts.volume
    if (opts?.glass !== undefined) fields.glass = opts.glass
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
    // 先算"真正变化"的字段（相对应用前的快照），再乐观 apply + 防抖持久化。
    // v0.4.3：resetAll（恢复默认）**不做差值过滤** —— 全部默认字段一律提交，
    // 确保 user 层里任何残留（透明度/定位/缩放/旧媒体键）都被显式覆盖为默认值。
    const dirty: Record<string, unknown> = {}
    for (const [field, fieldValue] of Object.entries(fields)) {
      if (opts?.resetAll === true || !sameValue(fieldCurrent(field), fieldValue)) dirty[field] = fieldValue
    }
    applyBgState({ ...fields } as BgSnapshot)
    persistSoon(dirty)
  }

  const zhPresetDict = Object.fromEntries(Object.entries(PRESET_LABELS_ZH).map(([k, v]) => ['preset.' + k, v]))
  const enPresetDict = Object.fromEntries(Object.entries(PRESET_LABELS_EN).map(([k, v]) => ['preset.' + k, v]))

  ctx.locale?.register('settings.dsh-bg', {
    zh: {
      nav: '壁纸', title: '壁纸', presets: '系统', custom: '自定义',
      color: '纯色', gradient: '渐变', image: '图片', video: '视频',
      applyColor: '应用', applyGradient: '应用', applyImage: '应用', applyVideo: '应用',
      reset: '重置', current: '当前背景', currentOff: '默认（未设置）',
      // v0.6.0：侧栏入口 + 右侧抽屉 + 毛玻璃
      wallpaper: '壁纸', close: '关闭', glass: '毛玻璃质感',
      glassHint: '开启后界面表面半透明并对背景做模糊（磨砂玻璃质感）',
      // v0.5.0 (#B)：缩放（zoom 1..3 → 100%–300%）
      zoomLabel: '缩放',
      // v0.6.0（第五轮）：小图（滚轮缩放 + 拖动定位）+ 行内本地文件按钮
      minimapHint: '在小图里滚动滚轮 = 缩放，按住拖动 = 定位',
      chooseFile: '选择本地文件',
      colorPlaceholder: '#1e2a78', gradientPlaceholder: 'linear-gradient(135deg, #1e2a78, #2b1055)',
      imagePlaceholder: 'https://example.com/wallpaper.jpg',
      videoPlaceholder: 'https://example.com/ocean.mp4',
      localImage: '本地图片',
      localVideo: '本地视频',
      localImageHint: '选择本地图片（≤上限），上传后自动生效；或让模型调用 bg_apply 工具（file 参数）',
      localVideoHint: '选择本地视频：文件只存在本机、只在本机播放，不会上传到云端；选中后自动全屏播放',
      uploading: '上传中…',
      errColor: '颜色需是 #rrggbb 形式（如 #1e2a78）',
      errGradient: '渐变格式无效，请用完整 CSS 渐变',
      errGradientCharset: '渐变里含不允许的字符（只允许 CSS 颜色/渐变语法，不能含 ; { } < >）',
      errImage: '图片地址需以 http(s):// 开头',
      errVideo: '视频地址需以 http(s):// 开头',
      errUrlIsVideo: '这是视频链接（.{ext}）：请切到「视频」页签，或换成图片链接',
      errUrlIsImage: '这是图片链接（.{ext}）：请切到「图片」页签，或换成视频链接',
      errUrlTooLong: '地址过长（上限 2000 字符）',
      errLocalPathImage: '这是本地文件路径：请用下面的「本地图片」按钮选择，输入框只接受 http(s) 链接（当前壁纸保持不变可直接点应用）',
      errLocalPathVideo: '这是本地文件路径：请用下面的「本地视频」按钮选择，输入框只接受 http(s) 链接（当前壁纸保持不变可直接点应用）',
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
      // v0.4.3：媒体自由缩放（0.25–4 → 25%–400%）
      scaleLabel: '缩放',
      errApply: '应用背景时出错，请重试或先恢复默认',
      errVideoLoad: '视频加载失败（未给出具体原因）：请确认链接可直接播放',
      errVideoAborted: '视频加载被中止（MEDIA_ERR_ABORTED=1）',
      errVideoNetwork: '视频加载失败：网络错误（MEDIA_ERR_NETWORK=2），请检查链接能否直接访问',
      errVideoDecode: '视频加载失败：解码错误（MEDIA_ERR_DECODE=3），格式可能不受支持或文件已损坏',
      errVideoSrc: '视频源不受支持（MEDIA_ERR_SRC_NOT_SUPPORTED=4）：链接无法直接播放或格式未被允许',
      errVideoAutoplay: '浏览器阻止了自动播放，请点击「播放」开始',
      errVideoStalled: '视频网络较慢或服务器暂时无响应，正在等待数据…',
      errVideoNoPicture: '视频只有声音、没有画面：视频轨编码可能不受支持（如 H.265/HEVC、ProRes），请换 H.264(AVC) 编码的 MP4',
      // v0.4.1：弹窗（#7）标题与确认钮
      notice: '提示', ok: '知道了',
      ...zhPresetDict,
    },
    en: {
      nav: 'Wallpaper', title: 'Wallpaper', presets: 'System', custom: 'Custom',
      color: 'Color', gradient: 'Gradient', image: 'Image', video: 'Video',
      applyColor: 'Apply', applyGradient: 'Apply', applyImage: 'Apply', applyVideo: 'Apply',
      reset: 'Reset', current: 'Current', currentOff: 'Default (unset)',
      // v0.6.0: sidebar entry + right drawer + frosted glass
      wallpaper: 'Wallpaper', close: 'Close', glass: 'Frosted glass',
      glassHint: 'Make surfaces translucent and blur the background behind them',
      // v0.5.0 (#B): zoom (1..3 → 100%–300%)
      zoomLabel: 'Zoom',
      // v0.6.0 (round 5): the mini map (wheel = zoom, drag = position) + inline file button
      minimapHint: 'Scroll inside the mini map to zoom; drag to set the focus position',
      chooseFile: 'Choose a local file',
      colorPlaceholder: '#1e2a78', gradientPlaceholder: 'linear-gradient(135deg, #1e2a78, #2b1055)',
      imagePlaceholder: 'https://example.com/wallpaper.jpg',
      videoPlaceholder: 'https://example.com/ocean.mp4',
      localImage: 'Local image',
      localVideo: 'Local video',
      localImageHint: 'Pick a local image (up to the limit); it uploads and takes effect automatically. Or ask the assistant to call bg_apply with a file path',
      localVideoHint: 'Pick a local video: the file stays on this machine and is never uploaded to any cloud service; it plays fullscreen right away',
      uploading: 'Uploading…',
      errColor: 'Color must be like #rrggbb (e.g. #1e2a78)',
      errGradient: 'Invalid gradient. Use a full CSS gradient',
      errGradientCharset: 'The gradient contains forbidden characters (only CSS color/gradient syntax; no ; { } < >)',
      errImage: 'Image URL must start with http(s)://',
      errVideo: 'Video URL must start with http(s)://',
      errUrlIsVideo: 'That is a video link (.{ext}): switch to the Video tab, or use an image link',
      errUrlIsImage: 'That is an image link (.{ext}): switch to the Image tab, or use a video link',
      errUrlTooLong: 'URL too long (2000 characters max)',
      errLocalPathImage: 'That is a local file path: pick the file with the Local image button below. The field takes http(s) links only (clicking Apply on the current wallpaper changes nothing)',
      errLocalPathVideo: 'That is a local file path: pick the file with the Local video button below. The field takes http(s) links only (clicking Apply on the current wallpaper changes nothing)',
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
      // v0.4.3: media free zoom (0.25–4 → 25%–400%)
      scaleLabel: 'Zoom',
      errApply: 'Failed to apply the background. Retry or reset to default first',
      errVideoLoad: 'Video failed to load (no specific reason): make sure the link streams directly',
      errVideoAborted: 'Video load aborted (MEDIA_ERR_ABORTED=1)',
      errVideoNetwork: 'Video failed to load: network error (MEDIA_ERR_NETWORK=2). Check the link is directly reachable',
      errVideoDecode: 'Video failed to load: decode error (MEDIA_ERR_DECODE=3). The format may be unsupported or the file is corrupt',
      errVideoSrc: 'Video source not supported (MEDIA_ERR_SRC_NOT_SUPPORTED=4): the link is not directly playable or the format is not allowed',
      errVideoAutoplay: 'Autoplay was blocked by the browser. Click Play to start',
      errVideoStalled: 'The video network is slow or the server is not responding; waiting for data…',
      errVideoNoPicture: 'The video has sound but no picture: its video track may use an unsupported codec (H.265/HEVC, ProRes). Use an H.264 (AVC) MP4',
      // v0.4.1: popup (#7) title + confirm
      notice: 'Notice', ok: 'OK',
      ...enPresetDict,
    },
  })

  // v0.6.0：背景不再进设置页。改为两个 slot：
  // 1) sidebar.footer.action —— 设置按钮上方的「更换壁纸」入口（切换右侧抽屉）；
  // 2) shell.overlay —— 聊天界面右侧弹出的抽屉（承载原背景设置内容）。
  ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
    name: 'sidebar.footer.action',
    id: 'dsh-bg',
    order: 0,
    label: () => text('wallpaper'),
    inject: () => ({ text }),
  }, BgSidebarAction))

  ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay',
    id: 'dsh-bg',
    order: 0,
    label: () => text('wallpaper'),
    inject: () => ({ setBg, text }),
  }, BgDrawer))

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
      // v0.6.0：卸载时结束交互期降透明 + 关闭抽屉
      disposeAdjusting()
      setDrawerOpen(false)
    }
  })

  // v0.6.0（需求 11）：抽屉打开期间"聊天让位 + 保留电梯"的全局样式（独立于背景
  // 引擎的 dsh-bg-style，没有背景时也生效）。卸载即摘掉样式与 body 标记。
  ctx.effect(() => installDrawerLayoutStyle())
}

// ---- 面板组件（纯 react/jsx + 内联样式，无官方组件库） ----

/** UI setBg 选项（v0.4 增 volume；v0.4.3 增 scale；resetAll = 整命名空间重置）。 */
export interface BgApplyOpts {
  fit?: BgFit
  textScheme?: BgTextScheme
  loop?: boolean
  mediaKey?: string
  opacity?: number
  posX?: number
  posY?: number
  /** 媒体缩放 0.25..4（image/video；1=不缩放，缩放中心 = 焦点 posX/posY）。 */
  scale?: number
  /** 放大聚焦 1..3（image/video；v0.5.0；1=不缩放，缩放中心 = 焦点 posX/posY）。 */
  zoom?: number
  /** 视频音量 0..1（持久化字段；默认 1）。 */
  volume?: number
  /** 毛玻璃质感（v0.6.0；默认 false）。 */
  glass?: boolean
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

  // ---- v0.6.0：调参/拖动时降低抽屉透明度（目标就是我们的抽屉） ----
  /**
   * 需求（第三轮 5 / 第五轮 2）：**只有真的在拖动才降透明**。
   *
   * 旧实现把降透明挂在 pointerdown 上，于是"单击滑条轨道跳一个值"（pointerdown
   * 紧接 pointerup、指针没动过）也会让抽屉闪一下 22% —— 用户看到的就是"点击时也
   * 降透明"。现在 pointerdown 只记起点，指针**移动超过 3px** 才置交互期；
   * pointerup / pointercancel / blur 收尾。监听挂 document，拖出控件盒子也不丢。
   */
  const DIM_DRAG_PX = 3
  const dimPress = useRef<{ on: boolean; cleanup: () => void } | null>(null)
  const dimPressEnd = (): void => { dimPress.current?.cleanup() }
  const dimPressBegin = (x: number, y: number): void => {
    dimPressEnd()
    const state = { on: false }
    const doc = (globalThis as { document?: { addEventListener?: Function; removeEventListener?: Function } }).document
    function cleanup(): void {
      doc?.removeEventListener?.('pointermove', onMove as never)
      doc?.removeEventListener?.('pointerup', cleanup as never)
      doc?.removeEventListener?.('pointercancel', cleanup as never)
      if (state.on) bgSetAdjusting(false)
      if (dimPress.current !== null && dimPress.current.cleanup === cleanup) dimPress.current = null
    }
    function onMove(e: { clientX?: number; clientY?: number }): void {
      if (state.on) return
      const cx = Number.isFinite(e.clientX) ? Number(e.clientX) : x
      const cy = Number.isFinite(e.clientY) ? Number(e.clientY) : y
      if (Math.hypot(cx - x, cy - y) < DIM_DRAG_PX) return
      state.on = true
      bgSetAdjusting(true)
    }
    dimPress.current = { get on() { return state.on }, cleanup }
    doc?.addEventListener?.('pointermove', onMove as never)
    doc?.addEventListener?.('pointerup', cleanup as never)
    doc?.addEventListener?.('pointercancel', cleanup as never)
  }
  // 组件卸载（关抽屉）时收尾，避免监听泄漏 + 交互期悬空（重开抽屉时停在 22%）
  useEffect(() => () => { dimPress.current?.cleanup(); bgSetAdjusting(false) }, [])
  const dimHandlers = {
    onPointerDown: (e: { clientX?: number; clientY?: number }) => {
      dimPressBegin(Number.isFinite(e?.clientX) ? Number(e?.clientX) : 0, Number.isFinite(e?.clientY) ? Number(e?.clientY) : 0)
    },
    onPointerUp: () => { dimPressEnd() },
    onPointerCancel: () => { dimPressEnd() },
    onBlur: () => { dimPressEnd() },
    onKeyDown: () => { bgSetAdjusting(true) },
    onKeyUp: () => { bgSetAdjusting(false) },
  }

  /** 滚轮缩放没有 pointerup —— 用一段静默期自动结束降透明。 */
  const dimTimer = useRef<unknown>(undefined)
  const dimAutoOff = (): void => {
    const g = globalThis as { setTimeout?: (cb: () => void, ms: number) => unknown; clearTimeout?: (h: unknown) => void }
    bgSetAdjusting(true)
    g.clearTimeout?.(dimTimer.current)
    dimTimer.current = g.setTimeout?.(() => { bgSetAdjusting(false) }, 420)
  }
  useEffect(() => () => {
    const g = globalThis as { clearTimeout?: (h: unknown) => void }
    g.clearTimeout?.(dimTimer.current)
  }, [])

  // ---- v0.4.1：tabs 布局（预设 / 纯色 / 渐变 / 图片 / 视频）----
  const tabForMode = (mode: string): string => (mode === 'color' || mode === 'gradient' || mode === 'image' || mode === 'video' ? mode : 'presets')
  // v0.4.4 (#1)：tab 只在**挂载时**按当前背景决定一次，之后完全跟着用户点击走。
  // 之前挂了一个 `useEffect(..., [snap.mode])` 想在应用背景后自动切 tab，副作用是
  // 点「预设皮肤」里的极夜/深蓝紫（mode 从 off 变成 color/gradient）会立刻把用户
  // 从「预设皮肤」tab 弹到「纯色」/「渐变」tab —— 点预设像跳页。预设皮肤本来就
  // 是「一键换肤」，不需要切 tab 编辑参数，所以直接删掉自动切换。
  const [tab, setTab] = useState<string>(() => tabForMode(snap.mode))

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

  /**
   * 需求 1：不带标签的行 —— 四个来源页签（纯色/渐变/图片/视频）里的编辑行都只留
   * 「输入框 + （图片/视频再加一个本地文件图标）+ 应用按钮」（页签本身已经说明了
   * 来源，再写一遍是重复）。可变参数便于把隐藏的 file input 一起塞进行里。
   */
  const plainRow = (...children: unknown[]) =>
    jsx('div', {
      style: { display: 'flex', gap: '8px', alignItems: 'center', margin: '6px 0', flexWrap: 'wrap' },
      children,
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
    if (v.length > 300) {
      setError(text('errGradient'))
      return
    }
    const open = v.indexOf('(')
    const head = (open >= 0 ? v.slice(0, open + 1) : '').toLowerCase()
    if (!['linear-gradient(', 'radial-gradient(', 'conic-gradient('].includes(head)) {
      setError(text('errGradient'))
      return
    }
    // v0.6.0：与 bg_apply 同一份载荷校验 —— 旧实现只查前缀，`;` `{` `}` 会被写进
    // 我们自管的 <style>，可注入额外规则。字符集白名单堵住它。
    if (!BG_CSS_SAFE.test(v)) {
      setError(text('errGradientCharset'))
      return
    }
    setError('')
    setBg('gradient', v)
  }
  /**
   * 需求 6：输入框回显的可能是**本地文件**的当前值（UI 上传记文件名、`bg_apply
   * file` 记绝对路径）。判定收敛在 bgMediaFieldVerdict 里：
   * noop = 当前本地媒体且没改 → 保持不变；local-path = 换成别的本地路径 → 提示用
   * 本地选择按钮；invalid = 空/乱文本 → 提示需要 http(s)。
   */
  const applyImageUrl = (): void => {
    const v = imageUrl.trim()
    const verdict = bgMediaFieldVerdict('image', v, snap)
    if (verdict === 'noop') { setError(''); return }
    if (verdict === 'local-path') { setError(text('errLocalPathImage')); return }
    if (verdict === 'invalid') { setError(text('errImage')); return }
    // v0.6.0：与 bg_apply 同一份长度上限（旧实现只查前缀，超长 URL 会直接进 settings）
    if (v.length > 2000) {
      setError(text('errUrlTooLong'))
      return
    }
    // v0.6.0：跨类型校验 —— 明显是视频链接（.mp4/.webm/…）时不放行
    if (mediaUrlKindConflict(v, 'image', snap.cfg) === 'is-video') {
      setError(text('errUrlIsVideo').replace('{ext}', urlExtOf(v)))
      return
    }
    setError('')
    setBg('image', v)
  }
  const applyVideoUrl = (): void => {
    const v = videoUrl.trim()
    const verdict = bgMediaFieldVerdict('video', v, snap)
    if (verdict === 'noop') { setError(''); return }
    if (verdict === 'local-path') { setError(text('errLocalPathVideo')); return }
    if (verdict === 'invalid') { setError(text('errVideo')); return }
    if (v.length > 2000) {
      setError(text('errUrlTooLong'))
      return
    }
    // v0.6.0：跨类型校验 —— 明显是图片链接（.jpg/.png/…）时不放行
    if (mediaUrlKindConflict(v, 'video', snap.cfg) === 'is-image') {
      setError(text('errUrlIsImage').replace('{ext}', urlExtOf(v)))
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

  // ---- 第五轮需求 3：本地文件收进一个图标按钮（代替原来的「本地图片/视频」标签行） ----
  const imageFileRef = useRef<unknown>(null)
  const videoFileRef = useRef<unknown>(null)
  /** 点图标 = 触发对应的隐藏 <input type=file>（浏览器只允许用户手势里这么做）。 */
  const openFilePicker = (kind: 'image' | 'video'): void => {
    const el = (kind === 'image' ? imageFileRef.current : videoFileRef.current) as { click?: () => void } | null
    try { el?.click?.() } catch { /* 非真实元素：忽略 */ }
  }
  /** 隐藏的 file input：`display:none` 之后浏览器不再渲染"未选择任何文件"文案。 */
  const fileInput = (kind: 'image' | 'video', ref: unknown, accept: string) =>
    jsx('input', {
      key: 'file',
      ref,
      type: 'file',
      accept,
      disabled: uploading !== '',
      style: { display: 'none' },
      onChange: (e: { target: { files: FileList | null; value?: string } }) => {
        void uploadLocal(kind, e.target.files?.[0] ?? undefined)
        // 清掉 value：连续选同一个文件也要能再次触发 change
        try { if (e.target.value !== undefined) e.target.value = '' } catch { /* noop */ }
      },
    })
  /** 行内的本地文件图标按钮：作用等于"选择本地文件"。 */
  const filePickButton = (kind: 'image' | 'video') =>
    jsx('button', {
      key: 'pick',
      type: 'button',
      'data-testid': kind === 'image' ? 'dsh-bg-image-file' : 'dsh-bg-video-file',
      'aria-label': text('chooseFile'),
      title: text('chooseFile'),
      disabled: uploading !== '',
      onClick: () => { openFilePicker(kind) },
      style: {
        boxSizing: 'border-box',
        width: '32px',
        height: '32px',
        flexShrink: 0,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: uploading !== '' ? 'not-allowed' : 'pointer',
        opacity: uploading !== '' ? 0.5 : 1,
        padding: 0,
        border: '1px solid var(--dsw-alias-border-l2, #ccc)',
        borderRadius: '6px',
        background: 'transparent',
        color: 'var(--dsw-alias-label-secondary, #666)',
        fontSize: '0.75em',
      },
      children: uploading === kind ? '…' : folderIcon(16),
    })

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
  /**
   * v0.5.0：**缩放（zoom）滑杆 100%–300%** —— 面板上的"缩放"控件改用 zoom（在
   * fit 基准尺寸上放大聚焦，见 bgMediaRender）：写快照即时渲染 + 防抖持久化。
   * 若 settings 里还留着 v0.4.3 的 `scale`（≠1），本次一并把它归 1 —— 两条缩放轴
   * 相乘会把画面放大两次（隐藏的坑），归 1 后行为可预期。
   */
  const changeZoom = (percent: number): void => {
    setError('')
    const zoom = clampBgZoom(percent / 100)
    const opts: BgApplyOpts = snap.scale === BG_SCALE_DEFAULT ? { zoom } : { zoom, scale: BG_SCALE_DEFAULT }
    setBg(snap.mode, snap.value, opts)
  }
  /** v0.6.0：毛玻璃质感开关（持久化 glass 字段）。 */
  const changeGlass = (checked: boolean): void => {
    setError('')
    setBg(snap.mode, snap.value, { glass: checked })
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

  /** v0.4.4 (#3)：恢复默认（只重置背景命名空间，不影响其它设置页）。 */
  const resetToDefault = (): void => {
    closePopups()
    setBg('off', '', { resetAll: true })
  }

  const fitSelect = jsx('select', {
    value: snap.fit,
    disabled: !isWallpaper,
    onChange: (e: { target: { value: string } }) => changeFit(e.target.value),
    // v0.6.0（需求 10）：适配是**离散下拉**，点一下不该让抽屉忽明忽暗 —— 不再挂降透明；
    // 只有定位/缩放这些连续滑杆在拖动时降透明（见 sliderRow 的 dim 参数）。
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

  // v0.4.3（#1）：媒体/视频专属控件**只在对应 tab 显示** —— 切到「预设皮肤」等
  // 其他 tab 时，视频进度条/控制行/音量/适配/滑杆不再残留（背景本身不受影响）。
  const mediaTabActive = isWallpaper && tab === snap.mode
  const videoTabActive = snap.mode === 'video' && tab === 'video'

  // v0.4.1：进度条 seek（#8）——拖动/点击移动到对应播放位置；无元数据时禁用。
  const durSec = snap.video.duration
  const curSec = snap.video.currentTime
  const seekReady = durSec > 0
  const progressRow = videoTabActive
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

  const videoControlRow = videoTabActive
    ? jsx('div', {
        'data-testid': 'dsh-bg-video-controls',
        style: { display: 'flex', gap: '8px', alignItems: 'center', margin: '8px 0 6px 52px', flexWrap: 'wrap' },
        children: [
          // 第二轮需求 2：播放/停止合并成**一个图标按钮** —— 暂停中显示 ▶（播放），
          // 播放中显示 ■（停止）。原来的「播放/暂停」「停止」两个文字按钮取消。
          jsx('button', {
            type: 'button',
            key: 'playstop',
            'data-testid': 'dsh-bg-video-playstop',
            'aria-label': snap.video.paused ? text('play') : text('stop'),
            title: snap.video.paused ? text('play') : text('stop'),
            onClick: () => { if (snap.video.paused) bgVideoToggle(); else bgVideoStop() },
            style: {
              boxSizing: 'border-box',
              width: '28px',
              height: '28px',
              flexShrink: 0,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              padding: 0,
              border: '1px solid var(--dsw-alias-border-l2, #ccc)',
              borderRadius: '50%',
              background: 'transparent',
              color: 'var(--dsw-alias-label-primary, #111)',
            },
            children: snap.video.paused ? playIcon(14) : stopIcon(14),
          }),
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
  // v0.5.0 (#C)：滑杆都挂 dimHandlers —— 拖动期间设置弹窗降到 ~10%（松开恢复），
  // 这样"边拖边看"能直接看到壁纸本身的变化。
  const sliderRow = (
    labelText: string,
    min: number,
    max: number,
    step: number,
    value: number,
    suffix: string,
    onInput: (v: number) => void,
    dim = false,
  ) => jsx('div', {
    style: { display: 'flex', gap: '8px', alignItems: 'center', margin: '6px 0', flexWrap: 'wrap' },
    children: [
      jsx('span', { style: { width: '64px', flexShrink: 0, fontSize: '0.9em' }, children: labelText }),
      jsx('input', {
        type: 'range', min, max, step, value,
        onChange: (e: { target: { value: string } }) => onInput(Number(e.target.value)),
        ...(dim ? dimHandlers : {}),
        style: { flex: 1, minWidth: '120px' },
      }),
      jsx('span', {
        style: { width: '52px', textAlign: 'right', fontSize: '0.85em', opacity: 0.8 },
        children: `${value}${suffix}`,
      }),
    ],
  })
  // ---- v0.6.0（第五轮需求 1）：小图 —— 滚轮缩放 + 拖动定位 ----
  /**
   * 一块小图（16:9，只画当前背景本身），把「缩放」与「定位」两个功能合到一个控件上：
   * - **滚轮**在小图里滚动 = 缩放（zoom 1..3，按 1.1 的倍率、吸附 0.05）；
   * - **按住拖动** = 定位（posX / posY，拖满小图宽/高 = 0→100 全量程）。
   *
   * 小图用 mediaRenderPlan(snap) 渲染 —— 与真实全屏层同一份公式（fit / 焦点 /
   * zoom / scale / opacity），所以小图里看到的就是主界面的效果，不是另一套近似。
   * 拖动/滚轮期间同样进入交互期（抽屉降透明，见 dimHandlers / dimAutoOff）。
   */
  const mapRef = useRef<unknown>(null)
  /** 视频模式下的小图画布：直接镜像真实层那一帧（见 videoMirrorDraw）。 */
  const mapCanvasRef = useRef<unknown>(null)
  const mapPlan: BgMediaRender = mediaRenderPlan(snap)
  const mapSource = snap.mode === 'video' ? videoSrcOf(snap) : (snap.mode === 'image' ? bgMediaSrc(snap) : null)
  const mapEnabled = mediaTabActive && mapSource !== null
  /** 越界宽限毫秒数（第五轮需求 4：拖出边界后 2 秒内仍可继续定位）。 */
  const MAP_GRACE_MS = 2000
  /** 指针是否正处在小图边界之外（驱动明暗闪动边框，需求 5）。 */
  const [mapOutside, setMapOutside] = useState(false)
  /** 当前这次小图拖动：只需保留"结束拖动"的能力（其余状态在闭包里）。 */
  const mapDrag = useRef<{ outside: boolean; cleanup: () => void } | null>(null)

  // 滚轮必须是非 passive 的监听（React 的 onWheel 在根上挂 passive，preventDefault 无效），
  // 所以这里用原生 addEventListener + { passive: false }。
  /**
   * fit → 在给定盒子里的基准尺寸（与 CSS 的 background-size / object-fit 同一套规则）。
   * 小图的视频画布用它复算真实层的构图。
   */
  const fitBoxSize = (vw: number, vh: number, W: number, H: number, fit: string): { w: number; h: number } => {
    if (fit === 'fill') return { w: W, h: H }
    if (fit === 'contain') { const s = Math.min(W / vw, H / vh); return { w: vw * s, h: vh * s } }
    if (fit === 'center' || fit === 'tile') return { w: vw, h: vh }
    const s = Math.max(W / vw, H / vh)
    return { w: vw * s, h: vh * s }
  }

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
  const videoMirrorDraw = (): void => {
    const canvas = mapCanvasRef.current as {
      width: number
      height: number
      clientWidth: number
      clientHeight: number
      getContext?: (id: string) => { clearRect: Function; drawImage: Function } | null
    } | null
    const src = videoEl
    if (canvas === null || canvas === undefined || src === null) return
    const vw = src.videoWidth
    const vh = src.videoHeight
    const W = canvas.clientWidth
    const H = canvas.clientHeight
    if (!(vw > 0) || !(vh > 0) || !(W > 0) || !(H > 0)) return
    const ctx = canvas.getContext?.('2d')
    if (ctx === null || ctx === undefined) return
    if (canvas.width !== W) canvas.width = W
    if (canvas.height !== H) canvas.height = H
    const s = getSnapshot()
    const base = fitBoxSize(vw, vh, W, H, s.fit)
    const z = clampBgZoom(s.zoom)
    const px = clampBgPos(s.posX) / 100
    const py = clampBgPos(s.posY) / 100
    const left0 = px * (W - base.w)
    const top0 = py * (H - base.h)
    const originX = px * W
    const originY = py * H
    try {
      ctx.clearRect(0, 0, W, H)
      ctx.drawImage(
        src,
        originX + (left0 - originX) * z,
        originY + (top0 - originY) * z,
        base.w * z,
        base.h * z,
      )
    } catch {
      // 跨域污染 / 尚未就绪：忽略（小图停在上一次成功的帧）
    }
  }
  // 只在「视频模式 + 小图可见」时按 ~7fps 复帧：够定位用，也不额外占 CPU
  useEffect(() => {
    if (!mapEnabled || snap.mode !== 'video') return
    const g = globalThis as { setInterval?: (cb: () => void, ms: number) => unknown; clearInterval?: (h: unknown) => void }
    videoMirrorDraw()
    const handle = g.setInterval?.(() => { videoMirrorDraw() }, 140)
    return () => { g.clearInterval?.(handle) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapEnabled, snap.mode])

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
  useEffect(() => {
    const doc = (globalThis as { document?: { addEventListener?: Function; removeEventListener?: Function } }).document
    if (doc === null || doc === undefined || typeof doc.addEventListener !== 'function') return
    const onWheel = (e: { deltaY?: number; preventDefault?: () => void; target?: unknown }): void => {
      const box = mapRef.current as { contains?: (node: unknown) => boolean } | null
      if (box === null || box === undefined || typeof box.contains !== 'function') return
      const target = e.target
      if (target === null || target === undefined) return
      try {
        if (!box.contains(target)) return
      } catch {
        return
      }
      try { e.preventDefault?.() } catch { /* noop */ }
      const current = getSnapshot()
      const step = (e.deltaY ?? 0) < 0 ? 1.1 : 1 / 1.1
      const next = clampBgZoom(current.zoom * step)
      if (next === clampBgZoom(current.zoom)) return
      setError('')
      setBg(current.mode, current.value, { zoom: next })
      dimAutoOff()
    }
    doc.addEventListener('wheel', onWheel, { passive: false, capture: true })
    return () => { doc.removeEventListener?.('wheel', onWheel, { capture: true }) }
    // setBg 来自注入（apply 闭包里的稳定引用）；其余取值都走 getSnapshot，避免闭包过期
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setBg])

  /**
   * 小图拖动（第五轮需求 4/5）：定位 + **2 秒越界宽限**。
   * - 指针拖出小图边界后**不立刻结束**：2 秒内仍可继续定位（位置继续跟随、夹 0..100）；
   *   中途回到边界内则取消计时；2 秒到点（或松手）才真正离开边界、结束这次拖动。
   * - 越界期间小图边框走明暗闪动动画（需求 5），说明"正在边界外操作"。
   * 监听挂 document：拖出小图后照样收得到 pointermove / pointerup。
   */
  const mapPointerDown = (e: {
    clientX?: number
    clientY?: number
    currentTarget?: { getBoundingClientRect?: () => { left: number; top: number; right: number; bottom: number; width: number; height: number } }
  }): void => {
    mapEndDrag()
    const box = e.currentTarget?.getBoundingClientRect?.()
    const doc = (globalThis as { document?: { addEventListener?: Function; removeEventListener?: Function } }).document
    const g = globalThis as { setTimeout?: (cb: () => void, ms: number) => unknown; clearTimeout?: (h: unknown) => void }
    const start = getSnapshot()
    const state = {
      x: Number.isFinite(e.clientX) ? Number(e.clientX) : 0,
      y: Number.isFinite(e.clientY) ? Number(e.clientY) : 0,
      width: box !== undefined && box.width > 0 ? box.width : 1,
      height: box !== undefined && box.height > 0 ? box.height : 1,
      posX: start.posX,
      posY: start.posY,
      box: box ?? null,
      outside: false,
      grace: undefined as unknown,
    }
    function clearGrace(): void {
      if (state.grace !== undefined) {
        g.clearTimeout?.(state.grace)
        state.grace = undefined
      }
    }
    function leave(): void {
      clearGrace()
      doc?.removeEventListener?.('pointermove', onMove as never)
      doc?.removeEventListener?.('pointerup', leave as never)
      doc?.removeEventListener?.('pointercancel', leave as never)
      if (state.outside) setMapOutside(false)
      if (mapDrag.current !== null && mapDrag.current.cleanup === leave) mapDrag.current = null
      dimHandlers.onPointerUp()
    }
    function onMove(ev: { clientX?: number; clientY?: number }): void {
      const cx = Number.isFinite(ev.clientX) ? Number(ev.clientX) : state.x
      const cy = Number.isFinite(ev.clientY) ? Number(ev.clientY) : state.y
      // 定位：拖满小图宽/高 = 0→100 全量程（夹在 0..100）
      const cur = getSnapshot()
      const nx = clampBgPos(state.posX + (cx - state.x) / state.width * 100)
      const ny = clampBgPos(state.posY + (cy - state.y) / state.height * 100)
      if (nx !== cur.posX || ny !== cur.posY) {
        setError('')
        setBg(cur.mode, cur.value, { posX: nx, posY: ny })
      }
      // 越界宽限：出界不立刻结束，2 秒后自动离开边界
      const r = state.box
      if (r === null) return
      const inside = cx >= r.left && cx <= r.right && cy >= r.top && cy <= r.bottom
      if (inside) {
        if (state.outside) {
          state.outside = false
          clearGrace()
          setMapOutside(false)
        }
        return
      }
      if (state.outside) return
      state.outside = true
      setMapOutside(true)
      state.grace = g.setTimeout?.(() => { leave() }, MAP_GRACE_MS)
    }
    doc?.addEventListener?.('pointermove', onMove as never)
    doc?.addEventListener?.('pointerup', leave as never)
    doc?.addEventListener?.('pointercancel', leave as never)
    mapDrag.current = { outside: state.outside, cleanup: leave }
    dimHandlers.onPointerDown(e)
  }
  const mapEndDrag = (): void => { mapDrag.current?.cleanup() }

  const mapLayerStyle = (extra: Record<string, string>): Record<string, string> => ({
    position: 'absolute', inset: '0', opacity: `${mapPlan.opacity}`, ...extra,
  })
  const minimapBlock = mapEnabled
    ? jsx('div', {
        'data-testid': 'dsh-bg-minimap',
        style: { margin: '2px 0 8px' },
        children: [
          jsx('div', {
            ref: mapRef,
            'data-testid': 'dsh-bg-minimap-box',
            'data-dsh-bg-map-outside': mapOutside ? '' : undefined,
            // 拖动/移动/松开都走 document 监听（见 mapPointerDown）：拖出小图后
            // 2 秒宽限期内仍能继续定位，所以元素上只留 pointerdown 起点。
            onPointerDown: mapPointerDown,
            title: text('minimapHint'),
            style: {
              position: 'relative',
              width: '100%',
              aspectRatio: '16 / 9',
              maxHeight: '180px',
              borderRadius: '10px',
              overflow: 'hidden',
              border: '1px solid var(--dsw-alias-border-l2, #ccc)',
              backgroundColor: 'var(--dsw-alias-bg-layer-3, #eee)',
              cursor: mapOutside ? 'grabbing' : 'grab',
              touchAction: 'none',
              userSelect: 'none',
              // 需求 5：越界期间边框明暗闪动（keyframes 在抽屉布局样式表里）
              animation: mapOutside ? 'dsh-bg-minimap-outside 0.9s ease-in-out infinite' : undefined,
            },
            children: [
              mapPlan.image !== null
                ? jsx('div', {
                    'data-dsh-bg-minimap-layer': '',
                    style: mapLayerStyle({
                      backgroundImage: mapPlan.image.backgroundImage,
                      backgroundSize: mapPlan.image.backgroundSize,
                      backgroundPosition: mapPlan.image.backgroundPosition,
                      backgroundRepeat: mapPlan.image.backgroundRepeat,
                      ...(mapPlan.image.transform !== null
                        ? { transformOrigin: mapPlan.image.transformOrigin, transform: mapPlan.image.transform }
                        : {}),
                    }),
                  })
                : jsx('video', {
                    'data-dsh-bg-minimap-video': '',
                    ref: mapCanvasRef,
                    style: mapLayerStyle({ width: '100%', height: '100%', display: 'block' }),
                  }),
            ],
          }),
          jsx('p', {
            style: { fontSize: '0.75em', opacity: 0.6, margin: '6px 0 0' },
            children: text('minimapHint'),
          }),
        ],
      })
    : null

  const wallpaperSliders = mediaTabActive
    ? [
        // v0.6.0（第三轮需求 5）：透明度滑杆也要降透明 —— 拖它的时候同样是在调壁纸
        // 观感，抽屉不降透明就看不见变化。位移/缩放/透明度这些**连续滑杆**统一降，
        // 只有适配（离散下拉）不降（见 fitSelect）。
        sliderRow(text('opacityLabel'), 0, 100, 5, Math.round(snap.opacity * 100), '%', (v) => {
          setError('')
          setBg(snap.mode, snap.value, { opacity: v / 100 })
        }, true),
        sliderRow(text('posXLabel'), 0, 100, 1, Math.round(snap.posX), '%', (v) => {
          setError('')
          setBg(snap.mode, snap.value, { posX: v })
        }, true),
        sliderRow(text('posYLabel'), 0, 100, 1, Math.round(snap.posY), '%', (v) => {
          setError('')
          setBg(snap.mode, snap.value, { posY: v })
        }, true),
        // v0.5.0：**缩放（zoom）100%–300%**（1=100%=不缩放；缩放中心 = 焦点定位）
        // —— 面板上原来那条 v0.4.3 的 scale 滑杆（25%–400%）被本行取代（zoom 是
        // 主缩放轴；scale 仍是 schema/工具的兼容字段，见 changeZoom）。
        sliderRow(text('zoomLabel'), Math.round(BG_ZOOM_MIN * 100), Math.round(BG_ZOOM_MAX * 100), 5,
          Math.round(clampBgZoom(snap.zoom) * 100), '%', changeZoom, true),
      ]
    : []
  // v0.4：音量滑杆（仅视频 tab 显示；0–100% → volume 0–1）
  volumeRow = videoTabActive
    ? sliderRow(text('volume'), 0, 100, 5, Math.round(clampBgVolume(snap.volume) * 100), '%', changeVolume)
    : null

  const currentLabel = snap.mode === 'off' || snap.mode === ''
    ? text('currentOff')
    : `${text('current')}: ${snap.mode} · ${(snap.value !== '' ? snap.value : snap.mediaKey !== '' ? `/dsh-bg-media/${snap.mediaKey}` : '').slice(0, 120)}`
  const schemeLabel = snap.resolvedText === null
    ? ''
    : `（${snap.resolvedText === 'light' ? text('textLight') : text('textDark')}）`

  // ---- v0.6.0：预览画布已移除（用户要求去掉预览，背景效果直接在主界面即时可见） ----
  // ---- v0.4.1：tabs 布局（#1）----
  const tabDefs: Array<[string, string]> = [
    ['presets', text('presets')],
    ['color', text('color')],
    ['gradient', text('gradient')],
    ['image', text('image')],
    ['video', text('video')],
  ]
  // v0.6.0（第七轮需求 2）：**药丸式分段 tab** —— 一条 999px 圆角的底槽 + 一个
  // 滑动的"滑块"（thumb）。切换 tab 时滑块用 transform 过渡平移过去（位移渐变），
  // 文字颜色/字重也淡入淡出，取代原来"每个 tab 自己描边/填蓝"的写法。
  const tabIndex = Math.max(0, tabDefs.findIndex(([id]) => id === tab))
  const tabThumb = jsx('div', {
    key: 'thumb',
    'data-testid': 'dsh-bg-tab-thumb',
    'aria-hidden': true,
    style: {
      position: 'absolute',
      top: '3px',
      bottom: '3px',
      left: '3px',
      width: `calc((100% - 6px) / ${tabDefs.length})`,
      borderRadius: '999px',
      background: 'var(--dsw-alias-bg-layer-1, #fff)',
      boxShadow: 'var(--dsw-elevation-panel, 0 1px 3px rgb(0 0 0 / 0.12))',
      transform: `translateX(${tabIndex * 100}%)`,
      transition: 'transform 260ms cubic-bezier(0.2, 0.8, 0.2, 1)',
      pointerEvents: 'none',
    },
  })
  const tabButton = (id: string, label: string) => {
    const activeTab = tab === id
    return jsx('button', {
      type: 'button',
      key: id,
      role: 'tab',
      'aria-selected': activeTab,
      onClick: () => setTab(id),
      style: {
        position: 'relative',
        zIndex: 1,
        flex: '1 1 0',
        minWidth: 0,
        padding: '5px 8px',
        border: 'none',
        outline: 'none',
        background: 'transparent',
        borderRadius: '999px',
        cursor: 'pointer',
        fontFamily: 'inherit',
        fontSize: '0.85em',
        lineHeight: '18px',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        color: activeTab ? 'var(--dsw-alias-label-primary, #111)' : 'var(--dsw-alias-label-secondary, #666)',
        fontWeight: activeTab ? 600 : 400,
        transition: 'color 200ms ease',
      },
      children: label,
    })
  }
  const tabBar = jsx('div', {
    'data-testid': 'dsh-bg-tabs',
    style: {
      display: 'flex', alignItems: 'center', gap: '8px', margin: '0 0 12px',
      flexWrap: 'nowrap',
      borderBottom: '1px solid var(--dsw-alias-border-l2, #ddd)', paddingBottom: '8px',
    },
    children: [
      // v0.4.4 (#3)：tab 本体。role=tablist 挪到内层，让「重置」不属于 tab 序列
      // （键盘/读屏都不会把它当成一个 tab）。
      jsx('div', {
        role: 'tablist',
        'data-testid': 'dsh-bg-tablist',
        style: {
          position: 'relative',
          display: 'flex',
          alignItems: 'stretch',
          flex: '1 1 auto',
          minWidth: 0,
          padding: '3px',
          borderRadius: '999px',
          background: 'var(--dsw-specific-selector, rgba(127, 127, 127, 0.14))',
          border: '1px solid var(--dsw-alias-border-l1, rgba(127, 127, 127, 0.16))',
        },
        children: [tabThumb, ...tabDefs.map(([id, label]) => tabButton(id, label))],
      }),
      // v0.4.4 (#3)：「重置」固定在 tab 栏右侧 —— 只重置背景命名空间
      // （mode=off + 全部运行时字段回默认）。
      jsx('button', {
        type: 'button',
        key: 'reset',
        'data-testid': 'dsh-bg-reset',
        onClick: resetToDefault,
        style: {
          flexShrink: 0,
          padding: '5px 12px', borderRadius: '999px', cursor: 'pointer', fontSize: '0.85em',
          fontFamily: 'inherit',
          border: '1px solid var(--dsw-alias-border-l2, #ddd)',
          background: 'transparent',
          color: 'var(--dsw-alias-label-secondary, #666)',
        },
        children: text('reset'),
      }),
    ],
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
    // 需求 1：去掉「纯色」标签（与视频页签一致，只留控件 + 应用）
    editorNodes.push(plainRow(
      jsx('input', {
        type: 'color', value: hex,
        onChange: (e: { target: { value: string } }) => setHex(e.target.value),
        style: { height: '28px', width: '48px', padding: 0, border: 'none', background: 'none' },
      }),
      makeButton(text('applyColor'), applyColor, true)))
  }
  if (tab === 'gradient') {
    editorNodes.push(plainRow(
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
    // 第五轮需求 3：行内是「输入框 + 本地文件图标 + 应用」—— 图标的作用等于选择
    // 本地文件；原来的「本地图片」标签行与"未选择任何文件"文案整体去掉（需求 2
    // 也要求去掉图片的本地提示行）。真正的 <input type=file> 隐藏起来，由图标代点。
    editorNodes.push(plainRow(
      jsx('input', {
        type: 'text', value: imageUrl,
        placeholder: text('imagePlaceholder'),
        onChange: (e: { target: { value: string } }) => setImageUrl(e.target.value),
        onFocus: () => markEditing('image', true),
        onBlur: () => markEditing('image', false),
        onKeyDown: bgKeyEnter(applyImageUrl),
        style: inputStyle,
      }),
      filePickButton('image'),
      makeButton(text('applyImage'), applyImageUrl, true),
      fileInput('image', imageFileRef, acceptImageAttr)))
  }
  if (tab === 'video') {
    // 第二轮需求 4：去掉「背景视频」这行文字；第五轮需求 3：本地视频同样收进图标。
    editorNodes.push(plainRow(
      jsx('input', {
        type: 'text', value: videoUrl,
        placeholder: text('videoPlaceholder'),
        onChange: (e: { target: { value: string } }) => setVideoUrl(e.target.value),
        onFocus: () => markEditing('video', true),
        onBlur: () => markEditing('video', false),
        onKeyDown: bgKeyEnter(applyVideoUrl),
        style: inputStyle,
      }),
      filePickButton('video'),
      makeButton(text('applyVideo'), applyVideoUrl, true),
      fileInput('video', videoFileRef, acceptVideoAttr)))
    // 本地视频的「只在本机、不上传云端」说明保留（第二轮需求 5）
    editorNodes.push(jsx('p', {
      style: { fontSize: '0.78em', opacity: 0.6, margin: '2px 0 6px' },
      children: text('localVideoHint'),
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

  /**
   * v0.6.0 (#5)：毛玻璃质感开关（全局项，始终可见）。
   * 开启 = 表面半透明 + 背景模糊（磨砂玻璃）；关闭 = 当前半透明表面但不模糊。
   */
  const glassRow = jsx('label', {
    'data-testid': 'dsh-bg-glass',
    style: { fontSize: '0.9em', display: 'inline-flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap', margin: '4px 0' },
    children: [
      jsx('input', {
        type: 'checkbox',
        checked: snap.glass === true,
        onChange: (e: { target: { checked: boolean } }) => changeGlass(e.target.checked),
      }),
      text('glass'),
      jsx('span', { style: { fontSize: '0.78em', opacity: 0.6 }, children: text('glassHint') }),
    ],
  })

  return jsx('div', {
    style: { padding: '4px 2px' },
    children: [
      // v0.6.0（需求 5）：面板内不再重复渲染「背景」标题 —— 抽屉头部已有标题，
      // 两处叠在一起看着像两个背景面板。
      tabBar,
      ...editorNodes,
      jsx('div', { style: { height: '1px', background: 'var(--dsw-alias-border-l2, #e5e7eb)', margin: '12px 0 6px' } }),
      progressRow,
      videoControlRow,
      volumeRow,
      // 适配/媒体滑杆只在"当前背景对应的那个媒体 tab"里出现（#1）：切到预设皮肤
      // 等别的 tab 时，视频/图片专属控件整体隐藏；文字方案是全局项，始终可见。
      // 第五轮需求 1：小图（滚轮缩放 + 拖动定位）排在这些控件之前。
      minimapBlock,
      mediaTabActive ? row(text('fit'), fitSelect, null) : null,
      row(text('textScheme'), schemeSelect, null),
      ...wallpaperSliders,
      glassRow,
      runtimeErrorRow,
      // v0.4.4 (#3)：「恢复默认」已上移到 tab 栏右侧（dsh-bg-reset），此处不再重复
      jsx('p', {
        'data-testid': 'dsh-bg-current',
        style: { fontSize: '0.85em', opacity: 0.7, margin: '12px 0 0', wordBreak: 'break-all' },
        children: `${currentLabel}${schemeLabel}`,
      }),
      popupOverlay,
    ],
  })
}

// ---- v0.6.0 (#2/#5/#6/#8/#9/#11)：侧栏「壁纸」按钮 + 右侧抽屉 ----

/** 抽屉宽度（需求 2：在 420px 基础上 +50%）。 */
export const DRAWER_WIDTH_CSS = 'min(630px, 100vw)'
/** body 上的抽屉打开标记（"隐藏聊天区"布局的 CSS 作用域）。 */
const DRAWER_ATTR = 'data-dsh-bg-drawer'
/** 插件自管的抽屉布局样式表 id（与背景引擎的 dsh-bg-style 相互独立）。 */
const DRAWER_STYLE_ID = 'dsh-bg-drawer-style'

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
`

/** 安装抽屉布局样式表（插件生命周期内常驻；规则本身以 body 属性为开关）。 */
function installDrawerLayoutStyle(): () => void {
  if (typeof document === 'undefined') return () => {}
  let el: HTMLStyleElement | null = null
  try {
    el = document.createElement('style')
    el.id = DRAWER_STYLE_ID
    el.textContent = DRAWER_LAYOUT_CSS
    ;(document.head ?? document.body)?.append(el)
  } catch {
    el = null
  }
  return () => {
    try { el?.remove() } catch { /* 已移除 */ }
    syncDrawerLayoutAttr(false)
  }
}

/** 按抽屉开关挂/摘 body 标记与抽屉宽度变量。 */
function syncDrawerLayoutAttr(open: boolean): void {
  if (typeof document === 'undefined') return
  try {
    const body = document.body
    if (open) {
      body.setAttribute(DRAWER_ATTR, '')
      body.style.setProperty('--dsh-bg-drawer-w', DRAWER_WIDTH_CSS)
    } else {
      body.removeAttribute(DRAWER_ATTR)
      body.style.removeProperty('--dsh-bg-drawer-w')
    }
  } catch {
    // 受限/异常 DOM：忽略（抽屉照常显示，只是不让位）
  }
}

/** 侧栏按钮注入 props（slot 的 owner share 给 wide；inject 给 text）。 */
interface BgSidebarActionProps {
  text?: (key: string) => string
  wide?: boolean
}

/** 壁纸图标（16×16 线性图标，与官方 primitives 的描边风格一致；不引入外部资源）。 */
function wallpaperIcon(size: number): unknown {
  return jsx('svg', {
    width: size,
    height: size,
    viewBox: '0 0 16 16',
    fill: 'none',
    'aria-hidden': true,
    focusable: 'false',
    style: { flexShrink: 0, display: 'block' },
    children: [
      jsx('rect', {
        key: 'frame', x: 1.6, y: 2.6, width: 12.8, height: 10.8, rx: 2.2,
        stroke: 'currentColor', strokeWidth: 1.3,
      }),
      jsx('circle', { key: 'sun', cx: 5.6, cy: 6.4, r: 1.05, fill: 'currentColor' }),
      jsx('path', {
        key: 'hills', d: 'M2.4 11.9 L6.2 8.4 L8.6 10.6 L10.6 8.8 L13.6 11.4',
        stroke: 'currentColor', strokeWidth: 1.3, strokeLinecap: 'round', strokeLinejoin: 'round',
      }),
    ],
  })
}

/** 播放图标（实心三角；第二轮需求 2：与停止合成一个按钮）。 */
function playIcon(size: number): unknown {
  return jsx('svg', {
    width: size, height: size, viewBox: '0 0 16 16', fill: 'none',
    'aria-hidden': true, focusable: 'false', style: { display: 'block' },
    children: [jsx('path', { d: 'M5.2 3.4 L12.6 8 L5.2 12.6 Z', fill: 'currentColor' })],
  })
}

/** 停止图标（实心方块）。 */
function stopIcon(size: number): unknown {
  return jsx('svg', {
    width: size, height: size, viewBox: '0 0 16 16', fill: 'none',
    'aria-hidden': true, focusable: 'false', style: { display: 'block' },
    children: [jsx('rect', { x: 4.4, y: 4.4, width: 7.2, height: 7.2, rx: 1.2, fill: 'currentColor' })],
  })
}

/** 文件夹图标：行内的「选择本地文件」按钮（第五轮需求 3）。 */
function folderIcon(size: number): unknown {
  return jsx('svg', {
    width: size, height: size, viewBox: '0 0 16 16', fill: 'none',
    'aria-hidden': true, focusable: 'false', style: { display: 'block' },
    children: [
      jsx('path', {
        d: 'M1.9 4.3a1.4 1.4 0 0 1 1.4-1.4h2.9l1.5 1.7h5.4a1.4 1.4 0 0 1 1.4 1.4v5.5a1.4 1.4 0 0 1-1.4 1.4H3.3a1.4 1.4 0 0 1-1.4-1.4z',
        stroke: 'currentColor', strokeWidth: 1.3, strokeLinejoin: 'round',
      }),
      jsx('path', {
        d: 'M8 6.6v3.1M6.6 8l1.4-1.4L9.4 8',
        stroke: 'currentColor', strokeWidth: 1.1, strokeLinecap: 'round', strokeLinejoin: 'round',
      }),
    ],
  })
}

/**
 * 侧栏「壁纸」按钮（需求 6）：展开时是「图标 + 壁纸」，收起（轨道态）只留图标。
 * 外观（第二轮需求 3）：**无描边**，几何/圆角/悬浮与选中底色都对齐它下面的
 * Settings 控件（ui-settings-general 的 `.trigger`：42px 高 / 12px 圆角 /
 * padding 0 10px 0 8px / 悬浮 `--dsw-alias-interactive-bg-hover`；轨道态 36px 圆形）。
 */
export function BgSidebarAction(props: BgSidebarActionProps): unknown {
  const open = useSyncExternalStore(subscribeDrawer, getDrawerOpen)
  const text = props.text ?? ((k: string) => k)
  const wide = props.wide === true
  return jsx('button', {
    type: 'button',
    'data-testid': 'dsh-bg-sidebar-action',
    'data-active': open ? '' : undefined,
    'aria-label': text('wallpaper'),
    'aria-expanded': open,
    title: text('wallpaper'),
    onClick: () => { toggleDrawer() },
    style: {
      boxSizing: 'border-box',
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      justifyContent: wide ? 'flex-start' : 'center',
      gap: '8px',
      width: wide ? 'calc(100% + 4px)' : '36px',
      height: wide ? '42px' : '36px',
      flex: 'none',
      margin: wide ? '4px -2px' : '0 auto',
      padding: wide ? '0 10px 0 8px' : '0',
      borderRadius: wide ? '12px' : '50%',
      // 无描边（需求 3）；选中态与 Settings 的悬浮底色一致
      border: 'none',
      outline: 'none',
      background: open ? 'var(--dsw-alias-interactive-bg-hover)' : 'transparent',
      color: 'var(--dsw-alias-label-primary, #111)',
      fontFamily: 'inherit',
      fontSize: '14px',
      lineHeight: '22px',
      overflow: 'hidden',
      whiteSpace: 'nowrap',
    },
    children: wide
      ? [wallpaperIcon(16), jsx('span', { key: 'label', children: text('wallpaper') })]
      : wallpaperIcon(18),
  })
}

/** 抽屉注入 props（slot 的 inject 给 setBg/text）。 */
interface BgDrawerProps {
  setBg?: (mode: string, value: string, opts?: BgApplyOpts) => void
  text?: (key: string) => string
}

/** 右侧抽屉：打开时从聊天界面右侧滑出，承载 BgPanel；滑动调参时自身降透明。 */
export function BgDrawer(props: BgDrawerProps): unknown {
  const open = useSyncExternalStore(subscribeDrawer, getDrawerOpen)
  const adjusting = useSyncExternalStore(subscribeAdjusting, getAdjusting)
  const snap = useSyncExternalStore(subscribeStore, getSnapshot)
  const text = props.text ?? ((k: string) => k)
  if (!open) return null
  /**
   * 需求 6：抽屉底板必须**半透明**（不要固定色），否则它会把刚设好的壁纸整块挡住。
   * 取色跟背景引擎同一份调色板：有背景时用该方案下的 `--dsw-alias-bg-layer-2`
   * 半透明字面量（浅字方案=深色 55%，深字方案=浅色 55%）+ backdrop 模糊；
   * 没有背景（off）时回落到主题自己的表面色，避免"深色面板 + 浅色主题深字"看不清。
   */
  const scheme = snap?.resolvedText === 'dark' ? 'dark' : snap?.resolvedText === 'light' ? 'light' : null
  const panelBackground = scheme === null
    ? 'var(--dsw-alias-bg-layer-2, #fff)'
    : (glassSurfaceTokensForTextScheme(scheme)['--dsw-alias-bg-layer-2'] ?? 'rgb(23 28 36 / 0.55)')
  return jsx('div', {
    'data-dsh-bg-drawer-root': '',
    style: {
      position: 'fixed',
      inset: 0,
      zIndex: 2147483000,
      display: 'flex',
      justifyContent: 'flex-end',
      // 根层不吃指针事件；下面两个子节点各自 opt-in（遮罩负责"点外部关闭"）。
      pointerEvents: 'none',
    },
    children: [
      // 需求 9：点击抽屉以外的任何地方关闭抽屉。透明遮罩 —— 不挡看背景。
      jsx('div', {
        key: 'backdrop',
        'data-testid': 'dsh-bg-drawer-backdrop',
        onClick: () => { setDrawerOpen(false) },
        style: { position: 'absolute', inset: 0, background: 'transparent', pointerEvents: 'auto' },
      }),
      jsx('div', {
        key: 'panel',
        'data-dsh-bg-drawer': '',
        style: {
          position: 'relative',
          height: '100%',
          width: DRAWER_WIDTH_CSS,
          maxWidth: '100vw',
          display: 'flex',
          flexDirection: 'column',
          pointerEvents: 'auto',
          // 需求 3：滑动定位/缩放期间抽屉自身降透明（松开恢复）
          opacity: adjusting ? 0.22 : 1,
          transition: 'opacity 150ms ease',
          boxShadow: '0 0 0 1px var(--dsw-alias-border-l2, rgba(0,0,0,0.1)), 0 12px 48px rgb(0 0 0 / 0.3)',
          background: panelBackground,
          backdropFilter: scheme === null ? undefined : 'blur(18px) saturate(1.2)',
          WebkitBackdropFilter: scheme === null ? undefined : 'blur(18px) saturate(1.2)',
          color: 'var(--dsw-alias-label-primary, #111)',
        },
        children: [
          jsx('div', {
            style: {
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '12px 16px', borderBottom: '1px solid var(--dsw-alias-border-l2, #e5e7eb)',
            },
            children: [
              jsx('span', { style: { fontWeight: 700, fontSize: '1rem' }, children: text('title') }),
              // 需求 8：关闭按钮加描边 + 圆形（圆角 50%）
              jsx('button', {
                type: 'button',
                'data-testid': 'dsh-bg-drawer-close',
                'aria-label': text('close'),
                title: text('close'),
                onClick: () => { setDrawerOpen(false) },
                style: {
                  boxSizing: 'border-box',
                  width: '28px',
                  height: '28px',
                  flexShrink: 0,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  border: '1px solid var(--dsw-alias-border-l2, #ccc)',
                  // 第七轮需求 3：显式 50% —— 正方形盒子（28×28）下即正圆；
                  // aspectRatio 兜住"被主题/容器改宽高后仍是椭圆"的情况。
                  borderRadius: '50%',
                  aspectRatio: '1 / 1',
                  background: 'transparent',
                  color: 'var(--dsw-alias-label-secondary, #666)',
                  fontSize: '16px',
                  lineHeight: 1,
                  padding: 0,
                },
                children: '×',
              }),
            ],
          }),
          jsx('div', {
            style: { flex: 1, overflowY: 'auto', padding: '12px 16px 20px' },
            children: jsx(BgPanel, { setBg: props.setBg, text: props.text }),
          }),
        ],
      }),
    ],
  })
}
