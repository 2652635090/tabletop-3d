import { api, type RomMeta, type RomPayload } from "./api";
import { trimState } from "./state";
import type { TableState } from "./types";

/**
 * 房间数据的浏览器缓存：localStorage 放「本机摆过的桌子长什么样、服务器上有哪些存档、定档口令」，
 * 卡面像素放 IndexedDB（见 images.ts）。
 * 这里的一切都只是兜底和加速——回到线上，仍以服务端那份桌面为准。
 */
const PREFIX = "tabletop3d:";
/** 桌况快照最多记这么几条，超了就从最久没动的那条开始丢 */
const TABLE_MAX = 10;
/** 单份桌面的体积闸门：真塞不下就宁可只留目录，也别把配额挤爆 */
const ROOM_MAX_CHARS = 700000;
/** 写盘按这个间隔合并：桌面随时在变，别每帧都去 stringify 一遍 */
const WRITE_MS = 1500;

/** 一条本机桌况：可能是上次联网房间的快照，也可能是离线自己摆的桌子 */
export interface LocalTable {
  /** 存储键，删除与重新读出都靠它 */
  key: string;
  name: string;
  /** 关联的房间码；纯本地桌是 null */
  room: string | null;
  version: number;
  at: number;
  objects: number;
  /** 这份快照带没带桌面本体（体积超限或老数据时只剩个名字） */
  hasState: boolean;
  /** 存进来时是不是联网房间 */
  online: boolean;
}

interface StoredTable {
  state: TableState | null;
  name: string;
  room: string | null;
  version: number;
  at: number;
  objects: number;
  online: boolean;
}

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function remove(key: string): void {
  try {
    localStorage.removeItem(PREFIX + key);
  } catch {
    /* 隐私模式下本来也写不进去 */
  }
}

function roomKey(code: string): string {
  return `room:${code.toUpperCase()}`;
}

/** 本地快照按房间码存会串味（它压根没有房间码），所以另起一段键空间 */
let localSeq = 0;
function localKey(): string {
  if (!localSeq) localSeq = (read<number>("local-seq") ?? Date.now() % 1e6) + 1;
  localSeq += 1;
  void write("local-seq", localSeq);
  return `local:${localSeq.toString(36)}`;
}

function eachTable(visit: (key: string, hit: StoredTable) => void): void {
  for (let i = 0; i < localStorage.length; i++) {
    const full = localStorage.key(i);
    if (!full || !full.startsWith(PREFIX)) continue;
    const key = full.slice(PREFIX.length);
    if (!key.startsWith("room:") && !key.startsWith("local:")) continue;
    const hit = read<StoredTable>(key);
    if (hit && typeof hit.name === "string") visit(key, hit);
  }
}

function brief(key: string, hit: StoredTable): LocalTable {
  return {
    key,
    name: hit.name || "牌桌",
    room: typeof hit.room === "string" ? hit.room : null,
    version: Number(hit.version) || 0,
    at: Number(hit.at) || 0,
    objects: Number(hit.objects) || hit.state?.o.length || 0,
    hasState: !!hit.state,
    online: hit.online === true,
  };
}

/**
 * 塞不下就腾地方：先丢最久没动的桌况（连本体一起），再把存档缓存本体扔掉。
 * 丢掉的随时能从服务器重新拉回来，所以宁缺毋滥。
 */
function prune(keep: string): void {
  const tables: LocalTable[] = [];
  eachTable((key, hit) => { if (key !== keep) tables.push(brief(key, hit)); });
  tables.sort((a, b) => a.at - b.at);
  for (const item of tables.slice(0, Math.max(1, Math.floor(tables.length / 2)))) remove(item.key);
  const roms = read<{ at: number; list: RomMeta[] }>("roms");
  for (const meta of (roms?.list ?? []).slice(0, 10)) remove(`rom:${meta.id}`);
}

