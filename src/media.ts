/**
 * dsh-bg-switch —— host 本地媒体路由（v0.4：上传登记 + 任意已登记媒体伺服）。
 *
 * v0.3 起为本地背景视频提供流式伺服；v0.4 扩为通用「上传+伺服」：
 * - **POST /dsh-bg-media/upload?kind=image|video&ext=<ext>**：body = 原始文件流。
 *   按 kind 校验扩展名（image 用 config.imageExt / video 用 videoExt，含默认表）；
 *   **体积上限只对 image 生效**（config.maxImageMB 默认 10MB）—— v0.6.0 起视频
 *   不设上限（需求：背景视频大小不要设限制），limitBytes 用 MAX_SAFE_INTEGER
 *   表示"不限制"（流式落盘的超限中止因此永不触发）。通过后写入
 *   `$DSH_HOME/dsh-bg-switch/media/<uuid>.<ext>`（dshHomePath 来自
 *   @deepseek-ai/dsh-home-paths）。响应 JSON `{ok:true, mediaKey:'<uuid>'}`；
 *   非法扩展 / 超限 / 坏参数 → 400 + 中文 message。
 *   上传的媒体**不写入 settings value**：客户端拿 mediaKey 调 setBg，value 留空，
 *   mediaKey 入 settings；`<img>/<video>` 的 src 按 资源解析 =
 *   mediaKey 非空 → `/dsh-bg-media/<mediaKey>`，否则 value 直接作 URL。
 * - **GET / HEAD /dsh-bg-media/<mediaKey>**：按 mediaKey 伺服**任意已登记媒体**
 *   （不再限定 mode=video / 状态匹配）：先查媒体目录里的 `<uuid>.<ext>`；未命中再
 *   兼容旧模式（状态 mode=video 且 mediaKey 匹配且 value 是本地绝对路径 → 伺服
 *   原路径文件，bg_apply file 参数的登记方式，v0.3 行为保留）。单段 bytes Range
 *   206 / 416 / 400 / 404 / HEAD 只回头。MIME 按扩展名（image 表 → video 表 →
 *   octet-stream）。
 *
 * 契约依据（host 源码，dsh-host 只读参考树，写入注释供复核）：
 * - webserver 注册 API：packages/host/webserver/src/index.ts
 *   `register(route: {kind:'prefix'|'exact', path, handler(req,res)})`（165–172），
 *   返回 disposer；重复 (kind,path) 抛错（168 行）。handler 拥有完整响应生命周期，
 *   res 是 node:http ServerResponse（47 行），可直接写流。method 不限 ——
 *   POST body 以原始流到达（req 是 IncomingMessage，可 'data'/'end' 边收边落盘，
 *   边计数即可在超限时提前中止，无需把 500MB 级视频整读进内存）。
 * - 命名路由先于 fallback 命中（match 221–229/317–327），因此本前缀路由与
 *   frontend-static 的 fallback 席位不冲突。
 * - compression 中间件对带 content-range 的响应豁免 gzip（95 行），印证 Range
 *   响应由路由直写姿势。
 *
 * 本插件声明 inject:['webServer']：只有提供 webServer 的 profile（web/桌面
 * connection）才激活；headless/纯 CLI 无 webServer 时不激活、无副作用。
 */

