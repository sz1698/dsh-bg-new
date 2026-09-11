# dsh-bg-switch

给 **DeepSeek Harness（DSH）** 换网页界面背景：**系统预设 / 纯色 / 渐变 / 图片 / 视频**。
桌面端**即时生效**（无需刷新），持久化到 settings 文档，重启后仍在。

两种入口：**侧栏「壁纸」按钮**弹出右侧抽屉（可视化调参），或**直接对模型说**
「把背景换成深蓝」「用这张图做壁纸」——模型调用 `bg_apply` 工具完成。

> 非官方社区插件，MIT。当前 **v0.6.0**；逐版变更见 [CHANGELOG.md](./CHANGELOG.md)。
> 构建配方与产物契约见 [BUILD.md](./BUILD.md)。

---

## 安装

先确认 `dsh` CLI 可用。下面四种方式任选其一，装完后**重启应用**（或重启 `dsh web`）。

```sh
# ① 从本地 clone 安装（开发/自用推荐）
git clone https://gitee.com/iuniko/dsh-bg.git   # 或 https://github.com/sz1698/dsh-bg-switch.git
cd dsh-bg
npm install && npm run build                    # 产出 lib/client.js + lib/index.js
dsh plugin --profile <profile> add .

# ② 从 npm 安装（已发布时）
dsh plugin --profile <profile> add dsh-bg-switch

# ③ 从 tarball 安装（不发 npm 也能分发）
npm pack                                        # → dsh-bg-switch-0.6.0.tgz
dsh plugin --profile <profile> add ./dsh-bg-switch-0.6.0.tgz

# ④ 从 git 直接安装（仓库里已提交构建产物，所以不需要任何构建授权）
dsh plugin --profile <profile> add git+https://gitee.com/iuniko/dsh-bg.git
```

`<profile>` 换成你的 profile 名（首次使用会自动初始化）。装完先不启动、只验层：

```sh
dsh --profile <profile> --dump-config     # 应能看到 "# == dsh-bg-switch" 层
dsh --profile <profile>
```

卸载：`dsh plugin --profile <profile> remove dsh-bg-switch`。

### 为什么 ④ 不需要构建授权

pnpm ≥10 在得到显式允许前拒绝运行 git 依赖的构建脚本，所以「作者只发源码」的插件
用户得先往 profile 的 `pnpm-workspace.yaml` 加 `allowBuilds`（等于允许该包在安装时
执行代码）。本仓库**把 `lib/` 构建产物一并提交**，因此不存在需要授权的构建步骤。
（`npm install` 会在 clone 后重建它们，用于开发。）

### 本地开发：用 overlay 挂源码

改代码时不必反复 `plugin add`，直接用宿主 CLI 的 `--patch` 挂仓库里的 `cordis.yml`
（它按 `file://` 源码路径引用 `src/index.ts`，宿主用 tsx 直接吃 TS）：

```sh
dsh --profile <profile> --patch ./cordis.yml
```

注意 `cordis.yml`（开发用，`file://` 源码路径）与 `cordis.patch.yml`（分发用，
按包名）**不能同时生效**：`dsh-client-modules` 按包名去重，同一个包出现两个活动
loader 源会在激活时抛 `resolves from multiple active Loader sources`。

---

## 用法

### 侧栏 → 右侧抽屉

点左侧栏「**壁纸**」按钮（在 Settings 上方，展开时是图标 + 文字，收起时只剩图标），
**聊天界面右侧滑出抽屉**：

- **打开期间，左侧侧栏与聊天区整列隐藏**，只剩壁纸 + 抽屉 —— 调背景时不被界面挡着；
- 抽屉底板是**半透明 + 背景模糊**，能直接看到壁纸效果；
- **点抽屉以外的任何地方**或右上角 **×** 关闭；关闭后界面原样恢复。

### 抽屉里的五个页签（药丸式分段控件）

| 页签 | 内容 |
|---|---|
| **系统** | 6 个内置预设：默认 / 深蓝紫 / 深海 / 极夜 / 晨雾 / 墨蓝（一键换肤） |
| **纯色** | 取色器 → 应用（CSS 颜色） |
| **渐变** | 完整 CSS 渐变文本 → 应用（`linear-gradient` / `radial-gradient` / `conic-gradient`） |
| **图片** | 远程图片 URL，或**行内文件夹图标**选本地图片 → 应用 |
| **视频** | 远程视频 URL，或**行内文件夹图标**选本地视频 → 应用 |

「**重置**」固定在页签栏右侧：重置整个 `dsh-bg` 命名空间（模式回默认，
透明度/定位/缩放/音量等运行时字段全部回默认，并顺带清掉本地媒体缓存文件）。

