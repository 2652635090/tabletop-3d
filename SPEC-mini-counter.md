# 迷你计数器 —— 实现规格书（**已实现、已验证、已部署上线**）

状态：**已落地上线**（2026-09-28 部署到 VPS）。用户 2026-09-27 说「直接实现它」，采用本规格 §5/§10 的推荐默认值开工，四份校验镜像、两处权限镜像、3D 渲染、UI 全部接好。
验证：`rules-check`（新增 `counterChecks()` 块）、`api-check`（新增 counter 接受/拒绝块）、`realtime-check` 三个 harness 全绿；app typecheck 干净；**部署后 `public-check` 全绿**，线上产物 `index-D6Pn4-8L.js` 与本地逐哈希一致。
实现中发现并修掉两个真实 bug（见文末 §11），都不是规格书本身的问题。
读者：接手实现这个物件的 AI 或开发者。
配套阅读：`HANDOVER.md`（项目交接书）、`.qoder/skills/tabletop-add-kind`（加新 kind 的 18 步清单）、`.qoder/skills/tabletop-architecture`（四份校验镜像与两处权限镜像）。

---

## 1. 需求原文

> 添加一个迷你的计数器，使用工具，无多余装饰的物品。这个迷你计数器可以吸附在指定卡牌的边缘。有迷你加减号可以负数。

拆成四条可验收的要求：

1. **归到「工具」页签**（`PALETTE_TABS` 里的 `tool`，`game/catalog.ts:1336`）。
2. **迷你、无多余装饰**：一块小片 + 读数 + 两个小键，不要边框花纹、不要底座、不要发光。
3. **能吸附在指定卡牌的边缘**：吸上去之后跟着那张牌走，牌动了它不漂。
4. **带迷你加减号，读数可以为负**。

## 2. 为什么必须新开一个 kind，不能复用 `token`

`token`（计数标记）已经有 `count` 字段和 `count` 动作，但归约把它夹死在非负：

```ts
// game/state.ts:677
case "count": {
  const o = find(action.id);
  if (!o) return state;
  const v = clampInt((o.count ?? 0) + action.delta, 0, 9999);   // ← 下限是 0
  patch(action.id, { count: v });
  break;
}
```

**不要为了这个需求去放宽 `count` 的下限。** 理由：`count` 字段被四份校验镜像、rules-check 的既有用例、以及所有已有的计数标记共同约束，改范围会牵动一大片，而且"计数标记"和"迷你计数器"是用户眼里两种不同的东西——用户明确要求过「新命名的工具要有自己的模型和 UI，不能拿旧东西换个皮」。

所以：**`Kind` 加 `"counter"`。**

## 3. 数据模型

```ts
// game/types.ts
export type Kind = ... | "counter";

export interface CounterSpec {
  v: number;                      // 读数，可为负
  step: number;                   // 每按一下走多少，默认 1
  host?: string;                  // 吸附的宿主物件 id；不在就是散放在桌上
  edge?: 0 | 1 | 2 | 3;           // 吸在哪条边：0 上(-z) / 1 右(+x) / 2 下(+z) / 3 左(-x)
}

// GameObject 上加
counter?: CounterSpec;
```

建议的常量（放 `game/catalog.ts`，与既有上限放在一起）：

```
COUNTER_V_MIN   -9999
COUNTER_V_MAX    9999     // 与 token 的 9999 对齐，四位数加负号在迷你牌面上还读得出来
COUNTER_STEP_MIN  1
COUNTER_STEP_MAX  100
COUNTER_W       0.026 米  // 迷你：约标准卡宽（0.063）的四成
COUNTER_D       0.016 米
COUNTER_H       0.004 米  // 薄薄一片，贴在牌边上不翘
COUNTER_GAP     0.002 米  // 与宿主边缘留的缝，避免 z-fighting
```

`fixCounter()` 归一化器照 `fixSlot()`/`fixStat()` 的写法：`v` 用 `clampInt` 夹到 ±9999，`step` 夹到 1..100，`host` 只接受非空字符串且长度有上限，`edge` 只接受 0/1/2/3，其余一律 `delete`。

