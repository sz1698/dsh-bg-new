/**
 * 一次性对比度核算（v0.4.4 #2）：把 bg-palette 的两套 token 值解成 RGB，算出
 * 「文字 token × 表面 token」的 WCAG 对比度，确认扩表之后不会出现「白底白字」。
 *
 * 用法：node build/contrast-check.mjs      （exit 0 = 所有关键配对达标）
 * 这不是 verify-client.mjs 的一部分：它只读源码里的字面量做数学，不碰 bundle。
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const src = readFileSync(join(here, '..', 'src', 'client', 'bg-palette.ts'), 'utf8')

/** 从源码里抠出某个 `const NAME: Record<string, string> = { ... }` 的键值。 */
function tokensOf(name) {
  const start = src.indexOf(`const ${name}: Record<string, string> = {`)
  if (start < 0) throw new Error(`palette ${name} not found`)
  const open = src.indexOf('{', start)
  const end = src.indexOf('\n}', open)
  const body = src.slice(open + 1, end)
  const out = {}
  const re = /'([^']+)':\s*'([^']+)'/g
  let m
  while ((m = re.exec(body)) !== null) out[m[1]] = m[2]
  return out
}

function parseColor(value) {
  const v = value.trim()
  const hex = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.exec(v)
  if (hex !== null) {
    const h = hex[1]
    const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
    return { r: parseInt(full.slice(0, 2), 16), g: parseInt(full.slice(2, 4), 16), b: parseInt(full.slice(4, 6), 16), a: 1 }
  }
  const rgb = /^rgba?\(([^)]+)\)$/.exec(v)
  if (rgb !== null) {
    const parts = rgb[1].trim().split(/[\s,/]+/).filter((p) => p !== '')
    const num = (p) => (p.endsWith('%') ? (parseFloat(p) / 100) * 255 : parseFloat(p))
    return {
      r: num(parts[0]), g: num(parts[1]), b: num(parts[2]),
      a: parts.length > 3 ? parseFloat(parts[3]) : 1,
    }
  }
  return null
}

/** alpha 合成到不透明底色上（模拟半透明表面叠在别的面上）。 */
function over(fg, bg) {
  const a = fg.a
  return {
    r: fg.r * a + bg.r * (1 - a),
    g: fg.g * a + bg.g * (1 - a),
    b: fg.b * a + bg.b * (1 - a),
    a: 1,
  }
}

function linear(c8) {
  const c = c8 / 255
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}
function luminance(c) {
  return 0.2126 * linear(c.r) + 0.7152 * linear(c.g) + 0.0722 * linear(c.b)
}
function contrast(a, b) {
  const la = luminance(a)
  const lb = luminance(b)
  const hi = Math.max(la, lb)
  const lo = Math.min(la, lb)
  return (hi + 0.05) / (lo + 0.05)
}

