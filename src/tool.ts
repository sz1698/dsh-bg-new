/**
 * dsh-bg-new —— host 工具插件（R3 触发面；v0.3 扩 video/fit/textScheme）。
 *
 * 注册工具 bg_apply：模型通过对话调用它来更换 DSH 网页界面的背景。
 * v0.3 行为：
 * - mode 扩 'video'：value 为 http(s) 视频 URL；file 参数给本地视频绝对路径时
 *   不内联 —— 生成随机 mediaKey 并随状态写 settings（value 保留路径），host 的
 *   /dsh-bg-new-media/<key> 路由（src/media.ts）按 key 从当前状态找路径流式伺服
 *   （实现 Range 206，供视频拖动/时长）。跨重启有效：settings 持久化后路由仍
 *   按同一份状态找文件。
 * - 校验扩展名/大小用 config.json（src/config.ts → src/bg-config.ts）的
 *   imageExt/videoExt/maxImageMB/maxVideoMB；非法字段启动时已回退默认并记日志。
 * - fit / textScheme 可选参数：合法时随状态持久化（color/gradient 可忽略 fit）。
 * - v0.3.1：新增可选 opacity（0–1 小数或 0–100 百分数，吸附 0.05 步长）与
 *   posX / posY（0–100 百分比焦点；默认 50=居中），仅 image/video 生效。
 * - v0.4：本地 image 不再内联 data URI —— 与本地 video 一致「登记 + mediaKey」：
 *   校验扩展名/大小（config 表）后 value 保留原路径、mediaKey 写 settings，
 *   host /dsh-bg-new-media/<key> 路由伺服（GET 先查媒体目录、再按状态原路径回退）。
 *   mode=off 整命名空间重置：除 mode/value/mediaKey 外，fit/textScheme/loop/
 *   opacity/posX/posY/volume 全部回默认（config 默认与 1/50/50/1），不留残值。
 *
 * 持久化（settings 优先，state.json 回退；见 src/bg-settings.ts）。
 */

import { randomUUID } from 'node:crypto'
import { statSync } from 'node:fs'
import { extname } from 'node:path'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { Context } from '@deepseek-ai/cordis'
import {
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
  type BgConfig,
  type BgFit,
  type BgMode,
  type BgTextScheme,
} from './bg-config.ts'
import { currentBgConfig } from './config.ts'
import { persistBgState } from './bg-settings.ts'
import type { BgState } from './state.ts'

export const name = 'dsh-bg-new'
export const inject = ['tools']

