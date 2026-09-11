/**
 * dsh-bg-switch —— host 侧 settings 命名空间桥（R3 settings-first；v0.3/v0.3.1 扩 schema）。
 *
 * 契约依据（host 源码，dsh-host 只读参考树，写入注释供复核）：
 * - settings 服务注册 API：packages/settings/settings/src/index.ts
 *   `register<Ns,T>(ns, schema: z<T>, options?): SettingsScope<T>`（419–459），
 *   命名空间须匹配 /^[a-z][a-z0-9-]*$/（20 行）；重复注册抛错（425–427）。
 * - 官方 host 插件拿到 provider 的姿势：ui-theme host 半
 *   packages/client/ui-theme/src/index.ts:36-43
 *   `ctx.inject(['settings'], settingsCtx => settingsCtx.settings.register(...))`。
 * - SettingsScope 写入口 update(patch)（merge 进 user 层，114–141）与 replace(section)；
 *   解析顺序 = schema 默认 < base < user（get() 注释 116 行）；describe 的
 *   view.value = registration.resolved（505–538），故 schema .default() 会出现在
 *   客户端 scope 快照里 —— 这是本模块把 config 镜像做成"字段默认值"而非
 *   "启动时写 user 层"的依据（不污染 settings.yaml、不随 user 覆盖，天然只读）。
 * - z.array(z.string())/z.boolean()/z.number() 在 settings schema 中可用：
 *   packages/settings/settings/tests/settings.spec.ts:51（register 用 z.array）等。
 *
 * v0.3 schema 变化：
 * - mode 枚举扩 'video'；新增 fit / textScheme / loop（运行时字段，默认取自
 *   config 的 defaultFit/defaultTextScheme/defaultLoop）；video 本地路径带
 *   mediaKey（随机，host /dsh-bg-media/<key> 路由据此伺服文件）。
 * - 只读镜像字段 imageExt/videoExt/maxImageMB/maxVideoMB/defaultFit/
 *   defaultTextScheme/defaultLoop：schema 默认 = config.json 解析结果；任何写者
 *   （工具/客户端）都不写它们 → 始终等于进程启动时读到的 config。
 *
 * v0.3.1 schema 变化：
 * - 新增运行时字段 opacity（0..1，step 0.05，默认 1=不透明）与 posX / posY
 *   （0..100，默认 50=居中）：image/video 的不透明度与焦点定位，UI 滑杆与
 *   bg_apply 工具写入，客户端渲染引擎消费（background-position /
 *   object-position / layer opacity）。
 *
 * v0.4 schema 变化：
 * - 新增运行时字段 volume（0..1，step 0.05，默认 1=满音量）：视频音量（UI 音量
 *   滑杆持久化；「声音」开关 sound 为纯运行时态、不进 schema —— muted 由客户端
 *   引擎按 sound 是否开启推导，见 src/client/index.ts）。
 * - 上传/登记的本地媒体不再把原文件内容写进 value：value 留空或写原路径，
 *   mediaKey 指向 host 媒体目录 /dsh-bg-media/<key>（见 src/media.ts v0.4）。
 *
 * v0.5.0 schema 变化：
 * - 新增运行时字段 zoom（1..3，step 0.05，默认 1=不缩放）：在 fit 基准尺寸上
 *   放大内容（image → background-size；video → transform: scale），缩放中心 =
 *   焦点 posX/posY。与 v0.4.3 的 scale（0.25–4，可缩小）并存：zoom 是面板与
 *   独立设置窗口的主缩放控件，scale 保留为兼容字段（旧 settings 里的值仍生效）。
 * - 新增**独立设置窗口**的写入通道（src/panel.ts 的路由调用）：
 *   {@link BG_PANEL_WRITABLE_FIELDS}（字段白名单）、
 *   {@link validateBgFieldPatch}（纯校验：白名单 + 类型 + 范围 + 步长吸附）、
 *   {@link writeBgFields}（走本模块的持久化路径：有 settings provider 写命名空间，
 *   否则并进 state.json 回退镜像）。
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { dshHomePath } from '@deepseek-ai/dsh-home-paths'
import {
  BG_FITS,
  BG_GLASS_DEFAULT,
  BG_MODES,
  BG_SCALE_DEFAULT,
  BG_SCALE_MAX,
  BG_SCALE_MIN,
  BG_TEXT_SCHEMES,
  BG_ZOOM_DEFAULT,
  BG_ZOOM_MAX,
  BG_ZOOM_MIN,
  type BgFit,
  type BgMode,
  type BgTextScheme,
} from './bg-config.ts'
import { loadBgConfig, type ResolvedBgConfig } from './config.ts'
import { readState, writeState, type BgState } from './state.ts'

/** settings 命名空间（host 与 client 共享的 wire 标识）。 */
export const BG_NAMESPACE = 'dsh-bg'

/** 命名空间文档允许的 mode 枚举（与工具/客户端同一套，来自 bg-config）。 */
export { BG_MODES, BG_FITS, BG_TEXT_SCHEMES }