import {
  createReadStream,
  createWriteStream,
  mkdirSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { randomUUID } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { extname, join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { dshHomePath } from '@deepseek-ai/dsh-home-paths'
import { IMAGE_EXT_TO_MIME, VIDEO_EXT_TO_MIME, type BgConfig } from './bg-config.ts'
import { currentBgConfig } from './config.ts'
import { readBgState } from './bg-settings.ts'

export const name = 'dsh-bg-media'
export const inject = ['webServer']

/** 本插件持有的 webServer 前缀（客户端用它拼 src / 上传 URL）。 */
export const MEDIA_PATH_PREFIX = '/dsh-bg-media'

/** 上传子路径（POST）。 */
export const MEDIA_UPLOAD_PATH = '/dsh-bg-media/upload'

/** 媒体目录（上传文件落地处）：$DSH_HOME/dsh-bg-switch/media/。导出供冒烟/测试。 */
export function mediaDirPath(): string {
  return dshHomePath('dsh-bg-switch', 'media')
}

/** 取文件扩展名（无点、小写）。 */
function fileExt(path: string): string {
  return extname(path).slice(1).toLowerCase()
}

/** 状态里的 value 是否是本地绝对路径（bg_apply file 登记的旧模式）。 */
function looksLocalPath(value: string): boolean {
  return !/^(?:https?:|data:|blob:)/i.test(value) && value.length > 0
}

/** 扩展名 → Content-Type（image 表优先，其次 video 表，未知 octet-stream）。 */
function extToMime(ext: string): string {
  return IMAGE_EXT_TO_MIME[ext] ?? VIDEO_EXT_TO_MIME[ext] ?? 'application/octet-stream'
}

/**
 * 解析单个 Range 头（只支持单段 bytes 语法）。
 * @returns 目标 [start,end]（闭区间，含端），或 'invalid'（400）/ 'unsatisfiable'（416）。
 * 导出供 build/verify-client.mjs 断言（真实 HTTP 冒烟由 CLI web 启动覆盖）。
 */
export function parseByteRange(header: string, size: number): { start: number; end: number } | 'invalid' | 'unsatisfiable' {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim())
  if (!match) return 'invalid'
  const [, startRaw, endRaw] = match
  if (startRaw === '' && endRaw === '') return 'invalid'
  if (startRaw === '') {
    // 后缀范围：-N = 最后 N 字节
    const suffix = Number(endRaw)
    if (!Number.isFinite(suffix) || suffix <= 0) return 'invalid'
    if (size === 0) return 'unsatisfiable'
    const start = Math.max(0, size - suffix)
    return { start, end: size - 1 }
  }
  const start = Number(startRaw)
  if (!Number.isInteger(start) || start < 0) return 'invalid'
  if (start >= size) return 'unsatisfiable'
  const end = endRaw === '' ? size - 1 : Math.min(Number(endRaw), size - 1)
  if (!Number.isInteger(end) || end < start) return 'invalid'
  return { start, end }
}

/** 发 JSON 响应（上传接口用）。 */
function jsonResponse(res: ServerResponse, status: number, payload: Record<string, unknown>): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(payload))
}

/** 发 404。 */
function notFound(res: ServerResponse): void {
  res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
  res.end('dsh-bg-media: 未知媒体（媒体目录无该文件，且当前状态未指向本地背景）')
}

/** 发 416（Range 不可满足）。 */
function rangeNotSatisfiable(res: ServerResponse, size: number): void {
  res.writeHead(416, {
    'content-range': `bytes */${size}`,
  })
  res.end()
}

/** 解析请求路径（/dsh-bg-media/... → pathname；上传判断需要）。 */
function pathnameOf(req: IncomingMessage): string {
  try {
    return new URL(req.url ?? '/', 'http://x').pathname
  } catch {
    return ''
  }
}

/** 解析请求路径里的 mediaKey（/dsh-bg-media/<key>）。 */
function mediaKeyOf(req: IncomingMessage): string {
  try {
    const pathname = new URL(req.url ?? '/', 'http://x').pathname
    return decodeURIComponent(pathname.slice(MEDIA_PATH_PREFIX.length + 1))
  } catch {
    return ''
  }
}

/**
 * 上传参数预校验（纯逻辑，供路由与 verify-client.mjs 断言共用）。
 * @param kindRaw - query.kind（image | video）。
 * @param extRaw - query.ext（如 png / mp4；可带前置点，会清洗）。
 * @param size - 已知大小（Content-Length）；null 表示流式未知（只返回上限）。
 * @param cfg - 解析后的 config（允许扩展表 / MB 上限）。
 */
export function validateUpload(
  kindRaw: string | null,
  extRaw: string | null,
  size: number | null,
  cfg: BgConfig,
): { ok: true; limitBytes: number } | { ok: false; status: number; message: string } {
  const kind = kindRaw === 'image' ? 'image' : kindRaw === 'video' ? 'video' : null
  if (kind === null) {
    return { ok: false, status: 400, message: 'dsh-bg-media: 参数 kind 需是 image 或 video' }
  }
  const ext = (extRaw ?? '').trim().toLowerCase().replace(/^\.+/, '')
  if (!/^[a-z0-9]{1,12}$/.test(ext)) {
    return { ok: false, status: 400, message: `dsh-bg-media: 缺少或非法的扩展名参数 ext（如 png / mp4），收到：${JSON.stringify(extRaw ?? '')}` }
  }
  const allowed = kind === 'image' ? cfg.imageExt : cfg.videoExt
  if (!allowed.includes(ext)) {
    return { ok: false, status: 400, message: `dsh-bg-media: 不支持的${kind === 'image' ? '图片' : '视频'}类型 .${ext}（允许 ${allowed.join(' / ')}）` }
  }
  // v0.6.0：**视频不设体积上限**（需求：背景视频大小不要设限制）；图片仍按
  // config.maxImageMB 校验。返回的 limitBytes 同时供流式落盘的超限中止使用，
  // 视频用 MAX_SAFE_INTEGER 表示"不限制"（received > limitBytes 永不成立）。
  if (kind === 'video') return { ok: true, limitBytes: Number.MAX_SAFE_INTEGER }
  const limitMB = cfg.maxImageMB
  const limitBytes = Math.round(limitMB * 1024 * 1024)
  if (size !== null && Number.isFinite(size) && size > limitBytes) {
    return { ok: false, status: 400, message: `dsh-bg-media: 文件 ${size} 字节超过上限 ${limitMB}MB（kind=image）` }
  }
  return { ok: true, limitBytes }
}