**`host` 的有效性不在 `fixCounter` 里查**（它是纯字段归一化，拿不到整桌状态）。宿主是否还存在，由归约与 `tidy` 之外的收口处理，见 §5。

## 4. 吸附：位置由宿主派生，不存死坐标

这是整个设计的关键决定。**不要**把计数器吸上去之后的 x/z 当成独立事实——宿主一动就会漂。

### 4.1 派生函数（放 `game/catalog.ts`，照 `slotSpot()` :796 的写法）

```ts
/** 计数器吸在宿主第 edge 条边上的世界坐标与朝向：整片跟着宿主转，所以先算局部偏移再旋转。 */
export function counterSpot(host: GameObject, edge: 0|1|2|3): { x: number; z: number; rot: number } {
  const s = shapeOf(host);                 // :52，单张牌看自己的 ratio
  const k = scaleOf(host);
  const hw = (s.w * k) / 2, hd = (s.d * k) / 2;
  const off = [
    { lx: 0,            lz: -(hd + COUNTER_GAP) },   // 0 上
    { lx: hw + COUNTER_GAP, lz: 0            },      // 1 右
    { lx: 0,            lz: hd + COUNTER_GAP  },     // 2 下
    { lx: -(hw + COUNTER_GAP), lz: 0         },      // 3 左
  ][edge];
  const rad = ((host.rot || 0) * Math.PI) / 180;
  const cos = Math.cos(rad), sin = Math.sin(rad);
  return {
    x: r3(host.x + off.lx * cos - off.lz * sin),
    z: r3(host.z + off.lx * sin + off.lz * cos),
    rot: deg360((host.rot || 0) + (edge === 1 || edge === 3 ? 90 : 0)),
  };
}
```

`r3`（:1834）、`deg360`（:1839）、`scaleOf`（:1448）、`inRect`（:972）都是 `catalog.ts` 里现成的（前三个还是导出的），把 `counterSpot` 放在这个文件里就能直接用——这也是 `slotSpot` 待在这里的原因。

左右两条边要让读数顺着牌边躺，所以 `rot` 额外加 90°。

### 4.2 吸附判定（放 `game/landing.ts`，照 `slotFit()` :101 的写法）

```ts
function counterFit(state, o, x, z, rigid, carrying) {
  if (rigid || o.kind !== "counter" || o.pin) return null;
  const host = hostAt(state, x, z, carrying);      // catalog 里新写：点压在哪张牌上
  if (!host) return null;
  const edge = nearestEdge(host, x, z);            // 落点离哪条边最近就吸哪条
  const at = counterSpot(host, edge);
  if (Math.hypot(at.x - x, at.z - z) > COUNTER_SNAP_TOL) return null;   // 太远就照原样落下
  return { x: at.x, z: at.z, rot: at.rot, host: host.id, edge };
}
```

接进 `resolveDrop()`（`game/landing.ts:34` 那一行 `slotFit` 的旁边），命中之后：

- `Move` 带上算出来的 `x/z/rot`；
- **`host`/`edge` 也要落到状态里**。现有 `Move` 只有 `{ id, x, z, rot?, layer? }`，所以两条路可选：
  - **推荐**：给 `Move` 加可选的 `host?: string; edge?: 0|1|2|3`，归约的 `move` case 一并 `patch`。改动小，语义清楚。
  - 备选：另开一个 `attach` 动作，松手时和 `move` 一起 dispatch。两次提交会让服务端权限 diff 看到两步，不划算。

拖动预览也必须走同一份（`resolveDrop` 是唯一算法，见架构铁律），所以预览里看到吸在哪条边，松手就在哪条边。

### 4.3 宿主移动时跟着走

`tidy(o: GameObject)`（`game/state.ts:878`）**只吃单个物件、拿不到整桌状态**，所以跟随逻辑不能放那里。放在归约的 `move` case 末尾：

