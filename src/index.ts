/**
 * dsh-bg-new —— 单一 host loader 入口（R3 布局；v0.3 追加 media 嵌套插件；
 * v0.4 移除 style 嵌套；v0.5.0 追加独立设置窗口路由 panel）。
 *
 * 为什么收敛成一个入口：
 * dsh-client-modules 的扫描按 package.json 的 name 去重；一个包被多个
 * 活动的 loader 源同时命中时（本仓库声明 dsh.client 之后），激活即抛
 * "package dsh-bg-new resolves from multiple active Loader sources:
 * remove one entry"。因此本包必须恰好一个 loader 行。
 *
 * 本文件把工具（tool.ts：bg_apply）、本地媒体路由（media.ts：/dsh-bg-new-media
 * 上传+Range 伺服）与独立设置窗口路由（panel.ts：/dsh-bg-new-panel 页面+state+set）
 * 作为嵌套插件挂载；另在父 fiber 上安装 settings 命名空间
 * 'dsh-bg-new' 的注册（src/bg-settings.ts：随 settings 服务可用性延迟注册，官方同款
 * ctx.inject 姿势，参照 packages/client/ui-theme/src/index.ts:36-43）。命名空间
 * 注册只做一次，tool/media/panel 都经 bg-settings.ts 的模块级句柄读写，避免重复
 * 注册（settings 服务抛 duplicate）与激活时序问题（eager 注册可能在 provider
 * 未就绪时静默失败，导致桌面客户端 scope 变 unavailable）。
 *
 * v0.4：**不再嵌套挂载 style.ts**（其媒体视觉注入与客户端渲染引擎双渲染器冲突，
 * 见 style.ts 头注；apply 已改为 no-op）。视觉只归客户端引擎
 * src/client/index.ts；CLI 首帧可能极短默认底色闪现，接受。
 *
 * media.ts / panel.ts 都声明 inject:['webServer']：无 webServer 的 profile
 * （headless）下这两个嵌套插件保持未激活、无副作用，不影响工具与命名空间。
 */
import type { Context } from '@deepseek-ai/cordis'
import * as toolPlugin from './tool.ts'
import * as mediaPlugin from './media.ts'
import { installBgNamespace } from './bg-settings.ts'

export const name = 'dsh-bg-new'
export const inject = ['tools']

export function apply(ctx: Context): void {
  // 先装命名空间注册（延迟到 settings 可用），再挂嵌套插件
  ctx.effect(() => installBgNamespace(ctx), 'dsh-bg-new: settings namespace')
  ctx.plugin({
    name: toolPlugin.name,
    inject: toolPlugin.inject ?? [],
    apply: toolPlugin.apply,
  })
  ctx.plugin({
    name: mediaPlugin.name,
    inject: mediaPlugin.inject ?? [],
    apply: mediaPlugin.apply,
  })
}
