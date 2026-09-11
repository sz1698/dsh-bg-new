# 更新日志

本文件记录 `dsh-bg-new` 的版本变更。**v0.6.0 一节下面按"迭代批次"分节**——都是
一次交互改版中陆续补齐的改动，功能全部落在 0.6.0 里；此后每个版本一节。

安装与用法见 [README.md](./README.md)。

---

## 0.7.0

**主题：为公开发布把插件标识从 `dsh-bg` 改成 `dsh-bg-new`，并保证老用户的背景不丢。**

### 标识改名（包名 / 仓库 / 运行时身份）

- **npm 包名与仓库地址**：`dsh-bg` → `dsh-bg-new`，仓库迁到
  `github.com/sz1698/dsh-bg-new`（Gitee 同步）。改名原因：npm 上的 `dsh-bg`
  已被另一个同类插件占用，沿用该名字会让 `dsh plugin add dsh-bg` 装错项目。
- **组合包 patch 行**（`cordis.patch.yml`）的 `id` / `name` 同步改成 `dsh-bg-new`
  —— patch 行按**包名**解析，名字不一致会直接解析失败。
- **客户端 bundle 的模块 id**（`tsdown.config.ts` 的 `PLUGIN_ID`）与 host 插件
  导出名（`src/index.ts` 的 `name`）同步改名；`lib/` 两侧产物已重建。
- **settings 命名空间**：`dsh-bg` → `dsh-bg-new`（host 与 client 共用同一常量）。
- **数据目录**：`$DSH_HOME/dsh-bg/` → `$DSH_HOME/dsh-bg-new/`。
- **媒体路由**：`/dsh-bg-media/` → `/dsh-bg-new-media/`。
- **DOM 标记**：抽屉 / 小图 / 图层等 `data-dsh-bg-*` 属性与 `dsh-bg-*`
  testid 全部换成 `dsh-bg-new-*` 前缀（验证脚本断言同步更新）。

### 改名兼容：老用户的壁纸与媒体不丢

- **数据目录回退链**：新目录 `dsh-bg-new/` 不存在时，依次回退到 `dsh-bg/`，
  再到最早的 `dsh-bg-switch/`，并**继续使用**那个老目录（不复制、不搬动可能几百
  MB 的媒体文件）。全新安装直接用新目录名。
- **settings 命名空间一次性继承**：首次激活时若新命名空间 `dsh-bg-new` 还没被写过，
  而老命名空间 `dsh-bg` 的用户层有值，就把这些值搬进新命名空间。老注册在继承完成后
  立即释放；`dsh-bg` 段留在 settings 文档里不删，便于回退到旧版本。
  实现依据：settings 服务的 `describe()` 会为每个已注册命名空间带出**原始 user
  层**（`SettingsDescriptor.user`，"字段出现在这里"恰好等价于"用户覆盖过它"），
  因此能区分"用户没写过"与"用户写成了默认值"。

### 文档

- **README 重写为「介绍 + 安装」**：从 185 行压到 68 行，只保留插件介绍、功能列表、
  三种安装方式与卸载；数据与安全、故障排查、项目结构、发布流程、上架社区等维护者
  向的内容全部移出（原版另存为本地 `README.local.md`，由 `.gitignore` 的 `*.local.md`
  规则挡住，不进仓库）。
- 安装章节改成 **git 通道优先**（`dsh plugin --profile web add github:sz1698/dsh-bg-new`
  —— 市场解析安装证据用的就是这种 `github:owner/repo` 形式），并给出 `dsh` 不在 PATH
  时的 `npx` 写法；**删掉 npm 安装方式**：`dsh-bg-new` 尚未发布到 npm，留着既误导用户，
  也可能被市场解析成首选安装候选。npm 上存在的是**另一个作者的 `dsh-bg`**，README 里
  已明确提示别装错。
- 重新核对全部对外文档里的路径、路由、命名空间与包名，删掉与发布无关的开发过程记录
  （构建笔记等只留在本地，不进仓库）。

### 修复：`pnpm-lock.yaml` 的失同步与镜像地址写死（导致社区实机验证失败）

- **症状**：DSH 插件市场（dshmk.com）的实机验证报 `DEPENDENCY_INSTALL_FAILED`；
  同一原因也让本仓库自己的 GitHub Actions 连续失败。
