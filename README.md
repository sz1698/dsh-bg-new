# dsh-bg-switch

让 **DeepSeek Harness（DSH）** 的模型通过对话、或你在设置页里手动点选，更换网页界面背景：
**纯色 / 渐变 / 壁纸图片 / 背景视频**。桌面端**即时生效**（无需刷新），并持久化到 settings 文档。

> ⚠️ 非官方社区插件。v0.4.1 = v0.4 全部能力 + **QA 回归修复与面板改版**：
> tabs 布局、选项微调不再误清本地媒体键（拖透明度/改 fit 壁纸不再消失）、视频换源
> 清旧键（坏链接真的会替换并报错）、一次变更 = 一次原子 mutate（恢复默认/设置不再
> 被镜像回滚，重启后不回旧壁纸/旧定位）、设置页重启后回显本地路径/超链接、
> 报错弹窗展示、视频进度条（seek）。
> **v0.4.2**：恢复默认（mode=off）时 host 自动清理媒体目录缓存（清掉残留壁纸/视频
> 文件，#7）；视频进度条不再因 width:100%+缩进超宽（#2）；历史版本把整图 base64
> 塞进 settings 的巨型旧值不再回显进输入框（聚焦不再卡死，#6）。构建配方见 `BUILD.md`。

## 故障排查：设置改不进去 / 重启回旧值？

若桌面崩溃后 `$DSH_HOME/settings.yaml.lock` 残留（锁内 PID 已死），**所有 settings
写入都会等待 2 秒后失败**——表现为"本地即时生效但一~两秒被拉回旧背景、重启后回旧
值"。此时删除该孤儿锁文件即可（内容为已死 PID 的锁视为陈旧，官方 `withFileLock`
不自动清理孤儿锁）。

## 功能

- **对话即改**：对模型说「把背景换成深蓝」「用紫色到深蓝的渐变」「用这张图做壁纸」
  「把这个本地视频设为背景」，模型调用 `bg_apply` 工具完成设置
  （host 半写 settings 命名空间 / state.json 回退）。
- **设置页（客户端）**：Settings →「背景」：
  - **tabs 布局（v0.4.1）**：预设皮肤 / 纯色 / 渐变 / 壁纸图片 / 背景视频五个 tab，
    一次只显示一类来源；「适配/文字/透明度/定位/音量/视频控制/恢复默认」通用控制在
    底部常驻；应用后自动切到对应 tab；
  - 预设皮肤卡片 ≥6（默认 / 深蓝紫 / 深海 / 极夜 / 晨雾 / 墨蓝），色块预览 + 当前选中高亮；
  - 自定义：纯色取色器、渐变文本输入、图片 URL + **本地图片文件选择**、视频 URL
    输入 + **本地视频文件选择**（v0.4：本地图片与本地视频都走同源
    `POST /dsh-bg-media/upload` —— 不再内联 data URI；上传中按钮禁用并显示
    「上传中…」，完成后**自动** `setBg(mode,file.name,{mediaKey})` 全屏生效，
    value 记**原文件名/路径**供回显）；
  - **Enter 提交（v0.4）**：渐变 / 图片 URL / 视频 URL 三个文本框按 Enter =
    应用（阻止默认；本地文件选择框不需要）；
  - **适配（fit）下拉**：image/video 可选 fill / cover / contain / center / tile
    （color/gradient 无意义时禁用）；**文字（textScheme）下拉**：auto / 浅色文字 /
    深色文字；
  - **视频控制行**（当前为视频背景时）：播放/暂停、**停止（v0.4：暂停并停在当前
    帧，不再回卷 0s）**、倍速 0.5×/1×/1.5×/2×、循环开关（默认取自 config）、
    **「声音」开关**（v0.4：初始静音自动播放；点开 = 用户手势 → 取消静音并恢复
    播放；纯运行时态、不持久化，重启回到静音自动播放）、**播放进度条（v0.4.1：
    拖动 seek + mm:ss 时间，实时随 timeupdate 推进，元数据未就绪时禁用）**；
  - **媒体滑杆**（当前为 image/video 时显示）：**透明度** 0–100%（layer opacity
    0–1，默认 100%）、**水平定位 / 垂直定位** 0–100%（默认 50/50=居中；与 fit
    联动即"显示图片/视频的某一块"）、**音量**（v0.4，仅视频：0–100% →
    `video.volume`，持久化 `volume` 字段）；
    **拖动即时生效（本地乐观 apply）+ ~300ms 防抖持久化**；v0.4.1 起防抖到期
    **一次原子 mutate 提交全部字段**（不再逐字段多轮单写），且纯选项微调（mode/
    value 未变）**不再触碰 mediaKey/value** —— 本地壁纸拖透明度/改 fit 不再消失、
    也不会把清键写进 settings；
  - **恢复默认（v0.4）= 整命名空间重置**：mode=off、value/mediaKey 清空、
    fit/textScheme/loop 回 config 默认、opacity=1、posX/posY=50、volume=1
    （v0.4.1：随一次原子写落库 —— 重启后不会回到上次的壁纸/旧定位；
    v0.4.2：host 在 mode=off 提交时自动清理媒体目录缓存，清掉残留壁纸/视频文件）；
  - **设置页回显当前背景（v0.4.1）**：重启/换源/恢复默认后作者输入框显示当前
    生效值 —— 本地图/视频显示原文件名或路径、远程显示 URL（不再空白；
    v0.4.2：超长旧值（如历史整图 base64）不回显进输入框，避免聚焦卡死）；
  - **视频错误可见化 + 报错弹窗（v0.3.1 + v0.4.1）**：远程/本地视频加载失败、
    自动播放被浏览器阻止、应用异常等不再静默 —— 运行态错误**始终显示面板内红色
    错误行**（含原因与 `MEDIA_ERR` 码），其中输入校验错误与视频/应用**硬错误
    （errVideo*/errApply）同时以弹窗展示**（点「知道了」关闭）；自动播放被拒、
    网络慢等待数据等软提示只走提示行、不打断操作；
  - 界面文案中文为主、英文兜底（zh/en 双语字典，经 ctx.locale 注册）。