### 小图：一个控件同时管缩放和定位

图片/视频模式下，抽屉里会出现一块 **16:9 小图**（与真实全屏层**同一份渲染公式**：

- **在小图里滚轮** = 缩放（`zoom` 1–3，一格 1.1×，吸附 0.05）；
- **按住拖动** = 定位（`posX` / `posY`，拖满小图宽/高 = 0→100 全量程）；
- **拖出小图边界后有 2 秒宽限期**：2 秒内仍可继续定位（位置照写、夹在 0..100），
  中途回到界内即取消计时，2 秒到点或松手才真正离开边界；越界期间小图边框**明暗闪动**。

原来的四条滑杆（透明度/水平定位/垂直定位/缩放）保留，作为精确输入。

### 其他控件

- **适配（fit）**：`fill` 拉伸铺满 / `cover` 裁切铺满 / `contain` 完整容纳 /
  `center` 不缩放居中 / `tile` 平铺；
- **文字（textScheme）**：`auto` 按背景亮度推断 / 浅色文字 / 深色文字 —— 决定整套
  界面表面与文字 token（就是"深色壁纸自动变浅字"那件事）；
- **透明度**：媒体不透明度 0–100%（仅图片/视频）；
- **音量 / 循环 / 倍速 / 播放·停止（一个图标按钮）**：仅视频；
- **毛玻璃质感**：开启后界面表面半透明并对背景做 backdrop 模糊（磨砂玻璃）；
- 拖动任一连续滑杆时，**抽屉自身降到 ~22% 透明度**方便看效果（单击滑条只跳值、
  不降透明）。

### 对话即改（`bg_apply` 工具）

| 参数 | 说明 |
|---|---|
| `mode` | `color` / `gradient` / `image` / `video` / `off`（off = 恢复默认） |
| `value` | 颜色、完整 CSS 渐变，或 http(s) 图片/视频链接 |
| `file` | 本地文件绝对路径（image/video 通用；登记后由插件媒体路由伺服，不内联） |
| `fit` | `fill` / `cover` / `contain` / `center` / `tile` |
| `textScheme` | `auto` / `light` / `dark` |
| `opacity` `posX` `posY` `scale` `zoom` `volume` | 数字微调（见上面各控件） |
| `glass` | `true` / `false`，毛玻璃质感 |

例：「把背景换成 #1e2a78」「用紫色到深蓝的渐变当背景」「把 D:\pics\wall.jpg 设成壁纸」
「换成海边视频并静音循环」。链接会按扩展名做**跨类型校验**（图片位不收 `.mp4`，
视频位不收 `.jpg`，无扩展名的动态地址放行）。

---

## 数据与安全

- **设置存储**：settings 命名空间 `dsh-bg`（权威）。没有 settings provider 的组合
  （如纯 headless）回退到 `$DSH_HOME/dsh-bg-switch/state.json`。
- **本地媒体**：上传/登记的文件落在 `$DSH_HOME/dsh-bg-switch/media/`，由本插件的
  host 路由 `/dsh-bg-media/<mediaKey>` 伺服（支持 Range 206，视频可拖动进度）。
  **文件只在本机保存、只在本机播放，不会上传到任何云端服务。**
- **本机端点无鉴权**：`/dsh-bg-media` 仅监听 loopback，没有 token 鉴权 —— 本机上
  其它进程可以读到这些媒体文件。这是有意的简化（与 DSH 前端静态资源同一层信任），
  但它**只**提供媒体读写，不接受任意路径参数，也不会读你磁盘上的其它文件。
- **图片大小上限**：`config.json` 的 `maxImageMB`（默认 10MB）；**视频不设上限**。

配置（可选）：`$DSH_HOME/dsh-bg-switch/config.json`

```json
{
  "imageExt": ["png", "jpg", "jpeg", "gif", "webp", "svg", "avif", "bmp", "ico"],
  "videoExt": ["mp4", "webm", "ogg", "ogv", "mov", "m4v"],
  "maxImageMB": 10,
  "defaultFit": "cover",
  "defaultTextScheme": "auto",
  "defaultLoop": true
}
```

非法字段会在启动时回退默认并写日志；进程内配置有缓存，改完需重启。

---

## 故障排查

**改动没落到设置里 / 重启回旧值** —— 桌面崩溃后若 `$DSH_HOME/settings.yaml.lock`
残留（锁内 PID 已死），所有 settings 写入会等 2 秒后失败，表现就是"本地即时生效但
一两秒被拉回旧背景、重启回旧值"。删掉该孤儿锁文件即可。

