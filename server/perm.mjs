/* 牌桌 · 3D 桌游沙盒 —— SPDX-License-Identifier: GPL-3.0-only
   Copyright (C) 2026 2652635090 · 许可全文见仓库根目录的 LICENSE */

// 权限表的第二份写法：game/perm.ts 是客户端那份，这里是服务端执行用的。
// 与 validState 一样，服务端不能信任客户端的归类，所以照抄一份口径；
// 两边的键名、默认档和归类顺序必须一致，改一边就同时改另一边。
const PERM_KEYS = [
  "move", "add", "remove", "pose", "layer", "flip", "cards", "hand",
  "roll", "count", "edit", "timer", "calc", "zone", "chat",
  "rename", "seats", "turn", "board", "clear",
  "listing", "rom", "kick",
];

/** 界面上的中文名：被拦下时给用户看的是这个，不是内部键名 */
const PERM_LABEL = {
  move: "移动摆放", add: "新增物件", remove: "拿走物件", pose: "转角与缩放", layer: "高度与锁定",
  flip: "翻牌", cards: "摸牌发牌", hand: "手牌", roll: "掷骰与转盘", count: "计数与记分",
  edit: "编辑卡牌", timer: "计时器", calc: "计算器", zone: "区域与垫子", chat: "聊天",
  rename: "牌桌改名", seats: "玩家座位", turn: "回合推进", board: "更换棋盘", clear: "清空桌面",
  listing: "公开与挂牌", rom: "定档存档", kick: "移出成员",
};

/** 成员默认档：能正常玩，动不了牌桌设置和房间管理；回合推进算游玩的一部分 */
const MEMBER_DEFAULT = {
  move: true, add: true, remove: true, pose: true, layer: true, roll: true, count: true,
  flip: true, cards: true, hand: true, edit: true,
  timer: true, calc: true, zone: true, chat: true,
  rename: false, seats: false, turn: true, board: false, clear: false,
  listing: false, rom: false, kick: false,
};

function fixPerms(raw) {
  const out = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const key of PERM_KEYS) if (typeof raw[key] === "boolean") out[key] = raw[key];
  return out;
}

function allowed(perms, key) {
  const hit = perms?.[key];
  return hit === undefined ? MEMBER_DEFAULT[key] === true : hit;
}

