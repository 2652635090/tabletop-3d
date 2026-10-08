# 牌桌 · 3D 桌游沙盒

浏览器里的一张实木桌子：摆棋盘、棋子、卡牌、骰子、计时器、唱片机、视频平板，然后拉朋友进来同局玩。渲染是真 3D（WebGL / Three.js），桌面本身就是界面，不是 HTML 面板里嵌一个小窗口。

- **28 种物件**：棋盘（16 种预设盘 + 纯桌布：国际象棋、中国象棋、围棋 9/13/19、五子棋、跳棋、黑白棋、井字棋、环形竞速、计分轨、六边形 7/10/11、方格 6）、d4/d6/d8/d10/d12/d20、卡牌与整叠牌堆、卡牌盒/布袋、区域垫、统计垫、卡槽带、计时器、沙漏、计算器、转盘、计分轨、指针、箭头、文字、米宝与王冠旗、牌屏、规则书、唱片机、随身听 MP3、迷你计数器、骰盘、视频平板。
- **联网同局**：建房给出 6 位房间码（字母表里没有 I 与 O，免得念错）、公开房间大厅、手牌私密区、权限逐项开关、房主口令、"游戏模式"一键收起编辑与删除。
- **同步模型**：整桌状态 + 版本号比较交换（CAS），改哪张牌只写哪张牌；拖动与操作走同源 WebSocket 流式广播，WebSocket 不可用时自动退回轮询。
- **桌面物理**：材质表（质量/摩擦/弹性）、按真实投影贴围板、支撑判定（托不住就滑落）、抽掉垫板跟着塌、甩牌带初速滑行并撞开别的牌。
- **棋类裁判**：象棋/将棋类的可行落点、吃子、照面与送将禁止、将军与绝杀、五子棋长连禁手、棋盘一键重置开局。
- **内置内容**：扑克 54 张、狼人杀 18 张、塔罗大阿卡纳 22 张，以及一款内置小游戏《潮汐》（44 张，选中牌实时算最高分拆法）。牌面、卡背、棋盘格线、桌垫纹样全部由 canvas 程序化绘制，**运行时要用的素材一张图片文件都没有**；仓库里仅有的位图是安卓壳的应用图标与启动图（`vibe_images/` 是它们的源文件，`android/app/src/main/res/` 是生成结果）。

