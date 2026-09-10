/**
 * Structural + functional verification for dsh-bg-switch v0.4.0.
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
 *     $DSH_HOME/dsh-bg-switch/config.json default/override/broken reads.
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
  append(child) {
    if (child.parent !== null && child.parent !== this) {
      const i = child.parent.children.indexOf(child)
      if (i >= 0) child.parent.children.splice(i, 1)
    }
    child.parent = this
    child.connected = true
    this.children.push(child)
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
  const document = {
    head,
    body,
    createElement: (tag) => new FakeNode(tag),
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
const layerNodes = () => body.children.filter((node) => node.getAttribute('data-dsh-bg-layer') === '')
const styleNodes = () => head.children.filter((node) => node.tagName === 'style' && node.getAttribute('id') === 'dsh-bg-style')
const styleText = () => (styleNodes()[0] ? styleNodes()[0].textContent : '')
const videosIn = () => {
  const layers = layerNodes()
  return layers.length === 0 ? [] : layers[0].children.filter((node) => node.tagName === 'video')
}

check('A1 exactly one registration', registrations.length === 1, `count=${registrations.length}`)
const registration = registrations[0]
check('A1 registration id == "dsh-bg-switch"', registration?.id === 'dsh-bg-switch', JSON.stringify(registration?.id))
check('A1 registration has a factory function', typeof registration?.factory === 'function')
check('A2 bundle opens with loader banner', code.startsWith(banner))
check('A2 bundle closes with }; })', code.trimEnd().endsWith('});'))

const required = []
const moduleExports = registration.factory((specifier) => {
  required.push(specifier)
  if (specifier === 'react') {
    return {
      useSyncExternalStore: () => ({}),
      useState: (v) => [v, () => {}],
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
  'clampBgVolume',
  'bgDefaultConfig', 'bgNormalizeConfig', 'bgLuminance', 'resolveTextScheme',
  'parseCssColor', 'relativeLuminance', 'fitCssFor', 'tokensForTextScheme',
  'REVEAL_TOKENS', 'BG_FITS', 'BG_TEXT_SCHEMES',
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
    && darkTokens['--dsw-alias-bg-layer-1'] === 'rgb(250 251 253 / 0.9)')
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
let localeNs = null
let localeDict = null
let scopeBound = null
let scopeSubscriber = null
const setCalls = []
const mutateCalls = []
const dictionaries = new Map()
let applyCleanup = null
const sectionBox = {
  mode: 'off', value: '', fit: 'cover', textScheme: 'auto', loop: true, mediaKey: '',
  opacity: 1, posX: 50, posY: 50, volume: 1,
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
    register: (options, component) => { registeredOptions = options; registeredComponent = component; return () => {} },
  },
  effect: (fn) => { applyCleanup = fn(); return () => { if (typeof applyCleanup === 'function') applyCleanup() } },
}

moduleExports.apply(fakeCtx)

check('A8 register name/id/order', registeredOptions?.name === 'settings.section' && registeredOptions?.id === 'dsh-bg' && registeredOptions?.order === 500)
const label = typeof registeredOptions?.label === 'function' ? registeredOptions.label() : registeredOptions?.label
check('A8 register label zh == 「背景」', label === '背景', JSON.stringify(label))
check('A8 registered component is BgPanel', registeredComponent === moduleExports.BgPanel)
const injected = typeof registeredOptions?.inject === 'function' ? registeredOptions.inject() : null
check('A8 inject() returns setBg + text', injected != null && typeof injected.setBg === 'function' && typeof injected.text === 'function')
check('A8 locale ns == settings.dsh-bg', localeNs === 'settings.dsh-bg', JSON.stringify(localeNs))
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
check('A8 settingsScope bound namespace == dsh-bg', scopeBound?.namespace === 'dsh-bg', JSON.stringify(scopeBound))
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
  check('A9 local video → mediaKey route src', videos[0]?.getAttribute('src') === '/dsh-bg-media/k-123', String(videos[0]?.getAttribute('src')))
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
    && text.includes('background-image: url("/dsh-bg-media/k-img")'))
}
moduleExports.applyBg('color', '#ffffff')
{
  const text = styleText()
  check('A9 white color → resolved dark-text scheme', text.includes('--dsw-alias-label-primary: #1a1d24 !important')
    && text.includes('--dsw-alias-bg-layer-1: rgb(250 251 253 / 0.9) !important'))
}
moduleExports.applyBg('off', '')
check('A9 off removes layer + style entirely (no residue)', layerNodes().length === 0 && styleNodes().length === 0 && styleText() === '')
check('A9 body kept untouched by pipeline', head.children.every((n) => n.getAttribute('id') !== 'dsh-bg-style') || styleNodes().length === 0)

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
  check('A10 adopt applies external video snapshot', videos.length === 1 && videos[0].getAttribute('src') === '/dsh-bg-media/k-ext')
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
  const expectedDefaults = { mode: 'off', value: '', mediaKey: '', fit: 'cover', textScheme: 'auto', loop: true, opacity: 1, posX: 50, posY: 50, volume: 1 }
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

// ---- v0.4: local upload → POST /dsh-bg-media/upload → mediaKey ----
{
  const cfg = { ...moduleExports.bgDefaultConfig, imageExt: [...moduleExports.bgDefaultConfig.imageExt] }
  lastFetch = null
  fetchOk = true
  fetchPayload = { ok: true, mediaKey: 'k-uploaded' }
  const outcome = await moduleExports.bgUploadLocalFile({ name: 'pic.png', size: 4096 }, 'image', cfg)
  check('A14 upload success returns mediaKey', outcome.ok === true && outcome.mediaKey === 'k-uploaded', JSON.stringify(outcome))
  check('A14 upload POSTs raw file to upload route', lastFetch !== null
    && lastFetch.url === '/dsh-bg-media/upload?kind=image&ext=png'
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
  fetchPayload = { ok: false, message: 'dsh-bg-media: 不支持的图片类型 .png（允许 webp）' }
  const serverBad = await moduleExports.bgUploadLocalFile({ name: 'a.png', size: 10 }, 'image', cfg)
  check('A14 server 400 message surfaced', serverBad.ok === false && typeof serverBad.message === 'string'
    && serverBad.message.includes('dsh-bg-media'), JSON.stringify(serverBad))
  lastFetch = null
  fetchOk = true
  fetchPayload = { ok: true, mediaKey: 'k-uploaded' }
  const vidOutcome = await moduleExports.bgUploadLocalFile({ name: 'clip.mp4', size: 99 }, 'video', cfg)
  check('A14 video upload POSTs with kind=video', lastFetch !== null && lastFetch.url === '/dsh-bg-media/upload?kind=video&ext=mp4'
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
applyCleanup()
check('A12 cleanup restores DOM (no layer/style/video)', layerNodes().length === 0 && styleNodes().length === 0)
check('A12 cleanup leaves body children empty of ours', body.children.length === 0 && head.children.length === 0)

// =====================================================================
// A15) v0.4 single renderer: exactly one self-managed style/layer engine,
//      no duplicate body-level media rules (style.ts host injection stopped)
// =====================================================================
{
  moduleExports.applyBg('gradient', 'linear-gradient(135deg, #1e2a78, #2b1055)')
  const text = styleText()
  check('A15 single <style id=dsh-bg-style> exists', styleNodes().length === 1)
  check('A15 no legacy fixed body background media rules in engine CSS',
    !text.includes('no-repeat fixed'))
  // 去掉所有块注释后再计数：引擎标识常量各只出现一次（单一自管渲染引擎）；
  // 若还有第二套 layer/style 定义（如旧 style.ts 的 body 注入）会暴露出来。
  const codeNoComments = code.replace(/\/\*[\s\S]*?\*\//g, '')
  const layerCount = codeNoComments.split('data-dsh-bg-layer').length - 1
  const styleIdCount = codeNoComments.split('dsh-bg-style').length - 1
  const styleTagCreate = (codeNoComments.match(/createElement\(["']style["']\)/g) ?? []).length
  const videoTagCreate = (codeNoComments.match(/createElement\(["']video["']\)/g) ?? []).length
  check('A15 bundle has exactly one layer attr + one style id + one element factory each',
    layerCount === 1 && styleIdCount === 1 && styleTagCreate === 1 && videoTagCreate === 1,
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
    layerNodes().length === 1 && styleText().includes('background-image: url("/dsh-bg-media/keep-img")'))
  const t1 = setCalls.length
  injected2.setBg('image', 'wall.png', { opacity: 0.5 })
  check('A16 opacity tweak keeps wallpaper on screen (mediaKey intact)',
    styleText().includes('/dsh-bg-media/keep-img') && styleText().includes('opacity: 0.5'))
  flushTimers()
  const w1 = setCalls.slice(t1)
  check('A16 option tweak persists opacity only — no mode/value/mediaKey churn',
    w1.length === 1 && w1[0][0] === 'opacity' && w1[0][1] === 0.5, JSON.stringify(w1))
  await Promise.resolve()

  // (2) 切本地视频 → 远程坏链：必须清旧 mediaKey 并换源尝试（#9）
  moduleExports.applyBg('video', 'local.mp4', { mediaKey: 'old-vid' })
  check('A16 local video first (mediaKey src)',
    videosIn()[0]?.getAttribute('src') === '/dsh-bg-media/old-vid',
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
    opacity: 1, posX: 50, posY: 50, volume: 1,
  }
  const defaultsOk = w4.every(([f, val]) => defaultOf[f] === val)
  check('A16 resetAll persists default-only fields (incl. posX/posY back to 50)',
    defaultsOk && w4.some(([f]) => f === 'mode')
      && w4.some(([f, v]) => f === 'posX' && v === 50) && w4.some(([f, v]) => f === 'posY' && v === 50),
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
try {
  bgConfig = await import(new URL('../src/bg-config.ts', import.meta.url).href)
  bgSettings = await import(new URL('../src/bg-settings.ts', import.meta.url).href)
  tool = await import(new URL('../src/tool.ts', import.meta.url).href)
  hostConfig = await import(new URL('../src/config.ts', import.meta.url).href)
  mediaModule = await import(new URL('../src/media.ts', import.meta.url).href)
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
    'opacity', 'posX', 'posY', 'volume',
    'imageExt', 'videoExt', 'maxImageMB', 'maxVideoMB', 'defaultFit', 'defaultTextScheme', 'defaultLoop']
  const missing = requiredFields.filter((field) => !schemaJson.includes(`"${field}"`))
  check('B1 schema carries all v0.3 + v0.3.1 + v0.4 fields', missing.length === 0, `missing=${missing.join(',') || '-'}`)
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
    typeof bgSettings.BG_NAMESPACE === 'string' && bgSettings.BG_NAMESPACE === 'dsh-bg')

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

  // local fixtures in a temp dir
  const tmp = mkdtempSync(join(tmpdir(), 'dsh-bg-verify-'))
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
    const upHome = mkdtempSync(join(tmpdir(), 'dsh-bg-media-'))
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
      check('B6 upload: over video limit → 400', overVideo.ok === false && overVideo.message.includes('500MB'), JSON.stringify(overVideo))
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
      const stateDir = join(upHome, 'dsh-bg-switch')
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
    // 只看 style.ts 的 apply 函数体：必须是 no-op（无 ctx/事件/注入）
    const styleBody = styleSrc.slice(styleSrc.indexOf('export function apply'), styleSrc.lastIndexOf('}'))
    check('B7 style.ts apply() is a no-op (no index-inject listener)',
      !styleBody.includes('ctx.') && !styleBody.includes('webserver'), 'apply() still touches ctx/webServer')
    check('B7 style.ts no longer emits body media CSS',
      !/function buildBackgroundCss/.test(styleSrc) && !styleSrc.includes('readBgState'))
  }

  // ---- host config.json read: default / override / broken ----
  const prevDshHome = process.env.DSH_HOME
  const { mkdirSync } = await import('node:fs')
  const tmpHome = mkdtempSync(join(tmpdir(), 'dsh-bg-home-'))
  const writeHomeConfig = (sub, content) => {
    const dir = join(tmpHome, sub, 'dsh-bg-switch')
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
}

console.log(failures === 0 ? 'RESULT: ALL PASS' : `RESULT: ${failures} FAILURE(S)`)
process.exit(failures === 0 ? 0 : 1)
