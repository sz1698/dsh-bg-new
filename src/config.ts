/**
 * dsh-bg-new —— host 侧 config.json 读取（文件 IO 包装层）。
 *
 * 位置：$DSH_HOME/dsh-bg-new/config.json（与 state.json 同目录；DSH_HOME
 * 未设置时 @deepseek-ai/dsh-home-paths 回退 ~/.dsh）。可覆盖字段见
 * src/bg-config.ts 的 {@link BgConfig}（imageExt/videoExt/maxImageMB/maxVideoMB/
 * defaultFit/defaultTextScheme/defaultLoop）。文件缺失 → 全默认；JSON 解析失败
 * 或字段非法 → 逐字段回退内置默认并记录 issue（installBgNamespace 启动时经
 * ctx.logger 打日志）。
 *
 * 结果进程内缓存（模块级）：host 启动读一次，tool / bg-settings / media 路由
 * 共用同一份；config.json 的改动需重启进程生效（README 已注明）。
 */

import { readFileSync } from 'node:fs'
import {
  DEFAULT_BG_CONFIG,
  normalizeBgConfig,
  type BgConfig,
} from './bg-config.ts'
import { bgDataPath } from './state.ts'

export interface ResolvedBgConfig {
  config: BgConfig
  /** 'file'=读取了 config.json；'default'=文件缺失/解析失败整体回退。 */
  source: 'file' | 'default'
  /** 需要记日志的说明（字段级回退或文件读取失败）。 */
  warnings: string[]
}

let cached: ResolvedBgConfig | undefined

/** config.json 绝对路径（测试可用 DSH_HOME 环境变量重定向）。 */
export function bgConfigPath(): string {
  return bgDataPath('config.json')
}

function readRaw(): { raw: unknown; warnings: string[]; source: 'file' | 'default' } {
  try {
    const text = readFileSync(bgConfigPath(), 'utf8')
    const parsed: unknown = JSON.parse(text)
    return { raw: parsed, warnings: [], source: 'file' }
  } catch (error) {
    // 文件缺失（ENOENT）是首次安装的常态：整体走默认，不产生告警噪音；
    // 其余读取/解析失败才记日志。
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return { raw: undefined, warnings: [], source: 'default' }
    }
    const message = error instanceof Error ? error.message : String(error)
    return {
      raw: undefined,
      warnings: [`dsh-bg-new: 读取 config.json 失败（${message}），使用内置默认配置`],
      source: 'default',
    }
  }
}

/**
 * 解析并缓存配置。首次调用读盘，其后返回缓存。
 * @param force - true 时强制重读（测试用）。
 */
export function loadBgConfig(force = false): ResolvedBgConfig {
  if (cached !== undefined && !force) return cached
  const { raw, warnings, source } = readRaw()
  const { config, issues } = normalizeBgConfig(raw)
  // normalize 对 null/undefined 无 issue；对缺失文件场景 warnings 已给出。
  if (config === DEFAULT_BG_CONFIG && source === 'file' && issues.length === 0) {
    // 显式写全默认值的配置文件：保持 source='file'（有文件）但不值得特别记录。
  }
  cached = { config, source, warnings: [...warnings, ...issues] }
  return cached
}

/** 测试/重置缓存用。 */
export function resetBgConfigCache(): void {
  cached = undefined
}

/** 便捷读当前生效配置（同步）。 */
export function currentBgConfig(): BgConfig {
  return loadBgConfig().config
}