- **全屏透出 + 单渲染源（v0.4）**：背景视觉只由客户端引擎承担
  （自管 `<style id="dsh-bg-style">` + `<div data-dsh-bg-layer>`，
  `position:fixed; inset:0; z-index:-1`）；host 侧 `src/style.ts` 的 index-inject
  媒体 CSS **已整体停用（apply 为 no-op，src/index.ts 不再挂载）** —— 桌面实测
  「图片重叠」正是旧固定 center/cover 注入与引擎同时生效的双渲染器冲突，v0.4
  起视觉只此一层。CLI `dsh web` 首帧（无客户端会话）由客户端接管，可能极短默认
  底色闪现（接受）。透出整窗仍靠把 `--dsw-alias-bg-base` 与
  `--dsw-specific-sidebar-fill` 置 `transparent`。
- **表面/文字自适应**：按 textScheme（auto = Rec.709 相对亮度推断）把文字
  （label-primary/secondary/tertiary）、表面（bg-layer-1/2/3、overlay、气泡/输入/
  代码等 token）与边框覆盖成 浅字+深色半透明 或 深字+浅色半透明 两套字面量
  （无 CSS var 自引用）；image/video 亮度未知 → 默认浅字+深色半透明表面。
- **即时生效**：客户端订阅 settings 命名空间 `dsh-bg` 的变化并即时采纳，无需刷新。
- **本地媒体统一「上传 + 伺服」（v0.4 / v0.4.1）**：settings 不再存巨型 base64 ——
  图片/视频上传进 `$DSH_HOME/dsh-bg-switch/media/<uuid>.<ext>`，settings 写
  `{mode, value, mediaKey:'<uuid>'}`（v0.4.1 起 UI 上传的 `value` = **原文件名**，
  `bg_apply file` 登记的 = 原绝对路径 —— 供设置页重启后回显；渲染仍统一按
  **mediaKey 非空 → `/dsh-bg-media/<mediaKey>`，否则 value 直接当 URL**，因此
  value 只是可读来源标识，不影响取图）。`bg_apply` 的本地 `file` 参数同样
  「登记 + mediaKey」。`/dsh-bg-media/<key>` 的 GET/HEAD 实现单段 **Range 206**
  流式伺服（先查媒体目录，再兼容旧模式：状态里 video + 原绝对路径）。
- **防抖与收敛（v0.4 / v0.4.1 原子提交）**：滑杆 `onChange` 只做一次本地乐观
  applyBgState；~300ms 防抖到期后把**所有待写字段合并为一次原子 `scope.mutate`**
  （逐字段 `set` 仅作受限 scope 的回退）—— 多字段变更不再是 N 轮单字段往返，
  镜像整文档重载/落盘的竞态窗口被压到一次往返，配合 adopt 收敛（applyKey 去重、
  防抖窗口内 pending 字段以本地值为权威）→ 不振荡、不倒退、**不丢写**（恢复默认
  与滑块设置重启后真实保留）。纯选项微调（mode/value 未变）不写 mode/value/
  mediaKey，不会清掉本地媒体来源键。
