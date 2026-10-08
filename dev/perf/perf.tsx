/* 牌桌 · 3D 桌游沙盒 —— SPDX-License-Identifier: GPL-3.0-only
   Copyright (C) 2026 2652635090 · 许可全文见仓库根目录的 LICENSE */

import { api } from "@/game/api";
import { PALETTE, sameCardsReordered } from "@/game/catalog";
import { makePile } from "@/game/factory";
import { fileToCardData, imageKeysOf, imageOf, imageTransport, pixelCacheStats, requestImages, saveCardImage, saveImage, setImageTransport } from "@/game/images";
import { cutAction, dealAction, evenSplitAction, shuffleAction } from "@/game/ops";
import { MAX_OBJECTS, MAX_PILE, apply, emptyState } from "@/game/state";
import type { CardSpec, GameObject, TableState } from "@/game/types";

const N = Number(new URLSearchParams(location.search).get("n") || 1000);
const SIDE = Number(new URLSearchParams(location.search).get("side") || 720);

const now = () => performance.now();
const mem = () => (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? 0;
const median = (xs: number[]) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] : 0);
const pct = (xs: number[], q: number) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(xs.length * q))] : 0);
const mb = (n: number) => Math.round((n / 1024 / 1024) * 100) / 100;

/** 一张「真实卡绘」：渐变底 + 噪声瓦片 + 编号，压不出小图，也不是一色的空图 */
function noiseTile(): HTMLCanvasElement {
  const t = document.createElement("canvas");
  t.width = t.height = 128;
  const g = t.getContext("2d")!;
  const d = g.createImageData(128, 128);
  for (let i = 0; i < d.data.length; i += 4) {
    const v = (i * 2654435761) % 255;
    d.data[i] = v;
    d.data[i + 1] = (v * 7) % 255;
    d.data[i + 2] = (v * 13) % 255;
    d.data[i + 3] = 255;
  }
  g.putImageData(d, 0, 0);
  return t;
}

const TILE = noiseTile();

/** 底板只画一次：噪声 + 渐变。每张卡在其上加一点差异，避免「同图去重」把 1000 张压成一张 */
let BASE: HTMLCanvasElement | null = null;
function base(): HTMLCanvasElement {
  if (BASE) return BASE;
  const c = document.createElement("canvas");
  c.width = SIDE;
  c.height = Math.round(SIDE * 1.4);
  const g = c.getContext("2d")!;
  const grad = g.createLinearGradient(0, 0, c.width, c.height);
  grad.addColorStop(0, "hsl(210 72% 46%)");
  grad.addColorStop(1, "hsl(30 62% 22%)");
  g.fillStyle = grad;
  g.fillRect(0, 0, c.width, c.height);
  g.globalAlpha = 0.55;
  for (let y = 0; y < c.height; y += 128) for (let x = 0; x < c.width; x += 128) g.drawImage(TILE, x, y);
  BASE = c;
  return c;
}

function sourceCard(i: number): Promise<Blob> {
  const c = document.createElement("canvas");
  c.width = SIDE;
  c.height = Math.round(SIDE * 1.4);
  const g = c.getContext("2d")!;
  g.drawImage(base(), 0, 0);
  g.globalAlpha = 0.35;
  g.fillStyle = `hsl(${(i * 37) % 360} 70% 55%)`;
  g.fillRect((i * 53) % (c.width - 200), (i * 91) % (c.height - 200), 200, 200);
  g.globalAlpha = 1;
  g.fillStyle = "#fff";
  g.font = `bold ${Math.round(SIDE / 5)}px sans-serif`;
  g.fillText(String(i), 40, c.height - 60);
  return new Promise((res) => c.toBlob((b) => res(b!), "image/jpeg", 0.9));
}

/** 直接读自己那份像素缓存的字节数：pixelCacheStats 只报条数 */
function cacheBytes(): Promise<{ count: number; bytes: number }> {
  return new Promise((res) => {
    const req = indexedDB.open("tabletop3d", 1);
    req.onsuccess = () => {
      const db = req.result;
      try {
        const store = db.transaction("images", "readonly").objectStore("images");
        const all = store.openCursor();
        let count = 0;
        let bytes = 0;
        all.onsuccess = () => {
          const cur = all.result;
          if (!cur) {
            res({ count, bytes });
            return;
          }
          count += 1;
          bytes += String(cur.value).length;
          cur.continue();
        };
        all.onerror = () => res({ count, bytes });
      } catch {
        res({ count: 0, bytes: 0 });
      }
    };
    req.onerror = () => res({ count: 0, bytes: 0 });
  });
}