/** config.json 镜像进命名空间的只读字段（schema 默认承载；UI 从这里读限制/默认）。 */
export interface BgConfigMirror {
  imageExt: string[]
  videoExt: string[]
  maxImageMB: number
  maxVideoMB: number
  defaultFit: BgFit
  defaultTextScheme: BgTextScheme
  defaultLoop: boolean
}

/** 命名空间文档形状（runtime 字段 + 只读镜像字段；updatedAt 不进 settings）。 */
export interface BgSectionDoc extends BgConfigMirror {
  mode: BgMode
  value: string
  fit: BgFit
  textScheme: BgTextScheme
  loop: boolean
  mediaKey: string
  /** 媒体不透明度 0..1（image/video；默认 1=不透明）。 */
  opacity: number
  /** 焦点水平定位 0..100（%）（image/video；默认 50=居中）。 */
  posX: number
  /** 焦点垂直定位 0..100（%）（image/video；默认 50=居中）。 */
  posY: number
  /** 媒体缩放 0.25..4（image/video；v0.4.3 新增；默认 1=不缩放，焦点为缩放中心）。 */
  scale: number
  /** 放大聚焦 1..3（image/video；v0.5.0 新增；默认 1=不缩放，焦点为缩放中心）。 */
  zoom: number
  /** 视频音量 0..1（默认 1=满音量；「声音」开关是运行时态不进 schema）。 */
  volume: number
  /** 毛玻璃质感（v0.6.0 新增；默认 false=关闭：表面半透明 + 背景模糊）。 */
  glass: boolean
}

/**
 * 用一份已解析配置构造命名空间 schema。config 默认烘焙进 .default()：
 * - 客户端 scope 快照（describe view.value）自动携带镜像字段与运行时默认；
 * - 首次使用时（user 层没有该字段）即得到 config 的默认行为。
 */
export function buildBgSectionSchema(cfg: ResolvedBgConfig['config']): z<BgSectionDoc> {
  return z.object({
    mode: z.union([...BG_MODES]).default('off'),
    value: z.string().default(''),
    fit: z.union([...BG_FITS]).default(cfg.defaultFit),
    textScheme: z.union([...BG_TEXT_SCHEMES]).default(cfg.defaultTextScheme),
    loop: z.boolean().default(cfg.defaultLoop),
    mediaKey: z.string().default(''),
    // v0.3.1：媒体不透明度与焦点定位（image/video；滑杆 step 0.05/1）
    opacity: z.number().min(0).max(1).step(0.05).default(1),
    posX: z.number().min(0).max(100).default(50),
    posY: z.number().min(0).max(100).default(50),
    // v0.4.3：媒体缩放（0.25..4，step 0.05，默认 1=不缩放；焦点为缩放中心）
    scale: z.number().min(BG_SCALE_MIN).max(BG_SCALE_MAX).step(0.05).default(BG_SCALE_DEFAULT),
    // v0.5.0：放大聚焦 zoom（1..3，step 0.05，默认 1=不缩放；焦点为缩放中心）
    zoom: z.number().min(BG_ZOOM_MIN).max(BG_ZOOM_MAX).step(0.05).default(BG_ZOOM_DEFAULT),
    // v0.4：视频音量（0..1，step 0.05，默认 1=满音量）
    volume: z.number().min(0).max(1).step(0.05).default(1),
    // v0.6.0：毛玻璃质感（默认 false=关闭）
    glass: z.boolean().default(BG_GLASS_DEFAULT),
    // 只读镜像字段（无写者；进程内与 config.json 一致）
    imageExt: z.array(z.string()).default([...cfg.imageExt]),
    videoExt: z.array(z.string()).default([...cfg.videoExt]),
    maxImageMB: z.number().default(cfg.maxImageMB),
    maxVideoMB: z.number().default(cfg.maxVideoMB),
    defaultFit: z.union([...BG_FITS]).default(cfg.defaultFit),
    defaultTextScheme: z.union([...BG_TEXT_SCHEMES]).default(cfg.defaultTextScheme),
    defaultLoop: z.boolean().default(cfg.defaultLoop),
  })
}

/** 本模块持有的已注册 scope；settings 可用且注册完成前为 undefined（回退文件）。 */
interface ActiveScope {
  get(): BgSectionDoc
  update(patch: Partial<BgSectionDoc>): Promise<void>
}
let activeScope: ActiveScope | undefined

/**
 * 清空媒体目录缓存 $DSH_HOME/dsh-bg-switch/media/ 下已登记的上传/登记文件
 * （v0.4.2，#7「恢复默认清除背景缓存」）。恢复默认（mode=off）后所有 mediaKey
 * 都已失效，这些残留上传文件就是"残留壁纸/视频缓存"；目录缺失/不可读返回 0，
 * 单个文件删除失败不中断其余清理。
 * @returns 成功删除的文件数。
 */