function store(key: string, entry: StoredTable): void {
  const oversized = !!entry.state && JSON.stringify(entry.state).length > ROOM_MAX_CHARS;
  const slim: StoredTable = oversized ? { ...entry, state: null } : entry;
  if (write(key, slim)) return;
  prune(key);
  if (write(key, slim)) return;
  // 连目录都写不下：只剩个名字也比整条丢掉强
  write(key, { ...slim, state: null });
}

let pending = new Map<string, StoredTable>();
let timer = 0;

function commit(): void {
  if (timer) {
    window.clearTimeout(timer);
    timer = 0;
  }
  const batch = [...pending.entries()];
  pending = new Map();
  for (const [key, entry] of batch) store(key, entry);
}

function schedule(key: string, entry: StoredTable): void {
  pending.set(key, entry);
  if (timer) return;
  timer = window.setTimeout(commit, WRITE_MS);
}

function snapshot(state: TableState, version: number, room: string | null): StoredTable {
  const clean = trimState(state);
  return { state: clean, name: clean.name || "牌桌", room, version, at: Date.now(), objects: clean.o.length, online: !!room };
}

/** 联网桌况随手存一份：断网、刷新、服务器重启都不该让人看到空桌 */
export function cacheRoom(code: string, state: TableState, version: number): void {
  schedule(roomKey(code), snapshot(state, version, code.toUpperCase()));
}

/** 离线自己摆的桌子：按名字认，同名就是同一张桌，改桌面只覆盖不新增 */
let localName = "";
let localSlot = "";
export function cacheLocalTable(state: TableState, version: number): void {
  if (!state.o.length) return;
  const name = state.name?.trim() || "牌桌";
  if (localName !== name || !localSlot) {
    let found: string | null = null;
    eachTable((key, hit) => {
      if (!found && !hit.online && (hit.name || "牌桌") === name) found = key;
    });
    localName = name;
    localSlot = found ?? localKey();
  }
  schedule(localSlot, snapshot(state, version, null));
}

export function flushRoomCache(): void {
  commit();
}

/** 本机记着的所有桌子，按最近使用排序 */
export function localTables(): LocalTable[] {
  return storedTables().slice(0, TABLE_MAX);
}

/**
 * 存储里真实存在的桌况，一条不截：查看器要说「这台机器记了几条」，
 * 截到前十条就会把超出 TABLE_MAX 的那些报成没有。
 */
export function storedTables(): LocalTable[] {
  flushRoomCache();
  const out: LocalTable[] = [];
  eachTable((key, hit) => out.push(brief(key, hit)));
  return out.sort((a, b) => b.at - a.at);
}

/** 把某一条桌况的桌面本体读回来（顺带过一遍和服务端同一套收口） */
export function takeLocalTable(key: string): TableState | null {
  flushRoomCache();
  const hit = read<StoredTable>(key);
  return hit?.state ? api.sanitize(hit.state) : null;
}

export function cachedRoom(code: string): TableState | null {
  return takeLocalTable(roomKey(code));
}

export function forgetRoom(key: string): void {
  pending.delete(key);
  remove(key);
}

/** 把这台浏览器记下的桌况与存档列表全丢掉：只动本地，服务器上的一份都不会少（口令留着） */
export function wipeRoomCache(): void {
  const doomed: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const full = localStorage.key(i);
    if (!full || !full.startsWith(PREFIX)) continue;
    const key = full.slice(PREFIX.length);
    if (key.startsWith("room:") || key.startsWith("local:") || key === "roms" || key.startsWith("rom:")) doomed.push(key);
  }
  pending = new Map();
  localName = "";
  localSlot = "";
  for (const key of doomed) remove(key);
}

/* ———— 服务器上的存档：列表和本体都留一份，离线也能开档 ———— */

export function cacheRoms(list: RomMeta[]): void {
  const body = { at: Date.now(), list };
  if (write("roms", body)) return;
  prune("roms");
  write("roms", { ...body, list: body.list.slice(0, 40) });
}