- **根因有两个，都在锁文件里**：
  1. **与 `package.json` 失同步**：`@deepseek-ai/dsh-home-paths` / `dsh-tools` /
     `schemastery` 早先是 `dependencies`，后来改成 `peerDependencies`
     （`devDependencies` 镜像精确版本），但锁文件自首次提交起从未重新生成 ——
     `importers` 段里它们仍挂在 `dependencies`，于是 `--frozen-lockfile` 立刻以
     `ERR_PNPM_OUTDATED_LOCKFILE` 失败。
  2. **95 个下载地址被写死到 `registry.npmmirror.com`**：`resolution` 段里每条都带
     `tarball: https://registry.npmmirror.com/...`。本机 pnpm 的 registry 是
     `http://registry.npm.taobao.org/`（它跳转到 npmmirror），生成锁文件时把这些地址
     一起写了进去。**本机因为有 pnpm store 缓存所以不下载也能过，而 CI 与市场沙箱都是
     冷环境，必须去该镜像拉包** —— 这正是"本地全绿、CI/沙箱红"的原因。
- **触发条件**：市场验证器（`scripts/validation/linux-sandbox.ts`）只要发现仓库里有
  `pnpm-lock.yaml`，就跑 `pnpm install --frozen-lockfile --ignore-scripts`
  且超时只有 120 秒。
- **修法**：**用官方 registry 重新解析**（`--registry=https://registry.npmjs.org/`）
  生成锁文件。`lockfileVersion` 仍为 `9.0`，`importers` 与 `package.json` 对齐，
  并且**锁文件里不再含任何硬编码下载地址** —— 下载源由安装方自身的 registry 配置决定，
  换镜像/换网络都不会再影响安装。
- **实测**：pnpm 10.34.5 与 11.19.0 均通过 `--frozen-lockfile`；并用**全新空 store**
  （强制真实下载，模拟 CI / 沙箱的冷缓存）跑通，耗时约 7 秒。
- **防回归**：`.github/workflows/ci.yml` 的安装步骤与验证器完全一致
  （`pnpm/action-setup` 钉 `11.19.0` + `--frozen-lockfile --ignore-scripts`），
  并用冷缓存语义暴露问题；锁文件再次失同步时 CI 会先红，而不是等市场验证才发现。

---

## 0.6.0

**主题：从"设置页里的背景面板"改成"侧栏入口 + 右侧抽屉"，并补齐毛玻璃与交互细节。**

### 交互改版：从设置页迁到「侧栏入口 + 右侧抽屉」

- **去掉预览**：删除预览画布（`dsh-bg-new-canvas`）与「按住预览 / 预览模式」及其降透明
  提示条机制（`previewThemeFor` 保留为纯工具导出）。
- **交互迁移**：不再注册 `settings.section`（设置页里没有「背景」页了），改为两个
  slot —— `sidebar.footer.action`（侧栏「壁纸」按钮）与 `shell.overlay`（右侧抽屉，
  承载原来的背景设置内容）。两处用模块级 store 联动。
- **滑动降透明**：拖动调参滑杆期间抽屉自身降到 ~22%，松开恢复。
- **去掉独立设置窗口**：删除 `src/panel.ts`（`/dsh-bg-new-panel` 路由）与
  `bg-settings.ts` 里的 `BG_PANEL_WRITABLE_FIELDS` / `validateBgFieldPatch` /
  `writeBgFields` / `bgPanelStateSnapshot`，以及客户端「在独立窗口打开」按钮。
- **毛玻璃质感**：新增持久化字段 `glass`（默认关）。开启后内容面 token 压到 ~0.55
  透明，并对抽屉/弹窗/输入卡做 `backdrop-filter: blur(16px) saturate(1.2)`
  （`body[data-dsh-bg-new-glass]` 作用域）。

### 抽屉交互细节、取消视频体积上限、链接校验

- 侧栏按钮改成**图标 + 「壁纸」**；侧栏收起（轨道态）只显示图标。
- 「恢复默认」文案改「重置」。
- 抽屉宽度 420px → **630px**；关闭按钮加描边 + 圆形；**点抽屉以外任意处关闭**。
- 面板内重复的「背景」标题去掉（抽屉头部已有一个）。
- 抽屉打开时**让聊天区让出抽屉宽度**，聊天右缘的「对话电梯」不再被盖住。
- **背景视频不再有体积上限**（图片仍是 `maxImageMB`）。
- **远程媒体链接做跨类型校验**：图片页签拒绝 `.mp4/.webm/…`，视频页签拒绝
  `.jpg/.png/…`（无扩展名的动态地址放行）；`bg_apply` 同一份判断。
