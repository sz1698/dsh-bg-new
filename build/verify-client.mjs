/**
 * Structural + functional verification for dsh-bg-new v0.4.0.
 *
 * Two parts:
 *  A) Client bundle (lib/client.js) inside a VM with a fake window.__ModuleLoader__,
 *     a fake DOM and fake timers (debounce) + a fetch stub (upload) — asserts loader
 *     contract, exports, apply(ctx) wiring, locale parity, luminance/textScheme
 *     inference, config default+override helpers, the render pipeline
 *     (style/layer/video artifacts), per-mode cleanup, video control functions,
 *     full unload restore, and the v0.4 additions: debounced single-field
 *     persistence, pending-write adopt convergence (no oscillation), resetAll full
 *     reset, stop-keeps-frame, mediaKey resource resolution, Enter handler, upload
 *     flow, sound/volume runtime+mirror application, single renderer source.
 *  B) Host TS sources imported directly (Node ≥22.18 type stripping; this repo
 *     runs Node 22.20) — asserts the settings schema gained all v0.3/v0.3.1/v0.4
 *     fields (incl. volume), bg_apply URL http(s) pass-through, local image/video →
 *     mediaKey registration (no data-URI inlining anymore), mode=off full reset,
 *     media upload validation / store / resolve (temp $DSH_HOME), extension/size
 *     rejects, style.ts no-op + index.ts no style nesting (single renderer), and
 *     $DSH_HOME/dsh-bg-new/config.json default/override/broken reads.
 *
 * Run:  node build/verify-client.mjs     (exit 0 = ALL PASS)
 */