```ts
// move 应用完之后
for (const c of state.o) {
  if (c.kind !== "counter" || !c.counter?.host) continue;
  if (!movedIds.has(c.counter.host)) continue;      // 宿主没动就不用管
  const host = find(c.counter.host);
  if (!host || host.hand) { patch(c.id, { counter: { ...c.counter, host: undefined, edge: undefined } }); continue; }
  const at = counterSpot(host, c.counter.edge ?? 0);
  patch(c.id, { x: at.x, z: at.z, rot: at.rot });
}
```

这样各端按同一套纯函数算出同一个跟随结果，不会分叉。

## 5. 生命周期收口（**这几条是开放问题，实现前和用户确认**）

| 情况 | 建议行为 | 为什么是开放问题 |
| --- | --- | --- |
| 宿主被 `remove` 删掉 | 计数器**留在原地**，`host`/`edge` 清空，变成散片 | 也可以选"跟着一起删"。删了用户会莫名其妙，留着更安全。 |
| 宿主进手牌（`hand` 动作） | 计数器留在桌面原处并脱附 | 手牌区是另一套排版，带过去会撞 `handbar` 的预算。 |
| 宿主进牌堆/盒/袋 | 同上，脱附留桌 | 同上。 |
| 同一条边已经吸了一个 | **允许叠**还是**换边**？ | 用户没说。建议允许（多个计数器记多个维度是常见需求），但视觉上会重叠，可能需要沿边错开一点。 |
| 能不能吸到非卡牌 | 建议**只吸 `card`**（含 `pile`/`box`/`bag` 的顶牌尺寸？不，先只吸单张 `card`） | 用户说的是"卡牌的边缘"。放宽到棋盘/垫子会让 `counterSpot` 的几何复杂一倍。 |
| `step` 用户能不能调 | 建议能，走选中栏（1/5/10） | 用户只说"加减号"，没说步进。先给默认 1，选中栏留一个步进档位不算多余装饰。 |

## 6. 3D 外观与 ± 点击链路

**无多余装饰**的具体口径：一片圆角极小的薄板（`COUNTER_W × COUNTER_D × COUNTER_H`），正面只有三样东西——左边一个 `−` 键帽、中间读数、右边一个 `+` 键帽。不要边框、不要底座、不要阴影贴图、不要发光材质。读数为负时前面就画一个 `-`，字号自动缩一档以免溢出（三位数 + 负号是设计上限）。

± 键帽走**计算器已经铺好的那条链路**，不要另发明一套：

1. `three/pieces.ts` 里给两个键帽 mesh 挂 `userData.counterKey = "-" | "+"`。
2. `three/scene.ts:1049` 现在只认 `userData.calcKey` 且 `o.kind === "calc"`；在旁边加一条对称的：读 `userData.counterKey`，`o.kind === "counter"` 时写进 `this.hitKey`（或新开一个 `hitCounterKey` 字段，避免两种键混在同一个字段里——**建议新开字段**，`hitKey` 的语义是"计算器键"）。
3. `three/scene.ts:1252` 那段 `if (key && obj.kind === "calc")` 旁边加对称分支：`stopPropagation()`、必要时先选中、`this.events.onCounterKey(obj.id, key)`，然后 `return`（这一笔既不拖也不转镜头）。
4. `three/scene.ts` 的 `events` 接口加 `onCounterKey(id: string, key: string): void`。
5. `src/App.tsx:221` 那行 `if (o) dispatch(calcKeyAction(o, key));` 旁边接上 `onCounterKey` → `dispatch(counterStepAction(o, key === "+" ? 1 : -1))`。
6. `game/ops.ts` 新写 `counterStepAction(o, dir)`（照 `calcKeyAction` :687 的形状，同样返回 `Action | null`）：**值已到边界（±9999）就返回 `null`**，这样选中栏的按钮门控能照实收掉，不留死按钮。

**拖宿主卡牌时把吸着的计数器一起带走**：`three/scene.ts:1277`（区域垫）与 `:1284`（卡槽带）之后加一段——`obj.kind === "card"` 时，把所有 `counter.host === obj.id` 的计数器 push 进 `movable`。注意**不要**把卡牌加进 `rigid` 名单（`:1291`），否则单张牌就不能再吸附到卡槽带里了；计数器跟随由 §4.3 的归约逻辑负责，不靠刚性平移。