export function pruneMediaCache(): number {
  const dir = dshHomePath('dsh-bg-switch', 'media')
  try {
    const names = readdirSync(dir)
    let removed = 0
    for (const name of names) {
      try {
        rmSync(join(dir, name), { force: true })
        removed += 1
      } catch {
        // 单个文件正被读取/占用时跳过，不中断整批清理
      }
    }
    return removed
  } catch {
    return 0
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
export function installBgNamespace(ctx: Context): () => void {
  const resolved = loadBgConfig()
  for (const warning of resolved.warnings) ctx.logger.warn(warning)
  const disposer = ctx.inject(['settings'], (settingsCtx) => {
    const scope = settingsCtx.settings.register(BG_NAMESPACE, buildBgSectionSchema(resolved.config))
    activeScope = scope
    // watch：namespace 解析值提交变化时回调 (next)；mode=off → 清理媒体缓存
    const unwatch = scope.watch((next) => {
      const doc = typeof next === 'object' && next !== null && !Array.isArray(next)
        ? next as unknown as BgSectionDoc
        : undefined
      if (doc?.mode === 'off') pruneMediaCache()
    })
    // settings 服务脱离时清空，避免 stale scope 指向已注销命名空间
    settingsCtx.effect(() => () => {
      if (activeScope === scope) activeScope = undefined
      unwatch()
    }, `dsh-bg: ${BG_NAMESPACE} scope detached`)
  })
  return () => {
    activeScope = undefined
    disposer()
  }
}

/** 目标说明：settings=命名空间（权威）；file=state.json（回退）。 */
export interface BgPersistResult {
  target: 'settings' | 'file'
}

/**
 * 持久化一次背景状态：settings 可用写命名空间（按字段存在性 merge，
 * 不动只读镜像字段），否则写 state.json。
 * @param state - 背景状态；fit/textScheme/loop/mediaKey 为可选，仅当存在于
 *   state 时才写（避免每次 apply 都清掉/覆盖上次用户选择）。
 */
export async function persistBgState(state: BgState): Promise<BgPersistResult> {
  if (activeScope !== undefined) {
    const patch: Partial<BgSectionDoc> = { mode: state.mode, value: state.value }
    if (state.fit !== undefined) patch.fit = state.fit
    if (state.textScheme !== undefined) patch.textScheme = state.textScheme
    if (state.loop !== undefined) patch.loop = state.loop
    if (state.mediaKey !== undefined) patch.mediaKey = state.mediaKey
    if (state.opacity !== undefined) patch.opacity = state.opacity
    if (state.posX !== undefined) patch.posX = state.posX
    if (state.posY !== undefined) patch.posY = state.posY
    if (state.scale !== undefined) patch.scale = state.scale
    if (state.zoom !== undefined) patch.zoom = state.zoom
    if (state.volume !== undefined) patch.volume = state.volume
    if (state.glass !== undefined) patch.glass = state.glass
    await activeScope.update(patch)
    return { target: 'settings' }
  }
  writeState(state)
  return { target: 'file' }
}

/**
 * 读取当前背景状态：settings 可用时以命名空间为准（schema 默认 = config
 * 解析值；fit/textScheme/loop 缺失时取命名空间默认），否则回退 state.json
 * 并用 config 默认补齐可选字段。供 tool / style.ts / media 路由读取。
 */
export function readBgState(): BgState {
  if (activeScope !== undefined) {
    const doc = activeScope.get()
    return {
      mode: doc.mode,
      value: doc.value,
      fit: doc.fit,
      textScheme: doc.textScheme,
      loop: doc.loop,
      mediaKey: doc.mediaKey,
      opacity: typeof doc.opacity === 'number' ? doc.opacity : 1,
      posX: typeof doc.posX === 'number' ? doc.posX : 50,
      posY: typeof doc.posY === 'number' ? doc.posY : 50,
      scale: typeof doc.scale === 'number' ? doc.scale : BG_SCALE_DEFAULT,
      zoom: typeof doc.zoom === 'number' ? doc.zoom : BG_ZOOM_DEFAULT,
      volume: typeof doc.volume === 'number' ? doc.volume : 1,
      glass: typeof doc.glass === 'boolean' ? doc.glass : BG_GLASS_DEFAULT,
      updatedAt: '',
    }
  }
  const state = readState()
  const cfg = loadBgConfig().config
  return {
    mode: state.mode,
    value: state.value,
    fit: state.fit ?? cfg.defaultFit,
    textScheme: state.textScheme ?? cfg.defaultTextScheme,
    loop: state.loop ?? cfg.defaultLoop,
    mediaKey: state.mediaKey ?? '',
    opacity: state.opacity ?? 1,
    posX: state.posX ?? 50,
    posY: state.posY ?? 50,
    scale: state.scale ?? BG_SCALE_DEFAULT,
    zoom: state.zoom ?? BG_ZOOM_DEFAULT,
    volume: state.volume ?? 1,
    glass: state.glass ?? BG_GLASS_DEFAULT,
    updatedAt: state.updatedAt,
  }
}