- **媒体透明度与焦点定位（v0.3.1）**：image/video 支持不透明度 `opacity`（0–1，
  layer opacity）与焦点 `posX`/`posY`（0–100%）。CSS 语义 =
  `background-position` / `object-position: posX% posY%`（百分比把"内容上距起点
  p% 的点"对齐到容器上距起点 p% 的点）：cover/contain/center 下即以该点为可见
  中心（50/50=居中、0/0=左上、100/100=右下），fill 拉伸下照常生效，tile 下 =
  图案起点偏移。UI 滑杆与 `bg_apply` 的 `opacity/posX/posY` 参数写入 settings，
  重启保留。gradient/color 不支持这两项。
- **声音/音量（v0.4）**：`<video>` 初始 `muted=true`（保证无手势自动播放）；
  「声音」开 = 用户手势 → `muted=false` + `resume play()`；`volume` 0–1 持久化进
  settings（滑杆 0–100% 映射），`sound` 开关为纯运行时态不进 schema（引擎按
  `muted = !soundOn` 推导；重启回到默认静音自动播放 —— 最小编一致方案）。
- **视频错误可见化（v0.3.1）+ 报错弹窗（v0.4.1）**：客户端 `<video>` 绑定
  error/stalled/suspend 与 play() 拒绝处理，把可读原因写进运行时状态：
  `MEDIA_ERR_ABORTED=1` 中止 / `NETWORK=2` 网络 / `DECODE=3` 解码失败（格式或
  损坏）/ `SRC_NOT_SUPPORTED=4` 源不支持；自动播放被拒（NotAllowedError）提示
  "请点击播放"。v0.4.1 起运行态错误**始终显示面板内红色错误行**，其中输入校验
  错误与视频/应用**硬错误（errVideo*/errApply）同时以弹窗展示**（点「知道了」
  关闭）；自动播放被拒/网络等待等软提示不弹窗、只走提示行，不打断操作。加载成功
  （playing/canplay）自动清除；应用过程异常不再被吞。

## 模式（mode）

| mode | value 含义 |
|---|---|
| `off` | 无（恢复默认外观 = 整命名空间重置） |
| `color` | CSS 颜色，如 `#1e2a78` |
| `gradient` | 完整 CSS 渐变，如 `linear-gradient(135deg,#1e2a78,#2b1055)` |
| `image` | http(s)/data: 图片 URL；本地图片 = value 记**原文件名/路径**（UI 上传记文件名、`bg_apply file` 记绝对路径）+ `mediaKey`，渲染取 `/dsh-bg-media/<mediaKey>` |
| `video` | http(s) 视频 URL；本地视频 = value 记原文件名/路径 + `mediaKey`，host 媒体路由流式伺服 |

> v0.4 起 settings 的 value **不再内联本地媒体内容**：UI/工具登记的本地文件都会以
> mediaKey 指到 host 伺服路由，避免巨型 base64 造成每次持久化整文件重写（拖动
> 定位/透明度卡顿的根因）。

## 配置（config.json）

可选配置文件 `$DSH_HOME/dsh-bg-switch/config.json`（`DSH_HOME` 未设置时默认 `~/.dsh`）。
host 启动时读取并校验：**非法字段逐项回退内置默认并记日志**；解析结果烘焙进
settings 命名空间 `dsh-bg` 的 **只读镜像字段**（schema 默认，任何写者都不写它们），
客户端设置页从 settings 读同一份限制与默认做 UI 校验与默认文案。

```jsonc
{
  // 本地文件选择 / bg_apply 校验允许的扩展名（无点、小写；缺省 = 内置表）
  "imageExt": ["png", "jpg", "jpeg", "gif", "webp", "svg", "avif", "bmp", "ico"],
  "videoExt": ["mp4", "webm", "ogg", "ogv", "mov", "m4v"],
  // 本地图片/视频上传伺服的大小上限（MB；默认 10 / 500）
  "maxImageMB": 10,
  "maxVideoMB": 500,
  // image/video 默认适配、文字方案默认、视频循环默认
  "defaultFit": "cover",
  "defaultTextScheme": "auto",
  "defaultLoop": true
}
```

> 配置改动需**重启** host 进程生效（host 启动时读取一次并缓存）。

