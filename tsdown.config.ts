/**
 * dsh-bg-new 独立复刻版 client bundle 配置 —— 对应官方
 * packages/client/tsdown.client.ts 里 clientConfig(id, entry) 的最小可复刻子集：
 *   - 闭包契约：banner/intro/footer 原样照抄（window.__ModuleLoader__.load）
 *   - externals：客户端基线（PLATFORM_MODULES，值照抄 platform.ts）+ 本包
 *     dsh.client.external（本包未声明 → 空）；其余一切打进 bundle
 *   - format cjs / platform browser，落地 lib/client.js（entryFileNames 固定）
 *   - sourcemap 直接产自 src TS（官方 workspace 里 client 面走 tsc 的
 *     lib/types 链式 map；独立仓库没有 tsc 步骤，入口直接给 src）
 *   - CSS 插件（*.module.css / ?inline / 全局 css + lightningcss）冒烟不涉及，
 *     源码不 import CSS 即不会被触发；后续需要再加
 *
 * 本文件只在独立仓库内生效（tsdown 单包模式，无 workspace 字段）。
 */
import { defineConfig } from 'tsdown'

/** 包名 = module-table 行 id；必须与 package.json 的 name 一致。 */
const PLUGIN_ID = 'dsh-bg-new'

/**
 * Client 基线 externals —— 值直接照抄官方
 * packages/client/web/src/platform.ts 的 PLATFORM_MODULES
 * （PRELOADED_CLIENT_EXTERNALS 为空数组）。
 */
const PLATFORM_MODULES = [
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-store',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-ui-primitives',
] as const

/** 本包请求的 module-table specifiers：基线 + dsh.client.external（无）。 */
const REQUESTED = new Set<string>([...PLATFORM_MODULES])

/** Vendored framework libraries（官方白名单，仅当源码 import 时生效）。 */
const VENDORED_LIBRARY = /^@deepseek-ai\/(cosmokit|schemastery)(\/|$)/

/** Inline-safe wire layers（官方白名单）。 */
const INLINE_SAFE = /^(?:@deepseek-ai\/dsh-(?:file-reference|session|llm|tools|brand|deque|typert-protocol|util-crypto|util-values|util-workspace-path)(?:\/|$)|@deepseek-ai\/dsh-token-meter\/client$|@deepseek-ai\/dsh-agent-presets\/display$)/

export default defineConfig({
  name: `${PLUGIN_ID}/client`,
  entry: { client: 'src/client/index.ts' },
  outDir: 'lib',
  format: 'cjs',
  platform: 'browser',
  target: 'es2024',
  dts: false,
  sourcemap: true,
  clean: false,
  deps: {
    // 基线/请求表内的 specifier 保持外部 require；其余一律内联。
    neverBundle: (specifier: string): boolean => REQUESTED.has(specifier),
    alwaysBundle: (specifier: string): boolean => !REQUESTED.has(specifier),
  },
  inputOptions: {
    resolve: {
      conditionNames: [
        (process.env.NODE_ENV ?? 'production') === 'development' ? 'development' : 'production',
        'browser', 'import', 'module', 'default',
      ],
    },
  },
  // 与官方 clientConfig 相同的 define（zustand 等 node 惯用法依赖；本冒烟
  // 虽用不到，保留以贴近官方产物语义）。
  define: {
    'process.env': '{}',
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'production'),
    'import.meta.env.MODE': JSON.stringify(process.env.NODE_ENV ?? 'production'),
    'import.meta.env': JSON.stringify({ MODE: process.env.NODE_ENV ?? 'production' }),
  },
  plugins: [{
    // Bundle purity gate（官方 dsh-client-bundle-purity 的忠实复刻）：
    // 非请求表的 @deepseek-ai/* 值导入在构建期报错；type-only import 已被
    // 擦除、永远到不了这里。
    name: 'dsh-client-bundle-purity',
    resolveId(source: string) {
      if (!source.startsWith('@deepseek-ai/')) return null
      if (REQUESTED.has(source)) return null // requested module-table row: external wins
      if (VENDORED_LIBRARY.test(source)) return null // vendored library: inline, no shared identity
      if (INLINE_SAFE.test(source)) return null // wire contribution: inline is the point
      throw new Error(
        `client bundle purity: "${source}" is not in the default client externals or ${PLUGIN_ID}'s dsh.client.external, `
        + 'an inline-safe wire layer, or a generated /remote contribution — cross-plugin value imports are forbidden; '
        + 'collaborate through cordis services (type-only imports are erased and never reach this gate)',
      )
    },
  }],
  outputOptions: {
    entryFileNames: 'client.js',
    sourcemapExcludeSources: false,
    banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(PLUGIN_ID)}, factory: (require) => {`,
    footer: 'return module.exports; } });',
    intro: 'var module = { exports: {} }; var exports = module.exports;',
  },
})