let failures = 0
const check = (name, ratio, min) => {
  const ok = ratio >= min
  if (!ok) failures += 1
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  ratio=${ratio.toFixed(2)} (min ${min})`)
}

/**
 * 核算一套方案：
 * @param label 方案名
 * @param tokens token 表
 * @param panelBase 半透明面板叠在什么底色上（真实壁纸的极端情况：纯黑/纯白）
 */
function verify(label, tokens, panelBase) {
  const t = (name) => {
    const raw = tokens[name]
    if (raw === undefined) throw new Error(`${label}: missing token ${name}`)
    const parsed = parseColor(raw)
    if (parsed === null) throw new Error(`${label}: unparseable ${name}=${raw}`)
    return parsed
  }
  const surfaceOf = (name) => over(t(name), panelBase)

  // 三类文字 × 各自的真实承载面（面板 l2 / 浮层 / 气泡 / 输入框 / 菜单 / 导航选中）
  const pairs = [
    ['label-primary on layer-2 (设置弹窗面板)', '--dsw-alias-label-primary', '--dsw-alias-bg-layer-2', 7],
    ['label-primary on layer-1', '--dsw-alias-label-primary', '--dsw-alias-bg-layer-1', 7],
    ['label-primary on overlay', '--dsw-alias-label-primary', '--dsw-alias-bg-overlay', 7],
    ['label-primary on floating-fill (滚到底部圆钮)', '--dsw-alias-label-primary', '--dsw-alias-button-floating-fill', 7],
    ['label-primary on elevated-fill (新会话)', '--dsw-alias-label-primary', '--dsw-alias-button-elevated-fill', 7],
    ['label-primary on bubble', '--dsw-alias-label-primary', '--dsw-specific-bubble', 7],
    ['label-primary on input-major', '--dsw-alias-label-primary', '--dsw-specific-input-major', 7],
    ['label-primary on menu', '--dsw-alias-label-primary', '--dsw-specific-menu', 7],
    ['label-secondary on layer-2', '--dsw-alias-label-secondary', '--dsw-alias-bg-layer-2', 4.5],
    ['label-secondary on menu', '--dsw-alias-label-secondary', '--dsw-specific-menu', 4.5],
    ['label-tertiary on layer-2', '--dsw-alias-label-tertiary', '--dsw-alias-bg-layer-2', 3.5],
    ['label-caption on overlay', '--dsw-alias-label-caption', '--dsw-alias-bg-overlay', 3.5],
    ['label-dimmed on layer-2', '--dsw-alias-label-dimmed', '--dsw-alias-bg-layer-2', 3],
    ['label-primary-inverted on label-primary (徽标)', '--dsw-alias-label-primary-inverted', '--dsw-alias-label-primary', 7],
    ['brand-text on layer-2', '--dsw-alias-brand-text', '--dsw-alias-bg-layer-2', 7],
  ]
  for (const [name, fg, bg, min] of pairs) {
    check(`${label}: ${name}`, contrast(t(fg), surfaceOf(bg)), min)
  }
  // nav selected/hover 是**淡色 tint**，不是承载文字的内容面 —— 它的对比度取决于
  // 面板自己盖在什么壁纸上（tint 只叠一层很薄的色）。所以单独按非阻断的提示核算：
  // 只要上面的面板面（layer-1/2/overlay/menu）达标，正文就是可读的，tint 只负责
  // “选中”这个视觉状态。
  const navRatio = contrast(t('--dsw-alias-label-primary'), surfaceOf('--dsw-specific-sidebar-nav-item-active'))
  console.log(`${navRatio >= 4.5 ? 'PASS' : 'WARN'}  ${label}: label-primary on nav-active tint  ratio=${navRatio.toFixed(2)}（非阻断：tint 不是内容面）`)
  // bubble-highlight 是「高亮气泡」，必须比普通气泡亮/暗得更明显（不等于文字底色）
  const bubbleBase = luminance(surfaceOf('--dsw-specific-bubble'))
  const highlightBase = luminance(surfaceOf('--dsw-specific-bubble-highlight'))
  const differs = Math.abs(bubbleBase - highlightBase) > 0.004
  if (!differs) failures += 1
  console.log(`${differs ? 'PASS' : 'FAIL'}  ${label}: bubble-highlight 与 bubble 是两个不同亮度的面  Δlum=${Math.abs(bubbleBase - highlightBase).toFixed(4)}`)
}

const light = tokensOf('LIGHT_TEXT_TOKENS')
const dark = tokensOf('DARK_TEXT_TOKENS')

// 键集必须完全一致（两套刻度同键，便于对照维护）
const lk = Object.keys(light).sort()
const dk = Object.keys(dark).sort()
const sameKeys = lk.length === dk.length && lk.join('|') === dk.join('|')
if (!sameKeys) failures += 1
console.log(`${sameKeys ? 'PASS' : 'FAIL'}  light/dark 同键（keys=${lk.length}）`)
const noVar = [...Object.values(light), ...Object.values(dark)].every((v) => !v.includes('var('))
if (!noVar) failures += 1
console.log(`${noVar ? 'PASS' : 'FAIL'}  所有值都是字面量（无 var 自引用）`)

// 半透明面分别叠在极暗、极亮壁纸上核算（真实壁纸两端）
verify('light-text over black wallpaper', light, { r: 0, g: 0, b: 0, a: 1 })
verify('light-text over white wallpaper', light, { r: 255, g: 255, b: 255, a: 1 })
verify('dark-text over black wallpaper', dark, { r: 0, g: 0, b: 0, a: 1 })
verify('dark-text over white wallpaper', dark, { r: 255, g: 255, b: 255, a: 1 })

console.log(`RESULT: ${failures === 0 ? 'ALL PASS' : failures + ' FAILURE(S)'}`)
process.exit(failures === 0 ? 0 : 1)
