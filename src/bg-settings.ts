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
 * v0.8.0 设置模型变化（DSH 0.2.x 兼容）：
 * - 0.2.x 把设置模型换成了"插件用 Config + .volatile() 声明字段，客户端按 entry id
 *   读表单、host 用 ctx.configEditor.edit() 落 profile patch"，旧的
 *   ctx.settingsScope / settings.register(ns, schema) 在 0.2.x 里已经**整体移除**
 *   （本插件 v0.7.0 因此在桌面端 0.2.1-rc.2 上 boot 失败：客户端 entry 永远 pending
 *   在 settingsScope 上）。本模块现在两条通道都装：有 volatile 引用走 live，
 *   没有就走 legacy，客户端相应地在 configForms / settingsScope 里择一。
 * - 只读镜像字段也一并声明成 volatile：0.2.x 的表单投影会丢掉非 volatile 字段，
 *   否则客户端读不到 config.json 里的扩展名/上限/默认适配。
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
export function bgSectionFields(cfg: ResolvedBgConfig['config']): Record<string, unknown> {
  return {
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
  }
}

/** 0.1.x：settings 命名空间 schema（`settings.register(ns, schema)` 的参数）。 */
export function buildBgSectionSchema(cfg: ResolvedBgConfig['config']): z<BgSectionDoc> {
  return z.object(bgSectionFields(cfg) as Record<string, never>) as unknown as z<BgSectionDoc>
}

/**
 * 0.2.x：entry Config —— 同一份字段逐个包 `.volatile()`。
 *
 * loader 会把这些字段解析成引用对象（`config.mode.get()`），settings 服务再按
 * **entry id** 把它们投影成客户端表单（`configForms.get('dsh-bg-new')`）。
 * `.volatile()` 是 schemastery ≥ 0.2 才有的能力，所以这里做运行时探测：
 * 老宿主上退化成同一份普通 schema，本包在那边照旧走 settings 命名空间。
 *
 * 只读镜像字段（imageExt / maxImageMB / defaultFit …）同样包 volatile：0.2.x 的
 * 表单投影会**丢掉非 volatile 字段**，不包的话客户端读不到 config.json 的限制与默认。
 */
export function buildBgEntrySchema(cfg: ResolvedBgConfig['config']): z<BgSectionDoc> {
  const fields = bgSectionFields(cfg)
  const wrapped: Record<string, unknown> = {}
  for (const [field, schema] of Object.entries(fields)) {
    const volatile = (schema as { volatile?: unknown }).volatile
    wrapped[field] = typeof volatile === 'function' ? (volatile as () => unknown).call(schema) : schema
  }
  return z.object(wrapped as Record<string, never>) as unknown as z<BgSectionDoc>
}

/**
 * 设置通道：0.2.x 与 0.1.x 是两套完全不同的宿主设置模型，本模块把它们收进一个内部接缝。
 *
 * - `legacy`：**0.1.x** 的 settings 命名空间
 *   （`settings.register(ns, schema)` → `SettingsScope`，可 get/update/watch；
 *   命名空间按 ns 字符串独立存放在 settings 文档里）。
 * - `live`：**0.2.x** 的 entry Config
 *   （插件用 `Config` + `.volatile()` 声明字段，loader 把每个 volatile 字段解析成
 *   只有 `get()` 的不可变引用；客户端用 `configForms.get(entryId)` 读同一份值，
 *   写入经 `ctx.configEditor.edit(entry, fn)` 落到 profile 的 `cordis.patch.yml`）。
 *
 * 两者都缺失时回退 `$DSH_HOME/dsh-bg-new/state.json`（headless / 无 settings 部署）。
 */
