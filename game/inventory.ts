/* 牌桌 · 3D 桌游沙盒 —— SPDX-License-Identifier: GPL-3.0-only
   Copyright (C) 2026 2652635090 · 许可全文见仓库根目录的 LICENSE */

import {
  cachedRomIds,
  cachedRoms,
  dropRomPayload,
  forgetRomList,
  forgetRomToken,
  forgetRoom,
  forgetRoomToken,
  storedTables,
  romTokenIds,
  roomTokenIds,
  wipeRoomCache,
} from "./cache";
import { HAND_PREFS_KEY, HAND_SCHEME_KEY } from "./handbar";
import { HAND_ZONE_MEMORY_KEY, forgottenHandZones, unforgetHandZone } from "./ops";
import { listPresets, removePreset, wipePresets } from "./preset";
import { VIEW_KEY } from "./view";

/**
 * 本机存储清单：把这台浏览器替用户记着的东西一条条数出来，让人看得懂、也删得掉。
 * 这里只负责「数」与「转交」——删除一律走各条目主人模块的函数：快照归 cache、
 * 预设归 preset、手牌区记忆归 ops，别在这一层另起一套写法。
 */

/** 所有本机存储都从它开头；数总量时按它筛键（cache.ts 里的键名不带前缀，这里带上） */
const PREFIX = "tabletop3d:";

export interface CacheRow {
  /** 稳定的行号：列表的 key 与「确认删除」那一格都认它 */
  id: string;
  label: string;
  /** 一行小字：几个物件、什么时候、是目录还是本体 */
  meta: string;
  /** 这一条占的字节（UTF-16 两个字节一个字符估）。几条共用一个存储键时给 0，体积记在组上 */
  bytes: number;
  /** 删掉以后会怎样——确认那一格把这句原话念给用户听 */
  warn: string;
  drop: () => void;
}

export interface CacheGroup {
  id: string;
  title: string;
  hint: string;
  rows: CacheRow[];
  bytes: number;
  /** 整组一起清；这一组没什么可清时给 null */
  wipe: { label: string; warn: string; run: () => void } | null;
}

function chars(full: string): number {
  try {
    const hit = localStorage.getItem(full);
    return hit ? hit.length : 0;
  } catch {
    return 0;
  }
}

/**
 * 一个完整存储键占的地方：键名加值，按 UTF-16 两个字节一个字符估。
 * cache.ts 那批函数交出来的键名不带前缀，这里统一补上，所以体积都从这一个口子算。
 */
function bytesOf(fullKey: string): number {
  return (fullKey.length + chars(fullKey)) * 2;
}

/** 带前缀地数某条本机记录的体积 */
function size(key: string): number {
  return bytesOf(PREFIX + key);
}

function ago(at: number): string {
  const s = Math.max(0, Math.round((Date.now() - at) / 1000));
  if (!at) return "时间未知";
  if (s < 60) return "刚刚";
  if (s < 3600) return `${Math.round(s / 60)}分钟前`;
  if (s < 86400) return `${Math.round(s / 3600)}小时前`;
  return `${Math.round(s / 86400)}天前`;
}

function group(id: string, title: string, hint: string, rows: CacheRow[], wipe: CacheGroup["wipe"], extra = 0): CacheGroup {
  return { id, title, hint, rows, bytes: rows.reduce((n, r) => n + r.bytes, 0) + extra, wipe };
}

function removeFull(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* 隐私模式里本来就没写下东西 */
  }
}

/** 桌况快照：联网房留下的和离线自己摆的都算，删一条就少一条离线能开的桌 */
function tableRows(): CacheRow[] {
  return storedTables().map((t) => ({
    id: `table:${t.key}`,
    label: t.name,
    meta: `${t.objects} 个物件 · v${t.version} · ${t.online ? "联网房" : "离线桌"} · ${ago(t.at)}${t.hasState ? "" : " · 体积超限，只留下了名字"}`,
    bytes: size(t.key),
    warn: t.online
      ? `丢的是 ${t.room ? `${t.room} 这间房` : "这张联网桌"}的离线快照：连上网再进一次就重新拉一份，服务器上的桌面不动。`
      : `「${t.name}」是离线自己摆的桌子，只存在这台浏览器里，服务器上没有第二份——删掉就摆不回来了。`,
    drop: () => forgetRoom(t.key),
  }));
}