export function cachedRoms(): { at: number; list: RomMeta[] } | null {
  const hit = read<{ at: number; list: RomMeta[] }>("roms");
  if (!hit || !Array.isArray(hit.list)) return null;
  return { at: Number(hit.at) || 0, list: hit.list.filter((r): r is RomMeta => !!r && typeof r.id === "string") };
}

export function cacheRomPayload(rom: RomPayload): void {
  const key = `rom:${rom.id.toUpperCase()}`;
  const body = { at: Date.now(), rom: { ...rom, id: rom.id.toUpperCase() } };
  if (write(key, body)) return;
  prune(key);
  write(key, body);
}

export function cachedRomPayload(id: string): { at: number; rom: RomPayload } | null {
  const hit = read<{ at: number; rom: RomPayload }>(`rom:${id.toUpperCase()}`);
  const rom = hit?.rom;
  if (!rom || typeof rom.id !== "string" || !rom.state) return null;
  return { at: Number(hit!.at) || 0, rom: { ...rom, state: api.sanitize(rom.state) } };
}

export function dropRomPayload(id: string): void {
  remove(`rom:${id.toUpperCase()}`);
}

/** 离线缓存过的存档本体编号：查看器按它列出「哪几份档在这台机器上留了桌面」 */
export function cachedRomIds(): string[] {
  flushRoomCache();
  const out: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const full = localStorage.key(i);
    if (!full || !full.startsWith(PREFIX + "rom:")) continue;
    const hit = read<{ rom?: RomPayload }>(full.slice(PREFIX.length));
    if (typeof hit?.rom?.id === "string") out.push(hit.rom.id.toUpperCase());
  }
  return [...new Set(out)].sort();
}

/** 定档口令的编号：只看有哪些存档，口令原文绝不出这道门 */
export function romTokenIds(): string[] {
  const map = read<Record<string, string>>("rom-keys");
  return Object.keys(map ?? {}).sort();
}

/** 房主口令的房间码：同上，口令本身留在模块里不外递 */
export function roomTokenIds(): string[] {
  const map = read<Record<string, string>>("room-keys");
  return Object.keys(map ?? {}).sort();
}

/** 丢掉存档列表那一行目录：下次打开存档抽屉会重新向服务器拉一份 */
export function forgetRomList(): void {
  remove("roms");
}

/** 定档口令只留在定档这台机器的本机存储里，服务器那边存的是它的摘要 */
export function romToken(id: string): string | null {
  const map = read<Record<string, string>>("rom-keys");
  return map?.[id.toUpperCase()] ?? null;
}
export function rememberRomToken(id: string, token: string): void {
  const map = read<Record<string, string>>("rom-keys") ?? {};
  map[id.toUpperCase()] = token;
  if (!write("rom-keys", map)) prune("rom-keys");
}

export function forgetRomToken(id: string): void {
  const map = read<Record<string, string>>("rom-keys");
  if (!map) return;
  delete map[id.toUpperCase()];
  write("rom-keys", map);
}

/**
 * 房主口令：开房那一刻服务端回一次，此后改房间设置都要带上它。
 * 和存档口令同一套设计——服务器只存摘要，原文只留在开房那台浏览器的本机存储里。
 */
export function roomToken(code: string): string | null {
  const map = read<Record<string, string>>("room-keys");
  return map?.[code.toUpperCase()] ?? null;
}

export function rememberRoomToken(code: string, token: string): void {
  const map = read<Record<string, string>>("room-keys") ?? {};
  map[code.toUpperCase()] = token;
  if (!write("room-keys", map)) prune("room-keys");
}

export function forgetRoomToken(code: string): void {
  const map = read<Record<string, string>>("room-keys");
  if (!map) return;
  delete map[code.toUpperCase()];
  write("room-keys", map);
}

if (typeof window !== "undefined") {
  window.addEventListener("pagehide", flushRoomCache);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushRoomCache();
  });
}