## 架构（一个仓库）

**Host 半（loader 直接转译 TS 加载，不需要预编译）——单入口 `src/index.ts`**：

| 部件 | 文件 | 职责 |
|---|---|---|
| 入口 | `src/index.ts` | 唯一 loader 入口；安装 settings 命名空间注册，再 `ctx.plugin()` 嵌套挂载 tool + media（声明 `dsh.client` 后一个包只允许一个 loader 行，见 `BUILD.md`）；v0.4 起**不再挂载 style.ts**（视觉只归客户端引擎） |
| 共享纯核心 | `src/bg-config.ts` | mode/fit/textScheme 枚举、内置默认表（扩展名/上限/defaultFit/…）、config.json 逐字段校验清洗；host 与 client 共用、零依赖（可进 bundle） |
| config 读取 | `src/config.ts` | 读 `$DSH_HOME/dsh-bg-switch/config.json`（dsh-home-paths），进程内缓存；ENOENT 静默、解析失败记日志 |
| settings 桥 | `src/bg-settings.ts` | `ctx.inject(['settings'])` 延迟注册命名空间 `dsh-bg`（schema：mode 含 video + value/fit/textScheme/loop/mediaKey/**opacity/posX/posY/volume** + 只读镜像字段 imageExt/…/defaultLoop，默认取自 config；opacity/volume 0–1 step 0.05，posX/posY 0–100）；读写句柄：有 provider 写命名空间，否则回退 state.json |
| 状态文件 | `src/state.ts` | state.json 回退镜像读写（无 settings provider 的组合；含可选 opacity/posX/posY/volume） |
| `dsh-bg-switch` | `src/tool.ts` | 注册工具 `bg_apply`（mode 含 video；fit/textScheme/opacity/posX/posY 可选，opacity 兼容 0–1 小数或 0–100 百分数并吸附 0.05 步长；校验用 config 扩展表/上限）；v0.4：本地 image 不再内联（登记 + mediaKey），mode=off = 全字段回默认重置；`executeBgApply(args, cfg)` 为可测纯逻辑导出 |
| `dsh-bg-media` | `src/media.ts` | `ctx.webServer.register({kind:'prefix', path:'/dsh-bg-media'})`：**POST /upload（kind=image\|video&ext=…，body=原始流）校验扩展名/大小（config 表与上限）并落盘媒体目录 `media/<uuid>.<ext>`**；GET/HEAD 按 mediaKey 伺服任意已登记媒体（媒体目录优先，兼容旧模式状态原路径），实现 **Range 206**（未知 404 / 越界 416）；只 inject webServer（headless 不激活） |
| `dsh-bg-style` | `src/style.ts` | **v0.4 起为 no-op 占位**：媒体视觉注入整体停用（与客户端引擎双渲染器冲突根因）；不再注册 index-inject / 不再导出 buildBackgroundCss |

**Browser 半（必须预编译成 `lib/client.js`，构建配方见 `BUILD.md`）**：

| 部件 | 文件 | 职责 |
|---|---|---|
| 渲染引擎 + 设置页 | `src/client/index.ts` | 自管 style/layer/video DOM、亮度推导、按 mode/fit/textScheme 渲染、订阅/即时采纳（adopt 镜像权威 + applyKey 去重）、防抖持久化、本地媒体上传（fetch POST upload → mediaKey）、双语 UI、声音/音量、Enter 提交、视频控制函数导出；v0.3.1：opacity 与焦点位置渲染、视频错误可见化（status.error，字典键 errVideo*/errApply） |
| 纯调色板 | `src/client/bg-palette.ts` | CSS 颜色解析、Rec.709 亮度、textScheme 推断、fit→CSS 映射（`focusPositionCss` = 焦点百分比公式）、两套表面 token 调色板 |
| 产物 | `lib/client.js` | tsdown 产出的闭包工厂 bundle（`window.__ModuleLoader__.load`），由 dsh-client-modules 伺服 |

**持久化决策（settings 优先，单写不双写）**：
- 桌面/网页 profile：settings 命名空间 `dsh-bg` 是唯一权威存储（host 工具与客户端
  UI 都写它，settings-file provider 落盘 `settings.yaml`，浏览器订阅推送即时采纳）；
  本地媒体文件本体在 `$DSH_HOME/dsh-bg-switch/media/`（只登记 mediaKey 进 settings）。
- 无 settings provider 的组合（纯 headless / 精简 CLI）：工具回退写
  `$DSH_HOME/dsh-bg-switch/state.json`（视觉仍由页面加载后的客户端引擎承担；
  v0.4 起没有 index-inject 媒体 CSS 了）。

