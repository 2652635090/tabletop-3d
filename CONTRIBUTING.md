# 贡献指南

先把项目跑起来并跑通验证，再提改动。这个仓库没有 CI 兜底，靠的是下面那五个 harness 与人工自证。

## 环境

- Node **22.12+**（22.x 系列，`scripts/check-node.mjs` 会在 `preinstall` 拦版本）。
- `npm ci`（不是 `npm i`，锁文件是 `package-lock.json`）。
- 服务端另有自己的锁与依赖：`npm --prefix server install`，只有一个依赖 `ws`。
- 想跑 `npm run check:function` / `dev:function`（Deno 那条 Qoder Sites 函数入口）需要 Deno；不装不影响主流程。

## 开发循环

```sh
node dev/tabletop-preview/server.mjs "" 8000   # 开发期房间服务（内存数据）
npm run dev                                    # vite，按它打印的地址打开
```

改完必须跑：

```sh
npx tsc --noEmit
npm run build
npm run check:rules                  # 数据层用例
node dev/tabletop-preview/server.mjs "" <新端口> && node dev/tabletop-preview/api-check.mjs http://127.0.0.1:<新端口>/functions/v1/app
node dev/realtime-check.mjs
node dev/audio-check.mjs
```

动到了任何会被服务端收到/吐出的东西，还要对自己已启动的实例复测：

```sh
CHECK_BASE=http://127.0.0.1:29920 node dev/public-check.mjs
```

**api-check 每次挑一个全新端口。** 上一轮遗留的 fixture 进程内存里握着一份旧的 `functions/handler.mjs`，会对新字段报一堆假 FAIL；而 BASE 只能走 `argv[2]`（环境变量 `CHECK_BASE` 只有 `public-check.mjs` 认，给错参数它会静默打默认 8000）。

## 提 PR 之前

1. **一个字段要在四个地方同时对上**：`game/catalog.ts` 的 `fix*()`、`game/state.ts` 的 `tidy()`、`game/api.ts` 的 `api.sanitize()`、`functions/handler.mjs` 的 `validState()`。最后一份是纯 JS 手写的**拒绝式**校验（不 import 任何 TS），形状不合答 400 `invalid_input`、体积超限答 413 `state_too_large`。少同步一处，症状是"本地能摆、联网被拒"。服务端刻意比客户端宽松一档（例如 `label` 服务端收到 40 字以内都放行，客户端归一化到 20 字），这样旧客户端写进桌面的状态不会被新校验整桌拒掉——收紧服务端上限前想清楚这件事。
2. **权限口径两处要一致**：`game/perm.ts` 与 `server/perm.mjs`。不一致的表现是客户端以为能做，服务端把改动还原回去。
3. **权限、房主口令、游戏模式不进 `TableState`**，它们挂在房间记录上。桌面状态是客户端整份 CAS 写入的，写进状态等于谁都能给自己开权限。
4. **随机数与时间在动作构造器里算完**（`game/ops.ts`），归约 `apply()` 只重放。归约里出现 `Math.random()` / `Date.now()` 就是 bug。
5. **字节不进状态**：图片与音频只存内容哈希 key；渲染派生量（计算结果、剩余秒数、播放位置）各端自己按纯函数推。
6. **落点只有一个算法**：`game/landing.ts` 的 `resolveDrop()`。新增吸附逻辑往这里加，不要在渲染层偷偷改坐标——否则"看到的位置"和"落下的位置"会分叉。
7. **界面不留死控件**：动作构造器返回 `null` 表示"这个操作不会改变任何东西"，那颗按钮就不该出现（要显示就显示只读文字）。新加的手势必须有可见引导文字与够宽的命中区，否则等于不存在。
8. **一个 kind 只有一个家**：`game/catalog.ts` 的 `KIND_TAB` 里恰好出现一次；中文叫法只在 `displayName()` 一处，别处不许硬编码。新命名的一种工具要有自己的模型和界面，不能拿旧物件换个皮。

新增一种 kind 的完整清单：按上面 1→8 的顺序，`game/types.ts` → `catalog.ts` → `factory.ts` → `state.ts` → `ops.ts` → `api.ts` → `handler.mjs` → `perm.ts` → `server/perm.mjs` → `three/pieces.ts` → `three/textures.ts` → `three/scene.ts` → `src/ui/Palette.tsx` → `SelectionBar.tsx` → `App.tsx`，再补 `rules-check.ts` 与 `api-check.mjs` 的接受/拒绝两类用例。

## 写用例的三条雷

- `xxxAction` 构造器**只在"值不会变"时返回 `null`**。要断言"已到上限就不给动作"，必须把**加宽动作应用之后**的物件喂回去；拿加宽前的物件断言会 FAIL，哪怕门控本身是对的。
- `rules-check.ts` 是一个扁平模块作用域：**别处的顶层 `const` 名字要避开**（重名会 `ReferenceError` 带走整轮结果）。
- **绝不要把从另一张表查出来的物件直接递给动作构造器**——构造器会解引用 `o.kind`，一个抛出的 TypeError 会带走整轮所有结果。

## 约定

- 注释只在"为什么"不明显时写（隐藏的约束、微妙的不变量、针对某个 bug 的绕法）。不解释代码本身在做什么。
- 中文叫法与提示语一律走 `displayName()` / `game/catalog.ts` 里的文案表；界面上的每一句话都要能让没读过代码的人知道下一步点哪里。
- 尺寸一律真实米数；上限常量集中在 `game/catalog.ts`。
- **Tailwind v4 的自动扫描连 `.md` 一起扫**：在仓库任何文本文件里逐字写出一个工具类名，下一次构建就会生成一条没人用的规则。写一次性验证页面（rig）也一样，用完必须删掉再构建。
- 提交信息说清"为什么改"，一行以内讲完结果。

## 不要提交的东西

- 任何服务器地址、端口、SSH 细节、凭据、云端资源 id——**包括写死在脚本、配置或用例里**。站点地址一律走环境变量（`PORT`/`SITE_DIR`/`DATA_DIR`、`CHECK_BASE`、`TABLETOP_SITE_URL`）。
- `public/packs/`：牌组包数据（已在 `.gitignore` 里）。第三方桌游的牌面文字、名称、美术不属于本仓库，也不要以任何形式（截图、素材、转换后的 JSON）提进来。
- 构建产物、`node_modules`、`server/data/`、本地缓存与临时探针脚本。
- 别人家的图片、音频：上传路由是运行时能力，不是仓库内容。

## 授权

贡献即表示你同意你的改动以本仓库的 **GPL-3.0-only** 许可证发布，并且你有权这样授权（自己写的，或已按兼容许可证取得的）。不要提交你无权这样发布的内容。