- 渐变输入补上**载荷字符集校验**（旧实现只查前缀，`;`/`{`/`}` 能注入自管 `<style>`）；
  URL 补上 2000 字符长度上限。
- 新增**「有声无画」自检**：本地视频只解出音轨时（H.265/HEVC、ProRes 等编码
  浏览器不解视频轨且不报 `error`）在面板给出提示。

### 沉浸式抽屉、半透明底板、按钮与图标细节

- 抽屉打开时**隐藏左侧侧栏与聊天区整列**（只留壁纸 + 抽屉），取代第 2 轮的"让位"。
- 抽屉底板改**半透明 + backdrop 模糊**（跟文字方案取色），不再是一块固定色挡住壁纸。
- 侧栏「壁纸」按钮去掉描边，几何/圆角/选中底色对齐它下面的 Settings 控件。
- 视频的**播放/停止合并成一个圆形图标按钮**（暂停态 ▶，播放中 ■）。
- 视频页签去掉重复的「背景视频」标签，只留输入框 + 应用。
- 本地视频提示不再提「上限」，改为说明**文件只在本机保存与播放、不会上传到云端**。

### 页签与文案统一、本地文件回显误报修复

- 纯色 / 渐变 / 图片三个页签的编辑行也去掉来源标签（与视频一致）。
- 页签改名：背景视频 → **视频**、壁纸图片 → **图片**；抽屉标题「背景」→**壁纸**。
- 预设皮肤 → **推荐**（后在第 7 轮改为**系统**）。
- **透明度滑杆也纳入降透明**（此前只有定位/缩放滑杆降）。
- 修 bug：选了本地图片/视频后输入框回显本地值，点「应用」会误报「需以 http 开头」
  —— 现在**回显值未改动时点应用 = 保持不变**；换成别的本地路径则提示改用本地选择
  按钮；真正的坏链接才报错（判定收敛为纯函数 `bgMediaFieldVerdict`）。

### 小图控件（滚轮缩放 + 拖动定位）

- 新增**小图控件**（图片/视频模式）：把「缩放」和「定位」合到一个控件上 ——
  滚轮 = 缩放（1.1 倍/格、吸附 0.05），按住拖动 = 定位（拖满小图宽/高 = 0→100 全量程）。
  小图用与真实全屏层**同一份公式**渲染（fit / 焦点 / zoom / scale / 透明度）。
- **只有真的拖动才降抽屉透明度**：按下只记起点，指针移动超过 3px 才进入交互期
  （监听挂 document），修掉"单击滑条轨道也会闪一下"。
- 本地文件收进**行内图标按钮**（作用等于选择本地文件），隐藏真实 `<input type=file>`
  使浏览器不再渲染"未选择任何文件"文案；去掉「本地图片」标签行与图片的本地提示。

### 小图滚轮修复、2 秒越界宽限

- 修**「小图滚轮无效」**：原实现把 wheel 监听装在小图元素的 ref 上、effect 依赖只有
  `[setBg]`，打开抽屉时若当前不是图片/视频（小图还没渲染）那次 effect 拿到 null，
  之后小图挂出来 effect 不会再跑。改为**监听挂 document、事件时判断目标是否落在小图内**。
- 小图拖动加 **2 秒越界宽限**：拖出边界后 2 秒内仍可继续定位，回到界内即取消计时，
  2 秒到点或松手才真正离开边界。
- 越界期间小图边框**明暗闪动**（`@keyframes dsh-bg-new-minimap-outside`）。

### 药丸式页签、远程视频小图修复

- 「推荐」页签改名**系统**。
- tab 改成**药丸式分段控件**：999px 圆角底槽 + 滑动滑块（`transform: translateX()`
  260ms 位移过渡），文字颜色/字重同步渐变。
- 抽屉关闭按钮显式 `border-radius: 50%` + `aspect-ratio: 1/1`。
- 修**「远程视频在小图里空白」**：小图的视频不再开第二路 `<video>`（同 URL 的第二路
  媒体加载/自动播放更严，也常被服务端按 Referer 拒），改为把真实层那个 `<video>`
  的当前帧 `drawImage` 到 canvas —— 本地/远程一视同仁，也不额外吃解码与带宽。

### 发布准备（工程侧）

- 新增 `LICENSE`（MIT）。
- 新增 **`cordis.patch.yml`**（组合包 patch，行按**包名**引用）与 package.json 的
  `dsh.bundle.patch`：本包现在可以作为**组合包**被 `dsh plugin add` 安装。