/** 存档：目录单独一行，离线本体按存档号补上标题 */
function romRows(): CacheRow[] {
  const list = cachedRoms();
  const titles = new Map((list?.list ?? []).map((r) => [r.id.toUpperCase(), r]));
  const rows: CacheRow[] = [];
  if (list) {
    rows.push({
      id: "rom-list",
      label: "存档目录",
      meta: `${list.list.length} 条 · ${ago(list.at)}`,
      bytes: size("roms"),
      warn: "只删本机这份目录：服务器上的存档一条都不会少，下次打开存档抽屉会重新拉回来。",
      drop: () => forgetRomList(),
    });
  }
  for (const id of cachedRomIds()) {
    const meta = titles.get(id);
    rows.push({
      id: `rom:${id}`,
      label: meta?.title || "存档本体",
      meta: `${id} · 断线也能开${meta ? ` · ${meta.objects} 个物件` : ""}`,
      bytes: size(`rom:${id}`),
      warn: "删掉的是这份存档在本机的桌面副本：存档本身还在服务器上，联网后重新打开就会再存一份。",
      drop: () => dropRomPayload(id),
    });
  }
  return rows;
}

/** 口令：删掉就再也覆盖不了对应的存档、也管不了对应的房 */
function tokenRows(): CacheRow[] {
  const rows: CacheRow[] = romTokenIds().map((id) => ({
    id: `rom-key:${id}`,
    label: `存档口令 ${id}`,
    meta: "只在这台浏览器上",
    bytes: 0,
    warn: "忘掉这把口令，这台机器就再也改不动、覆盖不了那份存档；想改得回服务器重新定档。",
    drop: () => forgetRomToken(id),
  }));
  for (const code of roomTokenIds()) {
    rows.push({
      id: `room-key:${code}`,
      label: `房主口令 ${code}`,
      meta: "只在这台浏览器上",
      bytes: 0,
      warn: `忘掉这把口令，这台机器就管不了 ${code} 的权限与公开设置；房间照旧给别人开着，只是不再是「你当家」。`,
      drop: () => forgetRoomToken(code),
    });
  }
  return rows;
}

/** 桌面预设：整桌的摆法留在本机，删了就摆不回来 */
function presetRows(): CacheRow[] {
  return listPresets().map((p) => ({
    id: `preset:${p.id}`,
    label: p.name,
    meta: `${p.objects} 个物件 · ${p.images ? `${p.images} 张自传资源` : "无自传资源"} · ${ago(p.at)}`,
    bytes: size(`preset:${p.id}`),
    warn: `「${p.name}」只存在这台浏览器里，删掉就再也摆不回这张桌子。`,
    drop: () => removePreset(p.id),
  }));
}

/** 删过的自动手牌区：按房间码记着「别再补这一块」，忘掉记录就会重新补 */
function handZoneRows(): CacheRow[] {
  return forgottenHandZones().map((code) => ({
    id: `handzone:${code}`,
    label: code,
    meta: "不再自动生成本人手牌区",
    bytes: 0,
    warn: `忘掉这条记录：下次进 ${code} 会重新自动补一块手牌区。`,
    drop: () => unforgetHandZone(code),
  }));
}

function prefRows(): CacheRow[] {
  return [
    { key: VIEW_KEY, label: "画面与手势", detail: "灯光亮度、画质、底部提示条、转视角与双指转、工具条折叠、只锁这台的游戏中" },
    { key: HAND_SCHEME_KEY, label: "手牌条方案", detail: "叠放、换行缩小这些排版选择" },
    { key: HAND_PREFS_KEY, label: "手牌条偏好", detail: "大小与堆叠百分比" },
  ]
    .filter((r) => chars(r.key))
    .map((r) => ({
      id: `pref:${r.key}`,
      label: r.label,
      meta: `${r.detail} · 界面上改一次就重新记下`,
      bytes: bytesOf(r.key),
      warn: "现在这一屏的设置不变，下次打开这台浏览器才回到默认。",
      drop: () => removeFull(r.key),
    }));
}

/**
 * 这台机器的身份：昵称与指纹盐。删掉抹不掉服务器上的任何记录，
 * 只是这台浏览器下次进来会被认成新来的。
 */
