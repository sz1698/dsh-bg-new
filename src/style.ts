/**
 * dsh-bg-new-style —— host 样式注入插件（v0.4 起为 no-op 占位）。
 *
 * 背景：v0.3.x 里本插件监听 webserver/index-inject 注入一段固定 center/cover 的
 * body 媒体 CSS（无 pos/opacity/fit 支持），与客户端渲染引擎（<style id=dsh-bg-new-style>
 * + [data-dsh-bg-new-layer]）**同时**生效 → 桌面实测出现图片"重叠"（双渲染器都画了
 * 一层媒体背景，位置/焦点不一致）。v0.4 修法：**视觉只归客户端引擎**，本插件的
 * 媒体视觉注入整体停用 —— apply() 为 no-op，src/index.ts 也不再嵌套挂载本插件。
 *
 * 保留本文件仅作占位/说明：CLI `dsh web` 首帧（无客户端会话、也无 index-inject
 * 媒体 CSS）由客户端引擎在页面加载后接管，可能出现极短默认底色闪现 —— 已接受。
 * 若未来需要为纯 CLI 无客户端会话提供 index-inject 兜底，可在此恢复注入，但必须
 * 只服务"确认无客户端引擎"的场景，避免与客户端引擎并存导致双渲染器重叠。
 *
 * 不再读取状态、不再导出 buildBackgroundCss（v0.3 的该导出与断言一并移除）。
 */

import type { Context } from '@deepseek-ai/cordis'

export const name = 'dsh-bg-new-style'

/** v0.4：no-op —— 不注册任何 index-inject / webserver 监听，视觉只归客户端引擎。 */
export function apply(_ctx: Context): void {
  // 有意为空：媒体视觉注入整体停用（双渲染器冲突根因，见文件头）。
}