- 新增 **host 半构建** `tsdown.host.config.ts`（`src/index.ts` → `lib/index.js`）
  与 `main` / `exports["."]` / `files` 白名单；去掉 `private: true`，补
  `publishConfig`、`repository` / `homepage` / `bugs` / `keywords`（含 `dsh-plugin`）
  / `engines` / `license` / `author`。
- 运行时依赖（`dsh-tools` / `dsh-home-paths` / `schemastery`）从 `dependencies` 移到
  **`peerDependencies`**（devDependencies 镜像一份），避免装出第二份实例 ——
  `schemastery` 尤其关键：settings 服务必须拿到宿主那一份的 schema 对象。
- 新增 `CHANGELOG.md`（本文件）与 GitHub Actions CI（构建 + `verify`）。
- README 按当前交互重写，历史条目移入本文件。

---

## 0.5.0

- **预览画布**：设置页里的 mini 界面缩略图换成 16:9 纯背景画布（只画背景本身）。
- **zoom**：新增 `zoom`（1–3）"放大聚焦"轴，缩放中心 = 焦点定位；面板滑杆 100%–300%。
- **调参降透明**：拖壁纸控件 / 按住「按住预览」时把设置弹窗降到 0.1，另加 sticky
  「预览模式」+ 顶部提示条。
- **独立设置窗口**：host 新增 `/dsh-bg-new-panel` 自包含设置页（GET 页面 / GET state /
  POST set）+ 主面板「在独立窗口打开」。
- **顶部区域**：固化"顶部覆盖 token 集合"，并同步 `<meta name="theme-color">`
  （OS 原生标题栏插件改不了，需主程序支持）。

## 0.4.4

- 点预设皮肤不再跳 tab；tab 只在挂载时按当前背景决定一次。
- 调色板扩成完整语义刻度（按钮/交互态/遮罩/品牌/代码/滚动条…），修掉"白底白字"；
  遮罩族 token 追加 `body *` 同特异性重写。
- 「恢复默认」移到 tab 栏右侧；设置弹窗可拖动；面板新增取色示例行。

## 0.4.3

- 媒体/视频专属控件随 tab 隔离；新增 `scale`（0.25–4）自由缩放；
  「恢复默认」强制回写全部默认字段（不做差值过滤）。

## 0.4.2

- 恢复默认（mode=off）时清理媒体目录缓存；超长旧值不再回显进输入框（避免聚焦卡死）。

## 0.4.1

- 设置页改 tabs 布局（预设皮肤/纯色/渐变/壁纸图片/背景视频）。
- 选项微调不再误清 `mediaKey`；视频换源清旧键。
- 防抖到期**一次原子 mutate** 提交全部字段；设置页回显当前背景；
  输入校验与视频硬错误弹窗；视频进度条 seek + mm:ss。

## 0.4.0

- **单渲染源**：host `style.ts` 的 index-inject 媒体 CSS 停用（双渲染器导致图片"重叠"），
  视觉只归客户端引擎。
- 本地媒体统一**上传 + 伺服**（不再内联 data URI，修掉拖定位卡顿），新增
  `POST /dsh-bg-new-media/upload` 与带 Range 206 的 GET 伺服。
- 新增 `volume` 持久化字段与「声音」运行时开关；文本框 Enter = 应用；
  `mode=off` = 整命名空间重置。

## 0.3.1

- 新增 `opacity`（0–1）与 `posX` / `posY`（0–100 焦点定位）。
- 视频错误可见化：`error` / `stalled` / autoplay 被拒不再静默，
  可读信息写进 `status.error`（字典键 `errVideo*`）。

## 0.3.0

- 模式扩 `video`；新增 `fit` / `textScheme` / `loop`。
- 本地媒体改为「登记 + mediaKey」，由 `/dsh-bg-new-media/<key>` 流式伺服；
  设置页提供预设皮肤 + 自定义（纯色/渐变/图片/视频）。

## 0.2.0

- 客户端半：产出官方格式 `lib/client.js`（closure-factory），设置页出现入口。
- `dsh-bg-new` settings 命名空间成为唯一权威存储（`state.json` 仅作无 settings provider
  时的回退镜像）。

## 0.1.0

- 首个可用版本：host 插件行 + `bg_apply` 工具 + `$DSH_HOME/dsh-bg-new/state.json`，
  支持纯色与渐变。
