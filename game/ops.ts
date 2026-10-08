/* 牌桌 · 3D 桌游沙盒 —— SPDX-License-Identifier: GPL-3.0-only
   Copyright (C) 2026 2652635090 · 许可全文见仓库根目录的 LICENSE */

import { AUDIO_KEY, BOOK_CHARS, BOOK_PAGE_MAX, COUNTER_STEP_MAX, COUNTER_STEP_MIN, COUNTER_V_MAX, COUNTER_V_MIN, GRAM_NAME_MAX, GUARD_MAX, GUARD_MIN, HOUR_DEFAULT, HOUR_MAX, HOUR_MIN, MP3_DUR_MAX, MP3_NAME_MAX, PALETTE, REACH_DEFAULT, REACH_MAX, REACH_MIN, SHIELD_H_MAX, SHIELD_H_MIN, SHIELD_MAX, SHIELD_MIN, SLOT_MAX, SLOT_MIN, SPIN_MAX, SPIN_MIN, STAT_MAX, STAT_MIN, TABLE, TABLET_PAGE_MAX, TABLET_POS_MAX, TABLET_REV_MAX, biliOf, TIMER_MAX, TIMER_MIN, TRACK_DEFAULT, TRACK_MARK_MAX, TRACK_MAX, TRACK_MIN, TRAY_MAX, TRAY_MIN, ZONE_MAX, ZONE_MIN, deg360, fixBook, fixCounter, fixGram, fixHour, fixMp3, fixShield, fixSlot, fixSpinner, fixTablet, fixTrack, fixTray, footprintOf, gramPos, gridable, inTable, inZone, isContainer, lockable, mp3Pos, presetOf, remainingOf, slotCards, slotSize, slotSpot, tabletPos, trackMark, uid } from "./catalog";
import { CALC_KEYS, calcPress } from "./calc";
import { makeArrow, makeBoard, makeBook, makeCalc, makeCard, makeContainer, makeCounter, makeDie, makeGram, makeHandCard, makeHourglass, makeMat, makeMp3, makePad, makePile, makePiece, makePointer, makeShield, makeSlotStrip, makeSpinner, makeStatMat, makeTablet, makeText, makeTimer, makeToken, makeTrack, makeTray, makeZone, nextSpot } from "./factory";
import { tabletAddr } from "./tablet";
import { MAX_OBJECTS, MAX_PILE } from "./state";
import { resolveDrop } from "./landing";
import type { MovePoint } from "./rules";
import type { Action, CardSpec, GameObject, Move, TableState } from "./types";

export const DICE_SIDES = [4, 6, 8, 12, 20];
export const PLAYER_COLORS = PALETTE;