const bench = (fn: () => unknown, runs: number) => {
  const xs: number[] = [];
  for (let i = 0; i < runs; i++) {
    const t = now();
    fn();
    xs.push(now() - t);
  }
  return { med: Math.round(median(xs) * 100) / 100, max: Math.round(Math.max(...xs) * 100) / 100 };
};

async function main() {
  const rep: Record<string, unknown> = { n: N, side: SIDE, cap: { MAX_PILE, MAX_OBJECTS } };
  const mark = (p: string, extra = "") => {
    const line = `${p} ${extra}`;
    (window as unknown as { __phase: string }).__phase = line;
    document.body.textContent = line;
    console.log(line);
  };
  setImageTransport(imageTransport);
  const idbBefore = (await pixelCacheStats()).count;

  /* ——— cold 模式：只测「新开一个页面进桌，本机只剩 240 张缓存」时要把 420 张图牌要回来花多久 ——— */
  if (new URLSearchParams(location.search).get("cold")) {
    const keys = JSON.parse(localStorage.getItem("perfkeys") || "[]") as string[];
    mark("C start", `${keys.length} keys`);
    const want = keys.slice(0, MAX_OBJECTS);
    const t0 = now();
    let rounds = 0;
    let last = -1;
    let stable = 0;
    requestImages(want, "table");
    while (rounds < 400) {
      await new Promise((r) => setTimeout(r, 100));
      rounds += 1;
      const got = want.filter((k) => !!imageOf(k)).length;
      if (got === last) stable += 1;
      else {
        stable = 0;
        last = got;
        if (rounds % 20 === 0) mark("C poll", `${got}/${want.length} r=${rounds}`);
      }
      // 连续 3 秒不再新增就认为拿齐（或已判死）
      if (stable > 30 || got >= want.length || now() - t0 > 180000) break;
    }
    const stats = await pixelCacheStats();
    rep.cold = {
      asked: want.length,
      decoded: last,
      ms: Math.round(now() - t0),
      pollTicks: rounds,
      idbEntriesAfter: stats.count,
      heapNote: "本机 IDB 上限 240，超出只能问服务器",
    };
    document.body.textContent = JSON.stringify(rep, null, 1);
    (window as unknown as { __perf: unknown }).__perf = rep;
    return;
  }

  /* ——— P1 导入这一 1000 张：客户端逐张压 + 逐张上传 ——— */
  mark("P1 start", `n=${N}`);
  const longTasks: number[] = [];
  try {
    new PerformanceObserver((l) => longTasks.push(...[...l.getEntries()].map((e) => e.duration))).observe({ entryTypes: ["longtask"] });
  } catch {
    /* 没有 longtask 支持就不报这一项 */
  }
  // fast=1：压缩这一步只测一次（真实管线，得到 ≤960px 的那一份），之后每张只改尾 4 个 base64 字符
  // → 得到 1000 个互不相同的 key、同样的字节数与同样的解码尺寸，把「压 1000 次」的时间从计数相关的成本里剥出来
  const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let seed: string | null = null;
  const fast = new URLSearchParams(location.search).get("fast");
  if (fast) seed = await fileToCardData(await sourceCard(0));
  if (fast && !seed) throw new Error("fast 模式压不出种子图");
  const specs: CardSpec[] = [];
  const keys: string[] = [];
  const saveMs: number[] = [];
  const genMs: number[] = [];
  const bytesIn: number[] = [];
  const heapAt: number[] = [];
  const tAll = now();
  for (let i = 0; i < N; i++) {
    let t = now();
    let up: { key: string; ratio: number } | null = null;
    if (seed) {
      // 尾 4 个 base64 字符按 i 换掉：字节数、解码尺寸都不变，只有 key 不同
      let tail = "";
      for (let s = i; tail.length < 4; s = Math.floor(s / 64)) tail += B64[s % 64];
      const data = seed.slice(0, -4) + tail;
      // 代理偶尔会在连续大请求上瞬时报错：重试一次，别让整个 1000 张的跑废掉
      let key = "";
      try {
        key = await saveImage(data);
      } catch {
        await new Promise((r) => setTimeout(r, 300));
        key = await saveImage(data);
      }
      up = { key, ratio: 1 / 1.4 };
      genMs.push(0);
      bytesIn.push(data.length);
    } else {
      const file = await sourceCard(i);
      genMs.push(now() - t);
      bytesIn.push(file.size);
      t = now();
      up = await saveCardImage(file);
    }
    saveMs.push(now() - t);
    if (!up) {
      if (i % 50 === 0) mark("P1 rejected", `${i} ${up}`);
      continue;
    }
    keys.push(up.key);
    specs.push({ back: "plain", img: up.key, ratio: up.ratio, label: `卡绘 ${i + 1}` });
    if (i % 100 === 99) heapAt.push(mem());
    if (i % 20 === 19 || i === N - 1) mark("P1", `${i + 1}/${N}`);
  }
  const importMs = now() - tAll;
  mark("P1 done", `${Math.round(importMs)}ms ok=${specs.length}`);
  try {
    localStorage.setItem("perfkeys", JSON.stringify(keys));
  } catch {
    /* 1000 个 key 存不下就算了 */
  }
  rep.import = {
    mode: seed ? "只走 saveImage（压缩一次，key 各不相同）" : "完整管线（每张都压）",
    ok: specs.length,
    rejected: N - specs.length,
    totalS: Math.round(importMs) / 1000,
    perCardMs: { med: Math.round(median(saveMs)), p95: Math.round(pct(saveMs, 0.95)), max: Math.round(Math.max(...saveMs)) },
    genPerCardMs: Math.round(median(genMs)),
    sourceKB: Math.round(bytesIn.reduce((a, b) => a + b, 0) / 1024),
    longestTaskMs: longTasks.length ? Math.round(Math.max(...longTasks)) : 0,
    longTaskCount: longTasks.filter((d) => d >= 50).length,
    heapStartMB: mb(heapAt[0] ?? 0),
    heapEndMB: mb(heapAt[heapAt.length - 1] ?? 0),
    heapCurveMB: heapAt.map(mb),
  };

  /* ——— P2 这 1000 张在本地留下了什么 ——— */
  mark("P2 storage");
  const cached = keys.filter((k) => !!imageOf(k)).length;
  const stats = await pixelCacheStats();
  mark("P2 stats", `entries=${stats.count}`);
  const cache = await cacheBytes();
  mark("P2 bytes", `${mb(cache.bytes)}MB`);
  // 内存里那 1000 张解码位图占多少：按 each w×h×4 算，浏览器不给我们 heap 数字
  let bitmap = 0;
  let maxSide = 0;
  for (const k of keys) {
    const im = imageOf(k);
    if (!im) continue;
    bitmap += im.naturalWidth * im.naturalHeight * 4;
    maxSide = Math.max(maxSide, im.naturalWidth, im.naturalHeight);
  }
  rep.perCardBitmapMB = mb(bitmap / Math.max(1, cached));
  rep.decodedMaxSide = maxSide;
  rep.decodedHeldMB = mb(bitmap);
  rep.storage = {
    idbBefore,
    decodedHeldInMemory: cached,
    idbEntries: stats.count,
    idbGrew: stats.count - idbBefore,
    idbBytesMB: mb(cache.bytes),
    avgCardDataKB: cache.count ? Math.round(cache.bytes / cache.count / 1024) : 0,
    cacheCap: 240,
  };

  /* ——— P3 桌面状态：一整叠 1000 张图牌 ——— */
  mark("P3 state");
  const pile = makePile(specs, PALETTE[1], { x: 0, z: 0 });
  const state: TableState = { ...emptyState("压测桌"), o: [pile] };
  const json = JSON.stringify(state);
  const tSan = now();
  api.sanitize(state);
  const sanitizeMs = now() - tSan;
  rep.state = {
    pileCards: pile.pile?.length ?? 0,
    jsonKB: Math.round(json.length / 1024),
    perCardBytes: Math.round(json.length / Math.max(1, specs.length)),
    sanitizeMs: Math.round(sanitizeMs * 100) / 100,
    keysOnTable: imageKeysOf(state).length,
  };

  /* ——— P4 归约与检测：每次同步都要跑的那些 ——— */
  mark("P4 logic");
  const objects = state.o;
  const before = (objects.find((o) => o.id === pile.id) as GameObject).pile ?? [];
  const half = Math.max(1, Math.floor(before.length / 2));
  const cutA = cutAction(objects, pile.id, half)!;
  const shufA = shuffleAction(objects, pile.id)!;
  const dealA = dealAction(objects, state, pile.id, 3)!;
  const evenA = evenSplitAction(objects, pile.id, 8)!;
  const s2 = apply(state, cutA, "甲");
  rep.logic = {
    applyCut: bench(() => apply(state, cutA, "甲"), 20),
    applyShuffle: bench(() => apply(state, shufA, "甲"), 20),
    applyDeal: bench(() => apply(state, dealA, "甲"), 20),
    applyEvenSplit: bench(() => apply(state, evenA, "甲"), 20),
    sameCardsReordered_cut: bench(() => sameCardsReordered(before, s2.o.find((x) => x.id === pile.id)?.pile ?? []), 20),
    sameCardsReordered_unchanged: bench(() => sameCardsReordered(before, before), 20),
    sanitize: bench(() => api.sanitize(state), 10),
  };

  /* ——— P5 走真网络：建房 / 提交一次改动 / 全量同步 ——— */
  mark("P5 create");
  const tCreate = now();
  const room = await api.create(state);
  const createMs = now() - tCreate;
  const next = apply(state, cutA, "甲");
  const tCommit = now();
  const c1 = await api.commit(room.code, room.version, cutA, next, "c1");
  const commitMs = now() - tCommit;
  const tSync = now();
  const s3 = await api.sync(room.code, 0);
  const syncMs = now() - tSync;
  mark("P5 done", `create=${Math.round(createMs)} commit=${Math.round(commitMs)} sync=${Math.round(syncMs)}`);
  rep.wire = {
    createMs: Math.round(createMs),
    commitWith1000PileMs: Math.round(commitMs),
    commitOk: c1.ok && !c1.conflict,
    serverKeptCards: c1.state.o[0]?.pile?.length ?? 0,
    fullSyncMs: Math.round(syncMs),
    fullSyncKB: Math.round(JSON.stringify(s3.state).length / 1024),
  };

  /* ——— P6 把 420 张图牌全要一遍：纯网络与体积（解码与本机缓存在 cold 那一轮里量） ——— */
  mark("P6 fetch");
  const loose: CardSpec[] = specs.slice(0, MAX_OBJECTS);
  const looseKeys = loose.map((c) => c.img!);
  const batchMs: number[] = [];
  const batchKB: number[] = [];
  let got = 0;
  let omitted = 0;
  const t2 = now();
  const BATCH_CAP = 10;
  for (let i = 0; i + 12 <= looseKeys.length && batchMs.length < BATCH_CAP; i += 12) {
    const t1 = now();
    const one = await api.getImages(looseKeys.slice(i, i + 12));
    batchMs.push(now() - t1);
    batchKB.push(JSON.stringify(one).length / 1024);
    got += Object.keys(one.images).length;
    omitted += one.omitted.length;
    if (i % 120 === 0) mark("P6", `${i / 12} 批 r=${Math.round(median(batchMs))}ms`);
  }
  const fetchRep: Record<string, unknown> = {
    looseCards: loose.length,
    batches: batchMs.length,
    batchesNeededForAll: Math.ceil(looseKeys.length / 12),
    msPerBatch: { med: Math.round(median(batchMs)), max: Math.round(Math.max(...batchMs)) },
    totalMs: Math.round(now() - t2),
    totalMB: mb(batchKB.reduce((a, b) => a + b, 0) * 1024),
    delivered: got,
    omitted,
  };
  rep.fetch = fetchRep;

  document.body.textContent = JSON.stringify(rep, null, 1);
  (window as unknown as { __perf: unknown }).__perf = rep;
}

await main().catch((e) => {
  const msg = `FAILED: ${(e as Error)?.message ?? String(e)}\n${(e as Error)?.stack ?? ""}`;
  document.body.textContent = msg;
  (window as unknown as { __perf: unknown }).__perf = { error: msg };
});
