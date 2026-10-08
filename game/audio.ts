import { ApiError, api } from "./api";
import { AUDIO_KEY, AUDIO_MAX_BYTES, GRAM_DUR_MAX, gramPos } from "./catalog";
import type { GameObject, GramSpec } from "./types";

/**
 * 唱片：桌面状态里只留内容哈希 key，字节走服务器那条二进制的门，本机再存一份 IndexedDB。
 * 播放位置也不进状态——各端照着起播时刻自己往前推，谁都不为一秒一秒的进度往桌上写一笔。
 */

/** 一首歌的字节闸门：超过服务端单曲上限的先挡下来，别让人白花一次上传 */
export const CLIP_MAX_BYTES = AUDIO_MAX_BYTES;

/* ———— 内容哈希：同一首歌在不同人电脑上重复上传也只存一份 ———— */

export function audioKeyOf(bytes: Uint8Array): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i++) {
    h ^= bytes[i];
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `a${bytes.length.toString(36)}${h.toString(36)}`.toLowerCase().slice(0, 24).padEnd(6, "0");
}

/* ———— 本机这一份：内存里挂着 blob URL，IndexedDB 里躺着原始字节 ———— */

const DB_NAME = "tabletop3d-audio";
const CLIP_STORE = "clips";
/** 本机唱片条数上限：一首几十兆，攒多了就要撞浏览器配额了 */
const CLIP_MAX = 24;

interface Clip {
  key: string;
  url: string;
  /** 秒；本机量出来的，跟桌上记的那个可能差几毫秒，只用来决定进度条拖到底的位置 */
  dur: number;
}

const clips = new Map<string, Clip>();
/** 正在路上的、以及被判了死的：两条都别让下一帧又去敲一遍门 */
const loading = new Set<string>();
const broken = new Set<string>();
const listeners = new Set<() => void>();

function emit(): void {
  for (const fn of [...listeners]) fn();
}