interface LegacyScope {
  get(): BgSectionDoc
  update(patch: Partial<BgSectionDoc>): Promise<void>
}
/** 0.2.x 的 volatile 配置引用（cosmokit `createVolatile`）：只有 get()，没有订阅。 */
export interface BgVolatileRef<T = unknown> {
  get(): T
}
/** 背景字段的 volatile 引用集合（0.2.x 里 `apply(ctx, config)` 的第二参形状）。 */
export type BgVolatileConfig = { [K in keyof BgSectionDoc]: BgVolatileRef<BgSectionDoc[K]> }
/** 0.2.x 的配置文件编辑器（`@deepseek-ai/dsh-config-editor` 提供的 ctx.configEditor）。 */
export interface BgConfigEditorLike {
  edit(
    entry: unknown,
    change: (
      current: Record<string, unknown>,
      inherited: Record<string, unknown>,
    ) => Record<string, unknown>,
  ): Promise<void>
}
type BgChannel =
  | { kind: 'legacy'; scope: LegacyScope }
  | { kind: 'live'; refs: BgVolatileConfig }
  | undefined

/** 当前生效的设置通道（由 {@link installBgSettings} 安装/摘除）。 */
let channel: BgChannel
/** 0.2.x：`configEditor` 服务实例（可能晚于 apply 出现，故单独持有而不是塞进 channel）。 */
let liveEditor: BgConfigEditorLike | undefined
/** 0.2.x：本插件在 profile 里的 loader 条目（`configEditor.edit` 的寻址目标）。 */
let liveEntry: unknown

/**
 * 判断 `apply` 的第二参是不是 0.2.x 的 volatile 引用集合。
 * 0.1.x 里同样的 Config 只会解析成普通对象（那边没有 `.volatile()`，不会产生引用）。
 */
export function isBgVolatileConfig(value: unknown): value is BgVolatileConfig {
  if (typeof value !== 'object' || value === null) return false
  const ref = (value as Record<string, unknown>).mode
  return typeof ref === 'object' && ref !== null && typeof (ref as { get?: unknown }).get === 'function'
}

/** 取本插件的 fiber（0.2.x 的 settings 策略与 configEditor 都要它寻址）。 */
function readFiber(ctx: Context): unknown {
  try {
    return (ctx as { fiber?: unknown }).fiber
  } catch {
    return undefined
  }
}

/** 取本插件在 profile 里的 loader 条目（`configEditor.edit` 的第一参）。 */
function readFiberEntry(ctx: Context): unknown {
  try {
    return (ctx as { fiber?: { entry?: unknown } }).fiber?.entry
  } catch {
    return undefined
  }
}

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
        () => logSafe(settingsCtx, 'info',
          `dsh-bg-new: inherited settings from legacy namespace "${legacyNs}"`),
        (error: unknown) => logSafe(settingsCtx, 'warn',
          `dsh-bg-new: could not inherit settings from "${legacyNs}": ${String(error)}`),
      )
    } catch (error) {
      logSafe(settingsCtx, 'warn', `dsh-bg-new: legacy namespace "${legacyNs}" skipped: ${String(error)}`)
    }
  }
}

/**
 * 安全写日志：继承是**尽力而为**的旁路，绝不该因为 logger 缺失而抛出未捕获异常
 * （异步回调里抛出的异常在 host 进程里表现为 unhandled rejection，很难排查）。
 */