/**
 * 把一个已通过校验的内存载荷写入媒体目录（verify-client.mjs 直接用它做
 * 「上传成功 → mediaKey」断言；生产 HTTP 路由走流式落盘避免大文件占内存）。
 * @param ext - 已清洗扩展名。
 * @param data - 文件字节。
 * @returns mediaKey（uuid；GET /dsh-bg-media/<key> 据此回读）。
 */
export function storeUploadBuffer(ext: string, data: Uint8Array): string {
  const key = randomUUID()
  const dir = mediaDirPath()
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, `${key}.${ext}`), data)
  return key
}

/**
 * 按 mediaKey 解析可伺服文件：① 媒体目录里 `<key>.<ext>`（上传登记）；
 * ② 旧模式状态（mode=video、mediaKey 匹配、value 为本地绝对路径）。
 * @returns 绝对路径；未命中返回 null。
 */
export function resolveMediaFilePath(mediaKey: string): string | null {
  if (!/^[0-9a-zA-Z-]{1,80}$/.test(mediaKey)) return null
  try {
    const dir = mediaDirPath()
    for (const name of readdirSync(dir)) {
      if (name.startsWith(`${mediaKey}.`)) return join(dir, name)
    }
  } catch {
    // 目录不存在 → 走状态回退
  }
  const state = readBgState()
  if (state.mode === 'video' && state.mediaKey === mediaKey && looksLocalPath(state.value)) {
    try {
      if (statSync(state.value).isFile()) return state.value
    } catch {
      // 状态指向的文件不可读 → 404
    }
  }
  return null
}

/**
 * 以单段 Range 语义伺服一个文件（GET/HEAD 共用；206 单段，200 整段）。
 * 从 resolveMediaFilePath 拿到 path 后调用。
 */
function serveFile(req: IncomingMessage, res: ServerResponse, filePath: string): void {
  let stat
  try {
    stat = statSync(filePath)
  } catch {
    notFound(res)
    return
  }
  if (!stat.isFile()) {
    notFound(res)
    return
  }
  const size = stat.size
  const type = extToMime(fileExt(filePath))
  const baseHeaders = {
    'content-type': type,
    'accept-ranges': 'bytes',
    'cache-control': 'no-store',
  }
  const rangeHeader = typeof req.headers.range === 'string' ? req.headers.range : undefined
  if (rangeHeader !== undefined) {
    const parsed = parseByteRange(rangeHeader, size)
    if (parsed === 'invalid') {
      res.writeHead(400)
      res.end()
      return
    }
    if (parsed === 'unsatisfiable') {
      rangeNotSatisfiable(res, size)
      return
    }
    const { start, end } = parsed
    const length = end - start + 1
    res.writeHead(206, {
      ...baseHeaders,
      'content-range': `bytes ${start}-${end}/${size}`,
      'content-length': length,
    })
    if (req.method === 'HEAD') {
      res.end()
      return
    }
    void streamBody(req, res, filePath, { start, end })
    return
  }
  res.writeHead(200, { ...baseHeaders, 'content-length': size })
  if (req.method === 'HEAD') {
    res.end()
    return
  }
  void streamBody(req, res, filePath, {})
}

/** 把文件的 [start,end] 段（或整段）pipe 到 res，随连接关闭销毁。 */
function streamBody(req: IncomingMessage, res: ServerResponse, filePath: string, range: { start?: number; end?: number }): Promise<void> {
  return new Promise<void>((resolve) => {
    const opts = range.start !== undefined ? { start: range.start, end: range.end } : {}
    const stream = createReadStream(filePath, opts)
    stream.on('error', () => {
      res.destroy()
      resolve()
    })
    res.on('close', () => {
      stream.destroy()
      resolve()
    })
    req.on('close', () => {
      stream.destroy()
      resolve()
    })
    stream.pipe(res)
    stream.on('end', () => resolve())
  })
}