export function subscribeAudio(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function clipReady(key: string | null | undefined): boolean {
  return !!key && clips.has(key);
}

/** 取不到就是取不到：这条路的死活要说得出口，不能一直转圈 */
export function clipMissing(key: string | null | undefined): boolean {
  return !!key && broken.has(key);
}

export function clipOf(key: string | null | undefined): Clip | undefined {
  return key ? clips.get(key) : undefined;
}

/** 再试一次：把判死的连同在途的一起清掉，重新走本机缓存和服务器 */
export function retryClip(key: string): void {
  if (!AUDIO_KEY.test(key)) return;
  broken.delete(key);
  loading.delete(key);
  clips.delete(key);
  emit();
  void loadClip(key);
}

let opening: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (opening === null) {
    opening = new Promise((resolve) => {
      try {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => {
          if (!req.result.objectStoreNames.contains(CLIP_STORE)) req.result.createObjectStore(CLIP_STORE);
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
      } catch {
        // 隐私模式或不给开 IndexedDB：本机缓存整条不存在，每次都重新下载
        resolve(null);
      }
    });
  }
  return opening;
}

interface Cached {
  blob: Blob;
  at: number;
}

function readCached(key: string): Promise<Cached | null> {
  return openDb().then((handle) => new Promise<Cached | null>((resolve) => {
    if (!handle) return resolve(null);
    try {
      const req = handle.transaction(CLIP_STORE, "readonly").objectStore(CLIP_STORE).get(key);
      req.onsuccess = () => {
        const hit = req.result as Cached | undefined;
        resolve(hit && hit.blob instanceof Blob ? { blob: hit.blob, at: Number(hit.at) || 0 } : null);
      };
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  }));
}

/** 存进本机：超额就按最久没碰的那首丢，缓存丢了无非是再下一遍 */
function writeCached(key: string, blob: Blob): void {
  void openDb().then((handle) => {
    if (!handle) return;
    try {
      const tx = handle.transaction(CLIP_STORE, "readwrite");
      const store = tx.objectStore(CLIP_STORE);
      store.put({ blob, at: Date.now() } satisfies Cached, key);
      const count = store.count();
      count.onsuccess = () => {
        let over = Number(count.result) - CLIP_MAX;
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

/** 量时长：开个头拿到 duration 就收，量不出来就别放上去——那格式这台浏览器本来也放不动 */
function measure(url: string): Promise<number> {
  return new Promise((resolve) => {
    const el = new Audio();
    let done = false;
    const finish = (value: number) => {
      if (done) return;
      done = true;
      el.onloadedmetadata = null;
      el.onerror = null;
      resolve(value);
    };
    el.preload = "metadata";
    el.onloadedmetadata = () => finish(Number.isFinite(el.duration) ? el.duration : 0);
    el.onerror = () => finish(0);
    el.src = url;
    // 有些浏览器要推一下 currentTime 才肯去摸头；只是元数据，不会出声
    try { el.currentTime = 0.001; } catch { /* 不给摸就算了 */ }
    window.setTimeout(() => finish(0), 10000);
  });
}

async function hold(key: string, blob: Blob): Promise<Clip | null> {
  const url = URL.createObjectURL(blob);
  const dur = await measure(url);
  if (!dur) {
    URL.revokeObjectURL(url);
    return null;
  }
  const clip = { key, url, dur };
  clips.set(key, clip);
  broken.delete(key);
  emit();
  return clip;
}

/** 取一张唱片：先查本机缓存，再去服务器；拿不到就记一笔「取不到」。
 * local 为真时只敲本机那扇门——随身听上那些歌从来没上过服务器，去问也是白问。 */
export function loadClip(key: string, local = false): Promise<void> {
  if (!AUDIO_KEY.test(key) || clips.has(key) || loading.has(key) || broken.has(key)) return Promise.resolve();
  loading.add(key);
  const fromLocal = (): Promise<Blob | null> => readCached(key).then((hit) => (hit ? hit.blob : null));
  const fetch = local
    ? fromLocal().then((blob) => (blob ? hold(key, blob) : null))
    : readCached(key).then((hit) => (hit ? hold(key, hit.blob) : api.getAudio(key).then((blob) => {
      if (!blob) return null;
      writeCached(key, blob);
      return hold(key, blob);
    })));
  return fetch
    .then((clip) => {
      // 字节到手却量不出时长：这浏览器的解码器不认这张片，跟没有是一个下场
      if (!clip) broken.add(key);
    })
    .catch((error) => {
      if (!(error instanceof ApiError)) console.warn("唱片下载失败");
      broken.add(key);
    })
    .finally(() => {
      loading.delete(key);
      emit();
    });
}

/** 本机自己弄到手的一首歌（自己挑的文件、同学递来的字节）：存进本机缓存，一个字节都不上服务器 */
export function adoptClip(key: string, blob: Blob): Promise<Clip | null> {
  if (!AUDIO_KEY.test(key)) return Promise.resolve(null);
  broken.delete(key);
  writeCached(key, blob);
  if (clips.has(key)) return Promise.resolve(clips.get(key) ?? null);
  return hold(key, blob);
}

/** 本机存着的这首歌的字节：同学来求歌时从这里一段一段往外递 */
export function localClip(key: string): Promise<Blob | null> {
  if (!AUDIO_KEY.test(key)) return Promise.resolve(null);
  return readCached(key).then((hit) => (hit ? hit.blob : null));
}

/** 让桌上这几台唱片机把各自的唱片先备着（随身听那一类走同学互传，不在这里） */
export function requestClips(objects: GameObject[]): void {
  const keys = new Set<string>();
  for (const o of objects) {
    const clip = o.kind === "gram" ? o.gram?.clip : null;
    if (clip && !clips.has(clip) && !loading.has(clip) && !broken.has(clip)) keys.add(clip);
  }
  for (const key of keys) void loadClip(key);
}

/** 本机存着这首歌的字节吗（随身听那一类不上服务器，只能在自己这台上找） */
export function hasLocalClip(key: string | null | undefined): boolean {
  return !!key && clips.has(key);
}

/** 把本机缓存里那一首歌捞进内存：捞到了返回 true，服务器那一步都不走 */
export function ensureLocalClip(key: string): Promise<boolean> {
  if (!AUDIO_KEY.test(key)) return Promise.resolve(false);
  if (clips.has(key)) return Promise.resolve(true);
  return loadClip(key, true).then(() => clips.has(key));
}


export interface ClipUpload {
  key: string;
  name: string;
  dur: number;
}

/** 曲名：文件名去掉后缀，截到机身刻得下的长度 */
function clipName(file: File): string {
  return file.name.replace(/\.[A-Za-z0-9]{1,5}$/, "").trim().slice(0, 24);
}

/**
 * 传一张唱片：原始字节一个字段都不改地送上去，所以什么格式都照原样存。
 * 量不出时长（这浏览器放不动）或服务器没这条路时抛 ApiError，让 UI 把那句话原样说给人听。
 */
export async function saveClip(file: File): Promise<ClipUpload> {
  if (file.size > CLIP_MAX_BYTES) throw new ApiError("这首曲子太大，先剪短到 24MB 以内再往唱片上刻。", "audio_too_large");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const key = audioKeyOf(bytes);
  const name = clipName(file);
  const known = clips.get(key) ?? (await hold(key, new Blob([bytes], { type: file.type })));
  if (!known) throw new ApiError("这台浏览器放不动这种格式，换个 mp3 或 ogg 试试。", "audio_unsupported");
  if (known.dur > GRAM_DUR_MAX) throw new ApiError("超过一小时的录音不叫唱片，先剪短一些。", "audio_too_large");
  writeCached(key, new Blob([bytes], { type: file.type }));
  await api.putAudio(key, new Blob([bytes], { type: file.type }));
  return { key, name, dur: known.dur };
}

/* ———— 播放：一台唱片机一个元素，进度各端自己推 ———— */

const tracks = new Map<string, HTMLAudioElement>();
/** 浏览器要人先碰一下才肯出声：被挡过一次就挂着这一位，等 UI 给个「放行」的入口 */
let blocked = false;
let muted = false;
let bound: GameObject[] = [];
/** 随身听折算成唱片机形状的那扇门，由 UI 在每次同步时递进来 */
let boundView: MachineView | null = null;
let tick = 0;
let lastEmit = 0;
/** 差过这么多秒才重新对齐：拖动进度与网络抖一下都不该把曲子掐断 */
const DRIFT = 0.6;

function trackOf(id: string, clip: Clip): HTMLAudioElement {
  let el = tracks.get(id);
  if (el && el.dataset.clip === clip.key) return el;
  if (el) {
    el.pause();
    el.removeAttribute("src");
  } else {
    el = new Audio();
    tracks.set(id, el);
  }
  el.dataset.clip = clip.key;
  el.preload = "auto";
  el.src = clip.url;
  return el;
}

export function audioBlocked(): boolean {
  return blocked;
}

/** 本机静音：只关这台机器的嗓子，桌上那个音量钮是所有人共享的 */
export function audioMuted(): boolean {
  return muted;
}

/** 跟机器的偏好跟着这台浏览器走，跟桌况无关：换一张桌子它照样不出声 */
const MUTE_KEY = "tabletop3d:gram-mute";
try {
  muted = localStorage.getItem(MUTE_KEY) === "1";
} catch {
  /* 隐私模式：这次会话里记着就够了 */
}

export function setAudioMuted(on: boolean): void {
  if (muted === on) return;
  muted = on;
  try {
    if (on) localStorage.setItem(MUTE_KEY, "1");
    else localStorage.removeItem(MUTE_KEY);
  } catch {
    /* 写不进去也只是下次进来又开着声 */
  }
  syncGrams(bound);
  emit();
}

/** 真的出声那一下要在人的手势里做，所以 UI 那个「放行声音」的按钮直接调它 */
export function unlockAudio(): void {
  blocked = false;
  syncGrams(bound);
  emit();
}

/** 本机自己那一档走带拧了一下：不用等桌面推，立刻按新参数对一遍元素 */
export function resyncAudio(now = Date.now()): boolean {
  return syncGrams(bound, null, now);
}

/**
 * 一台桌上机器此刻该怎么走带。唱片机用的就是自己那份状态；随身听由 mp3.ts 折算成同一个形状
 * 喂进来（共享出去抄桌面，没共享就抄本机那一档），这样引擎里就不必认识「随身听」这回事。
 */
export type MachineView = (o: GameObject) => GramSpec | null;

const gramView: MachineView = (o) => (o.kind === "gram" ? o.gram ?? null : null);

/**
 * 把每台桌上机器的状态对到元素上：该放的放、该停的停、飘过 0.6 秒的拽回来。
 * 返回是否有机器在放，外面据此决定这一轮要不要接着自己走。
 */
export function syncGrams(objects: GameObject[], view: MachineView | null = null, now = Date.now()): boolean {
  bound = objects;
  if (view) boundView = view;
  const v = boundView ?? gramView;
  const machines: { id: string; local: boolean; g: GramSpec & { clip: string } }[] = [];
  for (const o of objects) {
    const g = o.kind === "gram" ? o.gram ?? null : v(o);
    if (g?.clip) machines.push({ id: o.id, local: o.kind === "mp3", g: g as GramSpec & { clip: string } });
  }
  const alive = new Set(machines.map((m) => m.id));
  for (const [id, el] of [...tracks]) {
    if (alive.has(id)) continue;
    el.pause();
    el.removeAttribute("src");
    tracks.delete(id);
  }
  let playing = false;
  for (const m of machines) {
    const gm = m.g;
    const clip = clips.get(gm.clip);
    if (!clip) {
      // 随身听那类字节只在同学之间递，去服务器问也不会有：这一条只敲本机那扇门
      void loadClip(gm.clip, m.local);
      continue;
    }
    const el = trackOf(m.id, clip);
    el.volume = muted ? 0 : Math.max(0, Math.min(1, gm.vol));
    const pos = Math.min(gramPos(gm, now), clip.dur);
    playing = playing || gm.playing;
    if (gm.playing) {
      if (Math.abs(el.currentTime - pos) > DRIFT || el.ended) el.currentTime = pos;
      if (el.paused) {
        el.play().catch(() => {
          // 自动播放被拦：不重试也不报错，等那一下人的手势
          blocked = true;
          emit();
        });
      }
    } else if (!el.paused) {
      el.pause();
      el.currentTime = pos;
    }
  }
  schedule(playing);
  // 进度条要跟着走，但每秒刷 60 次 React 是纯浪费：250 毫秒一次够了
  if (playing && now - lastEmit > 250) {
    lastEmit = now;
    emit();
  }
  return playing;
}

/** 没人在放就把手动的这一轮停下来：一台安静的桌子不该养着一个每秒醒来的定时器 */
function schedule(need: boolean): void {
  if (!need) {
    if (tick) {
      window.clearInterval(tick);
      tick = 0;
    }
    return;
  }
  if (!tick) tick = window.setInterval(() => syncGrams(bound), 200);
}

/** 离开房间：把所有机器按停，元素连同已下载的字节一起丢掉 */
export function stopAudio(): void {
  bound = [];
  schedule(false);
  for (const el of tracks.values()) {
    el.pause();
    el.removeAttribute("src");
  }
  tracks.clear();
  for (const clip of clips.values()) URL.revokeObjectURL(clip.url);
  clips.clear();
  loading.clear();
  broken.clear();
  emit();
}

/* ———— 本机缓存查看：跟卡面那一份同一套，只报条数不搬字节 ———— */

export interface ClipCacheStats {
  count: number;
  ok: boolean;
}

export function clipCacheStats(): Promise<ClipCacheStats> {
  return openDb().then((handle) => new Promise<ClipCacheStats>((resolve) => {
    if (!handle) return resolve({ count: 0, ok: false });
    try {
      const req = handle.transaction(CLIP_STORE, "readonly").objectStore(CLIP_STORE).count();
      req.onsuccess = () => resolve({ count: Number(req.result) || 0, ok: true });
      req.onerror = () => resolve({ count: 0, ok: false });
    } catch {
      resolve({ count: 0, ok: false });
    }
  }));
}

/** 清空本机唱片：服务器上的一份不动，下次点开还会重新下载 */
export function clearClipCache(): Promise<boolean> {
  return openDb().then((handle) => new Promise<boolean>((resolve) => {
    if (!handle) return resolve(false);
    try {
      const tx = handle.transaction(CLIP_STORE, "readwrite");
      tx.objectStore(CLIP_STORE).clear();
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    } catch {
      resolve(false);
    }
  }));
}

/** 一份桌面引用到的全部唱片 key */
export function clipKeysOf(state: { o: GameObject[] }): string[] {
  const keys = new Set<string>();
  for (const o of state.o) {
    const clip = o.kind === "gram" ? o.gram?.clip : null;
    if (clip && AUDIO_KEY.test(clip)) keys.add(clip);
  }
  return [...keys];
}
