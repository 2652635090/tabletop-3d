/* 牌桌 · 3D 桌游沙盒 —— SPDX-License-Identifier: GPL-3.0-only
   Copyright (C) 2026 2652635090 · 许可全文见仓库根目录的 LICENSE */

import { clipReady, ensureLocalClip, resyncAudio } from "./audio";
import { MP3_PUSH_MAX, MP3_VOL_DEFAULT } from "./catalog";
import { decodePart, joinTrack, splitTrack } from "./track";
import type { GameObject, GramSpec } from "./types";

/**
 * 随身听：一台默认只属于自己的机器。
 *
 * 三件事各自分开放：
 * 1. 本机那一档的走带参数（放没放、在第几秒、音量）只活在这个模块的 Map 里，一个字节都不进桌面状态；
 * 2. 歌的字节也只在同学之间递——谁点了「一起听」，就朝那台机器的主人求一份，服务器只替人递一下，自己一份都不存；
 * 3. 共享出去之后才把进度写上桌面，全桌照同一份状态各推各的，跟唱片机一个脾气。
 */

/* ———— 本机那一档：私人走带，不写桌面 ———— */

export interface LocalPlay {
  playing: boolean;
  /** 上次停下（或刚拧进度）时所在的秒 */
  pos: number;
  /** 起播那一下的墙钟；停下时为 null */
  at: number | null;
  vol: number;
  loop: boolean;
}

const priv = new Map<string, LocalPlay>();

function fresh(): LocalPlay {
  return { playing: false, pos: 0, at: null, vol: MP3_VOL_DEFAULT, loop: false };
}

/** 本机这一档的走带：第一次上手才给它一份默认值，光是看一眼不会造出状态 */
function local(o: GameObject): LocalPlay {
  let l = priv.get(o.id);
  if (!l) {
    l = fresh();
    priv.set(o.id, l);
  }
  return l;
}

function peek(o: GameObject): LocalPlay | null {
  return priv.get(o.id) ?? null;
}

/** 按起播时刻往前推：与桌面那份同一套算法，只是这份不用给别人看 */
function advance(l: LocalPlay, dur: number, now: number): number {
  if (!l.playing || l.at === null || !dur) return l.pos;
  const t = l.pos + (now - l.at) / 1000;
  if (t < 0) return 0;
  return l.loop ? t % dur : Math.min(t, dur);
}

/** 本机这一档放到第几秒了：进度条按这个画 */
export function localPos(o: GameObject, now = Date.now()): number {
  const l = peek(o);
  return l && o.mp3 ? advance(l, o.mp3.dur, now) : 0;
}

export function localVol(o: GameObject): number {
  return peek(o)?.vol ?? MP3_VOL_DEFAULT;
}

export function localLoop(o: GameObject): boolean {
  return peek(o)?.loop === true;
}

export function localPlaying(o: GameObject): boolean {
  return peek(o)?.playing === true;
}

/** 私人那一台放/停：按到头了就当重来 */
export function localToggle(o: GameObject, now = Date.now()): void {
  const dur = o.mp3?.dur ?? 0;
  if (!o.mp3?.clip || !clipReady(o.mp3.clip)) return;
  const l = local(o);
  if (l.playing) {
    l.pos = advance(l, dur, now);
    l.playing = false;
    l.at = null;
  } else {
    if (dur && l.pos >= dur - 0.05) l.pos = 0;
    l.playing = true;
    l.at = now;
  }
  resyncAudio(now);
}

export function localSeek(o: GameObject, pos: number, now = Date.now()): void {
  const dur = o.mp3?.dur ?? 0;
  const l = local(o);
  const to = Math.max(0, Math.min(dur, pos));
  l.pos = Math.round(to * 1000) / 1000;
  if (l.playing) l.at = now;
  resyncAudio(now);
}

/** 私人音量：这只影响这台浏览器自己的嗓子，桌上那个钮是所有人共享的 */
export function localSetVol(o: GameObject, vol: number): void {
  const l = local(o);
  l.vol = Math.round(Math.max(0, Math.min(1, vol)) * 100) / 100;
  resyncAudio();
}

export function localSetLoop(o: GameObject, on: boolean, now = Date.now()): void {
  const l = local(o);
  if (l.loop === on) return;
  if (l.playing) {
    l.pos = advance(l, o.mp3?.dur ?? 0, now);
    l.at = now;
  }
  l.loop = on;
  resyncAudio(now);
}