import { readdirSync, readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const bundlePath = join(here, '..', 'lib', 'client.js')
const code = readFileSync(bundlePath, 'utf8').replace(/\n\/\/# sourceMappingURL=.*$/, '')
const banner = 'window.__ModuleLoader__.load({'
const footer = 'return module.exports;'

let failures = 0
/** v0.4.4：A17 的 BgPanel 结构断言用的假快照（null = 走默认空对象）。 */
let panelSnap = null
const check = (name, ok, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`)
  if (!ok) failures += 1
}

// =====================================================================
// Fake DOM (enough of a node tree for the render engine)
// =====================================================================
class FakeNode {
  constructor(tag) {
    this.tagName = tag
    this.children = []
    this.parent = null
    this.attrs = {}
    this.listeners = {}
    this._text = ''
    this.connected = true
    // v0.5.0: inline style surface (dim/transparency + hint bar write through it)
    this.styleValues = {}
    this.style = {
      setProperty: (name, value, priority) => { this.styleValues[name] = priority === undefined ? String(value) : `${value} !${priority}` },
      removeProperty: (name) => { delete this.styleValues[name] },
      getPropertyValue: (name) => (name in this.styleValues ? this.styleValues[name] : ''),
    }
    // video semantics
    this._paused = true
    this._currentTime = 0
    this._playbackRate = 1
    this._loop = false
    this.muted = false
    this.autoplay = false
    this.playsInline = false
    this.volume = 1
    // v0.4.1: video duration metadata (real elements report NaN until ready)
    this.duration = NaN
  }
  get textContent() { return this._text }
  set textContent(v) { this._text = String(v) }
  get isConnected() { return this.connected }
  // real DOM semantics: HTMLElement.parentElement === parent node (bundle code
  // relies on it to decide whether the video lives inside the current layer)
  get parentElement() { return this.parent }
  setAttribute(name, value) { this.attrs[name] = String(value) }
  getAttribute(name) { return name in this.attrs ? this.attrs[name] : null }
  removeAttribute(name) { delete this.attrs[name] }
  set id(value) { this.attrs.id = String(value) }
  get id() { return this.attrs.id ?? null }
  append(...children) {
    for (const child of children) {
      if (child.parent !== null && child.parent !== this) {
        const i = child.parent.children.indexOf(child)
        if (i >= 0) child.parent.children.splice(i, 1)
      }
      child.parent = this
      child.connected = true
      this.children.push(child)
    }
  }
  remove() {
    if (this.parent !== null) {
      const i = this.parent.children.indexOf(this)
      if (i >= 0) this.parent.children.splice(i, 1)
    }
    this.parent = null
    this.connected = false
  }
  addEventListener(type, fn) {
    (this.listeners[type] ||= []).push(fn)
  }
  fire(type) {
    for (const fn of this.listeners[type] || []) fn.call(this)
  }
  // video
  get paused() { return this._paused }
  play() { this._paused = false; this.fire('play'); return Promise.resolve() }
  pause() { this._paused = true; this.fire('pause') }
  load() { this.fire('emptied') }
  set currentTime(v) { this._currentTime = Number(v) }
  get currentTime() { return this._currentTime }
  set playbackRate(v) { this._playbackRate = Number(v); this.fire('ratechange') }
  get playbackRate() { return this._playbackRate }
  set loop(v) { this._loop = !!v }
  get loop() { return this._loop }
}

function makeFakeDom() {
  const head = new FakeNode('head')
  const body = new FakeNode('body')
  // v0.4.4：document 也要能收发事件（弹窗拖动在 document 上听 pointermove/up）
  const docListeners = {}
  const document = {
    head,
    body,
    createElement: (tag) => new FakeNode(tag),
    addEventListener: (t, fn) => { (docListeners[t] ||= []).push(fn) },
    removeEventListener: (t, fn) => { docListeners[t] = (docListeners[t] || []).filter((f) => f !== fn) },
    /** 测试辅助：模拟 document 上的指针事件。 */
    fire: (t, e) => { for (const fn of docListeners[t] || []) fn(e) },
    listenerCount: (t) => (docListeners[t] || []).length,
  }
  return { document, head, body }
}

// =====================================================================
// Fake timers (v0.4 debounce) + fake fetch (v0.4 upload)
// =====================================================================
let timerSeq = 0
const pendingTimers = new Map()
function installFakeTimers() {
  return {
    setTimeout: (cb) => { const id = ++timerSeq; pendingTimers.set(id, cb); return id },
    clearTimeout: (id) => { pendingTimers.delete(id) },
  }
}
/** 执行当前所有待触发的防抖回调（模拟 300ms 到期）。 */
function flushTimers() {
  const batch = [...pendingTimers.values()]
  pendingTimers.clear()
  for (const cb of batch) cb()
}
function timerCount() {
  return pendingTimers.size
}
let lastFetch = null
let fetchOk = true
let fetchPayload = { ok: true, mediaKey: 'k-uploaded' }
function installFakeFetch() {
  return async (url, init) => {
    lastFetch = { url, init }
    return { ok: fetchOk, json: async () => fetchPayload }
  }
}

// =====================================================================
// A) Client bundle verification in a VM
// =====================================================================
const registrations = []
const { document, head, body } = makeFakeDom()
const timers = installFakeTimers()
const sandbox = {
  window: { __ModuleLoader__: { load: (registration) => registrations.push(registration) } },
  console,
  document,
  ...timers,
  fetch: installFakeFetch(),
}
vm.createContext(sandbox)
vm.runInContext(code, sandbox)

// helpers over the fake DOM
const layerNodes = () => body.children.filter((node) => node.getAttribute('data-dsh-bg-new-layer') === '')
const styleNodes = () => head.children.filter((node) => node.tagName === 'style' && node.getAttribute('id') === 'dsh-bg-new-style')
const styleText = () => (styleNodes()[0] ? styleNodes()[0].textContent : '')
const videosIn = () => {
  const layers = layerNodes()
  return layers.length === 0 ? [] : layers[0].children.filter((node) => node.tagName === 'video')
}

check('A1 exactly one registration', registrations.length === 1, `count=${registrations.length}`)
const registration = registrations[0]
check('A1 registration id == "dsh-bg-new"', registration?.id === 'dsh-bg-new', JSON.stringify(registration?.id))
check('A1 registration has a factory function', typeof registration?.factory === 'function')
check('A2 bundle opens with loader banner', code.startsWith(banner))
check('A2 bundle closes with }; })', code.trimEnd().endsWith('});'))

const required = []
const moduleExports = registration.factory((specifier) => {
  required.push(specifier)
  if (specifier === 'react') {
    return {
      // v0.4.4：stub 返回模块级 panelSnap —— A17 的 BgPanel 结构断言靠它喂一份
      // 「和真 scope 同形」的快照；其余用例不设置 panelSnap 时行为与之前一致。
      useSyncExternalStore: (_subscribe, _get, getServer) => (panelSnap !== null ? panelSnap : (getServer !== undefined ? getServer() : {})),
      // useState 初始化函数要真的被调用（tab 初值就是 () => tabForMode(snap.mode)）
      useState: (v) => [typeof v === 'function' ? v() : v, () => {}],
      // v0.4.1: BgPanel uses useEffect/useRef (not exercised by the VM, stub safe)
      useEffect: () => {},
      useRef: (v) => ({ current: v }),
    }
  }
  if (specifier === 'react/jsx-runtime') return { jsx: (_type, props) => props }
  throw new Error(`unexpected external require: ${specifier}`)
})
const uniqueRequired = [...new Set(required)].sort()
check('A3 externals only react + react/jsx-runtime', uniqueRequired.length === 2 && uniqueRequired[0] === 'react' && uniqueRequired[1] === 'react/jsx-runtime', uniqueRequired.join(','))
check('A3 no @deepseek-ai value import at runtime', uniqueRequired.every((s) => !s.startsWith('@deepseek-ai/')))

// ---- exports ----
const expectedExports = [
  'inject', 'apply', 'BgPanel', 'applyBg', 'applyBgState', 'restoreBg',
  'bgVideoToggle', 'bgVideoStop', 'bgVideoSetRate', 'bgVideoSetLoop',
  // v0.4: sound/volume + upload + Enter helpers
  'bgVideoSetSound', 'bgVideoSetVolume', 'bgKeyEnter', 'bgUploadLocalFile',
  // v0.4.1: seek (progress bar)
  'bgVideoSeek',
  // v0.4.3: free zoom (0.25–4)
  'clampBgScale',
  'clampBgVolume',
  'bgDefaultConfig', 'bgNormalizeConfig', 'bgLuminance', 'resolveTextScheme',
  'parseCssColor', 'relativeLuminance', 'fitCssFor', 'tokensForTextScheme',
  'REVEAL_TOKENS', 'BG_FITS', 'BG_TEXT_SCHEMES',
  // v0.4.4: 遮罩重写 + 预览取色（previewThemeFor 保留为纯工具导出）
  'maskTokensForTextScheme', 'previewThemeFor',
  // v0.5.0: zoom + 顶部 token + meta theme-color
  'clampBgZoom', 'bgZoomMin', 'bgZoomMax', 'bgMediaRender', 'zoomBackgroundSize',
  'bgThemeColorFor', 'TOP_REGION_TOKENS', 'cssEscape',
  // v0.6.0: 毛玻璃 + 抽屉/侧栏入口 + 滑动降透明 + 地址栏判定
  'glassSurfaceTokensForTextScheme', 'GLASS_BACKDROP_FILTER', 'GLASS_BACKDROP_SELECTOR',
  'bgSetAdjusting', 'bgIsAdjusting', 'disposeAdjusting',
  'toggleDrawer', 'bgIsDrawerOpen', 'BgSidebarAction', 'BgDrawer',
  'bgMediaFieldVerdict', 'DRAWER_WIDTH_CSS',
]
const missingExports = expectedExports.filter((name) => typeof moduleExports?.[name] === 'undefined')
check('A4 exports shape complete', missingExports.length === 0, `missing=${missingExports.join(',') || '-'}`)
check('A4 no default export (loader unwrap safety)', !('default' in moduleExports))

// ---- pure helpers: config default + override ----
check('A5 config default imageExt == built-in table',
  moduleExports.bgDefaultConfig?.imageExt?.join('/') === 'png/jpg/jpeg/gif/webp/svg/avif/bmp/ico')
check('A5 config default videoExt == built-in table',
  moduleExports.bgDefaultConfig?.videoExt?.join('/') === 'mp4/webm/ogg/ogv/mov/m4v')
check('A5 config defaults maxImageMB=10 maxVideoMB=500 fit=cover scheme=auto loop=true',
  moduleExports.bgDefaultConfig?.maxImageMB === 10 && moduleExports.bgDefaultConfig?.maxVideoMB === 500
    && moduleExports.bgDefaultConfig?.defaultFit === 'cover'
    && moduleExports.bgDefaultConfig?.defaultTextScheme === 'auto'
    && moduleExports.bgDefaultConfig?.defaultLoop === true)
const overridden = moduleExports.bgNormalizeConfig({ imageExt: ['PNG', '.jpg', 42], videoExt: ['webm'], maxImageMB: 25, maxVideoMB: 10, defaultFit: 'contain', defaultTextScheme: 'dark', defaultLoop: false })
check('A5 config override merge (dirty ext sanitized)',
  overridden?.config?.imageExt?.join('/') === 'png/jpg'
    && overridden.config.videoExt.join('/') === 'webm'
    && overridden.config.maxImageMB === 25 && overridden.config.maxVideoMB === 10
    && overridden.config.defaultFit === 'contain' && overridden.config.defaultTextScheme === 'dark'
    && overridden.config.defaultLoop === false)
check('A5 config invalid values fall back with issues', (() => {
  const bad = moduleExports.bgNormalizeConfig({ imageExt: 'png', defaultFit: 'zoom', maxVideoMB: -3, defaultLoop: 'yes' })
  return bad.config.imageExt.join('/') === moduleExports.bgDefaultConfig.imageExt.join('/')
    && bad.config.defaultFit === 'cover' && bad.config.maxVideoMB === 500 && bad.config.defaultLoop === true
    && bad.issues.length >= 3
})())

// ---- pure helpers: luminance / text scheme ----
const lumDark = moduleExports.bgLuminance('color', '#0d1117')
check('A6 color luminance: dark #0d1117 is near-black', lumDark !== null && lumDark < 0.05, `lum=${lumDark}`)
const lumWhite = moduleExports.bgLuminance('color', '#ffffff')
check('A6 color luminance: white is high', lumWhite !== null && lumWhite > 0.95, `lum=${lumWhite}`)
const lumGrad = moduleExports.bgLuminance('gradient', 'linear-gradient(135deg, #ffffff, #000000)')
check('A6 gradient luminance = mean of first two stops', lumGrad !== null && Math.abs(lumGrad - 0.5) < 0.01, `lum=${lumGrad}`)
check('A6 unparseable color (named) yields null for luminance', moduleExports.bgLuminance('color', 'rebeccapurple') === null)
check('A6 media (image/video) luminance is unknown', moduleExports.bgLuminance('image', 'https://x/y.jpg') === null && moduleExports.bgLuminance('video', 'https://x/y.mp4') === null)
check('A6 scheme auto dark-color → light text', moduleExports.resolveTextScheme('color', '#0d1117', 'auto') === 'light')
check('A6 scheme auto light-color → dark text', moduleExports.resolveTextScheme('color', '#f3f4f6', 'auto') === 'dark')
check('A6 scheme auto image/media → light text default', moduleExports.resolveTextScheme('image', 'https://x/y.jpg', 'auto') === 'light')
check('A6 scheme manual override wins', moduleExports.resolveTextScheme('image', 'https://x/y.jpg', 'dark') === 'dark'
  && moduleExports.resolveTextScheme('color', '#0d1117', 'dark') === 'dark'
  && moduleExports.resolveTextScheme('color', '#ffffff', 'light') === 'light')
check('A6 off → null scheme', moduleExports.resolveTextScheme('off', '', 'auto') === null)

// ---- palette / fit mapping ----
const lightTokens = moduleExports.tokensForTextScheme('light')
const darkTokens = moduleExports.tokensForTextScheme('dark')
check('A7 light-text palette reveals frame tokens', lightTokens['--dsw-alias-bg-base'] === 'transparent'
  && lightTokens['--dsw-specific-sidebar-fill'] === 'transparent')
check('A7 light-text palette overrides label trio', lightTokens['--dsw-alias-label-primary'] === '#f2f4f8'
  && typeof lightTokens['--dsw-alias-label-secondary'] === 'string'
  && typeof lightTokens['--dsw-alias-label-tertiary'] === 'string')
check('A7 dark-text palette has dark labels + light translucent surfaces',
  darkTokens['--dsw-alias-label-primary'] === '#1a1d24'
    && darkTokens['--dsw-alias-bg-layer-1'] === 'rgb(250 251 253 / 0.96)')
check('A7 no CSS var self-reference in palette values', [...Object.values(lightTokens), ...Object.values(darkTokens)]
  .every((value) => !String(value).includes('var(--dsw')), 'values are literals')
check('A7 fit map: cover / fill / contain / center / tile', (() => {
  const cover = moduleExports.fitCssFor('cover', 'image')
  const fill = moduleExports.fitCssFor('fill', 'image')
  const contain = moduleExports.fitCssFor('contain', 'video')
  const center = moduleExports.fitCssFor('center', 'image')
  const tile = moduleExports.fitCssFor('tile', 'image')
  return cover.backgroundSize === 'cover' && cover.objectFit === 'cover'
    && fill.backgroundSize === '100% 100%' && fill.objectFit === 'fill'
    && contain.backgroundSize === 'contain' && contain.objectFit === 'contain'
    && center.backgroundSize === 'auto' && center.objectFit === 'none'
    && tile.backgroundRepeat === 'repeat'
})())

// ---- apply(ctx) wiring ----
let registeredOptions = null
let registeredComponent = null
const registeredSlots = []
let localeNs = null
let localeDict = null
let scopeBound = null
let scopeSubscriber = null
const setCalls = []
const mutateCalls = []
const dictionaries = new Map()
let applyCleanup = null
/** v0.4.4：apply() 现在装两个 effect（背景订阅 + 设置弹窗拖动），fake ctx 必须
 * 像真 cordis 一样**累积**所有 disposer，否则后者会覆盖前者、卸载时背景不还原。 */
const effectCleanups = []
const runAllCleanups = () => {
  for (const fn of effectCleanups.splice(0)) { if (typeof fn === 'function') fn() }
  applyCleanup = null
}
const sectionBox = {
  mode: 'off', value: '', fit: 'cover', textScheme: 'auto', loop: true, mediaKey: '',
  opacity: 1, posX: 50, posY: 50, scale: 1, zoom: 1, volume: 1, glass: false,
  imageExt: ['png', 'jpg'], videoExt: ['mp4'], maxImageMB: 10, maxVideoMB: 500,
  defaultFit: 'cover', defaultTextScheme: 'auto', defaultLoop: true,
}

const fakeCtx = {
  settingsScope: {
    bind: (options) => {
      scopeBound = options
      return {
        getSnapshot: () => ({ status: 'ready', value: { ...sectionBox } }),
        subscribe: (listener) => { scopeSubscriber = listener; return () => {} },
        set: (field, value) => { setCalls.push([field, value]) },
        // v0.4.1: official SettingsScope prefers atomic mutate —— 记录整批 ops（单次
        // 调用），并按序回放进 setCalls，保持与逐字段 set 等价的可断言形状。
        mutate: (ops) => {
          mutateCalls.push(ops.map((op) => [op.path[0], op.value]))
          for (const op of ops) setCalls.push([op.path[0], op.value])
          return Promise.resolve()
        },
      }
    },
  },
  locale: {
    register: (ns, dict) => { localeNs = ns; localeDict = dict; dictionaries.set(ns, dict); return () => {} },
    bind: (ns) => (key) => dictionaries.get(ns)?.zh?.[key] ?? key,
  },
  slots: {
    inject: (_name, deferred) => { deferred() },
    register: (options, component) => { registeredOptions = options; registeredComponent = component; registeredSlots.push({ options, component }); return () => {} },
  },
  effect: (fn) => {
    const dispose = fn()
    applyCleanup = dispose
    effectCleanups.push(dispose)
    return () => { if (typeof dispose === 'function') dispose() }
  },
}

moduleExports.apply(fakeCtx)

check('A8 registers two slots (sidebar.footer.action + shell.overlay)',
  registeredSlots.length === 2
    && registeredSlots.some((s) => s.options.name === 'sidebar.footer.action' && s.options.id === 'dsh-bg-new')
    && registeredSlots.some((s) => s.options.name === 'shell.overlay' && s.options.id === 'dsh-bg-new'),
  registeredSlots.map((s) => s.options.name).join(','))
const footerReg = registeredSlots.find((s) => s.options.name === 'sidebar.footer.action')
const overlayReg = registeredSlots.find((s) => s.options.name === 'shell.overlay')
check('A8 sidebar action label zh == 「壁纸」', typeof footerReg?.options?.label === 'function' && footerReg.options.label() === '壁纸', String(footerReg?.options?.label?.()))
check('A8 sidebar action component is BgSidebarAction', footerReg?.component === moduleExports.BgSidebarAction)
check('A8 overlay component is BgDrawer', overlayReg?.component === moduleExports.BgDrawer)
const injected = typeof overlayReg?.options?.inject === 'function' ? overlayReg.options.inject() : null
check('A8 overlay inject() returns setBg + text', injected != null && typeof injected.setBg === 'function' && typeof injected.text === 'function')
const footerInjected = typeof footerReg?.options?.inject === 'function' ? footerReg.options.inject() : null
check('A8 sidebar action inject() returns text (no setBg)', footerInjected != null && typeof footerInjected.text === 'function' && footerInjected.setBg === undefined)
check('A8 locale ns == settings.dsh-bg-new', localeNs === 'settings.dsh-bg-new', JSON.stringify(localeNs))
const zhKeys = localeDict?.zh ? Object.keys(localeDict.zh).sort() : []
const enKeys = localeDict?.en ? Object.keys(localeDict.en).sort() : []
check('A8 locale zh/en dictionaries non-empty', zhKeys.length > 0 && enKeys.length > 0)
check('A8 locale zh/en key parity', zhKeys.length === enKeys.length && zhKeys.join('|') === enKeys.join('|'),
  `zh=${zhKeys.length} en=${enKeys.length}`)
check('A8 locale has ≥ 60 keys per language (v0.4 sound/volume/uploading)', zhKeys.length >= 60, `keys=${zhKeys.length}`)
const zhText = zhKeys.length >= 60 ? Object.keys(localeDict.zh).every((k) => typeof localeDict.zh[k] === 'string' && localeDict.zh[k] !== '') : false
const enText = zhKeys.length >= 60 ? Object.keys(localeDict.en).every((k) => typeof localeDict.en[k] === 'string' && localeDict.en[k] !== '') : false
check('A8 locale all values non-empty strings', zhText && enText)
const v031Keys = ['opacityLabel', 'posXLabel', 'posYLabel', 'errApply',
  'errVideoLoad', 'errVideoAborted', 'errVideoNetwork', 'errVideoDecode', 'errVideoSrc',
  'errVideoAutoplay', 'errVideoStalled']
check('A8b v0.3.1 slider + error keys exist in both zh/en',
  v031Keys.every((k) => typeof localeDict?.zh?.[k] === 'string' && localeDict.zh[k] !== ''
    && typeof localeDict?.en?.[k] === 'string' && localeDict.en[k] !== ''))
const v04Keys = ['sound', 'volume', 'uploading', 'localVideo']
check('A8c v0.4 sound/volume/uploading/localVideo keys exist in both zh/en',
  v04Keys.every((k) => typeof localeDict?.zh?.[k] === 'string' && localeDict.zh[k] !== ''
    && typeof localeDict?.en?.[k] === 'string' && localeDict.en[k] !== ''))
check('A8 settingsScope bound namespace == dsh-bg-new', scopeBound?.namespace === 'dsh-bg-new', JSON.stringify(scopeBound))
check('A8 scope subscriber registered', typeof scopeSubscriber === 'function')
check('A8 mount with off snapshot creates no layer/style', layerNodes().length === 0 && styleNodes().length === 0)

// ---- render pipeline: per-mode artifacts & cleanup ----
moduleExports.applyBg('color', '#ff0000')
{
  const text = styleText()
  check('A9 color → layer + style exist', layerNodes().length === 1 && styleNodes().length === 1)
  check('A9 color → frame token transparent (full reveal)', text.includes('--dsw-alias-bg-base: transparent !important')
    && text.includes('--dsw-specific-sidebar-fill: transparent !important'))
  check('A9 color → resolved scheme light text (dark red bg)', text.includes('--dsw-alias-label-primary: #f2f4f8 !important'))
  check('A9 color paints #ff0000 on layer', text.includes('background: #ff0000 no-repeat center/cover'))
  check('A9 color leaves no image/video CSS', !text.includes('background-image') && !text.includes('<video') && !text.includes('video {'))
}
moduleExports.applyBg('gradient', 'linear-gradient(135deg, #1e2a78, #2b1055)', { fit: 'cover' })
{
  const text = styleText()
  check('A9 gradient CSS present + tokens recomputed', text.includes('linear-gradient(135deg, #1e2a78, #2b1055)')
    && text.includes('--dsw-alias-label-primary: #f2f4f8 !important'))
  check('A9 switching mode left no color-only rule', !text.includes('background: #ff0000'))
}
moduleExports.applyBg('image', 'https://example.com/wall.jpg', { fit: 'contain' })
{
  const text = styleText()
  check('A9 image URL allowed + fit contain', text.includes('background-image: url("https://example.com/wall.jpg")')
    && text.includes('background-size: contain') && text.includes('background-repeat: no-repeat'))
  check('A9 image escaping removes quotes/backslashes from url', !text.includes('\\"'))
  check('A9 single style + single layer after churn', styleNodes().length === 1 && layerNodes().length === 1)
}
moduleExports.applyBg('video', 'https://cdn.example.com/ocean.mp4', { fit: 'cover', loop: true })
{
  const videos = videosIn()
  const text = styleText()
  check('A9 video → <video> child inside layer', videos.length === 1 && videos[0].parent === layerNodes()[0])
  check('A9 video remote src == given URL', videos[0]?.getAttribute('src') === 'https://cdn.example.com/ocean.mp4')
  check('A9 video element autoplay muted playsinline + loop', videos[0]?.autoplay === true && videos[0]?.muted === true
    && videos[0]?.playsInline === true && videos[0]?.loop === true)
  check('A9 video fit cover CSS on layer video', text.includes('object-fit: cover'))
  check('A9 video token reveal still active (full window)', text.includes('--dsw-specific-sidebar-fill: transparent !important'))
}
moduleExports.applyBg('video', 'C:\\videos\\local.mp4', { mediaKey: 'k-123', fit: 'cover' })
{
  const videos = videosIn()
  check('A9 local video → mediaKey route src', videos[0]?.getAttribute('src') === '/dsh-bg-new-media/k-123', String(videos[0]?.getAttribute('src')))
}
moduleExports.applyBg('image', '#not-a-url'.length ? 'https://example.com/tile.png' : '', { fit: 'tile' })
{
  const text = styleText()
  check('A9 tile fit → background-repeat: repeat', text.includes('background-repeat: repeat'))
  check('A9 video child removed when leaving video mode', videosIn().length === 0)
}
// v0.4: image via mediaKey (uploaded local media, value stays empty)
moduleExports.applyBg('image', '', { mediaKey: 'k-img' })
{
  const text = styleText()
  check('A9 image mediaKey → host media URL (value empty)', layerNodes().length === 1
    && text.includes('background-image: url("/dsh-bg-new-media/k-img")'))
}
moduleExports.applyBg('color', '#ffffff')
{
  const text = styleText()
  check('A9 white color → resolved dark-text scheme', text.includes('--dsw-alias-label-primary: #1a1d24 !important')
    && text.includes('--dsw-alias-bg-layer-1: rgb(250 251 253 / 0.96) !important'))
}
moduleExports.applyBg('off', '')
check('A9 off removes layer + style entirely (no residue)', layerNodes().length === 0 && styleNodes().length === 0 && styleText() === '')
check('A9 body kept untouched by pipeline', head.children.every((n) => n.getAttribute('id') !== 'dsh-bg-new-style') || styleNodes().length === 0)

// ---- adopt: external (tool/host) change → scope listener applies ----
const baseCalls = setCalls.length
sectionBox.mode = 'video'
sectionBox.value = 'C:\\videos\\x.mp4'
sectionBox.mediaKey = 'k-ext'
sectionBox.fit = 'cover'
sectionBox.loop = true
scopeSubscriber()
{
  const videos = videosIn()
  check('A10 adopt applies external video snapshot', videos.length === 1 && videos[0].getAttribute('src') === '/dsh-bg-new-media/k-ext')
}
scopeSubscriber()
check('A10 adopt idempotent (no double render for same doc)', layerNodes().length === 1 && videosIn().length === 1)

// ---- UI setBg path (inject face) persists mode/value + extras (debounced) ----
const setBefore = setCalls.length
injected.setBg('image', 'https://example.com/pic.png', { fit: 'fill' })
check('A10 setBg applies locally BEFORE debounce flush', layerNodes().length === 1
  && styleText().includes('background-image: url("https://example.com/pic.png")'))
check('A10 setBg persistence is debounced (no immediate scope.set)', setCalls.length === setBefore, `added=${setCalls.length - setBefore}`)
flushTimers()
check('A10 setBg persisted mode/value/mediaKey/fit after flush', setCalls.length === setBefore + 4
  && setCalls[setBefore][0] === 'mode' && setCalls[setBefore][1] === 'image'
  && setCalls[setBefore + 1][0] === 'value' && setCalls[setBefore + 1][1] === 'https://example.com/pic.png'
  && setCalls[setBefore + 2][0] === 'mediaKey' && setCalls[setBefore + 2][1] === ''
  && setCalls[setBefore + 3][0] === 'fit' && setCalls[setBefore + 3][1] === 'fill',
  JSON.stringify(setCalls.slice(setBefore)))
check('A10 setBg leaves video mode → mediaKey cleared', setCalls.some(([field, val]) => field === 'mediaKey' && val === ''))
check('A10 no timer left behind after flush', timerCount() === 0, `pending=${timerCount()}`)

// ---- v0.4: debounce coalescing (drag writes one final value per field) ----
{
  const start = setCalls.length
  injected.setBg('image', 'https://example.com/pic.png', { posX: 33 })
  injected.setBg('image', 'https://example.com/pic.png', { posX: 66 })
  check('A14 drag schedules a single pending field write', timerCount() === 1, `pending=${timerCount()}`)
  check('A14 no writes before debounce expiry', setCalls.length === start)
  flushTimers()
  const posSets = setCalls.slice(start).filter(([field]) => field === 'posX')
  check('A14 coalesced slider writes: one scope.set with final value 66',
    posSets.length === 1 && posSets[0][1] === 66, JSON.stringify(posSets))
  sectionBox.posX = 66
  scopeSubscriber()
}

// ---- v0.4: pending-write shields adopt (no regression while mirror is stale) ----
{
  moduleExports.applyBg('image', 'https://example.com/shield.jpg', { fit: 'cover', posX: 50, posY: 50 })
  const before = setCalls.length
  injected.setBg('image', 'https://example.com/shield.jpg', { posX: 60 })
  check('A14 optimistic posX=60 rendered immediately', styleText().includes('background-position: 60% 50%'))
  // mirror still stale (posX=50 in sectionBox) → adopt must NOT pull it back
  scopeSubscriber()
  check('A14 adopt with stale mirror keeps pending local posX (no oscillation)',
    styleText().includes('background-position: 60% 50%'))
  flushTimers()
  const persisted = setCalls.slice(before).filter(([field]) => field === 'posX')
  check('A14 pending posX persisted exactly once = 60', persisted.length === 1 && persisted[0][1] === 60, JSON.stringify(persisted))
  // mirror converges → adopt releases pending, still no visual regression
  sectionBox.posX = 60
  scopeSubscriber()
  check('A14 converged mirror → stable 60% (dedupe, no churn)', styleText().includes('background-position: 60% 50%'))
  check('A14 single style + single layer after churn', styleNodes().length === 1 && layerNodes().length === 1)
}

// ---- video controls ----
moduleExports.applyBg('video', 'https://cdn.example.com/ocean.mp4', { fit: 'cover' })
{
  const videos = videosIn()
  check('A11 video ready for controls', videos.length === 1)
  check('A11 autoplay started (muted autoplay allowed)', videos[0].paused === false)
  videos[0].currentTime = 7
  moduleExports.bgVideoStop()
  check('A11 stop pauses and KEEPS current frame (v0.4: no rewind)', videos[0].paused === true && videos[0].currentTime === 7,
    `currentTime=${videos[0].currentTime}`)
  check('A11 toggle → playing', moduleExports.bgVideoToggle() === 'playing' && videos[0].paused === false)
  check('A11 toggle → paused', moduleExports.bgVideoToggle() === 'paused' && videos[0].paused === true)
  moduleExports.bgVideoToggle()
  check('A11 rate clamps 5 → 2', moduleExports.bgVideoSetRate(5) === 2 && videos[0].playbackRate === 2)
  check('A11 rate clamps 0.1 → 0.5', moduleExports.bgVideoSetRate(0.1) === 0.5 && videos[0].playbackRate === 0.5)
  check('A11 setRate accepts 1.5', moduleExports.bgVideoSetRate(1.5) === 1.5 && videos[0].playbackRate === 1.5)
  // v0.4.1: seek / progress bar (duration metadata required)
  videos[0].duration = 10
  check('A11 seek clamps into [0, duration]', moduleExports.bgVideoSeek(99) === 10 && videos[0].currentTime === 10,
    `cur=${videos[0].currentTime}`)
  moduleExports.bgVideoSeek(3.5)
  moduleExports.bgVideoStop()
  moduleExports.bgVideoSeek(1)
  check('A11 seek while stopped moves the head but stays paused',
    videos[0].paused === true && videos[0].currentTime === 1, `paused=${videos[0].paused} cur=${videos[0].currentTime}`)
  check('A11 setLoop(false) runtime', moduleExports.bgVideoSetLoop(false) === false && videos[0].loop === false)
  moduleExports.bgVideoSetLoop(true)
}
moduleExports.applyBg('color', '#0d1117')
check('A11 video controls no-op when no <video>', moduleExports.bgVideoToggle() === 'none' && moduleExports.bgVideoSetRate(2) === 2)

// ---- v0.4: sound (runtime) + volume (persisted runtime + mirror) ----
{
  moduleExports.applyBg('video', 'https://cdn.example.com/snd.mp4', { fit: 'cover' })
  const video = videosIn()[0]
  check('A14 sound: video renders muted=true (autoplay-ready)', video.muted === true && video.volume === 1)
  check('A14 sound: toggle ON (user gesture) unmutes and resumes', moduleExports.bgVideoSetSound(true) === true
    && video.muted === false && video.paused === false)
  check('A14 sound: toggle OFF mutes again', moduleExports.bgVideoSetSound(false) === false && video.muted === true)
  check('A14 volume clamp: 2 → 1 written to element', moduleExports.bgVideoSetVolume(2) === 1 && video.volume === 1)
  moduleExports.bgVideoSetVolume(0.4)
  check('A14 volume 0.4 applied to element', video.volume === 0.4)
  // external mirror volume change → adopt applies runtime volume without DOM rebuild churn
  const prevCss = styleText()
  sectionBox.volume = 0.7
  scopeSubscriber()
  check('A14 mirror volume 0.7 applied to element via adopt', video.volume === 0.7)
  check('A14 volume change did not rebuild style DOM', styleText() === prevCss)
  sectionBox.volume = 1
  scopeSubscriber()
}

// ---- v0.4: resetAll = full namespace reset (mode off + all runtime defaults) ----
// （先泵一次微任务：生产环境写入 settle 即回折并释放 pending —— 模拟该时序，
//   让 resetAll 的写入批次只含本次的默认字段，不被更早 flush 的残留字段污染。）
await Promise.resolve()
{
  const before = setCalls.length
  injected.setBg('off', '', { resetAll: true })
  check('A14 resetAll removes layer/style immediately', layerNodes().length === 0 && styleNodes().length === 0)
  flushTimers()
  const writes = setCalls.slice(before)
  const expectedDefaults = { mode: 'off', value: '', mediaKey: '', fit: 'cover', textScheme: 'auto', loop: true, opacity: 1, posX: 50, posY: 50, scale: 1, zoom: 1, volume: 1, glass: false }
  const allWrittenDefaults = writes.every(([field, value]) => field in expectedDefaults && expectedDefaults[field] === value)
  check('A14 resetAll writes only default values (no residue)',
    allWrittenDefaults && writes.some(([field]) => field === 'mode') && writes.some(([field]) => field === 'posX'),
    JSON.stringify(writes))
  // defaults survive into the next apply: sliders/volume back to default
  moduleExports.applyBg('video', 'https://cdn.example.com/afterreset.mp4', { fit: 'cover' })
  const text = styleText()
  const video = videosIn()[0]
  check('A14 post-reset video renders focus center + full opacity + volume 1',
    text.includes('object-position: 50% 50%') && !text.includes('opacity:') && video.volume === 1)
  sectionBox.posX = 50
  sectionBox.posY = 50
  sectionBox.volume = 1
  sectionBox.mode = 'video'
  sectionBox.value = 'https://cdn.example.com/afterreset.mp4'
  sectionBox.mediaKey = ''
  scopeSubscriber()
}

// ---- v0.4: Enter handler triggers apply + prevents default ----
{
  let hits = 0
  let prevented = false
  const handler = moduleExports.bgKeyEnter(() => { hits += 1 })
  check('A14 bgKeyEnter exported handler', typeof handler === 'function')
  handler({ key: 'Enter', preventDefault: () => { prevented = true } })
  handler({ key: 'Tab', preventDefault: () => { prevented = true } })
  handler({ key: 'Enter', preventDefault: () => { prevented = true } })
  check('A14 Enter triggers apply (2/3) and non-Enter ignored', hits === 2 && prevented === true, `hits=${hits}`)
}

// ---- v0.4: local upload → POST /dsh-bg-new-media/upload → mediaKey ----
{
  const cfg = { ...moduleExports.bgDefaultConfig, imageExt: [...moduleExports.bgDefaultConfig.imageExt] }
  lastFetch = null
  fetchOk = true
  fetchPayload = { ok: true, mediaKey: 'k-uploaded' }
  const outcome = await moduleExports.bgUploadLocalFile({ name: 'pic.png', size: 4096 }, 'image', cfg)
  check('A14 upload success returns mediaKey', outcome.ok === true && outcome.mediaKey === 'k-uploaded', JSON.stringify(outcome))
  check('A14 upload POSTs raw file to upload route', lastFetch !== null
    && lastFetch.url === '/dsh-bg-new-media/upload?kind=image&ext=png'
    && lastFetch.init.method === 'POST'
    && lastFetch.init.body?.name === 'pic.png' && lastFetch.init.body?.size === 4096,
    JSON.stringify(lastFetch?.url))
  // client-side pre-checks short-circuit without fetch
  lastFetch = null
  const badExt = await moduleExports.bgUploadLocalFile({ name: 'pic.gif', size: 4 }, 'image', { ...cfg, imageExt: ['png', 'jpg'] })
  check('A14 upload rejects unsupported ext locally (no fetch)', badExt.ok === false && badExt.errorKey === 'errFileType' && lastFetch === null, JSON.stringify(badExt))
  const tooBig = await moduleExports.bgUploadLocalFile({ name: 'big.png', size: 2 * 1024 * 1024 }, 'image', { ...cfg, maxImageMB: 1 })
  check('A14 upload rejects oversized file locally', tooBig.ok === false && tooBig.errorKey === 'errFileTooBig' && tooBig.detail === '1MB', JSON.stringify(tooBig))
  // server 400 message surfaces
  lastFetch = null
  fetchOk = false
  fetchPayload = { ok: false, message: 'dsh-bg-new-media: 不支持的图片类型 .png（允许 webp）' }
  const serverBad = await moduleExports.bgUploadLocalFile({ name: 'a.png', size: 10 }, 'image', cfg)
  check('A14 server 400 message surfaced', serverBad.ok === false && typeof serverBad.message === 'string'
    && serverBad.message.includes('dsh-bg-new-media'), JSON.stringify(serverBad))
  lastFetch = null
  fetchOk = true
  fetchPayload = { ok: true, mediaKey: 'k-uploaded' }
  const vidOutcome = await moduleExports.bgUploadLocalFile({ name: 'clip.mp4', size: 99 }, 'video', cfg)
  check('A14 video upload POSTs with kind=video', lastFetch !== null && lastFetch.url === '/dsh-bg-new-media/upload?kind=video&ext=mp4'
    && vidOutcome.ok === true && vidOutcome.mediaKey === 'k-uploaded', JSON.stringify({ url: lastFetch?.url, out: vidOutcome }))
}

// =====================================================================
// A13) v0.3.1: media opacity + focus position rendering, clamps, and the
//      video error surface (status.error → dictionary key → panel red line)
// =====================================================================
moduleExports.applyBg('image', 'https://example.com/focus.jpg', { fit: 'cover', opacity: 0.4, posX: 20, posY: 80 })
{
  const text = styleText()
  check('A13 image focus position renders into CSS (20% 80%)', text.includes('background-position: 20% 80%'))
  check('A13 image opacity 0.4 written on layer', text.includes('opacity: 0.4'))
}
moduleExports.applyBg('image', 'https://example.com/clamp.jpg', { opacity: -2, posX: 150, posY: -1 })
{
  const text = styleText()
  check('A13 opacity clamped to 0 (negative → opacity: 0 in CSS)', text.includes('opacity: 0'))
  check('A13 posX/posY clamped into 0-100 (150/-1 → 100% 0%)', text.includes('background-position: 100% 0%'))
}
moduleExports.applyBg('video', 'https://cdn.example.com/pos.mp4', { fit: 'cover', posX: 0, posY: 100 })
{
  const text = styleText()
  check('A13 video object-position focus (0% 100%)', text.includes('object-position: 0% 100%'))
}
moduleExports.applyBg('gradient', 'linear-gradient(135deg, #1e2a78, #2b1055)')
check('A13 gradient/color never carry a layer opacity rule',
  !styleText().includes('opacity:') && layerNodes().length === 1)
check('A13 runtime status clean after ordinary applies', moduleExports.bgRuntimeStatus().error === '')
check('A13 helper exports: clamps/status/error mapping/focus/volume', typeof moduleExports.clampBgOpacity === 'function'
  && typeof moduleExports.clampBgPos === 'function' && typeof moduleExports.clampBgVolume === 'function'
  && typeof moduleExports.videoErrorKeyForCode === 'function'
  && typeof moduleExports.bgRuntimeStatus === 'function')
check('A13 focusPositionCss defaults / bounds / passthrough',
  moduleExports.focusPositionCss(undefined, undefined) === '50% 50%'
  && moduleExports.focusPositionCss(0, 0) === '0% 0%'
  && moduleExports.focusPositionCss(100, 100) === '100% 100%'
  && moduleExports.focusPositionCss(150, -5) === '100% 0%'
  && moduleExports.focusPositionCss(23.5, 70) === '23.5% 70%')
check('A13 clamp helpers (opacity 0..1 / pos 0..100 / volume 0..1)',
  moduleExports.clampBgOpacity(7) === 1 && moduleExports.clampBgOpacity(-1) === 0
  && moduleExports.clampBgOpacity(0.6) === 0.6 && moduleExports.clampBgOpacity(undefined) === 1
  && moduleExports.clampBgPos(150) === 100 && moduleExports.clampBgPos(-9) === 0
  && moduleExports.clampBgPos(undefined) === 50
  && moduleExports.clampBgVolume(2) === 1 && moduleExports.clampBgVolume(-1) === 0
  && moduleExports.clampBgVolume(0.6) === 0.6 && moduleExports.clampBgVolume(undefined) === 1)

// ---- video <error> event → readable status (was fully silent before v0.3.1) ----
moduleExports.applyBg('video', 'https://cdn.example.com/ocean.mp4', { fit: 'cover' })
{
  const video = videosIn()[0]
  check('A13 error-surface video element exists', !!video)
  video.error = { code: 2 }
  video.fire('error')
  check('A13 <video> error code 2 → status.errVideoNetwork',
    moduleExports.bgRuntimeStatus().error === 'errVideoNetwork', moduleExports.bgRuntimeStatus().error)
  check('A13 zh copy for network error is human readable', localeDict.zh.errVideoNetwork.includes('网络'))
  video.error = { code: 4 }
  video.fire('error')
  check('A13 <video> error code 4 → status.errVideoSrc',
    moduleExports.bgRuntimeStatus().error === 'errVideoSrc', moduleExports.bgRuntimeStatus().error)
  check('A13 videoErrorKeyForCode maps 1..4 + unknown',
    moduleExports.videoErrorKeyForCode(1) === 'errVideoAborted'
    && moduleExports.videoErrorKeyForCode(2) === 'errVideoNetwork'
    && moduleExports.videoErrorKeyForCode(3) === 'errVideoDecode'
    && moduleExports.videoErrorKeyForCode(4) === 'errVideoSrc'
    && moduleExports.videoErrorKeyForCode(undefined) === 'errVideoLoad')
  video.fire('playing')
  check('A13 playing clears status.error', moduleExports.bgRuntimeStatus().error === '')
  video.fire('stalled')
  check('A13 stalled → waiting hint', moduleExports.bgRuntimeStatus().error === 'errVideoStalled')
  video.fire('suspend')
  check('A13 suspend clears the stalled hint', moduleExports.bgRuntimeStatus().error === '')
}

// ---- autoplay rejection (NotAllowedError) → hint instead of silence ----
{
  moduleExports.applyBg('video', 'https://cdn.example.com/ocean2.mp4', { fit: 'cover' })
  const video = videosIn()[0]
  video.play = () => Promise.reject(Object.assign(new Error('blocked'), { name: 'NotAllowedError' }))
  moduleExports.applyBg('video', 'https://cdn.example.com/ocean3.mp4', { fit: 'cover' })
  await Promise.resolve()
  await Promise.resolve()
  check('A13 play() NotAllowedError → errVideoAutoplay hint',
    moduleExports.bgRuntimeStatus().error === 'errVideoAutoplay', moduleExports.bgRuntimeStatus().error)
  check('A13 autoplay hint copy present (zh/en)', localeDict.zh.errVideoAutoplay.includes('自动播放')
    && localeDict.en.errVideoAutoplay.includes('Autoplay'))
  delete video.play // revert to fake autoplay
  video.fire('playing')
  check('A13 autoplay hint cleared once it actually plays', moduleExports.bgRuntimeStatus().error === '')
}

// ---- applyBg exception → errApply visible in status (no longer swallowed) ----
{
  moduleExports.applyBg('off', '') // tear the layer/style down so ensureLayer must append
  const origAppend = body.append
  body.append = () => { throw new Error('boom') }
  moduleExports.applyBg('gradient', 'linear-gradient(135deg, #1e2a78, #2b1055)')
  check('A13 applyBg exception → status.errApply', moduleExports.bgRuntimeStatus().error === 'errApply',
    moduleExports.bgRuntimeStatus().error)
  check('A13 errApply copy present (zh/en)', localeDict.zh.errApply !== '' && localeDict.en.errApply !== '')
  body.append = origAppend
}

// ---- unload restore complete ----
runAllCleanups()
check('A12 cleanup restores DOM (no layer/style/video)', layerNodes().length === 0 && styleNodes().length === 0)
check('A12 cleanup leaves body children empty of ours', body.children.length === 0 && head.children.length === 0)

// =====================================================================
// A15) v0.4 single renderer: exactly one self-managed style/layer engine,
//      no duplicate body-level media rules (style.ts host injection stopped)
// =====================================================================
{
  moduleExports.applyBg('gradient', 'linear-gradient(135deg, #1e2a78, #2b1055)')
  const text = styleText()
  check('A15 single <style id=dsh-bg-new-style> exists', styleNodes().length === 1)
  check('A15 no legacy fixed body background media rules in engine CSS',
    !text.includes('no-repeat fixed'))
  // 去掉所有块注释后再计数：引擎标识常量各只出现一次（单一自管渲染引擎）；
  // 若还有第二套 layer/style 定义（如旧 style.ts 的 body 注入）会暴露出来。
  const codeNoComments = code.replace(/\/\*[\s\S]*?\*\//g, '')
  const layerCount = codeNoComments.split('data-dsh-bg-new-layer').length - 1
  const styleIdCount = codeNoComments.split('dsh-bg-new-style').length - 1
  const styleTagCreate = (codeNoComments.match(/createElement\(["']style["']\)/g) ?? []).length
  const videoTagCreate = (codeNoComments.match(/createElement\(["']video["']\)/g) ?? []).length
  check('A15 bundle has exactly one layer attr + one bg style id + two style factories (bg engine + drawer layout) + one video factory',
    layerCount === 1 && styleIdCount === 1 && styleTagCreate === 2 && videoTagCreate === 1,
    `layer=${layerCount} style=${styleIdCount} styleEl=${styleTagCreate} videoEl=${videoTagCreate}`)
  moduleExports.applyBg('off', '')
}

// =====================================================================
// A16) v0.4.1 regressions: 选项微调不再清 mediaKey（#3/#4）；视频换源清旧键
//      （#9）；一次变更 = 一次原子 mutate；恢复默认完整落库且定位/透明度回默认（#2）
// =====================================================================
{
  // 前面 unload-restore 的 ctx 清理把 runFlushImpl 置空 —— 重新 apply 一个 ctx
  // 恢复持久化链路（复用同一套 fake：setCalls / mutateCalls / sectionBox）。
  moduleExports.apply(fakeCtx)
  Object.assign(sectionBox, {
    mode: 'off', value: '', fit: 'cover', textScheme: 'auto', loop: true, mediaKey: '',
    opacity: 1, posX: 50, posY: 50, volume: 1,
    imageExt: ['png', 'jpg'], videoExt: ['mp4'], maxImageMB: 10, maxVideoMB: 500,
    defaultFit: 'cover', defaultTextScheme: 'auto', defaultLoop: true,
  })
  scopeSubscriber() // 镜像回默认并采纳
  const injected2 = (typeof registeredOptions?.inject === 'function' ? registeredOptions.inject() : null)
  check('A16 re-applied ctx exposes setBg for persistence tests', typeof injected2?.setBg === 'function')

  // (1) 本地图（mediaKey）+ 拖透明度：来源不能被清掉（#3）
  moduleExports.applyBg('image', 'wall.png', { mediaKey: 'keep-img' })
  check('A16 mediaKey image renders via host media route',
    layerNodes().length === 1 && styleText().includes('background-image: url("/dsh-bg-new-media/keep-img")'))
  const t1 = setCalls.length
  injected2.setBg('image', 'wall.png', { opacity: 0.5 })
  check('A16 opacity tweak keeps wallpaper on screen (mediaKey intact)',
    styleText().includes('/dsh-bg-new-media/keep-img') && styleText().includes('opacity: 0.5'))
  flushTimers()
  const w1 = setCalls.slice(t1)
  check('A16 option tweak persists opacity only — no mode/value/mediaKey churn',
    w1.length === 1 && w1[0][0] === 'opacity' && w1[0][1] === 0.5, JSON.stringify(w1))
  await Promise.resolve()

  // (2) 切本地视频 → 远程坏链：必须清旧 mediaKey 并换源尝试（#9）
  moduleExports.applyBg('video', 'local.mp4', { mediaKey: 'old-vid' })
  check('A16 local video first (mediaKey src)',
    videosIn()[0]?.getAttribute('src') === '/dsh-bg-new-media/old-vid',
    String(videosIn()[0]?.getAttribute('src')))
  const t2 = setCalls.length
  injected2.setBg('video', 'https://cdn.example.com/broken.mp4')
  flushTimers()
  const w2 = setCalls.slice(t2)
  const v2 = videosIn()[0]
  check('A16 video URL replace swaps src to the new (broken) URL',
    v2?.getAttribute('src') === 'https://cdn.example.com/broken.mp4',
    String(v2?.getAttribute('src')))
  check('A16 video URL replace persists mediaKey cleared', w2.some(([f, val]) => f === 'mediaKey' && val === ''),
    JSON.stringify(w2))
  await Promise.resolve()

  // (3) 一次 flush = 一次原子 mutate（单批 ops，不再逐字段多轮往返）
  const m0 = mutateCalls.length
  const t3 = setCalls.length
  injected2.setBg('gradient', 'linear-gradient(135deg, #000000, #ffffff)', { textScheme: 'dark' })
  flushTimers()
  const batches = mutateCalls.slice(m0)
  const w3 = setCalls.slice(t3)
  check('A16 one atomic mutate per flush, ops == writes',
    batches.length === 1 && batches[0].length === w3.length
      && batches[0].every((op, i) => op[0] === w3[i][0] && op[1] === w3[i][1]),
    JSON.stringify(batches))
  check('A16 source change writes mode/value/textScheme in one batch',
    w3.length === 3 && w3.map(([f]) => f).join(',') === 'mode,value,textScheme', JSON.stringify(w3))
  await Promise.resolve()

  // (4) 恢复默认：off + 定位/透明度回默认并随一次原子写落库（#2，重启不再回旧壁纸）
  Object.assign(sectionBox, {
    mode: 'gradient', value: 'linear-gradient(135deg, #000000, #ffffff)', textScheme: 'dark',
    posX: 80, posY: 16, opacity: 0.35,
  })
  scopeSubscriber()
  const t4 = setCalls.length
  injected2.setBg('off', '', { resetAll: true })
  flushTimers()
  const w4 = setCalls.slice(t4)
  const defaultOf = {
    mode: 'off', value: '', mediaKey: '', fit: 'cover', textScheme: 'auto', loop: true,
    opacity: 1, posX: 50, posY: 50, scale: 1, zoom: 1, volume: 1, glass: false,
  }
  const defaultsOk = w4.every(([f, val]) => defaultOf[f] === val)
  check('A16 resetAll persists default-only fields (incl. posX/posY back to 50)',
    defaultsOk && w4.some(([f]) => f === 'mode')
      && w4.some(([f, v]) => f === 'posX' && v === 50) && w4.some(([f, v]) => f === 'posY' && v === 50),
    JSON.stringify(w4))
  check('A16 resetAll force-writes scale/opacity too (no residue left behind)',
    w4.some(([f, v]) => f === 'scale' && v === 1) && w4.some(([f, v]) => f === 'opacity' && v === 1),
    JSON.stringify(w4))
  await Promise.resolve()

  // (5) 音量滑杆走 UI 路径写库（旧#5：音量重启后保留 = settings 持久化 + 元素回放）
  Object.assign(sectionBox, {
    mode: 'video', value: 'https://cdn.example.com/snd.mp4', mediaKey: '', fit: 'cover',
    textScheme: 'auto', loop: true, opacity: 1, posX: 50, posY: 50, volume: 1,
  })
  scopeSubscriber()
  const t5 = setCalls.length
  injected2.setBg('video', 'https://cdn.example.com/snd.mp4', { volume: 0.3 })
  flushTimers()
  const w5 = setCalls.slice(t5)
  check('A16 volume slider persists volume field only (restart-surviving write)',
    w5.length === 1 && w5[0][0] === 'volume' && w5[0][1] === 0.3, JSON.stringify(w5))
  check('A16 volume applied to the playing element', videosIn()[0]?.volume === 0.3)
  await Promise.resolve()
  // 模拟重启后的镜像重放：volume 从 settings 读回并写进元素
  Object.assign(sectionBox, { volume: 0.3 })
  scopeSubscriber()
  check('A16 volume survives a mirror replay (restart adoption)', videosIn()[0]?.volume === 0.3)

  // (6) v0.4.3：媒体自由缩放（scale）——渲染 transform、滑杆持久化、边界钳制
  moduleExports.applyBg('image', 'https://example.com/zoom.jpg', { fit: 'cover', scale: 1.5, posX: 25, posY: 75 })
  check('A16 scale 1.5 renders transform around the focus point',
    styleText().includes('transform: scale(1.5)') && styleText().includes('transform-origin: 25% 75%'),
    styleText().split('\n').filter((l) => l.includes('transform')).join(' | '))
  const t6 = setCalls.length
  injected2.setBg('image', 'https://example.com/zoom.jpg', { scale: 0.5 })
  flushTimers()
  const w6 = setCalls.slice(t6)
  check('A16 zoom slider persists scale only (single field)',
    w6.length === 1 && w6[0][0] === 'scale' && w6[0][1] === 0.5, JSON.stringify(w6))
  check('A16 scale 0.5 renders (zoom out)', styleText().includes('transform: scale(0.5)'))
  check('A16 scale 1 omits transform entirely (minimal CSS)',
    (() => {
      moduleExports.applyBg('image', 'https://example.com/zoom.jpg', { fit: 'cover', scale: 1 })
      return !styleText().includes('transform:')
    })())
  check('A16 clampBgScale bounds (0.25..4, default 1)',
    moduleExports.clampBgScale(9) === 4 && moduleExports.clampBgScale(0.1) === 0.25
      && moduleExports.clampBgScale(undefined) === 1 && moduleExports.clampBgScale(1.5) === 1.5)
  await Promise.resolve()
}

// =====================================================================
// A17) v0.4.4: 对比度补齐（#2）、恢复默认上移（#3）、弹窗拖动（#4）、预览（#5）
// =====================================================================
{
  // ---- #2：调色板扩表 ----
  const lt = moduleExports.tokensForTextScheme('light')
  const dt = moduleExports.tokensForTextScheme('dark')
  // 漏网 token 曾经让以下组件吃 UI 主题的浅色面 → 白底白字
  const contrastCritical = [
    '--dsw-alias-button-floating-fill', // 聊天「滚动到底部」圆钮底色
    '--dsw-alias-button-elevated-fill', // 左侧「新会话」按钮底色
    '--dsw-alias-button-floating-hover',
    '--dsw-alias-button-ghost-active-fill', // 设置弹窗浅色控件
    '--dsw-alias-button-ghost-active-hover',
    '--dsw-alias-interactive-bg-hover',
    '--dsw-alias-interactive-bg-hover-solid',
    '--dsw-alias-label-caption',
    '--dsw-alias-brand-text',
    '--dsw-alias-scrollbar-bg-l1',
    '--dsw-alias-bg-mask-1',
  ]
  check('A17 #2 两套调色板都补齐了「按钮/交互/遮罩」族 token',
    contrastCritical.every((k) => typeof lt[k] === 'string' && typeof dt[k] === 'string'
      && !lt[k].includes('var(') && !dt[k].includes('var(')),
    contrastCritical.filter((k) => typeof lt[k] !== 'string' || typeof dt[k] !== 'string').join(',') || 'all present')
  check('A17 #2 浅字方案：滚动到底部圆钮 = 深底 + 浅字（不再是白底白字）',
    lt['--dsw-alias-label-primary'] === '#f2f4f8'
      && /^rgb\((\d+) (\d+) (\d+) \/ 0\.9[0-9]?\)$/.test(lt['--dsw-alias-button-floating-fill']),
    lt['--dsw-alias-button-floating-fill'])
  check('A17 #2 深字方案：同一 token 反转成浅底 + 深字',
    dt['--dsw-alias-label-primary'] === '#1a1d24'
      && /^rgb\(255 255 255 \/ 0\.9[0-9]?\)$/.test(dt['--dsw-alias-button-floating-fill']),
    dt['--dsw-alias-button-floating-fill'])
  check('A17 #2 bubble-highlight 是「更亮的高亮面」而不是第二个普通气泡面',
    lt['--dsw-specific-bubble-highlight'] !== lt['--dsw-specific-bubble']
      && dt['--dsw-specific-bubble-highlight'] !== dt['--dsw-specific-bubble'])
  check('A17 #2 两套调色板同键（便于对照维护）',
    Object.keys(lt).sort().join('|') === Object.keys(dt).sort().join('|'),
    `light=${Object.keys(lt).length} dark=${Object.keys(dt).length}`)

  // ---- #2：遮罩必须用 body * 同特异性重写（主题把 mask 值预替换在 body, body *）----
  moduleExports.applyBg('color', '#0d1117')
  const cssLight = styleText()
  check('A17 #2 引擎 CSS 里有 body * 的遮罩重写（设置弹窗遮罩不再吃浅色字面量）',
    cssLight.includes('body * {') && cssLight.includes('--dsw-alias-bg-mask-1: rgba(0,0,0,0.28) !important'),
    cssLight.split('\n').filter((l) => l.includes('mask-1')).join(' | '))
  check('A17 #2 设置弹窗遮罩置透明（背景保持全屏透出）',
    cssLight.includes(':has(> div[role="dialog"][aria-modal="true"])')
      && cssLight.includes('background: transparent !important'))
  check('A17 #2 不写全局 text-shadow（深字方案下会在浅底上描黑边）',
    !cssLight.includes('text-shadow'), 'no body-level text-shadow')

  // ---- #5（v0.6.0 移除预览画布）：previewThemeFor 保留为纯工具导出 ----
  check('A17 #5 previewThemeFor 仍可用（纯工具，供旧调用方/验证）',
    moduleExports.previewThemeFor('light').text === '#f2f4f8'
      && moduleExports.previewThemeFor('dark').text === '#1a1d24'
      && moduleExports.previewThemeFor(null).fallbackBg !== '')
  check('A17 #5 预览取色全是字面量（不会引用主题变量导致错位）',
    Object.values(moduleExports.previewThemeFor('light')).every((v) => typeof v === 'string' && !v.includes('var(')))
  // 面板渲染：VM 里的 react 是 stub，jsx 直接返回 props，所以可以遍历 children 找 testid
  const flatten = (node, out = []) => {
    if (node === null || node === undefined) return out
    if (Array.isArray(node)) { for (const item of node) flatten(item, out); return out }
    if (typeof node !== 'object') return out
    out.push(node)
    if (node.children !== undefined) flatten(node.children, out)
    return out
  }
  panelSnap = {
    mode: 'off', value: '', fit: 'cover', textScheme: 'auto', loop: true, mediaKey: '',
    opacity: 1, posX: 50, posY: 50, scale: 1, zoom: 1, volume: 1, glass: false, resolvedText: null,
    cfg: { ...moduleExports.bgDefaultConfig },
    video: { paused: true, rate: 1, loop: true, soundOn: false, currentTime: 0, duration: 0 },
    status: { error: '' },
  }
  const panelNodes = flatten(moduleExports.BgPanel({
    setBg: () => {},
    text: (k) => k,
    // VM 里 useSyncExternalStore 是 stub，直接返回 panelSnap —— 在 props 上带一份
    // 「和真 scope 同形」的快照，让 BgPanel 的结构断言能真跑（tab / 恢复默认 / 毛玻璃）。
    ...panelSnap,
  }))
  const testids = panelNodes.map((n) => n['data-testid']).filter(Boolean)
  check('A17 #3 恢复默认只有一个按钮，且挂在 tab 栏里（dsh-bg-new-reset）',
    testids.filter((id) => id === 'dsh-bg-new-reset').length === 1 && testids.includes('dsh-bg-new-tabs'),
    testids.join(','))
  check('A17 面板里不再有预览块（v0.6.0 已去掉预览）', !testids.includes('dsh-bg-new-preview'))
  check('A17 面板里有毛玻璃质感开关（dsh-bg-new-glass）', testids.includes('dsh-bg-new-glass'))
}

// =====================================================================
// A18) v0.5.0：#A 预览画布 / #B zoom / #C 调参降透明 / #D 独立窗口入口 /
//      #E 顶部 token 覆盖集合 + meta theme-color
// =====================================================================
{
  // 面板结构断言要自己遍历 jsx props 树（stub 下 jsx 直接返回 props）
  const flatten = (node, out = []) => {
    if (node === null || node === undefined) return out
    if (Array.isArray(node)) { for (const item of node) flatten(item, out); return out }
    if (typeof node !== 'object') return out
    out.push(node)
    if (node.children !== undefined) flatten(node.children, out)
    return out
  }

  // ---- #B zoom：钳制 / 渲染 / 持久化 / 镜像采纳 ----
  check('A18 #B clampBgZoom 边界与步长（1..3，吸附 0.05，缺省 1）',
    moduleExports.clampBgZoom(9) === 3 && moduleExports.clampBgZoom(0.2) === 1
      && moduleExports.clampBgZoom(undefined) === 1 && moduleExports.clampBgZoom(1.23) === 1.25
      && moduleExports.clampBgZoom(2) === 2,
    JSON.stringify([moduleExports.clampBgZoom(9), moduleExports.clampBgZoom(0.2), moduleExports.clampBgZoom(1.23)]))
  check('A18 #B zoom 范围常量（滑杆 100%–300%）',
    moduleExports.bgZoomMin === 1 && moduleExports.bgZoomMax === 3)
  // image + fill：zoom 进 background-size（calc 百分比）—— 需求 F 的断言点
  moduleExports.applyBg('image', 'https://example.com/zoomfill.jpg', { fit: 'fill', zoom: 2 })
  check('A18 #B image+fill zoom=2 → background-size: calc(100% * 2)（宽高都缩放）',
    styleText().includes('background-size: calc(100% * 2) calc(100% * 2)'), styleText().split('\n').filter((l) => l.includes('background-size')).join(' | '))
  check('A18 #B image+fill zoom 不进 transform（避免双重放大）',
    !styleText().includes('transform:'), styleText().split('\n').filter((l) => l.includes('transform')).join(' | '))
  // image + cover：CSS 无法对 cover 再乘系数 → 走 transform
  moduleExports.applyBg('image', 'https://example.com/zoomcover.jpg', { fit: 'cover', zoom: 1.5, posX: 30, posY: 70 })
  check('A18 #B image+cover zoom=1.5 → 关键字尺寸保持 + transform: scale(1.5) 绕焦点',
    styleText().includes('background-size: cover')
      && styleText().includes('transform: scale(1.5)')
      && styleText().includes('transform-origin: 30% 70%'),
    styleText().split('\n').filter((l) => l.includes('transform') || l.includes('background-size')).join(' | '))
  // video：zoom 走 transform: scale
  moduleExports.applyBg('video', 'https://cdn.example.com/zoomzoom.mp4', { fit: 'cover', zoom: 2, posX: 0, posY: 100 })
  check('A18 #B video zoom=2 → <video> 的 transform: scale(2) + 焦点 origin',
    styleText().includes('transform: scale(2)') && styleText().includes('transform-origin: 0% 100%')
      && styleText().includes('object-position: 0% 100%'),
    styleText().split('\n').filter((l) => l.includes('transform') || l.includes('object-')).join(' | '))
  check('A18 #B zoom=1 时不输出任何 transform / calc（保持最小 CSS）',
    (() => {
      moduleExports.applyBg('image', 'https://example.com/plain.jpg', { fit: 'cover', zoom: 1 })
      return !styleText().includes('transform:') && !styleText().includes('calc(')
    })())
  check('A18 #B zoom 与 v0.4.3 scale 相乘（两条缩放轴都非 1 时叠加）',
    (() => {
      moduleExports.applyBg('image', 'https://example.com/both.jpg', { fit: 'cover', zoom: 1.5, scale: 2 })
      return styleText().includes('transform: scale(3)')
    })(), styleText().split('\n').filter((l) => l.includes('transform')).join(' | '))
  check('A18 #B zoom 超界被钳制到 3（99 → 300% 上限；scale 显式归 1 以隔离本轴）',
    (() => {
      moduleExports.applyBg('video', 'https://cdn.example.com/clamp.mp4', { fit: 'cover', zoom: 99, scale: 1 })
      return styleText().includes('transform: scale(3)')
    })())
  // zoom 参与 applyKey：镜像变化必须重渲染
  check('A18 #B zoom 进入 applyKey（镜像 zoom 变化 → CSS 跟着变）',
    (() => {
      moduleExports.applyBg('image', 'https://example.com/mirror.jpg', { fit: 'cover', zoom: 1, scale: 1 })
      const before = styleText()
      sectionBox.mode = 'image'
      sectionBox.value = 'https://example.com/mirror.jpg'
      sectionBox.mediaKey = ''
      sectionBox.zoom = 2
      scopeSubscriber()
      const after = styleText()
      const ok = !before.includes('transform:') && after.includes('transform: scale(2)')
      sectionBox.zoom = 1
      scopeSubscriber()
      return ok
    })())
  // zoom 持久化（UI 路径：单字段、一次原子提交）
  {
    moduleExports.apply(fakeCtx)
    const injected3 = (typeof registeredOptions?.inject === 'function' ? registeredOptions.inject() : null)
    const t0 = setCalls.length
    injected3.setBg('image', 'https://example.com/persist.jpg', { zoom: 2.5 })
    check('A18 #B 缩放滑杆乐观生效（不必等落库）', styleText().includes('transform: scale(2.5)'))
    flushTimers()
    const wrote = setCalls.slice(t0).filter(([f]) => f === 'zoom')
    check('A18 #B zoom 持久化为单字段写入（值 2.5）',
      wrote.length === 1 && wrote[0][1] === 2.5, JSON.stringify(setCalls.slice(t0)))
    await Promise.resolve()
    // 面板的缩放控件改 zoom 时顺带把遗留 scale 归 1（避免两条轴相乘）
    const t1 = setCalls.length
    Object.assign(sectionBox, { mode: 'image', value: 'https://example.com/persist.jpg', mediaKey: '', zoom: 2.5, scale: 2 })
    scopeSubscriber()
    injected3.setBg('image', 'https://example.com/persist.jpg', { zoom: 2, scale: 1 })
    flushTimers()
    const wrote2 = setCalls.slice(t1)
    check('A18 #B zoom 变更同时把遗留 scale 归 1（两条轴不相乘）',
      wrote2.some(([f, v]) => f === 'zoom' && v === 2) && wrote2.some(([f, v]) => f === 'scale' && v === 1),
      JSON.stringify(wrote2))
    await Promise.resolve()
    Object.assign(sectionBox, { zoom: 1, scale: 1 })
    scopeSubscriber()
  }

  // ---- v0.6.0：预览画布已移除（#A 断言整体删除） ----
  // ---- v0.6.0：#3 滑动调参降透明（抽屉自身透明度）+ #2 抽屉/侧栏入口 + #5 毛玻璃 ----
  check('A18 交互期初始为 false', moduleExports.bgIsAdjusting() === false)
  moduleExports.bgSetAdjusting(true)
  check('A18 bgSetAdjusting(true) → 交互期开启', moduleExports.bgIsAdjusting() === true)
  moduleExports.bgSetAdjusting(false)
  check('A18 bgSetAdjusting(false) → 交互期关闭', moduleExports.bgIsAdjusting() === false)
  moduleExports.bgSetAdjusting(true)
  moduleExports.disposeAdjusting()
  check('A18 disposeAdjusting（卸载）→ 交互期强制关闭', moduleExports.bgIsAdjusting() === false)

  check('A18 抽屉初始关闭', moduleExports.bgIsDrawerOpen() === false)
  check('A18 toggleDrawer 打开 → true', moduleExports.toggleDrawer() === true && moduleExports.bgIsDrawerOpen() === true)
  check('A18 toggleDrawer 再关 → false', moduleExports.toggleDrawer() === false && moduleExports.bgIsDrawerOpen() === false)

  const glassLight = moduleExports.glassSurfaceTokensForTextScheme('light')
  check('A18 毛玻璃内容面 token 覆盖（浅字方案）且半透明',
    typeof glassLight['--dsw-alias-bg-layer-1'] === 'string'
      && glassLight['--dsw-alias-bg-layer-1'].includes('0.55')
      && glassLight['--dsw-specific-bubble'] !== undefined)
  check('A18 毛玻璃 backdrop 滤镜 + 目标选择器（含抽屉/弹窗/输入卡）',
    typeof moduleExports.GLASS_BACKDROP_FILTER === 'string'
      && moduleExports.GLASS_BACKDROP_FILTER.includes('blur')
      && moduleExports.GLASS_BACKDROP_SELECTOR.includes('[data-dsh-bg-new-drawer]')
      && moduleExports.GLASS_BACKDROP_SELECTOR.includes('[data-composer-card]'))
  moduleExports.applyBg('image', 'https://example.com/glass.jpg', { glass: true })
  const glassCss = styleText()
  check('A18 glass:true → 引擎 CSS 输出 body[data-dsh-bg-new-glass] 与 backdrop-filter',
    glassCss.includes('body[data-dsh-bg-new-glass]')
      && glassCss.includes('backdrop-filter: blur(16px) saturate(1.2)')
      && glassCss.includes('-webkit-backdrop-filter'),
    glassCss.split('\n').filter((l) => l.includes('backdrop') || l.includes('data-dsh-bg-new-glass')).join(' | '))
  moduleExports.applyBg('image', 'https://example.com/plain.jpg', { glass: false })
  const plainCss = styleText()
  check('A18 glass:false → 不输出毛玻璃 CSS', !plainCss.includes('data-dsh-bg-new-glass') && !plainCss.includes('backdrop-filter'))

  const v06Keys = ['wallpaper', 'close', 'glass', 'glassHint']
  check('A18 抽屉/毛玻璃新增文案键 zh/en 齐备且非空',
    v06Keys.every((k) => typeof localeDict?.zh?.[k] === 'string' && localeDict.zh[k] !== ''
      && typeof localeDict?.en?.[k] === 'string' && localeDict.en[k] !== ''),
    v06Keys.filter((k) => !localeDict?.zh?.[k] || !localeDict?.en?.[k]).join(',') || 'all present')

  const baseSnap = {
    mode: 'off', value: '', fit: 'cover', textScheme: 'auto', loop: true, mediaKey: '',
    opacity: 1, posX: 50, posY: 50, scale: 1, zoom: 1, volume: 1, glass: false, resolvedText: 'light',
    cfg: { ...moduleExports.bgDefaultConfig },
    video: { paused: true, rate: 1, loop: true, soundOn: false, currentTime: 0, duration: 0 },
    status: { error: '' },
  }
  {
    panelSnap = { ...baseSnap, mode: 'image', value: 'https://example.com/x.jpg', fit: 'cover' }
    const nodes = flatten(moduleExports.BgPanel({ setBg: () => {}, text: (k) => k, ...panelSnap }))
    const ids = nodes.map((n) => n['data-testid']).filter(Boolean)
    check('A18 面板有毛玻璃开关、无预览块、无独立窗口按钮',
      ids.includes('dsh-bg-new-glass') && !ids.includes('dsh-bg-new-preview')
        && !ids.includes('dsh-bg-new-hold-preview') && !ids.includes('dsh-bg-new-adjust-row'),
      ids.join(','))
    const ranges = nodes.filter((n) => n.type === 'range' || (n.style && n.min !== undefined))
    check('A18 缩放滑杆（zoom 100%–300%）出现在壁纸控件里',
      ranges.some((n) => n.min === 100 && n.max === 300),
      JSON.stringify(ranges.map((n) => [n.min, n.max])))
    check('A18 连续滑杆（透明度/定位/缩放）都挂降透明回调；适配下拉不挂（第三轮需求 5）',
      ranges.length >= 4
        && ranges.every((n) => typeof n.onPointerDown === 'function' && typeof n.onPointerUp === 'function' && typeof n.onBlur === 'function')
        && nodes.filter((n) => n.type === 'select').every((n) => n.onPointerDown === undefined),
      JSON.stringify(ranges.map((n) => [n.min, n.max, n.step, typeof n.onPointerDown])))
  }

  // ---- 第五轮需求 1：小图（滚轮缩放 + 拖动定位） ----
  {
    panelSnap = {
      ...baseSnap, mode: 'image', value: 'https://example.com/map.jpg', fit: 'cover',
      zoom: 1.5, posX: 30, posY: 70,
    }
    const nodes = flatten(moduleExports.BgPanel({ setBg: () => {}, text: (k) => k, ...panelSnap }))
    const box = nodes.find((n) => n['data-testid'] === 'dsh-bg-new-minimap-box')
    check('A18 小图存在（图片模式）且有拖动起点 handler + ref（滚轮监听在 document 上按包含判断）',
      box !== undefined && typeof box.onPointerDown === 'function' && box.ref !== undefined)
    const layer = flatten(box?.children).find((n) => n['data-dsh-bg-new-minimap-layer'] !== undefined)
    check('A18 小图与真实层同规则（zoom 1.5 → scale(1.5) 绕焦点 30%/70%）',
      layer !== undefined && String(layer.style.transform) === 'scale(1.5)'
        && String(layer.style.transformOrigin) === '30% 70%'
        && String(layer.style.backgroundImage).includes('map.jpg'),
      JSON.stringify(layer?.style))
    check('A18 视频模式下小图用 canvas 镜像真实层那一帧（不再开第二路 <video>）', (() => {
      panelSnap = { ...baseSnap, mode: 'video', value: 'https://cdn.example.com/map.mp4', fit: 'cover' }
      const vNodes = flatten(moduleExports.BgPanel({ setBg: () => {}, text: (k) => k, ...panelSnap }))
      const boxChildren = flatten(vNodes.find((n) => n['data-testid'] === 'dsh-bg-new-minimap-box')?.children)
      const canvas = boxChildren.find((n) => n['data-dsh-bg-new-minimap-video'] !== undefined)
      // canvas 分支没有 src / muted（不吃第二路媒体源）—— 远程视频因此不会再"小图空白"
      return canvas !== undefined && canvas.ref !== undefined
        && canvas.src === undefined && canvas.muted === undefined
        && canvas.autoPlay === undefined
    })())
    check('A18 纯色/渐变模式不渲染小图（缩放定位对它们没有意义）', (() => {
      panelSnap = { ...baseSnap, mode: 'gradient', value: 'linear-gradient(#fff, #000)' }
      const gNodes = flatten(moduleExports.BgPanel({ setBg: () => {}, text: (k) => k, ...panelSnap }))
      return gNodes.every((n) => n['data-testid'] !== 'dsh-bg-new-minimap-box')
    })())
    check('A18 小图提示文案 zh/en 齐备',
      typeof localeDict?.zh?.minimapHint === 'string' && localeDict.zh.minimapHint.includes('滚轮')
        && typeof localeDict?.en?.minimapHint === 'string' && localeDict.en.minimapHint.includes('Scroll'))
  }

  // ---- 第五轮需求 4/5：小图拖动的「2 秒越界宽限」 ----
  {
    moduleExports.bgSetAdjusting(false)
    moduleExports.apply(fakeCtx)
    const injectedGrace = typeof registeredOptions?.inject === 'function' ? registeredOptions.inject() : null
    panelSnap = { ...baseSnap, mode: 'image', value: 'https://example.com/grace.jpg', fit: 'cover', posX: 50, posY: 50 }
    const nodes = flatten(moduleExports.BgPanel({ setBg: injectedGrace.setBg, text: (k) => k, ...panelSnap }))
    const box = nodes.find((n) => n['data-testid'] === 'dsh-bg-new-minimap-box')
    const rect = { left: 0, top: 0, right: 100, bottom: 100, width: 100, height: 100 }
    const t0 = setCalls.length
    box.onPointerDown({ clientX: 50, clientY: 50, currentTarget: { getBoundingClientRect: () => rect } })
    document.fire('pointermove', { clientX: 60, clientY: 50 })
    flushTimers()
    check('A18 小图内拖动 → 写 posX（拖满小图宽 = 0→100 全量程）',
      setCalls.slice(t0).some(([f, v]) => f === 'posX' && v === 60), JSON.stringify(setCalls.slice(t0)))
    const beforeOutside = setCalls.length
    document.fire('pointermove', { clientX: 200, clientY: 50 })
    flushTimers()
    check('A18 拖出边界后 2 秒宽限期内仍可继续定位（位置照写、夹在 0..100）',
      setCalls.slice(beforeOutside).some(([f, v]) => f === 'posX' && v === 100), JSON.stringify(setCalls.slice(beforeOutside)))
    const afterGrace = setCalls.length
    document.fire('pointermove', { clientX: 210, clientY: 50 })
    flushTimers()
    check('A18 宽限期到点 → 结束拖动，边界外的移动不再写设置',
      setCalls.slice(afterGrace).every(([f]) => f !== 'posX'), JSON.stringify(setCalls.slice(afterGrace)))
    moduleExports.bgSetAdjusting(false)
    await Promise.resolve()
  }

  // ---- 第五轮需求 2：单击滑条不降透明，只有真的拖动才降 ----
  {
    moduleExports.bgSetAdjusting(false)
    panelSnap = { ...baseSnap, mode: 'image', value: 'https://example.com/dim.jpg', fit: 'cover' }
    const nodes = flatten(moduleExports.BgPanel({ setBg: () => {}, text: (k) => k, ...panelSnap }))
    const opacitySlider = nodes.find((n) => n.type === 'range' && n.min === 0 && n.max === 100 && n.step === 5)
    check('A18 透明度滑杆找到（第五轮需求 2）', opacitySlider !== undefined)
    opacitySlider.onPointerDown({ clientX: 100, clientY: 100 })
    document.fire('pointermove', { clientX: 101, clientY: 101 })
    check('A18 单击滑条（指针没动过）→ 不降透明', moduleExports.bgIsAdjusting() === false)
    document.fire('pointermove', { clientX: 140, clientY: 100 })
    check('A18 指针移动超过阈值 → 开始降透明', moduleExports.bgIsAdjusting() === true)
    document.fire('pointerup', {})
    check('A18 松手 → 恢复（交互期结束）', moduleExports.bgIsAdjusting() === false)
  }

  {
    const actionNodes = flatten(moduleExports.BgSidebarAction({ text: (k) => k, wide: true }))
    check('A18 侧栏按钮渲染且带 testid + 切换抽屉的 onClick',
      actionNodes.some((n) => n['data-testid'] === 'dsh-bg-new-sidebar-action' && typeof n.onClick === 'function'))
    // 需求 6：展开态 = 图标 + 「壁纸」；收起态只留图标（无文字子节点）。
    // 注：VM 里的 jsx stub 只回 props（丢掉元素类型），所以按 props 特征判定：
    // 图标 = 带 viewBox 的 svg props，文字 = children 为文案键的 span props。
    const wideBtn = actionNodes.find((n) => n['data-testid'] === 'dsh-bg-new-sidebar-action')
    const wideChildren = Array.isArray(wideBtn?.children) ? wideBtn.children : [wideBtn?.children]
    check('A18 侧栏按钮展开态 = 图标 + 「壁纸」文字',
      wideChildren.some((c) => c?.viewBox !== undefined) && wideChildren.some((c) => c?.children === 'wallpaper'),
      JSON.stringify(wideChildren.map((c) => (c?.viewBox !== undefined ? 'icon' : c?.children))))
    const narrowNodes = flatten(moduleExports.BgSidebarAction({ text: (k) => k, wide: false }))
    const narrowBtn = narrowNodes.find((n) => n['data-testid'] === 'dsh-bg-new-sidebar-action')
    check('A18 侧栏按钮收起态只显示图标（无文字）', narrowBtn?.children?.viewBox !== undefined,
      JSON.stringify(narrowBtn?.children?.viewBox ?? narrowBtn?.children))

    moduleExports.toggleDrawer()
    const drawerNodes = flatten(moduleExports.BgDrawer({ setBg: () => {}, text: (k) => k }))
    moduleExports.toggleDrawer()
    const panel = drawerNodes.find((n) => n['data-dsh-bg-new-drawer'] !== undefined)
    const closeBtn = drawerNodes.find((n) => n['data-testid'] === 'dsh-bg-new-drawer-close')
    const backdrop = drawerNodes.find((n) => n['data-testid'] === 'dsh-bg-new-drawer-backdrop')
    check('A18 抽屉打开时渲染面板 + 关闭按钮（data-dsh-bg-new-drawer / dsh-bg-new-drawer-close）',
      panel !== undefined && closeBtn !== undefined)
    check('A18 抽屉宽度 = min(630px,100vw)（需求 2：+50%）',
      panel?.style?.width === 'min(630px, 100vw)', String(panel?.style?.width))
    check('A18 关闭按钮有描边 + 圆角 50%（需求 8）',
      String(closeBtn?.style?.border ?? '').includes('1px solid') && closeBtn?.style?.borderRadius === '50%',
      JSON.stringify({ border: closeBtn?.style?.border, radius: closeBtn?.style?.borderRadius }))
    check('A18 点抽屉外区域关闭（透明遮罩 onClick → setDrawerOpen(false)，需求 9）',
      backdrop !== undefined && typeof backdrop.onClick === 'function' && backdrop.style?.background === 'transparent')
    check('A18 面板里不再重复渲染「背景」标题（需求 5）',
      drawerNodes.filter((n) => n['data-testid'] === 'dsh-bg-new-title').length === 0)
    // 第二轮需求 1：抽屉打开 → body 标记 + 隐藏侧栏/聊天列的布局 CSS
    moduleExports.toggleDrawer()
    const drawerCss = [...head.children, ...body.children]
      .find((n) => n.getAttribute?.('id') === 'dsh-bg-new-drawer-style')?.textContent ?? ''
    moduleExports.toggleDrawer()
    check('A18 抽屉布局样式表存在（打开时隐藏左侧栏与聊天列，第二轮需求 1）',
      drawerCss.includes('[data-shell-overlay]') && drawerCss.includes('grid-template-columns: 0px 0px 0px'),
      drawerCss.slice(0, 160))
    check('A18 抽屉底板半透明 + backdrop 模糊（第二轮需求 6：不用固定色）',
      typeof panel?.style?.background === 'string'
        && panel.style.background.includes('rgb(') && panel.style.background.includes('/ 0.55')
        && typeof panel.style.backdropFilter === 'string' && panel.style.backdropFilter.includes('blur'),
      JSON.stringify({ bg: panel?.style?.background, filter: panel?.style?.backdropFilter }))
    check('A18 侧栏按钮无描边（第二轮需求 3）',
      wideBtn?.style?.border === 'none', String(wideBtn?.style?.border))
    // 第八轮需求 3：悬浮底色 —— 按钮底色是内联样式（层级高于样式表），
    // 所以必须由抽屉布局样式表用 !important 补一条 :hover 规则。
    check('A18 侧栏按钮有 :hover 悬浮底色规则（与 Settings 同一枚 token，第八轮需求 3）',
      drawerCss.includes('[data-testid="dsh-bg-new-sidebar-action"]:hover')
        && drawerCss.includes('--dsw-alias-interactive-bg-hover')
        && /:hover\s*\{[^}]*!important/.test(drawerCss),
      drawerCss.slice(drawerCss.indexOf(':hover'), drawerCss.indexOf(':hover') + 140))
    check('A18 视频播放/停止合并为一个图标按钮（第二轮需求 2）', (() => {
      panelSnap = { ...baseSnap, mode: 'video', value: 'https://cdn.example.com/v.mp4', fit: 'cover' }
      const nodes = flatten(moduleExports.BgPanel({ setBg: () => {}, text: (k) => k, ...panelSnap }))
      const btns = nodes.filter((n) => n['data-testid'] === 'dsh-bg-new-video-playstop')
      return btns.length === 1 && btns[0].children?.viewBox !== undefined
        && btns.every((n) => n.children !== '播放' && n.children !== '停止')
    })())
    check('A18 视频页签不再渲染「背景视频」标签行（第二轮需求 4；页签按钮本身保留）', (() => {
      const nodes = flatten(moduleExports.BgPanel({ setBg: () => {}, text: (k) => k, ...panelSnap }))
      const tabLabels = nodes.filter((n) => n.children === 'video' && n.role === 'tab').length
      const rowLabels = nodes.filter((n) => n.children === 'video' && n.role !== 'tab').length
      return tabLabels === 1 && rowLabels === 0
    })())
    check('A18 本地视频提示不再提「上限」且说明只在本机使用（第二轮需求 5）',
      typeof localeDict?.zh?.localVideoHint === 'string'
        && !localeDict.zh.localVideoHint.includes('上限')
        && localeDict.zh.localVideoHint.includes('不会上传到云端')
        && typeof localeDict?.en?.localVideoHint === 'string'
        && !localeDict.en.localVideoHint.includes('limit'),
      String(localeDict?.zh?.localVideoHint))
    // 第三轮需求 6：本地文件回显值点「应用」= 保持不变（不报"需要 http 开头"）
    const localImgState = { mode: 'image', mediaKey: 'k-1', value: 'photo.jpg' }
    const localVidState = { mode: 'video', mediaKey: 'k-2', value: 'C:\\clips\\a.mp4' }
    check('A18 bgMediaFieldVerdict：当前本地文件的回显值 → noop（不报错、不写设置）',
      moduleExports.bgMediaFieldVerdict('image', 'photo.jpg', localImgState) === 'noop'
        && moduleExports.bgMediaFieldVerdict('video', 'C:\\clips\\a.mp4', localVidState) === 'noop')
    check('A18 bgMediaFieldVerdict：url / 本地路径 / 非法 各自分流',
      moduleExports.bgMediaFieldVerdict('image', 'https://x/a.jpg', localImgState) === 'url'
        && moduleExports.bgMediaFieldVerdict('image', 'D:\\pics\\b.png', localImgState) === 'local-path'
        && moduleExports.bgMediaFieldVerdict('image', '/home/u/c.png', localImgState) === 'local-path'
        && moduleExports.bgMediaFieldVerdict('image', 'file:///tmp/d.png', localImgState) === 'local-path'
        && moduleExports.bgMediaFieldVerdict('image', 'nonsense', localImgState) === 'invalid'
        && moduleExports.bgMediaFieldVerdict('image', '', localImgState) === 'invalid')
    check('A18 bgMediaFieldVerdict：值变了 / 类型不匹配就不再是 noop（该报错还是要报）',
      moduleExports.bgMediaFieldVerdict('image', 'other.jpg', localImgState) === 'invalid'
        && moduleExports.bgMediaFieldVerdict('video', 'photo.jpg', localImgState) === 'invalid'
        && moduleExports.bgMediaFieldVerdict('image', 'photo.jpg', { mode: 'image', mediaKey: '', value: 'photo.jpg' }) === 'invalid')
    // 第三轮需求 1–4：四个来源行都不再有标签；页签与抽屉标题文案
    check('A18 来源页签与抽屉标题文案（第三轮 / 第八轮需求）',
      localeDict?.zh?.image === '图片' && localeDict?.zh?.video === '视频'
        && localeDict?.zh?.title === '壁纸' && localeDict?.zh?.presets === '推荐'
        && localeDict?.en?.image === 'Image' && localeDict?.en?.presets === 'Presets',
      JSON.stringify({ image: localeDict?.zh?.image, video: localeDict?.zh?.video, title: localeDict?.zh?.title, presets: localeDict?.zh?.presets }))
    // 第七轮需求 2：药丸式分段 tab + 滑动滑块（位移过渡）
    check('A18 tab 是药丸式分段控件（底槽 999px + 滑块 translateX 过渡 + 文字渐变）', (() => {
      const nodes = flatten(moduleExports.BgPanel({ setBg: () => {}, text: (k) => k, ...baseSnap }))
      const list = nodes.find((n) => n['data-testid'] === 'dsh-bg-new-tablist')
      const thumb = nodes.find((n) => n['data-testid'] === 'dsh-bg-new-tab-thumb')
      const tabs = nodes.filter((n) => n.role === 'tab')
      return list !== undefined && String(list.style?.borderRadius) === '999px'
        && thumb !== undefined && String(thumb.style?.transform).startsWith('translateX')
        && String(thumb.style?.transition).includes('transform')
        && String(thumb.style?.width).includes('100% - 6px')
        && tabs.length === 5
        && tabs.every((n) => String(n.style?.transition).includes('color'))
    })())
    check('A18 滑块位置跟着当前 tab 走（mode=image → 第 4 个位置 translateX(300%)）', (() => {
      panelSnap = { ...baseSnap, mode: 'image', value: 'https://example.com/t.jpg' }
      const nodes = flatten(moduleExports.BgPanel({ setBg: () => {}, text: (k) => k, ...panelSnap }))
      const thumb = nodes.find((n) => n['data-testid'] === 'dsh-bg-new-tab-thumb')
      return thumb !== undefined && thumb.style.transform === 'translateX(300%)'
    })())
    // 第八轮需求 1：页签底槽与滑块必须**半透明**（壁纸要透得过来）。
    // 之前底槽吃主题的 --dsw-specific-selector、滑块吃 --dsw-alias-bg-layer-1
    // （近黑 0.96），在壁纸上就是一条实心黑条。
    check('A18 页签底槽与滑块是半透明 tint（不再吃实心 token）', (() => {
      const cases = [
        { scheme: 'light', expect: 'rgba(255,255,255,0.14)' },
        { scheme: 'dark', expect: 'rgba(15,17,21,0.10)' },
        { scheme: null, expect: 'rgba(127,127,127,0.14)' },
      ]
      const fnOk = cases.every(({ scheme, expect }) => {
        const tint = moduleExports.tabTintForTextScheme(scheme)
        return tint?.track === expect && /^rgba\(/.test(String(tint?.thumb))
          && parseFloat(String(tint.thumb).split(',')[3]) > parseFloat(expect.split(',')[3])
      })
      panelSnap = { ...baseSnap, mode: 'image', value: 'https://example.com/t.jpg', resolvedText: 'light' }
      const nodes = flatten(moduleExports.BgPanel({ setBg: () => {}, text: (k) => k, ...panelSnap }))
      const list = nodes.find((n) => n['data-testid'] === 'dsh-bg-new-tablist')
      const thumb = nodes.find((n) => n['data-testid'] === 'dsh-bg-new-tab-thumb')
      const applied = list?.style?.background === 'rgba(255,255,255,0.14)'
        && thumb?.style?.background === 'rgba(255,255,255,0.28)'
        && !String(list?.style?.background).includes('--dsw-specific-selector')
        && !String(thumb?.style?.background).includes('bg-layer-1')
      return fnOk && applied
    })(), JSON.stringify({ tint: moduleExports.tabTintForTextScheme('light') }))
    check('A18 四个来源页签的编辑行都没有来源标签（第三轮需求 1）', (() => {
      // row() 的标签是 width:44px 的 span；页签按钮带 role=tab，两者可区分。
      const rowLabelCount = (mode, key) => {
        panelSnap = { ...baseSnap, mode, value: '' }
        const nodes = flatten(moduleExports.BgPanel({ setBg: () => {}, text: (k) => k, ...panelSnap }))
        return nodes.filter((n) => n.children === key && n.role !== 'tab' && n.style?.width === '44px').length
      }
      return rowLabelCount('color', 'color') === 0
        && rowLabelCount('gradient', 'gradient') === 0
        && rowLabelCount('image', 'image') === 0
        && rowLabelCount('video', 'video') === 0
    })())
  }

  // ---- #E 顶部区域 token + meta theme-color ----
  {
    const reveal = moduleExports.REVEAL_TOKENS
    const top = moduleExports.TOP_REGION_TOKENS
    check('A18 #E 顶部覆盖集合非空且每项都在透出集合里置 transparent',
      Array.isArray(top) && top.length >= 2 && top.every((k) => reveal[k] === 'transparent'),
      JSON.stringify(top))
    check('A18 #E 顶部覆盖集合含 bg-base 与 sidebar-fill（源码查实的两个垫面 token）',
      top.includes('--dsw-alias-bg-base') && top.includes('--dsw-specific-sidebar-fill'))
    moduleExports.applyBg('color', '#0d1117')
    check('A18 #E 引擎 CSS 真的把这两个 token 置 transparent（顶部区域随整窗透出）',
      top.every((k) => styleText().includes(`${k}: transparent !important`)))
    // 第八轮需求 4：图层以下必须有**确定**的画布底色 —— 否则透明度 <1 的混合区与
    // =0 的完全透明区露出的是运行环境自己的颜色（浏览器画布白 / 桌面窗口黑），
    // 同一个设置两端观感不同。底色按文字方案取（浅字方案深底、深字方案浅底）。
    check('A18 引擎把确定画布底色写到 html（浅字方案深底 / 深字方案浅底；off 时不写）', (() => {
      const light = moduleExports.baseSurfaceForTextScheme('light')
      const dark = moduleExports.baseSurfaceForTextScheme('dark')
      const cssHas = (color) => styleText().includes('html {')
        && styleText().includes(`background-color: ${color} !important`)
      moduleExports.applyBg('color', '#0d1117')
      const deepOk = light === 'rgb(10 13 18)' && cssHas(light)
      moduleExports.applyBg('color', '#f5f5f5')
      const lightOk = dark === 'rgb(250 251 253)' && cssHas(dark)
      moduleExports.applyBg('off', '')
      const offClean = !styleText().includes('html {')
      // 还原本段后续断言期望的状态（它们依赖 color 生效时的 meta theme-color）
      moduleExports.applyBg('color', '#0d1117')
      return deepOk && lightOk && offClean
    })(), JSON.stringify([
      moduleExports.baseSurfaceForTextScheme('light'),
      moduleExports.baseSurfaceForTextScheme('dark'),
    ]))
    check('A18 #E color → meta theme-color 同步为该色（ThemePresenter 算不出透明底）',
      moduleExports.bgThemeColorFor('color', '#0d1117', 'light') === 'rgb(13 17 23)'
        && moduleExports.bgThemeColorFor('gradient', 'linear-gradient(135deg, #ffffff, #000000)', 'light') === 'rgb(128 128 128)'
        && moduleExports.bgThemeColorFor('image', 'https://x/y.jpg', 'light') === '#0f1115'
        && moduleExports.bgThemeColorFor('image', 'https://x/y.jpg', 'dark') === '#f7f8fa'
        && moduleExports.bgThemeColorFor('off', '', null) === null,
      JSON.stringify([
        moduleExports.bgThemeColorFor('color', '#0d1117', 'light'),
        moduleExports.bgThemeColorFor('gradient', 'linear-gradient(135deg, #ffffff, #000000)', 'light'),
      ]))
    const meta = head.children.find((n) => n.getAttribute('name') === 'theme-color')
    check('A18 #E meta theme-color 真的写进了 head（content = 背景色）',
      meta !== undefined && meta.getAttribute('content') === 'rgb(13 17 23)',
      meta === undefined ? 'no meta' : String(meta.getAttribute('content')))
    moduleExports.applyBg('off', '')
    check('A18 #E 切回 off → 自建 meta 被移除（完整还原，不污染页面）',
      head.children.filter((n) => n.getAttribute('name') === 'theme-color').length === 0)
  }
}

// =====================================================================
// B) Host TS sources (real module imports via Node type stripping)
// =====================================================================
let hostImportsFailed = false
let bgConfig
let bgSettings
let tool
let hostConfig
let mediaModule
let stateModule
try {
  bgConfig = await import(new URL('../src/bg-config.ts', import.meta.url).href)
  bgSettings = await import(new URL('../src/bg-settings.ts', import.meta.url).href)
  tool = await import(new URL('../src/tool.ts', import.meta.url).href)
  hostConfig = await import(new URL('../src/config.ts', import.meta.url).href)
  mediaModule = await import(new URL('../src/media.ts', import.meta.url).href)
  stateModule = await import(new URL('../src/state.ts', import.meta.url).href)
} catch (error) {
  hostImportsFailed = true
  console.log(`FAIL  B0 host TS import requires Node ≥22.18 type stripping  ${error?.message ?? error}`)
  failures += 1
}

if (!hostImportsFailed) {
  // ---- schema fields ----
  const cfgDefaults = bgConfig.DEFAULT_BG_CONFIG
  const schema = bgSettings.buildBgSectionSchema(cfgDefaults)
  const schemaJson = JSON.stringify(schema.toJSON())
  const requiredFields = ['mode', 'value', 'fit', 'textScheme', 'loop', 'mediaKey',
    'opacity', 'posX', 'posY', 'scale', 'zoom', 'volume', 'glass',
    'imageExt', 'videoExt', 'maxImageMB', 'maxVideoMB', 'defaultFit', 'defaultTextScheme', 'defaultLoop']
  const missing = requiredFields.filter((field) => !schemaJson.includes(`"${field}"`))
  check('B1 schema carries all v0.3 + v0.3.1 + v0.4 + v0.4.3 + v0.5.0 + v0.6.0 fields', missing.length === 0, `missing=${missing.join(',') || '-'}`)
  check('B1 zoom 字段默认 1（v0.5.0；与 scale 0.25–4 是两个独立轴）', (() => {
    const parsed = JSON.parse(schemaJson)
    const dictOwner = Object.values(parsed.refs ?? {}).find((ref) => ref !== null && typeof ref === 'object'
      && typeof ref.dict === 'object' && typeof ref.dict.zoom === 'number')
    const zoomRef = dictOwner ? parsed.refs?.[dictOwner.dict.zoom] : undefined
    return zoomRef?.type === 'number' && zoomRef?.meta?.default === 1
      && zoomRef?.meta?.min === 1 && zoomRef?.meta?.max === 3
  })(), 'zoom prop missing / default / range wrong')
  check('B1 mode union includes video', bgConfig.BG_MODES.includes('video') && bgConfig.BG_MODES.includes('off')
    && bgConfig.BG_MODES.length === 5)
  for (const fit of bgConfig.BG_FITS) {
    if (!schemaJson.includes(`"${fit}"`)) {
      check(`B1 fit enum member ${fit} in schema`, false)
      failures += 1
    }
  }
  check('B1 fit enum 5 members + textScheme enum 3 members', bgConfig.BG_FITS.length === 5 && bgConfig.BG_TEXT_SCHEMES.length === 3)
  check('B1 textScheme members in schema', bgConfig.BG_TEXT_SCHEMES.every((s) => schemaJson.includes(`"${s}"`)))
  check('B1 defaults derive from config (defaultTextScheme=auto, loop=true)', schemaJson.includes('"auto"') && schemaJson.includes('"cover"'))
  check('B1 volume field default 1 (v0.4)', (() => {
    const parsed = JSON.parse(schemaJson)
    const dictOwner = Object.values(parsed.refs ?? {}).find((ref) => ref !== null && typeof ref === 'object'
      && typeof ref.dict === 'object' && typeof ref.dict.volume === 'number')
    const volRef = dictOwner ? parsed.refs?.[dictOwner.dict.volume] : undefined
    return volRef?.type === 'number' && volRef?.meta?.default === 1
  })(), 'volume prop missing or default ≠ 1')
  // custom cfg changes the baked default
  const customCfg = { ...cfgDefaults, defaultFit: 'contain', defaultTextScheme: 'dark', defaultLoop: false }
  const customSchemaJson = JSON.stringify(bgSettings.buildBgSectionSchema(customCfg).toJSON())
  check('B1 schema defaults follow config override', customSchemaJson.includes('"contain"') && customSchemaJson.includes('"dark"'))
  check('B1 read-only mirror field names equal runtime field names (UI reads via doc)',
    typeof bgSettings.BG_NAMESPACE === 'string' && bgSettings.BG_NAMESPACE === 'dsh-bg-new')

  // ---- bg_apply validation (executeBgApply pure core) ----
  const imgUrlState = tool.executeBgApply({ mode: 'image', value: 'https://example.com/a.jpg' }, cfgDefaults)
  check('B2 image http(s) URL passes through', imgUrlState.mode === 'image' && imgUrlState.value === 'https://example.com/a.jpg' && imgUrlState.mediaKey === '')
  const vidUrlState = tool.executeBgApply({ mode: 'video', value: 'https://example.com/b.mp4' }, cfgDefaults)
  check('B2 video http(s) URL passes through (no mediaKey)', vidUrlState.mode === 'video' && vidUrlState.mediaKey === '')
  let rejectedUrl = null
  try { tool.executeBgApply({ mode: 'image', value: '/etc/passwd' }, cfgDefaults) } catch (e) { rejectedUrl = e?.message ?? String(e) }
  check('B2 non-http image URL rejected with hint', typeof rejectedUrl === 'string' && rejectedUrl.includes('http://'))
  // fit / textScheme enums accepted + persisted; invalid rejected
  const fitState = tool.executeBgApply({ mode: 'color', value: '#123456', fit: 'contain', textScheme: 'dark' }, cfgDefaults)
  check('B2 fit/textScheme accepted and persisted', fitState.fit === 'contain' && fitState.textScheme === 'dark')
  let badFit = null
  try { tool.executeBgApply({ mode: 'color', value: '#123456', fit: 'zoom' }, cfgDefaults) } catch (e) { badFit = e?.message ?? String(e) }
  check('B2 invalid fit rejected', typeof badFit === 'string' && badFit.includes('fit 需是'))
  let badScheme = null
  try { tool.executeBgApply({ mode: 'color', value: '#123456', textScheme: 'blue' }, cfgDefaults) } catch (e) { badScheme = e?.message ?? String(e) }
  check('B2 invalid textScheme rejected', typeof badScheme === 'string' && badScheme.includes('textScheme 需是'))
  // v0.4: off = full namespace reset (every runtime field back to default)
  const offState = tool.executeBgApply({ mode: 'off' }, cfgDefaults)
  check('B2 off clears value + mediaKey', offState.mode === 'off' && offState.value === '' && offState.mediaKey === '')
  check('B2 off resets fit/textScheme/loop/opacity/pos/volume to defaults',
    offState.fit === cfgDefaults.defaultFit && offState.textScheme === cfgDefaults.defaultTextScheme
      && offState.loop === cfgDefaults.defaultLoop && offState.opacity === 1
      && offState.posX === 50 && offState.posY === 50 && offState.volume === 1)
  const offWithArgs = tool.executeBgApply({ mode: 'off', fit: 'contain' }, cfgDefaults)
  check('B2 off ignores leftover args (fit back to config default)',
    offWithArgs.fit === cfgDefaults.defaultFit && offWithArgs.opacity === 1 && offWithArgs.posX === 50)
  // v0.3.1: opacity (0..1 fraction or 0..100 percent) + posX/posY (0..100)
  const opState = tool.executeBgApply({ mode: 'video', value: 'https://example.com/b.mp4', opacity: 0.6, posX: 20, posY: 80 }, cfgDefaults)
  check('B2 opacity fraction + posX/posY pass through and persist',
    opState.opacity === 0.6 && opState.posX === 20 && opState.posY === 80)
  const opPctNum = tool.executeBgApply({ mode: 'image', value: 'https://example.com/c.jpg', opacity: 60 }, cfgDefaults)
  const opPctStr = tool.executeBgApply({ mode: 'image', value: 'https://example.com/c.jpg', opacity: '60' }, cfgDefaults)
  check('B2 opacity percent form (60 / "60") → 0.6', opPctNum.opacity === 0.6 && opPctStr.opacity === 0.6)
  const opSnapped = tool.executeBgApply({ mode: 'image', value: 'https://example.com/c.jpg', opacity: 0.33 }, cfgDefaults)
  check('B2 opacity snapped to 0.05 step (0.33 → 0.35)', opSnapped.opacity === 0.35, `opacity=${opSnapped.opacity}`)
  let badOpacity = null
  try { tool.executeBgApply({ mode: 'image', value: 'https://example.com/c.jpg', opacity: 150 }, cfgDefaults) } catch (e) { badOpacity = e?.message ?? String(e) }
  check('B2 opacity out of 0..100 rejected with hint', typeof badOpacity === 'string' && badOpacity.includes('opacity'))
  let badPos = null
  try { tool.executeBgApply({ mode: 'image', value: 'https://example.com/c.jpg', posY: 101 }, cfgDefaults) } catch (e) { badPos = e?.message ?? String(e) }
  check('B2 posY out of 0..100 rejected with hint', typeof badPos === 'string' && badPos.includes('posY'))
  const plainState = tool.executeBgApply({ mode: 'image', value: 'https://example.com/c.jpg' }, cfgDefaults)
  check('B2 omitted opacity/pos stay absent (no undefined pollution)',
    plainState.opacity === undefined && plainState.posX === undefined && plainState.posY === undefined)
  // v0.4.3 scale（自由缩放）：倍数/百分数两种写法 + 吸附 0.05 + 越界拒绝
  const scaleNum = tool.executeBgApply({ mode: 'image', value: 'https://example.com/c.jpg', scale: 1.5 }, cfgDefaults)
  const scalePct = tool.executeBgApply({ mode: 'image', value: 'https://example.com/c.jpg', scale: '150%' }, cfgDefaults)
  check('B2 scale factor + percent form (1.5 / "150%") → 1.5',
    scaleNum.scale === 1.5 && scalePct.scale === 1.5, JSON.stringify({ a: scaleNum.scale, b: scalePct.scale }))
  const scaleSnapped = tool.executeBgApply({ mode: 'image', value: 'https://example.com/c.jpg', scale: 1.23 }, cfgDefaults)
  check('B2 scale snapped to 0.05 step (1.23 → 1.25)', scaleSnapped.scale === 1.25, `scale=${scaleSnapped.scale}`)
  let badScale = null
  try { tool.executeBgApply({ mode: 'image', value: 'https://example.com/c.jpg', scale: 0.1 }, cfgDefaults) } catch (e) { badScale = e?.message ?? String(e) }
  check('B2 scale out of 0.25..4 rejected with hint', typeof badScale === 'string' && badScale.includes('scale'))
  const offScale = tool.executeBgApply({ mode: 'off' }, cfgDefaults)
  check('B2 mode=off resets scale to 1 (full reset)', offScale.scale === 1 && offScale.posX === 50 && offScale.opacity === 1)

  // v0.5.0 zoom（放大聚焦 1..3）：倍数/百分数两种写法 + 吸附 0.05 + 越界拒绝 + off 回默认
  const zoomNum = tool.executeBgApply({ mode: 'image', value: 'https://example.com/c.jpg', zoom: 2 }, cfgDefaults)
  const zoomPct = tool.executeBgApply({ mode: 'image', value: 'https://example.com/c.jpg', zoom: '200%' }, cfgDefaults)
  const zoomPctNum = tool.executeBgApply({ mode: 'image', value: 'https://example.com/c.jpg', zoom: 250 }, cfgDefaults)
  check('B2 zoom 倍数/百分数写法（2 / "200%" / 250）→ 2 / 2 / 2.5',
    zoomNum.zoom === 2 && zoomPct.zoom === 2 && zoomPctNum.zoom === 2.5,
    JSON.stringify({ a: zoomNum.zoom, b: zoomPct.zoom, c: zoomPctNum.zoom }))
  const zoomSnapped = tool.executeBgApply({ mode: 'video', value: 'https://example.com/b.mp4', zoom: 1.23 }, cfgDefaults)
  check('B2 zoom snapped to 0.05 step (1.23 → 1.25)', zoomSnapped.zoom === 1.25, `zoom=${zoomSnapped.zoom}`)
  let badZoomLow = null
  try { tool.executeBgApply({ mode: 'image', value: 'https://example.com/c.jpg', zoom: 0.5 }, cfgDefaults) } catch (e) { badZoomLow = e?.message ?? String(e) }
  check('B2 zoom 下限拒绝（0.5 < 1；缩小请用 scale）', typeof badZoomLow === 'string' && badZoomLow.includes('zoom') && badZoomLow.includes('scale'), String(badZoomLow))
  let badZoomHigh = null
  try { tool.executeBgApply({ mode: 'image', value: 'https://example.com/c.jpg', zoom: 400 }, cfgDefaults) } catch (e) { badZoomHigh = e?.message ?? String(e) }
  check('B2 zoom 上限拒绝（400% > 300%）', typeof badZoomHigh === 'string' && badZoomHigh.includes('zoom'), String(badZoomHigh))
  const offZoom = tool.executeBgApply({ mode: 'off' }, cfgDefaults)
  check('B2 mode=off resets zoom to 1 (full reset)', offZoom.zoom === 1 && offZoom.scale === 1)
  const plainZoom = tool.executeBgApply({ mode: 'image', value: 'https://example.com/c.jpg' }, cfgDefaults)
  check('B2 未给 zoom 时不写入 zoom 字段（无 undefined 污染）', plainZoom.zoom === undefined)

  // v0.6.0 glass（毛玻璃质感）：布尔 + 字符串真值 + off 回默认 false
  const glassTrue = tool.executeBgApply({ mode: 'image', value: 'https://example.com/c.jpg', glass: true }, cfgDefaults)
  check('B2 glass:true 通过并持久化', glassTrue.glass === true)
  const glassStr = tool.executeBgApply({ mode: 'image', value: 'https://example.com/c.jpg', glass: 'true' }, cfgDefaults)
  check('B2 glass 字符串 "true" 归一为 true', glassStr.glass === true)
  const glassOff = tool.executeBgApply({ mode: 'off' }, cfgDefaults)
  check('B2 mode=off resets glass to false', glassOff.glass === false)
  const plainGlass = tool.executeBgApply({ mode: 'image', value: 'https://example.com/c.jpg' }, cfgDefaults)
  check('B2 未给 glass 时不写入 glass 字段', plainGlass.glass === undefined)
  let badGlass = null
  try { tool.executeBgApply({ mode: 'image', value: 'https://example.com/c.jpg', glass: 'maybe' }, cfgDefaults) } catch (e) { badGlass = e?.message ?? String(e) }
  check('B2 glass 非法值拒绝并提示布尔', typeof badGlass === 'string' && badGlass.includes('glass'))

  // v0.6.0（需求 3）：跨类型 URL 校验 —— 图片栏不收视频链接，反之亦然
  check('B1 urlExtOf / mediaUrlKindConflict 纯函数（client 与 tool 共用一份判断）', (() => {
    const cfg = { imageExt: cfgDefaults.imageExt, videoExt: cfgDefaults.videoExt }
    return bgConfig.urlExtOf('https://x/y/z.MP4?t=1') === 'mp4'
      && bgConfig.urlExtOf('https://x/y/noext') === ''
      && bgConfig.urlExtOf('https://x/y/') === ''
      && bgConfig.mediaUrlKindConflict('https://x/a.mp4', 'image', cfg) === 'is-video'
      && bgConfig.mediaUrlKindConflict('https://x/a.jpg', 'video', cfg) === 'is-image'
      && bgConfig.mediaUrlKindConflict('https://x/a.jpg', 'image', cfg) === 'ok'
      && bgConfig.mediaUrlKindConflict('https://x/a', 'image', cfg) === 'ok'
  })())
  let imgGotVideo = null
  try { tool.executeBgApply({ mode: 'image', value: 'https://cdn.example.com/clip.mp4' }, cfgDefaults) } catch (e) { imgGotVideo = e?.message ?? String(e) }
  check('B2 image 模式拒绝视频链接（.mp4）', typeof imgGotVideo === 'string' && imgGotVideo.includes('视频链接'), String(imgGotVideo))
  let vidGotImage = null
  try { tool.executeBgApply({ mode: 'video', value: 'https://cdn.example.com/pic.jpg' }, cfgDefaults) } catch (e) { vidGotImage = e?.message ?? String(e) }
  check('B2 video 模式拒绝图片链接（.jpg）', typeof vidGotImage === 'string' && vidGotImage.includes('图片链接'), String(vidGotImage))
  const noExtUrl = tool.executeBgApply({ mode: 'image', value: 'https://cdn.example.com/image?id=42' }, cfgDefaults)
  check('B2 无扩展名动态地址放行（无法判定 ≠ 非法）', noExtUrl.mode === 'image')
  const queryUrl = tool.executeBgApply({ mode: 'image', value: 'https://cdn.example.com/a.jpg?w=1' }, cfgDefaults)
  check('B2 带 query 的图片地址放行（扩展名取自 path）', queryUrl.mode === 'image')
  check('bg-config exposes BG_CSS_SAFE (client 渐变载荷与 tool 同一份字符集白名单)',
    bgConfig.BG_CSS_SAFE instanceof RegExp && bgConfig.BG_CSS_SAFE.test('linear-gradient(135deg, #fff, #000)')
      && !bgConfig.BG_CSS_SAFE.test('linear-gradient(#fff); body{display:none}'))

  // local fixtures in a temp dir
  const tmp = mkdtempSync(join(tmpdir(), 'dsh-bg-new-verify-'))
  try {
    const mp4 = join(tmp, 'sample.mp4')
    const png = join(tmp, 'pic.png')
    const txt = join(tmp, 'notes.txt')
    writeFileSync(mp4, Buffer.from('fake-mp4-bytes'))
    writeFileSync(png, Buffer.from('fake-png-bytes'))
    writeFileSync(txt, 'hi')
    const localVid = tool.executeBgApply({ mode: 'video', file: mp4 }, cfgDefaults)
    check('B2 local video keeps path as value', localVid.mode === 'video' && localVid.value === mp4)
    check('B2 local video generates mediaKey (uuid)', typeof localVid.mediaKey === 'string'
      && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(localVid.mediaKey),
      String(localVid.mediaKey))
    // v0.4: local image is registered (path + mediaKey), NOT inlined as data URI
    const localImg = tool.executeBgApply({ mode: 'image', file: png }, cfgDefaults)
    check('B2 local image no longer inlines data URI (registered path + mediaKey)',
      localImg.mode === 'image' && localImg.value === png
        && typeof localImg.mediaKey === 'string' && localImg.mediaKey !== ''
        && !localImg.value.startsWith('data:'), `mediaKey=${localImg.mediaKey}`)
    let badExt = null
    try { tool.executeBgApply({ mode: 'video', file: txt }, cfgDefaults) } catch (e) { badExt = e?.message ?? String(e) }
    check('B2 rejected video ext names allowed formats', typeof badExt === 'string' && badExt.includes('mp4')
      && badExt.includes('webm') && badExt.includes('bg_apply'))
    let badImgExt = null
    try { tool.executeBgApply({ mode: 'image', file: txt }, cfgDefaults) } catch (e) { badImgExt = e?.message ?? String(e) }
    check('B2 rejected image ext names allowed formats', typeof badImgExt === 'string' && badImgExt.includes('png'))
    // custom cfg changes allowed extension table
    const customExtCfg = { ...cfgDefaults, imageExt: ['webp'] }
    let customReject = null
    try { tool.executeBgApply({ mode: 'image', file: png }, customExtCfg) } catch (e) { customReject = e?.message ?? String(e) }
    check('B2 validation uses config extension table (png now rejected)', typeof customReject === 'string' && customReject.includes('webp'))
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }

  // ---- media route Range contract (pure parser) ----
  const range = mediaModule?.parseByteRange
  if (typeof range === 'function') {
    const full = range('bytes=0-499', 1000)
    check('B4 range bytes=0-499', full?.start === 0 && full?.end === 499)
    const open = range('bytes=500-', 1000)
    check('B4 open-ended range bytes=500-', open?.start === 500 && open?.end === 999)
    const suffix = range('bytes=-200', 1000)
    check('B4 suffix range bytes=-200 (last 200)', suffix?.start === 800 && suffix?.end === 999)
    const single = range('bytes=0-0', 1)
    check('B4 single-byte range', single?.start === 0 && single?.end === 0)
    check('B4 unsatisfiable start>=size → 416', range('bytes=1000-', 1000) === 'unsatisfiable')
    check('B4 malformed range → invalid', range('bytes=abc', 1000) === 'invalid' && range('bytes=-', 1000) === 'invalid')
    check('B4 multi-range syntax rejected (single segment only)', range('bytes=0-1,3-4', 1000) === 'invalid')
    check('B4 zero-byte file suffix → unsatisfiable', range('bytes=-1', 0) === 'unsatisfiable')
  } else {
    check('B4 parseByteRange exported from media.ts', false)
    failures += 1
  }

  // ---- v0.4 media upload: validate / store / resolve (temp $DSH_HOME) ----
  {
    const prevHome = process.env.DSH_HOME
    const upHome = mkdtempSync(join(tmpdir(), 'dsh-bg-new-media-'))
    try {
      process.env.DSH_HOME = upHome
      hostConfig?.resetBgConfigCache?.()
      const valid = mediaModule.validateUpload('image', 'png', 1024, cfgDefaults)
      check('B6 upload: kind=image ext=png small → ok', valid.ok === true && valid.limitBytes === 10 * 1024 * 1024, JSON.stringify(valid))
      const videoValid = mediaModule.validateUpload('video', 'mp4', 1, cfgDefaults)
      check('B6 upload: kind=video ext=mp4 → ok', videoValid.ok === true, JSON.stringify(videoValid))
      const badKind = mediaModule.validateUpload('audio', 'mp3', 1, cfgDefaults)
      check('B6 upload: unknown kind → 400 Chinese hint', badKind.ok === false && badKind.status === 400
        && badKind.message.includes('kind'), JSON.stringify(badKind))
      const badExt = mediaModule.validateUpload('image', 'exe', 1, cfgDefaults)
      check('B6 upload: unsupported ext → 400 with allowed list', badExt.ok === false && badExt.status === 400
        && badExt.message.includes('png') && badExt.message.includes('允许'), JSON.stringify(badExt))
      const badExtParam = mediaModule.validateUpload('image', 'p n g', 1, cfgDefaults)
      check('B6 upload: malformed ext param → 400', badExtParam.ok === false && badExtParam.status === 400
        && badExtParam.message.includes('ext'), JSON.stringify(badExtParam))
      const over = mediaModule.validateUpload('image', 'png', 11 * 1024 * 1024, cfgDefaults)
      check('B6 upload: over image limit → 400 Chinese hint', over.ok === false && over.status === 400
        && over.message.includes('上限') && over.message.includes('10MB'), JSON.stringify(over))
      const overVideo = mediaModule.validateUpload('video', 'mp4', 501 * 1024 * 1024, cfgDefaults)
      check('B6 upload: 视频不设体积上限（需求 4：501MB 也放行）',
        overVideo.ok === true && overVideo.limitBytes === Number.MAX_SAFE_INTEGER, JSON.stringify(overVideo))
      const hugeVideo = mediaModule.validateUpload('video', 'mp4', 80 * 1024 * 1024 * 1024, cfgDefaults)
      check('B6 upload: 视频超大体积同样放行（80GB）', hugeVideo.ok === true, JSON.stringify(hugeVideo))
      const customCfgLimit = { ...cfgDefaults, maxImageMB: 1 }
      const overCustom = mediaModule.validateUpload('image', 'png', 2 * 1024 * 1024, customCfgLimit)
      check('B6 upload: limit follows config', overCustom.ok === false && overCustom.message.includes('1MB'), JSON.stringify(overCustom))

      // store + resolve round-trip (real fs against temp DSH_HOME)
      const mediaKey = mediaModule.storeUploadBuffer('png', Buffer.from('PNGDATA-0123'))
      check('B6 store upload returns uuid mediaKey', typeof mediaKey === 'string' && mediaKey.length === 36, String(mediaKey))
      const resolved = mediaModule.resolveMediaFilePath(mediaKey)
      check('B6 resolve mediaKey finds stored file', typeof resolved === 'string' && resolved.endsWith(`${mediaKey}.png`), String(resolved))
      if (typeof resolved === 'string') {
        const bytes = readFileSync(resolved)
        check('B6 GET-back content identical (read back what was stored)',
          Buffer.from('PNGDATA-0123').equals(bytes) && bytes.length === 12, bytes.toString('utf8'))
        const entries = readdirSync(mediaModule.mediaDirPath())
        check('B6 media dir contains exactly the uploaded file', entries.length === 1 && entries[0] === `${mediaKey}.png`, entries.join(','))
      }
      check('B6 resolve unknown key → null', mediaModule.resolveMediaFilePath('nope-unknown-key') === null)
      check('B6 resolve traversal-ish key rejected', mediaModule.resolveMediaFilePath('../evil') === null)

      // legacy absolute-path mode (bg_apply file): GET falls back to state mediaKey
      const stateDir = join(upHome, 'dsh-bg-new')
      writeFileSync(join(stateDir, 'config.json'), '{}')
      writeFileSync(join(upHome, 'legacy.mp4'), Buffer.from('legacy-video-bytes'))
      writeFileSync(join(stateDir, 'state.json'), JSON.stringify({
        mode: 'video', value: join(upHome, 'legacy.mp4'), mediaKey: 'k-legacy', updatedAt: '',
      }))
      const legacyResolved = mediaModule.resolveMediaFilePath('k-legacy')
      check('B6 legacy state path fallback resolves (bg_apply absolutePath compat)',
        typeof legacyResolved === 'string' && legacyResolved === join(upHome, 'legacy.mp4'), String(legacyResolved))
      check('B6 legacy key mismatch → null', mediaModule.resolveMediaFilePath('k-other') === null)
    } finally {
      if (prevHome === undefined) delete process.env.DSH_HOME
      else process.env.DSH_HOME = prevHome
      hostConfig?.resetBgConfigCache?.()
      rmSync(upHome, { recursive: true, force: true })
    }
  }

  // ---- v0.4 single renderer: style.ts no-op + index.ts no style nesting ----
  {
    const indexSrc = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8')
    const styleSrc = readFileSync(new URL('../src/style.ts', import.meta.url), 'utf8')
    // 只看 loader 挂载体（import 区与文件头注释可能提到 style，忽略）
    const indexApply = indexSrc.slice(indexSrc.indexOf('export function apply'))
    check('B7 index.ts no longer nests style plugin (single media/tool loader)',
      !indexApply.includes('style'), 'style plugin still mounted in index.apply()')
    check('B7 index.ts no longer mounts the v0.5.0 panel route (独立窗口已移除)',
      !indexApply.includes('panelPlugin'), 'panel plugin still mounted')
    // 只看 style.ts 的 apply 函数体：必须是 no-op（无 ctx/事件/注入）
    const styleBody = styleSrc.slice(styleSrc.indexOf('export function apply'), styleSrc.lastIndexOf('}'))
    check('B7 style.ts apply() is a no-op (no index-inject listener)',
      !styleBody.includes('ctx.') && !styleBody.includes('webserver'), 'apply() still touches ctx/webServer')
    check('B7 style.ts no longer emits body media CSS',
      !/function buildBackgroundCss/.test(styleSrc) && !styleSrc.includes('readBgState'))
  }

  // B8) v0.5.0 独立设置窗口已整体移除（panel.ts 删除、bg-settings 的
  // BG_PANEL_WRITABLE_FIELDS / validateBgFieldPatch / writeBgFields /
  // bgPanelStateSnapshot 一并删除）—— 相关断言随之下线。

  // ---- host config.json read: default / override / broken ----
  const prevDshHome = process.env.DSH_HOME
  const { mkdirSync } = await import('node:fs')
  const tmpHome = mkdtempSync(join(tmpdir(), 'dsh-bg-new-home-'))
  const writeHomeConfig = (sub, content) => {
    const dir = join(tmpHome, sub, 'dsh-bg-new')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'config.json'), content)
  }
  try {
    // 1) empty home → defaults, no warnings
    process.env.DSH_HOME = join(tmpHome, 'empty')
    hostConfig.resetBgConfigCache()
    const noFile = hostConfig.loadBgConfig(true)
    check('B3 no config.json → built-in defaults, no warnings', noFile.source === 'default' && noFile.warnings.length === 0
      && noFile.config.maxImageMB === 10 && noFile.config.videoExt.join('/') === 'mp4/webm/ogg/ogv/mov/m4v')
    // 2) override file honored
    writeHomeConfig('override', JSON.stringify({
      imageExt: ['avif'], videoExt: ['webm'], maxImageMB: 3, maxVideoMB: 9,
      defaultFit: 'center', defaultTextScheme: 'dark', defaultLoop: false,
    }))
    process.env.DSH_HOME = join(tmpHome, 'override')
    hostConfig.resetBgConfigCache()
    const overriddenFile = hostConfig.loadBgConfig(true)
    check('B3 config.json override read from $DSH_HOME', overriddenFile.source === 'file' && overriddenFile.warnings.length === 0
      && overriddenFile.config.imageExt.join('/') === 'avif' && overriddenFile.config.maxImageMB === 3
      && overriddenFile.config.maxVideoMB === 9 && overriddenFile.config.defaultFit === 'center'
      && overriddenFile.config.defaultTextScheme === 'dark' && overriddenFile.config.defaultLoop === false)
    // 3) broken JSON → defaults + warning
    writeHomeConfig('broken', '{not json')
    process.env.DSH_HOME = join(tmpHome, 'broken')
    hostConfig.resetBgConfigCache()
    const broken = hostConfig.loadBgConfig(true)
    check('B3 broken config.json → defaults with logged warning', broken.source === 'default' && broken.warnings.length >= 1
      && broken.config.defaultLoop === true)
    // 4) invalid fields inside a valid file → per-field fallback + issues
    writeHomeConfig('partial', JSON.stringify({ maxImageMB: 'huge', defaultFit: 'zoom', imageExt: 'png' }))
    process.env.DSH_HOME = join(tmpHome, 'partial')
    hostConfig.resetBgConfigCache()
    const partial = hostConfig.loadBgConfig(true)
    check('B3 invalid config fields fall back with issues', partial.source === 'file' && partial.config.maxImageMB === 10
      && partial.config.defaultFit === 'cover' && partial.config.imageExt.join('/') === cfgDefaults.imageExt.join('/')
      && partial.warnings.length >= 3)
  } finally {
    if (prevDshHome === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = prevDshHome
    hostConfig?.resetBgConfigCache?.()
    rmSync(tmpHome, { recursive: true, force: true })
  }

  // ---- v0.6.0 更名兼容：数据目录 dsh-bg-new ← 老目录 dsh-bg-switch ----
  {
    const prevRenameHome = process.env.DSH_HOME
    const renameHome = mkdtempSync(join(tmpdir(), 'dsh-bg-new-rename-'))
    try {
      process.env.DSH_HOME = renameHome
      hostConfig.resetBgConfigCache()
      const legacyDir = join(renameHome, 'dsh-bg-switch')
      const newDir = join(renameHome, 'dsh-bg-new')
      mkdirSync(legacyDir, { recursive: true })
      check('B9 只有老目录 → 继续用老目录（改名不丢已有壁纸/媒体）',
        stateModule.bgHomeDir() === legacyDir
          && hostConfig.bgConfigPath() === join(legacyDir, 'config.json')
          && mediaModule.mediaDirPath() === join(legacyDir, 'media'),
        stateModule.bgHomeDir())
      // v0.7.0：回退链变成 dsh-bg-new → dsh-bg（v0.6.0）→ dsh-bg-switch（最早），
      // 两个老目录同时存在时必须用更近的那个，而不是最早的。
      const midDir = join(renameHome, 'dsh-bg')
      mkdirSync(midDir, { recursive: true })
      check('B9 两个老目录同时存在 → 用更近的 dsh-bg（不是最早的 dsh-bg-switch）',
        stateModule.bgHomeDir() === midDir
          && hostConfig.bgConfigPath() === join(midDir, 'config.json')
          && mediaModule.mediaDirPath() === join(midDir, 'media'),
        stateModule.bgHomeDir())
      mkdirSync(newDir, { recursive: true })
      check('B9 新目录出现后 → 切到新目录',
        stateModule.bgHomeDir() === newDir && hostConfig.bgConfigPath() === join(newDir, 'config.json'))
      const emptyHome = join(renameHome, 'fresh')
      mkdirSync(emptyHome, { recursive: true })
      process.env.DSH_HOME = emptyHome
      check('B9 全新安装（两个目录都没有）→ 用新目录名 dsh-bg-new',
        stateModule.bgHomeDir() === join(emptyHome, 'dsh-bg-new'))
    } finally {
      if (prevRenameHome === undefined) delete process.env.DSH_HOME
      else process.env.DSH_HOME = prevRenameHome
      hostConfig?.resetBgConfigCache?.()
      rmSync(renameHome, { recursive: true, force: true })
    }
  }

  // ---- v0.7.0 更名兼容：settings 命名空间 dsh-bg-new ← 老命名空间 dsh-bg ----
  //
  // 真实现的判据是 SettingsDescriptor.user（命名空间的**原始 user 层**）：
  // 字段出现在 user 里 = 用户覆盖过它，所以能区分"没写过"与"写成了默认值"。
  // 假 provider 只要照这个形状提供 documentPath / register / describe 即可。
  {
    const prevNsHome = process.env.DSH_HOME
    const nsHome = mkdtempSync(join(tmpdir(), 'dsh-bg-new-ns-'))
    const docPath = join(nsHome, 'settings.yaml')
    try {
      process.env.DSH_HOME = nsHome
      hostConfig.resetBgConfigCache()

      const makeNsCase = (documentText, legacyUser, newUser) => {
        writeFileSync(docPath, documentText, 'utf8')
        const registrations = []
        const updates = []
        const document = {}
        if (legacyUser !== undefined) document['dsh-bg'] = legacyUser
        if (newUser !== undefined) document['dsh-bg-new'] = newUser
        const provider = {
          documentPath: docPath,
          register(ns) {
            if (registrations.includes(ns)) throw new Error(`settings namespace "${ns}" is already registered`)
            registrations.push(ns)
            return {
              get: () => document[ns] ?? {},
              watch: () => () => {},
              update: (patch) => {
                updates.push([ns, patch])
                document[ns] = { ...document[ns], ...patch }
                return Promise.resolve()
              },
              replace: (section) => { document[ns] = section; return Promise.resolve() },
            }
          },
          describe: () => registrations.map((ns) => ({
            ns,
            ...document[ns] === undefined ? {} : { user: document[ns] },
          })),
        }
        const logs = []
        const settingsCtx = {
          settings: provider,
          logger: { info: (m) => logs.push(['info', m]), warn: (m) => logs.push(['warn', m]) },
          effect: (cb) => { const d = cb(); return typeof d === 'function' ? d : () => {} },
        }
        const ctx = {
          logger: settingsCtx.logger,
          inject: (_deps, cb) => { cb(settingsCtx); return () => {} },
          effect: () => () => {},
        }
        return { ctx, registrations, updates, logs }
      }
      const settle = () => new Promise((resolve) => setImmediate(resolve))

      // (1) 老命名空间有用户值、新命名空间从没被写过 → 继承过来
      const c1 = makeNsCase(
        'dsh-bg:\n  mode: gradient\n',
        { mode: 'gradient', value: 'linear-gradient(135deg,#1e2a78,#2b1055)', opacity: 0.45, posX: 33.4 },
        undefined,
      )
      const dispose1 = bgSettings.installBgNamespace(c1.ctx)
      await settle()
      check('B10 老命名空间有值 + 新命名空间空 → 一次性继承（背景不丢）',
        c1.registrations.join(',') === 'dsh-bg-new,dsh-bg'
          && c1.updates.length === 1
          && c1.updates[0][0] === 'dsh-bg-new'
          && c1.updates[0][1].mode === 'gradient'
          && c1.updates[0][1].opacity === 0.45
          && c1.updates[0][1].posX === 33.4,
        JSON.stringify(c1.updates))
      dispose1()

      // (2) 新命名空间已经被写过 → 老值绝不覆盖用户在当前版本里的改动
      const c2 = makeNsCase(
        'dsh-bg:\n  mode: gradient\n',
        { mode: 'gradient', value: 'linear-gradient(135deg,#1e2a78,#2b1055)' },
        { mode: 'color', value: '#123456' },
      )
      const dispose2 = bgSettings.installBgNamespace(c2.ctx)
      await settle()
      check('B10 新命名空间已写过 → 不继承（用户当前改动优先）',
        c2.updates.length === 0 && c2.registrations.includes('dsh-bg'),
        JSON.stringify(c2.updates))
      dispose2()

      // (3) settings 文档里没有老段落 → 连老命名空间都不注册（全新安装不留痕）
      const c3 = makeNsCase('ui-theme:\n  preference: light\n', undefined, undefined)
      const dispose3 = bgSettings.installBgNamespace(c3.ctx)
      await settle()
      check('B10 settings 文档里没有老段落 → 不注册老命名空间、不写继承',
        c3.registrations.join(',') === 'dsh-bg-new' && c3.updates.length === 0,
        c3.registrations.join(','))
      dispose3()

      // (4) 老 user 层里的未知键被过滤掉（否则整笔 update 会校验失败被拒）
      const c4 = makeNsCase(
        'dsh-bg:\n  mode: color\n',
        { mode: 'color', value: '#0a0a0a', legacyOnlyField: 'x', imageExt: ['png'] },
        undefined,
      )
      const dispose4 = bgSettings.installBgNamespace(c4.ctx)
      await settle()
      const inherited4 = c4.updates[0]?.[1] ?? {}
      check('B10 继承只搬白名单字段（未知键 / 只读镜像字段不进 user 层）',
        inherited4.mode === 'color' && inherited4.value === '#0a0a0a'
          && inherited4.legacyOnlyField === undefined && inherited4.imageExt === undefined,
        JSON.stringify(inherited4))
      dispose4()

      // (5) 老段落存在但用户层是空的（例如只写了默认值后被清空）→ 不写继承
      const c5 = makeNsCase('dsh-bg:\n', undefined, undefined)
      const dispose5 = bgSettings.installBgNamespace(c5.ctx)
      await settle()
      check('B10 老段落存在但 user 层为空 → 不写继承',
        c5.registrations.includes('dsh-bg') && c5.updates.length === 0,
        JSON.stringify(c5.updates))
      dispose5()
    } finally {
      if (prevNsHome === undefined) delete process.env.DSH_HOME
      else process.env.DSH_HOME = prevNsHome
      hostConfig?.resetBgConfigCache?.()
      rmSync(nsHome, { recursive: true, force: true })
    }
  }
}

console.log(failures === 0 ? 'RESULT: ALL PASS' : `RESULT: ${failures} FAILURE(S)`)
process.exit(failures === 0 ? 0 : 1)