## 安装

前置：Node 20+；DSH `0.1.2+`（开发者预览版，接口可能变动）。

```sh
git clone <你的仓库地址> dsh-bg-switch
cd dsh-bg-switch
pnpm install --no-frozen-lockfile   # 或 npm install --legacy-peer-deps --no-audit --no-fund
```

把 `cordis.yml` 里 `name:` 换成你自己 clone 的绝对路径，**必须用 `file:///` URL 形式**（Windows 与 macOS 通用）：

```yaml
- insert:
    - id: dsh-bg-switch
      name: 'file:///你的绝对路径/dsh-bg-switch/src/index.ts'
```

> 注意：必须是**单行单入口**（`src/index.ts`）—— 本包声明 `dsh.client` 后，
> dsh-client-modules 按包名去重，同一包多个 loader 源会在激活期抛 composition error
> （详见 `BUILD.md`）。Windows 生成示例：
> `C:\Users\you\dsh-bg-switch` → `file:///C:/Users/you/dsh-bg-switch`（正斜杠）。
> 不要写 `C:/...` 裸盘符路径（Node ESM 会把它当协议）；不要写相对路径。

### 方式 A：命令行网页版（`dsh web`）

```sh
npx @deepseek-ai/dsh web --patch ./cordis.yml
```

### 方式 B：桌面版

把上面一行 `- id: ...` 追加进桌面版 profile 的用户 patch 层
`<dsh-home>/profiles/web/cordis.patch.yml`，然后**重启桌面应用**。重启后打开
Settings 应能看到「背景」设置页。

## 改动后如何生效（重要）