function identityRows(): CacheRow[] {
  const rows: CacheRow[] = [];
  if (chars(PREFIX + "name")) {
    rows.push({
      id: "id:name",
      label: "昵称",
      meta: "在线列表与记录里挂着的那个名字",
      bytes: bytesOf(PREFIX + "name"),
      warn: "删掉以后下次进来按指纹重新起一个名字；这次会话里还是现在这个名字。",
      drop: () => removeFull(PREFIX + "name"),
    });
  }
  if (chars(PREFIX + "fp:salt")) {
    rows.push({
      id: "id:fp",
      label: "指纹盐",
      meta: "大厅里认得你的那串短号就是从它算出来的",
      bytes: bytesOf(PREFIX + "fp:salt"),
      warn: "删掉以后下次进来就是一张全新的脸：原来那把椅子上的区域锁与手牌归属都认不回来了。",
      drop: () => removeFull(PREFIX + "fp:salt"),
    });
  }
  return rows;
}

/** 本机存储的总量：连没在这儿建模的键（序列号、预设目录这些）一起算 */
export function localBytes(): number {
  let n = 0;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const full = localStorage.key(i);
      if (!full || !full.startsWith(PREFIX)) continue;
      n += full.length + chars(full);
    }
  } catch {
    return 0;
  }
  return n * 2;
}

export function formatBytes(n: number): string {
  return n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : n >= 1024 ? `${Math.round(n / 1024)} KB` : `${n} B`;
}

/** 这台浏览器记着的一切，按人看得懂的分法排好；空组不进清单 */
export function inventory(): CacheGroup[] {
  const tables = tableRows();
  const roms = romRows();
  const tokens = tokenRows();
  const presets = presetRows();
  const handzones = handZoneRows();
  const prefs = prefRows();
  const identity = identityRows();

  return [
    group("tables", "桌况快照", "断线、刷新、服务器重启之后还能看见桌子，靠的就是这一份份本机快照。清掉不影响别人，重新进房就能再拉一份。", tables, tables.length
      ? { label: "全部清掉", warn: `${tables.length} 份快照一起丢掉：离线摆到一半的那几张桌子也一起没，存档目录与本体一并清（口令留着）。`, run: () => wipeRoomCache() }
      : null),
    group("roms", "存档缓存", "存档正文存在服务器上，这里只是断线时还能打开的那一份副本。", roms, roms.length
      ? { label: "清掉存档缓存", warn: `${roms.length} 条都会丢掉：断线时开不了这些档，联网后重新打开就是了。`, run: () => { forgetRomList(); for (const id of cachedRomIds()) dropRomPayload(id); } }
      : null),
    group("presets", "桌面预设", "预设记下整张桌子的摆法，只存在这台浏览器里。", presets, presets.length
      ? { label: "全部清掉", warn: `${presets.length} 份预设一起删：服务器上没有第二份，删了就真没了。`, run: () => wipePresets() }
      : null),
    group("tokens", "口令", "存档定档口令与房主口令都只留在这台浏览器上，服务器那边只有它们的摘要。", tokens, tokens.length
      ? { label: "全忘掉", warn: `${tokens.length} 把口令一起忘掉：这台机器此后改不动对应的存档，也管不了对应的房。`, run: () => { for (const r of tokens) r.drop(); } }
      : null, tokens.length ? size("rom-keys") + size("room-keys") : 0),
    group("handzones", "删过的自动手牌区", "联机房里亲手删掉的本人手牌区按房间码记在这儿，免得重进同一间房又冒出来。", handzones, handzones.length
      ? { label: "全部忘掉", warn: `${handzones.length} 间房下次进来都会重新自动补一块手牌区。`, run: () => { for (const r of handzones) r.drop(); } }
      : null, handzones.length ? bytesOf(HAND_ZONE_MEMORY_KEY) : 0),
    group("prefs", "本机偏好", "灯光画质、手牌条排版这些跟着这台浏览器走的设置。", prefs, prefs.length
      ? { label: "恢复默认", warn: "现在这一屏的设置不变，下次打开这台浏览器才回到默认。", run: () => { for (const r of prefs) r.drop(); } }
      : null),
    group("identity", "这台机器的身份", "昵称与指纹盐：删掉只影响这台浏览器下次进来时被认成谁。", identity, identity.length
      ? { label: "忘掉身份", warn: "下次进来就是一张全新的脸：原来那把椅子上的区域锁与手牌归属都认不回来了。", run: () => { for (const r of identity) r.drop(); } }
      : null),
  ].filter((g) => g.rows.length || g.bytes);
}

