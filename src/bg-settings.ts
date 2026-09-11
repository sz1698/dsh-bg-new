/**
 * dsh-bg-new —— host 侧 settings 命名空间桥（R3 settings-first；v0.3/v0.3.1 扩 schema）。
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
 *   mediaKey（随机，host /dsh-bg-new-media/<key> 路由据此伺服文件）。
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
 *   mediaKey 指向 host 媒体目录 /dsh-bg-new-media/<key>（见 src/media.ts v0.4）。
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
import { readdirSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { bgDataPath, readState, writeState, type BgState } from './state.ts'
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

/** settings 命名空间（host 与 client 共享的 wire 标识）。 */
export const BG_NAMESPACE = 'dsh-bg-new'

/**
 * 改名前用过的老 settings 命名空间（从新到旧排列）。
 *
 * v0.7.0 把命名空间从 `dsh-bg` 改名到 `dsh-bg-new`。老机器上用户已经调好的背景
 * 还留在老命名空间里，{@link inheritLegacyBgNamespace} 负责把它一次性继承过来，
 * 避免升级后背景悄悄回到默认。
 */
export const BG_NAMESPACE_LEGACY = ['dsh-bg'] as const

/**
 * 允许从老命名空间继承过来的运行时字段（只读镜像字段由 schema 默认承载，
 * 从来不进 user 层，所以不在名单里）。
 *
 * 用显式白名单而不是"把老 user 层整个塞过去"：老写者可能留下本版本 schema 不认识
 * 的键，直接 `update()` 会因为校验失败整笔拒绝，白名单保证继承只搬得动的字段。
 */
const BG_INHERITABLE_FIELDS = [
  'mode', 'value', 'fit', 'textScheme', 'loop', 'mediaKey',
  'opacity', 'posX', 'posY', 'scale', 'zoom', 'volume', 'glass',
] as const

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
 * 清空媒体目录缓存 $DSH_HOME/dsh-bg-new/media/ 下已登记的上传/登记文件
 * （v0.4.2，#7「恢复默认清除背景缓存」）。恢复默认（mode=off）后所有 mediaKey
 * 都已失效，这些残留上传文件就是"残留壁纸/视频缓存"；目录缺失/不可读返回 0，
 * 单个文件删除失败不中断其余清理。
 * @returns 成功删除的文件数。
 */