- **首次安装 / 改动 package.json（dsh.client.*）/ host 半（src/*.ts）**：必须**重启桌面**。
  host 启动期的 client-modules 读取 package.json 的 `dsh.client` 元数据与 loader 行，
  这些只在进程启动时解析。
- **仅改了 `src/client/index.ts`（或 bg-palette）并重新 `npm run build:client`**：
  产物 `lib/client.js` 是页面加载时由 host 伺服的静态文件；桌面仍在运行时可先
  **Ctrl+F5 强刷页面** 验证（若命中 loader 内容缓存仍旧，重启桌面一次兜底）。
- **config.json** 改动：重启 host 进程。

## 使用

装好后对 DSH 说人话即可（见上方示例）。工具参数：

| 参数 | 必填 | 说明 |
|---|---|---|
| `mode` | 是 | `color` / `gradient` / `image` / `video` / `off` |
| `value` | 视 mode | color: CSS 颜色；gradient: 完整 CSS 渐变；image/video: http(s) URL |
| `file` | 否 | 本地文件绝对路径（image/video 通用）：**登记伺服、不内联** —— 校验扩展名/大小（config 表）后生成 `mediaKey`，value 保留原路径，渲染走 `/dsh-bg-media/<mediaKey>`（image ≤maxImageMB / video ≤maxVideoMB） |
| `fit` | 否 | image/video 适配：`fill` / `cover` / `contain` / `center` / `tile` |
| `textScheme` | 否 | `auto`（按亮度推断；image/video 推断不出 → 浅字）/ `light`（浅字+深色半透明表面）/ `dark`（深字+浅色半透明表面） |
| `opacity` | 否 | image/video 不透明度：0–1 小数或 0–100 百分数（如 `0.6` 或 `60`；默认 1=不透明；写入时吸附到 0.05 步长） |
| `posX` / `posY` | 否 | image/video 焦点定位：0–100 百分比（默认 50=居中；0=左上角，100=右下角；配合 fit 即"定位到图片/视频的某一块"） |

`mode=off` 现在 = **整命名空间重置**：除 mode/value/mediaKey 外，fit/textScheme/
loop/opacity/posX/posY/volume 全部回默认（config 默认与 1/50/50/1），不留残值。

本地媒体例子：
`调用 bg_apply：mode=video，file=C:\videos\ocean.mp4`（本地图片同理）
→ host 写 `{mode:'video', value:'C:\videos\ocean.mp4', mediaKey:'<随机>'}`；
客户端渲染 src 指向同源 `/dsh-bg-media/<mediaKey>`，host 路由先查媒体目录、再按
状态原路径回退并 Range 伺服（支持拖动进度/获取时长；找不到文件回 404）。

## 已知限制

- 桌面端即时生效依赖「客户端页面已加载 + settings 命名空间已由 host 注册」；
  首次改动后需重启桌面一次以加载新 bundle 与 dsh.client 元数据。
- **轮播（多背景自动切换）未做**（v0.3 范围外）。
- **视频"没反应"时的排查（v0.3.1 起可见化）**：视频加载失败/自动播放被拒/网络
  等待会显示在设置页底部的红色错误行（含 MEDIA_ERR 码与原因）。远程视频必须
  能**直接播放**（服务器放行、支持 Range、格式为浏览器可解码的 mp4/webm）；
  本地视频先经 UI 上传或 bg_apply 登记（媒体目录/原路径找不到文件回 404，同样
  会显示错误）。仅用于验证的可直链 mp4（第三方测试资源）：
  `https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/360/Big_Buck_Bunny_360_10s_1MB.mp4`
  或 `https://www.w3schools.com/html/mov_bbb.mp4`。
- **上传接口/媒体层需能访问 `/dsh-bg-media`**：该前缀由 host webserver 命名路由提供。
  已实测可用：CLI `dsh web`（HTTP 同源）与**桌面版**（Electron 窗口加载的就是 host 打印的
  `http://127.0.0.1:<port>?token=...`，页面为 http origin，同源相对路径可请求）均可回源。
  仅当页面以非 HTTP 形式（如未来 `file://` 嵌入）服务时才不可用。
- 本地文件选择/上传有大小上限（image maxImageMB=10、video maxVideoMB=500，
  可在 config.json 调整）；**上传的媒体文件本体不自动清理**（mediaKey 只增不回收，
  手动删除 `$DSH_HOME/dsh-bg-switch/media/` 下不再需要的文件即可）。
- 本地图片/视频的**声音**开关是运行时态：重启页面/应用后回到静音自动播放
  （浏览器自动播放策略所致，属预期）；音量 volume 会持久化。
- 视频「停止」是**暂停并停在当前帧**（v0.4，不再回卷到 0s）；需要重新播就点
  「播放」。
- **CLI 首帧（无客户端会话）可能闪现极短默认底色**：v0.4 起没有 index-inject
  媒体 CSS（style.ts no-op），视觉只在客户端引擎加载后接管 —— 接受该闪现。
- 文字自适应只覆盖 alias/specific 层 token；**代码块语法高亮色**由主题的
  `data-ds-dark-theme` 决定，不与 textScheme 联动 —— 浅字+深表面与浅色主题代码块
  并存时，代码文字颜色以主题为准（README 已知限制）。
- 设置页的渐变校验是前缀 + 字符集白名单（与 tool 规则一致），不执行完整 CSS 解析。
- 桌面版 web 会话里工具是否对模型可见受 agent preset 影响（web 版部分工具由 preset
  挂载），如不可见请提 issue；设置页 UI 不依赖工具可见性。

## 卸载

1. 删掉 patch 里那一行 `- id: dsh-bg-switch`（或不再传 `--patch ./cordis.yml`）
2. （可选）删除 `$DSH_HOME/dsh-bg-switch/` 目录（state.json / config.json / media/）；
   settings 命名空间会随插件卸载自动注销，无需手工清理
3. 删除仓库目录

## 自测命令

```sh
# 1) 插件进配置（单行入口 dsh-bg-switch 应出现）
npx @deepseek-ai/dsh --profile web --dump-config --patch ./cordis.yml | findstr dsh-bg

# 2) 构建与验证（本仓库）
pnpm run build:client          # 等价 npm run build:client
node --check lib/client.js
node build/verify-client.mjs   # 211 项断言（client VM + host TS 直接导入；v0.4 含
                               # 防抖/上传/重置/声音/Enter/单渲染源；v0.4.1 增
                               # 原子 mutate、mediaKey 保持/换源清键、resetAll 落库、
                               # seek），全 PASS 退出码 0

# 3) headless 让模型设置（写 state.json 回退路径）
npx @deepseek-ai/dsh --profile headless --patch ./cordis.yml \
  "调用 bg_apply：mode=gradient，value=linear-gradient(135deg,#0f172a,#1e3a8a)"

# 4) 起 web 冒烟（v0.4：上传/伺服走客户端引擎与 /dsh-bg-media 路由；
#    首页已无 index-inject 媒体 CSS 注入块 —— style.ts no-op 属预期）
npx @deepseek-ai/dsh web --patch ./cordis.yml
```

## License

MIT（第三方内容除外）。
#   d s h - b g - s w i t c h  
 