export function randInt(max: number): number {
  return Math.floor(Math.random() * max);
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

export function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function round(v: number): number {
  return Math.round(v * 1000) / 1000;
}

/** 掷骰：点数在这里定稿并写入动作，其他端只重放表现 */
export function rollAction(objects: GameObject[], ids: string[]): { action: Action; ids: string[] } | null {
  const r = objects
    .filter((o) => o.kind === "die" && ids.includes(o.id))
    .map((d) => ({ id: d.id, value: 1 + randInt(d.sides ?? 6) }));
  if (!r.length) return null;
  return { action: { t: "roll", r }, ids: r.map((x) => x.id) };
}

export function rollAllAction(objects: GameObject[]): { action: Action; ids: string[] } | null {
  return rollAction(objects, objects.filter((o) => o.kind === "die").map((o) => o.id));
}

/** 摸牌落点要用到座位和自己的区域，所以收桌面切片而不是完整状态 */
export type TableCtx = { o: GameObject[]; players?: { id: string }[] };

/** 摸牌/抓取弹出方向：朝自己的落牌区，没有就朝自己的座位，都没有就从牌堆右侧出来 */
function ejectDir(state: TableCtx, pile: GameObject, meId: string): { x: number; z: number } {
  const home = preferredZoneOf(state, meId);
  if (home) {
    const dx = home.x - pile.x;
    const dz = home.z - pile.z;
    const len = Math.hypot(dx, dz);
    if (len > 0.18) return { x: dx / len, z: dz / len };
  }
  const seats = Math.max(1, state.players?.length ?? 0);
  const idx = Math.max(0, (state.players ?? []).findIndex((p) => p.id === meId));
  const angle = (idx / seats) * Math.PI * 2;
  return { x: Math.sin(angle), z: Math.cos(angle) };
}

/**
 * 摸牌落点：从容器侧面弹出一排，牌头朝外，各人朝自己的座位方向，所以同抢一叠也不会叠成一坨。
 * rot 用牌自己的长轴（局部 Z）去对齐弹出方向。
 */
export function ejectSpots(state: TableCtx, pile: GameObject, n: number, meId: string): { x: number; z: number; rot: number }[] {
  const dir = ejectDir(state, pile, meId);
  const perp = { x: -dir.z, z: dir.x };
  const reach = footprintOf(pile) + 0.062;
  const gap = n > 1 ? Math.min(0.07, 0.42 / n) : 0;
  const start = -((n - 1) * gap) / 2;
  const rot = Math.round((((Math.atan2(-dir.x, dir.z) * 180) / Math.PI) % 360 + 360) % 360);
  return Array.from({ length: n }, (_, i) => {
    const off = start + i * gap;
    const at = inTable(pile.x + dir.x * reach + perp.x * off, pile.z + dir.z * reach + perp.z * off);
    return { x: round(at.x), z: round(at.z), rot };
  });
}

/** 从容器顶上取 n 张牌：顺序取顶牌，random 为真时随机抓 */
function takeCards(pile: GameObject, n: number, random: boolean): CardSpec[] {
  const pool = pile.pile ?? [];
  const count = Math.min(n, pool.length);
  if (!random) return pool.slice(-count);
  const out: CardSpec[] = [];
  const rest = pool.slice();
  for (let i = 0; i < count; i++) out.push(rest.splice(randInt(rest.length), 1)[0]);
  return out;
}

/** 摸牌：从容器侧面弹出一排 */
export function drawAction(state: TableCtx, pileId: string, n: number, meId = ""): Action | null {
  const pile = state.o.find((o) => o.id === pileId);
  if (!pile?.pile?.length) return null;
  const picked = takeCards(pile, n, false);
  const spots = ejectSpots(state, pile, picked.length, meId);
  const to = picked.map((card, i) => ({ ...makeCard(card, pile.color ?? PALETTE[1], spots[i], pile.faceUp !== false, pile.backImg), rot: spots[i].rot }));
  return { t: "draw", id: pileId, to };
}

/** 摸进手牌：牌离开容器但不落到桌面；random 为真时按袋子里随机抓 */
export function drawToHandAction(objects: GameObject[], containerId: string, n: number, owner: string, random = false): Action | null {
  const pile = objects.find((o) => o.id === containerId);
  if (!pile?.pile?.length) return null;
  const to = takeCards(pile, n, random).map((card) => makeHandCard(card, pile.color ?? PALETTE[1], owner, pile.backImg));
  return { t: "draw", id: containerId, to };
}

/** 从袋子里随机抓取：不看顺序，摸到哪张算哪张，同样从袋口侧面弹出 */
export function grabAction(state: TableCtx, containerId: string, n: number, meId = ""): Action | null {
  const pile = state.o.find((o) => o.id === containerId);
  if (!pile?.pile?.length) return null;
  const picked = takeCards(pile, n, true);
  const spots = ejectSpots(state, pile, picked.length, meId);
  const to = picked.map((card, i) => ({ ...makeCard(card, pile.color ?? PALETTE[1], spots[i], pile.faceUp !== false, pile.backImg), rot: spots[i].rot }));
  return { t: "draw", id: containerId, to };
}

/**
 * 收纳列表里精确取出一张：按堆内下标摘牌，同名牌也不会拿错。
 * 有首选落牌区就摊进区域，否则弹到容器侧面；toHand 为真时直接进手牌。
 * pick 与摸 1 张那一下共用同一套落点选择（见 drawIntoAction）。
 */
export function pullCardAction(state: TableCtx, containerId: string, index: number, meId: string, toHand = false, pick: DrawPick = null): Action | null {
  const o = state.o.find((x) => x.id === containerId);
  const spec = o?.pile?.[index];
  if (!o?.pile || !spec) return null;
  const color = o.color ?? PALETTE[1];
  const to = toHand
    ? makeHandCard(spec, color, meId, o.backImg)
    : (() => {
        const zone = drawZoneOf(state, meId, pick);
        if (zone) return makeCard(spec, color, zoneSpots(zone, 1)[0], true, o.backImg);
        const spot = ejectSpots(state, o, 1, meId)[0];
        return { ...makeCard(spec, color, spot, o.faceUp !== false, o.backImg), rot: spot.rot };
      })();
  return { t: "pull", id: containerId, index, to };
}

/** 把选中的牌拿进手牌 / 把手牌打回桌面 */
export function handAction(ids: string[], owner: string | null, at?: { x: number; z: number }, faceUp = true): Action {
  return { t: "hand", ids, owner, at, faceUp };
}

/** 打出手牌：默认落在本侧桌沿 */
export function playHandAction(ids: string[], at?: { x: number; z: number }): Action {
  return { t: "hand", ids, owner: null, at: at ?? { x: 0, z: TABLE.d / 2 - 0.14 }, faceUp: true };
}

/** 体积缩放：按倍数放大缩小，各端按同一因子归约 */
export function scaleAction(ids: string[], factor: number): Action {
  return { t: "scale", ids, factor };
}

/** 转角归零：把调过的朝向与俯仰一起退回 0°（键盘 Z） */
export function rotResetAction(ids: string[]): Action {
  return { t: "rotReset", ids };
}

/**
 * 一键摆正全场：把所有还歪着的物件（朝向或俯仰非零）退回 0°。
 * 挑出真正有转过的才进 ids，一个都没歪就返回 null，按钮也就不会出现。
 */
export function straightenAllAction(objects: GameObject[]): Action | null {
  const ids = objects.filter((o) => o.kind !== "board" && !o.hand && (o.rot || o.tilt)).map((o) => o.id);
  return ids.length ? rotResetAction(ids) : null;
}

/**
 * 微调落点：把选中的物件朝某个方向挪一小步（键盘 Shift+方向键，一步 1cm）。
 * 只留还没被锁掉、且能挪动的物件；一格都没得挪就返回 null。
 */
export function nudgeAction(objects: GameObject[], ids: string[], dx: number, dz: number): Action | null {
  const set = new Set(ids);
  const m = objects
    .filter((o) => set.has(o.id) && o.kind !== "board" && !o.hand)
    .map((o) => ({ id: o.id, x: round(o.x + dx), z: round(o.z + dz) }));
  return m.length ? { t: "move", m } : null;
}

export function shuffleAction(objects: GameObject[], pileId: string): Action | null {
  const pile = objects.find((o) => o.id === pileId);
  if (!pile?.pile?.length) return null;
  const cards = pile.pile.slice();
  for (let i = cards.length - 1; i > 0; i--) {
    const j = randInt(i + 1);
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  return { t: "shuffle", id: pileId, cards };
}

/** 把桌面散牌收进指定牌堆底部：ids 给了就只收选中的那些，没给才扫全场散牌 */
export function gatherAction(objects: GameObject[], pileId: string, ids?: string[]): Action | null {
  if (!objects.some((o) => o.id === pileId)) return null;
  const wanted = ids?.length ? new Set(ids) : null;
  const loose = objects
    .filter((o) => o.kind === "card" && o.card && !o.hand && (!wanted || wanted.has(o.id)))
    .sort((a, b) => a.z - b.z || a.x - b.x);
  if (!loose.length) return null;
  return {
    t: "putBack",
    id: pileId,
    cardIds: loose.map((o) => o.id),
    cards: loose.map((o) => o.card as CardSpec),
  };
}

/**
 * 整堆倒进另一个容器：弃牌堆倒回牌库就靠它。
 * flip=true 是「扣着翻回来」——倒之前先把顺序反一遍，翻面后正好接上原来的牌序。
 */
export function pourAction(objects: GameObject[], fromId: string, toId: string, flip = false): Action | null {
  const from = objects.find((o) => o.id === fromId);
  const to = objects.find((o) => o.id === toId);
  if (!from || !to || from.id === to.id || !isContainer(from) || !isContainer(to)) return null;
  if (!from.pile?.length) return null;
  return { t: "pour", from: from.id, to: to.id, flip };
}

/**
 * 同名牌分成一叠，扑克按花色分成四叠，而不是每张都单独一叠。
 */
export function cardKindOf(spec?: CardSpec): string {
  if (!spec) return "空白卡";
  if (spec.label) return spec.label;
  if (spec.suit) return { s: "♠", h: "♥", d: "♦", c: "♣" }[spec.suit];
  if (spec.rank) return spec.rank;
  if (spec.art) return spec.art;
  return spec.img ? "图片卡" : `卡背 ${spec.back}`;
}

/**
 * 框选出来的散牌按牌面分成若干叠：同名/同花色各自成一叠，摆在原来靠一起的地方。
 * 分堆结果由发起方算好写进动作，别的端只是重放，所以不会因为随机数各算一份。
 */
export function splitPilesAction(objects: GameObject[], ids: string[]): Action | null {
  const wanted = ids.length ? new Set(ids) : null;
  const loose = objects
    .filter((o) => o.kind === "card" && o.card && !o.hand && (!wanted || wanted.has(o.id)))
    .sort((a, b) => a.z - b.z || a.x - b.x);
  if (loose.length < 2) return null;
  const groups = new Map<string, GameObject[]>();
  for (const o of loose) {
    const key = cardKindOf(o.card);
    const list = groups.get(key);
    if (list) list.push(o);
    else groups.set(key, [o]);
  }
  if (groups.size < 2) return null;
  const sorted = [...groups.entries()].sort((a, b) => {
    const az = a[1].reduce((s, o) => s + o.z, 0) / a[1].length;
    const bz = b[1].reduce((s, o) => s + o.z, 0) / b[1].length;
    return az - bz || a[0].localeCompare(b[0]);
  });
  // 一排放不开就换行：牌堆之间留 0.1m，比两张牌的碰撞直径还宽，落下去不会再被挤开
  const perRow = Math.max(1, Math.min(sorted.length, Math.floor(TABLE.w / 0.12)));
  const rows = Math.ceil(sorted.length / perRow);
  const cx = loose.reduce((s, o) => s + o.x, 0) / loose.length;
  const cz = loose.reduce((s, o) => s + o.z, 0) / loose.length;
  const piles = sorted.map(([key, list], i) => {
    const spot = inTable(
      cx + ((i % perRow) - (Math.min(perRow, sorted.length) - 1) / 2) * 0.12,
      cz + (Math.floor(i / perRow) - (rows - 1) / 2) * 0.12,
    );
    const cards = list.map((o) => o.card as CardSpec);
    return { ...makePile(cards, list[0].color ?? PALETTE[1], spot, list.every((o) => o.faceUp !== false)), label: key.slice(0, 12) };
  });
  return { t: "split", ids: loose.map((o) => o.id), piles };
}

/** 均分最多分成几叠：跟座位上限一个数，八个人的牌墙也能一分 */
export const EVEN_MAX_PILES = 8;

/**
 * 切牌：把牌堆顶上 at 张整叠扣到底下，一张牌也不增减。
 * 不给 at 就切中点（手里切牌就是这么切的），位次一律夹在 [1, n-1]，免得切出个「原样不动」。
 */
export function cutAction(objects: GameObject[], pileId: string, at?: number): Action | null {
  const pile = objects.find((o) => o.id === pileId);
  const n = pile?.pile?.length ?? 0;
  if (pile?.kind !== "pile" || n < 2) return null;
  return { t: "cut", id: pileId, at: Math.max(1, Math.min(n - 1, Math.round(at ?? n / 2))) };
}

/**
 * 均分牌堆：分成 n 份，源堆留在原位拿第一份，其余各份在源堆旁边摊成一排。
 * 从顶牌开始一份份数，多出的一两张补给头几份，所以各份最多差一张。
 */
export function evenSplitAction(objects: GameObject[], pileId: string, n: number): Action | null {
  const src = objects.find((o) => o.id === pileId);
  const cards = src?.pile ?? [];
  if (!src || !cards.length) return null;
  const parts = Math.max(2, Math.min(EVEN_MAX_PILES, Math.floor(n)));
  if (cards.length < parts) return null;
  const base = Math.floor(cards.length / parts);
  const rem = cards.length % parts;
  // 顶牌在数组末尾，所以从后往前一份份切下来
  const groups: CardSpec[][] = [];
  let cursor = cards.length;
  for (let i = 0; i < parts; i++) {
    const size = base + (i < rem ? 1 : 0);
    groups.push(cards.slice(cursor - size, cursor));
    cursor -= size;
  }
  // 往空的那一边排开，第一叠就隔一个间距：源堆自己占着 i=0 的位置。0.12m 比两张牌的碰撞直径还宽，排下去不会互相挤开；
  // 桌子一半宽 1.2m，最多 8 叠也只用掉 0.84m，不会被 inTable 夹回来叠在一块
  const roomR = TABLE.w / 2 - src.x;
  const roomL = src.x + TABLE.w / 2;
  const dir = roomR >= roomL ? 1 : -1;
  const piles = groups.map((group, i) => {
    if (i === 0) return { ...src, pile: group };
    const spot = inTable(src.x + dir * 0.12 * i, src.z);
    // 新摊的几叠跟源堆一个朝向、一个卡背：一摞牌分开放还是那一摞的样子
    return { ...makePile(group, src.color ?? PALETTE[1], spot, src.faceUp !== false), ...(src.backImg ? { backImg: src.backImg } : {}) };
  });
  return { t: "even", id: pileId, piles };
}

/** 均分档位：2/3/4 叠是常用分法，坐下 5~8 人再补那一档；张数不够分的档位不摆出来，免得摆一颗按不动的按钮 */
export function splitParts(n: number, players: number): number[] {
  const seats = Math.min(8, players);
  const want = [2, 3, 4, ...(seats >= 5 ? [seats] : [])];
  return [...new Set(want)].filter((parts) => n >= parts).sort((a, b) => a - b);
}

/** 按座位平均发牌，扣放在各自面前 */
export function dealAction(objects: GameObject[], state: TableCtx, pileId: string, perPlayer: number): Action | null {
  const pile = objects.find((o) => o.id === pileId);
  if (!pile?.pile?.length) return null;
  const seats = Math.max(1, Math.min(8, state.players?.length || 2));
  const need = Math.min(perPlayer * seats, pile.pile.length);
  const picked = pile.pile.slice(-need);
  const to: GameObject[] = [];
  for (let s = 0; s < seats; s++) {
    const slice = picked.slice(s * perPlayer, s * perPlayer + perPlayer);
    const angle = (s / seats) * Math.PI * 2;
    const cx = Math.sin(angle) * (TABLE.w / 2 - 0.34);
    const cz = Math.cos(angle) * (TABLE.d / 2 - 0.22);
    slice.forEach((card, i) => {
      to.push(makeCard(card, pile.color ?? PALETTE[1], {
        x: clamp(cx + (i - slice.length / 2) * 0.062, -TABLE.w / 2 + 0.06, TABLE.w / 2 - 0.06),
        z: clamp(cz, -TABLE.d / 2 + 0.08, TABLE.d / 2 - 0.08),
      }, false, pile.backImg));
    });
  }
  return { t: "deal", piles: [{ id: pileId, cards: pile.pile.slice(0, pile.pile.length - picked.length) }], to };
}

export function duplicateAction(objects: GameObject[], ids: string[]): Action | null {
  const source = objects.filter((o) => ids.includes(o.id) && o.kind !== "board");
  if (!source.length) return null;
  const copies = source.map((o) => {
    const spot = nextSpot();
    return { ...clone(o), id: uid(), x: spot.x, z: spot.z };
  });
  return copies.length === 1
    ? { t: "add", o: copies[0] }
    : { t: "addMany", o: copies, note: `复制了 ${copies.length} 个物件` };
}

export function spreadAction(objects: GameObject[], ids: string[]): Action | null {
  const target = objects.filter((o) => ids.includes(o.id) && o.kind !== "board");
  if (target.length < 2) return null;
  return {
    t: "move",
    m: target.map((o) => ({
      id: o.id,
      x: round(o.x + (Math.random() - 0.5) * 0.05),
      z: round(o.z + (Math.random() - 0.5) * 0.05),
    })),
  };
}

export function addPieceAction(shape: string, color: string, label?: string): Action {
  return { t: "add", o: makePiece(shape, color, undefined, label) };
}

export function addDieAction(sides: number, color: string): Action {
  return { t: "add", o: makeDie(sides, color) };
}

export function addTokenAction(label: string, color: string, count = 0): Action {
  return { t: "add", o: makeToken(label, color, count) };
}

export function addCardAction(spec: CardSpec, color: string): Action {
  return { t: "add", o: makeCard(spec, color, nextSpot()) };
}

export function addPileAction(cards: CardSpec[], color: string): Action {
  return { t: "add", o: makePile(cards, color) };
}

/** 卡牌盒：容量比牌堆大，取牌仍按顺序 */
export function addBoxAction(cards: CardSpec[], color: string): Action {
  return { t: "add", o: makeContainer("box", cards, color) };
}

/** 袋子：抓牌随机，不看顺序 */
export function addBagAction(cards: CardSpec[], color: string): Action {
  return { t: "add", o: makeContainer("bag", cards, color) };
}

/** 大图桌垫：替换当前棋盘，尺寸由 long（米）决定 */
export function addMatAction(img: string, w: number, h: number, long = 1.3): Action {
  return { t: "boardSet", board: makeMat(img, w, h, long) };
}

/**
 * 换一张网格棋盘当底面：一张桌只有一张盘，所以这是「换盘」而不是「再添一张」，传 null 就撤掉回到纯桌布。
 * 只铺盘面不摆子——一整盘起手位置归「开局」那一侧管。
 */
export function boardPresetAction(presetId: string | null): Action {
  return { t: "boardSet", board: presetId ? makeBoard(presetId) : null };
}

/** 上传的图片直接进手牌（只有自己看得见） */
export function customHandAction(specs: CardSpec[], color: string, owner: string): Action | null {
  const list = specs.slice(0, 24);
  if (!list.length) return null;
  const to = list.map((spec) => makeHandCard({ ...spec, label: spec.label?.slice(0, 20) }, color, owner));
  return { t: "addMany", o: to, note: `把 ${to.length} 张自定义卡牌拿进手牌` };
}

/** 上传的卡面摊成本侧一排散牌，方便直接看到图 */
export function customCardsAction(specs: CardSpec[], color: string): Action | null {
  // 散牌一张就是一个物件，装不下的留给归约处理也等于丢掉，这里先按桌面容量收口
  const list = specs.slice(0, MAX_OBJECTS);
  if (!list.length) return null;
  // 一次能传上百张，摊成一行会跑出桌面：按牌宽排满一行再换行，往桌子中央方向长
  const gap = Math.min(0.078, (TABLE.w - 0.14) / Math.max(1, Math.min(list.length, 24) - 1));
  const per = Math.max(1, Math.floor((TABLE.w - 0.14) / gap) || 1);
  const startX = -((Math.min(per, list.length) - 1) * gap) / 2;
  const rowGap = 0.11;
  const startZ = TABLE.d / 2 - 0.18;
  const to = list.map((spec, i) => makeCard(spec, color, {
    x: clamp(startX + (i % per) * gap, -TABLE.w / 2 + 0.06, TABLE.w / 2 - 0.06),
    z: clamp(startZ - Math.floor(i / per) * rowGap, -TABLE.d / 2 + 0.06, startZ),
  }, true));
  return to.length === 1
    ? { t: "add", o: to[0] }
    : { t: "addMany", o: to, note: `放下了 ${to.length} 张自定义卡牌` };
}

/** ——— 组件：计时器 / 指针 / 路径箭头 / 文字 ——— */

export function addTimerAction(seconds: number, color: string): Action {
  return { t: "add", o: makeTimer(seconds, color) };
}

export function addPointerAction(color: string): Action {
  return { t: "add", o: makePointer(color) };
}

export function addArrowAction(color: string, len = 0.3): Action {
  return { t: "add", o: makeArrow(color, len) };
}

export function addTextAction(label: string, color: string): Action {
  return { t: "add", o: makeText(label.trim() || "文字", color) };
}

/** 桌上 3D 计算器 */
export function addCalcAction(color: string): Action {
  return { t: "add", o: makeCalc(color) };
}

/** 一面转盘：默认八等分 */
export function addSpinnerAction(color: string, n = 8): Action {
  return { t: "add", o: makeSpinner(n, color) };
}

/** 一条计分轨：默认二十格 */
export function addTrackAction(color: string, n = TRACK_DEFAULT): Action {
  return { t: "add", o: makeTrack(n, color) };
}

/** 迷你计数器：读数 0、步进 1，拖到卡牌边上就吸住 */
export function addCounterAction(color: string): Action {
  return { t: "add", o: makeCounter(color) };
}

/** 一块牌屏：摆它的人就是它的主人，屏前那一窄条里的牌从此只对主人亮着 */
export function addShieldAction(color: string, owner: string, w?: number, h?: number): Action {
  return { t: "add", o: makeShield(color, owner, undefined, w, h) };
}

/** 一只沙漏：默认三分钟一漏，摆下来是静止的，翻面才起算 */
export function addHourAction(color: string, mins = HOUR_DEFAULT): Action {
  return { t: "add", o: makeHourglass(mins, color) };
}

/** 一本规则书：摊开的房规小书，摆下来就有「房规/计分/备忘」三页 */
export function addBookAction(color: string): Action {
  return { t: "add", o: makeBook(color) };
}

/** 摆一台唱片机：先摆空机，唱片要有人把音频传上来才算有内容 */
export function addGramAction(color: string): Action {
  return { t: "add", o: makeGram(color) };
}

/** 换一张唱片：clip 是音频仓库里的 key，曲名与时长跟着片子走；放下片子就转起来，抽出就停 */
export function gramLoadAction(o: GameObject, clip: string | null, name = "", dur = 0, now = Date.now()): Action | null {
  if (o.kind !== "gram") return null;
  const g = fixGram(o.gram);
  if (clip === null) return { t: "gram", id: o.id, clip: null, name: "", dur: 0, pos: 0, playing: false, at: null };
  const title = name.trim().slice(0, GRAM_NAME_MAX);
  if (clip === g.clip && title === g.name && Math.round(dur) === Math.round(g.dur)) return null;
  return { t: "gram", id: o.id, clip, name: title, dur, pos: 0, playing: true, at: now };
}

/** 只改铭牌上那行字：片子、进度、放没放都不动 */
export function gramRenameAction(o: GameObject, name: string): Action | null {
  if (o.kind !== "gram") return null;
  const title = name.trim().slice(0, GRAM_NAME_MAX);
  if (!title || title === fixGram(o.gram).name) return null;
  return { t: "gram", id: o.id, name: title };
}

/** 放与停：停的时候把此刻的位置落回 pos，下次接着唱；唱到结尾再按播放就从头来 */
export function gramPlayAction(o: GameObject, on: boolean, now = Date.now()): Action | null {
  if (o.kind !== "gram") return null;
  const g = fixGram(o.gram);
  if (!g.clip || g.playing === on) return null;
  const here = gramPos(g, now);
  const atEnd = g.dur > 0 && here >= g.dur - 0.05;
  if (!on) return { t: "gram", id: o.id, playing: false, at: null, pos: here };
  return { t: "gram", id: o.id, playing: true, at: now, pos: atEnd ? 0 : here };
}

/** 跳到第几秒：在放就照着新位置继续放 */
export function gramSeekAction(o: GameObject, pos: number, now = Date.now()): Action | null {
  if (o.kind !== "gram") return null;
  const g = fixGram(o.gram);
  if (!g.clip || !g.dur) return null;
  const to = Math.round(clamp(pos, 0, g.dur) * 1000) / 1000;
  if (to === Math.round(gramPos(g, now) * 1000) / 1000) return null;
  return { t: "gram", id: o.id, pos: to, at: g.playing ? now : null };
}

/** 快进快退一格：长按菜单里没有滑条，就按这个步子挪 */
export function gramNudgeAction(o: GameObject, delta: number, now = Date.now()): Action | null {
  if (o.kind !== "gram") return null;
  const g = fixGram(o.gram);
  if (!g.clip || !g.dur) return null;
  return gramSeekAction(o, gramPos(g, now) + delta, now);
}

/** 音量加减一格：拧到头就不再摆这一行 */
export function gramVolAction(o: GameObject, delta: number): Action | null {
  if (o.kind !== "gram") return null;
  const g = fixGram(o.gram);
  const vol = Math.round(clamp(Math.round(g.vol * 10) / 10 + delta, 0, 1) * 10) / 10;
  if (vol === g.vol) return null;
  return { t: "gram", id: o.id, vol };
}

/** 循环开关：唱完接着唱，还是唱完就停 */
export function gramLoopAction(o: GameObject, on: boolean): Action | null {
  if (o.kind !== "gram") return null;
  const g = fixGram(o.gram);
  if (!g.clip || g.loop === on) return null;
  return { t: "gram", id: o.id, loop: on };
}

/* ———— 随身听：默认各听各的，共享出去才轮到全桌 ———— */

/** 摆一台随身听：机器是公共的，里面那首歌先留在摆它的人电脑上 */
export function addMp3Action(color: string, by = ""): Action {
  return { t: "add", o: makeMp3(color, by) };
}

/**
 * 往自己那台机器上刻一首本机歌曲：只写 key、曲名与时长，一个音频字节都不进服务器。
 * 传 null 是抽出来——别人桌上看到的立刻变成空机，本机那份缓存还留着，下次还能刻上去。
 */
export function mp3LoadAction(o: GameObject, clip: string | null, name = "", dur = 0): Action | null {
  if (o.kind !== "mp3") return null;
  const m = fixMp3(o.mp3);
  if (clip === null) {
    if (!m.clip) return null;
    return { t: "mp3", id: o.id, clip: null, name: "", dur: 0, shared: false, playing: false, pos: 0, at: null };
  }
  if (!AUDIO_KEY.test(clip)) return null;
  const title = name.trim().slice(0, MP3_NAME_MAX);
  const seconds = Math.round(clamp(dur, 0, MP3_DUR_MAX) * 1000) / 1000;
  if (clip === m.clip && title === m.name && seconds === m.dur) return null;
  // 换曲子一律从头起，并且先收回私人：新歌要先让主人自己听一遍才对得起「默认本地听歌」
  return { t: "mp3", id: o.id, clip, name: title, dur: seconds, shared: false, playing: false, pos: 0, at: null };
}

/**
 * 共享与收回：把本机那一台接到全桌上。
 * 交出去的那一刻按主人此刻的位置起转，进度从此走桌面状态；收回就当场停住。
 */
export function mp3ShareAction(o: GameObject, on: boolean, pos = 0, now = Date.now()): Action | null {
  if (o.kind !== "mp3") return null;
  const m = fixMp3(o.mp3);
  if (!m.clip || m.shared === on) return null;
  if (!on) return { t: "mp3", id: o.id, shared: false, playing: false, at: null, pos: 0 };
  return { t: "mp3", id: o.id, shared: true, playing: true, at: now, pos: Math.round(clamp(pos, 0, m.dur) * 1000) / 1000 };
}

/** 共享出去之后改曲名：全桌铭牌上同一行字 */
export function mp3RenameAction(o: GameObject, name: string): Action | null {
  if (o.kind !== "mp3") return null;
  const title = name.trim().slice(0, MP3_NAME_MAX);
  if (!title || title === fixMp3(o.mp3).name) return null;
  return { t: "mp3", id: o.id, name: title };
}

/** 放与停（只作用于共享出去的那一份）：停时把位置落回 pos，唱到头再按就重来 */
export function mp3PlayAction(o: GameObject, on: boolean, now = Date.now()): Action | null {
  if (o.kind !== "mp3") return null;
  const m = fixMp3(o.mp3);
  if (!m.shared || !m.clip || m.playing === on) return null;
  const here = mp3Pos(m, now);
  const atEnd = m.dur > 0 && here >= m.dur - 0.05;
  if (!on) return { t: "mp3", id: o.id, playing: false, at: null, pos: here };
  return { t: "mp3", id: o.id, playing: true, at: now, pos: atEnd ? 0 : here };
}

/** 跳到第几秒（同上，只认共享出去那一份） */
export function mp3SeekAction(o: GameObject, pos: number, now = Date.now()): Action | null {
  if (o.kind !== "mp3") return null;
  const m = fixMp3(o.mp3);
  if (!m.shared || !m.clip || !m.dur) return null;
  const to = Math.round(clamp(pos, 0, m.dur) * 1000) / 1000;
  if (to === Math.round(mp3Pos(m, now) * 1000) / 1000) return null;
  return { t: "mp3", id: o.id, pos: to, at: m.playing ? now : null };
}

/** 音量一格（共享那一桌人一起听，所以这个数是公用的）：没共享出去时这一格只归本机那个滑条管 */
export function mp3VolAction(o: GameObject, delta: number): Action | null {
  if (o.kind !== "mp3") return null;
  const m = fixMp3(o.mp3);
  if (!m.shared || !m.clip) return null;
  const vol = Math.round(clamp(Math.round(m.vol * 10) / 10 + delta, 0, 1) * 10) / 10;
  if (vol === m.vol) return null;
  return { t: "mp3", id: o.id, vol };
}

export function mp3LoopAction(o: GameObject, on: boolean): Action | null {
  if (o.kind !== "mp3") return null;
  const m = fixMp3(o.mp3);
  if (!m.shared || !m.clip || m.loop === on) return null;
  return { t: "mp3", id: o.id, loop: on };
}

/* ———— 平板浏览器：一条地址一屏，B 站那种地址另外带一套走带 ———— */

/** 摆一台平板：先摆空机，地址要有人填进去才开得出页面 */
export function addTabletAction(color: string): Action {
  return { t: "add", o: makeTablet(color) };
}

/**
 * 填地址：裸 BV 号、整条 B 站链接、任何 http/https 网址都认（用户从地址栏复制来的就是那一长串）。
 * 认不出地址就不给动作——按钮不该按出一块打不开的屏。换页照唱片机的规矩：立刻起播。
 */
export function tabletLoadAction(o: GameObject, text: string, now = Date.now()): Action | null {
  if (o.kind !== "tablet") return null;
  const t = fixTablet(o.tablet);
  const addr = tabletAddr(text);
  if (!addr || (addr.url === t.url && addr.page === t.page)) return null;
  return { t: "tablet", id: o.id, url: addr.url, page: addr.page, pos: 0, playing: true, at: now };
}

/** 关掉页面：屏黑下去，进度一并抹平 */
export function tabletClearAction(o: GameObject): Action | null {
  if (o.kind !== "tablet") return null;
  const t = fixTablet(o.tablet);
  if (!t.url) return null;
  return { t: "tablet", id: o.id, url: "", page: 1, pos: 0, playing: false, at: null, mute: false };
}

/**
 * 重新载入：地址一个字都没变也要能再挂一次——有些页面点进去就回不来了，
 * 而跨源的屏我们读不到它现在的 URL，只能靠 rev 换一个计数把 iframe 重装回桌上那一条。
 */
export function tabletReloadAction(o: GameObject): Action | null {
  if (o.kind !== "tablet") return null;
  const t = fixTablet(o.tablet);
  if (!t.url) return null;
  return { t: "tablet", id: o.id, rev: (t.rev + 1) % (TABLET_REV_MAX + 1) };
}

/** 放与停：停的时候把此刻的位置落回 pos，下次接着放。只有 B 站那一种地址听这套 */
export function tabletPlayAction(o: GameObject, on: boolean, now = Date.now()): Action | null {
  if (o.kind !== "tablet") return null;
  const t = fixTablet(o.tablet);
  if (!biliOf(t.url) || t.playing === on) return null;
  const here = tabletPos(t, now);
  if (!on) return { t: "tablet", id: o.id, playing: false, at: null, pos: here };
  return { t: "tablet", id: o.id, playing: true, at: now, pos: here };
}

/** 跳到第几秒：在放就照着新位置重装一次播放器接着放 */
export function tabletSeekAction(o: GameObject, pos: number, now = Date.now()): Action | null {
  if (o.kind !== "tablet") return null;
  const t = fixTablet(o.tablet);
  if (!biliOf(t.url)) return null;
  const to = Math.round(clamp(pos, 0, TABLET_POS_MAX) * 1000) / 1000;
  if (to === Math.round(tabletPos(t, now) * 1000) / 1000) return null;
  return { t: "tablet", id: o.id, pos: to, at: t.playing ? now : null };
}

/** 快进快退一格：长按菜单里没有滑条，就按这个步子挪 */
export function tabletNudgeAction(o: GameObject, delta: number, now = Date.now()): Action | null {
  if (o.kind !== "tablet") return null;
  const t = fixTablet(o.tablet);
  if (!biliOf(t.url)) return null;
  return tabletSeekAction(o, tabletPos(t, now) + delta, now);
}

/** 换一集（分 P）：从第 0 秒起，放没放照旧 */
export function tabletPageAction(o: GameObject, delta: number, now = Date.now()): Action | null {
  if (o.kind !== "tablet") return null;
  const t = fixTablet(o.tablet);
  if (!biliOf(t.url)) return null;
  const page = Math.round(clamp(t.page + delta, 1, TABLET_PAGE_MAX));
  if (page === t.page) return null;
  return { t: "tablet", id: o.id, page, pos: 0, playing: t.playing, at: t.playing ? now : null };
}

/** 静音开关：跨源播放器读不到它的音量，所以只有开与关这两档 */
export function tabletMuteAction(o: GameObject, on: boolean): Action | null {
  if (o.kind !== "tablet") return null;
  const t = fixTablet(o.tablet);
  if (!biliOf(t.url) || t.mute === on) return null;
  return { t: "tablet", id: o.id, mute: on };
}

/** 翻沙漏：躺着就翻过来起算，正在漏就按回去停住——沙漏只有这两态，不漏一半暂停再说 */
export function hourFlipAction(o: GameObject, now = Date.now()): Action | null {
  if (o.kind !== "hour") return null;
  const h = fixHour(o.hour);
  return { t: "hour", id: o.id, mins: h.mins, at: h.at === null ? now : null };
}

/** 换一只几分钟的沙漏：换档位就把沙子重新装满，不会留半漏在中间 */
export function hourSetAction(o: GameObject, delta: number): Action | null {
  if (o.kind !== "hour") return null;
  const h = fixHour(o.hour);
  const mins = Math.round(h.mins + delta);
  if (mins < HOUR_MIN || mins > HOUR_MAX || mins === h.mins) return null;
  return { t: "hour", id: o.id, mins, at: null };
}

/** 牌屏改尺寸：delta 沿屏面拉长，heightDelta 把屏抬高，两条边各调各的 */
export function shieldResizeAction(o: GameObject, delta: number, heightDelta = 0): Action | null {
  if (o.kind !== "shield") return null;
  const s = fixShield(o.shield);
  const r3 = (n: number) => Math.round(n * 1000) / 1000;
  const w = r3(clamp(s.w + delta, SHIELD_MIN, SHIELD_MAX));
  const h = r3(clamp(s.h + heightDelta, SHIELD_H_MIN, SHIELD_H_MAX));
  if (w === s.w && h === s.h) return null;
  return { t: "shield", id: o.id, w, h };
}

/** 牌屏换主人：谁坐这一侧谁认领，null 表示不认归属，只当一块挡板摆设 */
export function shieldClaimAction(o: GameObject, owner: string | null): Action | null {
  if (o.kind !== "shield") return null;
  if ((o.owner ?? null) === owner) return null;
  return { t: "shield", id: o.id, owner };
}

/** 规则书翻页：delta 是 ±1，翻到头就停在那一页 */
export function bookPageAction(o: GameObject, delta: number): Action | null {
  if (o.kind !== "book") return null;
  const b = fixBook(o.book);
  const page = Math.round(clamp(b.page + delta, 0, b.pages.length - 1));
  if (page === b.page) return null;
  return { t: "book", id: o.id, page };
}

/** 规则书加减一页：页数变了，摊开的那一页尽量留在原地 */
export function bookPagesAction(o: GameObject, delta: number): Action | null {
  if (o.kind !== "book") return null;
  const cur = fixBook(o.book);
  const n = cur.pages.length + delta;
  if (n < 1 || n > BOOK_PAGE_MAX || n === cur.pages.length) return null;
  const pages = n < cur.pages.length
    ? cur.pages.slice(0, n)
    : [...cur.pages, ...Array.from({ length: n - cur.pages.length }, () => "")];
  return { t: "book", id: o.id, pages, page: Math.min(cur.page, pages.length - 1) };
}

/** 改写规则书：面板提交整本，页码跟着新页数夹紧 */
export function bookWriteAction(o: GameObject, pages: string[], page?: number): Action | null {
  if (o.kind !== "book" || !pages.length) return null;
  const next = pages.map((p) => (typeof p === "string" ? p : "").slice(0, BOOK_CHARS));
  const cur = fixBook(o.book);
  const at = Math.round(clamp(Number(page ?? cur.page), 0, next.length - 1));
  if (at === cur.page && next.length === cur.pages.length && next.every((p, i) => p === cur.pages[i])) return null;
  return { t: "book", id: o.id, pages: next, page: at };
}

/** 按计算器的一个键：非法按键不出动作 */
export function calcKeyAction(o: GameObject, key: string): Action | null {
  if (o.kind !== "calc") return null;
  if (!CALC_KEYS.flat().includes(key)) return null;
  const expr = calcPress(o.calc?.expr ?? "", key);
  if (expr === (o.calc?.expr ?? "")) return null;
  return { t: "calcKey", id: o.id, key };
}

/** 按一下迷你计数器的加减：越过边界就不出动作，界面上那颗键也不摆 */
export function counterStepAction(o: GameObject, dir: 1 | -1): Action | null {
  if (o.kind !== "counter") return null;
  const c = fixCounter(o.counter);
  const v = Math.round(c.v + dir * c.step);
  if (v < COUNTER_V_MIN || v > COUNTER_V_MAX) return null;
  return { t: "counter", id: o.id, delta: dir * c.step };
}

/** 直接填一个读数：夹到范围内，跟当前一样就不出动作 */
export function counterSetAction(o: GameObject, v: number): Action | null {
  if (o.kind !== "counter" || !Number.isFinite(v)) return null;
  const c = fixCounter(o.counter);
  const next = Math.round(clamp(v, COUNTER_V_MIN, COUNTER_V_MAX));
  if (next === c.v) return null;
  return { t: "counter", id: o.id, v: next };
}

/** 换步进档：只认 1~100 的整数，跟当前一样就不出动作 */
export function counterStepSetAction(o: GameObject, step: number): Action | null {
  if (o.kind !== "counter" || !Number.isFinite(step)) return null;
  const c = fixCounter(o.counter);
  const next = Math.round(clamp(step, COUNTER_STEP_MIN, COUNTER_STEP_MAX));
  if (next === c.step) return null;
  return { t: "counter", id: o.id, step: next };
}

/** 换吸附的宿主或换一条边；host 为 null 就是脱附散在桌上 */
export function counterAttachAction(o: GameObject, host: string | null, edge?: 0 | 1 | 2 | 3): Action | null {
  if (o.kind !== "counter") return null;
  const c = fixCounter(o.counter);
  if (host === null) return c.host ? { t: "counter", id: o.id, host: null } : null;
  if (host === o.id) return null;
  const e = edge === 1 || edge === 2 || edge === 3 ? edge : 0;
  if (c.host === host && (c.edge ?? 0) === e) return null;
  return { t: "counter", id: o.id, host, edge: e };
}

/** 拨一下转盘：结果由发起方算好写进动作，各端只按同一时刻重放动画 */
export function spinAction(o: GameObject, now = Date.now()): Action | null {
  if (o.kind !== "spinner") return null;
  const n = fixSpinner(o.spinner).n;
  return { t: "spin", id: o.id, value: randInt(n), at: now };
}

/** 计分轨走子：delta 是加减几分；delta 为 0 表示「上场」，把棋子放到起点那一格 */
export function markAction(o: GameObject, by: string, delta: number, name?: string, color?: string): Action | null {
  if (o.kind !== "track" || !by || !Number.isFinite(delta)) return null;
  const cur = fixTrack(o.track);
  if (!trackMark(o, by) && cur.marks.length >= TRACK_MARK_MAX) return null;
  return { t: "mark", id: o.id, by, delta, ...(name ? { name } : {}), ...(color ? { color } : {}) };
}

/** 把某人从计分轨上摘下来；不带 by 就是全员归零 */
export function markClearAction(o: GameObject, by?: string): Action | null {
  if (o.kind !== "track") return null;
  const cur = fixTrack(o.track);
  if (by) return cur.marks.some((m) => m.by === by) ? { t: "markClear", id: o.id, by } : null;
  return cur.marks.some((m) => m.at !== 0) ? { t: "markClear", id: o.id } : null;
}

/** 改转盘的等分数：加减扇区 */
export function spinSetAction(o: GameObject, delta: number): Action | null {
  if (o.kind !== "spinner") return null;
  const cur = fixSpinner(o.spinner);
  const n = Math.round(cur.n + delta);
  if (n < SPIN_MIN || n > SPIN_MAX || n === cur.n) return null;
  return { t: "spinSet", id: o.id, n };
}

/** 改计分轨的刻度数：加减几格 */
export function trackSetAction(o: GameObject, delta: number): Action | null {
  if (o.kind !== "track") return null;
  const cur = fixTrack(o.track);
  const n = Math.round(cur.n + delta);
  if (n < TRACK_MIN || n > TRACK_MAX || n === cur.n) return null;
  return { t: "trackSet", id: o.id, n };
}

/** 计时器的时间差全部在发起方算完，各端只按绝对结束时刻显示同一个数 */
export function timerRunAction(o: GameObject, now = Date.now()): Action | null {
  if (o.kind !== "timer" || o.endsAt != null) return null;
  const left = Math.max(1, remainingOf(o, now));
  return { t: "timer", id: o.id, duration: Math.round(o.duration ?? left), left, endsAt: now + left * 1000 };
}

export function timerPauseAction(o: GameObject, now = Date.now()): Action | null {
  if (o.kind !== "timer" || o.endsAt == null) return null;
  const left = Math.max(0, Math.round((o.endsAt - now) / 1000));
  return { t: "timer", id: o.id, duration: Math.round(o.duration ?? left), left, endsAt: null };
}

export function timerResetAction(o: GameObject): Action | null {
  if (o.kind !== "timer") return null;
  const d = Math.round(o.duration ?? 60);
  return { t: "timer", id: o.id, duration: d, left: d, endsAt: null };
}

/** 加减时长：在跑就挪结束时刻，停着就改剩余 */
export function timerShiftAction(o: GameObject, delta: number, now = Date.now()): Action | null {
  if (o.kind !== "timer") return null;
  const duration = clamp(Math.round(o.duration ?? remainingOf(o, now)), TIMER_MIN, TIMER_MAX);
  if (o.endsAt != null) {
    const left = clamp(Math.round((o.endsAt - now) / 1000) + delta, 1, TIMER_MAX);
    return { t: "timer", id: o.id, duration, left, endsAt: now + left * 1000 };
  }
  const left = clamp(Math.round(o.left ?? duration) + delta, 0, TIMER_MAX);
  return { t: "timer", id: o.id, duration: Math.max(duration, left), left, endsAt: null };
}

export function timerSetAction(o: GameObject, seconds: number): Action | null {
  if (o.kind !== "timer") return null;
  const d = clamp(Math.round(seconds), TIMER_MIN, TIMER_MAX);
  return { t: "timer", id: o.id, duration: d, left: d, endsAt: null };
}

export function arrowLenAction(o: GameObject, delta: number): Action | null {
  if (o.kind !== "arrow") return null;
  return { t: "arrow", id: o.id, len: Math.round(((o.len ?? 0.3) + delta) * 1000) / 1000 };
}

/** ——— 区域垫：放置、改尺寸、开关隐私 ——— */

export function addZoneAction(color: string, w: number, d: number, owner?: string): Action {
  return { t: "add", o: makeZone(color, w, d, owner) };
}

/** 放一块垫子（实心的，可以纯色也可以贴图） */
export function addPadAction(color: string, w: number, d: number, owner?: string, img?: string): Action {
  return { t: "add", o: makePad(color, w, d, owner, img) };
}

/** 换垫面图：给 key 就贴那张图，传空串撤掉图回到纯色。只有垫子吃得下这个动作 */
export function padImageAction(o: GameObject, img: string): Action | null {
  if (o.kind !== "zone" || !o.zone?.pad) return null;
  if ((o.zone.img ?? "") === img) return null;
  return { t: "zone", id: o.id, img };
}

/**
 * 改区域长宽：两条边各自给增量，所以能单独拉长或压扁。
 * 只给一个 delta 时按等比缩放处理（滚轮与键盘就是这种）。
 */
export function zoneResizeAction(o: GameObject, delta: number, depthDelta = delta): Action | null {
  if (o.kind !== "zone") return null;
  const z = o.zone ?? { w: 0.5, d: 0.36 };
  const nw = Math.round(clamp(z.w + delta, ZONE_MIN, ZONE_MAX) * 1000) / 1000;
  const nd = Math.round(clamp(z.d + depthDelta, ZONE_MIN, ZONE_MAX) * 1000) / 1000;
  if (nw === z.w && nd === z.d) return null;
  return { t: "zone", id: o.id, w: nw, d: nd };
}

/** 开关区域隐私模式：只有创建者能改 */
export function zonePrivAction(o: GameObject, on: boolean): Action | null {
  if (o.kind !== "zone") return null;
  return { t: "zone", id: o.id, priv: on };
}

/**
 * 座位攻防范围 ±：那块区域垫有主人时才谈得上距离，到边界就回 null，选中栏据此把按钮掐掉。
 * 进攻范围是「数到第几家以内打得着」，防御范围是「别人数到你时多算几家」。
 */
export function zoneRangeAction(o: GameObject, key: "reach" | "guard", delta: number): Action | null {
  if (o.kind !== "zone") return null;
  const min = key === "reach" ? REACH_MIN : GUARD_MIN;
  const max = key === "reach" ? REACH_MAX : GUARD_MAX;
  const cur = key === "reach" ? (o.zone?.reach ?? REACH_DEFAULT) : (o.zone?.guard ?? GUARD_MIN);
  const next = Math.round(clamp(cur + delta, min, max));
  if (next === cur) return null;
  return key === "reach" ? { t: "zone", id: o.id, reach: next } : { t: "zone", id: o.id, guard: next };
}

/** ——— 统计垫：放置、改尺寸、上锁 ——— */

export function addStatMatAction(color: string, w = 0.6, d = 0.42): Action {
  return { t: "add", o: makeStatMat(color, w, d) };
}

/** 改统计垫长宽：两条边各调各的，只想拉长一块垫子时用 depthDelta */
export function statResizeAction(o: GameObject, delta: number, depthDelta = delta): Action | null {
  if (o.kind !== "stat") return null;
  const s = o.stat ?? { w: 0.6, d: 0.42 };
  const w = Math.round(clamp(s.w + delta, STAT_MIN, STAT_MAX) * 1000) / 1000;
  const d = Math.round(clamp(s.d + depthDelta, STAT_MIN, STAT_MAX) * 1000) / 1000;
  if (w === s.w && d === s.d) return null;
  return { t: "stat", id: o.id, w, d };
}

/** 开关垫子锁定（统计垫与桌垫）：锁上后谁都选不中，只能点垫角上那颗小按钮解锁 */
export function padLockAction(o: GameObject, on: boolean): Action | null {
  if (!lockable(o)) return null;
  return { t: "lock", id: o.id, on };
}

/** 开关棋盘的网格锁定：开着一手一子，落点自动吸进格心，抢同一格就散到最近的空格 */
export function gridLockAction(o: GameObject, on: boolean): Action | null {
  if (!gridable(o)) return null;
  return { t: "grid", id: o.id, on };
}

/** 开关棋盘的自动吸附：开着落点吸进最近的格心／交叉点，关掉就能把子骑在格缝上摆（比网格锁定松一档） */
export function snapOnAction(o: GameObject, on: boolean): Action | null {
  if (!gridable(o)) return null;
  return { t: "snap", id: o.id, on };
}

/** 开关棋盘的网格线显示：线只是看得见的参考，关掉不影响吸附与锁定 */
export function meshAction(o: GameObject, on: boolean): Action | null {
  if (!gridable(o)) return null;
  return { t: "mesh", id: o.id, on };
}

/**
 * 摆回开局：认不出是哪张预设的盘、或者这套预设压根不在盘面上摆子（围棋那四十枚摊在盘边），
 * 就没有这个动作——按钮不出现，不会出现按下去什么都不发生的空按钮。
 */
export function resetAction(o: GameObject): Action | null {
  if (o.kind !== "board") return null;
  const preset = presetOf(o);
  if (!preset?.setup || !preset.opening) return null;
  return { t: "reset", id: o.id };
}

/**
 * 快速落子：按点位把这枚子走一步。走的是同一份 resolveDrop，所以踩子即吃、吸附格心、
 * 挤开旁人都跟手拖过去一模一样——点一下和拖一下不可能落到两处。
 */
export function placeAction(state: TableState, o: GameObject, pt: MovePoint): Action | null {
  const m = resolveDrop(state, [{ id: o.id, x: pt.x, z: pt.z }])[0];
  return m ? { t: "move", m: [m] } : null;
}

/** ——— 卡槽带：放置、加减格数、把带子上的牌摊齐 ——— */

export function addSlotAction(color: string, n = 3): Action {
  return { t: "add", o: makeSlotStrip(color, n) };
}

/** 改格数：加一格就把带子拉长一格，减到没人占的格才允许 */
export function slotResizeAction(o: GameObject, delta: number): Action | null {
  if (o.kind !== "slot") return null;
  const n = clamp((o.slot?.n ?? 3) + delta, SLOT_MIN, SLOT_MAX);
  if (n === o.slot?.n) return null;
  return { t: "slot", id: o.id, n };
}

/** 摆一只骰盘：默认内径，拖上桌就能接骰子 */
export function addTrayAction(color: string): Action {
  return { t: "add", o: makeTray(color) };
}

/** 骰盘改内径：deltaW/deltaD 各调各的一边，夹在 TRAY_MIN..TRAY_MAX，两条都没动就返回 null */
export function trayResizeAction(o: GameObject, deltaW: number, deltaD = 0): Action | null {
  if (o.kind !== "tray") return null;
  const s = fixTray(o.tray);
  const r3 = (n: number) => Math.round(n * 1000) / 1000;
  const w = r3(clamp(s.w + deltaW, TRAY_MIN, TRAY_MAX));
  const d = r3(clamp(s.d + deltaD, TRAY_MIN, TRAY_MAX));
  if (w === s.w && d === s.d) return null;
  return { t: "tray", id: o.id, w, d };
}

/**
 * 摊齐：把带子上（或区域里）摊着的牌按格子重新排一遍。
 * 牌的先后按离带子左端的距离排，整理完的顺序就是原来从左到右的顺序。
 * 区域没有格子概念，就按区域的排布公式摊成几行；带子占满几格就只排几张。
 */
export function tidyAction(state: { o: GameObject[] }, mat: GameObject): Action | null {
  const isZone = mat.kind === "zone";
  if (!isZone && mat.kind !== "slot") return null;
  const m = new Map(state.o.map((o) => [o.id, o]));
  const onMat = isZone
    ? state.o.filter((o) => o.kind === "card" && !o.hand && o.card && inZone(mat, o.x, o.z)).map((o) => o.id)
    : slotCards(state, mat);
  if (!onMat.length) return null;
  const size = isZone ? (mat.zone ?? { w: 0.5, d: 0.36 }) : slotSize(mat);
  const left = { x: mat.x - (size.w / 2) * Math.cos(((mat.rot || 0) * Math.PI) / 180), z: mat.z - (size.w / 2) * Math.sin(((mat.rot || 0) * Math.PI) / 180) };
  const cap = isZone ? onMat.length : fixSlot(mat.slot).n;
  const ordered = onMat
    .map((id) => ({ id, d: Math.hypot((m.get(id)?.x ?? 0) - left.x, (m.get(id)?.z ?? 0) - left.z) }))
    .sort((a, b) => a.d - b.d)
    .map((x) => x.id)
    .slice(0, cap);
  const grid = isZone ? zoneSpots(mat, ordered.length) : [];
  const rot = deg360(mat.rot || 0);
  const moves: Move[] = [];
  ordered.forEach((id, i) => {
    const o = m.get(id);
    if (!o) return;
    const at = isZone ? grid[i] : slotSpot(mat, i);
    if (!at) return;
    if (Math.abs(o.x - at.x) < 0.0005 && Math.abs(o.z - at.z) < 0.0005 && o.rot === rot && o.layer === 0) return;
    moves.push({ id, x: at.x, z: at.z, rot, layer: 0 });
  });
  return moves.length ? { t: "move", m: moves } : null;
}

/** ——— 手牌区与落点 ——— */

/** 自动生成的私人区域叫什么：靠这个后缀把手牌区和手动放的区域区分开 */
export const HAND_ZONE_SUFFIX = "的手牌";
const HAND_ZONE_SIZE = { w: 0.72, d: 0.3 };
/** 八个座位的落点，从本侧中间开始往外找空位 */
const HAND_SEATS = [
  { x: 0, z: 0.62 }, { x: -0.62, z: 0.6 }, { x: 0.62, z: 0.6 },
  { x: -1.02, z: 0.3 }, { x: 1.02, z: 0.3 }, { x: 0, z: -0.62 },
  { x: -0.62, z: -0.6 }, { x: 0.62, z: -0.6 },
];

/** 自动生成那种手牌区长什么样：只认名字后缀，不看归属，删除时用来记账 */
export function isHandZone(o: GameObject | undefined | null): boolean {
  return !!o && o.kind === "zone" && (o.label ?? "").endsWith(HAND_ZONE_SUFFIX);
}

/** 谁的手牌区：kind 是区域垫、有归属、名字带「的手牌」 */
export function handZoneOf(state: { o: GameObject[] }, id: string): GameObject | undefined {
  return state.o.find((o) => isHandZone(o) && o.owner === id);
}

/** 桌面区域（含手牌区）：打牌落点候选 */
export function tableZones(state: { o: GameObject[] }): GameObject[] {
  return state.o.filter((o) => o.kind === "zone");
}

/** 联机进来先给自己圈一块私有的手牌区：座位从共享桌面里算，所有人看到的排布一致 */
export function handZoneAction(state: { o: GameObject[] }, me: { id: string; name: string; color: string }): Action | null {
  if (handZoneOf(state, me.id)) return null;
  const taken = state.o.filter(isHandZone);
  const seat = HAND_SEATS.find((s) => !taken.some((z) => Math.abs(z.x - s.x) < 0.12 && Math.abs(z.z - s.z) < 0.12))
    ?? HAND_SEATS[taken.length % HAND_SEATS.length];
  const label = `${me.name.slice(0, 12) || "玩家"}${HAND_ZONE_SUFFIX}`;
  return { t: "add", o: { ...makeZone(me.color, HAND_ZONE_SIZE.w, HAND_ZONE_SIZE.d, me.id, seat), label, priv: true } };
}

/**
 * 认领一块主人已经离席的手牌区：客户端 id 每开一次标签页就换一个，
 * 重进同一间房时老手牌区会留在桌上，谁都用不了。按名字对上号就把它接回来，
 * 免得再新建一块、桌上越攒越多。present 为空（本地牌桌）时不做认领。
 */
export function takeHandZoneAction(
  state: { o: GameObject[] },
  me: { id: string; name: string },
  present?: Set<string>,
): Action | null {
  if (!present || !me.id) return null;
  const label = `${me.name.slice(0, 12) || "玩家"}${HAND_ZONE_SUFFIX}`;
  const orphan = state.o.find((o) => isHandZone(o) && o.owner && o.owner !== me.id && !present.has(o.owner) && o.label === label);
  if (!orphan) return null;
  return { t: "zone", id: orphan.id, owner: me.id, label };
}

/**
 * 手牌区删掉后就不再自动生成：只在本地按房间码记住，换标签页、换客户端 id 重进同一间房也不再补。
 * 想要再要一块，去组件库「区域」页签放一块自己的区域垫就行。
 */
const FORGOT_HAND_ZONE = "tabletop3d:handzone-forgotten";
const FORGOT_MAX = 60;

function forgotList(): string[] {
  try {
    const raw = localStorage.getItem(FORGOT_HAND_ZONE);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string").slice(0, FORGOT_MAX) : [];
  } catch {
    return [];
  }
}

export function handZoneForgotten(code: string): boolean {
  const key = code.toUpperCase();
  return !!key && forgotList().includes(key);
}

export function forgetHandZone(code: string): void {
  const key = code.toUpperCase();
  if (!key) return;
  try {
    localStorage.setItem(FORGOT_HAND_ZONE, JSON.stringify([key, ...forgotList().filter((c) => c !== key)].slice(0, FORGOT_MAX)));
  } catch {
    /* 存不下就算了 */
  }
}

/** 本机记着「这些房间别再自动生成本人手牌区了」的房间码，给缓存查看器列出来 */
export function forgottenHandZones(): string[] {
  return forgotList();
}

/** 忘掉了这份删除记录：下次进那一间房，自动手牌区会重新补回来 */
export function unforgetHandZone(code: string): void {
  const key = code.toUpperCase();
  if (!key || !forgotList().includes(key)) return;
  try {
    localStorage.setItem(FORGOT_HAND_ZONE, JSON.stringify(forgotList().filter((c) => c !== key)));
  } catch {
    /* 存不下就算了 */
  }
}

/** 本机的存储键名：缓存查看器按它统计体积，别的模块不必读 */
export const HAND_ZONE_MEMORY_KEY = FORGOT_HAND_ZONE;

/** 牌在区域内的排布步长：大于两张牌的碰撞半径之和 0.076，排好的格子不会被挤开二次挪动 */
const CARD_STEP = { x: 0.082, z: 0.098 };

/**
 * 区域内的落点格子：按区域朝向排成行，先横后竖，整体居中。
 * 显示预览和实际打牌都走这里，所以「看到的」就是「落下的」。
 */
export function zoneSpots(zone: GameObject, count: number): { x: number; z: number }[] {
  const s = zone.zone ?? { w: 0.5, d: 0.36 };
  const cols = clamp(Math.floor((s.w - 0.014) / CARD_STEP.x) || 1, 1, Math.max(1, count));
  const rows = Math.ceil(count / cols);
  const gx = Math.min(CARD_STEP.x, (s.w - 0.014) / cols);
  const gz = rows > 1 ? clamp((s.d - 0.014) / rows, 0.026, CARD_STEP.z) : CARD_STEP.z;
  const rad = ((zone.rot || 0) * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const out: { x: number; z: number }[] = [];
  for (let i = 0; i < count; i++) {
    const lx = ((i % cols) - (cols - 1) / 2) * gx;
    const lz = (Math.floor(i / cols) - (rows - 1) / 2) * gz;
    const at = inTable(zone.x + lx * cos - lz * sin, zone.z + lx * sin + lz * cos);
    out.push({ x: round(at.x), z: round(at.z) });
  }
  return out;
}

/** 打出的牌落到选中的区域里：整叠按区域排布，坐标由这里一次算定 */
export function playToZoneAction(state: { o: GameObject[] }, ids: string[], zoneId: string | null): Action | null {
  if (!ids.length) return null;
  const zone = zoneId ? state.o.find((o) => o.id === zoneId && o.kind === "zone") : null;
  if (!zone) return playHandAction(ids);
  return { t: "hand", ids, owner: null, spots: zoneSpots(zone, ids.length), faceUp: true };
}

/**
 * 我的落牌区：只认自己显式标记过「设为首选」的那块区域。
 * 没标记就返回 undefined——摸牌一律收进手牌，手牌区不再拦截落点。
 */
export function preferredZoneOf(state: { o: GameObject[] }, meId: string): GameObject | undefined {
  if (!meId) return undefined;
  return state.o.find((o) => o.kind === "zone" && o.owner === meId && o.pref);
}

/** 设为 / 取消自己的首选落牌区 */
export function zonePrefAction(o: GameObject, on: boolean): Action | null {
  if (o.kind !== "zone") return null;
  return { t: "zone", id: o.id, pref: on };
}

/**
 * 拿牌的默认落点：没标记首选区就一律收进手牌，标记过才摊进那块区域。
 * 连身份都没有（旁观、没连上）才摊到容器侧面，让牌看得见。
 * random 为真时按袋子里随机抓。
 */
export function stashDrawAction(state: TableCtx, containerId: string, n: number, meId: string, random = false): Action | null {
  const pile = state.o.find((o) => o.id === containerId);
  if (!pile?.pile?.length) return null;
  if (!meId) return random ? grabAction(state, containerId, n, meId) : drawAction(state, containerId, n, meId);
  const zone = preferredZoneOf(state, meId);
  if (!zone) return drawToHandAction(state.o, containerId, n, meId, random);
  const picked = takeCards(pile, n, random);
  const spots = zoneSpots(zone, picked.length);
  const to = picked.map((card, i) => makeCard(card, pile.color ?? PALETTE[1], spots[i], true, pile.backImg));
  return { t: "draw", id: containerId, to };
}

/**
 * 摸牌的落点选择：区域 id 就摊进那块区域，"hand" 一律收进手牌（比标记过的首选区更硬），
 * null 交回默认那一条路（标记过首选区进首选区，否则进手牌，连身份都没有摊容器侧面）。
 */
export type DrawPick = string | "hand" | null;

/** 落点真正指向的三处 */
export type DrawTarget = { zone: GameObject } | { hand: true } | { side: true };

/** 这一把摊进哪块区域：显式选中的那块已经被人拿走了就退回首选区，宁可落回默认也不能让牌凭空少 */
function drawZoneOf(state: { o: GameObject[] }, meId: string, pick: DrawPick): GameObject | undefined {
  if (pick === "hand") return undefined;
  if (pick === null) return preferredZoneOf(state, meId);
  return state.o.find((o) => o.id === pick && o.kind === "zone") ?? preferredZoneOf(state, meId);
}

/**
 * 这一次摸牌到底落在哪儿：各处高亮的那一格与按钮上的说明文字都读这一份，
 * 免得写着「进手牌」却摊进了区域。没有身份（旁观、没连上）才看得见桌面侧面。
 */
export function drawTargetOf(state: { o: GameObject[] }, meId: string, pick: DrawPick): DrawTarget {
  if (pick === "hand") return meId ? { hand: true } : { side: true };
  const zone = drawZoneOf(state, meId, pick);
  if (zone) return { zone };
  return meId ? { hand: true } : { side: true };
}

/**
 * 摸牌摸进指定区域：和「手牌打到指定区域」共用同一份 zoneSpots 排布，坐标在这里一次算定，
 * 归约只照单摆。没有指定区域时整条路交回 stashDrawAction，默认落点始终只有一份算法。
 */
export function drawIntoAction(state: TableCtx, containerId: string, n: number, meId: string, pick: DrawPick = null, random = false): Action | null {
  const pile = state.o.find((o) => o.id === containerId);
  if (!pile?.pile?.length) return null;
  if (pick === "hand" && meId) return drawToHandAction(state.o, containerId, n, meId, random);
  const zone = drawZoneOf(state, meId, pick);
  if (!zone) return stashDrawAction(state, containerId, n, meId, random);
  const picked = takeCards(pile, n, random);
  const spots = zoneSpots(zone, picked.length);
  const to = picked.map((card, i) => makeCard(card, pile.color ?? PALETTE[1], spots[i], true, pile.backImg));
  return { t: "draw", id: containerId, to };
}

/** 各处摸牌按钮的说明文字都来自这里：选中栏、长按菜单、双击的提示指向同一句，不会出现两种说法 */
export function drawLandingText(state: { o: GameObject[] }, meId: string, pick: DrawPick): string {
  const at = drawTargetOf(state, meId, pick);
  if ("zone" in at) return `摊进「${(at.zone.label || "区域").slice(0, 8)}」`;
  return "hand" in at ? "直接进手牌" : "摊在容器旁边，所有人都看得见";
}

/** ——— 卡牌管理：整叠换牌、单张改写、自定义卡背 ——— */

export function blankCard(index = 1): CardSpec {
  return { back: "plain", label: `新卡 ${index}`.slice(0, 20) };
}

export function pileSetAction(id: string, cards: CardSpec[], note?: string): Action {
  return { t: "pileSet", id, cards: cards.slice(0, MAX_PILE), note };
}

export function appendCardsAction(o: GameObject, specs: CardSpec[], note?: string): Action | null {
  if (!Array.isArray(o.pile)) return null;
  return pileSetAction(o.id, [...o.pile, ...specs].slice(0, MAX_PILE), note);
}

export function cardSetAction(id: string, card: CardSpec): Action {
  return { t: "cardSet", id, card };
}

/** 自定义卡背：一次可以作用于多个物件（选中的牌、整叠牌、容器）；style 是内置纹样 id */
export function backSetAction(ids: string[], img: string | null, style?: string): Action | null {
  const list = [...new Set(ids)].filter(Boolean);
  if (!list.length) return null;
  return style ? { t: "backSet", ids: list, img, style } : { t: "backSet", ids: list, img };
}

/** 选中的物件里哪些有卡背：散牌、牌堆、盒、袋都算 */
export function backableObjects(objects: GameObject[], ids: string[]): GameObject[] {
  const set = new Set(ids);
  return objects.filter((o) => set.has(o.id) && (o.card || Array.isArray(o.pile)));
}

export function effectAction(id: string, index?: number): Action {
  return { t: "effect", id, index };
}

export function chatAction(text: string): Action {
  return { t: "chat", text: text.slice(0, 200) };
}

export function renameAction(name: string): Action {
  return { t: "rename", name: name.slice(0, 24) };
}

export function turnAction(index: number): Action {
  return { t: "turnSet", index };
}