/** 共享出去或机器拆了：本机那一档让位，别再和桌面那份抢同一个元素 */
export function dropLocal(id: string): void {
  priv.delete(id);
}

/** 机器从桌上没了（或被抽走）：本机那一档跟着清，别让私货在内存里赖着 */
export function pruneLocal(objects: GameObject[]): void {
  const alive = new Set(objects.filter((o) => o.kind === "mp3").map((o) => o.id));
  for (const id of [...priv.keys()]) if (!alive.has(id)) priv.delete(id);
}

/**
 * 折算成唱片机那个形状交给播放引擎：共享出去的抄桌面，没共享的抄本机这一档。
 * 本机没这首歌的字节时返回 null——引擎也就不会替它去服务器上白跑一趟。
 */
export function mp3View(o: GameObject, now = Date.now()): GramSpec | null {
  const m = o.kind === "mp3" ? o.mp3 : null;
  if (!m?.clip) return null;
  if (m.shared) {
    return { clip: m.clip, name: m.name, dur: m.dur, pos: m.pos, playing: m.playing, at: m.at, vol: m.vol, loop: m.loop };
  }
  const l = peek(o);
  if (!l || !clipReady(m.clip)) return null;
  return { clip: m.clip, name: m.name, dur: m.dur, pos: advance(l, m.dur, now), playing: l.playing, at: l.playing ? l.at : null, vol: l.vol, loop: l.loop };
}

/** 把本机缓存里存着的那几首歌捞进内存：刷新过后自己的机器还得能接着听 */
export function pullLocalSongs(objects: GameObject[]): void {
  const keys = new Set<string>();
  for (const o of objects) {
    const clip = o.kind === "mp3" ? o.mp3?.clip : null;
    if (clip && !clipReady(clip)) keys.add(clip);
  }
  for (const key of keys) void ensureLocalClip(key);
}

/* ———— 同学互传：一首歌一段一段递，服务器只递话不落盘 ———— */

/** 实时通道那两头：ask 是求歌，push 是递歌。轮询回落时没有这条路（要人连着才递得动） */
export interface TrackTransport {
  ask(code: string, to: string, key: string): void;
  push(code: string, to: string, key: string, seq: number, total: number, data: string): void;
}

let transport: TrackTransport | null = null;

export function setTrackTransport(next: TrackTransport | null): void {
  transport = next;
}

/** 取歌这件事要说得出口：UI 照这几条决定是转圈、是成了、还是没拿到 */
export interface Transfer {
  key: string;
  /** 从谁的机器上取（clientId） */
  from: string;
  got: number;
  /** 一共几段；还没人答话时是 0 */
  total: number;
  failed: boolean;
}

const transfers = new Map<string, Transfer>();
/** 在路上的那几段：按 key 归位，齐了才凑成一首歌 */
interface Intake {
  parts: (Uint8Array | null)[];
  total: number;
  code: string;
  to: string;
  timer: number;
}
const intakes = new Map<string, Intake>();
/** 这首歌唱给过谁听：求歌断了要重求，得记得当初朝哪台机器张的口 */
const asked = new Map<string, { code: string; to: string }>();
/** 正在往外递的几首歌（同一首对同一个人只递一份）：一首歌同时最多递 MP3_PUSH_MAX 份 */
const outgoings = new Map<string, number>();
const sinks = new Set<() => void>();

/** 一段都没再进来的歌：过了这一阵就算没拿到，别让人对着转圈干等 */
const STALL_MS = 24000;
/** 递歌的节奏：每 200 毫秒递这么几段，约 3MB/s，卡在服务端那条预算线以内 */
const PUSH_EVERY = 200;
const PUSH_BURST = 6;

function emit(): void {
  for (const fn of [...sinks]) fn();
}

export function subscribeTransfers(fn: () => void): () => void {
  sinks.add(fn);
  return () => sinks.delete(fn);
}

export function transfersOf(): Transfer[] {
  return [...transfers.values()];
}

export function transferOf(key: string | null | undefined): Transfer | null {
  return key ? transfers.get(key) ?? null : null;
}

/** 本机是不是已经有这首歌的字节了：有就不用再求人 */
export function songHere(key: string | null | undefined): boolean {
  return clipReady(key);
}

