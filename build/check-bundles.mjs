/**
 * 产物契约检查 —— 断言 `lib/` 两侧产物符合 DSH 的加载契约。
 *
 * 为什么单独成文件：CI 与本地必须跑**同一份**代码。以前这条检查写成 CI 里的
 * 内联 `node -e "..."`，结果断言与真实产物格式不符（忘了尾部 sourcemap 注释、
 * 且 `});` 换行方式猜错了），本地又从不执行它 —— 于是长期挂着都没人发现。
 *
 * 契约（依据官方 client bundle 的 closure-factory 格式，见 tsdown.config.ts 头注）：
 *   - 客户端半：`window.__ModuleLoader__.load({ id, factory })` 的 CJS 闭包工厂；
 *   - 宿主半：ESM，导出 `name` 与 `apply`。
 *
 * 用法：`node build/check-bundles.mjs`（退出码 0 = 通过）。
 */
import { readFileSync } from 'node:fs'

const CLIENT = 'lib/client.js'
const HOST = 'lib/index.js'
/** 与本插件标识保持一致（package.json 的 name / cordis.patch.yml 的行 name）。 */
const PLUGIN_ID = 'dsh-bg-new'

let failures = 0
function check(label, ok, detail) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail === undefined ? '' : `  ${detail}`}`)
  if (!ok) failures += 1
}

// ---- 客户端半：闭包工厂契约 ----
let clientRaw
try {
  clientRaw = readFileSync(CLIENT, 'utf8')
} catch (error) {
  check(`读得到 ${CLIENT}`, false, String(error))
  clientRaw = undefined
}

if (clientRaw !== undefined) {
  // 打包器会在结尾追加 `//# sourceMappingURL=client.js.map`，它不是代码的一部分。
  // 先剥掉它再判结尾，否则断言会被一个纯注释行证伪。
  const client = clientRaw.replace(/\n?\/\/# sourceMappingURL=\S*\s*$/, '').trimEnd()
  check(`${CLIENT} 以 loader banner 开头`,
    client.startsWith('window.__ModuleLoader__.load({'),
    JSON.stringify(client.slice(0, 40)))
  check(`${CLIENT} 模块 id 正确`,
    new RegExp(`id:\\s*["']${PLUGIN_ID}["']`).test(client))
  check(`${CLIENT} 声明了 factory 闭包`,
    /factory:\s*\(?\s*require\s*\)?\s*=>/.test(client) || /factory:\s*function/.test(client))
  check(`${CLIENT} 以闭包工厂收尾（return module.exports + });）`,
    /return module\.exports;?\s*\}?\s*\}\s*\);\s*$/.test(client),
    JSON.stringify(client.slice(-60)))
}

// ---- 宿主半：ESM 导出契约 ----
let hostSource
try {
  hostSource = readFileSync(HOST, 'utf8')
} catch (error) {
  check(`读得到 ${HOST}`, false, String(error))
  hostSource = undefined
}

if (hostSource !== undefined) {
  const module = await import(new URL(`../${HOST}`, import.meta.url).href)
  check(`${HOST} 可被裸 Node 加载`, typeof module.apply === 'function')
  check(`${HOST} 导出的插件名正确`, module.name === PLUGIN_ID, String(module.name))
}

console.log(failures === 0 ? 'RESULT: ALL PASS' : `RESULT: ${failures} FAILURE(S)`)
process.exit(failures === 0 ? 0 : 1)
