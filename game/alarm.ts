/* 牌桌 · 3D 桌游沙盒 —— SPDX-License-Identifier: GPL-3.0-only
   Copyright (C) 2026 2652635090 · 许可全文见仓库根目录的 LICENSE */

import { hourLeft, remainingOf } from "./catalog";
import type { GameObject } from "./types";

/**
 * 计时器归零后的响铃：只在响的那台机器上静音，不写进共享桌面。
 * 静音记录的是“这一轮结束时刻”，重新开始计时后又会照常响。
 */

type Ctor = typeof AudioContext;
let ctx: AudioContext | null = null;
let lastBeep = 0;
const silenced = new Map<string, number>();
const BEEP_EVERY = 1150;

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor = (window.AudioContext ?? (window as unknown as { webkitAudioContext?: Ctor }).webkitAudioContext) as Ctor | undefined;
  if (!Ctor) return null;
  if (!ctx) {
    try {
      ctx = new Ctor();
    } catch {
      return null;
    }
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx.state === "running" ? ctx : null;
}

/** 浏览器要用户先碰一下才允许出声：任何点击都可以拿来做这次解锁 */
export function unlockAlarm(): void {
  audio();
}

/** 已经归零、还在跑、本机没静音的计时器与沙漏 */
export function ringing(objects: GameObject[], now = Date.now()): GameObject[] {
  return objects.filter((o) => {
    const key = cycleOf(o);
    return key !== null && silenced.get(o.id) !== key && leftOf(o, now) <= 0;
  });
}

/** 还在跑的这一轮的起点标识：没在跑返回 null。静音记它，重新起算后又会照常响 */
function cycleOf(o: GameObject): number | null {
  if (o.kind === "timer") return o.endsAt ?? null;
  if (o.kind === "hour") return o.hour?.at ?? null;
  return null;
}

/** 还剩几秒：沙漏与计时器各自算法，响铃只看它是否已经归零 */
function leftOf(o: GameObject, now: number): number {
  if (o.kind === "hour") return o.hour?.at == null ? Infinity : hourLeft(o, now);
  return remainingOf(o, now);
}

export function silenceAlarm(o: GameObject): void {
  const key = cycleOf(o);
  if (key !== null) silenced.set(o.id, key);
}

export function silenceAllAlarms(objects: GameObject[], now = Date.now()): void {
  for (const o of ringing(objects, now)) silenceAlarm(o);
}

/** 到点滴两声；返回这一刻是否正在响，界面用它决定要不要挂出停止按钮 */
export function tickAlarm(objects: GameObject[], now = Date.now()): boolean {
  if (!ringing(objects, now).length) return false;
  if (now - lastBeep < BEEP_EVERY) return true;
  lastBeep = now;
  beep(now);
  return true;
}

function beep(seed: number): void {
  const ac = audio();
  if (!ac) return;
  const t0 = ac.currentTime;
  // 两台机器同时提醒也错不开：用当前毫秒当随机种子，比 Math.random 更好复现问题
  const offset = (seed % 7) * 0.03;
  for (const [at, freq, dur] of [[offset, 1180, 0.1], [offset + 0.17, 1560, 0.12]] as const) {
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = "square";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, t0 + at);
    gain.gain.exponentialRampToValueAtTime(0.14, t0 + at + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + at + dur);
    osc.connect(gain);
    gain.connect(ac.destination);
    osc.start(t0 + at);
    osc.stop(t0 + at + dur + 0.03);
  }
}