/** CSS 安全字符集：阻止通过 value 注入分号/花括号/尖括号拆出多余规则。 */
const CSS_SAFE = /^[A-Za-z0-9#(),.%\s/\-]+$/

/** 校验并规整 CSS 颜色/渐变载荷；非法则抛错。 */
function normalizeCssValue(mode: 'color' | 'gradient', raw: string): string {
  const value = raw.trim()
  if (value.length === 0) throw new Error(`bg_apply: ${mode} 模式需要 value 参数（CSS ${mode === 'color' ? '颜色' : '渐变'}）`)
  if (value.length > 300) throw new Error('bg_apply: value 过长（>300 字符）')
  if (!CSS_SAFE.test(value)) throw new Error('bg_apply: value 含不允许的字符（仅允许 CSS 颜色/渐变语法字符，不能含 ; { } < >）')
  if (mode === 'gradient') {
    const open = value.indexOf('(')
    const head = (open >= 0 ? value.slice(0, open + 1) : '').toLowerCase()
    if (!['linear-gradient(', 'radial-gradient(', 'conic-gradient(', 'repeating-linear-gradient(', 'repeating-radial-gradient('].includes(head)) {
      throw new Error('bg_apply: gradient 模式的 value 必须是完整 CSS 渐变，如 linear-gradient(135deg, #1e2a78, #2b1055)')
    }
  } else if (!/^[A-Za-z#]/.test(value)) {
    throw new Error('bg_apply: color 模式的 value 需要是 CSS 颜色，如 #1e2a78 或 rgb(30, 42, 120)')
  }
  return value
}

/**
 * http(s) URL 校验（image/video 共用）；去掉会在 CSS url() 里造成歧义的字符。
 * v0.6.0：按扩展名做**跨类型**校验 —— image 模式拒绝明显是视频的链接
 * （.mp4/.webm/…），video 模式拒绝明显是图片的链接；无扩展名的动态地址放行。
 */
function normalizeMediaUrlValue(raw: string, kind: 'image' | 'video', cfg: BgConfig): string {
  const value = raw.trim()
  if (!/^https?:\/\//i.test(value)) {
    throw new Error('bg_apply: 该模式的 URL 必须以 http:// 或 https:// 开头')
  }
  if (value.length > 2000) throw new Error('bg_apply: URL 过长')
  const conflict = mediaUrlKindConflict(value, kind, cfg)
  if (conflict === 'is-video') {
    throw new Error('bg_apply: 这是视频链接（扩展名属于视频），image 模式请改用 mode=video，或换成图片链接')
  }
  if (conflict === 'is-image') {
    throw new Error('bg_apply: 这是图片链接（扩展名属于图片），video 模式请改用 mode=image，或换成视频链接')
  }
  return value.replace(/[\\"]/g, '')
}

/** 校验可选 fit 参数（undefined = 不随本次写；持久化保留上次选择）。 */
function normalizeFitArg(raw: unknown): BgFit | undefined {
  if (raw === undefined || raw === null) return undefined
  const value = String(raw).trim()
  if (!(BG_FITS as readonly string[]).includes(value)) {
    throw new Error(`bg_apply: fit 需是 ${BG_FITS.join(' / ')} 之一，收到：${JSON.stringify(value)}`)
  }
  return value as BgFit
}

/** 校验可选 textScheme 参数。 */
function normalizeTextSchemeArg(raw: unknown): BgTextScheme | undefined {
  if (raw === undefined || raw === null) return undefined
  const value = String(raw).trim()
  if (!(BG_TEXT_SCHEMES as readonly string[]).includes(value)) {
    throw new Error(`bg_apply: textScheme 需是 ${BG_TEXT_SCHEMES.join(' / ')} 之一，收到：${JSON.stringify(value)}`)
  }
  return value as BgTextScheme
}

/**
 * 校验可选 opacity 参数（v0.3.1；image/video）。
 * 兼容两种写法：0–1 小数（0.5）与 0–100 百分数（50 / '60'）；>1 按百分数换算。
 * 返回值吸附到 settings schema 的 0.05 步长（避免 update 时 step 校验拒绝）。
 */
function normalizeOpacityArg(raw: unknown): number | undefined {
  if (raw === undefined || raw === null || raw === '') return undefined
  const value = typeof raw === 'number' ? raw : Number(String(raw).trim())
  if (!Number.isFinite(value)) {
    throw new Error(`bg_apply: opacity 需是 0–1 的小数或 0–100 的百分数（如 0.5 或 50），收到：${JSON.stringify(raw)}`)
  }
  if (value < 0 || value > 100) {
    throw new Error(`bg_apply: opacity 超出范围（0–1 小数或 0–100 百分数），收到：${JSON.stringify(raw)}`)
  }
  const frac = value > 1 ? value / 100 : value
  return Math.round(frac * 20) / 20
}

/** 校验可选 posX/posY 参数（v0.3.1；0–100 百分比，默认 50=居中）。 */
function normalizePosArg(raw: unknown, label: string): number | undefined {
  if (raw === undefined || raw === null || raw === '') return undefined
  const value = typeof raw === 'number' ? raw : Number(String(raw).trim())
  if (!Number.isFinite(value)) {
    throw new Error(`bg_apply: ${label} 需是 0–100 的数字（百分比，默认 50=居中），收到：${JSON.stringify(raw)}`)
  }
  if (value < 0 || value > 100) {
    throw new Error(`bg_apply: ${label} 超出范围 0–100，收到：${JSON.stringify(raw)}`)
  }
  return Math.round(value)
}

/**
 * 校验可选 scale 参数（v0.4.3；媒体缩放 0.25–4）。
 * 兼容两种写法：倍数（1.5 / '1.5'）与百分数（150 / '150%'，>4 时按百分数换算），
 * 结果吸附到 settings schema 的 0.05 步长并钳制在 0.25–4。
 */
function normalizeScaleArg(raw: unknown): number | undefined {
  if (raw === undefined || raw === null || raw === '') return undefined
  const value = typeof raw === 'number'
    ? raw
    : Number(String(raw).trim().replace(/%$/, ''))
  if (!Number.isFinite(value)) {
    throw new Error(`bg_apply: scale 需是 ${BG_SCALE_MIN}–${BG_SCALE_MAX} 的倍数（如 1.5）或百分数（如 150%），收到：${JSON.stringify(raw)}`)
  }
  const factor = value > BG_SCALE_MAX ? value / 100 : value
  if (factor < BG_SCALE_MIN || factor > BG_SCALE_MAX) {
    throw new Error(`bg_apply: scale 超出范围 ${BG_SCALE_MIN}–${BG_SCALE_MAX}（1=不缩放），收到：${JSON.stringify(raw)}`)
  }
  return Math.round(factor * 20) / 20
}

/**
 * 校验可选 zoom 参数（v0.5.0；放大聚焦 1–3）。
 * 兼容两种写法：倍数（2 / '2'）与百分数（200 / '200%'，>BG_ZOOM_MAX 时按百分数换算），
 * 结果吸附到 settings schema 的 0.05 步长并钳制在 1–3。
 */
function normalizeZoomArg(raw: unknown): number | undefined {
  if (raw === undefined || raw === null || raw === '') return undefined
  const value = typeof raw === 'number'
    ? raw
    : Number(String(raw).trim().replace(/%$/, ''))
  if (!Number.isFinite(value)) {
    throw new Error(`bg_apply: zoom 需是 ${BG_ZOOM_MIN}–${BG_ZOOM_MAX} 的倍数（如 2）或百分数（如 200%），收到：${JSON.stringify(raw)}`)
  }
  const factor = value > BG_ZOOM_MAX ? value / 100 : value
  if (factor < BG_ZOOM_MIN || factor > BG_ZOOM_MAX) {
    throw new Error(`bg_apply: zoom 超出范围 ${BG_ZOOM_MIN}–${BG_ZOOM_MAX}（1=不缩放，最大 3=300%；缩小请用 scale），收到：${JSON.stringify(raw)}`)
  }
  return Math.round(factor * 20) / 20
}

/** 校验可选 glass 参数（v0.6.0；毛玻璃质感开关）。 */
function normalizeGlassArg(raw: unknown): boolean | undefined {
  if (raw === undefined || raw === null || raw === '') return undefined
  if (typeof raw === 'boolean') return raw
  const value = String(raw).trim().toLowerCase()
  if (value === 'true' || value === '1' || value === 'on') return true
  if (value === 'false' || value === '0' || value === 'off') return false
  throw new Error(`bg_apply: glass 需是布尔值（true/false），收到：${JSON.stringify(raw)}`)
}

/** 取文件扩展名（无点、小写）。 */
function fileExt(path: string): string {
  return extname(path).slice(1).toLowerCase()
}function localFileSize(path: string): number | null {
  try {
    return statSync(path).size
  } catch {
    return null
  }
}

/**
 * 校验并返回本地媒体文件（image/video 共用，v0.4：只登记不内联）：
 * 扩展名须在 kind 对应允许表、文件可读。
 * v0.6.0：**视频不校验体积**（需求「背景视频大小不要设限制」）；图片仍按
 * config.maxImageMB。超限/格式错抛中文 Error。
 */
function validateLocalMediaFile(path: string, kind: 'image' | 'video', cfg: BgConfig): string {
  const ext = fileExt(path)
  const allowed = kind === 'image' ? cfg.imageExt : cfg.videoExt
  if (!allowed.includes(ext)) {
    throw new Error(`bg_apply: 不支持的${kind === 'image' ? '图片' : '视频'}类型 .${ext || '(无扩展名)'}（允许 ${allowed.join(' / ')}）`)
  }
  const size = localFileSize(path)
  if (size === null) throw new Error(`bg_apply: 读取本地${kind === 'image' ? '图片' : '视频'}失败：${path}（请确认路径存在且可读）`)
  if (kind === 'video') return path
  const limitMB = cfg.maxImageMB
  if (size > limitMB * 1024 * 1024) {
    throw new Error(`bg_apply: 本地图片 ${size} 字节超过上限 ${limitMB}MB`)
  }
  return path
}

/** bg_apply 的原始参数形状（值可为 unknown，execute 内逐项校验）。 */
export interface BgApplyArgs {
  mode?: unknown
  value?: unknown
  file?: unknown
  fit?: unknown
  textScheme?: unknown
  /** 媒体不透明度（image/video）：0–1 小数或 0–100 百分数。 */
  opacity?: unknown
  /** 焦点水平定位 0–100（%）（image/video）。 */
  posX?: unknown
  /** 焦点垂直定位 0–100（%）（image/video）。 */
  posY?: unknown
  /** 媒体缩放（image/video）：0.25–4 倍数或百分数（150 / '150%'）。 */
  scale?: unknown
  /** 放大聚焦（image/video）：1–3 倍数或百分数（200 / '200%'）。 */
  zoom?: unknown
  /** 毛玻璃质感（v0.6.0）：true 开启表面半透明 + 背景模糊。 */
  glass?: unknown
}

/**
 * 纯逻辑核心（不碰 ctx/settings）：把工具参数校验并组装成 {@link BgState}。
 * 抽出为模块导出便于 build/verify-client.mjs 对 URL 放行 / mediaKey 生成 /
 * 扩展名校验做真实断言（execute 内部与测试共用同一路径）。
 * @param args - 模型给的原始参数。
 * @param cfg - 已解析的 config（src/config.ts currentBgConfig()）。
 * @throws 带中文错误信息（给出允许格式）。
 */
export function executeBgApply(args: BgApplyArgs, cfg: BgConfig): BgState {
  const modeRaw = String(args.mode ?? '').trim()
  const fit = normalizeFitArg(args.fit)
  const textScheme = normalizeTextSchemeArg(args.textScheme)
  const opacity = normalizeOpacityArg(args.opacity)
  const posX = normalizePosArg(args.posX, 'posX')
  const posY = normalizePosArg(args.posY, 'posY')
  const scale = normalizeScaleArg(args.scale)
  const zoom = normalizeZoomArg(args.zoom)
  const glass = normalizeGlassArg(args.glass)
  const file = typeof args.file === 'string' && args.file.trim() !== '' ? args.file.trim() : null
  const stamp = new Date().toISOString()
  /** 组装状态：只放确实提供的可选字段，避免 undefined 污染持久化。 */
  const buildState = (mode: BgMode, value: string, mediaKey = ''): BgState => {
    const out: BgState = { mode, value, mediaKey, updatedAt: stamp }
    if (fit !== undefined) out.fit = fit
    if (textScheme !== undefined) out.textScheme = textScheme
    if (opacity !== undefined) out.opacity = opacity
    if (posX !== undefined) out.posX = posX
    if (posY !== undefined) out.posY = posY
    if (scale !== undefined) out.scale = scale
    if (zoom !== undefined) out.zoom = zoom
    if (glass !== undefined) out.glass = glass
    return out
  }

  switch (modeRaw) {
    case 'color':
    case 'gradient': {
      const value = normalizeCssValue(modeRaw, String(args.value ?? ''))
      return buildState(modeRaw, value)
    }
    case 'image': {
      if (file) {
        // v0.4：本地图片不再内联 data URI —— 登记 + mediaKey（GET 媒体目录/原路径伺服）
        return buildState('image', validateLocalMediaFile(file, 'image', cfg), randomUUID())
      }
      const value = normalizeMediaUrlValue(String(args.value ?? ''), 'image', cfg)
      return buildState('image', value)
    }
    case 'video': {
      if (file) {
        // 本地视频不内联：value 留绝对路径，随机 mediaKey 指到 /dsh-bg-new-media/<key>
        return buildState('video', validateLocalMediaFile(file, 'video', cfg), randomUUID())
      }
      const value = normalizeMediaUrlValue(String(args.value ?? ''), 'video', cfg)
      return buildState('video', value)
    }
    case 'off':
      // v0.4：整命名空间重置 —— 运行时字段全部回默认（config 默认 / 1 / 50 / 50 / 1 / 1）
      // v0.5.0：zoom 一并回默认（1）
      return {
        mode: 'off',
        value: '',
        mediaKey: '',
        fit: cfg.defaultFit,
        textScheme: cfg.defaultTextScheme,
        loop: cfg.defaultLoop,
        opacity: 1,
        posX: 50,
        posY: 50,
        scale: BG_SCALE_DEFAULT,
        zoom: BG_ZOOM_DEFAULT,
        volume: 1,
        glass: BG_GLASS_DEFAULT,
        updatedAt: stamp,
      }
    default:
      throw new Error(`bg_apply: mode 必须是 color / gradient / image / video / off 之一，收到：${JSON.stringify(modeRaw)}`)
  }
}

export function apply(ctx: Context): void {
  ctx.tools.register(defineTool({
    name: 'bg_apply',
    description: '更换 DeepSeek Harness 网页界面的背景。当用户说想换背景、换配色、换皮肤、放壁纸图片、放背景视频时使用。' +
      'mode=color 把全局底色换成指定 CSS 颜色；mode=gradient 用指定 CSS 渐变做整页背景；' +
      'mode=image 用一张图片做整页壁纸（给 http(s) URL，或 file 传本地图片路径）；' +
      'mode=video 用一个视频做整页背景（给 http(s) URL，或 file 传本地视频路径；本地视频不内联、由插件媒体路由伺服）；' +
      'mode=off 恢复默认。fit/textScheme/opacity/posX/posY/scale/zoom/glass 可选（opacity/posX/posY/scale/zoom 仅 image/video：opacity=媒体不透明度 0–1 小数或 0–100 百分数；posX/posY=焦点定位百分比 0–100，50/50=居中；scale=媒体缩放 0.25–4 倍数或百分数，1=不缩放；zoom=放大聚焦 1–3 倍数或百分数，1=不缩放，最大 300%，缩放中心为焦点）。glass=毛玻璃质感开关（true/false，默认 false；开启后界面表面半透明并对背景做模糊）。' +
      '设置成功写入 settings 命名空间后客户端即时生效；无客户端会话时提示用户刷新页面生效。',
    parameters: {
      mode: {
        type: 'string',
        required: true,
        description: '背景模式：color（纯色）| gradient（渐变）| image（图片）| video（视频）| off（恢复默认）',
      },
      value: {
        type: 'string',
        description: 'color: CSS 颜色如 #1e2a78；gradient: 完整 CSS 渐变；image/video: http(s) URL（按扩展名校验类型：image 不收 .mp4/.webm 等视频链接，video 不收 .jpg/.png 等图片链接；无扩展名的动态地址放行）',
      },
      file: {
        type: 'string',
        description: '本地文件绝对路径（image/video 通用；登记伺服不内联：校验后生成 mediaKey 由插件媒体路由 /dsh-bg-new-media/<key> 伺服；image ≤maxImageMB，视频不设大小上限）',
      },
      fit: {
        type: 'string',
        description: `image/video 适配（可选）：${BG_FITS.join(' / ')}（fill=拉伸铺满 / cover=裁切铺满 / contain=完整容纳 / center=不缩放居中 / tile=平铺）`,
      },
      textScheme: {
        type: 'string',
        description: '文字与表面方案（可选）：auto（按背景亮度推断；image/video 推断不出时用浅色文字+深色表面）| light | dark',
      },
      opacity: {
        type: 'number',
        description: '媒体不透明度（可选，仅 image/video）：0–1 小数或 0–100 百分数（如 0.6 或 60；默认 1=不透明）',
      },
      posX: {
        type: 'number',
        description: '焦点水平定位（可选，仅 image/video）：0–100 百分比（默认 50=居中；0=看最左，100=看最右；配合 fit 的 cover/contain 即"定位到图片的某一块"）',
      },
      posY: {
        type: 'number',
        description: '焦点垂直定位（可选，仅 image/video）：0–100 百分比（默认 50=居中；0=看最上，100=看最下）',
      },
      scale: {
        type: 'number',
        description: `媒体缩放（可选，仅 image/video）：${BG_SCALE_MIN}–${BG_SCALE_MAX} 倍数（1=不缩放，>1 放大，<1 缩小）或百分数（150 或 '150%'）；与 posX/posY 组合即以焦点为中心放大/缩小`,
      },
      zoom: {
        type: 'number',
        description: `放大聚焦（可选，仅 image/video）：${BG_ZOOM_MIN}–${BG_ZOOM_MAX} 倍数（1=不缩放，最大 3=300%）或百分数（200 或 '200%'）；等价于"把可见窗口聚焦到 posX/posY 处并放大"，缩放中心即焦点；缩小请用 scale`,
      },
      glass: {
        type: 'boolean',
        description: '毛玻璃质感（可选）：true 开启（界面表面半透明 + 背景模糊），false 关闭（默认）。适合壁纸/视频背景让面板、气泡等表面呈现磨砂玻璃质感',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          ok: { type: 'boolean', required: true },
          message: { type: 'string', required: true },
          target: {
            type: 'string',
            description: '落盘目标：settings=settings 命名空间（权威，客户端即时生效）；file=state.json（回退，需刷新）',
          },
        },
      },
      render: (_args, value) => [{ type: 'text', text: value.message }],
    },
    async execute(args) {
      const state = executeBgApply(args as BgApplyArgs, currentBgConfig())
      const fileUsed = typeof args.file === 'string' && args.file.trim() !== ''
      const { target } = await persistBgState(state)
      const summary = state.mode === 'off'
        ? '已恢复默认背景（含定位/透明度/音量等全部运行时字段）。'
        : state.mode === 'image'
          ? '壁纸已设置' + (fileUsed ? '（本地图片已登记伺服，不内联）' : '') + '。'
          : state.mode === 'video'
            ? '背景视频已设置' + (fileUsed ? '（本地视频已登记伺服，经插件媒体路由流式播放）' : '') + '。'
            : `背景已设为 ${state.mode === 'color' ? '纯色' : '渐变'}。`
      const effect = target === 'settings'
        ? '客户端设置页将即时生效；若当前会话未加载客户端，刷新页面生效。'
        : '已写入状态文件，刷新页面生效。'
      return { ok: true, message: `${summary}${effect}`, target }
    },
  }))
}