第三方桌游的牌面文字**不在仓库里**，走可自选的牌组包，见[可选牌组包](#可选牌组包)。

---

## 快速开始（只跑前端）

需要 Node **22.12** 或更高的 22.x（`scripts/check-node.mjs` 在 `preinstall` 就会拦版本）。

```sh
npm ci
node dev/tabletop-preview/server.mjs "" 8000   # 开发用的房间服务，数据只在内存里
npm run dev                                    # 另开一个终端，按它打印的 127.0.0.1 地址打开
```

`vite.config.ts` 把 `/functions/v1/app` 代理到 `127.0.0.1:8000`，所以上面那条 fixture 不起就点不进房间。这条路径**只模拟 HTTP**：实时通道打的是同源的 `/ws`，开发代理里没有它，因此开发模式下联机走轮询。要体验真正的 WebSocket 流式同步，用下面的完整跑法。

## 完整跑法（静态产物 + 实时网关，同一个端口）

```sh
npm ci
npm run build                      # = tsc --noEmit + vite build，产物在 dist/
npm --prefix server install        # 服务端只有一个依赖：ws
npm start                          # = node server/index.mjs，默认听 29920
```

打开 `http://127.0.0.1:29920`。网关一份进程同时干三件事：静态托管 `dist/`、`POST /functions/v1/app` 的房间接口、`/ws` 的 WebSocket 广播。之所以把前端也放在这个 Node 进程里，是因为 https 页面打不开 `ws://` 连接（浏览器按混合内容拦掉）。

四个环境变量都有可用的默认值：

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `PORT` | `29920` | 应用端口 |
| `HOST` | `0.0.0.0` | 监听地址 |
| `SITE_DIR` | 仓库里的 `dist/` | 静态产物目录 |
| `DATA_DIR` | `server/data/` | 房间 / 存档 / 图片 / 音频落盘目录 |

**目录结构必须与仓库一致**：`server/index.mjs` 按 `../functions/handler.mjs` 相对引用那份服务端校验，`functions/` 这一层不能挪，否则网关起不来。

自检：

```sh
curl -sS http://127.0.0.1:29920/healthz
```

返回 `{ ok, rooms, roms, images, audio, online, uptime }`，**GET 无副作用**，可以放心探。

等一切就绪要常驻时：`HANDOVER.md` §10.2 给了一份 systemd 单元（专用 nologin 账号、`ProtectSystem=full`、`Restart=always`），§10.4 讲了反代必须放行 `/ws` 的 `Upgrade`/`Connection` 头，否则客户端会静默退回轮询、延迟从几十毫秒变成一秒级。**换 dist 时先解到新目录再原子改名**，别原地覆盖；`DATA_DIR` 不在产物路径上，所以换代码不会丢房间。

---

## 项目结构

```
game/          数据层，纯 TypeScript，不碰 DOM 也不碰 Three.js——所有规则的源头
  types.ts       Kind / GameObject / TableState / Action 联合类型（先读这个）
  catalog.ts     常量、fix*() 归一化器、几何、材质表、中文叫法、页签归属
  state.ts       apply() 纯函数归约器 + tidy() + describe()
  ops.ts         动作构造器（xxxAction），返回 Action | null
  decks.ts       内置牌组（公版 / 原创）
  packs.ts       可选牌组包的解析
  landing.ts     resolveDrop()：落点的唯一算法
  physics.ts rules.ts perm.ts api.ts rt.ts ...
three/         渲染层：scene.ts（相机/拾取/拖拽/补间）、pieces.ts（每种 kind 的模型）、textures.ts（所有 canvas 贴图）
src/           App.tsx 总装 + src/ui/ 各个面板
components/    现成的 shadcn 风格控件（Button、Sheet…）
functions/     handler.mjs：**服务端校验权威** validState()，纯 JS 手写
server/        自托管真正跑的网关（index.mjs / store.mjs / perm.mjs）
dev/           五个自证 harness 与开发期 fixture
docs/          pack.example.json —— 牌组包的样例
```

---

## 改代码前必读的四条规矩

违反任何一条都会引入很难查的 bug，典型症状是"本地能摆、联网被拒"或"两端桌面分叉"。完整口径见 `HANDOVER.md` §4。

1. **归约是纯函数，随机数由发起方算好。** `apply(state, action, by, color)` 客户端乐观提交、冲突重放、服务端校验全走它。骰子点数、洗牌顺序、转盘停在哪格，都在 `game/ops.ts` 的动作构造器里算完塞进 action，归约端只重放。往归约里加 `Math.random()` / `Date.now()` 就是 bug。
2. **四份校验镜像必须同步**：`game/catalog.ts` 的 `fix*()`（形状与范围的唯一真源）、`game/state.ts` 的 `tidy()`、`game/api.ts` 的 `api.sanitize()`（入站再消毒一遍）、`functions/handler.mjs` 的 `validState()`（服务端权威，**拒绝**而不是归一化：形状不对 400 `invalid_input`，太大 413 `state_too_large`）。
3. **两处权限镜像必须同口径**：`game/perm.ts`（客户端把动作映射到权限键）与 `server/perm.mjs`（服务端按前后状态逐物件 diff 反推）。不一致的表现是客户端以为能做、服务端给还原回去。权限、房主口令、游戏模式一律**不进** `TableState`——状态是整桌 CAS 写入的，写进状态等于谁都能给自己开权限。
4. **像素与音频字节不进桌面状态**，状态里只存内容哈希 key；渲染派生的东西（计算器结果、计时器剩余、播放位置）各端按同一套纯函数从状态推出来，没人每秒往桌上写一次进度。

还有一条界面规矩：**不留死控件**。按钮能不能摆出来，门控条件必须等于归约器真实接受的范围；动作构造器返回 `null` 的情况那颗按钮就不该出现。没写出来的手势等于不存在，要给可见引导。

新增一种物件（kind）的 18 步改动清单在 `.qoder/skills/tabletop-add-kind/`（本地助手技能，**不入库**）；没有 Qoder 的读者照 `HANDOVER.md` §3 的数据模型表格 + 上面四条自己走。

---

## 验证：改完必须跑的用例

这个项目靠自己的 harness 自证，不靠手工点。基线数字（2026-10-08 实测）：**rules-check 1319 条全过 / api-check 292 条全过 / realtime-check 全过 / audio-check 全过**。

```sh
npx tsc --noEmit                     # 前端与控件的类型检查（不含 dev/）
npm run build                        # 干净构建
npm run check:rules                  # 数据层用例，1319 条；加 -- --all 连 PASS 一起打
node dev/realtime-check.mjs          # 双客户端 WebSocket，自带网关，不需要 fixture
node dev/audio-check.mjs             # 音频字节路由与「GET 不写任何字节」
```

HTTP 契约用例要自己起 fixture，**两个坑必须记住**：

```sh
node dev/tabletop-preview/server.mjs "" 29947          # 每次挑一个全新端口
node dev/tabletop-preview/api-check.mjs http://127.0.0.1:29947/functions/v1/app
```

1. **BASE 走 `argv[2]`，不是环境变量。** `CHECK_BASE` 只有 `public-check.mjs` 认。给 api-check 传 `CHECK_BASE=...` 会让它静默地去打硬编码的默认 8000。
2. **每次挑一个新端口。** 上一轮遗留的 fixture 内存里握着一份**旧的** `functions/handler.mjs`，会对新加的字段报一堆假 FAIL。相信 FAIL 之前，先确认端口上是哪个进程。

跑在别人已启动的实例上（自己托管的那台，或本地的 `npm start`）用线上孪生：

```sh
CHECK_BASE=http://127.0.0.1:29920 node dev/public-check.mjs   # 没给 CHECK_BASE 就直接退出
```

`dev/tabletop-preview/rules-check.ts` 里 `tsc` 会打一批 harness 自身的既有类型噪音，但**仍然会产出 JS 并跑完**；`npm run check:rules` 会替你数清 PASS/FAIL，并在有失败时以退出码 1 结束。

界面布局要量真实尺寸，得用隔离组件 rig（一次性页面 + 固定宽度 iframe + `elementFromPoint(center)` 证明可点），配方与陷阱见 `HANDOVER.md` §9 与 §13。

---

## 可选牌组包

牌组包是站点静态目录里的一份 JSON，启动时读一次；**文件不在就没有**，组件库不会多出点了没反应的那一行。

放文件：

```
public/packs/index.json
```

格式（照抄 `docs/pack.example.json` 改）：

```json
[
  {
    "id": "my-deck",
    "name": "我的牌组",
    "hint": "12 张：任务与奖励",
    "cards": [
      { "back": "classic", "label": "送信", "cat": "任务", "art": "信", "color": "#3d7fbf", "text": "交给任意一家，换一张牌。" }
    ]
  }
]
```

限制（超了不报错，**截断或丢弃那一条**，见 `game/packs.ts`）：

| 项目 | 上限 |
| --- | --- |
| 一个包里的牌组数 | 24 |
| 一副牌的张数 | 500 |
| `name` / `hint` | 20 / 40 字（`hint` 省略则写「N 张」） |
| 单张牌 `label` / `art` / `cat` / `text` / `rank` | 20 / 4 / 12 / 240 / 3 字 |
| `color` | 只认 `#rrggbb` |

**`back` 只能用现成的卡背**：`classic`（花纹）、`weave`（编织）、`plain`（纯色）、`poker`（扑克格）、`wolf`（狼纹）、`tarot`（塔罗）、`tide`（潮汐）。写了不存在的卡背会被收成 `plain`。卡背是渲染层的能力，加一种要动四处校验镜像和贴图代码，不是牌包能带来的东西。

**牌包只加"往桌上一整叠"的入口**（组件库「卡牌」页签里多一行），加不了"开局"那一侧的整桌布置——那些预设是 `game/factory.ts` 里代码写的静态摆位。同理，牌包也带不进新玩法：《潮汐》那种自带算分逻辑的游戏是 `game/tide.ts` 的代码，不是数据。

> 仓库里为什么不含《三国杀》《UNO》这类牌组：那些产品的武将名、技能描述与牌面构成是别人家的版权内容，不该进一个 GPL 仓库。它们在本地照样能玩——把牌面写进 `public/packs/index.json`（该目录已在 `.gitignore` 里），或者按 `docs/pack.example.json` 自己整理一份。

---

## 安卓壳（Capacitor，未上真机）

```sh
TABLETOP_SITE_URL=https://你部署的那台/ npm run android:apk
```

壳从站点地址加载整个桌面，所以**网站更新了不用重装 APK**。`TABLETOP_SITE_URL` 没给就直接报错退出——仓库里不留任何现成地址。

⚠️ 这条线**从未接过真机**：所有安卓行为（横竖屏、混合内容放行、返回键、WebView 里的手势）都是从配置与网页端实测推断的，没有任何一条是真机验证过的。目前只侧载安装过，没上过应用商店。站点上了 HTTPS 之后要关掉明文 HTTP 开关（`androidScheme` / `allowMixedContent`，见 `capacitor.config.ts`）。

---

## 还没验证过的事情

诚实清单，别把下面这些当成"能用"：

- **真机 / 触屏**：手机和平板上的帧率、按住拖动、软键盘避让、横屏排版全部没有真机实测过（本机从来没有手机接上来）。窄屏下个别新加的一排控件是否会把底栏撑出横向溢出，也是未知的。
- **真实 GPU 上的观感**：卡面与棋盘贴图在这里只验证过"绘制调用走到了"（canvas 打桩），没有做过像素比对。
- **多人并发**：联机冲突路径由"归约是纯函数"这条保证 + 契约用例覆盖，没有做过 3 人/4 人真开一局跑完整流程的实测。
- **Qoder Sites 那条线**：`functions/adapter.mjs` 与 `functions/index.ts` 是云端 Function 的入口，本仓库保留它们但**当前没有可发布的云端实例**，那条线的数据库/函数行为在本轮没有验证。

---

## 许可

**GPL-3.0-only**，全文见 `LICENSE`。

- 版权行请每个改动者按自己的情况处理：源码文件默认沿用 `Copyright (C) 2026` 的项目声明，`LICENSE` 本体不含具体署名。
- `vendor/shadcn-tailwind-4.13.0.css` 是随模板进来的第三方样式表，它自己的许可证保留在同目录的 `vendor/shadcn-tailwind-4.13.0.LICENSE.md`；工程来源与改动见 `PROVENANCE.md`。
- `react` / `three` / `vite` / `tailwindcss` / `ws` 等依赖各自遵守其上游许可证，不随本仓库重新授权。
- 内置牌组内容（扑克、狼人杀角色名、塔罗大阿卡纳、《潮汐》）都是公版或本项目原创的文字与程序化绘制，不含任何第三方桌游的牌面文本或美术资产。
- 你上传的图片、音频与牌组包数据不属于仓库内容，也不会被仓库收集。

贡献前先看 `CONTRIBUTING.md`。
