/**
 * 一次性“肉眼核对”脚本（v0.4.4）：把 lib/client.js 跑在迷你假 DOM 里，打印
 * 引擎为某个背景生成的**完整 CSS**，用来人工核对：
 *   - body token 块（文字/表面/按钮族）
 *   - body * 的遮罩重写
 *   - 设置弹窗遮罩置透明
 *   - layer 几何 + 媒体渲染 + 拖动相关规则
 * 用法：node build/dump-css.mjs [mode] [value]
 *   node build/dump-css.mjs color "#0d1117"
 *   node build/dump-css.mjs gradient "linear-gradient(135deg,#1e2a78,#2b1055)"
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import vm from 'node:vm'

const here = dirname(fileURLToPath(import.meta.url))
const code = readFileSync(join(here, '..', 'lib', 'client.js'), 'utf8').replace(/\n\/\/# sourceMappingURL=.*$/, '')

class Node {
  constructor(tag) {
    this.tagName = tag
    this.children = []
    this.parent = null
    this.attrs = {}
    this._text = ''
    this.connected = true
  }
  get textContent() { return this._text }
  set textContent(v) { this._text = String(v) }
  get isConnected() { return this.connected }
  get parentElement() { return this.parent }
  setAttribute(n, v) { this.attrs[n] = String(v) }
  getAttribute(n) { return n in this.attrs ? this.attrs[n] : null }
  removeAttribute(n) { delete this.attrs[n] }
  set id(v) { this.attrs.id = String(v) }
  get id() { return this.attrs.id ?? null }
  append(c) { c.parent = this; c.connected = true; this.children.push(c) }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter((x) => x !== this); this.parent = null; this.connected = false }
  addEventListener() {}
}

const head = new Node('head')
const body = new Node('body')
const document = { head, body, createElement: (t) => new Node(t) }
const sandbox = {
  window: { __ModuleLoader__: { load: (r) => { sandbox.__reg = r } } },
  console, document,
  setTimeout, clearTimeout,
}
vm.createContext(sandbox)
vm.runInContext(code, sandbox)

const mod = sandbox.__reg.factory((s) => {
  if (s === 'react') return { useSyncExternalStore: () => ({}), useState: (v) => [v, () => {}], useEffect: () => {}, useRef: (v) => ({ current: v }) }
  if (s === 'react/jsx-runtime') return { jsx: (_t, p) => p }
  throw new Error(`unexpected require ${s}`)
})

const mode = process.argv[2] ?? 'color'
const value = process.argv[3] ?? '#0d1117'
mod.applyBg(mode, value)
const style = head.children.find((n) => n.getAttribute('id') === 'dsh-bg-new-style')
console.log(`/* ---- ${mode} ${value} ---- */`)
console.log(style.textContent)
