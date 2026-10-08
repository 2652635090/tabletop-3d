/* 牌桌 · 3D 桌游沙盒 —— SPDX-License-Identifier: GPL-3.0-only
   Copyright (C) 2026 2652635090 · 许可全文见仓库根目录的 LICENSE */

import { fixZone } from "./catalog";
import type { GameObject } from "./types";

/**
 * 座位距离：环形就坐的卡牌游戏里「够不够得着」。
 * 一块有主人的区域垫就是一家的位子，绕桌心一圈数下来相邻两家距离 1；
 * 打不打得着 = 数过去的家数加上目标那家的防御范围，进不进得了自己那家的进攻范围。
 */
export interface Seat {
  /** 这一家坐在哪块区域垫上 */
  o: GameObject;
  /** 绕桌一圈排下来第几家（0 起） */
  at: number;
  /** 进攻范围：数到第几家以内打得着 */
  reach: number;
  /** 防御范围：别人数到你时多算几家 */
  guard: number;
  /** 这一家是谁（手牌区的主人） */
  owner: string;
  /** 桌上怎么称呼这一家 */
  name: string;
}

/** 座次：只认有主人的区域垫，按各自那块垫子相对桌心的角度顺时针排好。各家角度互不相同时顺序唯一 */
export function seatsOf(state: { o: GameObject[] }): Seat[] {
  const list = state.o.filter((o) => o.kind === "zone" && o.owner);
  const angle = (o: GameObject) => {
    const a = Math.atan2(o.z, o.x);
    return a < 0 ? a + Math.PI * 2 : a;
  };
  // 桌心那一点上没有角度可言：那种垫子排在最后，别让它插进环里把距离搅乱
  const centered = list.filter((o) => o.x === 0 && o.z === 0);
  const ring = list.filter((o) => !(o.x === 0 && o.z === 0)).sort((a, b) => angle(a) - angle(b));
  return [...ring, ...centered].map((o, at) => {
    const z = fixZone(o.zone);
    return { o, at, reach: z.reach, guard: z.guard, owner: o.owner ?? "", name: o.label || "区域" };
  });
}

/** 两家之间隔着几步：环形取短的那头，三家四家同桌时左右邻座都是 1，自己到自己 0 */
export function seatGap(a: number, b: number, n: number): number {
  if (a === b) return 0;
  const d = Math.abs(a - b);
  return Math.max(1, Math.min(d, n - d));
}

/** 从这一家数到那一家是几家：吃掉对面的防御范围，最少也算 1 家（凑得再近也隔着一张桌子） */
export function seatDistance(from: Seat, to: Seat, n: number): number {
  if (from.o.id === to.o.id) return 0;
  return Math.max(1, seatGap(from.at, to.at, n) + to.guard);
}

/** 这一家打不打得着那一家的：距离进得了自己的进攻范围 */
export function inRange(from: Seat, to: Seat, n: number): boolean {
  return from.o.id !== to.o.id && seatDistance(from, to, n) <= from.reach;
}
