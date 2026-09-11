/**
 * dsh-bg-new —— 背景状态读写（host 各插件共享；settings 缺失时回退镜像）。
 *
 * 状态持久化在 DSH 用户数据区：$DSH_HOME/dsh-bg-new/state.json
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

import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { dshHomePath } from '@deepseek-ai/dsh-home-paths'
import type { BgFit, BgMode, BgTextScheme } from './bg-config.ts'

export type { BgMode } from './bg-config.ts'

export interface BgState {
  /** 当前生效的背景模式。 */
  mode: BgMode
  /**
   * 模式相关载荷：
   * - color: CSS 颜色值，如 #1e2a78 / rgb(...)
   * - gradient: 完整 CSS 渐变，如 linear-gradient(135deg, #1e2a78, #2b1055)
   * - image: http(s) URL / data URI（本地图经 UI 或 bg_apply file 内联）
   * - video: http(s) 视频 URL；本地视频则为绝对路径（mediaKey 指向路由）
   * - off: 空
   */
  value: string
  /** 媒体适配（image/video）；color/gradient 无意义。 */
  fit?: BgFit
  /** 文字方案偏好；'auto' 由客户端按亮度推断。 */
  textScheme?: BgTextScheme
  /** 视频循环（UI 可选持久化）。 */
  loop?: boolean
  /** 本地视频的媒体键（host webServer /dsh-bg-new-media/<key> 按它找文件）。 */
  mediaKey?: string
  /** 媒体不透明度 0..1（image/video 渲染用；v0.3.1 新增，缺省 1=不透明）。 */
  opacity?: number
  /** 焦点水平定位 0..100（%）（image/video；v0.3.1 新增，缺省 50=居中）。 */
  posX?: number
  /** 焦点垂直定位 0..100（%）（image/video；v0.3.1 新增，缺省 50=居中）。 */
  posY?: number
  /** 媒体缩放 0.25..4（v0.4.3 新增；缺省 1=不缩放，焦点为缩放中心）。 */
  scale?: number
  /** 放大聚焦 1..3（v0.5.0 新增；缺省 1=不缩放，缩放中心 = 焦点 posX/posY）。 */
  zoom?: number
  /** 视频音量 0..1（v0.4 新增；缺省 1=满音量）。 */
  volume?: number
  /** 毛玻璃质感（v0.6.0 新增；缺省 false=关闭）。 */
  glass?: boolean
  /** 更新时间（ISO）。 */
  updatedAt: string
}

export const EMPTY_STATE: BgState = { mode: 'off', value: '', updatedAt: '' }

/** 数据目录名（state.json / config.json / media 都在它下面）。 */
const BG_HOME_DIR = 'dsh-bg-new'
/**
 * 历次改名前用过的老目录名，**从新到旧**排列：
 * - `dsh-bg`：v0.6.0 的短名字（v0.7.0 改名为 dsh-bg-new）
 * - `dsh-bg-switch`：最早的仓库名/包名
 */
const BG_HOME_DIR_LEGACY = ['dsh-bg', 'dsh-bg-switch'] as const

/**
 * 本插件的数据目录绝对路径（`$DSH_HOME/dsh-bg-new`）。
 *
 * **改名兼容**：包名/目录名一路从 `dsh-bg-switch` → `dsh-bg`（v0.6.0）→
 * `dsh-bg-new`（v0.7.0）。老用户（新目录还没建、某个老目录还在）**继续用最接近的
 * 那个老目录** —— 既不复制也不搬动可能几百 MB 的媒体文件，壁纸/视频与
 * config.json 原样可用；全新安装（哪个目录都没有）直接用新名字。一旦新目录出现
 * （例如用户手动搬过），就切到新目录。
 *
 * 刻意**不缓存**结果：`DSH_HOME` 会被测试重定向，缓存会把路径钉死。
 */
export function bgHomeDir(): string {
  const next = dshHomePath(BG_HOME_DIR)
  try {
    if (!existsSync(next)) {
      for (const legacyName of BG_HOME_DIR_LEGACY) {
        const legacy = dshHomePath(legacyName)
        if (existsSync(legacy)) return legacy
      }
    }
  } catch {
    // 探测失败（权限/异常）→ 按新目录处理
  }
  return next
}

/** 数据目录下的路径（如 `state.json`、`config.json`、`media/<key>.<ext>`）。 */
export function bgDataPath(...segments: string[]): string {
  return join(bgHomeDir(), ...segments)
}

function statePath(): string {
  return bgDataPath('state.json')
}

/** 同步读取当前状态；文件缺失或损坏时返回空状态。 */
export function readState(): BgState {
  try {
    const raw = readFileSync(statePath(), 'utf8')
    const parsed: unknown = JSON.parse(raw)
    if (parsed && typeof parsed === 'object') {
      const p = parsed as Record<string, unknown>
      if (typeof p.mode === 'string' && typeof p.value === 'string') {
        return {
          mode: p.mode as BgMode,
          value: p.value,
          updatedAt: typeof p.updatedAt === 'string' ? p.updatedAt : '',
          fit: typeof p.fit === 'string' ? (p.fit as BgFit) : undefined,
          textScheme: typeof p.textScheme === 'string' ? (p.textScheme as BgTextScheme) : undefined,
          loop: typeof p.loop === 'boolean' ? p.loop : undefined,
          mediaKey: typeof p.mediaKey === 'string' ? p.mediaKey : undefined,
          opacity: typeof p.opacity === 'number' ? p.opacity : undefined,
          posX: typeof p.posX === 'number' ? p.posX : undefined,
          posY: typeof p.posY === 'number' ? p.posY : undefined,
          scale: typeof p.scale === 'number' ? p.scale : undefined,
          zoom: typeof p.zoom === 'number' ? p.zoom : undefined,
          volume: typeof p.volume === 'number' ? p.volume : undefined,
          glass: typeof p.glass === 'boolean' ? p.glass : undefined,
        }
      }
    }
  } catch {
    // 文件不存在 / 损坏 → 视为默认
  }
  return EMPTY_STATE
}

/** 同步写入状态（写临时文件后原子改名；Windows 上 rename 覆盖已有文件会失败，先删再改）。 */
export function writeState(state: BgState): void {
  const path = statePath()
  mkdirSync(dirname(path), { recursive: true })
  const tmp = `${path}.tmp`
  writeFileSync(tmp, JSON.stringify(state, null, 2), 'utf8')
  try {
    renameSync(tmp, path)
  } catch {
    rmSync(path, { force: true })
    renameSync(tmp, path)
  }
}