export function pruneMediaCache(): number {
  const dir = bgDataPath('media')
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
 * 本模块只用到 settings scope 的一个方法：把补丁 merge 进 user 层。
 *
 * 刻意用**结构类型**而不是 import settings 包的 `SettingsScope<T>`：那需要把
 * `@deepseek-ai/dsh-settings` 加进依赖，而它只是宿主提供的能力 —— 本包不该为了
 * 一个类型注解去声明一个并不 import 的包。
 */
interface BgScopeUpdateOnly {
  update(patch: object): Promise<void>
}

/**
 * 把老命名空间（v0.7.0 之前叫 `dsh-bg`）的用户层**一次性继承**进新命名空间。
 *
 * 依据（host 源码，dsh-host 只读参考树）：
 * - `SettingsDescriptor.user` 是命名空间的**原始 user 层**
 *   （`packages/settings/settings/src/index.ts:93-97`）：某个字段出现在 user 里，
 *   恰好等价于"用户覆盖过它" —— 所以能区分"用户从没写过"与"用户写成了默认值"。
 *   想拿 resolved 值再跟默认值比对是做不到这一点的。
 * - 命名空间只有**先注册**才会出现在 `describe()` 里，所以老命名空间要用同一份
 *   schema 注册一次（老段落是按老 schema 写的，能通过校验）。
 *
 * 只有新命名空间的 user 层为空时才继承 —— 用户在这个版本里改过的值永远不会被
 * 老值覆盖。继承完成后**有意保留老注册**：它兼作回退读取面，而且老段落留在
 * settings 文档里不删，用户想降级回 0.6.0 时原样可用。
 *
 * 全新安装不该白白多出一个命名空间，所以先用 {@link settingsDocumentHasSection}
 * 探测 settings 文档里到底有没有老段落；只有确实有才注册。
 *
 * 整个过程是**尽力而为**：任何一步失败都只记日志，绝不能让激活失败。
 *
 * @param settingsCtx - 已拿到 settings 服务的 ctx。
 * @param config - 已解析配置（老 schema 与当前 schema 用同一份默认）。
 * @param scope - 新命名空间的写入口（继承目标）。
 */
function inheritLegacyBgNamespace(
  settingsCtx: Context,
  config: ResolvedBgConfig['config'],
  scope: BgScopeUpdateOnly,
): void {
  for (const legacyNs of BG_NAMESPACE_LEGACY) {
    try {
      if (!settingsDocumentHasSection(readSettingsDocumentPath(settingsCtx), legacyNs)) continue
      settingsCtx.settings.register(legacyNs, buildBgSectionSchema(config))
      const described = settingsCtx.settings.describe()
      // 新命名空间已经被写过 → 不继承（用户在本版本里的改动优先）
      if (hasUserFields(described.find(row => row.ns === BG_NAMESPACE)?.user)) continue
      const legacyUser = described.find(row => row.ns === legacyNs)?.user
      const patch = pickInheritableFields(legacyUser)
      if (patch === undefined) continue
      void scope.update(patch).then(
        () => settingsCtx.logger.info(
          `dsh-bg-new: inherited settings from legacy namespace "${legacyNs}"`,
        ),
        (error: unknown) => settingsCtx.logger.warn(
          `dsh-bg-new: could not inherit settings from "${legacyNs}": ${String(error)}`,
        ),
      )
    } catch (error) {
      settingsCtx.logger.warn(`dsh-bg-new: legacy namespace "${legacyNs}" skipped: ${String(error)}`)
    }
  }
}

/** 读 provider 的 settings 文档路径（非文件型 provider 返回 undefined）。 */
function readSettingsDocumentPath(settingsCtx: Context): string | undefined {
  try {
    const path = (settingsCtx.settings as { documentPath?: unknown }).documentPath
    return typeof path === 'string' ? path : undefined
  } catch {
    return undefined
  }
}

/**
 * settings 文档里是否已经有某个顶层命名空间段落。
 *
 * settings 文档是"顶层键 = 命名空间"的扁平结构，所以看行首就够了，不需要解析 YAML。
 * **读不动时返回 true**（按"可能有"处理）：宁可多注册一个空命名空间，也不能因为
 * 一次读失败就把用户调好的背景丢掉。非文件型 provider 没有文档路径，返回 false。
 */
function settingsDocumentHasSection(documentPath: string | undefined, ns: string): boolean {
  if (documentPath === undefined) return false
  try {
    return readFileSync(documentPath, 'utf8')
      .split(/\r?\n/)
      .some(line => line.startsWith(`${ns}:`))
  } catch {
    return true
  }
}

/** 该 user 层是否真的写了东西（`{}` / undefined / 非对象都算没写）。 */
function hasUserFields(user: unknown): boolean {
  return typeof user === 'object' && user !== null && !Array.isArray(user)
    && Object.keys(user).length > 0
}

/**
 * 从老 user 层里挑出可继承字段（见 {@link BG_INHERITABLE_FIELDS}）。
 * 一个可用字段都没有时返回 undefined，表示不需要写这一笔。
 */
function pickInheritableFields(user: unknown): Partial<BgSectionDoc> | undefined {
  if (typeof user !== 'object' || user === null || Array.isArray(user)) return undefined
  const source = user as Record<string, unknown>
  const patch: Record<string, unknown> = {}
  for (const field of BG_INHERITABLE_FIELDS) {
    if (source[field] !== undefined) patch[field] = source[field]
  }
  return Object.keys(patch).length > 0 ? patch as Partial<BgSectionDoc> : undefined
}

/**
 * 在 ctx 上安装 'dsh-bg-new' 命名空间注册（随 settings 服务生命周期挂/摘）。
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
    }, `dsh-bg-new: ${BG_NAMESPACE} scope detached`)
    // 改名兼容：把老命名空间的用户层一次性继承过来（尽力而为，失败只记日志）
    inheritLegacyBgNamespace(settingsCtx, resolved.config, scope)
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

