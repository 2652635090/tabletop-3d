/* 牌桌 · 3D 桌游沙盒 —— SPDX-License-Identifier: GPL-3.0-only
   Copyright (C) 2026 2652635090 · 许可全文见仓库根目录的 LICENSE */

import { ApiError, api } from "./api";
import { IMAGE_KEY } from "./catalog";
import type { GameObject } from "./types";

/** 卡面图片：桌面状态里只保存内容哈希 key，像素由每个客户端按需拉取并解码。 */

export { IMAGE_KEY };
/** 卡面像素的额度：手牌条现在按屏幕密度整面重画，源图再糊就一眼看得出来 */
export const MAX_IMAGE_CHARS = 120000;
/** 桌垫要看得清细节，额度直接顶到服务端单图上限以内 */
export const MAX_MAT_CHARS = 190000;
/** 超清档的卡面额度：与服务端单图上限（base64 20 万字符）留一道余量，再高就被服务端整份拒收 */
export const MAX_HD_CHARS = 190000;
/** 只挡明显读不动的巨型文件，其余一律交给解码器 */
const MAX_FILE_BYTES = 64 * 1024 * 1024;
/** 部分浏览器画不出超过这个边长的画布 */
const CANVAS_MAX = 4096;
const CARD_SIDE = { from: 960, min: 240 };
const MAT_SIDE = { from: 1900, min: 360 };
/** 超清档从更高的边长起步，能不重画就不重画，实在塞不下才开始降 */
const HD_SIDE = { from: 2400, min: 480 };
const QUALITIES = [0.82, 0.72, 0.62];
const MAT_QUALITIES = [0.82, 0.7, 0.58, 0.46];
const HD_QUALITIES = [0.95, 0.9, 0.85, 0.8, 0.74, 0.68];
const MIMES = ["image/webp", "image/jpeg"];
/** 服务端只认这三种 dataURL，原图属于这三种才谈得上「一个字节都不动」 */
const RAW_DATA = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;

/** 超清档开关：由画面设置跟着画质档一起推进来，只影响这台浏览器往上传的像素 */
let hdImport = false;
export function setHdImport(on: boolean): void {
  hdImport = on;
}
export function hdImportOn(): boolean {
  return hdImport;
}

export interface ImageBatch {
  images: Record<string, string>;
  omitted: string[];
}

export interface ImageTransport {
  put(key: string, data: string): Promise<void>;
  get(keys: string[]): Promise<ImageBatch>;
}

const pixels = new Map<string, HTMLImageElement>();
const fetching = new Set<string>();
const decoding = new Set<string>();
const broken = new Set<string>();
/** 眼下这张桌子要用到的 key：只有它决定进度条的总数 */
let wanted = new Set<string>();
/** 服务器答不上来的次数：找同桌补要一轮，两轮还不给就当这张图真没了 */
const misses = new Map<string, number>();
const MISS_MAX = 2;
/** 已经向同桌开口、正等他们把图补传上来的那几张：这段时间别再去敲服务器的门 */
const cooling = new Set<string>();
const MISS_WAIT_MS = 2200;
const listeners = new Set<() => void>();
let transport: ImageTransport | null = null;
/** 向同桌求源：谁手上有这几张，谁就往服务器补传一份。只有实时链路做得到 */
let askPeers: ((keys: string[]) => void) | null = null;

export function setImageTransport(next: ImageTransport | null): void {
  transport = next;
}

export function setImageSync(fn: ((keys: string[]) => void) | null): void {
  askPeers = fn;
}

export interface ImageProgress {
  /** 这张桌子一共要用多少张自传图 */
  total: number;
  ready: number;
  /** 还在路上的：本机没缓存、服务器还没答、也没被判死 */
  pending: number;
  failed: number;
}

/** 桌面资源的到货情况：小白条上那个 x/y 就是从这里读的 */
export function imageProgress(): ImageProgress {
  let ready = 0;
  let failed = 0;
  for (const k of wanted) {
    if (pixels.has(k)) ready += 1;
    else if (broken.has(k)) failed += 1;
  }
  return { total: wanted.size, ready, failed, pending: wanted.size - ready - failed };
}

