/* 牌桌 · 3D 桌游沙盒 —— SPDX-License-Identifier: GPL-3.0-only
   Copyright (C) 2026 2652635090 · 许可全文见仓库根目录的 LICENSE */

/**
 * 房间权限表：房主把「哪些动作允许成员做」一项一项勾出来。
 *
 * 权限挂在房间记录上（不进 TableState），因为桌面状态是客户端整桌 CAS 写入的：
 * 写在状态里等于谁都能改自己的权限。服务端拿房主口令认人，按这份键表逐条放行。
 */
import type { Action, GameObject } from "./types";

/** 一条权限键控住的动作范围；键名一旦上线就别改，房间记录里存的就是这些字符串 */
export type PermKey =
  | "move" | "add" | "remove" | "pose" | "layer" | "flip" | "cards" | "hand"
  | "roll" | "count" | "edit" | "timer" | "calc" | "zone" | "chat"
  | "rename" | "seats" | "turn" | "board" | "clear"
  | "listing" | "rom" | "kick";

export type Perms = Partial<Record<PermKey, boolean>>;

/** 分组的中文界面：房主管理面板按这个顺序铺开关 */
export const PERM_GROUPS: { title: string; hint: string; items: { key: PermKey; label: string; hint: string }[] }[] = [
  {
    title: "桌面游玩",
    hint: "把东西摆上桌、摸牌掷骰这些日常动作",
    items: [
      { key: "move", label: "移动摆放", hint: "拖动桌上的物件" },
      { key: "add", label: "新增物件", hint: "从组件库往桌上放东西" },
      { key: "remove", label: "拿走物件", hint: "把桌上的东西收掉" },
      { key: "pose", label: "转角与缩放", hint: "Q/E 转体、R/F 俯仰、放大缩小" },
      { key: "layer", label: "高度与锁定", hint: "调层数、悬浮锁定" },
      { key: "roll", label: "掷骰与转盘", hint: "掷单颗、掷全部、拨转盘" },
      { key: "count", label: "计数与记分", hint: "加减文字标记的数值、移动计分轨上的棋子" },
    ],
  },
  {
    title: "卡牌",
    hint: "翻牌、摸牌、洗牌、编辑牌面",
    items: [
      { key: "flip", label: "翻牌", hint: "翻开或扣下卡牌与牌堆顶" },
      { key: "cards", label: "摸牌发牌", hint: "摸牌、抽取、收回、洗牌、切牌、均分、发牌、分堆" },
      { key: "hand", label: "手牌", hint: "拿进手牌与打出手牌" },
      { key: "edit", label: "编辑卡牌", hint: "改名、改卡面、换卡背、写效果" },
    ],
  },
  {
    title: "桌面小工具",
    hint: "区域垫、计时器、计算器与聊天",
    items: [
      { key: "zone", label: "区域与垫子", hint: "摆放、改尺寸、上隐私模式" },
      { key: "timer", label: "计时器", hint: "开始、暂停、重置；沙漏与桌上唱片机也归这一档" },
      { key: "calc", label: "计算器", hint: "按桌上的计算器" },
      { key: "chat", label: "聊天", hint: "发桌面消息" },
    ],
  },
  {
    title: "牌桌设置",
    hint: "整张桌子的公共设置，默认只有房主能动",
    items: [
      { key: "rename", label: "牌桌改名", hint: "改顶部那块牌桌名字" },
      { key: "seats", label: "玩家座位", hint: "让人入座、把人的名字移走" },
      { key: "turn", label: "回合推进", hint: "下一位、直接指定当前回合" },
      { key: "board", label: "更换棋盘", hint: "换一张棋盘或撤掉" },
      { key: "clear", label: "清空桌面", hint: "一次收走桌上所有东西" },
    ],
  },
  {
    title: "房间管理",
    hint: "关系到整个房间对外怎么样",
    items: [
      { key: "listing", label: "公开与挂牌", hint: "把房间挂进大厅或收回来" },
      { key: "rom", label: "定档存档", hint: "把这张桌子存成服务器存档" },
      { key: "kick", label: "移出成员", hint: "把某人踢出房间" },
    ],
  },
];

export const PERM_KEYS = PERM_GROUPS.reduce<PermKey[]>((all, g) => all.concat(g.items.map((i) => i.key)), []);

/** 「分配权限」本身永不下放：能改权限就等于能改一切 */
export const HOST_ONLY: PermKey[] = ["kick"];

/** 成员默认档：能正常玩，但动不了牌桌设置和房间管理 */
export const MEMBER_DEFAULT: Perms = (() => {
  const out: Perms = {};
  for (const key of PERM_KEYS) out[key] = !["rename", "seats", "turn", "board", "clear", "listing", "rom", "kick"].includes(key);
  // 回合推进是玩的一部分：轮到谁都往下走一位，不该卡房主
  out.turn = true;
  return out;
})();

