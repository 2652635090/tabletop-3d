/* 牌桌 · 3D 桌游沙盒 —— SPDX-License-Identifier: GPL-3.0-only
   Copyright (C) 2026 2652635090 · 许可全文见仓库根目录的 LICENSE */

import type { CardSpec } from "./types";

/**
 * 《潮汐》的算分：把收藏区里这一堆牌拆成若干顺潮与叠潮，让总分最大。
 * 顺潮 = 同色数字相连 3 张以上，得 张数×3−3；叠潮 = 同数字异色 3 或 4 张，得 张数×4。
 * 潮珠是万能牌，顶任意花色任意数字，但一个组合至多一张；一张牌只进一个组，落单的牌不计分。
 * 1 与 10 不相邻，所以顺潮不会绕回牌面两端。
 */

/** 纯函数：不查状态也不摇随机数，各端拿同一堆牌必然算出同一个答案 */
export const TIDE_BACK = "tide";
export const TIDE_NUM_MAX = 10;
/** 顺潮最长 8 张（1—8 到 3—10），这条上限只是把枚举收口 */
const RUN_MAX_LEN = TIDE_NUM_MAX - 2;
/** 搜索节点上限：收藏区十几张远远碰不到，防的是有人把整副 44 张塞进一堆来算 */
export const TIDE_NODE_CAP = 60000;
/** 超过这个张数就不拆了：拆法搜索是指数级的，整副牌算一遍会卡住手机上的一帧 */
export const TIDE_CALC_MAX = 24;

export type TideCard = { suit: string; num: number; pearl: boolean; card: CardSpec };

type Cand = { kind: "run" | "set"; len: number; score: number; suit?: string; from?: number; to?: number; num?: number; idx: number[] };

export type TideGroup = {
  kind: "run" | "set";
  /** 组里的张数，含顶位的潮珠 */
  len: number;
  score: number;
  suit?: string;
  from?: number;
  to?: number;
  num?: number;
  cards: CardSpec[];
};

export type TideScore = {
  total: number;
  groups: TideGroup[];
  /** 落单不计分的张数 */
  loose: number;
  /** 撞到节点上限：这个拆法合法，但不保证是最大的那个 */
  truncated: boolean;
  /** 牌多过 TIDE_CALC_MAX：干脆没算，别把这一帧交给指数搜索 */
  tooMany: boolean;
};

/** 认一张《潮汐》牌：潮珠没有数字，靠「点数为空」识别 */
export function tideCardOf(spec?: CardSpec): TideCard | null {
  if (!spec || spec.back !== TIDE_BACK) return null;
  if (!spec.rank) return { suit: spec.cat ?? "潮珠", num: 0, pearl: true, card: spec };
  const num = Number.parseInt(spec.rank, 10);
  return Number.isFinite(num) && num > 0 && num <= TIDE_NUM_MAX
    ? { suit: spec.cat ?? "?", num, pearl: false, card: spec }
    : null;
}

/** 这堆牌里有没有《潮汐》的牌：选中栏拿它决定要不要摆算分那一行 */
export function isTideCards(cards: (CardSpec | undefined)[]): boolean {
  return cards.some((c) => !!c && c.back === TIDE_BACK);
}

function groupScore(kind: Cand["kind"], len: number): number {
  return kind === "run" ? len * 3 - 3 : len * 4;
}

/**
 * 枚举所有合法组合。同一花色同一数字只留第一张：真牌堆本来就独一无二，多出来的重复牌进不了同一个组。
 * 每组都记张数与分数，至于潮珠顶的是哪个位置，从 from/to 与 num 就能读出来。
 */
function candidatesOf(items: TideCard[]): { list: Cand[]; byFirst: Cand[][] } {
  const idxOf = new Map<string, number>();
  const pearls: number[] = [];
  const suits: string[] = [];
  items.forEach((it, i) => {
    if (it.pearl) {
      pearls.push(i);
      return;
    }
    if (!suits.includes(it.suit)) suits.push(it.suit);
    const key = `${it.suit}|${it.num}`;
    if (!idxOf.has(key)) idxOf.set(key, i);
  });

  const list: Cand[] = [];
  const push = (kind: Cand["kind"], idx: number[], extra: Pick<Cand, "suit" | "from" | "to" | "num">) => {
    const len = idx.length;
    list.push({ kind, len, score: groupScore(kind, len), idx: idx.slice(), ...extra });
  };

  for (const suit of suits) {
    // 顺潮：定住起点与张数，缺的那一个数字只能由一张潮珠来顶，缺两个就非法
    for (let from = 1; from + 2 <= TIDE_NUM_MAX; from++) {
      for (let len = 3; len <= RUN_MAX_LEN && from + len - 1 <= TIDE_NUM_MAX; len++) {
        const used: number[] = [];
        const gaps: number[] = [];
        for (let n = from; n < from + len; n++) {
          const i = idxOf.get(`${suit}|${n}`);
          if (i === undefined) gaps.push(n);
          else used.push(i);
        }
        // 再往长走只会更缺，所以缺口一超限就能直接收口
        if (gaps.length > 1 || gaps.length > pearls.length) break;
        if (gaps.length === 0) push("run", used, { suit, from, to: from + len - 1 });
        else for (const p of pearls) push("run", [...used, p], { suit, from, to: from + len - 1 });
      }
    }
  }

  for (let n = 1; n <= TIDE_NUM_MAX; n++) {
    // 叠潮：同数字、异色，一个花色只出一张
    const perSuit = new Map<string, number>();
    items.forEach((it, i) => {
      if (!it.pearl && it.num === n && !perSuit.has(it.suit)) perSuit.set(it.suit, i);
    });
    const arr = [...perSuit.values()];
    for (let mask = 1; mask < 1 << arr.length; mask++) {
      const picked: number[] = [];
      for (let b = 0; b < arr.length; b++) if (mask & (1 << b)) picked.push(arr[b]);
      // 3 或 4 张直接成组；2 张要配一张潮珠，3 张配潮珠则顶到 4 张
      if (picked.length >= 3) push("set", picked, { num: n });
      if (picked.length === 3 && pearls.length) for (const p of pearls) push("set", [...picked, p], { num: n });
      if (picked.length === 2 && pearls.length) for (const p of pearls) push("set", [...picked, p], { num: n });
    }
  }

  const byFirst: Cand[][] = items.map(() => []);
  for (const g of list) byFirst[Math.min(...g.idx)].push(g);
  return { list, byFirst };
}