## 7. 18 步清单里针对这个物件的具体决定

`.qoder/skills/tabletop-add-kind` 有完整清单，这里只记这个物件的特殊之处：

| 步 | 文件 | 这个物件要做什么 |
| --- | --- | --- |
| 2 | `game/catalog.ts` | 常量、`fixCounter()`、`counterSpot()`、`hostAt()`、`nearestEdge()`、`shapeOf`/`footprintOf`/`boxOf` 加 case、`MATERIALS` 加一行（轻、摩擦中）、`KIND_TAB` 归 `tool`、`displayName()` 返回「迷你计数器」、`movable` 为真、`pinnable` 按需 |
| 4 | `game/state.ts` | `apply()` 加 `counterStep` / `counterSet` case 与 `move` 末尾的跟随逻辑；`tidy()` 加 `counter` 归一化 + 「别的 kind 带上 `counter` 就 delete」；`describe()` 加一句人话（例：「迷你计数器 −3」） |
| 5 | `game/ops.ts` | `counterStepAction(o, dir)`（到边界返回 `null`）、`counterSetAction`、`counterAttachAction`/`counterDetachAction`（选中栏用） |
| 6 | `game/api.ts` | `sanitize()`（:515）加 `if (clean.kind === "counter") clean.counter = fixCounter(clean.counter); else delete clean.counter;`——照现有的 `stat`/`slot`/`gram` 那几行的形状写 |
| 7 | `functions/handler.mjs` | `validState()`（:67）加**拒绝式**镜像：形状不对 `return null`（→400），别在这里放宽范围 |
| 8 | `game/perm.ts` | `actionPerm()`：`counterStep`/`counterSet` → `count`（复用既有权限键，**不要新增键**，房间记录里存的字符串越少越好）；`attach`/`detach` → `move` |
| 9 | `server/perm.mjs` | diff 分类：`counter.v` 变了归 `count`，`x/z/rot/host/edge` 变了归 `move` |
| 13 | `src/ui/Palette.tsx` | 工具页签加入口，**带可见引导文字**（例：「拖到卡牌边上就会吸住」）——没写出来的手势等于不存在 |
| 14 | `src/ui/SelectionBar.tsx` | 读数、`−`/`+`、步进档、吸附/脱离。门控 = 归约器真实接受的范围：`counterStepAction` 返回 `null` 时那颗键不摆 |
| 15 | `src/App.tsx` | `ContextMenu`（:1652）与选中栏同叫法同门控；键盘可选：选中计数器时 `[` / `]` 减一加一（键盘处理在 `onKey`，:788 起；现有键位表见 `HANDOVER.md` §17，别撞车） |

## 8. 必须写的用例

`dev/tabletop-preview/rules-check.ts`：

- `counterSpot` 四条边各一条：宿主在原点、rot=0 时坐标对不对。
- 宿主 rot=90 时，"上边"跟着转到哪（**旋转的局部偏移最容易写错**）。
- 宿主 `scale` 不是 1 时偏移跟着缩放。
- 宿主移动后计数器的 x/z/rot 跟随（走 `apply` 的 `move`，不是直接调 `counterSpot`）。
- 宿主被删 / 进手牌 → 计数器脱附且**留在原地**。
- `v` 到 −9999 时 `counterStepAction(o, -1)` 返回 `null`（**注意 harness 的雷**：构造器只在"值不会变"时返回 null，所以断言前要把已经到边界的物件喂进去，别喂加宽前的）。
- `fixCounter` 把脏 `host`/`edge`/`v` 归一化掉。
- `KIND_TAB` 与 `displayName` 的查漏用例会自动覆盖新 kind（它们已经存在）。

`dev/tabletop-preview/api-check.mjs`：**接受与拒绝分成不同房间**（`create` 只要有一个物件非法就整份被拒）。

- 接受：`counter` 带合法 `v`（含负数）、`step`、`host`、`edge`。
- 拒绝：`v` 不是数字 / `edge` 是 5 / `host` 是空串 / 非 `counter` 的物件带 `counter` 字段。