export const ALL_OPEN: Perms = PERM_KEYS.reduce((out, key) => ({ ...out, [key]: key !== "kick" }), {} as Perms);
export const ALL_SHUT: Perms = PERM_KEYS.reduce((out, key) => ({ ...out, [key]: false }), {} as Perms);

export function permLabel(key: PermKey): string {
  for (const group of PERM_GROUPS) {
    const hit = group.items.find((i) => i.key === key);
    if (hit) return hit.label;
  }
  return key;
}

/** 收口来自服务端的权限表：只认已知键与真正的布尔值 */
export function fixPerms(raw: unknown): Perms {
  const out: Perms = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const key of PERM_KEYS) {
    const value = (raw as Record<string, unknown>)[key];
    if (typeof value === "boolean") out[key] = value;
  }
  return out;
}

/** 没写明的键按成员默认档算：这样以后新增权限键不会把老房间的成员卡死 */
export function allowed(perms: Perms | null | undefined, key: PermKey): boolean {
  const hit = perms?.[key];
  return hit === undefined ? MEMBER_DEFAULT[key] === true : hit;
}

/** 一条意图归哪个权限管；null 表示不需要权限（本地桌与未知动作） */
export function actionPerm(action: Action): PermKey | null {
  switch (action.t) {
    case "move": return "move";
    case "add": case "addMany": return "add";
    case "remove": return "remove";
    case "rot": case "rotReset": case "scale": return "pose";
    case "layer": case "pin": return "layer";
    case "flip": case "turnCards": return "flip";
    case "draw": case "pull": case "putBack": case "pour": case "shuffle": case "cut": case "even": case "deal": case "split": return "cards";
    case "hand": return "hand";
    case "roll": return "roll";
    case "spin": case "spinSet": return "roll";
    case "mark": case "markClear": case "trackSet": return "count";
    case "count": return "count";
    // 迷你计数器：改读数跟计数标记同一档；带 host/edge 是把它挪到另一张牌或另一条边上，按「移动」管
    case "counter": return action.host !== undefined || action.edge !== undefined ? "move" : "count";
    case "label": case "color": case "pileSet": case "cardSet": case "backSet": case "effect": return "edit";
    // 唱片机跟计时器是同一种东西：桌上一个会自己往下走的公共装置，开始/暂停都归这一档
    case "timer": case "hour": case "gram": case "mp3": case "tablet": return "timer";
    case "calcKey": return "calc";
    case "book": return "edit";
    case "zone": case "stat": case "slot": case "tray": case "lock": case "grid": case "snap": case "mesh": case "shield": return "zone";
    case "chat": return "chat";
    case "rename": return "rename";
    case "playerAdd": case "playerRemove": return "seats";
    case "turnSet": case "turnNext": return "turn";
    case "boardSet": return "board";
    case "clear": return "clear";
    // 整套桌面换样子，比清空更狠，所以按「清空桌面」这一档管
    case "presetLoad": return "clear";
    // 摆回开局会一次收掉盘上所有子：跟清空同一条权限，成员默认档动不了别人的棋局
    case "reset": return "clear";
    default: return null;
  }
}

/* ——— 游戏模式：把「摆桌子」那一套收起来，只留正常游玩 ——— */

/**
 * 游戏模式挡掉的意图。删东西、改内容、换整桌这些开桌前做完就该收手的动作全在里面；
 * 一个动作同时能「玩」和「改规格」时要拆开看：规则书翻页不算改正文、放唱片不算换唱片、
 * 区域改尺寸不算改名，所以那几条只在自己带了编辑字段（名字、垫面图、曲名）才算越界。
 */
export function gameShut(action: Action): boolean {
  switch (action.t) {
    case "remove": case "clear": case "rename": case "boardSet": case "reset": case "presetLoad": return true;
    case "label": case "color": case "pileSet": case "cardSet": case "backSet": case "effect": return true;
    // 等分数、刻度数、槽位数是这装置的规格，改了会把当前的结果抹掉，属于开桌前的活
    case "spinSet": case "trackSet": case "slot": return true;
    case "zone": case "shield": return action.label !== undefined || ("img" in action && action.img !== undefined);
    case "book": return action.pages !== undefined;
    case "gram": return action.clip !== undefined || action.name !== undefined;
    // 随身听：刻歌、改名、共享收回去开桌前的活；共享出去之后的放停跳段音量跟唱片机一样照常按
    case "mp3": return action.clip !== undefined || action.name !== undefined || action.shared !== undefined;
    // 平板：填地址与关掉页面是开桌前备内容的活；放映、跳段、换集、静音、重新载入都算玩
    case "tablet": return action.url !== undefined;
    // 迷你计数器：加减读数是玩的过程，步进档是这装置的规格，开桌前调好就收手
    case "counter": return action.step !== undefined;
    default: return false;
  }
}

/** 被挡下来时说的话：告诉人是哪一层锁的，也告诉他去哪解锁 */
export const GAME_SHUT_HINT = "游戏模式进行中：编辑与删除已收起，要改桌子请在「管理」里退出游戏模式";