function stall(key: string): number {
  return window.setTimeout(() => {
    const it = intakes.get(key);
    if (!it) return 0;
    intakes.delete(key);
    transfers.set(key, { key, from: it.to, got: it.parts.filter(Boolean).length, total: it.total, failed: true });
    emit();
    return 0;
  }, STALL_MS);
}

/** 朝那台机器的主人求一首歌：一句求歌换来的是他本机那份字节，服务器一个字节都不经手 */
export function wantTrack(code: string, to: string, key: string): void {
  if (!key || clipReady(key)) return;
  const live = intakes.get(key);
  if (live) {
    // 还在路上：换个主人就重新求，同一位就等这一轮自己到头
    if (live.to === to) return;
    window.clearTimeout(live.timer);
    intakes.delete(key);
  }
  if (!to || !transport) {
    transfers.set(key, { key, from: to, got: 0, total: 0, failed: true });
    emit();
    return;
  }
  transfers.set(key, { key, from: to, got: 0, total: 0, failed: false });
  intakes.set(key, { parts: [], total: 0, code, to, timer: stall(key) });
  asked.set(key, { code, to });
  transport.ask(code, to, key);
  emit();
}

/** 桌上那台机器该向谁求歌：主人就是摆它的人 */
export function wantFromOwner(o: GameObject, code: string): void {
  const m = o.kind === "mp3" ? o.mp3 : null;
  if (!m?.clip) return;
  wantTrack(code, m.by, m.clip);
}

/** 取不到那首歌：把要回来的路重开一次（先忘掉上一轮的成败） */
export function retryTrack(key: string): void {
  const it = intakes.get(key);
  if (it) {
    window.clearTimeout(it.timer);
    intakes.delete(key);
    wantTrack(it.code, it.to, key);
    return;
  }
  const was = asked.get(key);
  transfers.delete(key);
  emit();
  if (was) wantTrack(was.code, was.to, key);
}

/** 主人那一头听到有人要歌：本机有字节就一段一段往外递，没有就一句也不回 */
export function offerTo(code: string, from: string, key: string): void {
  if (!transport || !from || !key) return;
  const mine = `${from}|${key}`;
  if (outgoings.has(mine) || outgoings.size >= MP3_PUSH_MAX) return;
  void splitTrack(key).then((parts) => {
    if (!parts) {
      // 本机也没这份字节（比如刚清了缓存）：不吭声，让求的人自己看着办
      return;
    }
    let seq = 0;
    const timer = window.setInterval(() => {
      for (let i = 0; i < PUSH_BURST && seq < parts.length; i++) {
        transport?.push(code, from, key, seq, parts.length, parts[seq]);
        seq += 1;
      }
      if (seq < parts.length) return;
      window.clearInterval(timer);
      outgoings.delete(mine);
    }, PUSH_EVERY);
    outgoings.set(mine, timer);
  });
}

/** 收到同学递来的一段：归好位，齐了就凑成一首歌交给本机缓存 */
export function handlePart(code: string, from: string, key: string, seq: number, total: number, data: string): void {
  const it = intakes.get(key);
  if (!it || !Number.isInteger(seq) || seq < 0 || !Number.isInteger(total) || total < 1) return;
  const bytes = decodePart(data);
  if (!bytes) return;
  if (it.total !== total) {
    it.parts = [];
    it.total = total;
  }
  if (it.parts[seq]) return;
  it.parts[seq] = bytes;
  window.clearTimeout(it.timer);
  it.timer = stall(key);
  const got = it.parts.filter(Boolean).length;
  transfers.set(key, { key, from: it.to, got, total, failed: false });
  if (got < total) {
    emit();
    return;
  }
  const parts = it.parts.filter((p): p is Uint8Array => !!p);
  window.clearTimeout(it.timer);
  intakes.delete(key);
  void joinTrack(key, parts).then((ok) => {
    transfers.set(key, { key, from, got: total, total, failed: !ok });
    if (ok) resyncAudio();
    emit();
  });
}

/** 离开房间：路上的求歌与递歌全掐掉，本机已经拿到手的字节留着 */
export function stopTracks(): void {
  for (const it of intakes.values()) window.clearTimeout(it.timer);
  for (const timer of outgoings.values()) window.clearInterval(timer);
  intakes.clear();
  outgoings.clear();
  transfers.clear();
  emit();
}
