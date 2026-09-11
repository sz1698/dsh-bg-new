/**
 * dsh-bg-new —— **host 半**的构建配置（`src/index.ts` → `lib/index.js`）。
 *
 * 为什么需要它：分发时插件行按包名解析（见 cordis.patch.yml），Node 解析到本包的
 * `exports["."]`，所以 host 半必须有**已构建的 JS 产物**，不能只留 `src/*.ts`。
 *
 * 与 tsdown.config.ts（客户端半）的分工：
 *   - 本文件：ESM / platform node / 入口 src/index.ts → lib/index.js
 *   - tsdown.config.ts：CJS 闭包工厂（window.__ModuleLoader__.load）→ lib/client.js
 * 两个文件互不影响，脚本里分别调用（build:host / build:client）。
 *
 * 外部依赖：`@deepseek-ai/*` 与 `node:*` 一律 **不打进产物**。这些是 peerDependencies
 * ——宿主进程里已经有一份，打进来会出现第二份实例（`@deepseek-ai/schemastery`
 * 尤其致命：settings 服务拿到的 schema 会来自另一个 schemastery 实例）。
 *
 * 这里**刻意不写 `deps` 选项**：tsdown 的默认行为正好就是要的 —— production deps
 * （dependencies + peerDependencies）外置、相对导入内联。实测坑：一旦手写
 * `deps.neverBundle`，相对导入 `./tool.ts` 会**同样被外置**，产物里留下
 * `import "./tool.ts"`（指向未构建的 TS，装进宿主就加载失败）；要纠正还得同时写
 * 互补的 `alwaysBundle` —— 不如直接交给默认值。
 */
import { defineConfig } from 'tsdown'

/** 包名 = module-table 行 id；必须与 package.json 的 name 一致。 */
const PLUGIN_ID = 'dsh-bg-new'

export default defineConfig({
  name: `${PLUGIN_ID}/host`,
  entry: { index: 'src/index.ts' },
  outDir: 'lib',
  format: 'esm',
  platform: 'node',
  target: 'es2022',
  dts: false,
  sourcemap: true,
  clean: false,
  outputOptions: {
    entryFileNames: 'index.js',
    sourcemapExcludeSources: false,
  },
})