/* ——— 状态级判定：客户端用它把「这条改动属于哪个权限」说得跟服务端一致 ——— */

/** 一个物件相对上一版改了哪一类；返回 null 表示没改 */
export function changePerm(before: GameObject, after: GameObject): PermKey | null {
  if (before.kind !== after.kind) return "add";
  if (before.x !== after.x || before.z !== after.z) return "move";
  if (before.rot !== after.rot || before.tilt !== after.tilt || before.scale !== after.scale) return "pose";
  if (before.layer !== after.layer || before.pin !== after.pin) return "layer";
  if (before.faceUp !== after.faceUp) return "flip";
  // 牌屏主人换人改的是「这块屏算谁的」，和区域垫同一条权限；它不是手牌归属
  if (after.kind === "shield" && (before.owner !== after.owner || JSON.stringify(before.shield ?? null) !== JSON.stringify(after.shield ?? null))) return "zone";
  if (before.owner !== after.owner || before.hand !== after.hand) return "hand";
  if (JSON.stringify(before.pile ?? null) !== JSON.stringify(after.pile ?? null)) return "cards";
  if (before.value !== after.value) return "roll";
  // 转盘停在第几格是一次随机结果，和掷骰同一条权限
  if (JSON.stringify(before.spinner ?? null) !== JSON.stringify(after.spinner ?? null)) return "roll";
  if (before.count !== after.count) return "count";
  // 计分轨上每人一枚：动它就是记分，和文字标记的加减同一条权限
  if (JSON.stringify(before.track ?? null) !== JSON.stringify(after.track ?? null)) return "count";
  // 迷你计数器：换宿主或换边是把它挪了个地方，跟拖动同一条权限；只改读数与步进算记分
  if (JSON.stringify(before.counter ?? null) !== JSON.stringify(after.counter ?? null)) {
    return before.counter?.host !== after.counter?.host || before.counter?.edge !== after.counter?.edge ? "move" : "count";
  }
  if (before.duration !== after.duration || before.left !== after.left || before.endsAt !== after.endsAt
    || JSON.stringify(before.hour ?? null) !== JSON.stringify(after.hour ?? null)
    || JSON.stringify(before.gram ?? null) !== JSON.stringify(after.gram ?? null)
    || JSON.stringify(before.mp3 ?? null) !== JSON.stringify(after.mp3 ?? null)
    || JSON.stringify(before.tablet ?? null) !== JSON.stringify(after.tablet ?? null)) return "timer";
  if (JSON.stringify(before.calc ?? null) !== JSON.stringify(after.calc ?? null)) return "calc";
  if (JSON.stringify(before.zone ?? null) !== JSON.stringify(after.zone ?? null) || before.priv !== after.priv || before.pref !== after.pref
    || JSON.stringify(before.stat ?? null) !== JSON.stringify(after.stat ?? null) || JSON.stringify(before.slot ?? null) !== JSON.stringify(after.slot ?? null)
    || JSON.stringify(before.tray ?? null) !== JSON.stringify(after.tray ?? null)
    || before.lock !== after.lock || before.grid !== after.grid || before.snap !== after.snap || before.mesh !== after.mesh) return "zone";
  if (before.label !== after.label || before.color !== after.color || before.backImg !== after.backImg
    || JSON.stringify(before.card ?? null) !== JSON.stringify(after.card ?? null)
    || JSON.stringify(before.book ?? null) !== JSON.stringify(after.book ?? null)) return "edit";
  if (before.len !== after.len || before.sides !== after.sides || before.shape !== after.shape
    || JSON.stringify(before.board ?? null) !== JSON.stringify(after.board ?? null)) return "edit";
  return null;
}

/** 整桌 diff 里成员这次动了哪些权限：给管理面板的「谁刚才干了什么」和客户端预检用 */
export function touchedPerms(prev: GameObject[], next: GameObject[]): Set<PermKey> {
  const out = new Set<PermKey>();
  const before = new Map(prev.map((o) => [o.id, o]));
  const after = new Map(next.map((o) => [o.id, o]));
  // 和服务端 gateState 同一条口径：空桌上多出来的棋盘算「新增物件」，换掉已有的才算「更换棋盘」
  const hadBoard = prev.some((o) => o.kind === "board");
  for (const [id, o] of after) {
    const old = before.get(id);
    if (!old) { out.add(o.kind === "board" && hadBoard ? "board" : "add"); continue; }
    if (o.kind === "board" && JSON.stringify(o.board) !== JSON.stringify(old.board)) { out.add("board"); continue; }
    const key = changePerm(old, o);
    if (key) out.add(key);
  }
  for (const [id, o] of before) {
    if (after.has(id)) continue;
    if (o.kind === "board") out.add("board");
    else if (prev.length > 1 && next.length === 0) out.add("clear");
    else out.add("remove");
  }
  return out;
}