**本地视频只有声音没有画面** —— 这**不是**插件的问题：浏览器不解视频轨时不会触发
`error` 事件，只会静默地只放音轨。插件会检测这种情况并在抽屉里提示"视频只有声音、
没有画面：视频轨编码可能不受支持（如 H.265/HEVC、ProRes）"。换成 **H.264(AVC) 编码的
MP4** 即可。

**右侧的「对话电梯」（TurnNavigator 刻度条）不见了** —— 抽屉打开时整个聊天列（连同
电梯）会被隐藏，这是有意的；关掉抽屉就回来。另外 DSH 自身有
`@container (max-width:900px){display:none}`：聊天区窄于 900px 时本来就不显示电梯。

**远程视频不出画面** —— 插件不代理远程媒体，浏览器直连该 URL。确认链接能直接播放
（而非需要登录/防盗链的页面地址）。抽屉里的小图走的是"复制真实层那一帧"，所以小图
有画面即说明源是好的。

**改完代码没生效** —— 客户端半要重新构建：`npm run build`（产出 `lib/client.js`），
然后重启应用（或让 `pnpm run dev:web` 的客户端 HMR 接管）。

---

## 开发

```sh
npm install
npm run build          # 客户端半 + host 半，都产出到 lib/
npm run build:client   # 只重建 lib/client.js（改 src/client/** 时）
npm run build:host     # 只重建 lib/index.js（改 src/**（非 client）时，需要时）
npm run verify         # build/verify-client.mjs：结构 + 渲染 + 工具 + 配置全量断言
node build/dump-css.mjs image "https://example.com/a.jpg"   # 打印引擎生成的完整 CSS
```

`npm run verify` 退出码 0 = 全绿。它把 `lib/client.js` 跑在 VM 假 DOM 里断言：
loader 契约、导出面、四类背景的渲染产物、媒体/视频控制、防抖与镜像收敛、
工具与媒体路由的 host 侧行为、settings schema 字段、以及各轮交互细节（药丸 tab、
小图拖动与 2 秒宽限、降透明触发条件、抽屉结构等）。

### 代码结构

| 位置 | 职责 |
|---|---|
| `src/index.ts` | **唯一** host loader 入口：挂 settings 命名空间 + 嵌套挂载 tool / media |
| `src/bg-config.ts` | 共享纯配置（扩展名表、上限、默认值、枚举、URL 类型校验纯函数） |
| `src/bg-settings.ts` | settings 命名空间 `dsh-bg` 的注册、schema、读写（无 provider 回退 state.json） |
| `src/state.ts` | `$DSH_HOME/dsh-bg-switch/state.json` 的原子读写（回退镜像） |
| `src/config.ts` | `config.json` 读取与缓存 |
| `src/tool.ts` | `bg_apply` 工具（参数校验 + 落库） |
| `src/media.ts` | `/dsh-bg-media`：POST 上传登记 + GET/HEAD 伺服（Range 206） |
| `src/style.ts` | v0.4 起为 **no-op 占位**（媒体视觉只归客户端引擎） |
| `src/client/index.ts` | 浏览器半：渲染引擎、抽屉 UI、小图、侧栏按钮、订阅与持久化 |
| `src/client/bg-palette.ts` | 纯调色板与渲染计划（亮度/文字方案/fit/焦点/zoom/毛玻璃 token） |
| `lib/client.js` | 客户端半产物（官方 closure-factory 格式，**已提交进仓库**） |
| `lib/index.js` | host 半产物（ESM，**已提交进仓库**） |
| `cordis.patch.yml` | **分发用**组合包 patch（行按包名引用） |
| `cordis.yml` | **开发用** overlay patch（行按 `file://` 源码路径引用） |
| `build/verify-client.mjs` | 全量验证脚本（`npm run verify`） |

### 发布（维护者）

```sh
npm run build        # prepublishOnly 已挂，publish 时也会重建
npm publish          # 需要 @deepseek-ai scope 之外的公开包名 + publishConfig.access=public
```

分发形态是 **DSH 组合包（bundle）**：package.json 声明
`dsh.bundle.patch = ./cordis.patch.yml`，用户 `dsh plugin add dsh-bg-switch` 后
这个包会被追加进 profile 的 `dsh.profile.bundles` 并逐层应用。

社区发现靠把仓库挂上 **`dsh-plugin`** 主题（GitHub Topics；Gitee 没有对应机制，
建议以 GitHub 镜像作为主仓库或至少同步发布）。

---

## 许可

[MIT](./LICENSE)