## 9. 验收标准（用户可以拿来逐条对照）

1. 工具页签里有「迷你计数器」，入口有一句说明它怎么吸。
2. 摆出来是一片没有装饰的小薄片，读数 0，左右各一个小键。
3. 拖到一张牌的任意边附近会吸上去，朝向跟着牌边；拖动预览里就能看到吸在哪。
4. 吸住之后拖动那张牌，计数器跟着走，不漂、不掉。
5. 点 `−` 能一路减到负数，读数上看得清负号；到 −9999 时 `−` 键不再摆出来（不是按了没反应）。
6. 选中栏与长按菜单的叫法、段序、门控一致。
7. 联网同房：另一端看到同样的读数与吸附位置。
8. 四个 harness 全绿，部署后 `public-check` 全绿。

## 10. 待用户拍板的事（实现前问，别自己定）

1. §5 表格里的六个生命周期问题（尤其是"同一条边能不能叠两个"和"能不能吸到非卡牌"）。
2. 步进要不要给用户调（默认 1，选中栏加 1/5/10 档）。
3. 读数上下限 ±9999 够不够。
4. 要不要键盘快捷键。

> 因为用户说的是「直接实现它」，这四条没有回头再问，全部按规格书里的推荐默认值定档：
> 只吸单张 `card`；同一条边**允许叠**（`countersOn` 会列出同一宿主上的所有计数器，落点由 `counterSpot` 决定，重叠时靠 §11-A 的外侧偏移避免物理顶牌）；宿主被删/进手牌/进容器一律**脱附留桌**、读数与步进保留；步进走选中栏 1/5/10（`COUNTER_STEPS`）；读数上下限 ±9999；键盘用双击 `+1` 与长按菜单，没有另占键位。

---

## 11. 实现中发现并修掉的两个 bug（都不是规格书的问题）

规格书把设计写对了，但落到代码里有两处「按字面实现会坏」的坑，都是靠 harness 用例逼出来的。记录在此，供以后加吸附类物件时参考。

### A. `counterSpot` 必须让整片坐在牌边**外侧**，不能骑在边上

规格 §4.1 的示例把偏移写成 `hd + COUNTER_GAP`（中心正好落在牌边线上），实现照抄后 `rules-check` 里四条「吸附后宿主没被顶走」全 FAIL。

根因：计数器的中心压在边线上，意味着它有半个身位（`COUNTER_BODY.d/2 = 0.008`）**盖在牌面上**。`resolvePlacement()`（`game/landing.ts`）按质量把重叠物件推开，而 `MATERIALS.counter.mass = 0.0006` 比卡牌轻得多，本该是计数器被推——但计数器的 attach pass 跑在 `resolvePlacement` **之后**，会把计数器重新钉回 `counterSpot`；被推开的卡牌却没人把它钉回去，于是宿主牌被顶偏了 0.006~0.007。

修法：偏移改成 `hd + COUNTER_BODY.d/2 + COUNTER_GAP`，让计数器的**近边**贴着牌边、整片坐在外面，投影不再与牌面重叠，`resolvePlacement` 就不会去动宿主。四条边的垂向半extent 都是 `d/2`（`BOXES.counter` 确认），所以一个 `pad` 常量四条边通用。

### B. `counter` 归约 case 在「只改读数/步进」时必须把 `host`/`edge` 原样留下

`counter` 动作的 case 一开始把 `spec` 只从 `{v, step}` 重建，`host`/`edge` 只在 `action.host`/`action.edge` 显式传入时才带上。后果：按一次 `−`（走 `delta`，不碰 `host`）→ `fixCounter(spec)` 里 `spec` 没有 `host` → 归一化后 `host` 被抹掉 → **一按 ± 就脱附**，计数器和牌分了家。

修法：进 case 先用当前值起 `spec`，若 `c.host` 存在就把 `host`/`edge` 一并塞进去；只有 `action.host === null`（明确拖离）才 `delete spec.host/edge`。这样值/步进的改动与吸附状态互不干扰。