/**
 * 重来一遍：把「这张图没了」的判定连同内存里那份解码结果一起丢掉，
 * 重新走本机缓存与服务器。本机的像素缓存不动，所以下次别人求源还拿得出来。
 */
export function reloadImages(keys?: string[]): number {
  const target = (keys?.length ? keys : [...wanted]).filter((k) => IMAGE_KEY.test(k));
  for (const k of target) {
    broken.delete(k);
    misses.delete(k);
    cooling.delete(k);
    pixels.delete(k);
  }
  emit();
  return target.length;
}

/** 只有解码完成的图片才可以画到卡面上 */
export function hasImage(key: string | undefined): boolean {
  return !!key && pixels.has(key);
}

export function imageOf(key: string | undefined): HTMLImageElement | undefined {
  return key ? pixels.get(key) : undefined;
}

export function subscribeImages(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit(): void {
  for (const fn of [...listeners]) fn();
}

/** 内容哈希做 key：同一张图在不同人电脑上重复上传也只存一份 */
export function keyOf(data: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < data.length; i++) {
    h ^= data.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `i${data.length.toString(36)}${h.toString(36)}`.toLowerCase().slice(0, 24).padEnd(6, "0");
}

/** 上传一张卡面并返回可放进桌面状态的 key；本地牌桌只留在内存里 */
export async function saveImage(data: string): Promise<string> {
  const key = keyOf(data);
  broken.delete(key);
  decode(key, data);
  storePixels([[key, data]]);
  if (transport) await transport.put(key, data);
  return key;
}

/**
 * 一次向服务器要几张：服务器单次响应有字节额度（约七张满额卡面），一次问太多就会被截掉后半。
 * 收到 omitted 就把这一档缩小、把没给的那几张重新排队，几轮之内自己收敛到额度以内。
 */
let askMax = 12;
/** 已排队的补要轮次：同一帧内别重复排，否则空转成一串请求 */
let repending = false;

/** 向服务器问一批像素，本机有、服务器没有的那些要补传上去 */
async function pull(keys: string[]): Promise<void> {
  if (!keys.length) return;
  if (!transport) {
    for (const k of keys) {
      broken.add(k);
      fetching.delete(k);
    }
    emit();
    return;
  }
  await transport.get(keys).then((res) => {
    const got = res?.images ?? {};
    const omitted = new Set(res?.omitted ?? []);
    const cached: [string, string][] = [];
    const none: string[] = [];
    for (const k of keys) {
      const data = typeof got[k] === "string" ? got[k] : "";
      if (data) {
        decode(k, data);
        cached.push([k, data]);
      } else if (!omitted.has(k)) none.push(k);
    }
    // 服务器确实没有的那几张，先转向同桌要一轮再判死
    if (none.length) seekPeers(none);
    storePixels(cached);
    if (omitted.size) {
      askMax = Math.max(2, Math.min(askMax, Math.max(1, keys.length - omitted.size)));
      // 问到只剩两张还是不给：服务器就是没有这张图。先转向同桌求一轮，求不到才判死
      if (askMax <= 2 && keys.length <= 2) seekPeers([...omitted]);
      if (!repending) {
        repending = true;
        window.setTimeout(() => {
          repending = false;
          emit();
        }, 0);
      }
    }
  }).catch((error) => {
    // 整批失败多半是网络抖一下：同样先走同桌求源，别一竿子打死
    seekPeers(keys);
    if (!(error instanceof ApiError)) console.warn("卡面图片拉取失败");
  }).finally(() => {
    for (const k of keys) fetching.delete(k);
    emit();
  });
}

/**
 * 服务器答不上来的那几张：先在房间里喊一嗓子，谁本机存着就往服务器补传，
 * 过两秒再自己重问一遍。喊两轮还不给，才认这张图真没了。
 */
function seekPeers(keys: string[]): void {
  const ask: string[] = [];
  for (const k of keys) {
    const tries = (misses.get(k) ?? 0) + 1;
    misses.set(k, tries);
    if (!askPeers || tries > MISS_MAX) broken.add(k);
    else {
      cooling.add(k);
      ask.push(k);
    }
  }
  if (ask.length) {
    askPeers!(ask);
    window.setTimeout(() => {
      for (const k of ask) cooling.delete(k);
      emit();
    }, MISS_WAIT_MS);
  }
  emit();
}

/** 先查本机缓存再问服务器：缓存命中的一帧都不用等网络 */
export function requestImages(keys: string[], scope?: "table"): boolean {
  const valid = keys.filter((k) => IMAGE_KEY.test(k));
  // 只有整桌那一次上报能换分母：卡片面板、全量列表零散要几张，不该把进度条的数字带跑
  if (scope === "table") wanted = new Set(valid);
  const missing = valid.filter((k) => !pixels.has(k) && !broken.has(k) && !fetching.has(k) && !decoding.has(k) && !cooling.has(k));
  if (missing.length) {
    const batch = missing.slice(0, askMax);
    for (const k of batch) fetching.add(k);
    void loadPixels(batch).then((hits) => {
      const rest: string[] = [];
      for (const k of batch) {
        if (typeof hits[k] === "string") decode(k, hits[k]);
        else rest.push(k);
      }
      // 缓存命中的这批已经交给解码器了，别再挂着 fetching，否则下一轮会把它们当在途请求跳过
      for (const k of batch) if (!rest.includes(k)) fetching.delete(k);
      emit();
      return pull(rest);
    }).catch(() => pull(batch));
  }
  return valid.every((k) => pixels.has(k) || broken.has(k));
}

function decode(key: string, data: string): void {
  if (pixels.has(key) || decoding.has(key)) return;
  decoding.add(key);
  broken.delete(key);
  const el = new Image();
  el.onload = () => {
    decoding.delete(key);
    pixels.set(key, el);
    emit();
  };
  el.onerror = () => {
    decoding.delete(key);
    broken.add(key);
    emit();
  };
  el.src = data;
}

/* ———— 像素的本机缓存：见过一次的卡面和桌垫，下次开同一张桌子不必再走网络 ———— */

const DB_NAME = "tabletop3d";
const PIX_STORE = "images";
/** 桌垫一张能占 190KB，攒够这些就把超出的按任意顺序丢掉 —— 缓存扔了无非是再拉一次 */
const PIX_MAX = 240;
let opening: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (opening === null) {
    opening = new Promise((resolve) => {
      try {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => {
          if (!req.result.objectStoreNames.contains(PIX_STORE)) req.result.createObjectStore(PIX_STORE);
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
      } catch {
        // 隐私模式或浏览器不支持：整条缓存路径直接消失，不影响正常拉图
        resolve(null);
      }
    });
  }
  return opening;
}

/** 一次读一批；读不到就当作没有，让调用方去问服务器 */
function loadPixels(keys: string[]): Promise<Record<string, string>> {
  return openDb().then((handle) => new Promise<Record<string, string>>((resolve) => {
    const out: Record<string, string> = {};
    if (!handle || !keys.length) return resolve(out);
    let tx: IDBTransaction;
    try {
      tx = handle.transaction(PIX_STORE, "readonly");
    } catch {
      return resolve(out);
    }
    const store = tx.objectStore(PIX_STORE);
    let left = keys.length;
    const done = () => { if (!--left) resolve(out); };
    for (const key of keys) {
      const req = store.get(key);
      req.onsuccess = () => {
        if (typeof req.result === "string") out[key] = req.result;
        done();
      };
      req.onerror = done;
    }
  }));
}

function storePixels(pairs: [string, string][]): void {
  if (!pairs.length) return;
  void openDb().then((handle) => {
    if (!handle) return;
    try {
      const tx = handle.transaction(PIX_STORE, "readwrite");
      const store = tx.objectStore(PIX_STORE);
      for (const [key, data] of pairs) store.put(data, key);
      const count = store.count();
      count.onsuccess = () => {
        let over = Number(count.result) - PIX_MAX;
        if (over <= 0) return;
        const walk = store.openCursor();
        walk.onsuccess = () => {
          const cursor = walk.result;
          if (!cursor || over <= 0) return;
          over -= 1;
          cursor.delete();
          cursor.continue();
        };
      };
    } catch {
      /* 写不进去只是下次再下一遍 */
    }
  });
}

/** 本机像素缓存的规模：只数张数，读值算字节会把几十兆搬进内存 */
export interface PixelCacheStats {
  count: number;
  /** 浏览器不给开 IndexedDB（隐私模式等）时这份缓存整条不存在 */
  ok: boolean;
}

export function pixelCacheStats(): Promise<PixelCacheStats> {
  return openDb().then((handle) => new Promise<PixelCacheStats>((resolve) => {
    if (!handle) return resolve({ count: 0, ok: false });
    try {
      const req = handle.transaction(PIX_STORE, "readonly").objectStore(PIX_STORE).count();
      req.onsuccess = () => resolve({ count: Number(req.result) || 0, ok: true });
      req.onerror = () => resolve({ count: 0, ok: false });
    } catch {
      resolve({ count: 0, ok: false });
    }
  }));
}

/** 清空像素缓存：卡面随时能重新拉，纯粹是给人一个「清掉重占」的出口 */
export function clearPixelCache(): Promise<boolean> {
  return openDb().then((handle) => new Promise<boolean>((resolve) => {
    if (!handle) return resolve(false);
    try {
      const tx = handle.transaction(PIX_STORE, "readwrite");
      tx.objectStore(PIX_STORE).clear();
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    } catch {
      resolve(false);
    }
  }));
}

/** 一份桌面引用到的全部像素 key：卡面、牌堆里的每一张、自定义卡背、桌垫、贴图垫子 */
export function imageKeysOf(state: { o: GameObject[] }): string[] {
  const keys = new Set<string>();
  const add = (value: unknown) => {
    if (typeof value === "string" && IMAGE_KEY.test(value)) keys.add(value);
  };
  for (const o of state.o) {
    add(o.card?.img);
    add(o.backImg);
    add(o.board?.img);
    add(o.zone?.img);
    if (Array.isArray(o.pile)) for (const c of o.pile) add(c.img);
  }
  return [...keys];
}

/**
 * 定档前补传：本地建的桌子从没联网上传过像素，直接存档会让图全丢。
 * 只把服务器确实没有的那几张发上去，重复上传按内容哈希幂等。
 */
export async function pushMissingImages(keys: string[]): Promise<number> {
  const target = transport;
  const want = keys.filter((k) => IMAGE_KEY.test(k) && !broken.has(k));
  if (!target || !want.length) return 0;
  const seen = await target.get(want);
  const absent = new Set(seen?.omitted ?? []);
  const missing = want.filter((k) => absent.has(k));
  if (!missing.length) return 0;
  const local = await loadPixels(missing);
  let sent = 0;
  for (const key of missing) {
    const data = typeof local[key] === "string" ? local[key] : "";
    if (!data) continue;
    try {
      await target.put(key, data);
      sent += 1;
    } catch {
      /* 传不上去就把这个存档当作没有这张图，别拖垮整个定档 */
    }
  }
  return sent;
}

/**
 * 超清档先把原图整个读一遍：服务端收得下就一字节不改地存下来。
 * 传上来的 png 还是那张 png——不缩放、不重编码，屏幕上看到的就是原件。
 */
async function rawOf(file: Blob, limit: number): Promise<string | null> {
  if (!file.type.startsWith("image/") || file.size > MAX_FILE_BYTES) return null;
  // base64 把一个字节摊成 4/3，再算上 dataURL 的头：先粗筛一遍，省掉几百兆的整读
  if (file.size * 1.4 + 64 > limit) return null;
  const data = await readAsDataUrl(file);
  return data && data.length <= limit && RAW_DATA.test(data) ? data : null;
}

/** 原图直存时宽高要另算一次：桌面按宽高摆垫子，不能靠画布报数 */
async function sizeOfData(data: string): Promise<{ w: number; h: number }> {
  const el = await loadImage(data);
  return { w: el?.naturalWidth ?? 0, h: el?.naturalHeight ?? 0 };
}

function readAsDataUrl(file: Blob): Promise<string | null> {
  return new Promise((resolve) => {
    const fr = new FileReader();
    fr.onload = () => resolve(typeof fr.result === "string" ? fr.result : null);
    fr.onerror = () => resolve(null);
    fr.readAsDataURL(file);
  });
}

/** 压成卡面像素，顺带报回原图宽高：牌要照着图的比例成形 */
async function cardPixels(file: Blob): Promise<{ data: string; w: number; h: number } | null> {
  if (hdImport) {
    const raw = await rawOf(file, MAX_HD_CHARS);
    if (raw) {
      const s = await sizeOfData(raw);
      if (s.w && s.h) return { data: raw, w: s.w, h: s.h };
    }
    const hd = await compress(file, HD_SIDE, HD_QUALITIES, MAX_HD_CHARS, "#f7f4ec");
    if (hd) return hd;
  }
  return compress(file, CARD_SIDE, QUALITIES, MAX_IMAGE_CHARS, "#f7f4ec");
}

/** 把任意图片压成适合当卡面的小图 dataURL；File 和 zip 里解出来的 Blob 都能进来 */
export async function fileToCardData(file: Blob): Promise<string | null> {
  return (await cardPixels(file))?.data ?? null;
}

/** 上传一张卡面，返回 key 和原图比例：比例决定这张牌在桌面上长成什么形状 */
export async function saveCardImage(file: Blob): Promise<{ key: string; ratio: number } | null> {
  const out = await cardPixels(file);
  if (!out || !out.w || !out.h) return null;
  return { key: await saveImage(out.data), ratio: out.w / out.h };
}

/** 大图桌垫：从高分辨率开始一路降，直到塞进额度，所以任何尺寸的图都铺得上来 */
export async function fileToMat(file: File): Promise<{ key: string; w: number; h: number } | null> {
  if (hdImport) {
    const raw = await rawOf(file, MAX_MAT_CHARS);
    if (raw) {
      const s = await sizeOfData(raw);
      if (s.w && s.h) return { key: await saveImage(raw), w: s.w, h: s.h };
    }
    const hd = await compress(file, HD_SIDE, HD_QUALITIES, MAX_MAT_CHARS, "#2b2b2e");
    if (hd) return { key: await saveImage(hd.data), w: hd.w, h: hd.h };
  }
  const out = await compress(file, MAT_SIDE, MAT_QUALITIES, MAX_MAT_CHARS, "#2b2b2e");
  if (!out) return null;
  return { key: await saveImage(out.data), w: out.w, h: out.h };
}

async function compress(file: Blob, side: { from: number; min: number }, qualities: number[], limit: number, background: string): Promise<{ data: string; w: number; h: number } | null> {
  if (!file.type.startsWith("image/") || file.size > MAX_FILE_BYTES) return null;
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    if (!img?.naturalWidth) return null;
    const ow = img.naturalWidth;
    const oh = img.naturalHeight;
    const usable = MIMES.filter((mime) => canvasOf(8, 8).toDataURL(mime).startsWith(`data:${mime};base64,`));
    for (let long = side.from; ; long = Math.max(side.min, Math.round(long * 0.76))) {
      const scale = Math.min(1, long / Math.max(ow, oh), CANVAS_MAX / ow, CANVAS_MAX / oh);
      const w = Math.max(1, Math.round(ow * scale));
      const h = Math.max(1, Math.round(oh * scale));
      const canvas = canvasOf(w, h);
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;
      // 重采样这一步按高质量走：默认的 low 缩完就是一层糊，字和线条边缘全软掉
      ctx.imageSmoothingQuality = "high";
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      for (const quality of qualities) {
        for (const mime of usable) {
          const out = canvas.toDataURL(mime, quality);
          if (out.startsWith(`data:${mime};base64,`) && out.length <= limit) return { data: out, w: ow, h: oh };
        }
      }
      if (long <= side.min) return null;
    }
  } finally {
    URL.revokeObjectURL(url);
  }
}

function canvasOf(w: number, h: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  return canvas;
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => resolve(null);
    el.src = src;
  });
}

export const imageTransport: ImageTransport = {
  async put(key, data) {
    await api.putImage(key, data);
  },
  async get(keys) {
    return api.getImages(keys);
  },
};