type Node = { total: number; longest: number; grouped: number; pick: Cand | null };

/** 总分相同再比最长组、再比成组张数——正是规则里的平分口径，于是最优拆法也只有一个说法 */
function better(a: Node, b: Node): boolean {
  return a.total > b.total || (a.total === b.total && (a.longest > b.longest || (a.longest === b.longest && a.grouped > b.grouped)));
}

/**
 * 拆法搜索：每一步只处理「还没定的牌里最靠前的那张」——它要么落单，要么进一个以它为起头的组。
 * 这样每个划分只被走到一次，不会排列爆炸；记忆化按已用集合，撞上限就诚实标 truncated。
 */
export function tideScore(cards: (CardSpec | undefined)[]): TideScore {
  const items: TideCard[] = [];
  for (const c of cards) {
    const t = tideCardOf(c);
    if (t) items.push(t);
  }
  const n = items.length;
  if (!n) return { total: 0, groups: [], loose: 0, tooMany: false, truncated: false };
  // 整副牌一起塞过来：不是算不出，是算这一下要把手机的主线程按住几百毫秒
  if (n > TIDE_CALC_MAX) return { total: 0, groups: [], loose: n, tooMany: true, truncated: false };

  const { byFirst } = candidatesOf(items);
  const used = new Array<boolean>(n).fill(false);
  const memo = new Map<string, Node>();
  const empty: Node = { total: 0, longest: 0, grouped: 0, pick: null };
  let nodes = 0;
  let truncated = false;

  const key = () => {
    let out = "";
    for (let i = 0; i < n; i++) out += used[i] ? "1" : "0";
    return out;
  };

  const solve = (): Node => {
    if (nodes++ > TIDE_NODE_CAP) {
      truncated = true;
      return empty;
    }
    const first = used.indexOf(false);
    if (first === -1) return empty;
    const k = key();
    const hit = memo.get(k);
    if (hit) return hit;

    // 落单这条路：先记下「最靠前那张不用」，剩下的照常拆
    used[first] = true;
    const skip = solve();
    used[first] = false;
    let best: Node = { ...skip, pick: null };

    for (const g of byFirst[first]) {
      const flip = g.idx.filter((i) => !used[i]);
      if (flip.length !== g.idx.length) continue;
      for (const i of flip) used[i] = true;
      const sub = solve();
      for (const i of flip) used[i] = false;
      const cand: Node = { total: g.score + sub.total, longest: Math.max(g.len, sub.longest), grouped: g.len + sub.grouped, pick: g };
      if (better(cand, best)) best = cand;
    }

    memo.set(k, best);
    return best;
  };

  solve();
  const groups: TideGroup[] = [];
  // 从第一步的记忆反着走一遍，把拆法一组组取出来；分数按取出的组现算，保证与文字说的是同一份
  for (;;) {
    const first = used.indexOf(false);
    if (first === -1) break;
    const pick = memo.get(key())?.pick ?? null;
    used[first] = true;
    if (!pick) continue;
    for (const i of pick.idx) used[i] = true;
    groups.push({
      kind: pick.kind,
      len: pick.len,
      score: pick.score,
      suit: pick.suit,
      from: pick.from,
      to: pick.to,
      num: pick.num,
      cards: pick.idx.map((i) => items[i].card),
    });
  }

  const total = groups.reduce((s, g) => s + g.score, 0);
  const grouped = groups.reduce((s, g) => s + g.len, 0);
  // 按分数从高到低排：选中栏摆明细、描述那一行说拆法，读的都是同一个顺序
  groups.sort((a, b) => b.score - a.score);
  return { total, groups, loose: n - grouped, tooMany: false, truncated };
}

const CN_COUNT = ["", "", "两", "三", "四"];

/** 一组的说法：选中栏的明细与下面那句总览共用，别在 UI 里另写一套 */
export function groupText(g: TideGroup): string {
  return g.kind === "run"
    ? `顺潮 ${g.suit}${g.from}—${g.to}（${g.score}）`
    : `叠潮 ${CN_COUNT[g.len] ?? g.len}个 ${g.num}（${g.score}）`;
}

/** 一行说清怎么拆的：选中栏与规则书都读它，别在 UI 里另写一套说法 */
export function describeTide(score: TideScore): string {
  if (score.tooMany) return `这 ${score.loose} 张牌太多，算不动：只框住要结算的那一堆再算`;
  if (!score.groups.length) return "还没成组：凑不出 3 张的顺潮或叠潮";
  const parts = score.groups.map(groupText);
  const loose = score.loose > 0 ? ` · 散 ${score.loose} 张不计分` : "";
  const cap = score.truncated ? " · 牌太多，这个拆法未必最优" : "";
  return `最高 ${score.total} 分：${parts.join(" · ")}${loose}${cap}`;
}