function same(a, b) {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

/** 一个物件相对上一版改了哪一类；null 表示没实质改动 */
function changePerm(before, after) {
  if (before.kind !== after.kind) return "add";
  if (before.x !== after.x || before.z !== after.z) return "move";
  if (before.rot !== after.rot || before.tilt !== after.tilt || before.scale !== after.scale) return "pose";
  if (before.layer !== after.layer || before.pin !== after.pin) return "layer";
  if (before.faceUp !== after.faceUp) return "flip";
  // 牌屏换主人是「这块屏算谁的」，跟区域垫一条权限，不是手牌归属
  if (after.kind === "shield" && (before.owner !== after.owner || !same(before.shield, after.shield))) return "zone";
  if (before.owner !== after.owner || before.hand !== after.hand) return "hand";
  if (!same(before.pile, after.pile)) return "cards";
  if (before.value !== after.value) return "roll";
  if (!same(before.spinner, after.spinner)) return "roll";
  if (before.count !== after.count) return "count";
  if (!same(before.track, after.track)) return "count";
  // 迷你计数器：换宿主或换边是把它挪了个地方，跟拖动同一条权限；只改读数与步进算记分
  if (!same(before.counter, after.counter))
    return before.counter?.host !== after.counter?.host || before.counter?.edge !== after.counter?.edge ? "move" : "count";
  // 唱片机跟沙漏一样是桌上会自己往下走的公共装置，播放状态也归「计时器」这一档；随身听与平板浏览器同理
  if (before.duration !== after.duration || before.left !== after.left || before.endsAt !== after.endsAt
    || !same(before.hour, after.hour) || !same(before.gram, after.gram) || !same(before.mp3, after.mp3)
    || !same(before.tablet, after.tablet)) return "timer";
  if (!same(before.calc, after.calc)) return "calc";
  if (!same(before.zone, after.zone) || before.priv !== after.priv || before.pref !== after.pref
    || !same(before.stat, after.stat) || !same(before.slot, after.slot) || !same(before.tray, after.tray) || before.lock !== after.lock
    || before.grid !== after.grid || before.snap !== after.snap || before.mesh !== after.mesh) return "zone";
  if (before.label !== after.label || before.color !== after.color || before.backImg !== after.backImg
    || !same(before.card, after.card) || !same(before.book, after.book)) return "edit";
  if (before.len !== after.len || before.sides !== after.sides || before.shape !== after.shape
    || !same(before.board, after.board)) return "edit";
  return null;
}

/**
 * 逐物件收口：把成员没有权限的那部分改动退回上一版，其余照常落地。
 * 桌面是整桌 CAS 写入的，服务端拿不到「这条意图是谁发的」，只能从两份状态的差里还原。
 * 改过客户端的人绕过不了这一层吗？绕得过——但误操作和默认档越权拦得住，
 * 而且房间设置（公开私密、权限表、踢人）走的是口令，那一层绕不过。
 */
function gateState(before, after, perms) {
  const denied = new Set();
  const prev = new Map((before.o ?? []).map((o) => [o.id, o]));
  // 空桌上摆一块棋盘是「新增物件」，把已有的那张换掉才是「更换棋盘」
  const hadBoard = (before.o ?? []).some((o) => o.kind === "board");
  const kept = [];
  for (const o of after.o ?? []) {
    const old = prev.get(o.id);
    if (!old) {
      const key = o.kind === "board" && hadBoard ? "board" : "add";
      if (!allowed(perms, key)) { denied.add(key); continue; }
      kept.push(o);
      continue;
    }
    if (o.kind === "board" && !same(o.board, old.board)) {
      if (!allowed(perms, "board")) { denied.add("board"); kept.push(old); continue; }
      kept.push(o);
      continue;
    }
    const key = changePerm(old, o);
    if (key && !allowed(perms, key)) {
      denied.add(key);
      // 位置也要退回：只回字段不回坐标会让人看到一张卡在别人手里的牌
      kept.push(old);
      continue;
    }
    kept.push(o);
  }
  const now = new Set(kept.map((o) => o.id));
  const removed = (before.o ?? []).filter((o) => !now.has(o.id));
  if (removed.length) {
    // 一次收走整张桌子是「清空」，单件消失是「拿走」；棋盘无论哪种都归 board 管
    const wiping = (before.o ?? []).length > 1 && (after.o ?? []).length === 0;
    for (const o of removed) {
      const key = o.kind === "board" ? "board" : wiping ? "clear" : "remove";
      if (allowed(perms, key)) continue;
      denied.add(key);
      kept.push(o);
    }
  }

  let name = after.name;
  if (name !== before.name && !allowed(perms, "rename")) { denied.add("rename"); name = before.name; }
  let players = after.players;
  if (!same(after.players, before.players) && !allowed(perms, "seats")) { denied.add("seats"); players = before.players; }
  let turn = after.turn;
  let step = after.step;
  if ((turn !== before.turn || step !== before.step) && !allowed(perms, "turn")) {
    denied.add("turn");
    turn = before.turn;
    step = before.step;
  }
  let log = after.log;
  if (Array.isArray(after.log) && Array.isArray(before.log) && after.log.length > before.log.length && !allowed(perms, "chat")) {
    denied.add("chat");
    log = before.log;
  }
  return { state: { ...after, name, players, turn, step, log, o: kept }, denied: [...denied] };
}

/** 被拦下的人看到的是一句人话，不是一串键名 */
function deniedHint(denied) {
  if (!denied.length) return "";
  const words = denied.map((key) => PERM_LABEL[key] ?? key).slice(0, 3);
  return `房主未开放：${words.join("、")}`;
}

export { PERM_KEYS, PERM_LABEL, MEMBER_DEFAULT, fixPerms, allowed, changePerm, gateState, deniedHint };