function logSafe(settingsCtx: Context, level: 'info' | 'warn', message: string): void {
  try {
    settingsCtx.logger[level](message)
  } catch {
    // logger 不可用 → 静默；继承本身不依赖日志
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
 * 安装背景设置的宿主接缝（随插件生命周期挂/摘），两种宿主设置模型自动择一：
 *
 * - **0.2.x**（`apply` 第二参是 volatile 引用集合）：引用即权威值，写入走
 *   `configEditor.edit()` 落 profile patch，并让 settings 知道本插件自带面板。
 * - **0.1.x**（没有引用）：`settings.register(BG_NAMESPACE, schema)` 老路径，
 *   含 `watch` 清缓存与老命名空间的一次性继承。
 *
 * 启动时读取并校验 config.json（src/config.ts，进程内缓存），非法字段回退
 * 默认并在此记日志。
 *
 * v0.4.2：背景**提交为 mode=off（恢复默认）**时清理媒体目录缓存（#7）——
 * 0.1.x 由 `watch` 覆盖所有写者；0.2.x 的引用没有订阅接口，改为激活时判一次 +
 * 本模块自己写入后判一次，幂等（已空目录清 0 次）。
 * @param ctx - host 插件 ctx（index.ts 入口调用一次）。
 * @param config - `apply` 的第二参（0.2.x 是 volatile 引用集合；0.1.x 是普通对象/undefined）。
 * @returns disposer：摘除通道与后台注册。
 */
export function installBgSettings(ctx: Context, config?: unknown): () => void {
  const resolved = loadBgConfig()
  for (const warning of resolved.warnings) ctx.logger.warn(warning)

  // ---- 0.2.x：entry Config（volatile 引用）+ configEditor 写回 ----
  if (isBgVolatileConfig(config)) {
    const refs = config
    channel = { kind: 'live', refs }
    liveEntry = readFiberEntry(ctx)
    ctx.logger.info(`dsh-bg-new: settings channel = live (entry Config ${BG_NAMESPACE})`)
    // 0.2.x 的引用没有订阅接口（cosmokit 的 createVolatile 只给 get()），所以
    // "提交为 mode=off 就清媒体缓存"只能在**本模块自己写入**之后判断（见 persistBgState）；
    // 激活时**不**清：$DSH_HOME/dsh-bg-new/media 是各 profile 共用的目录，
    // 按本 profile 的 mode=off 清一遍会把别的 profile（网页端）正在用的壁纸删掉。
    // 自带抽屉 UI：告诉 settings 不要为这个 entry 再生成一张自动表单
    const offSettings = ctx.inject(['settings'], (settingsCtx) => {
      settingsCtx.effect(() => {
        const settings = (settingsCtx as {
          settings?: { configure?: (policy: { auto: boolean }, fiber: unknown) => unknown }
        }).settings
        return settings?.configure?.({ auto: false }, readFiber(ctx))
      }, `dsh-bg-new: ${BG_NAMESPACE} settings policy`)
    })
    // 写入通道：配置文件编辑器（headless 部署可能没有 → 回退 state.json）
    const offEditor = ctx.inject(['configEditor'], (editorCtx) => {
      liveEditor = (editorCtx as { configEditor?: BgConfigEditorLike }).configEditor
      editorCtx.effect(() => () => {
        liveEditor = undefined
      }, 'dsh-bg-new: config editor detached')
    })
    return () => {
      channel = undefined
      liveEditor = undefined
      liveEntry = undefined
      offEditor()
      offSettings()
    }
  }

  // ---- 0.1.x：settings 命名空间（老路径原样保留） ----
  const disposer = ctx.inject(['settings'], (settingsCtx) => {
    const scope = settingsCtx.settings.register(BG_NAMESPACE, buildBgSectionSchema(resolved.config))
    logSafe(settingsCtx, 'info', `dsh-bg-new: settings channel = legacy (namespace ${BG_NAMESPACE})`)
    channel = { kind: 'legacy', scope }
    // watch：namespace 解析值提交变化时回调 (next)；mode=off → 清理媒体缓存
    const unwatch = scope.watch((next) => {
      const doc = typeof next === 'object' && next !== null && !Array.isArray(next)
        ? next as unknown as BgSectionDoc
        : undefined
      if (doc?.mode === 'off') pruneMediaCache()
    })
    // settings 服务脱离时清空，避免 stale scope 指向已注销命名空间
    settingsCtx.effect(() => () => {
      if (channel?.kind === 'legacy' && channel.scope === scope) channel = undefined
      unwatch()
    }, `dsh-bg-new: ${BG_NAMESPACE} scope detached`)
    // 改名兼容：把老命名空间的用户层一次性继承过来（尽力而为，失败只记日志）
    inheritLegacyBgNamespace(settingsCtx, resolved.config, scope)
  })
  return () => {
    channel = undefined
    disposer()
  }
}

/** 目标说明：settings=命名空间（权威）；file=state.json（回退）。 */
export interface BgPersistResult {
  target: 'settings' | 'file'
}

/**
 * 持久化一次背景状态（按字段存在性 merge，不动只读镜像字段）：
 * - 0.1.x → 写 settings 命名空间的 user 层（`scope.update`）；
 * - 0.2.x → 并经 `configEditor.edit` 合并进本 entry 的 profile 配置；
 * - 都没有 → 写 state.json 回退镜像。
 * @param state - 背景状态；fit/textScheme/loop/mediaKey 为可选，仅当存在于
 *   state 时才写（避免每次 apply 都清掉/覆盖上次用户选择）。
 */
export async function persistBgState(state: BgState): Promise<BgPersistResult> {
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

  // 0.1.x：写命名空间 user 层
  if (channel?.kind === 'legacy') {
    await channel.scope.update(patch)
    return { target: 'settings' }
  }

  // 0.2.x：把 patch 合并进本 entry 的 profile 配置（configEditor 落 cordis.patch.yml）
  if (channel?.kind === 'live') {
    const editor = liveEditor
    const entry = liveEntry
    if (editor !== undefined && entry !== undefined && entry !== null) {
      await editor.edit(entry, (current) => {
        const next = typeof current === 'object' && current !== null && !Array.isArray(current)
          ? { ...(current as Record<string, unknown>) }
          : {}
        for (const [field, value] of Object.entries(patch)) next[field] = value
        return next
      })
      if (state.mode === 'off') pruneMediaCache()
      return { target: 'settings' }
    }
    // 没有配置文件编辑器的 0.2.x 部署：退回文件镜像，行为与 0.1.x 无 settings 时一致
    writeState(state)
    return { target: 'file' }
  }

  writeState(state)
  return { target: 'file' }
}

/**
 * 0.2.x：直接从 volatile 引用读出当前背景状态。
 * 引用由 loader 按 schema 解析（默认值已烘焙），这里只做类型/枚举兜底。
 */
function readLiveState(refs: BgVolatileConfig): BgState {
  const cfg = loadBgConfig().config
  const text = (field: keyof BgSectionDoc, fallback: string): string => {
    const value = refs[field]?.get?.()
    return typeof value === 'string' ? value : fallback
  }
  const num = (field: keyof BgSectionDoc, fallback: number): number => {
    const value = refs[field]?.get?.()
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback
  }
  const bool = (field: keyof BgSectionDoc, fallback: boolean): boolean => {
    const value = refs[field]?.get?.()
    return typeof value === 'boolean' ? value : fallback
  }
  const mode = text('mode', 'off')
  const fit = text('fit', '')
  const scheme = text('textScheme', '')
  return {
    mode: (BG_MODES as readonly string[]).includes(mode) ? mode as BgMode : 'off',
    value: text('value', ''),
    fit: (BG_FITS as readonly string[]).includes(fit) ? fit as BgFit : cfg.defaultFit,
    textScheme: (BG_TEXT_SCHEMES as readonly string[]).includes(scheme)
      ? scheme as BgTextScheme
      : cfg.defaultTextScheme,
    loop: bool('loop', cfg.defaultLoop),
    mediaKey: text('mediaKey', ''),
    opacity: num('opacity', 1),
    posX: num('posX', 50),
    posY: num('posY', 50),
    scale: num('scale', BG_SCALE_DEFAULT),
    zoom: num('zoom', BG_ZOOM_DEFAULT),
    volume: num('volume', 1),
    glass: bool('glass', BG_GLASS_DEFAULT),
    updatedAt: '',
  }
}

/**
 * 读取当前背景状态：settings 可用时以命名空间为准（schema 默认 = config
 * 解析值；fit/textScheme/loop 缺失时取命名空间默认），否则回退 state.json
 * 并用 config 默认补齐可选字段。供 tool / style.ts / media 路由读取。
 */
export function readBgState(): BgState {
  if (channel?.kind === 'live') return readLiveState(channel.refs)
  if (channel?.kind === 'legacy') {
    const doc = channel.scope.get()
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