/**
 * POST /dsh-bg-media/upload：边收边校验边落盘（超限即中止）。
 * 成功 → {ok:true, mediaKey}；失败 → 400 + 中文 message。
 */
async function handleUpload(req: IncomingMessage, res: ServerResponse): Promise<void> {
  let cfg: BgConfig
  let ext: string
  let limitBytes: number
  try {
    const url = new URL(req.url ?? '/', 'http://x')
    const kindRaw = url.searchParams.get('kind')
    const extRaw = url.searchParams.get('ext')
    cfg = currentBgConfig()
    const declared = (() => {
      const raw = req.headers['content-length']
      if (typeof raw !== 'string' || raw === '') return null
      const n = Number(raw)
      return Number.isFinite(n) ? n : null
    })()
    const pre = validateUpload(kindRaw, extRaw, declared, cfg)
    if (!pre.ok) {
      jsonResponse(res, pre.status, { ok: false, message: pre.message })
      req.resume()
      return
    }
    ext = (extRaw ?? '').trim().toLowerCase().replace(/^\.+/, '')
    limitBytes = pre.limitBytes
  } catch (error) {
    jsonResponse(res, 400, { ok: false, message: `dsh-bg-media: 请求参数解析失败（${error instanceof Error ? error.message : String(error)}）` })
    req.resume()
    return
  }
  const key = randomUUID()
  const dir = mediaDirPath()
  try {
    mkdirSync(dir, { recursive: true })
  } catch (error) {
    jsonResponse(res, 500, { ok: false, message: `dsh-bg-media: 创建媒体目录失败（${error instanceof Error ? error.message : String(error)}）` })
    req.resume()
    return
  }
  const tmpPath = join(dir, `.${key}.tmp`)
  const finalPath = join(dir, `${key}.${ext}`)
  let failed = false
  const out = createWriteStream(tmpPath)
  out.on('error', () => {
    if (failed) return
    failed = true
    rmSync(tmpPath, { force: true })
    jsonResponse(res, 400, { ok: false, message: 'dsh-bg-media: 写入媒体目录失败' })
    req.resume()
  })
  req.on('error', () => {
    if (failed) return
    failed = true
    out.destroy()
    rmSync(tmpPath, { force: true })
    jsonResponse(res, 400, { ok: false, message: 'dsh-bg-media: 读取上传流失败' })
  })
  let received = 0
  req.on('data', (chunk: Buffer) => {
    if (failed) return
    received += chunk.length
    if (received > limitBytes) {
      failed = true
      out.destroy()
      rmSync(tmpPath, { force: true })
      jsonResponse(res, 400, { ok: false, message: `dsh-bg-media: 上传超过上限 ${Math.round(limitBytes / 1024 / 1024)}MB（kind=image）` })
      req.resume()
      return
    }
    out.write(chunk)
  })
  req.on('end', () => {
    if (failed) return
    out.end(() => {
      if (failed) return
      try {
        renameSync(tmpPath, finalPath)
      } catch (error) {
        failed = true
        rmSync(tmpPath, { force: true })
        jsonResponse(res, 500, { ok: false, message: `dsh-bg-media: 落盘失败（${error instanceof Error ? error.message : String(error)}）` })
        return
      }
      jsonResponse(res, 200, { ok: true, mediaKey: key })
    })
  })
}

/** 单次请求的处理入口（按 method + path 分流：上传 / 伺服）。 */
async function handleMedia(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const pathname = pathnameOf(req)
  if (req.method === 'POST' && pathname === MEDIA_UPLOAD_PATH) {
    await handleUpload(req, res)
    return
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405)
    res.end()
    return
  }
  const key = mediaKeyOf(req)
  if (key === '') {
    notFound(res)
    return
  }
  const filePath = resolveMediaFilePath(key)
  if (filePath === null) {
    notFound(res)
    return
  }
  serveFile(req, res, filePath)
}

export function apply(ctx: Context): void {
  ctx.effect(() =>
    ctx.webServer.register({
      kind: 'prefix',
      path: MEDIA_PATH_PREFIX,
      handler: handleMedia,
    }),
    'dsh-bg: /dsh-bg-media route (upload + serve)',
  )
}
